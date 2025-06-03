# Android Setup Guide for SkedAI Mobile

## Quick Start Commands

After completing the prerequisites, run these commands:

```bash
# Navigate to the src directory where package.json is located
cd src

# Install dependencies
npm install

# Start the Expo development server
npm start

# Or directly start with Android
npm run android
```

## Troubleshooting

### If your device isn't detected:

1. **Check device connection:**
   ```bash
   adb devices
   ```
   You should see your device listed.

2. **If device shows as "unauthorized":**
   - Disconnect and reconnect USB
   - Check your phone for the authorization prompt
   - Make sure USB debugging is enabled

3. **If adb command not found:**
   - Ensure Android SDK platform-tools is in your PATH
   - Restart your terminal after setting environment variables

### Common Issues:

1. **"Expo Go" app required:**
   - When you run `npm start`, it will show a QR code
   - Install "Expo Go" from Google Play Store on your phone
   - Scan the QR code with Expo Go app

2. **Network connection issues:**
   - Make sure your phone and computer are on the same WiFi network
   - If using USB, you can use `npm run android` which will use USB connection

3. **Build errors:**
   - Clear cache: `npx expo start -c`
   - Delete node_modules and reinstall: `rm -rf node_modules && npm install`

## Development Workflow

1. **With Expo Go (Recommended for beginners):**
   - Run `npm start` in the src directory
   - Scan QR code with Expo Go app
   - App will hot reload when you make changes

2. **With USB connection:**
   - Connect phone via USB
   - Run `npm run android`
   - Metro bundler will start and install the app

3. **Making changes:**
   - Edit files in your code editor
   - Save changes
   - App will automatically reload

## Next Steps

Once comfortable with Expo Go, you can:
1. Create a development build using EAS Build
2. Build a standalone APK for distribution
3. Test native features that don't work in Expo Go

For production builds, you'll need to eject or use EAS Build service.