# SkedAI Mobile

A cross-platform mobile application with native Android and iOS implementations alongside a React Native codebase.

## Project Structure

```
sked_ai_mobile/
├── src/          # React Native application code
├── android/      # Native Android implementation
└── ios/          # Native iOS implementation
```

## Getting Started

### Prerequisites

- **Node.js** and **npm** installed
- **Xcode 26.2+** (for iOS development)
- **iOS 26.2 Simulator Runtime** (install via Xcode → Settings → Components)

### React Native App (src/)

#### Quick Start (Expo Go)
```bash
cd src
npm install
npm start
```
**Note:** Some features (like native Google Sign-In) require a development build (see below).

#### Development Build (Required for Native Features)

For features that require native code (e.g., Google Sign-In), you must use a development build:

**iOS:**
```bash
cd src
npx expo prebuild --clean
npx expo run:ios
```

**Android:**
```bash
cd src
npx expo prebuild --clean
npx expo run:android
```

**Troubleshooting iOS Simulator:**
- If you get simulator errors, open Simulator manually: `open -a Simulator`
- Ensure iOS 26.2 Simulator Runtime is installed in Xcode → Settings → Components

### Android Native App
```bash
cd android
./gradlew build
```

### iOS Native App
```bash
cd ios
xcodebuild
```

## Features

- Cross-platform mobile development
- Native Android UI with scheduling functionality
- Native iOS UI with scheduling functionality
- React Native shared codebase
- **Native Google Sign-In** (requires development build - see above)

## Native Features

### Google Sign-In

The app uses native Google Sign-In which requires a development build. **This will NOT work in Expo Go (`npm start`).**

**Setup:**
1. Ensure you have Xcode 26.2+ and iOS 26.2 Simulator installed
2. Run `npx expo prebuild --clean` to regenerate native projects
3. Run `npx expo run:ios` to build and launch on iOS simulator

**Configuration:**
- iOS Client ID: `628761900025-r3fcp8bk4cicchq36rq2jrqob91dktcq.apps.googleusercontent.com`
- Web Client ID: `628761900025-cudnji3cdi9bcp5tfbs54rc02gjplofn.apps.googleusercontent.com`
- Supabase requires "Skip nonce checks" enabled for native Google Sign-In