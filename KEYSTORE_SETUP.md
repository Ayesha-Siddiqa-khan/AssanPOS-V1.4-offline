# Production Keystore Setup Guide

## ⚠️ CRITICAL: Generate Production Keystore Before Publishing

Your app is currently configured to use a debug keystore for release builds. This is **NOT SECURE** for production.

## Steps to Create Production Keystore:

### 1. Generate Keystore File

Run this command in your terminal:

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore asaanpos-release-key.keystore -alias asaanpos-release -keyalg RSA -keysize 2048 -validity 10000
```

**Important Information to Remember:**
- Store password (you'll need this)
- Key alias: `asaanpos-release` 
- Key password (you'll need this)
- Your name and organization details

### 2. Store Keystore Safely

⚠️ **CRITICAL SECURITY:**
- Move the keystore file to a secure location (NOT in your project directory)
- Back up the keystore file securely (you cannot regenerate it)
- Keep passwords in a password manager
- NEVER commit the keystore file to Git
- NEVER share your keystore passwords

### 3. Configure Gradle Properties

Create/edit `android/gradle.properties` and add:

```properties
ASAANPOS_RELEASE_STORE_FILE=../../path/to/asaanpos-release-key.keystore
ASAANPOS_RELEASE_STORE_PASSWORD=your_store_password
ASAANPOS_RELEASE_KEY_ALIAS=asaanpos-release
ASAANPOS_RELEASE_KEY_PASSWORD=your_key_password
```

**OR** add to your global `~/.gradle/gradle.properties` for better security.

### 4. Verify Configuration

Build a release APK:

```bash
cd android
./gradlew assembleRelease
```

The signed APK will be at: `android/app/build/outputs/apk/release/app-release.apk`

### 5. Testing the Release Build

Install and test the release APK before publishing:

```bash
adb install android/app/build/outputs/apk/release/app-release.apk
```

## If You Lose Your Keystore

⚠️ If you lose your keystore file:
- You CANNOT update your app on Google Play Store
- You must create a new app listing with a new package name
- All existing users will need to uninstall and reinstall

**This is why backup is CRITICAL!**

## Current Configuration

- Package name: `com.lakhwera001.asaanpos`
- Version code: 2
- Version name: 1.3.0
- Signing: Configured to use release keystore (falls back to debug if not configured)

## Security Checklist

- [ ] Generated production keystore
- [ ] Stored keystore in secure location outside project
- [ ] Backed up keystore file (at least 2 secure locations)
- [ ] Stored passwords in password manager
- [ ] Added `*.keystore` to `.gitignore`
- [ ] Configured `gradle.properties` with keystore path
- [ ] Tested release build
- [ ] Verified app signature

## Resources

- [Android App Signing](https://developer.android.com/studio/publish/app-signing)
- [React Native Signed APK](https://reactnative.dev/docs/signed-apk-android)
