/**
 * Location Triggers for Auto-Actions
 * 
 * Implements location-based task automation:
 * - Tier 1: Full GPS during transition task windows
 * - Tier 2: Significant location changes (battery-efficient)
 * - Tier 3: Geofences for arrival detection
 * 
 * Integrates with auto_action_rules table for user-defined triggers.
 */

import { Platform } from 'react-native'
import { supabase } from '../supabase'
import { internalDB } from '../internal-db'
import * as Notifications from 'expo-notifications'

// Try to import Background Geolocation
let BackgroundGeolocation: any = null
try {
  BackgroundGeolocation = require('react-native-background-geolocation').default
} catch (error) {
  console.log('[LocationTriggers] Background Geolocation not available')
}

// Try to import Notifee for confirmation notifications
let notifee: any = null
try {
  notifee = require('@notifee/react-native').default
} catch (error) {
  console.log('[LocationTriggers] Notifee not available')
}

// Types
export type TriggerType = 'time' | 'location_movement' | 'location_arrival'
export type AutoActionType = 'start' | 'complete' | 'pause'

export interface AutoActionRule {
  rule_id: string
  user_id: string
  task_id?: string
  task_type?: string
  trigger_type: TriggerType
  trigger_config: {
    // For location_movement
    movement_threshold_meters?: number
    
    // For location_arrival
    geofence_center?: { latitude: number; longitude: number }
    geofence_radius_meters?: number
    location_name?: string
    
    // For time-based
    minutes_before_start?: number
    minutes_after_end?: number
  }
  action: AutoActionType
  require_confirmation: boolean
  enabled: boolean
}

export interface LocationState {
  latitude: number
  longitude: number
  accuracy: number
  speed: number
  timestamp: number
  isMoving: boolean
}

// Monitoring tiers
enum MonitoringTier {
  IDLE = 0,       // No monitoring
  GEOFENCE = 1,   // Tier 3: Geofences only (lowest battery)
  SIGNIFICANT = 2, // Tier 2: Significant location changes
  GPS = 3,        // Tier 1: Full GPS tracking (highest accuracy)
}

class LocationTriggerService {
  private initialized = false
  private currentTier: MonitoringTier = MonitoringTier.IDLE
  private activeRules: AutoActionRule[] = []
  private lastLocation: LocationState | null = null
  private transitionWindowTimeout: NodeJS.Timeout | null = null

  /**
   * Initialize the location trigger service
   */
  async initialize(): Promise<void> {
    if (!BackgroundGeolocation) {
      console.log('[LocationTriggers] Skipping initialization - Background Geolocation not available')
      return
    }

    if (this.initialized) {
      console.log('[LocationTriggers] Already initialized')
      return
    }

    try {
      // Configure Background Geolocation
      const state = await BackgroundGeolocation.ready({
        // Debug settings
        debug: __DEV__,
        logLevel: __DEV__ ? BackgroundGeolocation.LOG_LEVEL_VERBOSE : BackgroundGeolocation.LOG_LEVEL_OFF,

        // Geolocation config
        desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        distanceFilter: 50, // meters
        stopTimeout: 5, // minutes to wait before stopping
        stationaryRadius: 25, // meters

        // iOS-specific
        activityType: BackgroundGeolocation.ACTIVITY_TYPE_OTHER_NAVIGATION,
        showsBackgroundLocationIndicator: true,
        preventSuspend: true,

        // Android-specific
        foregroundService: true,
        notification: {
          title: 'SkedAI Location',
          text: 'Tracking for auto-actions',
          channelName: 'Location Tracking',
          smallIcon: 'drawable/ic_notification',
        },

        // Application config
        backgroundPermissionRationale: {
          title: "Allow SkedAI to access your location in the background",
          message: "This allows automatic task completion when you arrive at or leave locations.",
          positiveAction: "Allow",
          negativeAction: "Cancel"
        },
      })

      console.log('[LocationTriggers] Ready state:', state.enabled)

      // Set up event listeners
      this.setupEventListeners()

      // Load active rules
      await this.loadActiveRules()

      // Start at geofence tier by default if rules exist
      if (this.activeRules.length > 0) {
        await this.setMonitoringTier(MonitoringTier.GEOFENCE)
      }

      this.initialized = true
      console.log('[LocationTriggers] Initialized successfully')
    } catch (error) {
      console.error('[LocationTriggers] Initialization error:', error)
    }
  }

