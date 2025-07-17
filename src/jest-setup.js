// jest-setup.js

// Mock react-native modules more carefully
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native')
  
  RN.NativeModules = RN.NativeModules || {}
  RN.NativeModules.DevMenu = RN.NativeModules.DevMenu || {}
  
  return Object.setPrototypeOf(
    {
      AppState: {
        currentState: 'active',
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      Alert: {
        alert: jest.fn(),
      },
      Platform: {
        OS: 'ios',
        select: jest.fn(),
      },
      Dimensions: {
        get: jest.fn(() => ({ width: 375, height: 812 })),
      },
    },
    RN
  )
})

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
}))

// Mock async storage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

// Mock vector icons
jest.mock('@expo/vector-icons', () => ({
  FontAwesome: 'FontAwesome',
  Ionicons: 'Ionicons',
}))

// Mock expo router
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn((fn) => fn()),
  router: {
    push: jest.fn(),
    back: jest.fn(),
  },
}))

// Mock internal database
jest.mock('./lib/internal-db', () => ({
  internalDB: {
    getAllTasks: jest.fn(() => Promise.resolve([])),
    getAllActions: jest.fn(() => Promise.resolve([])),
    addTaskWithDuration: jest.fn(() => Promise.resolve({ id: '1', name: 'Test' })),
    updateTask: jest.fn(() => Promise.resolve()),
    clearAllTasks: jest.fn(() => Promise.resolve()),
    clearAllActions: jest.fn(() => Promise.resolve()),
    addAction: jest.fn(() => Promise.resolve({ id: '1' })),
  },
}))

// Mock supabase
jest.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    },
    schema: jest.fn(() => ({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          order: jest.fn(() => ({
            limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    })),
  },
}))

// Mock expo notifications service
jest.mock('./lib/notifications/expo-notifications', () => ({
  ExpoNotificationService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    scheduleNotification: jest.fn(),
    cancelNotification: jest.fn(),
  })),
}))

// Silence console warnings in tests
global.console = {
  ...console,
  warn: jest.fn(),
}