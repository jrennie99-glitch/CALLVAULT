# Call Vault - Mobile Build Guide

This document explains how to build Call Vault as a native iOS and Android app using Capacitor.

## Overview

Call Vault uses Capacitor to wrap the web app for native mobile deployment. The PWA functionality remains intact for web users, while native users get a dedicated mobile experience.

## Prerequisites

### For Android
- Android Studio (Arctic Fox or later)
- Android SDK (API level 22+)
- Java 17+

### For iOS
- macOS with Xcode 14+
- CocoaPods (`sudo gem install cocoapods`)
- Apple Developer account (for device testing/distribution)

## Project Structure

```
/android          - Android native project (git-ignored, generate locally)
/ios              - iOS native project (git-ignored, generate locally)
/dist/public      - Built web assets (Capacitor webDir)
capacitor.config.ts - Capacitor configuration
client/src/lib/platform.ts - Platform detection utilities
```

**Note**: The `/android` and `/ios` folders are git-ignored. You must generate them locally using:
```bash
npm run build
npx cap add android
npx cap add ios
```

## Build Commands

### Build Web Assets
```bash
npm run build
```

### Sync to Native Platforms
After building web assets, sync to native platforms:
```bash
npx cap sync
```

### Open in Android Studio
```bash
npx cap open android
```

### Open in Xcode
```bash
npx cap open ios
```

### Full Mobile Build (Web + Sync)
```bash
npm run build && npx cap sync
```

## Platform Detection

Use the platform detection utilities in your code:

```typescript
import { IS_NATIVE, IS_IOS, IS_ANDROID, IS_WEB } from '@/lib/platform';

if (IS_NATIVE) {
  // Native-specific code (iOS or Android)
} else {
  // Web/PWA code
}
```

## Android Build Steps

1. Build web assets: `npm run build`
2. Sync to Android: `npx cap sync android`
3. Open Android Studio: `npx cap open android`
4. In Android Studio:
   - Wait for Gradle sync to complete
   - Select a device/emulator
   - Click Run (green play button)
5. For release build:
   - Build > Generate Signed Bundle/APK
   - Follow signing wizard

## iOS Build Steps

1. Build web assets: `npm run build`
2. Sync to iOS: `npx cap sync ios`
3. Open Xcode: `npx cap open ios`
4. In Xcode:
   - Select your development team in Signing & Capabilities
   - Select a simulator or connected device
   - Click Run (play button)
5. For App Store:
   - Product > Archive
   - Follow distribution wizard

## Running on Physical Devices

### Android
- Enable Developer Options on device
- Enable USB Debugging
- Connect via USB and select device in Android Studio

### iOS
- Register device UDID in Apple Developer Portal
- Add device to provisioning profile
- Connect via USB and select in Xcode

## Capacitor Configuration

The app is configured in `capacitor.config.ts`:

```typescript
{
  appId: 'com.callvault.cv',
  appName: 'Call Vault',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  }
}
```

## What Works in Replit vs Local

### In Replit (Browser IDE)
- Web development and testing
- Building web assets (`npm run build`)
- Syncing Capacitor (`npx cap sync`)
- Cannot open Android Studio or Xcode

### On Local Machine
- All of the above
- Opening native IDEs (`npx cap open android/ios`)
- Running on simulators/emulators
- Running on physical devices
- Building release APKs/IPAs

## Push Notifications on Native (Android FCM)

Call Vault includes native push notification support for incoming calls using Firebase Cloud Messaging (FCM).

### FCM Setup Steps

1. **Create Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Create a new project or select existing one
   - Enable Google Analytics (optional)

2. **Add Android App**
   - Click "Add app" and select Android
   - Package name: `com.callvault.cv`
   - Download `google-services.json`
   - Place it at: `android/app/google-services.json`
   - (See `android/app/google-services.json.placeholder` for structure reference)

3. **Get FCM Server Key**
   - In Firebase Console, go to Project Settings > Cloud Messaging
   - Copy the "Server key" (Legacy API key)
   - Add to your backend as environment variable: `FCM_SERVER_KEY=your_server_key`

4. **Build and Test**
   ```bash
   npm run build && npx cap sync android
   npx cap open android
   ```

### How Native Push Works

1. User enables notifications in Settings on the native app
2. App registers with FCM and gets a device token
3. Token is sent to backend via `/api/push/native/register`
4. When someone calls the user, backend sends FCM push to device
5. Device shows "Incoming Call" notification
6. Tapping notification opens app to the call screen

### Testing Two-Phone Scenario

1. Install app on two Android devices (or emulator + device)
2. User A and User B both enable notifications in Settings
3. User A adds User B as a contact
4. User A calls User B
5. User B should receive push notification even if app is in background
6. User B taps notification → app opens to incoming call screen

### iOS Push (APNs) - Future

iOS native push requires Apple Push Notification service setup. The `IS_NATIVE` flag can be used to conditionally use native push plugins.

For iOS setup:
1. Create APNs key in Apple Developer Portal
2. Upload to Firebase (if using FCM for iOS) or configure directly
3. Implement APNs-specific push handling

## Known Limitations

1. **WebRTC**: Should work on native, but may need camera/microphone permission configuration in native manifests
2. **Biometric Auth**: WebAuthn works on web; native biometrics would need Capacitor plugins
3. **Crypto Wallets**: Browser wallet extensions won't work on native; would need WalletConnect or similar

## Troubleshooting

### Android Build Fails
- Ensure Java 17+ is installed
- Run `npx cap sync android` again
- Check Gradle version compatibility

### iOS Build Fails
- Run `cd ios/App && pod install`
- Ensure Xcode command line tools are installed
- Check signing configuration

### Web Assets Not Updating
- Run `npm run build` before `npx cap sync`
- Clear app cache on device/simulator
