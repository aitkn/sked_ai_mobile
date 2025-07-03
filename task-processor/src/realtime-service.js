import { createClient } from '@supabase/supabase-js'
import { NOTIFICATION_CONFIG } from '../config/globals.js'

export class RealtimeService {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
    this.channels = new Map()
    this.isConnected = false
    this.connectionAttempts = 0
    this.maxRetries = 5
  }

  /**
   * Initialize realtime service
   */
  async initialize() {
    console.log('📡 Initializing Supabase Realtime service...')
    
    try {
      // Setup main timeline updates channel
      await this.setupTimelineChannel()
      
      // Setup task processing status channel
      await this.setupProcessingChannel()
      
      // Monitor connection status
      this.setupConnectionMonitoring()
      
      this.isConnected = true
      console.log('✅ Realtime service initialized successfully')
      
    } catch (error) {
      console.error('❌ Failed to initialize realtime service:', error)
      throw error
    }
  }

  /**
   * Setup timeline updates channel
   */
  setupTimelineChannel() {
    const channelName = NOTIFICATION_CONFIG.REALTIME_CHANNELS.TIMELINE_UPDATES
    
    const channel = this.supabase
      .channel(channelName)
      .on('broadcast', { event: 'timeline_update' }, (payload) => {
        console.log('📅 Timeline update broadcast received:', payload)
        this.handleTimelineUpdate(payload)
      })
      .on('presence', { event: 'sync' }, () => {
        console.log('👥 Presence sync for timeline channel')
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('👤 User joined timeline channel:', key)
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('👤 User left timeline channel:', key)
      })
      .subscribe((status) => {
        console.log(`📡 Timeline channel status: ${status}`)
      })

    this.channels.set(channelName, channel)
    console.log(`📺 Timeline updates channel "${channelName}" setup complete`)
  }

  /**
   * Setup task processing status channel
   */
  setupProcessingChannel() {
    const channelName = NOTIFICATION_CONFIG.REALTIME_CHANNELS.TASK_PROCESSING
    
    const channel = this.supabase
      .channel(channelName)
      .on('broadcast', { event: 'processing_status' }, (payload) => {
        console.log('⚙️ Processing status update:', payload)
        this.handleProcessingStatus(payload)
      })
      .subscribe((status) => {
        console.log(`📡 Processing channel status: ${status}`)
      })

    this.channels.set(channelName, channel)
    console.log(`⚙️ Task processing channel "${channelName}" setup complete`)
  }

  /**
   * Setup connection monitoring
   */
  setupConnectionMonitoring() {
    // Monitor connection status with heartbeat
    setInterval(() => {
      this.checkConnectionHealth()
    }, 30000) // Check every 30 seconds

    console.log('💓 Connection monitoring setup complete')
  }

  /**
   * Handle timeline update broadcasts
   */
  handleTimelineUpdate(payload) {
    const { user_id, timeline, timestamp } = payload.payload
    
    console.log(`📅 Processing timeline update for user ${user_id}:`, {
      taskCount: timeline.timeline_json?.tasks?.length || 0,
      timestamp
    })

    // Here you could add additional processing, logging, or forwarding
    // For now, we just log the event
  }

  /**
   * Handle processing status updates
   */
  handleProcessingStatus(payload) {
    const { status, task_id, user_id, stage } = payload.payload
    
    console.log(`⚙️ Task processing update:`, {
      task_id,
      user_id,
      status,
      stage
    })

    // Log processing stages for monitoring
    if (status === 'started') {
      console.log(`🚀 Task processing started for task ${task_id}`)
    } else if (status === 'completed') {
      console.log(`✅ Task processing completed for task ${task_id}`)
    } else if (status === 'error') {
      console.error(`❌ Task processing failed for task ${task_id}`)
    }
  }

  /**
   * Broadcast timeline update
   */
  async broadcastTimelineUpdate(userId, timelineData) {
    const channelName = NOTIFICATION_CONFIG.REALTIME_CHANNELS.TIMELINE_UPDATES
    const channel = this.channels.get(channelName)
    
    if (!channel) {
      console.error('❌ Timeline channel not found')
      return false
    }

    const payload = {
      user_id: userId,
      timeline: timelineData,
      timestamp: new Date().toISOString(),
      source: 'task_processor'
    }

    try {
      await channel.send({
        type: 'broadcast',
        event: 'timeline_update',
        payload
      })
      
      console.log(`📡 Timeline update broadcasted for user ${userId}`)
      return true
    } catch (error) {
      console.error('❌ Failed to broadcast timeline update:', error)
      return false
    }
  }

  /**
   * Broadcast processing status
   */
  async broadcastProcessingStatus(taskId, userId, status, stage = null) {
    const channelName = NOTIFICATION_CONFIG.REALTIME_CHANNELS.TASK_PROCESSING
    const channel = this.channels.get(channelName)
    
    if (!channel) {
      console.error('❌ Processing channel not found')
      return false
    }

    const payload = {
      task_id: taskId,
      user_id: userId,
      status, // 'started', 'processing', 'completed', 'error'
      stage, // 'solution_generation', 'timeline_creation', 'notification_sending'
      timestamp: new Date().toISOString()
    }

    try {
      await channel.send({
        type: 'broadcast',
        event: 'processing_status',
        payload
      })
      
      console.log(`⚙️ Processing status broadcasted: ${status} for task ${taskId}`)
      return true
    } catch (error) {
      console.error('❌ Failed to broadcast processing status:', error)
      return false
    }
  }

  /**
   * Track user presence (when they're actively using the app)
   */
  async trackUserPresence(userId, isActive = true) {
    const channelName = NOTIFICATION_CONFIG.REALTIME_CHANNELS.TIMELINE_UPDATES
    const channel = this.channels.get(channelName)
    
    if (!channel) {
      console.error('❌ Timeline channel not found for presence tracking')
      return false
    }

    try {
      if (isActive) {
        await channel.track({
          user_id: userId,
          status: 'active',
          joined_at: new Date().toISOString()
        })
        console.log(`👤 User ${userId} presence tracked as active`)
      } else {
        await channel.untrack()
        console.log(`👤 User ${userId} presence untracked`)
      }
      
      return true
    } catch (error) {
      console.error('❌ Failed to track user presence:', error)
      return false
    }
  }

  /**
   * Check connection health
   */
  checkConnectionHealth() {
    const channelCount = this.channels.size
    const connectedChannels = Array.from(this.channels.values()).filter(
      channel => channel.state === 'joined'
    ).length

    if (connectedChannels < channelCount) {
      console.warn(`⚠️ Connection health warning: ${connectedChannels}/${channelCount} channels connected`)
      
      // Attempt to reconnect if too many failures
      this.connectionAttempts++
      if (this.connectionAttempts >= this.maxRetries) {
        console.error('❌ Max connection attempts reached, service may be degraded')
      }
    } else {
      this.connectionAttempts = 0 // Reset on successful connection
    }
  }

  /**
   * Cleanup and disconnect
   */
  async disconnect() {
    console.log('📡 Disconnecting realtime service...')
    
    for (const [channelName, channel] of this.channels) {
      try {
        await channel.unsubscribe()
        console.log(`📺 Unsubscribed from channel: ${channelName}`)
      } catch (error) {
        console.error(`❌ Error unsubscribing from ${channelName}:`, error)
      }
    }
    
    this.channels.clear()
    this.isConnected = false
    console.log('✅ Realtime service disconnected')
  }

  /**
   * Get service status
   */
  getStatus() {
    const channelStatuses = {}
    for (const [name, channel] of this.channels) {
      channelStatuses[name] = {
        state: channel.state,
        presenceCount: Object.keys(channel.presenceState()).length
      }
    }

    return {
      isConnected: this.isConnected,
      channelCount: this.channels.size,
      connectionAttempts: this.connectionAttempts,
      channels: channelStatuses
    }
  }
}