  /**
   * Set up event listeners for location changes
   */
  private setupEventListeners(): void {
    if (!BackgroundGeolocation) return

    // Location change event
    BackgroundGeolocation.onLocation((location: any) => {
      this.handleLocationChange({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        speed: location.coords.speed || 0,
        timestamp: new Date(location.timestamp).getTime(),
        isMoving: location.is_moving,
      })
    }, (error: any) => {
      console.error('[LocationTriggers] Location error:', error)
    })

    // Motion change event (started/stopped moving)
    BackgroundGeolocation.onMotionChange((event: any) => {
      console.log('[LocationTriggers] Motion change:', event.isMoving)
      this.handleMotionChange(event.isMoving, event.location)
    })

    // Geofence event
    BackgroundGeolocation.onGeofence((event: any) => {
      console.log('[LocationTriggers] Geofence event:', event)
      this.handleGeofenceEvent(event)
    })

    // Provider change (GPS enabled/disabled)
    BackgroundGeolocation.onProviderChange((event: any) => {
      console.log('[LocationTriggers] Provider change:', event)
    })
  }

  /**
   * Load active auto-action rules from the database
   */
  async loadActiveRules(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: rules, error } = await supabase
        .from('auto_action_rules')
        .select('*')
        .eq('user_id', user.id)
        .eq('enabled', true)
        .in('trigger_type', ['location_movement', 'location_arrival'])

      if (error) {
        console.error('[LocationTriggers] Error loading rules:', error)
        return
      }

      this.activeRules = rules || []
      console.log(`[LocationTriggers] Loaded ${this.activeRules.length} active rules`)

