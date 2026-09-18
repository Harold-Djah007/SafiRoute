#!/usr/bin/env python3
from pathlib import Path


def insert_before(text: str, marker: str, block: str) -> str:
    if block.strip() in text:
        return text
    return text.replace(marker, block + "\n" + marker, 1)


root = Path(__file__).resolve().parents[1]

android_manifest = root / "android/app/src/main/AndroidManifest.xml"
if android_manifest.exists():
    text = android_manifest.read_text(encoding="utf-8")
    permissions = """    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />"""
    if "android.permission.CAMERA" not in text:
        text = text.replace("<application", permissions + "\n    <application", 1)
    text = text.replace('android:label="safiroute"', 'android:label="SafiRoute"')
    text = text.replace('android:label="safiroute_mobile"', 'android:label="SafiRoute"')
    android_manifest.write_text(text, encoding="utf-8")

debug_manifest = root / "android/app/src/debug/AndroidManifest.xml"
debug_manifest.parent.mkdir(parents=True, exist_ok=True)
debug_manifest.write_text(
    """<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <application android:usesCleartextTraffic="true" />
</manifest>
""",
    encoding="utf-8",
)

plist = root / "ios/Runner/Info.plist"
if plist.exists():
    text = plist.read_text(encoding="utf-8")
    entries = [
        (
            "NSCameraUsageDescription",
            "SafiRoute uses the camera when Sales chooses to attach optional delivery proof.",
        ),
        (
            "NSLocationWhenInUseUsageDescription",
            "SafiRoute can capture an optional GPS point for delivery proof.",
        ),
        (
            "NSPhotoLibraryUsageDescription",
            "SafiRoute can read a delivery photo selected by Sales.",
        ),
        (
            "NSLocalNetworkUsageDescription",
            "SafiRoute may connect to a Safisana test server on the local network during field testing.",
        ),
    ]
    for key, value in entries:
        if f"<key>{key}</key>" not in text:
            block = f"\t<key>{key}</key>\n\t<string>{value}</string>"
            text = text.replace("</dict>", block + "\n</dict>", 1)
    text = text.replace(
        "<key>CFBundleDisplayName</key>\n\t<string>Safiroute</string>",
        "<key>CFBundleDisplayName</key>\n\t<string>SafiRoute</string>",
    )
    plist.write_text(text, encoding="utf-8")

print("SafiRoute native platform permissions prepared.")
