/**
 * Push Notification Service
 * 
 * Handles FCM token registration and remote push notifications.
 * Registers device tokens to the device_tokens table for server-side push.
 */

import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { supabase } from '../supabase'
import { syncTasksFromSupabase } from '../sync/TaskSyncService'

// Try to import Firebase Messaging (may not be available in Expo Go)
let messaging: any = null
try {
  messaging = require('@react-native-firebase/messaging').default
} catch (error) {
  console.log('[PushService] Firebase Messaging not available, using Expo Notifications')
}

class PushNotificationService {
  private deviceToken: string | null = null
  private isInitialized = false
  private tokenRefreshUnsubscribe: (() => void) | null = null
  private notificationReceivedUnsubscribe: Notifications.Subscription | null = null
  private notificationResponseUnsubscribe: Notifications.Subscription | null = null

  /**
   * Initialize push notification service
   * Should be called after user authentication
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[PushService] Already initialized')
      return
    }

    try {
      // Check if we're on a physical device
      if (!Device.isDevice) {
        console.log('[PushService] Push notifications only work on physical devices')
        return
      }

      // Request permissions
      const hasPermission = await this.requestPermissions()
      if (!hasPermission) {
        console.log('[PushService] Notification permissions not granted')
        return
      }

      // Get and register the push token
      await this.registerPushToken()

      // Set up notification handlers
      this.setupNotificationHandlers()

      // Listen for token refresh
      this.setupTokenRefreshListener()

      this.isInitialized = true
      console.log('[PushService] Initialized successfully')
    } catch (error) {
      console.error('[PushService] Initialization error:', error)
    }
  }

  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync()
      let finalStatus = existingStatus

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowCriticalAlerts: true,
            provideAppNotificationSettings: true,
          },
        })
        finalStatus = status
      }

      return finalStatus === 'granted'
    } catch (error) {
      console.error('[PushService] Permission request error:', error)
      return false
    }
  }

  /**
   * Get push token and register it with the server
   */
  async registerPushToken(): Promise<string | null> {
    try {
      let token: string | null = null

      // Try Firebase Messaging first (for development builds)
      if (messaging) {
        try {
          // Request permission for Firebase
          const authStatus = await messaging().requestPermission()
          const enabled =
            authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            authStatus === messaging.AuthorizationStatus.PROVISIONAL

          if (enabled) {
            token = await messaging().getToken()
            console.log('[PushService] Got FCM token:', token?.substring(0, 20) + '...')
          }
        } catch (fcmError) {
          console.log('[PushService] FCM not available, falling back to Expo:', fcmError)
        }
      }

      // Fall back to Expo Push Token
      if (!token) {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId
        if (projectId) {
          const expoPushToken = await Notifications.getExpoPushTokenAsync({
            projectId,
          })
          token = expoPushToken.data
          console.log('[PushService] Got Expo push token:', token?.substring(0, 20) + '...')
        }
      }

      if (token) {
        this.deviceToken = token
        await this.saveTokenToServer(token)
        return token
      }

      console.warn('[PushService] Could not get push token')
      return null
    } catch (error) {
      console.error('[PushService] Token registration error:', error)
      return null
    }
  }

  /**
   * Save push token to device_tokens table
   */
  private async saveTokenToServer(token: string): Promise<void> {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        console.warn('[PushService] No authenticated user, cannot save token')
        return
      }

