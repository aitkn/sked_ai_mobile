# Architecture Details

## Offline-First Design
The app is designed with offline-first capabilities:

### Data Flow
1. **AsyncStorage** for local data persistence
2. **Supabase** for backend synchronization
3. **Sync system** (`/lib/offline/sync.ts`) handles bidirectional sync
4. **Conflict resolution**: Last-write-wins strategy

### Authentication Flow
1. Root layout (`/app/_layout.tsx`) handles auth state checking
2. Multiple auth methods supported including OAuth
3. Deep linking for OAuth callbacks (`skedaiapp://auth-callback`)
4. Session management through Supabase

### State Management
- **TaskContext**: Global task state management
- **ThemeContext**: Theme and styling management
- React Context pattern for state sharing

### Navigation
- **Expo Router v5**: File-based navigation system
- Tab-based navigation structure
- Auth guards in root layout

### Platform Differences
- **React Native polyfills**: Extensive Node.js polyfills for Supabase compatibility
- **Web platform**: Uses localStorage instead of AsyncStorage
- **Platform-specific files**: `.web.ts` extensions for web-only code

### Critical Implementation Points
1. **Metro Configuration**: Custom polyfills for Node.js modules required by Supabase
2. **TaskContext**: Unified API for all task operations (abstracts offline/online logic)
3. **Background Sync**: Requires EAS Build or ejection from Expo Go
4. **Push Notifications**: Notifee requires native build, doesn't work in Expo Go

### Development vs Production
- **Expo Go limitations**: Notifications, background sync, some OAuth providers
- **Native builds**: Full functionality available with EAS Build or ejection
- **Testing**: "Create Test User" available in dev mode