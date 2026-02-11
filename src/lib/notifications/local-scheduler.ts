/**
 * Local Notification Scheduler
 * 
 * Schedules local notifications for upcoming tasks.
 * This is the PRIMARY notification mechanism - works offline.
 * Server push is only a fallback for stale clients.
 */

import * as Notifications from 'expo-notifications'
import { InternalTask } from '../internal-db'
import { supabase } from '../supabase'

// Try to import Notifee for advanced notification features
let notifee: any = null
let NotifeeEventType: any = null
let TriggerType: any = null
let AndroidImportance: any = null

try {
  const notifeeModule = require('@notifee/react-native')
  notifee = notifeeModule.default
  NotifeeEventType = notifeeModule.EventType
  TriggerType = notifeeModule.TriggerType
  AndroidImportance = notifeeModule.AndroidImportance
} catch (error) {
  console.log('[LocalScheduler] Notifee not available, using Expo Notifications')
}

// Epoch for interval conversion (same as server)
const EPOCH = new Date('2020-01-01T00:00:00Z').getTime()

// Limits
const MAX_LOCAL_NOTIFICATIONS = 50 // iOS allows max 64
const MAX_NOTIFICATION_HORIZON_MS = 24 * 60 * 60 * 1000 // 24 hours

// Notification categories
export const NOTIFICATION_CATEGORIES = {
  TASK_NOT_STARTED: 'TASK_NOT_STARTED',
  TASK_IN_PROGRESS: 'TASK_IN_PROGRESS',
  TASK_ADJACENT: 'TASK_ADJACENT',
  TASK_BATCH: 'TASK_BATCH',
  AUTO_ACTION_CONFIRM: 'AUTO_ACTION_CONFIRM',
}

/**
 * Task with scheduling info
 */
interface ScheduledTask {
  task_id: string
  task_name: string
  scheduled_start: Date
  scheduled_end?: Date
  priority?: string
  category?: string
  status?: string
  previous_task_id?: string
  previous_task_completed?: boolean
}

/**
 * Mini task batch
 */
interface TaskBatch {
  batch_id: string
  task_ids: string[]
  task_names: string[]
  total_duration_minutes: number
  start_time: Date
}

/**
 * Initialize notification categories (iOS action buttons)
 */
export async function initializeNotificationCategories(): Promise<void> {
  if (notifee) {
    try {
      // Create Android channels
      await notifee.createChannel({
        id: 'task-reminders',
        name: 'Task Reminders',
        importance: AndroidImportance?.HIGH || 4,
        sound: 'default',
      })

      await notifee.createChannel({
        id: 'task-urgent',
        name: 'Urgent Tasks',
        importance: AndroidImportance?.HIGH || 4,
        sound: 'priority_high',
      })

      await notifee.createChannel({
        id: 'schedule-updates',
        name: 'Schedule Updates',
        importance: AndroidImportance?.DEFAULT || 3,
      })

      // Set up iOS notification categories with actions
      await notifee.setNotificationCategories([
        {
          id: NOTIFICATION_CATEGORIES.TASK_NOT_STARTED,
          actions: [
            { id: 'START', title: 'Start', foreground: true },
            { id: 'SNOOZE', title: 'Snooze 5m' },
            { id: 'CANCEL', title: 'Cancel', destructive: true },
          ],
        },
        {
          id: NOTIFICATION_CATEGORIES.TASK_IN_PROGRESS,
          actions: [
            { id: 'COMPLETE', title: 'Complete' },
            { id: 'PAUSE', title: 'Pause' },
            { id: 'CANCEL', title: 'Cancel', destructive: true },
          ],
        },
        {
          id: NOTIFICATION_CATEGORIES.TASK_ADJACENT,
          actions: [
            { id: 'COMPLETE_AND_START', title: 'Complete & Start', foreground: true },
            { id: 'SNOOZE', title: 'Snooze 5m' },
            { id: 'CANCEL', title: 'Cancel', destructive: true },
          ],
        },
        {
          id: NOTIFICATION_CATEGORIES.TASK_BATCH,
          actions: [
            { id: 'START_BATCH', title: 'Start Batch', foreground: true },
            { id: 'SNOOZE', title: 'Snooze 5m' },
          ],
        },
        {
          id: NOTIFICATION_CATEGORIES.AUTO_ACTION_CONFIRM,
          actions: [
            { id: 'CONFIRM', title: 'Confirm', foreground: true },
            { id: 'NOT_NOW', title: 'Not Now' },
            { id: 'DISABLE', title: 'Disable Auto-Start', destructive: true },
          ],
        },
      ])

      console.log('[LocalScheduler] Notification categories initialized')
    } catch (error) {
      console.error('[LocalScheduler] Error initializing categories:', error)
    }
  } else {
    // Use Expo Notifications categories
    try {
      await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.TASK_NOT_STARTED, [
        { identifier: 'START', buttonTitle: 'Start', options: { opensAppToForeground: true } },
        { identifier: 'SNOOZE', buttonTitle: 'Snooze 5m' },
      ])

      await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.TASK_IN_PROGRESS, [
        { identifier: 'COMPLETE', buttonTitle: 'Complete' },
        { identifier: 'PAUSE', buttonTitle: 'Pause' },
      ])

      console.log('[LocalScheduler] Expo notification categories set')
    } catch (error) {
      console.error('[LocalScheduler] Error setting Expo categories:', error)
    }
  }
}

