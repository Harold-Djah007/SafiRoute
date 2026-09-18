# SafiRoute release gates

SafiRoute is releasable only when the automated and operational gates below are satisfied. A numerical score must never substitute for these checks.

## Automated gates

Every production candidate must pass GitHub Actions with:

- Python dependency audit with no known vulnerable pinned runtime dependency.
- Django dependency consistency checks and the full Django test suite.
- `manage.py check --deploy --fail-level WARNING` using production settings.
- Migrations and the full backend test suite against PostgreSQL 17.
- `npm ci` from the committed lockfile.
- Production Node dependency audit with no high/critical findings.
- Next.js production build using the supported Active-LTS line.
- Playwright acceptance tests for the Sales field PWA at mobile (Pixel-sized) and desktop viewports, including offline behavior.
- Flutter dependency install, SafiRoute icon/splash generation, `flutter analyze` and `flutter test`.
- Android debug APK and release-mode AAB candidate compilation.
- iOS release compilation on macOS with code signing disabled for CI verification.

A failed or skipped required step blocks promotion to `main`.

## Production configuration gates

Before deployment:

- `DEBUG=False`; unique Django secret stored outside Git.
- PostgreSQL configured; SQLite is forbidden in production.
- Explicit hosts, CORS origins and CSRF trusted origins.
- HTTPS redirect and secure cookies enabled.
- HSTS include-subdomains/preload enabled only after every affected subdomain is HTTPS-only.
- Production media placed in access-controlled object storage.
- Backup encryption key stored separately from backups and application source.
- Sentry or an equivalent monitored error channel configured for production.
- Demo users/passwords removed and `seed_demo` unavailable in production.

## Operational acceptance gates

Before Safisana relies on SafiRoute for live deliveries:

- Run an end-to-end field pilot on the actual Android/iPhone devices used by Safisana Sales.
- Prove create → save offline → sign → complete → reconnect/sync → HQ PDF/QR verification.
- Test loss of network before, during and after proof submission; confirm replay does not duplicate a delivery.
- Exercise backup creation and a clean restore, then run audit-chain and PDF-integrity checks.
- Validate GPS permission denial, camera denial, low storage, app/browser restart and device reboot recovery.
- Confirm Sales-only access to the mobile waybill app and review HQ permissions with the administrator and any office roles actually enabled.
- Complete accessibility checks and a focused independent security review.
- Confirm retention/privacy handling for customer data, signatures, GPS coordinates and photos.

## Store-signing gates

Before calling the native apps distributable:

- Android must use an organization-controlled upload keystore; debug/test signing is not a production release.
- The production Android application ID, Play Console record, signing recovery process and release track must be documented.
- iOS must use an Apple Developer team, distribution certificate, provisioning profile and App Store Connect/TestFlight record.
- Production mobile builds must point at the permanent HTTPS SafiRoute API; insecure HTTP is allowed only for explicit local/debug testing.

## Release decision

Only merge a production candidate after all automated gates are green. Operational gates should be recorded with date, device/browser version, tester and evidence before declaring the system fully field-proven.
