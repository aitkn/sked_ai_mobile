/**
 * Notification Analytics
 * 
 * Tracks notification delivery, open rates, and action completion.
 * Data is stored in the notification_events table for analysis.
 */

import { Platform } from 'react-native'
import { supabase } from '../supabase'
import { getDeviceToken } from './push-service'

// Event types
export type NotificationEventType =
  | 'scheduled'      // Notification scheduled locally
  | 'sent'           // Notification sent from server
  | 'delivered'      // Notification delivered to device
  | 'opened'         // User tapped notification body
  | 'action'         // User tapped action button
  | 'dismissed'      // User dismissed notification
  | 'failed'         // Delivery failed

/**
 * Track a notification event
 * 
 * @param taskId - Task ID associated with the notification
 * @param eventType - Type of event
 * @param actionType - Optional action type if eventType is 'action'
 * @param metadata - Optional additional metadata
 */
export async function trackNotificationEvent(
  taskId: string,
  eventType: NotificationEventType,
  actionType?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.log('[Analytics] No user, skipping event tracking')
      return
    }

    const deviceToken = getDeviceToken()

    const eventData: Record<string, any> = {
      user_id: user.id,
      task_id: taskId,
      device_token: deviceToken,
      platform: Platform.OS,
      event_type: eventType,
    }

    if (actionType) {
      eventData.action_type = actionType
    }

    // Set timing based on event type
    const now = new Date().toISOString()
    switch (eventType) {
      case 'sent':
        eventData.sent_at = now
        break
      case 'delivered':
        eventData.delivered_at = now
        break
      case 'opened':
      case 'action':
        eventData.opened_at = now
        break
    }

    if (metadata) {
      // Store failure reason if provided
      if (metadata.failure_reason) {
        eventData.failure_reason = metadata.failure_reason
      }
      if (metadata.message_id) {
        eventData.message_id = metadata.message_id
      }
    }

    const { error } = await supabase
      .from('notification_events')
      .insert(eventData)

    if (error) {
      console.error('[Analytics] Error tracking event:', error)
    } else {
      console.log(`[Analytics] Tracked ${eventType} event for task ${taskId}`)
    }
  } catch (error) {
    console.error('[Analytics] Error in trackNotificationEvent:', error)
  }
}

/**
 * Track when a notification is scheduled locally
 */
export async function trackScheduled(taskId: string): Promise<void> {
  await trackNotificationEvent(taskId, 'scheduled')
}

/**
 * Track when a notification is delivered
 */
export async function trackDelivered(taskId: string): Promise<void> {
  await trackNotificationEvent(taskId, 'delivered')
}

/**
 * Track when user opens a notification
 */
export async function trackOpened(taskId: string): Promise<void> {
  await trackNotificationEvent(taskId, 'opened')
}

/**
 * Track when user takes an action on a notification
 */
export async function trackAction(taskId: string, actionType: string): Promise<void> {
  await trackNotificationEvent(taskId, 'action', actionType)
}

/**
 * Track when a notification fails to deliver
 */
export async function trackFailed(taskId: string, reason: string): Promise<void> {
  await trackNotificationEvent(taskId, 'failed', undefined, { failure_reason: reason })
}

/**
 * Track notification dismissed
 */
export async function trackDismissed(taskId: string): Promise<void> {
  await trackNotificationEvent(taskId, 'dismissed')
}

/**
 * Get notification analytics for a time period
 * 
 * @param startDate - Start of period
 * @param endDate - End of period (optional, defaults to now)
 */
export async function getNotificationStats(
  startDate: Date,
  endDate: Date = new Date()
): Promise<{
  total: number
  delivered: number
  opened: number
  actionRate: number
  dismissRate: number
} | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('notification_events')
      .select('event_type')
      .eq('user_id', user.id)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (error || !data) {
      console.error('[Analytics] Error fetching stats:', error)
      return null
    }

    const eventCounts = data.reduce((acc, event) => {
      acc[event.event_type] = (acc[event.event_type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const total = eventCounts.scheduled || eventCounts.delivered || 0
    const delivered = eventCounts.delivered || 0
    const opened = eventCounts.opened || 0
    const actions = eventCounts.action || 0
    const dismissed = eventCounts.dismissed || 0

    return {
      total,
      delivered,
      opened,
      actionRate: delivered > 0 ? (actions / delivered) * 100 : 0,
      dismissRate: delivered > 0 ? (dismissed / delivered) * 100 : 0,
    }
  } catch (error) {
    console.error('[Analytics] Error in getNotificationStats:', error)
    return null
  }
}

/**
 * Get most common actions
 */
export async function getTopActions(limit: number = 5): Promise<
  Array<{ action_type: string; count: number }> | null
> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('notification_events')
      .select('action_type')
      .eq('user_id', user.id)
      .eq('event_type', 'action')
      .not('action_type', 'is', null)

    if (error || !data) {
      console.error('[Analytics] Error fetching top actions:', error)
      return null
    }

    // Count actions
    const actionCounts = data.reduce((acc, event) => {
      acc[event.action_type] = (acc[event.action_type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Sort and return top N
    return Object.entries(actionCounts)
      .map(([action_type, count]) => ({ action_type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  } catch (error) {
    console.error('[Analytics] Error in getTopActions:', error)
    return null
  }
}

