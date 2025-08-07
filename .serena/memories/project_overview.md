# SkedAI Mobile - Project Overview

## Purpose
SkedAI Mobile is a React Native/Expo mobile application for task management with offline-first capabilities. It's designed as a scheduling and task management app that can work both online and offline.

## Tech Stack
- **React Native 0.79.2** with **Expo SDK 53**
- **TypeScript** with strict mode enabled
- **Expo Router v5** for file-based navigation
- **Supabase** for backend (custom domain: api.skedai.com)
- **AsyncStorage** for offline data persistence
- **React Native Reanimated** for animations
- **Notifee** for notifications (requires native build)

## Key Features
- Offline-first architecture with bidirectional sync
- OAuth authentication with deep linking support
- Cross-platform (iOS, Android, Web)
- Background sync capabilities
- Push notifications

## Bundle Identifier & Deep Linking
- Bundle identifier: `com.skedai.app`
- Deep linking scheme: `skedaiapp://`
- OAuth callback: `skedaiapp://auth-callback`