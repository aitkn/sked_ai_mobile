/**
 * Notifications Module
 * 
 * Exports all notification-related functionality:
 * - Push notifications (FCM token registration)
 * - Local notification scheduling
 * - Notification action handling
 * - Notification customization
 * - Analytics tracking
 */

// Push Notification Service
export {
  pushService,
  initializePushNotifications,
  getDeviceToken,
  recordClientSync,
  unregisterPushNotifications,
} from './push-service'

// Local Notification Scheduler
export {
  initializeNotificationCategories,
  scheduleLocalNotifications,
  cancelAllTaskNotifications,
  cancelTaskNotification,
  getUserNotificationOffset,
  NOTIFICATION_CATEGORIES,
} from './local-scheduler'

// Action Handler
export {
  handleNotificationAction,
  setupBackgroundNotificationHandlers,
  type NotificationActionType,
} from './action-handler'

// Notification Customization
export {
  getNotificationStyleForTask,
  saveNotificationPreference,
  clearPreferencesCache,
  getAvailableSounds,
  interruptionToAndroidImportance,
  NOTIFICATION_SOUNDS,
  NOTIFICATION_CHANNELS,
  type NotificationStyle,
  type InterruptionLevel,
  type AndroidImportance,
} from './notification-customization'

// Analytics
export {
  trackNotificationEvent,
  trackScheduled,
  trackDelivered,
  trackOpened,
  trackAction,
  trackFailed,
  trackDismissed,
  getNotificationStats,
  getTopActions,
  type NotificationEventType,
} from './notification-analytics'

