# EAS Build Guide for SkedAI Mobile

## Setup Complete! ✅

I've configured your project for EAS Build. Here's what to do next:

### 1. Install EAS CLI (if not already installed)
```bash
npm install -g eas-cli
```

### 2. Login to Expo
```bash
eas login
```
(Create a free account at https://expo.dev/signup if needed)

### 3. Configure Your Project
```bash
cd src
eas build:configure
```
This will:
- Create a project on Expo servers
- Generate a unique project ID
- Update app.json with your project ID

### 4. Build the Development APK
```bash
eas build --platform android --profile development
```

This will:
- Upload your code to Expo's build servers
- Build an APK with all native modules (notifications, background sync, etc.)
- Take about 10-20 minutes
- Give you a download link when complete

### 5. Install on Your Phone

Once the build completes:
1. Download the APK file to your phone
2. Enable "Install from Unknown Sources" in Android settings
3. Open the APK to install
4. Accept any permission prompts

### 6. Run Your Development Server

After installing the app:
```bash
npm start
```

Then in the terminal, press `a` to connect to your Android device.

## What's Different from Expo Go?

Your custom development build includes:
- ✅ Push notifications (Notifee)
- ✅ Background sync
- ✅ Deep linking for OAuth
- ✅ All native modules from your package.json

## Troubleshooting

### Build Failed?
- Check the build logs on the Expo website
- Most common issue: missing Android SDK version (already configured in app.json)

### App Won't Connect to Dev Server?
- Make sure phone and computer are on same WiFi
- Try using tunnel mode: `npm start -- --tunnel`

### Need to Make Changes?
After changing native dependencies:
1. Create a new build: `eas build --platform android --profile development`
2. For JS-only changes, just reload the app

## Next Steps

For production release:
```bash
eas build --platform android --profile production
```

This creates an AAB file for Google Play Store submission.