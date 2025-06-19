import { Platform } from 'react-native'
import { Task } from '../offline/database'

// Notifee requires native setup, so we'll make it optional
let notifee: any
let AndroidImportance: any
let AndroidNotificationSetting: any
let AuthorizationStatus: any
let EventType: any
let TriggerType: any

try {
  const notifeeModule = require('@notifee/react-native')
  notifee = notifeeModule.default
  AndroidImportance = notifeeModule.AndroidImportance
  AndroidNotificationSetting = notifeeModule.AndroidNotificationSetting
  AuthorizationStatus = notifeeModule.AuthorizationStatus
  EventType = notifeeModule.EventType
  TriggerType = notifeeModule.TriggerType
} catch (error) {
  console.log('Notifee not available - notifications disabled')
}

export class NotificationService {
  private channelId = 'skedai-tasks'

  async initialize() {
    if (!notifee) {
      console.log('Notifications not available in this environment')
      return
    }

    // Request permissions
    await this.requestPermissions()
    
    // Create notification channel for Android
    if (Platform.OS === 'android') {
      await notifee.createChannel({
        id: this.channelId,
        name: 'Task Notifications',
        importance: AndroidImportance.HIGH,
        sound: 'default',
      })
    }

    // Handle notification events
    notifee.onForegroundEvent(({ type, detail }: any) => {
      switch (type) {
        case EventType.DISMISSED:
          console.log('User dismissed notification', detail.notification)
          break
        case EventType.PRESS:
          console.log('User pressed notification', detail.notification)
          // Navigate to task or handle action
          if (detail.pressAction?.id === 'start-task') {
            // Handle start task action
            console.log('User wants to start task:', detail.notification.data?.taskId)
            // This would need to be handled by the app's task context
          }
          break
        case EventType.ACTION_PRESS:
          console.log('User pressed action:', detail.pressAction)
          if (detail.pressAction?.id === 'start-task') {
            // Handle start task action
            console.log('Starting task:', detail.notification.data?.taskId)
          }
          break
      }
    })
  }

  async requestPermissions(): Promise<boolean> {
    if (!notifee) return false
    
    const settings = await notifee.requestPermission()
    
    if (Platform.OS === 'ios') {
      return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED
    } else {
      return settings.android.alarm === AndroidNotificationSetting.ENABLED
    }
  }

  async scheduleTaskNotification(task: Task, type: 'reminder' | 'due' | 'start') {
    if (!notifee) return
    
    const triggerDate = type === 'start' 
      ? task.reminder_at // Using reminder_at for immediate notification
      : type === 'reminder' 
      ? task.reminder_at 
      : task.due_at
      
    if (!triggerDate && type !== 'start') return

    const trigger: any = type === 'start' ? undefined : {
      type: TriggerType.TIMESTAMP,
      timestamp: new Date(triggerDate).getTime(),
    }

    const title = type === 'start'
      ? `Time to Start: ${task.name}`
      : type === 'reminder' 
      ? `Reminder: ${task.name}`
      : `Task Due: ${task.name}`

    const body = type === 'start'
      ? 'Your scheduled task is ready to begin!'
      : type === 'reminder'
      ? 'Don\'t forget about this task!'
      : 'This task is due now'

    try {
      const notificationConfig: any = {
        id: `${task.local_id}_${type}`,
        title,
        body,
        android: {
          channelId: this.channelId,
          importance: AndroidImportance.HIGH,
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          actions: type === 'start' ? [
            {
              title: 'Start Task',
              pressAction: {
                id: 'start-task',
                launchActivity: 'default',
              },
            },
          ] : [],
        },
        ios: {
          sound: 'default',
          categoryId: 'task',
          attachments: [],
          actions: type === 'start' ? [
            {
              id: 'start-task',
              title: 'Start Task',
              foreground: true,
            },
          ] : [],
        },
        data: {
          taskId: task.local_id,
          type,
        },
      }

      if (trigger) {
        await notifee.createTriggerNotification(notificationConfig, trigger)
      } else {
        // For immediate notifications (start type)
        await notifee.displayNotification(notificationConfig)
      }
      
      console.log(`Scheduled ${type} notification for task ${task.local_id}`)
    } catch (error) {
      console.error('Error scheduling notification:', error)
    }
  }

  async cancelTaskNotifications(taskLocalId: string) {
    if (!notifee) return
    
    try {
      // Cancel both reminder and due notifications
      await notifee.cancelNotification(`${taskLocalId}_reminder`)
      await notifee.cancelNotification(`${taskLocalId}_due`)
      
      console.log(`Cancelled notifications for task ${taskLocalId}`)
    } catch (error) {
      console.error('Error cancelling notifications:', error)
    }
  }

  async displayNotification(title: string, body: string, data?: any) {
    if (!notifee) return
    
    await notifee.displayNotification({
      title,
      body,
      android: {
        channelId: this.channelId,
        importance: AndroidImportance.HIGH,
        pressAction: {
          id: 'default',
        },
      },
      ios: {
        sound: 'default',
      },
      data,
    })
  }

  // Schedule all notifications for active tasks
  async scheduleAllNotifications(tasks: Task[]) {
    if (!notifee) return
    
    for (const task of tasks) {
      if (!task.deleted_at) {
        if (task.reminder_at) {
          await this.scheduleTaskNotification(task, 'reminder')
        }
        if (task.due_at) {
          await this.scheduleTaskNotification(task, 'due')
        }
      }
    }
  }

  // Get all scheduled notifications
  async getScheduledNotifications() {
    if (!notifee) return []
    
    return await notifee.getTriggerNotifications()
  }

  // Cancel all notifications
  async cancelAllNotifications() {
    if (!notifee) return
    
    await notifee.cancelAllNotifications()
  }
}