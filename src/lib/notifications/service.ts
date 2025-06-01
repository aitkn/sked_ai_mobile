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
          // Navigate to task
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

  async scheduleTaskNotification(task: Task, type: 'reminder' | 'due') {
    if (!notifee) return
    
    const triggerDate = type === 'reminder' ? task.reminder_at : task.due_at
    if (!triggerDate) return

    const trigger: any = {
      type: TriggerType.TIMESTAMP,
      timestamp: new Date(triggerDate).getTime(),
    }

    const title = type === 'reminder' 
      ? `Reminder: ${task.name}`
      : `Task Due: ${task.name}`

    const body = type === 'reminder'
      ? 'Don\'t forget about this task!'
      : 'This task is due now'

    try {
      await notifee.createTriggerNotification(
        {
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
          },
          ios: {
            sound: 'default',
            categoryId: 'task',
          },
          data: {
            taskId: task.local_id,
            type,
          },
        },
        trigger,
      )
      
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