/**
 * Schedule local notifications for upcoming tasks
 * 
 * @param tasks - Array of tasks to schedule notifications for
 * @param offsetMs - User's notification offset preference in milliseconds
 */
export async function scheduleLocalNotifications(
  tasks: InternalTask[],
  offsetMs: number = 0
): Promise<void> {
  try {
    console.log(`[LocalScheduler] Scheduling notifications for ${tasks.length} tasks, offset: ${offsetMs}ms`)

    // Cancel all existing task notifications
    await cancelAllTaskNotifications()

    const now = Date.now()
    let scheduledCount = 0

    // Sort tasks by start time
    const sortedTasks = [...tasks]
      .filter(task => task.start_time && task.status !== 'completed' && task.status !== 'cancelled')
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

    // Detect mini task batches
    const batches = detectMiniBatches(sortedTasks)
    const batchedTaskIds = new Set(batches.flatMap(b => b.task_ids))

    for (const task of sortedTasks) {
      if (scheduledCount >= MAX_LOCAL_NOTIFICATIONS) break

      // Skip tasks that are part of a batch (handle separately)
      if (batchedTaskIds.has(task.id)) continue

      const scheduledStart = new Date(task.start_time).getTime()
      const notificationTime = scheduledStart + offsetMs

      // Skip if notification time already passed
      if (notificationTime <= now) continue

      // Skip if beyond 24-hour horizon
      if (notificationTime > now + MAX_NOTIFICATION_HORIZON_MS) continue

      // Schedule the notification
      await scheduleTaskNotification(task, notificationTime)
      scheduledCount++
    }

    // Schedule batch notifications
    for (const batch of batches) {
      if (scheduledCount >= MAX_LOCAL_NOTIFICATIONS) break

      const notificationTime = batch.start_time.getTime() + offsetMs
      if (notificationTime <= now || notificationTime > now + MAX_NOTIFICATION_HORIZON_MS) continue

      await scheduleBatchNotification(batch, notificationTime)
      scheduledCount++
    }

    console.log(`[LocalScheduler] Scheduled ${scheduledCount} notifications (${batches.length} batches)`)
  } catch (error) {
    console.error('[LocalScheduler] Error scheduling notifications:', error)
  }
}

/**
 * Schedule a single task notification
 */
