# SafiRoute security policy

SafiRoute handles operational delivery records, signatures, GPS data, photos, and customer information. Security reports must be handled privately and production secrets must never be committed to this repository.

## Supported code

Security fixes are applied to the current production branch and the latest release candidate only. The supported clients are the Sales website, Sales PWA, and native Android/iOS Sales app. Retired supervisor, warehouse, driver, and finance workflows are not supported.

## Reporting a vulnerability

Do **not** publish exploit details, credentials, customer information, access tokens, or screenshots containing sensitive data in a public GitHub issue.

Report the vulnerability privately to the repository owner or Safisana's authorized security/IT channel. Include the affected component, reproduction steps, impact, and a minimal proof of concept. If credentials or keys may have been exposed, rotate them immediately rather than waiting for a code fix.

## Production security requirements

- Use PostgreSQL; SQLite is development-only.
- Keep `DEBUG=False` and use a unique secret from a managed secret store.
- Serve only through HTTPS. Secure cookies, HTTPS redirect, and HSTS are enabled by default in production.
- Set explicit `ALLOWED_HOSTS`, CORS origins, and CSRF trusted origins.
- Enable trusted-proxy handling only when the proxy is controlled and sets `X-Forwarded-Proto` correctly.
- Store uploaded media in access-controlled object storage and keep backups encrypted.
- Run the CI dependency audits before release and remediate high/critical findings.
- Run `check_audit_chain` and `check_pdf_integrity` after restores or suspected tampering.
- Never use demo users/passwords or `seed_demo` in production.
- Native mobile waybill records are encrypted at rest and native credentials are stored through secure OS storage.
- Production native builds must use HTTPS. Android production artifacts must be signed with an organization-controlled keystore; iOS distribution requires organization-controlled Apple signing.
- Mobile Sales sessions are signed, time-limited, role-restricted, and revoked by a password change.
- PWA backup exports use passphrase-protected AES-GCM; store the backup file and password separately.

## Incident response

For a suspected compromise: isolate the affected deployment, rotate secrets/tokens, preserve logs, verify audit/PDF integrity, restore from a tested clean backup when necessary, and document the incident and remediation before returning the system to service.
