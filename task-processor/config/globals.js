/**
 * Global Configuration for Task Processor
 * These constants ensure consistent timing across all services
 */

export const SCHEDULING_CONFIG = {
  // Tasks are scheduled at 5-minute intervals (8:00, 8:05, 8:10, etc.)
  INTERVAL_GRANULARITY: 5, // minutes
  
  // Send push notifications 30 seconds before each interval
  // This gives the app time to prepare for upcoming tasks
  NOTIFICATION_LEAD_TIME: 30, // seconds
}

/**
 * Critical notification windows:
 * - Task at 8:00 → Push notification at 7:59:30
 * - Task at 8:05 → Push notification at 8:04:30
 * - Task at 8:10 → Push notification at 8:09:30
 * 
 * Rationale: App cannot schedule tasks in the past, so users need
 * advance notice when new tasks are about to start.
 */

export const DATABASE_CONFIG = {
  SCHEMA: 'skedai',
  TABLES: {
    TASK: 'task',
    SOLUTION: 'solution',
    USER_TIMELINE: 'user_timeline',
    MODEL: 'model',
  }
}

export const NOTIFICATION_CONFIG = {
  // Expo push notification settings
  EXPO_BATCH_SIZE: 100,
  EXPO_RETRY_ATTEMPTS: 3,
  
  // Supabase realtime channel names
  REALTIME_CHANNELS: {
    TIMELINE_UPDATES: 'timeline-updates',
    TASK_PROCESSING: 'task-processing'
  }
}

// Helper function to calculate next interval time
export function getNextInterval(currentTime = new Date()) {
  const minutes = currentTime.getMinutes()
  const nextIntervalMinutes = Math.ceil(minutes / SCHEDULING_CONFIG.INTERVAL_GRANULARITY) * SCHEDULING_CONFIG.INTERVAL_GRANULARITY
  
  const nextInterval = new Date(currentTime)
  nextInterval.setMinutes(nextIntervalMinutes, 0, 0) // Set to exact interval with 0 seconds
  
  if (nextIntervalMinutes >= 60) {
    nextInterval.setHours(nextInterval.getHours() + 1)
    nextInterval.setMinutes(0)
  }
  
  return nextInterval
}

// Helper function to check if we're in notification window
export function isInNotificationWindow(currentTime = new Date()) {
  const nextInterval = getNextInterval(currentTime)
  const notificationTime = new Date(nextInterval.getTime() - (SCHEDULING_CONFIG.NOTIFICATION_LEAD_TIME * 1000))
  
  return currentTime >= notificationTime && currentTime < nextInterval
}