async function scheduleTaskNotification(
  task: InternalTask,
  notificationTime: number
): Promise<void> {
  const style = getNotificationStyle(task)
  const category = getNotificationCategory(task)
  const body = getNotificationBody(task, notificationTime)

  if (notifee) {
    // Use Notifee for advanced features
    await notifee.createTriggerNotification(
      {
        id: `task-${task.id}`,
        title: task.name,
        body,
        data: {
          task_id: task.id,
          type: 'task_reminder',
        },
        android: {
          channelId: style.channelId,
          sound: style.sound,
          pressAction: { id: 'default' },
          actions: getAndroidActions(category),
        },
        ios: {
          categoryId: category,
          sound: style.sound,
          interruptionLevel: style.interruptionLevel,
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: notificationTime,
      }
    )
  } else {
    // Use Expo Notifications
    await Notifications.scheduleNotificationAsync({
      content: {
        title: task.name,
        body,
        data: {
          task_id: task.id,
          type: 'task_reminder',
        },
        categoryIdentifier: category,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(notificationTime),
      },
      identifier: `task-${task.id}`,
    })
  }
}

/**
 * Schedule a batch notification
 */
async function scheduleBatchNotification(
  batch: TaskBatch,
  notificationTime: number
): Promise<void> {
  const title = 'Mini Task Batch'
  const body = `${batch.task_names.length} tasks • ${batch.total_duration_minutes} min total`

  if (notifee) {
    await notifee.createTriggerNotification(
      {
        id: `batch-${batch.batch_id}`,
        title,
        body,
        data: {
          batch_id: batch.batch_id,
          task_ids: batch.task_ids,
          type: 'task_batch',
        },
        android: {
          channelId: 'task-reminders',
          pressAction: { id: 'default' },
        },
        ios: {
          categoryId: NOTIFICATION_CATEGORIES.TASK_BATCH,
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: notificationTime,
      }
    )
  } else {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          batch_id: batch.batch_id,
          task_ids: batch.task_ids,
          type: 'task_batch',
        },
        categoryIdentifier: NOTIFICATION_CATEGORIES.TASK_BATCH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(notificationTime),
      },
      identifier: `batch-${batch.batch_id}`,
    })
  }
}

/**
 * Cancel all task-related notifications
 */
export async function cancelAllTaskNotifications(): Promise<void> {
  try {
    if (notifee) {
      const notifications = await notifee.getTriggerNotifications()
      for (const notification of notifications) {
        if (notification.notification.id?.startsWith('task-') || 
            notification.notification.id?.startsWith('batch-')) {
          await notifee.cancelNotification(notification.notification.id)
        }
      }
    } else {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync()
      for (const notification of scheduled) {
        if (notification.identifier.startsWith('task-') ||
            notification.identifier.startsWith('batch-')) {
          await Notifications.cancelScheduledNotificationAsync(notification.identifier)
        }
      }
    }
  } catch (error) {
    console.error('[LocalScheduler] Error canceling notifications:', error)
  }
}

/**
 * Cancel notification for a specific task
 */
export async function cancelTaskNotification(taskId: string): Promise<void> {
  try {
    if (notifee) {
      await notifee.cancelNotification(`task-${taskId}`)
    } else {
      await Notifications.cancelScheduledNotificationAsync(`task-${taskId}`)
    }
  } catch (error) {
    console.error('[LocalScheduler] Error canceling task notification:', error)
  }
}

/**
 * Detect mini task batches (consecutive short tasks)
 */
function detectMiniBatches(tasks: InternalTask[]): TaskBatch[] {
  const batches: TaskBatch[] = []
  let currentBatch: InternalTask[] = []

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    const taskStart = new Date(task.start_time).getTime()
    const taskEnd = task.end_time ? new Date(task.end_time).getTime() : taskStart + 30 * 60 * 1000
    const duration = (taskEnd - taskStart) / (60 * 1000) // minutes

    // Check if task is a mini task (≤15 min)
    if (duration > 15) {
      // Close current batch if exists
      if (currentBatch.length >= 2) {
        batches.push(createBatch(currentBatch))
      }
      currentBatch = []
      continue
    }

    // Check gap from previous task
    if (currentBatch.length > 0) {
      const prevTask = currentBatch[currentBatch.length - 1]
      const prevEnd = prevTask.end_time 
        ? new Date(prevTask.end_time).getTime() 
        : new Date(prevTask.start_time).getTime() + 30 * 60 * 1000
      const gap = taskStart - prevEnd

      // If gap > 1 minute, start new batch
      if (gap > 60 * 1000) {
        if (currentBatch.length >= 2) {
          batches.push(createBatch(currentBatch))
        }
        currentBatch = [task]
        continue
      }
    }

    currentBatch.push(task)
  }

  // Close final batch
  if (currentBatch.length >= 2) {
    batches.push(createBatch(currentBatch))
  }

  return batches
}