      const deviceInfo = {
        user_id: user.id,
        platform: Platform.OS as 'ios' | 'android',
        token: token,
        device_name: Device.modelName || 'Unknown Device',
        app_version: Constants.expoConfig?.version || '1.0.0',
        updated_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('device_tokens')
        .upsert(deviceInfo, {
          onConflict: 'token',
        })

      if (error) {
        console.error('[PushService] Error saving token to server:', error)
      } else {
        console.log('[PushService] Token saved to server successfully')
      }
    } catch (error) {
      console.error('[PushService] Error in saveTokenToServer:', error)
    }
  }

  /**
   * Set up notification handlers for foreground and background
   */
  private setupNotificationHandlers(): void {
    // Handle notifications received while app is in foreground
    this.notificationReceivedUnsubscribe = Notifications.addNotificationReceivedListener(
      async (notification) => {
        console.log('[PushService] Notification received:', notification.request.content)
        
        const data = notification.request.content.data as any
        
        // Handle silent push - trigger sync
        if (data?.action === 'sync') {
          console.log('[PushService] Silent push received, syncing...')
          await syncTasksFromSupabase()
        }
      }
    )

    // Handle notification response (user tapped notification)
    this.notificationResponseUnsubscribe = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('[PushService] Notification response:', response)
        
        const data = response.notification.request.content.data as any
        const actionId = response.actionIdentifier
        
        // Emit event for action handling
        if (data?.task_id) {
          this.handleNotificationAction(actionId, data.task_id, data)
        }
      }
    )

    // Set up Firebase background message handler if available
    if (messaging) {
      messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
        console.log('[PushService] Background message:', remoteMessage)
        
        const data = remoteMessage.data
        if (data?.action === 'sync') {
          await syncTasksFromSupabase()
        }
      })

      // Handle foreground Firebase messages
      messaging().onMessage(async (remoteMessage: any) => {
        console.log('[PushService] Foreground Firebase message:', remoteMessage)
        
        const data = remoteMessage.data
        if (data?.action === 'sync') {
          await syncTasksFromSupabase()
        }
      })
    }
  }

  /**
   * Handle notification action (START, COMPLETE, SNOOZE, etc.)
   */
  private async handleNotificationAction(
    actionId: string,
    taskId: string,
    data: any
  ): Promise<void> {
    console.log('[PushService] Handling action:', actionId, 'for task:', taskId)
    
    // Import action handler dynamically to avoid circular dependencies
    try {
      const { handleNotificationAction } = require('./action-handler')
      await handleNotificationAction(actionId, taskId, data.previous_task_id)
    } catch (error) {
      console.error('[PushService] Error handling action:', error)
    }
  }

  /**
   * Listen for token refresh events
   */
  private setupTokenRefreshListener(): void {
    if (messaging) {
      this.tokenRefreshUnsubscribe = messaging().onTokenRefresh(async (newToken: string) => {
        console.log('[PushService] Token refreshed:', newToken?.substring(0, 20) + '...')
        this.deviceToken = newToken
        await this.saveTokenToServer(newToken)
      })
    }
  }

  /**
   * Get the current device token
   */
  getDeviceToken(): string | null {
    return this.deviceToken
  }

  /**
   * Record a sync with the server (updates next_notification_time)
   */
  async recordSync(): Promise<void> {
    if (!this.deviceToken) {
      console.warn('[PushService] No device token, cannot record sync')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase.rpc('record_client_sync', {
        p_user_id: user.id,
        p_device_token: this.deviceToken,
      })

      if (error) {
        console.error('[PushService] Error recording sync:', error)
      } else {
        console.log('[PushService] Sync recorded successfully')
      }
    } catch (error) {
      console.error('[PushService] Error in recordSync:', error)
    }
  }

  /**
   * Remove device token from server (on logout)
   */
  async unregister(): Promise<void> {
    if (this.deviceToken) {
      try {
        const { error } = await supabase
          .from('device_tokens')
          .delete()
          .eq('token', this.deviceToken)

        if (error) {
          console.error('[PushService] Error removing token:', error)
        } else {
          console.log('[PushService] Token removed from server')
        }
      } catch (error) {
        console.error('[PushService] Error in unregister:', error)
      }
    }

    // Clean up listeners
    this.cleanup()
  }

  /**
   * Clean up listeners and state
   */
  cleanup(): void {
    if (this.notificationReceivedUnsubscribe) {
      this.notificationReceivedUnsubscribe.remove()
    }
    if (this.notificationResponseUnsubscribe) {
      this.notificationResponseUnsubscribe.remove()
    }
    if (this.tokenRefreshUnsubscribe) {
      this.tokenRefreshUnsubscribe()
    }

    this.isInitialized = false
    this.deviceToken = null
  }
}

// Export singleton instance
export const pushService = new PushNotificationService()

// Export functions for easier access
export const initializePushNotifications = () => pushService.initialize()
export const getDeviceToken = () => pushService.getDeviceToken()
export const recordClientSync = () => pushService.recordSync()
export const unregisterPushNotifications = () => pushService.unregister()

