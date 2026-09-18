# SafiRoute native mobile

This directory contains the supported native **Sales waybill app** for Android and iOS.

The app mirrors the Safisana paper waybill while adding digital safeguards:

- Sales-only authentication
- encrypted offline SQLite storage for waybill data
- secure OS credential storage for the API token and local encryption key
- paper-style waybill entry
- Authorised / Dispatch / Received signature lines
- optional GPS and delivery photo
- automatic reconnect sync with bounded retry backoff
- duplicate-safe sync through the client UUID endpoint
- release builds require HTTPS unless explicitly built for local testing
- SafiRoute launcher icons, splash screen, green/gold branding and live waybill animation

## Android local test build

From PowerShell:

```powershell
cd "$HOME\projects\SafiRoute\mobile"

flutter create --platforms=android --org com.safisana --project-name safiroute .
python tool/prepare_platforms.py
flutter pub get
dart run flutter_launcher_icons
dart run flutter_native_splash:create
flutter analyze
flutter test
flutter build apk --debug --dart-define=SAFIROUTE_ALLOW_INSECURE_API=true
```

The debug APK is written to:

```text
mobile\build\app\outputs\flutter-apk\app-debug.apk
```

Android emulator local backend:

```text
http://10.0.2.2:8000/api
```

A physical Android phone must use a backend URL reachable from the phone.

## Android release

GitHub Actions also builds a release-mode AAB candidate. The candidate is useful for release validation, but it is deliberately labelled **NOT-FOR-PLAY** until a real Safisana/organization Android signing keystore is configured.

A Play Store release must use:

- a protected upload keystore
- a unique package ID owned by the organization
- production HTTPS API URL
- retained signing credentials and recovery process
- Play Console app signing / release track configuration

## iOS

iOS compilation requires macOS + Xcode:

```bash
cd mobile
flutter create --platforms=ios --org com.safisana --project-name safiroute .
python3 tool/prepare_platforms.py
flutter pub get
dart run flutter_launcher_icons
dart run flutter_native_splash:create
flutter analyze
flutter test
flutter build ios --release --no-codesign \
  --dart-define=SAFIROUTE_API=https://YOUR-SAFIROUTE-DOMAIN/api
```

GitHub Actions compiles and archives an unsigned iOS app on a macOS runner.

A distributable IPA/TestFlight/App Store build still requires an Apple Developer team, distribution certificate, provisioning profile, App Store Connect app record and signing credentials. Those secrets must not be committed to Git.

## Automated native gates

`.github/workflows/mobile-native.yml` blocks native regressions with:

- Flutter dependency install
- SafiRoute launcher icon and splash generation
- `flutter analyze`
- `flutter test`
- Android debug APK compilation
- Android release-mode AAB compilation
- iOS release compilation without code signing

Artifacts:

- **SafiRoute-Android-debug** — installable test APK
- **SafiRoute-Android-AAB-release-candidate-NOT-FOR-PLAY** — release-mode bundle pending production signing
- **SafiRoute-iOS-unsigned** — compiled iOS application pending Apple signing

## Data protection

Waybill JSON stored by the native app is encrypted with AES-GCM before being written to SQLite. The 256-bit local key is generated on-device and stored through secure OS credential storage. Existing older plaintext local records remain readable and are encrypted the next time they are saved.

Do not clear application storage while unsynced waybills remain on the device.
