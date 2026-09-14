# SafiRoute mobile (Flutter)

Android-first driver app. The same delivery workflow is also available in the web app at `/field` so you can test without installing Flutter.

## Run

```bash
cd mobile
flutter create . --project-name safiroute_mobile --org org.safisana.safiroute
cp ../assets/safiroute-logo.png assets/
cp ../assets/safiroute-icon.png assets/
mkdir -p assets
flutter pub get
flutter run \
  --dart-define=SAFIROUTE_API=http://127.0.0.1:8000/api
```

On a physical phone, replace `127.0.0.1` with your computer's LAN IP.

Demo driver login: `driver` / `safiroute`
