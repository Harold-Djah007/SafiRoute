# SafiRoute native mobile

This directory now contains the native **Sales waybill app** for Android and iOS.

The app follows the same Safisana paper-waybill workflow used by the supported web/PWA client:

- Sales-only access
- offline local SQLite drafts
- paper-style waybill creation
- Authorised / Dispatch / Received signature lines
- optional GPS and delivery photo
- completed records stay on the phone until HQ accepts them
- duplicate-safe sync through the existing client UUID endpoint
- encrypted OS credential storage for the API token
- the same SafiRoute green/gold branding and live waybill journey animation

## Android test build on Windows

From PowerShell:

```powershell
cd "$HOME\projects\SafiRoute\mobile"

flutter create --platforms=android --org com.safisana --project-name safiroute .
python tool/prepare_platforms.py
flutter pub get
flutter analyze
flutter build apk --debug
```

The APK is written to:

```text
mobile\build\app\outputs\flutter-apk\app-debug.apk
```

For the Android emulator, the default local backend is:

```text
http://10.0.2.2:8000/api
```

For a physical Android phone, enter your reachable SafiRoute backend URL on the login screen.

## iOS

iOS builds require macOS + Xcode. Generate the project with:

```bash
cd mobile
flutter create --platforms=ios --org com.safisana --project-name safiroute .
python3 tool/prepare_platforms.py
flutter pub get
flutter build ios --release --no-codesign
```

GitHub Actions also compiles an unsigned iOS app automatically on a macOS runner.

A distributable **IPA/TestFlight/App Store build requires an Apple Developer team, signing certificate, and provisioning profile**. Those credentials are intentionally not stored in the repository.

## Automated builds

`.github/workflows/mobile-native.yml` builds:

- **SafiRoute-Android-debug** — installable APK for testing
- **SafiRoute-iOS-unsigned** — compiled iOS app archive for build verification

The workflow can also be started manually with a production or test API URL.
