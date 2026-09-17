# SafiRoute recovery runbook

Treat data loss as a tested failure mode. Encrypted logical backups (`encrypt_backup` / `restore_backup`) are the application restore path. PostgreSQL physical dumps are the database restore path. Practice both on a staging copy before you need them.

This runbook does **not** replace an off-site backup policy, Azure point-in-time restore, or an external security review.

## What a SafiRoute backup contains

`python manage.py encrypt_backup` writes a Fernet-encrypted gzip payload with:

- Django fixtures for `waybills` (users, customers, products, vehicles, waybills, photos metadata, hash-chained audit logs) and `authtoken`
- Local media files under `MEDIA_ROOT` (signatures, photos, generated PDFs), base64-encoded

It does **not** dump Django sessions, admin logs, or Azure Blob objects that never landed on disk. If production media is on Azure Blob, download the container (or keep Azure's own redundant copies) in addition to this logical backup.

## Secrets you must have before a drill

| Secret | Why |
| --- | --- |
| `BACKUP_ENCRYPTION_KEY` | Fernet key. Wrong key decrypts nothing. Lost key means the `.enc` file is unreadable. |
| `DJANGO_SECRET_KEY` | Application crypto / sessions after restore. |
| PostgreSQL credentials | Physical dump and restore. |
| Azure account name + key (or connection string) | Media if Blob is enabled. |

Generate a Fernet key once and store it next to `DJANGO_SECRET_KEY`, not in git:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Encrypted backup (logical)

From `backend/` with the production venv and `DJANGO_ENV=production`:

```bash
python manage.py encrypt_backup
# or an explicit path
python manage.py encrypt_backup --output /var/backups/safiroute/safiroute-$(date -u +%Y%m%d-%H%M%S).enc
```

Copy the `.enc` file off the box (separate Azure storage account, offline disk, or Safisana HQ backup share). Keep the Fernet key in a different place than the ciphertext.

Dry-run decrypt without touching the database:

```bash
python manage.py restore_backup --input /var/backups/safiroute/safiroute-YYYYMMDD-HHMMSS.enc
```

That must print `Dry run only. Decrypt succeeded.` If it errors, stop: the file is truncated, or you have the wrong key.

## Encrypted restore drill (logical)

Run this against a **copy** of production (empty staging database), never against the live plant database on the first attempt.

1. Restore or create an empty PostgreSQL database and set `DJANGO_ENV=production`, `DEBUG=False`, and the same `BACKUP_ENCRYPTION_KEY` used to encrypt.
2. `python manage.py migrate`
3. Confirm decrypt:

   ```bash
   python manage.py restore_backup --input /path/to/safiroute.enc
   ```

4. Restore for real (deletes existing waybill/customer/product/vehicle/token rows, then `loaddata`):

   ```bash
   python manage.py restore_backup --input /path/to/safiroute.enc --confirm YES
   ```

5. Verify:

   ```bash
   python manage.py check_audit_chain
   python manage.py check_pdf_integrity
   python manage.py test waybills.test_hardening.BackupRestoreTests
   ```

Automated coverage for this drill lives in `waybills.test_hardening.BackupRestoreTests`:

- encrypt → delete rows → restore → waybill and line items return
- restore without `--confirm YES` is decrypt-only
- wrong Fernet key does not load data
- truncated ciphertext fails closed

## PostgreSQL physical dump (production)

Logical fixtures are not a substitute for a database dump. On the Postgres host:

```bash
pg_dump -Fc -d safiroute -f /var/backups/safiroute/safiroute-$(date -u +%Y%m%d).dump
```

Restore onto a new database:

```bash
createdb safiroute_restore
pg_restore --clean --if-exists -d safiroute_restore /var/backups/safiroute/safiroute-YYYYMMDD.dump
```

Point a staging `DJANGO_ENV=production` instance at `safiroute_restore` and repeat `check_audit_chain` / `check_pdf_integrity`.

## After restore

1. Confirm a known waybill number, PDF download, and QR verification URL.
2. Confirm hash chain and PDF bytes: `check_audit_chain`, `check_pdf_integrity`.
3. If Azure Blob is configured, confirm a signature or photo URL still 200s.
4. Rotate session cookies if the incident included a compromised host (`SESSION_COOKIE_AGE` will age them out; a secret rotation logs everyone out).
5. Record the drill date, who ran it, how long it took, and which backup file was used.

## What this does not prove

- A Safisana field-device pilot (real sales phones, real plant network).
- That Azure geo-redundant storage is configured — that is an operations setting outside this repo.
- An external penetration test or code audit.
