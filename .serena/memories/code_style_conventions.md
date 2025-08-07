# Code Style and Conventions

## TypeScript Configuration
- **Strict mode enabled** in `tsconfig.json`
- Path aliases configured: `@/*` maps to `./src/*`
- All files should be `.tsx` for React components, `.ts` for utilities

## File Naming Conventions
- React components: PascalCase (e.g., `TaskContext.tsx`, `_layout.tsx`)
- Utilities/services: kebab-case or camelCase (e.g., `supabase.ts`, `internal-db.ts`)
- Platform-specific files: `.web.ts` extension for web-only code

## Code Organization
- **Expo Router** file-based routing in `/app/` directory
- **Components**: Reusable UI components with theming support
- **Contexts**: React contexts for global state (TaskContext, ThemeContext)
- **Services**: Business logic in `/lib/` directory

## Import Conventions
- Use `@/` alias for relative imports from src root
- External imports first, then internal imports
- React imports at the top

## React Patterns
- Functional components with hooks
- Context providers for global state
- TypeScript interfaces for props
- Error boundaries for navigation (Expo Router)

## Platform Differences
- Web builds use localStorage instead of AsyncStorage
- Platform-specific code separated into `.web.ts` files
- Metro configuration handles Node.js polyfills for Supabase

## Testing
- Jest with `jest-expo` preset
- Testing Library for React Native
- Setup file: `jest-setup.js`