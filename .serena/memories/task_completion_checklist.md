# Task Completion Checklist

## When a task is completed, perform these steps:

### 1. Code Quality Checks
```bash
# Run from /src/ directory
npm test           # Ensure all tests pass
```

### 2. Build Verification
```bash
# Test that the app builds properly
npm start          # Start dev server and verify no errors
```

### 3. Platform Testing (if applicable)
- Test on both iOS and Android if changes affect native functionality
- Test web version if changes affect cross-platform compatibility
- Verify offline functionality works correctly

### 4. Version Control
```bash
git add .
git commit -m "descriptive commit message"
git push
```

### 5. Special Considerations
- **Offline sync**: Verify that changes work properly with offline/online data sync
- **Authentication**: Test auth flows if authentication-related changes were made
- **Navigation**: Ensure Expo Router navigation still works correctly
- **Performance**: Check that changes don't negatively impact app performance

### 6. Documentation Updates
- Update CLAUDE.md if architectural changes were made
- Update README.md if user-facing features were added
- Add/update comments for complex business logic

### 7. Deployment Considerations
- Native builds require EAS Build or proper development environment
- Some features (like Notifee notifications) don't work in Expo Go
- OAuth configurations may need updates for production builds