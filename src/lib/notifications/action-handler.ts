/**
 * Notification Action Handler
 * 
 * Handles action buttons from notifications:
 * - START: Start a task
 * - COMPLETE: Mark task as complete
 * - PAUSE: Pause a task
 * - CANCEL: Cancel a task
 * - SNOOZE: Snooze notification by 5 minutes
 * - COMPLETE_AND_START: Complete previous task and start current
 * - START_BATCH: Start a mini task batch
 * - CONFIRM: Confirm auto-action
 * - NOT_NOW: Dismiss auto-action
 * - DISABLE: Disable auto-action rule
 */

import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from '../supabase'
import { internalDB, InternalAction, InternalTask } from '../internal-db'
import { cancelTaskNotification, scheduleLocalNotifications } from './local-scheduler'
import { trackNotificationEvent } from './notification-analytics'

// Try to import Notifee
let notifee: any = null
let EventType: any = null

try {
  const notifeeModule = require('@notifee/react-native')
  notifee = notifeeModule.default
  EventType = notifeeModule.EventType
} catch (error) {
  console.log('[ActionHandler] Notifee not available')
}

// Action types
export type NotificationActionType =
  | 'START'
  | 'COMPLETE'
  | 'PAUSE'
  | 'CANCEL'
  | 'SNOOZE'
  | 'COMPLETE_AND_START'
  | 'START_BATCH'
  | 'CONFIRM'
  | 'NOT_NOW'
  | 'DISABLE'
  | 'default'

/**
 * Handle a notification action
 * Called when user taps a notification action button
 */
export async function handleNotificationAction(
  actionId: string,
  taskId: string,
  previousTaskId?: string
): Promise<void> {
  console.log(`[ActionHandler] Processing action: ${actionId} for task: ${taskId}`)

  try {
    switch (actionId as NotificationActionType) {
      case 'START':
        await handleStart(taskId)
        break

      case 'COMPLETE':
        await handleComplete(taskId)
        break

      case 'PAUSE':
        await handlePause(taskId)
        break

      case 'CANCEL':
        await handleCancel(taskId)
        break

      case 'SNOOZE':
        await handleSnooze(taskId)
        break

      case 'COMPLETE_AND_START':
        if (previousTaskId) {
          await handleComplete(previousTaskId)
        }
        await handleStart(taskId)
        break

      case 'START_BATCH':
        await handleStartBatch(taskId)
        break

      case 'CONFIRM':
        // Auto-action confirmed - execute the stored action
        await handleAutoActionConfirm(taskId)
        break

      case 'NOT_NOW':
        // Just dismiss the notification
        await cancelTaskNotification(taskId)
        break

      case 'DISABLE':
        // Disable the auto-action rule
        await handleDisableAutoAction(taskId)
        break

      case 'default':
        // User tapped notification body - just open the app
        break

      default:
        console.warn(`[ActionHandler] Unknown action: ${actionId}`)
    }

    // Track the action
    await trackNotificationEvent(taskId, 'action', actionId)
  } catch (error) {
    console.error(`[ActionHandler] Error handling action ${actionId}:`, error)
  }
}

/**
 * Start a task
 */
async function handleStart(taskId: string): Promise<void> {
  console.log(`[ActionHandler] Starting task: ${taskId}`)

  // Create START action
  const action: InternalAction = {
    id: `action-${Date.now()}`,
    task_local_id: taskId,
    action_type: 'start',
    timestamp: new Date().toISOString(),
    synced: false,
  }

  // Save action locally
  await internalDB.saveAction(action)

  // Update task status locally
  await internalDB.updateTask(taskId, { status: 'in_progress' })

  // Cancel the notification
  await cancelTaskNotification(taskId)

  // Sync to server
  await syncActionToServer(taskId, 'started')
}

/**
 * Complete a task
 */
async function handleComplete(taskId: string): Promise<void> {
  console.log(`[ActionHandler] Completing task: ${taskId}`)

  // Create COMPLETE action
  const action: InternalAction = {
    id: `action-${Date.now()}`,
    task_local_id: taskId,
    action_type: 'complete',
    timestamp: new Date().toISOString(),
    synced: false,
  }

  await internalDB.saveAction(action)
  await internalDB.updateTask(taskId, { status: 'completed' })
  await cancelTaskNotification(taskId)
  await syncActionToServer(taskId, 'completed')
}

/**
 * Pause a task
 */
async function handlePause(taskId: string): Promise<void> {
  console.log(`[ActionHandler] Pausing task: ${taskId}`)

  const action: InternalAction = {
    id: `action-${Date.now()}`,
    task_local_id: taskId,
    action_type: 'pause',
    timestamp: new Date().toISOString(),
    synced: false,
  }

  await internalDB.saveAction(action)
  await internalDB.updateTask(taskId, { status: 'paused' })
  await cancelTaskNotification(taskId)
  await syncActionToServer(taskId, 'paused')
}

/**
 * Cancel a task
 */
async function handleCancel(taskId: string): Promise<void> {
  console.log(`[ActionHandler] Canceling task: ${taskId}`)

  const action: InternalAction = {
    id: `action-${Date.now()}`,
    task_local_id: taskId,
    action_type: 'cancel',
    timestamp: new Date().toISOString(),
    synced: false,
  }

  await internalDB.saveAction(action)
  await internalDB.updateTask(taskId, { status: 'cancelled' })
  await cancelTaskNotification(taskId)
  await syncActionToServer(taskId, 'cancelled')
}

