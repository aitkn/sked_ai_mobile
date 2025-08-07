# Project Structure

## Main Directories
- `/src/` - Main source code directory
- `/src/app/` - Expo Router screens and layouts
  - `_layout.tsx` - Root layout with auth guard
  - `(tabs)/` - Tab navigation screens
  - `auth.tsx` - Authentication flow
- `/src/components/` - Reusable UI components with theming
- `/src/lib/` - Core services
  - `supabase.ts` - Supabase client configuration
  - `offline/` - Offline database and sync logic
  - `notifications/` - Push notification services
- `/src/contexts/` - React contexts
  - `TaskContext.tsx` - Global task state management
  - `ThemeContext.tsx` - Theme management
- `/src/config/` - Configuration files
  - `constants.ts` - Supabase URL and keys
- `/src/assets/` - Static assets (fonts, images)

## Configuration Files
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration with strict mode
- `metro.config.js` - Metro bundler configuration
- `jest-setup.js` - Test setup
- `CLAUDE.md` - Development guidance