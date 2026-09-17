# SafiRoute mobile (Flutter) — experimental

This directory is an **unfinished Flutter scaffold**. It is **not** the supported SafiRoute field app and must not be used to judge product readiness.

The supported field client is the installable PWA at `/field` in `frontend/` (Add to Home Screen). Use that for driver trials.

## Experimental run

```bash
cd mobile
flutter create . --project-name safiroute_mobile --org org.safisana.safiroute
cp ../assets/safiroute-logo.png assets/
cp ../assets/safiroute-icon.png assets/
mkdir -p assets
flutter pub get
flutter run \
  --dart-define=SAFIROUTE_API=http://127.0.0.1:8877/api
```

On a physical phone, replace `127.0.0.1` with your computer's LAN IP.

Demo driver login (DEBUG/local only): `driver` / `safiroute`
