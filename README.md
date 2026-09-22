# SafiRoute

**Every delivery. Verified.**

SafiRoute is Safisana Ghana's digital waybill system for the **Sales team**. It replaces the paper waybill with an offline-capable digital workflow while preserving the familiar Safisana form: delivery details, description/remarks lines, Authorised signature, Dispatch signature and Received signature.

## Product surfaces

| Path | Purpose |
| --- | --- |
| `backend/` | Django REST API, PDF/QR verification, audit chain, encrypted server backup/restore |
| `frontend/` | Next.js HQ and supported Sales PWA at `/field` |
| `mobile/` | Supported native Sales app for Android and iOS |
| `docs/` | Release gates, recovery runbook and project blueprint |
| `assets/` | SafiRoute logo and application icon |

SafiRoute is **Sales-only on both web and mobile**. The only operational account is a Sales User. A Sales Administrator can manage/oversee the Sales system. Authorised by, Dispatched by, and Received by are waybill sign-off fields, not separate SafiRoute accounts.

## Current capabilities

- Sales-only website and native/PWA mobile apps
- paper-style digital Safisana waybill
- offline drafts and completion
- three line-style signatures
- optional GPS and delivery photo
- automatic reconnect synchronization
- duplicate-safe client UUID ingestion
- HQ PDF generation and QR verification
- PDF fingerprint and hash-chained audit history
- production PostgreSQL enforcement
- optional Azure Blob media storage
- encrypted backend backup/restore
- Android APK + release-mode AAB build verification
- iOS release compilation verification
- encrypted native local waybill storage
- secure native credential storage
- dependency audits and automated browser/native CI

## Quick local run — Windows PowerShell

Clone/update:

```powershell
cd "$HOME\projects\SafiRoute"
git switch main
git pull origin main
```

### Backend

Docker Desktop must be running.

```powershell
cd "$HOME\projects\SafiRoute"
docker compose up --build
```

The local Django API is available at:

```text
http://localhost:8000/api
```

Demo Sales login in local/debug data:

```text
Username: sales
Password: safiroute
```

### Web / Sales PWA

Open a second PowerShell:

```powershell
cd "$HOME\projects\SafiRoute\frontend"
npm ci

@"
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:8000
DJANGO_ORIGIN=http://127.0.0.1:8000
"@ | Set-Content .env.local

npm run dev -- -H 0.0.0.0
```

Open:

```text
http://localhost:3000/field
```

Use `sales / safiroute`.

## Native Android

The Android app uses the same Sales waybill workflow as the PWA.

```powershell
cd "$HOME\projects\SafiRoute\mobile"

flutter create --platforms=android --org com.safisana --project-name safiroute .
python tool/prepare_platforms.py
flutter pub get
dart run flutter_launcher_icons -f tool/icons-android.yaml
dart run flutter_native_splash:create --path=tool/splash-android.yaml
flutter analyze
flutter test

flutter build apk --debug --dart-define=SAFIROUTE_ALLOW_INSECURE_API=true
```

Output:

```text
mobile\build\app\outputs\flutter-apk\app-debug.apk
```

For the Android emulator, the default backend is `http://10.0.2.2:8000/api`. A physical phone must use a backend URL reachable from that phone.

Release-mode mobile builds require HTTPS unless explicitly compiled for local/debug testing.

## Native iOS

iOS builds require macOS + Xcode:

```bash
cd mobile
flutter create --platforms=ios --org com.safisana --project-name safiroute .
python3 tool/prepare_platforms.py
flutter pub get
dart run flutter_launcher_icons -f tool/icons-ios.yaml
dart run flutter_native_splash:create --path=tool/splash-ios.yaml
flutter analyze
flutter test
flutter build ios --release --no-codesign \
  --dart-define=SAFIROUTE_API=https://YOUR-SAFIROUTE-DOMAIN/api
```

CI verifies the iOS release build without signing. A distributable IPA/TestFlight/App Store build requires Apple Developer signing credentials and an App Store Connect record.

## Native offline/security behavior

The native app stores waybill JSON encrypted with AES-GCM before SQLite persistence. The 256-bit local key and API token are kept through secure OS credential storage.

Completed offline waybills remain on the phone until HQ accepts them. Sync failures use bounded retry backoff, reconnecting wakes the queue automatically, and manual sync is still available. Replays use the same client UUID so the server does not create duplicates.

## Automated quality gates

`.github/workflows/ci.yml` verifies:

- Python dependency audit
- Django dependency consistency and tests
- production Django deployment checks
- PostgreSQL 17 migrations/tests
- Node production dependency audit
- Next.js production build
- Pixel-sized and desktop offline PWA acceptance tests

`.github/workflows/mobile-native.yml` verifies:

- native dependency install
- SafiRoute launcher icons and splash generation
- `flutter analyze`
- `flutter test`
- Android debug APK compilation
- Android release-mode AAB compilation
- iOS release compilation without signing

See `docs/RELEASE_GATES.md` for the full release standard.

## Production deployment

Production uses `DEBUG=False` and **must not use SQLite**. Configure PostgreSQL with:

```text
DB_ENGINE=django.db.backends.postgresql
DB_NAME=...
DB_USER=...
DB_PASSWORD=...
DB_HOST=...
```

Also configure explicit `ALLOWED_HOSTS`, trusted CSRF/CORS origins, HTTPS, secure cookies and the permanent SafiRoute public/API URLs.

Supported production integrations:

- Azure Blob media with a real account key or connection string
- Sentry or an equivalent monitored error channel
- encrypted backups through `BACKUP_ENCRYPTION_KEY`

Recovery/integrity commands:

```bash
python manage.py encrypt_backup
python manage.py restore_backup --input /path/to/safiroute.enc
python manage.py restore_backup --input /path/to/safiroute.enc --confirm YES
python manage.py check_audit_chain
python manage.py check_pdf_integrity
```

See `docs/RECOVERY.md`.

## What still requires real-world evidence

Repository automation can prove builds, tests, dependency status and configuration rules. It cannot honestly prove:

- a successful Safisana field pilot on the exact phones staff will use
- Android Play production signing without the organization's keystore
- iOS TestFlight/App Store signing without Apple Developer credentials
- the permanent Azure deployment before that infrastructure exists
- an independent external security review

Those items remain release gates, not hidden assumptions.
