/**
 * Notification Customization
 * 
 * Handles notification sound and style resolution based on:
 * - Task priority
 * - Task category
 * - User preferences from notification_preferences table
 * 
 * Sounds:
 * - default.wav: Standard notification sound
 * - gentle-chime.wav: Soft sound for low-priority tasks
 * - priority-high.wav: Attention-grabbing for urgent tasks
 * - urgent-alarm.wav: Critical alerts
 * - health-reminder.wav: Health/wellness reminders
 * - departure.wav: Commute/travel alerts
 */

import { supabase } from '../supabase'
import { InternalTask } from '../internal-db'

// Interruption levels (iOS 15+)
export type InterruptionLevel = 'passive' | 'active' | 'timeSensitive' | 'critical'

// Android importance levels
export type AndroidImportance = 'default' | 'high' | 'low' | 'min' | 'max'

// Notification style configuration
export interface NotificationStyle {
  sound: string
  channelId: string
  interruptionLevel: InterruptionLevel
  androidImportance: AndroidImportance
  badge?: boolean
  vibrate?: boolean | number[]
}

// Sound mappings
export const NOTIFICATION_SOUNDS = {
  default: 'default',
  gentleChime: 'gentle_chime',
  priorityHigh: 'priority_high',
  urgentAlarm: 'urgent_alarm',
  healthReminder: 'health_reminder',
  departure: 'departure',
} as const

// Channel IDs for Android
export const NOTIFICATION_CHANNELS = {
  taskReminders: 'task-reminders',
  taskUrgent: 'task-urgent',
  scheduleUpdates: 'schedule-updates',
  locationAlerts: 'location-alerts',
  healthReminders: 'health-reminders',
} as const

// Priority to style mapping (defaults)
const PRIORITY_STYLES: Record<string, NotificationStyle> = {
  critical: {
    sound: NOTIFICATION_SOUNDS.urgentAlarm,
    channelId: NOTIFICATION_CHANNELS.taskUrgent,
    interruptionLevel: 'critical',
    androidImportance: 'max',
    badge: true,
    vibrate: [0, 200, 100, 200, 100, 200],
  },
  high: {
    sound: NOTIFICATION_SOUNDS.priorityHigh,
    channelId: NOTIFICATION_CHANNELS.taskUrgent,
    interruptionLevel: 'timeSensitive',
    androidImportance: 'high',
    badge: true,
    vibrate: [0, 250, 100, 250],
  },
  'above normal': {
    sound: NOTIFICATION_SOUNDS.priorityHigh,
    channelId: NOTIFICATION_CHANNELS.taskReminders,
    interruptionLevel: 'timeSensitive',
    androidImportance: 'high',
    badge: true,
    vibrate: true,
  },
  normal: {
    sound: NOTIFICATION_SOUNDS.default,
    channelId: NOTIFICATION_CHANNELS.taskReminders,
    interruptionLevel: 'active',
    androidImportance: 'default',
    badge: true,
    vibrate: true,
  },
  medium: {
    sound: NOTIFICATION_SOUNDS.default,
    channelId: NOTIFICATION_CHANNELS.taskReminders,
    interruptionLevel: 'active',
    androidImportance: 'default',
    badge: true,
    vibrate: true,
  },
  'below normal': {
    sound: NOTIFICATION_SOUNDS.gentleChime,
    channelId: NOTIFICATION_CHANNELS.taskReminders,
    interruptionLevel: 'active',
    androidImportance: 'default',
    badge: true,
  },
  low: {
    sound: NOTIFICATION_SOUNDS.gentleChime,
    channelId: NOTIFICATION_CHANNELS.taskReminders,
    interruptionLevel: 'passive',
    androidImportance: 'low',
  },
  optional: {
    sound: NOTIFICATION_SOUNDS.gentleChime,
    channelId: NOTIFICATION_CHANNELS.taskReminders,
    interruptionLevel: 'passive',
    androidImportance: 'min',
  },
}

// Category to style mapping (overrides priority if specified)
const CATEGORY_STYLES: Record<string, Partial<NotificationStyle>> = {
  health: {
    sound: NOTIFICATION_SOUNDS.healthReminder,
    channelId: NOTIFICATION_CHANNELS.healthReminders,
    interruptionLevel: 'timeSensitive',
  },
  wellness: {
    sound: NOTIFICATION_SOUNDS.healthReminder,
    channelId: NOTIFICATION_CHANNELS.healthReminders,
    interruptionLevel: 'timeSensitive',
  },
  medication: {
    sound: NOTIFICATION_SOUNDS.healthReminder,
    channelId: NOTIFICATION_CHANNELS.healthReminders,
    interruptionLevel: 'critical',
  },
  commute: {
    sound: NOTIFICATION_SOUNDS.departure,
    channelId: NOTIFICATION_CHANNELS.locationAlerts,
    interruptionLevel: 'timeSensitive',
  },
  travel: {
    sound: NOTIFICATION_SOUNDS.departure,
    channelId: NOTIFICATION_CHANNELS.locationAlerts,
    interruptionLevel: 'timeSensitive',
  },
  meeting: {
    interruptionLevel: 'timeSensitive',
    androidImportance: 'high',
  },
  urgent: {
    sound: NOTIFICATION_SOUNDS.priorityHigh,
    interruptionLevel: 'critical',
    androidImportance: 'max',
  },
}

