import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { Task } from '../offline/database'

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
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
}