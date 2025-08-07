# Suggested Commands

## Development Commands (must be run from `/src/` directory)

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

## System Commands (macOS Darwin)
```bash
# File operations
ls -la                    # List files with details
find . -name "*.tsx"      # Find TypeScript React files
grep -r "pattern" src/    # Search for pattern in source

# Git operations
git status                # Check git status
git add .                 # Stage all changes
git commit -m "message"   # Commit changes
git push                  # Push to remote

# Package management
npm install               # Install dependencies
npm install package-name  # Install specific package
npm run                   # List available scripts
```

## Important Notes
- All development commands must be run from the `/src/` directory
- The project uses Expo managed workflow
- Native builds require proper development environment setup (Xcode for iOS, Android Studio for Android)