// User preferences cache
let userPreferencesCache: Map<string, NotificationStyle> | null = null
let preferencesCacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get notification style for a task
 * Resolves style based on priority, category, and user preferences
 */
export async function getNotificationStyleForTask(task: InternalTask): Promise<NotificationStyle> {
  // Start with priority-based default
  const priority = task.priority?.toLowerCase() || 'medium'
  const baseStyle = PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium

  // Apply category overrides if any
  const category = (task as any).category?.toLowerCase()
  const categoryOverrides = category ? CATEGORY_STYLES[category] : undefined

  // Merge base style with category overrides
  let style: NotificationStyle = categoryOverrides
    ? { ...baseStyle, ...categoryOverrides }
    : { ...baseStyle }

  // Apply user preferences if available
  try {
    const userPrefs = await getUserPreferences()
    
    if (userPrefs) {
      // Check for priority-specific preference
      const priorityPref = userPrefs.get(`priority:${priority}`)
      if (priorityPref) {
        style = { ...style, ...priorityPref }
      }

      // Check for category-specific preference (overrides priority)
      if (category) {
        const categoryPref = userPrefs.get(`category:${category}`)
        if (categoryPref) {
          style = { ...style, ...categoryPref }
        }
      }
    }
  } catch (error) {
    console.error('[NotificationCustomization] Error fetching user preferences:', error)
  }

  return style
}

/**
 * Fetch user notification preferences from database
 */
async function getUserPreferences(): Promise<Map<string, Partial<NotificationStyle>> | null> {
  // Check cache
  if (userPreferencesCache && Date.now() - preferencesCacheTime < CACHE_TTL) {
    return userPreferencesCache
  }

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: prefs, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)

    if (error || !prefs) return null

    const prefsMap = new Map<string, Partial<NotificationStyle>>()

    for (const pref of prefs) {
      const key = pref.priority
        ? `priority:${pref.priority}`
        : pref.category
          ? `category:${pref.category}`
          : 'default'

      prefsMap.set(key, {
        sound: pref.sound || undefined,
        interruptionLevel: mapInterruptionLevel(pref.interruption_level),
      })
    }

    userPreferencesCache = prefsMap
    preferencesCacheTime = Date.now()

    return prefsMap
  } catch (error) {
    console.error('[NotificationCustomization] Error in getUserPreferences:', error)
    return null
  }
}

/**
 * Map database interruption level to iOS/Android values
 */
function mapInterruptionLevel(level?: string): InterruptionLevel {
  switch (level) {
    case 'passive':
      return 'passive'
    case 'active':
      return 'active'
    case 'time-sensitive':
    case 'timeSensitive':
      return 'timeSensitive'
    case 'critical':
      return 'critical'
    default:
      return 'active'
  }
}

/**
 * Map interruption level to Android importance
 */
export function interruptionToAndroidImportance(level: InterruptionLevel): AndroidImportance {
  switch (level) {
    case 'passive':
      return 'low'
    case 'active':
      return 'default'
    case 'timeSensitive':
      return 'high'
    case 'critical':
      return 'max'
    default:
      return 'default'
  }
}

/**
 * Clear the preferences cache
 */
export function clearPreferencesCache(): void {
  userPreferencesCache = null
  preferencesCacheTime = 0
}

/**
 * Save user notification preference
 */
export async function saveNotificationPreference(
  preference: {
    priority?: string
    category?: string
    sound?: string
    interruptionLevel?: InterruptionLevel
  }
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: user.id,
        priority: preference.priority || null,
        category: preference.category || null,
        sound: preference.sound,
        interruption_level: preference.interruptionLevel,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,priority,category',
      })

    if (error) {
      console.error('[NotificationCustomization] Error saving preference:', error)
      return false
    }

    // Clear cache to pick up new preference
    clearPreferencesCache()
    return true
  } catch (error) {
    console.error('[NotificationCustomization] Error in saveNotificationPreference:', error)
    return false
  }
}

/**
 * Get all available sounds
 */
export function getAvailableSounds(): Array<{ id: string; name: string; description: string }> {
  return [
    { id: 'default', name: 'Default', description: 'Standard notification sound' },
    { id: 'gentle_chime', name: 'Gentle Chime', description: 'Soft sound for low-priority tasks' },
    { id: 'priority_high', name: 'Priority High', description: 'Attention-grabbing for urgent tasks' },
    { id: 'urgent_alarm', name: 'Urgent Alarm', description: 'Critical alerts' },
    { id: 'health_reminder', name: 'Health Reminder', description: 'Health/wellness reminders' },
    { id: 'departure', name: 'Departure', description: 'Commute/travel alerts' },
  ]
}