/**
 * Snooze notification by 5 minutes
 */
async function handleSnooze(taskId: string): Promise<void> {
  console.log(`[ActionHandler] Snoozing task: ${taskId}`)

  const snoozeTime = Date.now() + 5 * 60 * 1000 // 5 minutes

  if (notifee) {
    // Get the original notification content
    const task = await internalDB.getTask(taskId)
    if (!task) return

    await notifee.createTriggerNotification(
      {
        id: `task-${taskId}`,
        title: task.name,
        body: 'Snoozed reminder',
        data: { task_id: taskId, type: 'task_reminder' },
        android: { channelId: 'task-reminders', pressAction: { id: 'default' } },
        ios: { categoryId: 'TASK_NOT_STARTED' },
      },
      {
        type: 1, // TriggerType.TIMESTAMP
        timestamp: snoozeTime,
      }
    )
  } else {
    const task = await internalDB.getTask(taskId)
    if (!task) return

    await Notifications.scheduleNotificationAsync({
      content: {
        title: task.name,
        body: 'Snoozed reminder',
        data: { task_id: taskId, type: 'task_reminder' },
        categoryIdentifier: 'TASK_NOT_STARTED',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(snoozeTime),
      },
      identifier: `task-${taskId}`,
    })
  }
}

/**
 * Start a batch of tasks
 */
async function handleStartBatch(batchId: string): Promise<void> {
  console.log(`[ActionHandler] Starting batch: ${batchId}`)

  // Get batch info from notification data
  // For now, just cancel the batch notification
  if (notifee) {
    await notifee.cancelNotification(`batch-${batchId}`)
  } else {
    await Notifications.cancelScheduledNotificationAsync(`batch-${batchId}`)
  }

  // TODO: Implement batch tracking UI
}

/**
 * Confirm an auto-action
 */
async function handleAutoActionConfirm(taskId: string): Promise<void> {
  console.log(`[ActionHandler] Confirming auto-action for task: ${taskId}`)

  // Get stored pending action from task data
  const task = await internalDB.getTask(taskId)
  if (!task) return

  // Execute the pending action (stored in task metadata)
  const pendingAction = task.pending_auto_action
  if (pendingAction === 'start') {
    await handleStart(taskId)
  } else if (pendingAction === 'complete') {
    await handleComplete(taskId)
  }

  // Clear pending action
  await internalDB.updateTask(taskId, { pending_auto_action: null })
}

/**
 * Disable an auto-action rule
 */
async function handleDisableAutoAction(taskId: string): Promise<void> {
  console.log(`[ActionHandler] Disabling auto-action for task: ${taskId}`)

  try {
    // Disable auto-action rules for this task type
    const task = await internalDB.getTask(taskId)
    if (!task) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Disable matching rules
    await supabase
      .from('auto_action_rules')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('task_id', taskId)

    // Cancel the notification
    await cancelTaskNotification(taskId)

    console.log('[ActionHandler] Auto-action rule disabled')
  } catch (error) {
    console.error('[ActionHandler] Error disabling auto-action:', error)
  }
}

/**
 * Sync action to server
 */
async function syncActionToServer(taskId: string, status: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get task server ID from task
    const task = await internalDB.getTask(taskId)
    if (!task) return

    // Update task status on server
    const { error } = await supabase
      .from('task_status')
      .upsert({
        task_id: task.server_id || taskId,
        status,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'task_id',
      })

    if (error) {
      console.error('[ActionHandler] Error syncing action:', error)
      // Action remains in local queue for retry
    } else {
      // Mark action as synced
      const actions = await internalDB.getActions(taskId)
      for (const action of actions) {
        if (!action.synced) {
          await internalDB.updateAction(action.id, { synced: true })
        }
      }

      // Update next_notification_time via RPC
      await supabase.rpc('update_user_next_notification', {
        p_user_id: user.id,
        p_task_id: task.server_id || taskId,
        p_new_status: status,
      })
    }
  } catch (error) {
    console.error('[ActionHandler] Error syncing to server:', error)
  }
}

/**
 * Set up background notification handlers
 */
export function setupBackgroundNotificationHandlers(): void {
  if (notifee) {
    // Notifee background event handler
    notifee.onBackgroundEvent(async ({ type, detail }: { type: number; detail: any }) => {
      console.log('[ActionHandler] Background event:', type, detail)

      if (type === EventType?.ACTION_PRESS || type === 1) {
        const actionId = detail.pressAction?.id || 'default'
        const taskId = detail.notification?.data?.task_id

        if (taskId) {
          await handleNotificationAction(actionId, taskId, detail.notification?.data?.previous_task_id)
        }
      }
    })

    // Notifee foreground event handler
    notifee.onForegroundEvent(({ type, detail }: { type: number; detail: any }) => {
      console.log('[ActionHandler] Foreground event:', type, detail)

      if (type === EventType?.ACTION_PRESS || type === 1) {
        const actionId = detail.pressAction?.id || 'default'
        const taskId = detail.notification?.data?.task_id

        if (taskId) {
          handleNotificationAction(actionId, taskId, detail.notification?.data?.previous_task_id)
        }
      }
    })
  }

  // Expo Notifications response listener is set up in push-service.ts
}