/**
 * Create a batch object from tasks
 */
function createBatch(tasks: InternalTask[]): TaskBatch {
  const totalDuration = tasks.reduce((sum, task) => {
    const start = new Date(task.start_time).getTime()
    const end = task.end_time ? new Date(task.end_time).getTime() : start + 30 * 60 * 1000
    return sum + (end - start) / (60 * 1000)
  }, 0)

  return {
    batch_id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    task_ids: tasks.map(t => t.id),
    task_names: tasks.map(t => t.name),
    total_duration_minutes: Math.round(totalDuration),
    start_time: new Date(tasks[0].start_time),
  }
}

/**
 * Get notification body text
 */
function getNotificationBody(task: InternalTask, notificationTime: number): string {
  const taskStart = new Date(task.start_time).getTime()
  const diffMs = taskStart - notificationTime

  if (diffMs < 0) {
    const minutes = Math.abs(diffMs) / 60000
    return `Starts in ${Math.round(minutes)} minute${minutes !== 1 ? 's' : ''}`
  }
  return 'Starting now'
}

/**
 * Get notification category based on task state
 */
function getNotificationCategory(task: InternalTask): string {
  if (task.status === 'in_progress') {
    return NOTIFICATION_CATEGORIES.TASK_IN_PROGRESS
  }
  return NOTIFICATION_CATEGORIES.TASK_NOT_STARTED
}

/**
 * Get notification style (sound, channel, interruption level)
 */
function getNotificationStyle(task: InternalTask): {
  channelId: string
  sound: string
  interruptionLevel: 'passive' | 'active' | 'timeSensitive' | 'critical'
} {
  const priority = task.priority || 'medium'

  if (priority === 'high') {
    return {
      channelId: 'task-urgent',
      sound: 'priority_high',
      interruptionLevel: 'timeSensitive',
    }
  }

  if (priority === 'low') {
    return {
      channelId: 'task-reminders',
      sound: 'gentle_chime',
      interruptionLevel: 'passive',
    }
  }

  // Default (medium priority)
  return {
    channelId: 'task-reminders',
    sound: 'default',
    interruptionLevel: 'active',
  }
}

/**
 * Get Android action buttons for a category
 */
function getAndroidActions(category: string): any[] {
  switch (category) {
    case NOTIFICATION_CATEGORIES.TASK_NOT_STARTED:
      return [
        { title: 'Start', pressAction: { id: 'START' } },
        { title: 'Snooze', pressAction: { id: 'SNOOZE' } },
      ]
    case NOTIFICATION_CATEGORIES.TASK_IN_PROGRESS:
      return [
        { title: 'Complete', pressAction: { id: 'COMPLETE' } },
        { title: 'Pause', pressAction: { id: 'PAUSE' } },
      ]
    case NOTIFICATION_CATEGORIES.TASK_ADJACENT:
      return [
        { title: 'Complete & Start', pressAction: { id: 'COMPLETE_AND_START' } },
        { title: 'Snooze', pressAction: { id: 'SNOOZE' } },
      ]
    default:
      return []
  }
}

/**
 * Get user's notification offset preference from settings
 */
export async function getUserNotificationOffset(): Promise<number> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0

    const { data, error } = await supabase
      .from('user')
      .select('settings')
      .eq('user_id', user.id)
      .single()

    if (error || !data) return 0

    const offsetSeconds = data.settings?.notification_offset_seconds || 0
    return offsetSeconds * 1000 // Convert to milliseconds
  } catch (error) {
    console.error('[LocalScheduler] Error getting notification offset:', error)
    return 0
  }
}