      // Set up geofences for arrival rules
      await this.setupGeofences()
    } catch (error) {
      console.error('[LocationTriggers] Error in loadActiveRules:', error)
    }
  }

  /**
   * Set up geofences for location_arrival rules
   */
  private async setupGeofences(): Promise<void> {
    if (!BackgroundGeolocation) return

    // Remove existing geofences
    await BackgroundGeolocation.removeGeofences()

    // Add geofences for arrival rules
    const arrivalRules = this.activeRules.filter(r => r.trigger_type === 'location_arrival')

    for (const rule of arrivalRules) {
      const config = rule.trigger_config
      if (!config.geofence_center) continue

      try {
        await BackgroundGeolocation.addGeofence({
          identifier: rule.rule_id,
          latitude: config.geofence_center.latitude,
          longitude: config.geofence_center.longitude,
          radius: config.geofence_radius_meters || 100,
          notifyOnEntry: true,
          notifyOnExit: false,
          notifyOnDwell: false,
          extras: {
            rule_id: rule.rule_id,
            task_id: rule.task_id,
            action: rule.action,
            require_confirmation: rule.require_confirmation,
            location_name: config.location_name,
          },
        })
        console.log(`[LocationTriggers] Added geofence for rule ${rule.rule_id}`)
      } catch (error) {
        console.error(`[LocationTriggers] Error adding geofence for ${rule.rule_id}:`, error)
      }
    }
  }

  /**
   * Set the monitoring tier
   */
  private async setMonitoringTier(tier: MonitoringTier): Promise<void> {
    if (!BackgroundGeolocation || this.currentTier === tier) return

    console.log(`[LocationTriggers] Changing monitoring tier: ${this.currentTier} -> ${tier}`)

    switch (tier) {
      case MonitoringTier.IDLE:
        await BackgroundGeolocation.stop()
        break

      case MonitoringTier.GEOFENCE:
        // Start with geofence monitoring only
        await BackgroundGeolocation.setConfig({
          desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_LOW,
          distanceFilter: 500,
        })
        await BackgroundGeolocation.start()
        break

      case MonitoringTier.SIGNIFICANT:
        // Significant location changes
        await BackgroundGeolocation.setConfig({
          desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_MEDIUM,
          distanceFilter: 100,
        })
        await BackgroundGeolocation.start()
        break

      case MonitoringTier.GPS:
        // Full GPS tracking
        await BackgroundGeolocation.setConfig({
          desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
          distanceFilter: 10,
        })
        await BackgroundGeolocation.start()
        break
    }

    this.currentTier = tier
  }

  /**
   * Handle location change
   */
  private async handleLocationChange(location: LocationState): Promise<void> {
    console.log(`[LocationTriggers] Location update: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`)

    // Check movement-based rules
    if (this.lastLocation) {
      const distance = this.calculateDistance(
        this.lastLocation.latitude,
        this.lastLocation.longitude,
        location.latitude,
        location.longitude
      )

      const movementRules = this.activeRules.filter(r => r.trigger_type === 'location_movement')
      for (const rule of movementRules) {
        const threshold = rule.trigger_config.movement_threshold_meters || 100
        if (distance >= threshold) {
          await this.triggerAutoAction(rule, 'movement', { distance })
        }
      }
    }

    this.lastLocation = location
  }

  /**
   * Handle motion change (started/stopped moving)
   */
  private async handleMotionChange(isMoving: boolean, location: any): Promise<void> {
    if (isMoving) {
      // User started moving - upgrade to GPS tier during transition windows
      await this.checkTransitionWindow()
    } else {
      // User stopped moving - downgrade to geofence tier
      await this.setMonitoringTier(MonitoringTier.GEOFENCE)
    }
  }

  /**
   * Handle geofence event (entry/exit)
   */
  private async handleGeofenceEvent(event: any): Promise<void> {
    const { identifier, action, extras } = event

    if (action === 'ENTER') {
      console.log(`[LocationTriggers] Entered geofence: ${extras?.location_name || identifier}`)

      // Find the corresponding rule
      const rule = this.activeRules.find(r => r.rule_id === identifier)
      if (rule) {
        await this.triggerAutoAction(rule, 'arrival', { 
          location_name: extras?.location_name 
        })
      }
    }
  }

  /**
   * Check if we're in a transition window and upgrade monitoring
   */
  private async checkTransitionWindow(): Promise<void> {
    try {
      // Get upcoming tasks with travel/commute type
      const tasks = await internalDB.getAllTasks()
      const now = Date.now()

      // Look for tasks starting in the next 30 minutes
      const upcomingTransitionTasks = tasks.filter(task => {
        const startTime = new Date(task.start_time).getTime()
        const isUpcoming = startTime > now && startTime < now + 30 * 60 * 1000
        // Check if task is travel/commute type (this should be in task metadata)
        const isTransition = task.task_type === 'commute' || task.task_type === 'travel'
        return isUpcoming && isTransition
      })

      if (upcomingTransitionTasks.length > 0) {
        console.log('[LocationTriggers] Transition window detected, upgrading to GPS')
        await this.setMonitoringTier(MonitoringTier.GPS)

        // Schedule downgrade after the transition window
        const latestEnd = Math.max(
          ...upcomingTransitionTasks.map(t => new Date(t.end_time || t.start_time).getTime())
        )
        const windowDuration = latestEnd - now + 5 * 60 * 1000 // 5 min buffer

        if (this.transitionWindowTimeout) {
          clearTimeout(this.transitionWindowTimeout)
        }

        this.transitionWindowTimeout = setTimeout(() => {
          console.log('[LocationTriggers] Transition window ended, downgrading')
          this.setMonitoringTier(MonitoringTier.GEOFENCE)
        }, windowDuration)
      }
    } catch (error) {
      console.error('[LocationTriggers] Error checking transition window:', error)
    }
  }

  /**
   * Trigger an auto-action for a rule
   */
  private async triggerAutoAction(
    rule: AutoActionRule,
    triggerReason: string,
    context: Record<string, any>
  ): Promise<void> {
    console.log(`[LocationTriggers] Triggering auto-action: ${rule.action} for task ${rule.task_id}`)

    if (rule.require_confirmation) {
      // Show confirmation notification
      await this.showConfirmationNotification(rule, triggerReason, context)
    } else {
      // Execute immediately
      await this.executeAutoAction(rule.task_id || '', rule.action)
    }
  }

  /**
   * Show a confirmation notification for an auto-action
   */
  private async showConfirmationNotification(
    rule: AutoActionRule,
    triggerReason: string,
    context: Record<string, any>
  ): Promise<void> {
    const task = rule.task_id ? await internalDB.getTask(rule.task_id) : null
    const taskName = task?.name || 'Task'
    const actionVerb = rule.action === 'start' ? 'Start' : rule.action === 'complete' ? 'Complete' : 'Pause'

    let body = ''
    if (triggerReason === 'arrival') {
      body = `Arrived at ${context.location_name || 'location'}. ${actionVerb} "${taskName}"?`
    } else if (triggerReason === 'movement') {
      body = `Detected movement. ${actionVerb} "${taskName}"?`
    }

    // Store pending action in task
    if (rule.task_id) {
      await internalDB.updateTask(rule.task_id, { pending_auto_action: rule.action })
    }

    if (notifee) {
      await notifee.displayNotification({
        id: `auto-action-${rule.rule_id}`,
        title: `Auto-${actionVerb}`,
        body,
        data: {
          task_id: rule.task_id,
          rule_id: rule.rule_id,
          action: rule.action,
          type: 'auto_action_confirm',
        },
        android: {
          channelId: 'task-reminders',
          pressAction: { id: 'default' },
        },
        ios: {
          categoryId: 'AUTO_ACTION_CONFIRM',
        },
      })
    } else {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Auto-${actionVerb}`,
          body,
          data: {
            task_id: rule.task_id,
            rule_id: rule.rule_id,
            action: rule.action,
            type: 'auto_action_confirm',
          },
          categoryIdentifier: 'AUTO_ACTION_CONFIRM',
        },
        trigger: null, // Show immediately
        identifier: `auto-action-${rule.rule_id}`,
      })
    }
  }

  /**
   * Execute an auto-action
   */
  async executeAutoAction(taskId: string, action: AutoActionType): Promise<void> {
    try {
      const { handleNotificationAction } = require('../notifications/action-handler')
      
      switch (action) {
        case 'start':
          await handleNotificationAction('START', taskId)
          break
        case 'complete':
          await handleNotificationAction('COMPLETE', taskId)
          break
        case 'pause':
          await handleNotificationAction('PAUSE', taskId)
          break
      }

      console.log(`[LocationTriggers] Executed auto-action: ${action} for task ${taskId}`)
    } catch (error) {
      console.error('[LocationTriggers] Error executing auto-action:', error)
    }
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const R = 6371e3 // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lon2 - lon1) * Math.PI / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.transitionWindowTimeout) {
      clearTimeout(this.transitionWindowTimeout)
    }

    if (BackgroundGeolocation) {
      await BackgroundGeolocation.stop()
      await BackgroundGeolocation.removeListeners()
    }

    this.initialized = false
  }
}

// Export singleton
export const locationTriggerService = new LocationTriggerService()

// Export functions
export const initializeLocationTriggers = () => locationTriggerService.initialize()
export const loadAutoActionRules = () => locationTriggerService.loadActiveRules()
export const cleanupLocationTriggers = () => locationTriggerService.cleanup()

