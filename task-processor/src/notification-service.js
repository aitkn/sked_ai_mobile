import { Expo } from 'expo-server-sdk'
import { createClient } from '@supabase/supabase-js'
import { SCHEDULING_CONFIG, NOTIFICATION_CONFIG, isInNotificationWindow, getNextInterval } from '../config/globals.js'

export class NotificationService {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
    this.expo = new Expo()
    this.activeUsers = new Set() // Track users currently in the app
  }

  /**
   * Handle timeline update and determine notification strategy
   * @param {Object} timelineData - The generated timeline
   * @param {Object} taskAnalysis - Analysis of the original task
   */
  async handleTimelineUpdate(timelineData, taskAnalysis) {
    const userId = taskAnalysis.originalTask.user_id
    const schedule = timelineData.timeline_json

    console.log(`📬 Processing notifications for user ${userId}`)

    try {
      // Step 1: Always send realtime update (for active app users)
      await this.sendRealtimeUpdate(userId, timelineData)

      // Step 2: Check if we need push notification
      const shouldSendPush = this.shouldSendPushNotification(schedule, userId)
      
      if (shouldSendPush) {
        await this.sendPushNotification(userId, schedule, taskAnalysis)
      }

      console.log(`✅ Notifications processed for user ${userId}`)
    } catch (error) {
      console.error(`❌ Error processing notifications for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Determine if push notification should be sent
   */
  shouldSendPushNotification(schedule, userId) {
    // Don't send push if user is actively using the app
    if (this.activeUsers.has(userId)) {
      console.log(`📱 User ${userId} is active in app, skipping push notification`)
      return false
    }

    // Check if we're in the critical notification window
    const now = new Date()
    const isInWindow = isInNotificationWindow(now)
    
    if (!isInWindow) {
      console.log(`⏰ Not in notification window, skipping push notification`)
      return false
    }

    // Check if timeline contains tasks that start in the next interval
    const nextInterval = getNextInterval(now)
    const nextIntervalEnd = new Date(nextInterval.getTime() + SCHEDULING_CONFIG.INTERVAL_GRANULARITY * 60 * 1000)
    
    const hasUpcomingTask = schedule.tasks?.some(task => {
      const taskStart = new Date(task.start_time)
      return taskStart >= nextInterval && taskStart < nextIntervalEnd
    })

    if (hasUpcomingTask) {
      console.log(`🚨 Found task starting in next interval, sending push notification`)
      return true
    }

    console.log(`📅 No tasks starting in next interval, skipping push notification`)
    return false
  }

  /**
   * Send realtime update via Supabase
   */
  async sendRealtimeUpdate(userId, timelineData) {
    const channel = this.supabase.channel(NOTIFICATION_CONFIG.REALTIME_CHANNELS.TIMELINE_UPDATES)
    
    const updatePayload = {
      type: 'timeline_updated',
      user_id: userId,
      timeline: timelineData,
      timestamp: new Date().toISOString()
    }

    await channel.send({
      type: 'broadcast',
      event: 'timeline_update',
      payload: updatePayload
    })

    console.log(`📡 Realtime update sent for user ${userId}`)
  }

  /**
   * Send push notification via Expo
   */
  async sendPushNotification(userId, schedule, taskAnalysis) {
    try {
      // Get user's push token (in real app, this would be stored in database)
      const pushToken = await this.getUserPushToken(userId)
      
      if (!pushToken) {
        console.log(`📵 No push token found for user ${userId}`)
        return
      }

      // Find the upcoming task
      const now = new Date()
      const nextInterval = getNextInterval(now)
      const upcomingTask = schedule.tasks?.find(task => {
        const taskStart = new Date(task.start_time)
        return taskStart >= nextInterval
      })

      if (!upcomingTask) {
        console.log(`📅 No upcoming task found for push notification`)
        return
      }

      const message = {
        to: pushToken,
        sound: 'default',
        title: 'New Task Scheduled',
        body: `"${upcomingTask.name}" starts at ${new Date(upcomingTask.start_time).toLocaleTimeString()}`,
        data: {
          type: 'timeline_update',
          task_id: upcomingTask.task_id || taskAnalysis.originalTask.task_id,
          start_time: upcomingTask.start_time,
          user_id: userId
        },
        priority: 'high',
        channelId: 'task-notifications'
      }

      // Validate push token
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`❌ Invalid push token for user ${userId}: ${pushToken}`)
        return
      }

      // Send notification
      const tickets = await this.expo.sendPushNotificationsAsync([message])
      
      console.log(`📮 Push notification sent to user ${userId}:`, {
        task: upcomingTask.name,
        startTime: upcomingTask.start_time,
        ticket: tickets[0]
      })

      // Handle ticket responses (check for errors)
      this.handlePushTickets(tickets, userId)

    } catch (error) {
      console.error(`❌ Error sending push notification to user ${userId}:`, error)
    }
  }

  /**
   * Get user's push token from database (mock implementation)
   */
  async getUserPushToken(userId) {
    // In a real implementation, you'd query a user_devices or push_tokens table
    // For now, return a mock token format
    
    // Check if this is a test user
    if (userId === '280ee21e-0e80-4b61-b58e-c62558e729d9') {
      // Return a mock Expo push token format
      return 'ExponentPushToken[mock-token-for-testing]'
    }
    
    console.log(`📵 No push token configured for user ${userId}`)
    return null
  }

  /**
   * Handle push notification ticket responses
   */
  handlePushTickets(tickets, userId) {
    tickets.forEach((ticket, index) => {
      if (ticket.status === 'error') {
        console.error(`❌ Push notification error for user ${userId}:`, ticket.message)
        if (ticket.details && ticket.details.error) {
          console.error('Error details:', ticket.details.error)
        }
      } else {
        console.log(`✅ Push notification queued successfully for user ${userId}`)
      }
    })
  }

  /**
   * Track user app activity (called by app when user becomes active/inactive)
   */
  setUserActive(userId, isActive) {
    if (isActive) {
      this.activeUsers.add(userId)
      console.log(`📱 User ${userId} is now active in app`)
    } else {
      this.activeUsers.delete(userId)
      console.log(`📱 User ${userId} is no longer active in app`)
    }
  }

  /**
   * Send immediate notification for testing
   */
  async sendTestNotification(userId, message = 'Test notification from task processor') {
    const pushToken = await this.getUserPushToken(userId)
    
    if (!pushToken) {
      console.log(`📵 No push token found for test notification to user ${userId}`)
      return false
    }

    const testMessage = {
      to: pushToken,
      sound: 'default',
      title: 'Task Processor Test',
      body: message,
      data: {
        type: 'test',
        timestamp: new Date().toISOString()
      }
    }

    try {
      const tickets = await this.expo.sendPushNotificationsAsync([testMessage])
      console.log(`🧪 Test notification sent to user ${userId}`)
      return true
    } catch (error) {
      console.error(`❌ Error sending test notification:`, error)
      return false
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      activeUsers: Array.from(this.activeUsers),
      isInNotificationWindow: isInNotificationWindow(),
      nextInterval: getNextInterval().toISOString()
    }
  }
}