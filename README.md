# SafiRoute

**Every delivery. Verified.**

SafiRoute is Safisana Ghana’s digital waybill and proof-of-delivery system for the Sales department: create, approve, load, dispatch, sign, verify, and archive deliveries — including when drivers are offline.

Repository: https://github.com/Harold-Djah007/SafiRoute

## What’s in this repo

| Path | What it is |
| --- | --- |
| `backend/` | Django REST API. Local demo may use SQLite. **Production requires PostgreSQL.** |
| `frontend/` | Next.js HQ dashboard, **supported field PWA** at `/field`, and public QR verification |
| `mobile/` | **Experimental** Flutter scaffold — not the supported field app |
| `docs/` | Project blueprint and [recovery runbook](docs/RECOVERY.md) |
| `assets/` | SafiRoute logo and app icon |
| `scripts/` | One-command API and web starters |
| `.github/workflows/ci.yml` | Django tests + Playwright (Pixel-sized and desktop Chromium) |

## Test run (local)

You need **Python 3.12, 3.13, or 3.14** and **Node 20+**. Flutter is optional.

**Windows (PowerShell)** — you already cloned the repo. Recreate the venv after pulling this branch, because Python 3.14 needs current Pillow wheels:

```powershell
cd $HOME\SafiRoute
git pull
git checkout cursor/safiroute-mvp-cd9e

cd backend
deactivate
Remove-Item -Recurse -Force .\venv
py -3 -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8877
```

Windows often blocks ports 8000 and 8080. **8877** is the SafiRoute local API port. Keep this window open.

Then in a **second** PowerShell window (stop the old `npm run dev` first with Ctrl+C):

```powershell
cd $HOME\SafiRoute
git pull

cd frontend
npm install
@"
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:8877
DJANGO_ORIGIN=http://127.0.0.1:8877
"@ | Set-Content .env.local
npm run dev
```

Open http://localhost:3000

**macOS / Linux**

```bash
cd backend
python3 -m venv venv
# If that fails on Ubuntu: sudo apt install python3.12-venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8877
```

**Terminal 2 — Web app**

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3000**

Or from the repo root:

```bash
./scripts/run-api.sh    # terminal 1
./scripts/run-web.sh    # terminal 2
```

### Demo logins

Password for every seeded account: **`safiroute`**

| Username | Use this to… |
| --- | --- |
| `sales` | Create and submit waybills |
| `supervisor` | Approve |
| `warehouse` | Confirm load and dispatch |
| `driver` | Complete a field delivery (`/field`) |
| `finance` | Read-only operations view |
| `admin` | Everything, plus `/admin/` |

API: http://127.0.0.1:8877/api/  
Django admin: http://127.0.0.1:8877/admin/  
Health: http://127.0.0.1:8877/api/health/

### Field-ready driver flow (supported mobile app)

The supported field client is the **installable PWA** at **http://localhost:3000/field** (Add to Home Screen). Sign in as `driver` (password `safiroute`).

1. Tap **Download for offline** while you still have signal. Assigned waybills (loaded / dispatched / in transit) are stored on the phone.
2. Open a run. Quantities, GPS, photos, and both signatures work with no coverage.
3. Complete the delivery. If 4G is down, the proof queues on the device and sends when the phone is online again. Replays use the same client UUID so they cannot double-post.
4. Add `/field` to the home screen for a full-screen driver app. Browser automation covers Pixel-sized and desktop Chromium in GitHub Actions (`frontend` Playwright tests). A Safisana real-device plant pilot is still required before calling the field app proven on sales phones.

### Suggested click-through

1. Sign in as `sales` → **New waybill** → save draft → **Submit for approval**
2. Sign in as `supervisor` → open the waybill → **Approve**
3. Sign in as `warehouse` → enter loaded qty / batch → **Confirm loaded** → assign driver/vehicle → **Dispatch**
4. Sign in as `driver` → **Field app** → download → open the assignment → sign both pads → **Complete delivery**
5. Open the verification link on the waybill, or download the branded PDF

## Mobile

**Supported:** the installable `/field` PWA (service worker + web app manifest). That is the field app Safisana should put on sales and driver phones.

**Experimental:** `mobile/` is an unfinished Flutter scaffold. Do not treat it as a shippable Android app. It must not be used to judge product readiness.

```bash
# Experimental only — not required for a field trial of the PWA
cd mobile
flutter create . --project-name safiroute_mobile --org org.safisana.safiroute
flutter pub get
flutter run --dart-define=SAFIROUTE_API=http://127.0.0.1:8877/api
```

## Backend tests

```bash
cd backend
source venv/bin/activate
python manage.py test
```

## Production operations

Production (`DJANGO_ENV=production` or `DEBUG=False`) **refuses SQLite**, wildcard `ALLOWED_HOSTS`, and the demo secret. Set PostgreSQL via `DB_ENGINE=django.db.backends.postgresql` and `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST`.

Optional but supported when fully configured:

- **Azure Blob** media — `AZURE_ACCOUNT_NAME` plus `AZURE_ACCOUNT_KEY` or `AZURE_CONNECTION_STRING`, and `AZURE_CONTAINER`. Account name alone does not enable Blob.
- **Sentry** — `SENTRY_DSN` (stub/example DSNs are ignored).
- **Encrypted backups** — `BACKUP_ENCRYPTION_KEY` (Fernet). See [docs/RECOVERY.md](docs/RECOVERY.md).

Integrity commands after restore or suspected tampering:

```bash
python manage.py encrypt_backup
python manage.py restore_backup --input /path/to/safiroute.enc            # dry-run decrypt
python manage.py restore_backup --input /path/to/safiroute.enc --confirm YES
python manage.py check_audit_chain
python manage.py check_pdf_integrity
```

Browser login uses Django sessions (HttpOnly cookie) plus CSRF; API tokens remain available for scripts. Demo password `safiroute` exists only when `DEBUG=True` (`seed_demo` is disabled in production).

CI (`.github/workflows/ci.yml`) runs Django tests and Playwright against Pixel-sized and desktop Chromium. Playwright browsers are installed in GitHub Actions; a restricted local workspace may time out downloading Chrome — that is not a reason to skip CI.

## Architecture

Django REST + Next.js field PWA. Local demo uses SQLite so nothing else has to be installed. Production is PostgreSQL, optional Azure Blob, encrypted backups, and hash-chained audit / PDF fingerprints (see `docs/Safisana_Digital_Waybill_Project_Blueprint.md` and `docs/RECOVERY.md`).

Not yet proven outside this repo: a Safisana real-device plant pilot, and an external security review.

## Branding

- `assets/safiroute-logo.png` — wordmark lockup
- `assets/safiroute-icon.png` — app / favicon mark
- Palette: forest `#0F5C2E`, gold `#C9A227`, cream `#F4EFE2`

The product name should still undergo a formal trademark and domain check before public release.
