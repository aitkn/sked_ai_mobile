import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { Task } from '../offline/database'

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export class ExpoNotificationService {
  initialized = false

  async initialize() {
    try {
      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync()
      let finalStatus = existingStatus
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }
      
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!')
        return
      }

      // Configure notification categories
      if (Platform.OS === 'ios') {
        await Notifications.setNotificationCategoryAsync('task', [
          {
            identifier: 'start-task',
            buttonTitle: 'Start Task',
            options: {
              opensAppToForeground: true,
            },
          },
        ])
      }

      this.initialized = true
      console.log('Expo notifications initialized')
    } catch (error) {
      console.error('Error initializing Expo notifications:', error)
    }
  }

  async scheduleTaskStartNotification(task: Task) {
    if (!this.initialized) await this.initialize()

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Time to Start: ${task.name}`,
          body: 'Your scheduled task is ready to begin!',
          data: { taskId: task.local_id, type: 'start' },
          categoryIdentifier: 'task',
        },
        trigger: null, // Immediate notification
      })
      
      console.log('Scheduled Expo notification for task start')
    } catch (error) {
      console.error('Error scheduling Expo notification:', error)
    }
  }

  async scheduleTaskNotification(task: Task, type: 'reminder' | 'due') {
    if (!this.initialized) await this.initialize()
    
    const triggerDate = type === 'reminder' ? task.reminder_at : task.due_at
    if (!triggerDate) return

    const title = type === 'reminder' 
      ? `Reminder: ${task.name}`
      : `Task Due: ${task.name}`

    const body = type === 'reminder'
      ? "Don't forget about this task!"
      : 'This task is due now'

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { taskId: task.local_id, type },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(triggerDate),
        },
      })
      
      console.log(`Scheduled Expo ${type} notification for task ${task.local_id}`)
    } catch (error) {
      console.error('Error scheduling Expo notification:', error)
    }
  }

  async cancelTaskNotifications(taskLocalId: string) {
    try {
      const notifications = await Notifications.getAllScheduledNotificationsAsync()
      
      for (const notification of notifications) {
        if (notification.content.data?.taskId === taskLocalId) {
          await Notifications.cancelScheduledNotificationAsync(notification.identifier)
        }
      }
    } catch (error) {
      console.error('Error canceling Expo notifications:', error)
    }
  }

  /**
   * Schedule a notification for a rescheduled task
   * @param taskName Name of the task
   * @param newTime New scheduled time for the task
   * @param attemptNumber Which reschedule attempt this is (1, 2, 3, etc.)
   */
  async scheduleRescheduleNotification(
    taskName: string,
    newTime: Date,
    attemptNumber: number
  ) {
    if (!this.initialized) await this.initialize()

    const timeString = newTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })

    const title = `⏰ Task Rescheduled: ${taskName}`
    const body = attemptNumber === 1
      ? `Missed task rescheduled to ${timeString}. Tap to start!`
      : `Rescheduled to ${timeString} (attempt ${attemptNumber}). Don't miss it this time!`

    try {
      // Send immediate notification about the reschedule
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { taskName, newTime: newTime.toISOString(), type: 'reschedule', attemptNumber },
          categoryIdentifier: 'task',
          sound: true,
        },
        trigger: null, // Immediate notification
      })

      console.log(`📲 Sent reschedule notification for "${taskName}" - attempt ${attemptNumber}`)

      // Also schedule a reminder 2 minutes before the new time
      const reminderTime = new Date(newTime.getTime() - 2 * 60 * 1000)
      if (reminderTime > new Date()) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `⏰ Starting Soon: ${taskName}`,
            body: `Your rescheduled task starts in 2 minutes at ${timeString}`,
            data: { taskName, newTime: newTime.toISOString(), type: 'reschedule-reminder', attemptNumber },
            categoryIdentifier: 'task',
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminderTime,
          },
        })
        console.log(`📲 Scheduled 2-minute reminder for "${taskName}"`)
      }
    } catch (error) {
      console.error('Error scheduling reschedule notification:', error)
    }
  }
}