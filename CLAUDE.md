# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Application
```bash
npm start          # Start Expo dev server
npm run android    # Start and open on Android
npm run ios        # Start and open on iOS  
npm run web        # Start and open on web
```

### Testing
```bash
npm test           # Run tests in watch mode
```

### Building Native Apps
```bash
npm run android:build    # Build Android app (requires Android Studio)
npm run ios:build        # Build iOS app (requires Xcode)
```

## Architecture Overview

This is a React Native/Expo mobile application for task management with offline-first capabilities.

### Key Technologies
- **React Native 0.79.2** with **Expo SDK 53**
- **TypeScript** with strict mode
- **Expo Router v5** for file-based navigation
- **Supabase** for backend (custom domain: api.skedai.com)
- **AsyncStorage** for offline data persistence

### Project Structure
- `/app/` - Expo Router screens and layouts
  - `_layout.tsx` - Root layout with auth guard
  - `(tabs)/` - Tab navigation screens
  - `auth.tsx` - Authentication flow
- `/components/` - Reusable UI components with theming
- `/lib/` - Core services
  - `supabase.ts` - Supabase client configuration
  - `offline/` - Offline database and sync logic
- `/contexts/TaskContext.tsx` - Global task state management

### Critical Implementation Details

1. **Authentication Flow**: The root layout (`/app/_layout.tsx`) handles auth state checking and redirects. Multiple auth methods are supported including OAuth with deep linking (`skedaiapp://auth-callback`).

2. **Offline-First Data**: All task operations work offline using AsyncStorage. The sync system (`/lib/offline/sync.ts`) handles bidirectional sync with conflict resolution (last-write-wins).

3. **Platform Differences**: Web builds use localStorage instead of AsyncStorage. Platform-specific files use `.web.ts` extension.

4. **Metro Configuration**: Custom polyfills are configured in `metro.config.js` for Node.js modules required by Supabase.

5. **Task Context**: The `TaskContext` provides a unified API for all task operations, abstracting the offline/online logic.

### Environment Configuration
- Supabase URL and keys are in `/config/constants.ts`
- Deep linking scheme: `skedaiapp://`
- Bundle identifier: `com.skedai.app`

### Testing Considerations
- Test accounts available via "Create Test User" in dev mode
- Pull-to-refresh triggers manual sync
- Sync status indicators show pending changes

### Limitations in Expo Go
- Notifications (Notifee) require native build
- Background sync requires EAS Build or ejection
- Some OAuth providers may not work without proper native configuration