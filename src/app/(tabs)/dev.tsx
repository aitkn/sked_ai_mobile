import React, { useState, useEffect, useCallback } from 'react'
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native'
import { Text } from '@/components/Themed'
import { FontAwesome } from '@expo/vector-icons'
import Colors from '@/constants/Colors'
import { internalDB, InternalTask, InternalAction } from '@/lib/internal-db'
import { supabase } from '@/lib/supabase'
import { useFocusEffect } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'

// Timeline interfaces
interface TimelineTask {
  name: string
  start_time: string
  end_time: string
  duration: number // in seconds
}

interface TimelineData {
  tasks: TimelineTask[]
  created_at: string
  description?: string
}

export default function DevScreen() {
  const [tasks, setTasks] = useState<InternalTask[]>([])
  const [actions, setActions] = useState<InternalAction[]>([])
  const [loading, setLoading] = useState(false)
  
  // Auto-import state
  const [autoImportEnabled, setAutoImportEnabled] = useState(true)
  const [lastImportTime, setLastImportTime] = useState<Date | null>(null)
  const [nextImportTime, setNextImportTime] = useState<Date | null>(null)
  const [importHistory, setImportHistory] = useState<Array<{timestamp: Date, success: boolean, message: string}>>([])
  
  // Notification debug state
  const [scheduledNotifications, setScheduledNotifications] = useState<any[]>([])
  const [notificationPermission, setNotificationPermission] = useState<string>('unknown')

  // Load tasks and actions when component mounts
  useEffect(() => {
    loadTasks()
    loadActions()
    
    // Auto-refresh actions every 2 seconds to pick up notification actions
    const interval = setInterval(() => {
      loadActions()
    }, 2000)
    
    return () => clearInterval(interval)
  }, [])

  // Initialize notification permissions and scheduled notifications
  useEffect(() => {
    checkNotificationPermissions()
    loadScheduledNotifications()
    
    // Refresh notification list every 10 seconds
    const notificationInterval = setInterval(() => {
      loadScheduledNotifications()
    }, 10000)
    
    return () => clearInterval(notificationInterval)
  }, [])

  // Auto-import timer system
  useEffect(() => {
    if (!autoImportEnabled) return
    
    const updateNextImportTime = () => {
      const nextTime = calculateNextImportTime()
      setNextImportTime(nextTime)
    }
    
    // Update next import time immediately and every 30 seconds
    updateNextImportTime()
    const updateInterval = setInterval(updateNextImportTime, 30000)
    
    // Check for auto-import every 30 seconds
    const checkInterval = setInterval(() => {
      const now = new Date()
      const next = calculateNextImportTime()
      
      // If next import time is more than 4.5 minutes away, it means we just passed the trigger
      const timeDiff = next.getTime() - now.getTime()
      if (timeDiff > 4.5 * 60 * 1000) {
        console.log('🔄 Auto-import trigger detected')
        performAutoImport()
        updateNextImportTime() // Recalculate after import
      }
    }, 30000)
    
    return () => {
      clearInterval(updateInterval)
      clearInterval(checkInterval)
    }
  }, [autoImportEnabled])

  // Refresh actions when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadActions()
      loadTasks()
    }, [])
  )

  const loadTasks = async () => {
    try {
      const allTasks = await internalDB.getAllTasks()
      setTasks(allTasks)
    } catch (error) {
      console.error('Error loading tasks:', error)
    }
  }

  const loadActions = async () => {
    try {
      const allActions = await internalDB.getAllActions()
      setActions(allActions)
    } catch (error) {
      console.error('Error loading actions:', error)
    }
  }

  // Calculate next auto-import time (xx:04:45, xx:09:45, etc.)
  const calculateNextImportTime = () => {
    const now = new Date()
    const currentMinutes = now.getMinutes()
    const currentSeconds = now.getSeconds()
    
    // Find next 5-minute interval, 15 seconds before (xx:04:45, xx:09:45, etc.)
    let targetMinutes = Math.floor(currentMinutes / 5) * 5 + 5 - 1 // Next 5-min - 1 min
    let targetSeconds = 45
    
    // If we're past the current interval's trigger time, move to next
    if (currentMinutes % 5 === 4 && currentSeconds >= 45) {
      targetMinutes += 5
    }
    
    // Handle hour rollover
    let targetHour = now.getHours()
    if (targetMinutes >= 60) {
      targetMinutes -= 60
      targetHour += 1
    }
    if (targetHour >= 24) {
      targetHour = 0
    }
    
    const nextImport = new Date(now)
    nextImport.setHours(targetHour, targetMinutes, targetSeconds, 0)
    
    // If the calculated time is in the past, add 5 minutes
    if (nextImport.getTime() <= now.getTime()) {
      nextImport.setMinutes(nextImport.getMinutes() + 5)
    }
    
    return nextImport
  }

  // Auto-import timeline function
  const performAutoImport = async () => {
    if (!autoImportEnabled) return
    
    try {
      console.log('🔄 Performing auto-import of timeline...')
      
      // Use the same logic as handleImportTimeline
      const { data, error } = await supabase
        .schema('skedai')
        .from('user_timeline')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (error) throw error
      
      if (!data || data.length === 0) {
        throw new Error('No timeline data found')
      }
      
      const timelineEntry = data[0]
      const timelineData = timelineEntry.timeline_json as TimelineData
      
      // Clear existing tasks before importing new timeline
      await internalDB.clearAllTasks()
      
      // Import each task from the timeline
      let importedCount = 0
      for (const timelineTask of timelineData.tasks) {
        await internalDB.addTaskWithDuration(
          timelineTask.name,
          timelineTask.start_time,
          timelineTask.end_time
        )
        importedCount++
      }
      
      const now = new Date()
      setLastImportTime(now)
      setImportHistory(prev => [
        { timestamp: now, success: true, message: `Imported ${importedCount} tasks` },
        ...prev.slice(0, 4) // Keep last 5 entries
      ])
      
      await loadTasks()
      console.log(`✅ Auto-imported ${importedCount} tasks successfully`)
      
    } catch (error: any) {
      const now = new Date()
      const errorMessage = error.message || 'Unknown error'
      setImportHistory(prev => [
        { timestamp: now, success: false, message: errorMessage },
        ...prev.slice(0, 4)
      ])
      console.error('❌ Auto-import failed:', error)
    }
  }

  // Load scheduled notifications
  const loadScheduledNotifications = async () => {
    try {
      const notifications = await Notifications.getAllScheduledNotificationsAsync()
      setScheduledNotifications(notifications)
    } catch (error) {
      console.error('Error loading scheduled notifications:', error)
    }
  }

  // Check notification permissions
  const checkNotificationPermissions = async () => {
    try {
      const settings = await Notifications.getPermissionsAsync()
      setNotificationPermission(settings.status)
    } catch (error) {
      console.error('Error checking notification permissions:', error)
      setNotificationPermission('error')
    }
  }

  // Schedule a test notification
  const scheduleTestNotification = async (delaySeconds: number) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Test Notification (${delaySeconds}s delay)`,
          body: `This notification was scheduled ${delaySeconds} seconds ago`,
          data: { type: 'test', delay: delaySeconds },
        },
        trigger: delaySeconds > 0 ? { seconds: delaySeconds } as any : null,
      })
      
      console.log(`✅ Scheduled test notification with ${delaySeconds}s delay`)
      await loadScheduledNotifications()
      
    } catch (error: any) {
      console.error('❌ Failed to schedule test notification:', error)
      Alert.alert('Error', `Failed to schedule notification: ${error?.message || 'Unknown error'}`)
    }
  }

  const findOptimalTaskSlot = async (): Promise<{ startTime: Date; endTime: Date; description: string }> => {
    const allTasks = await internalDB.getAllTasks()
    const now = new Date()
    const taskDuration = 15 * 1000 // 15 seconds in milliseconds
    
    // Filter to active tasks (not completed) and sort by start time
    const activeTasks = allTasks
      .filter(task => task.status !== 'completed')
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    
    // Find current task (if any)
    const currentTask = activeTasks.find(task => {
      const taskStart = new Date(task.start_time).getTime()
      const taskEnd = new Date(task.end_time).getTime()
      const nowMs = now.getTime()
      return nowMs >= taskStart && nowMs < taskEnd
    })
    
    let proposedStartTime: Date
    let description: string
    
    if (!currentTask) {
      // No current task - schedule 10 seconds from now
      proposedStartTime = new Date(now.getTime() + 10 * 1000)
      description = "No current task - scheduled 10 seconds from now"
    } else {
      // There's a current task - schedule 10 seconds after it ends
      const currentTaskEnd = new Date(currentTask.end_time).getTime()
      proposedStartTime = new Date(currentTaskEnd + 10 * 1000)
      description = `Scheduled 10 seconds after "${currentTask.name}" ends`
    }
    
    // Check for conflicts and find next available slot
    let slotFound = false
    let attempts = 0
    const maxAttempts = 20 // Prevent infinite loops
    
    while (!slotFound && attempts < maxAttempts) {
      const proposedStartMs = proposedStartTime.getTime()
      const proposedEndMs = proposedStartMs + taskDuration
      
      // Check if this slot conflicts with any existing task
      const hasConflict = activeTasks.some(task => {
        const taskStartMs = new Date(task.start_time).getTime()
        const taskEndMs = new Date(task.end_time).getTime()
        
        // Check for overlap: proposed task starts before existing task ends AND proposed task ends after existing task starts
        return proposedStartMs < taskEndMs && proposedEndMs > taskStartMs
      })
      
      if (!hasConflict) {
        slotFound = true
      } else {
        // Find the next task that conflicts and schedule after it
        const conflictingTask = activeTasks.find(task => {
          const taskStartMs = new Date(task.start_time).getTime()
          const taskEndMs = new Date(task.end_time).getTime()
          return proposedStartMs < taskEndMs && proposedEndMs > taskStartMs
        })
        
        if (conflictingTask) {
          const conflictTaskEnd = new Date(conflictingTask.end_time).getTime()
          proposedStartTime = new Date(conflictTaskEnd + 10 * 1000)
          description = `Rescheduled to 10 seconds after "${conflictingTask.name}" (conflict avoided)`
        } else {
          // Fallback: move forward by 30 seconds
          proposedStartTime = new Date(proposedStartTime.getTime() + 30 * 1000)
          description = "Rescheduled to avoid conflicts"
        }
        attempts++
      }
    }
    
    if (!slotFound) {
      // Fallback: schedule way in the future
      proposedStartTime = new Date(now.getTime() + 5 * 60 * 1000) // 5 minutes from now
      description = "Scheduled 5 minutes from now (couldn't find earlier slot)"
    }
    
    const endTime = new Date(proposedStartTime.getTime() + taskDuration)
    return { startTime: proposedStartTime, endTime, description }
  }

  const handleAddQuickTask = async () => {
    try {
      setLoading(true)
      
      const { startTime, endTime, description } = await findOptimalTaskSlot()
      
      const newTask = await internalDB.addTaskWithDuration(
        `Quick Test ${new Date().toLocaleTimeString()}`,
        startTime.toISOString(),
        endTime.toISOString()
      )
      
      await loadTasks()
      await loadActions()
      
      const timeUntilStart = Math.round((startTime.getTime() - new Date().getTime()) / 1000)
      
      Alert.alert(
        'Task Created!',
        `"${newTask.name}" will start in ${timeUntilStart} seconds and run for 15 seconds.\n\n${description}`,
        [{ text: 'OK' }]
      )
    } catch (error: any) {
      console.error('Error creating task:', error)
      Alert.alert('Error', `Failed to create task: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleClearTasks = async () => {
    Alert.alert(
      'Clear All Tasks',
      'This will delete all tasks from the internal database. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true)
              await internalDB.clearAllTasks()
              await loadTasks()
              await loadActions()
              Alert.alert('Success', 'All tasks cleared from internal database.')
            } catch (error: any) {
              console.error('Error clearing tasks:', error)
              Alert.alert('Error', `Failed to clear tasks: ${error.message}`)
            } finally {
              setLoading(false)
            }
          }
        }
      ]
    )
  }

  const handleResetStaleTasks = async () => {
    Alert.alert(
      'Reset Stale Tasks',
      'This will reset any in-progress tasks that have expired back to pending status.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: async () => {
            try {
              setLoading(true)
              const allTasks = await internalDB.getAllTasks()
              const now = new Date().getTime()
              let resetCount = 0
              
              for (const task of allTasks) {
                if (task.status === 'in_progress' && task.end_time) {
                  const taskEnd = new Date(task.end_time).getTime()
                  if (now > taskEnd) {
                    await internalDB.updateTask(task.id, { status: 'pending' })
                    resetCount++
                  }
                }
              }
              
              await loadTasks()
              Alert.alert('Success', `Reset ${resetCount} stale tasks to pending status.`)
            } catch (error: any) {
              console.error('Error resetting stale tasks:', error)
              Alert.alert('Error', `Failed to reset tasks: ${error.message}`)
            } finally {
              setLoading(false)
            }
          }
        }
      ]
    )
  }

  const handleClearActions = async () => {
    Alert.alert(
      'Clear All Actions',
      'This will delete all actions from the internal database. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true)
              await internalDB.clearAllActions()
              await loadActions()
              Alert.alert('Success', 'All actions cleared from internal database.')
            } catch (error: any) {
              console.error('Error clearing actions:', error)
              Alert.alert('Error', `Failed to clear actions: ${error.message}`)
            } finally {
              setLoading(false)
            }
          }
        }
      ]
    )
  }


  const handleTestDatabaseAccess = async () => {
    try {
      setLoading(true)
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Not authenticated')
        return
      }
      
      console.log('Testing database access...')
      
      // Test 1: Check skedai.model table
      const { data: modelData, error: modelError } = await supabase
        .schema('skedai')
        .from('model')
        .select('*')
        .limit(1)
      
      console.log('skedai.model access:', { data: modelData, error: modelError })
      
      // Test 2: Check skedai.user_timeline table
      const { data: userTimelineData, error: userTimelineError } = await supabase
        .schema('skedai')
        .from('user_timeline')
        .select('*')
        .limit(1)
      
      console.log('skedai.user_timeline access:', { data: userTimelineData, error: userTimelineError })
      
      // Test 3: Check auth.users table
      const { data: authUsersData, error: authUsersError } = await supabase
        .from('auth.users')
        .select('*')
        .limit(5)
      
      console.log('auth.users access:', { data: authUsersData, error: authUsersError })
      
      // Test 4: Get current user info
      const { data: { user: currentUser }, error: currentUserError } = await supabase.auth.getUser()
      console.log('Current authenticated user:', { user: currentUser?.id, email: currentUser?.email, error: currentUserError })
      
      Alert.alert(
        'Database Test Complete',
        'Check console for results. Look for access permissions and table structures.'
      )
    } catch (error: any) {
      console.error('Database test error:', error)
      Alert.alert('Error', `Database test failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleListModels = async () => {
    try {
      setLoading(true)
      
      console.log('Listing available models...')
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Authentication Error', 'You need to be signed in to list models.')
        return
      }
      
      // List models from skedai.model table
      const { data: modelData, error: modelError } = await supabase
        .schema('skedai')
        .from('model')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      console.log('Models response - data:', modelData, 'error:', modelError)
      
      if (modelError) {
        console.error('Model listing error:', modelError)
        throw new Error(`Failed to list models: ${modelError.message} (Code: ${modelError.code})`)
      }
      
      Alert.alert(
        'Available Models',
        modelData && modelData.length > 0 
          ? `Found ${modelData.length} models. Check console for details.`
          : 'No models found for your user.',
        [{ text: 'OK' }]
      )
    } catch (error: any) {
      console.error('Error listing models:', error)
      Alert.alert('Error', `Failed to list models: ${error.message || error.toString() || 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateLocalTimeline = async () => {
    try {
      setLoading(true)
      
      console.log('Creating local timeline simulation...')
      
      const now = new Date()
      const sampleTimeline: TimelineData = {
        tasks: [
          {
            name: "Morning Workout",
            start_time: new Date(now.getTime() + 30 * 1000).toISOString(),
            end_time: new Date(now.getTime() + 60 * 1000).toISOString(),
            duration: 30
          },
          {
            name: "Breakfast",
            start_time: new Date(now.getTime() + 90 * 1000).toISOString(),
            end_time: new Date(now.getTime() + 120 * 1000).toISOString(),
            duration: 30
          },
          {
            name: "Work Session",
            start_time: new Date(now.getTime() + 150 * 1000).toISOString(),
            end_time: new Date(now.getTime() + 210 * 1000).toISOString(),
            duration: 60
          }
        ],
        created_at: now.toISOString(),
        description: "Sample timeline created locally (simulating server timeline)"
      }
      
      // Store timeline data in AsyncStorage directly with a special key
      const timelineKey = `timeline_data_${now.getTime()}`
      await AsyncStorage.setItem(timelineKey, JSON.stringify(sampleTimeline))
      
      console.log('Timeline stored locally with key:', timelineKey)
      
      Alert.alert(
        'Local Timeline Created!',
        `Sample timeline with ${sampleTimeline.tasks.length} tasks has been stored locally. Use "Import Local Timeline" to load it.`,
        [{ text: 'OK' }]
      )
      
      await loadTasks()
      await loadActions()
    } catch (error: any) {
      console.error('Error creating local timeline:', error)
      Alert.alert('Error', `Failed to create local timeline: ${error.message || error.toString() || 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleListTimelines = async () => {
    try {
      setLoading(true)
      
      console.log('Listing available timelines...')
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Authentication Error', 'You need to be signed in to list timelines.')
        return
      }
      
      // List timelines from skedai.user_timeline table
      const { data: timelineData, error: timelineError } = await supabase
        .schema('skedai')
        .from('user_timeline')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      console.log('Timelines response - data:', timelineData, 'error:', timelineError)
      
      if (timelineError) {
        console.error('Timeline listing error:', timelineError)
        throw new Error(`Failed to list timelines: ${timelineError.message} (Code: ${timelineError.code})`)
      }
      
      Alert.alert(
        'Available Timelines',
        timelineData && timelineData.length > 0 
          ? `Found ${timelineData.length} timelines. Check console for details.`
          : 'No timelines found for your user.',
        [{ text: 'OK' }]
      )
    } catch (error: any) {
      console.error('Error listing timelines:', error)
      Alert.alert('Error', `Failed to list timelines: ${error.message || error.toString() || 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }


  const handleImportLocalTimeline = async () => {
    try {
      setLoading(true)
      
      console.log('Looking for local timeline data...')
      
      // Find timeline data stored in AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys()
      const timelineKeys = allKeys.filter(key => key.startsWith('timeline_data_'))
      
      if (timelineKeys.length === 0) {
        Alert.alert('No Timeline Found', 'No local timeline data found. Create a local timeline first.')
        return
      }
      
      // Get the most recent timeline (highest timestamp)
      const latestTimelineKey = timelineKeys.sort().pop()!
      const timelineDataStr = await AsyncStorage.getItem(latestTimelineKey)
      
      if (!timelineDataStr) {
        Alert.alert('Error', 'Could not load timeline data.')
        return
      }
      
      const timelineData = JSON.parse(timelineDataStr) as TimelineData
      console.log('Found timeline data:', timelineData)
      
      // Import each task from the timeline into the local database
      let importedCount = 0
      for (const timelineTaskData of timelineData.tasks) {
        await internalDB.addTaskWithDuration(
          timelineTaskData.name,
          timelineTaskData.start_time,
          timelineTaskData.end_time
        )
        importedCount++
      }
      
      await loadTasks()
      await loadActions()
      
      Alert.alert(
        'Local Timeline Imported!',
        `Successfully imported ${importedCount} tasks from the local timeline into your active schedule.`,
        [{ text: 'OK' }]
      )
    } catch (error: any) {
      console.error('Error importing local timeline:', error)
      Alert.alert('Error', `Failed to import local timeline: ${error.message || error.toString() || 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleImportTimeline = async () => {
    try {
      setLoading(true)
      
      // Fetch the latest timeline from the database
      const { data, error } = await supabase
        .schema('skedai')
        .from('user_timeline')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (error) {
        throw error
      }
      
      if (!data || data.length === 0) {
        Alert.alert('No Timeline Found', 'No timeline data found in the database. Create a sample timeline first.')
        return
      }
      
      const timelineEntry = data[0]
      const timelineData = timelineEntry.timeline_json as TimelineData
      
      // Clear existing tasks before importing new timeline
      console.log('Clearing existing tasks before timeline import...')
      await internalDB.clearAllTasks()
      
      // Import each task from the timeline into the local database
      let importedCount = 0
      for (const timelineTask of timelineData.tasks) {
        await internalDB.addTaskWithDuration(
          timelineTask.name,
          timelineTask.start_time,
          timelineTask.end_time
        )
        importedCount++
      }
      
      await loadTasks()
      await loadActions()
      
      // Force a small delay to ensure data is fully written before showing alert
      await new Promise(resolve => setTimeout(resolve, 500))
      
      Alert.alert(
        'Timeline Imported!',
        `Successfully imported ${importedCount} tasks from the timeline. Old tasks have been cleared and replaced with new timeline data.`,
        [{ text: 'OK' }]
      )
    } catch (error: any) {
      console.error('Error importing timeline:', error)
      Alert.alert('Error', `Failed to import timeline: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Local Task Testing</Text>
          <Text style={styles.sectionDescription}>
            Tools for testing task functionality with local data
          </Text>
          
          <TouchableOpacity 
            style={[styles.button, loading && styles.disabledButton]} 
            onPress={handleAddQuickTask}
            disabled={loading}
          >
            <FontAwesome name="plus" size={16} color="#fff" />
            <Text style={styles.buttonText}>
              {loading ? 'Creating...' : 'Add Test Task'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, loading && styles.disabledButton]} 
            onPress={handleCreateLocalTimeline}
            disabled={loading}
          >
            <FontAwesome name="calendar-plus-o" size={16} color="#fff" />
            <Text style={styles.buttonText}>
              {loading ? 'Creating...' : 'Create Sample Timeline'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton, loading && styles.disabledButton]} 
            onPress={handleImportLocalTimeline}
            disabled={loading}
          >
            <FontAwesome name="download" size={16} color="#666" />
            <Text style={styles.secondaryButtonText}>
              {loading ? 'Importing...' : 'Import Sample Timeline'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Server Data (Read-Only)</Text>
          <Text style={styles.sectionDescription}>
            View and import timeline data from the server database
          </Text>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton, loading && styles.disabledButton]} 
            onPress={handleListTimelines}
            disabled={loading}
          >
            <FontAwesome name="list" size={16} color="#666" />
            <Text style={styles.secondaryButtonText}>
              {loading ? 'Loading...' : 'View Server Timelines'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton, loading && styles.disabledButton]} 
            onPress={handleImportTimeline}
            disabled={loading}
          >
            <FontAwesome name="cloud-download" size={16} color="#666" />
            <Text style={styles.secondaryButtonText}>
              {loading ? 'Importing...' : 'Import Server Timeline'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton, loading && styles.disabledButton]} 
            onPress={handleListModels}
            disabled={loading}
          >
            <FontAwesome name="cube" size={16} color="#666" />
            <Text style={styles.secondaryButtonText}>
              {loading ? 'Loading...' : 'View Available Models'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          <Text style={styles.sectionDescription}>
            Tools for managing local task data and testing
          </Text>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton, loading && styles.disabledButton]} 
            onPress={handleClearTasks}
            disabled={loading}
          >
            <FontAwesome name="trash" size={16} color="#666" />
            <Text style={styles.secondaryButtonText}>
              {loading ? 'Clearing...' : 'Clear All Local Tasks'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton, loading && styles.disabledButton]} 
            onPress={handleResetStaleTasks}
            disabled={loading}
          >
            <FontAwesome name="refresh" size={16} color="#666" />
            <Text style={styles.secondaryButtonText}>
              {loading ? 'Resetting...' : 'Reset Stale Tasks'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton, loading && styles.disabledButton]} 
            onPress={handleTestDatabaseAccess}
            disabled={loading}
          >
            <FontAwesome name="database" size={16} color="#666" />
            <Text style={styles.secondaryButtonText}>
              {loading ? 'Testing...' : 'Test Database Connection'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debug Info</Text>
          <Text style={styles.sectionDescription}>
            Current development status and information
          </Text>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Environment</Text>
            <Text style={styles.infoText}>• Development Mode</Text>
            <Text style={styles.infoText}>• Expo Go Client</Text>
            <Text style={styles.infoText}>• React Native</Text>
          </View>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Features Status</Text>
            <Text style={styles.infoText}>✅ Task Display</Text>
            <Text style={styles.infoText}>✅ Real-time Countdown</Text>
            <Text style={styles.infoText}>✅ Background Detection</Text>
            <Text style={styles.infoText}>✅ Quick Task Creation</Text>
            <Text style={styles.infoText}>✅ Internal Database</Text>
          </View>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Internal Database Status</Text>
            <Text style={styles.infoText}>Total Tasks: {tasks.length}</Text>
            <Text style={styles.infoText}>Total Actions: {actions.length}</Text>
            {tasks.length > 0 && (
              <>
                <Text style={styles.infoText}>Latest: {tasks[tasks.length - 1]?.name}</Text>
                <Text style={styles.infoText}>
                  Created: {new Date(tasks[tasks.length - 1]?.created_at).toLocaleTimeString()}
                </Text>
              </>
            )}
            {tasks.length === 0 && (
              <Text style={styles.infoText}>No tasks in database</Text>
            )}
          </View>
        </View>

        {/* Auto Timeline Import Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Auto Timeline Import</Text>
          <Text style={styles.sectionDescription}>
            Automatically import timeline data every 5 minutes
          </Text>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Import Status</Text>
            <View style={styles.statusRow}>
              <Text style={styles.infoText}>Auto-import: </Text>
              <Text style={[styles.statusText, autoImportEnabled ? styles.statusEnabled : styles.statusDisabled]}>
                {autoImportEnabled ? 'ENABLED' : 'DISABLED'}
              </Text>
            </View>
            {lastImportTime && (
              <Text style={styles.infoText}>
                Last import: {lastImportTime.toLocaleTimeString()}
              </Text>
            )}
            {nextImportTime && (
              <Text style={styles.infoText}>
                Next import: {nextImportTime.toLocaleTimeString()} 
                {' '}({Math.round((nextImportTime.getTime() - new Date().getTime()) / 1000 / 60)}m)
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => setAutoImportEnabled(!autoImportEnabled)}
          >
            <FontAwesome 
              name={autoImportEnabled ? "pause" : "play"} 
              size={16} 
              color="#666" 
            />
            <Text style={styles.secondaryButtonText}>
              {autoImportEnabled ? 'Disable Auto-Import' : 'Enable Auto-Import'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, loading && styles.disabledButton]}
            onPress={performAutoImport}
            disabled={loading}
          >
            <FontAwesome name="refresh" size={16} color="#fff" />
            <Text style={styles.buttonText}>
              {loading ? 'Importing...' : 'Import Now'}
            </Text>
          </TouchableOpacity>

          {importHistory.length > 0 && (
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Recent Imports</Text>
              {importHistory.slice(0, 3).map((entry, index) => (
                <View key={index} style={styles.historyEntry}>
                  <Text style={[styles.historyTime, entry.success ? styles.successText : styles.errorText]}>
                    {entry.timestamp.toLocaleTimeString()}
                  </Text>
                  <Text style={[styles.historyMessage, entry.success ? styles.successText : styles.errorText]}>
                    {entry.success ? '✅' : '❌'} {entry.message}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Notification Debug Panel */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Debug Panel</Text>
          <Text style={styles.sectionDescription}>
            Monitor and test notification system
          </Text>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Notification Status</Text>
            <View style={styles.statusRow}>
              <Text style={styles.infoText}>Permission: </Text>
              <Text style={[
                styles.statusText,
                notificationPermission === 'granted' ? styles.statusEnabled : styles.statusDisabled
              ]}>
                {notificationPermission.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.infoText}>
              Scheduled notifications: {scheduledNotifications.length}
            </Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.smallButton]}
              onPress={() => scheduleTestNotification(0)}
            >
              <Text style={styles.buttonText}>Test Now</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, styles.smallButton]}
              onPress={() => scheduleTestNotification(10)}
            >
              <Text style={styles.buttonText}>Test 10s</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, styles.smallButton]}
              onPress={() => scheduleTestNotification(60)}
            >
              <Text style={styles.buttonText}>Test 1m</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={checkNotificationPermissions}
          >
            <FontAwesome name="refresh" size={16} color="#666" />
            <Text style={styles.secondaryButtonText}>Refresh Status</Text>
          </TouchableOpacity>

          {scheduledNotifications.length > 0 && (
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Scheduled Notifications</Text>
              {scheduledNotifications.slice(0, 5).map((notification, index) => (
                <View key={index} style={styles.notificationEntry}>
                  <Text style={styles.notificationTitle}>
                    {notification.content?.title || 'No title'}
                  </Text>
                  <Text style={styles.notificationTime}>
                    {notification.trigger?.type === 'timeInterval' 
                      ? `In ${notification.trigger.seconds}s`
                      : notification.trigger?.date 
                      ? new Date(notification.trigger.date).toLocaleTimeString()
                      : 'Immediate'
                    }
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Action History</Text>
          <Text style={styles.sectionDescription}>
            All user actions tracked in the internal database
          </Text>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton, loading && styles.disabledButton]} 
            onPress={handleClearActions}
            disabled={loading}
          >
            <FontAwesome name="trash" size={16} color="#666" />
            <Text style={styles.secondaryButtonText}>
              {loading ? 'Clearing...' : 'Clear All Actions'}
            </Text>
          </TouchableOpacity>
          
          <View style={styles.actionsContainer}>
            {actions.length > 0 ? (
              actions.slice(0, 10).map((action) => (
                <View key={action.id} style={styles.actionCard}>
                  <View style={styles.actionHeader}>
                    <Text style={styles.actionType}>
                      {action.action_type.replace('_', ' ').toUpperCase()}
                    </Text>
                    <Text style={styles.actionTime}>
                      {new Date(action.timestamp).toLocaleTimeString()}
                    </Text>
                  </View>
                  <Text style={styles.actionTaskName}>{action.task_name}</Text>
                  {action.details && (
                    <Text style={styles.actionDetails}>{action.details}</Text>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.noActionsText}>No actions recorded yet</Text>
            )}
            {actions.length > 10 && (
              <Text style={styles.moreActionsText}>
                ... and {actions.length - 10} more actions
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  button: {
    backgroundColor: Colors.light.tint,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    lineHeight: 20,
  },
  disabledButton: {
    opacity: 0.6,
  },
  actionsContainer: {
    marginTop: 16,
  },
  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionType: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#007AFF',
    textTransform: 'uppercase',
  },
  actionTime: {
    fontSize: 11,
    color: '#999',
  },
  actionTaskName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  actionDetails: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  noActionsText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
    padding: 20,
  },
  moreActionsText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusEnabled: {
    color: '#4CAF50',
  },
  statusDisabled: {
    color: '#f44336',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  smallButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  historyEntry: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  historyTime: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  historyMessage: {
    fontSize: 12,
  },
  successText: {
    color: '#4CAF50',
  },
  errorText: {
    color: '#f44336',
  },
  notificationEntry: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
    color: '#333',
  },
  notificationTime: {
    fontSize: 12,
    color: '#666',
  },
})