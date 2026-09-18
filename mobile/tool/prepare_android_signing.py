#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "android/app/build.gradle.kts"
if not path.exists():
    raise SystemExit("android/app/build.gradle.kts not found; run flutter create first.")

text = path.read_text(encoding="utf-8")
if "safiroute release signing" in text:
    raise SystemExit(0)

imports = """// safiroute release signing
import java.io.FileInputStream
import java.util.Properties

"""
text = imports + text

marker = "android {"
setup = """val safirouteKeystoreProperties = Properties()
val safirouteKeystoreFile = rootProject.file("key.properties")
if (!safirouteKeystoreFile.exists()) {
    throw GradleException("android/key.properties is required for a signed SafiRoute release.")
}
safirouteKeystoreProperties.load(FileInputStream(safirouteKeystoreFile))

"""
if marker not in text:
    raise SystemExit("Could not find android block in generated Gradle file.")
text = text.replace(marker, setup + marker, 1)

build_types = "    buildTypes {"
signing = """    signingConfigs {
        create("release") {
            keyAlias = safirouteKeystoreProperties["keyAlias"] as String
            keyPassword = safirouteKeystoreProperties["keyPassword"] as String
            storeFile = file(safirouteKeystoreProperties["storeFile"] as String)
            storePassword = safirouteKeystoreProperties["storePassword"] as String
        }
    }

"""
if build_types not in text:
    raise SystemExit("Could not find buildTypes block in generated Gradle file.")
text = text.replace(build_types, signing + build_types, 1)

debug_line = 'signingConfig = signingConfigs.getByName("debug")'
if debug_line not in text:
    raise SystemExit("Could not find Flutter default release signing line.")
text = text.replace(
    debug_line,
    'signingConfig = signingConfigs.getByName("release")',
    1,
)

path.write_text(text, encoding="utf-8")
print("SafiRoute Android release signing configured.")
