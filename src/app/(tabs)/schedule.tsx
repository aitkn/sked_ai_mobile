import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  AppState,
  Animated,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Text } from '@/components/Themed'
import { Task } from '@/lib/offline/database'
import Colors from '@/constants/Colors'
import { FontAwesome } from '@expo/vector-icons'
import ThemedIcon from '@/components/ThemedIcon'
import { useTheme } from '@/contexts/ThemeContext'
import { ExpoNotificationService } from '@/lib/notifications/expo-notifications'
import * as Notifications from 'expo-notifications'
import * as Speech from 'expo-speech'
import { internalDB, InternalTask, InternalDB } from '@/lib/internal-db'
import { supabase } from '@/lib/supabase'
import { useFocusEffect } from 'expo-router'
import { GlassMorphism } from '@/components/GlassMorphism'
import { ThemedGradient } from '@/components/ThemedGradient'
import { assistantService } from '@/lib/llm/AssistantService'
import { syncTasksFromSupabase } from '@/lib/sync/TaskSyncService'
import { ChatAssistant } from '@/components/ChatAssistant'

// Configure notification handler for Expo
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

// Screen dimensions available if needed
// const { width: SCREEN_WIDTH } = Dimensions.get('window')

// Task timing granularity in seconds (10 for debugging, 300 for production)
const TASK_GRANULARITY = 600 // 10 seconds for debugging, change to 300 (5 minutes) for production
const HALF_GRANULARITY = TASK_GRANULARITY / 2 // Half granularity window


// Helper function to convert InternalTask to Task format
const convertInternalTaskToTask = (internalTask: InternalTask): Task => ({
  id: internalTask.id,
  local_id: internalTask.id,
  user_id: 'internal_user',
  name: internalTask.name,
  status: internalTask.status as any, // Convert to Task status type
  start_time: internalTask.start_time,
  end_time: internalTask.end_time,
  completed_at: internalTask.completed_at,
  priority: internalTask.priority,
  sync_status: 'synced',
  created_at: internalTask.created_at,
  updated_at: internalTask.updated_at,
})

export default function ScheduleScreen() {
  const { actualTheme, colors } = useTheme()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [internalTasks, setInternalTasks] = useState<Task[]>([])
  const [alertedTasks, setAlertedTasks] = useState<Set<string>>(new Set())
  const [appState, setAppState] = useState(AppState.currentState)
  const [justCompletedTask, setJustCompletedTask] = useState<Task | null>(null)
  const [showTaskInput, setShowTaskInput] = useState(false)
  const [taskInputText, setTaskInputText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showProcessingIndicator, setShowProcessingIndicator] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuTask, setContextMenuTask] = useState<Task | null>(null)
  const timerRef = useRef<NodeJS.Timeout | number | null>(null)
  const fadeAnim = useRef(new Animated.Value(1)).current
  const expoNotificationService = useRef(new ExpoNotificationService()).current
  const syncIntervalRef = useRef<NodeJS.Timeout | number | null>(null)

  // Load internal tasks when component mounts and set up frequent refresh
  useEffect(() => {
    loadInternalTasks()
    loadTimelineData() // Also load timeline data on startup
    // Refresh internal tasks every 1 second for immediate updates
    const interval = setInterval(loadInternalTasks, 1000)
    return () => {
      clearInterval(interval)
      // Clean up sync interval on unmount
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
        syncIntervalRef.current = null
      }
    }
  }, [])

  // Refresh tasks when app comes to foreground (to pick up notification actions)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        // Refresh immediately when app becomes active to show notification changes
        loadInternalTasks()
      }
    })
    return () => subscription.remove()
  }, [])

  // Refresh tasks when screen comes into focus (when user navigates to this tab)
  useFocusEffect(
    useCallback(() => {
      loadInternalTasks()
    }, [])
  )

  // Real-time subscription to listen for timeline updates from the processor
  useEffect(() => {
    console.log('🔗 Setting up real-time subscription for timeline updates...')
    
    const channel = supabase
      .channel('timeline-updates')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for INSERT, UPDATE, DELETE
          schema: 'skedai',
          table: 'user_timeline'
        },
        (payload) => {
          console.log('📡 Timeline update detected via real-time:', payload)
          console.log('📡 Event type:', payload.eventType)
          console.log('📡 New timeline data:', payload.new)
          
          // When timeline is updated by processor, refresh the UI
          loadTimelineData()
        }
      )
      .on(
        'broadcast',
        { event: 'timeline_update' },
        (payload) => {
          console.log('📡 Timeline broadcast received:', payload)
          // Reload tasks when timeline is updated by processor
          loadTimelineData()
        }
      )
      .subscribe((status) => {
        console.log('📡 Real-time subscription status:', status)
      })

    // Cleanup subscription when component unmounts
    return () => {
      console.log('🔌 Cleaning up real-time subscription...')
      supabase.removeChannel(channel)
    }
  }, [])


  const loadTimelineData = async () => {
    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        console.log('📡 No authenticated user, skipping timeline fetch')
        return
      }

      console.log('📡 Fetching timeline for user:', user.id)
      
      // Fetch the latest timeline for the current user
      const { data: timeline, error } = await supabase
        .schema('skedai')
        .from('user_timeline')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        console.log('📡 No timeline found or error:', error.message)
        // No timeline found - clear all existing tasks to show empty schedule
        console.log('📡 No timeline found, clearing all existing tasks...')
        await internalDB.clearAllTasks()
        // Reload internal tasks to show updated (empty) data
        loadInternalTasks()
        return
      }

      if (timeline && timeline.timeline_json) {
        console.log('📡 Timeline found, processing tasks with category-based sync...')
        
        // Extract tasks from timeline_json
        const timelineTasks = timeline.timeline_json.tasks || []
        await syncTasksWithTimeline(timelineTasks)
        
        console.log(`📡 Processed ${timelineTasks.length} tasks from timeline`)
      } else {
        // No timeline found - clear all existing tasks
        console.log('📡 No timeline found, clearing all existing tasks...')
        await internalDB.clearAllTasks()
      }
      
      // Reload internal tasks to show updated data
      loadInternalTasks()
      
    } catch (error) {
      console.error('📡 Error loading timeline data:', error)
    }
  }

  // Enhanced category-based task synchronization
  const syncTasksWithTimeline = async (timelineTasks: any[]) => {
    console.log('🔄 Starting category-based task sync...')
    
    // 1. Get current tasks and categorize them by status
    const currentTasks = await internalDB.getAllTasks()
    const tasksByCategory = {
      started: currentTasks.filter(t => t.status === 'in_progress'),
      completed: currentTasks.filter(t => t.status === 'completed'),
      pending: currentTasks.filter(t => t.status === 'pending')
    }
    
    console.log('📊 Current task categories:', {
      started: tasksByCategory.started.length,
      completed: tasksByCategory.completed.length,
      pending: tasksByCategory.pending.length,
      total: currentTasks.length
    })
    
    // 2. Create timeline task ID mapping for quick lookup
    const timelineTaskMap = new Map(
      timelineTasks.map(t => [
        t.id || t.task_id || `timeline-${Date.now()}-${Math.random()}`, 
        t
      ])
    )
    const timelineTaskIds = new Set(timelineTaskMap.keys())
    
    console.log('📋 Timeline tasks to sync:', timelineTaskIds.size)
    
    // 3. Process each category intelligently
    
    // STARTED TASKS: Preserve status, update timeline data if task still exists
    console.log('🚀 Processing started tasks...')
    for (const startedTask of tasksByCategory.started) {
      if (timelineTaskMap.has(startedTask.id)) {
        const timelineData = timelineTaskMap.get(startedTask.id)!
        const updatedTask = {
          ...startedTask,
          name: timelineData.name || timelineData.title || startedTask.name,
          start_time: timelineData.start_time || startedTask.start_time,
          end_time: timelineData.end_time || startedTask.end_time,
          updated_at: new Date().toISOString(),
          // Preserve critical user state
          status: 'in_progress' as const,
          completed_at: startedTask.completed_at
        }
        await internalDB.saveTask(updatedTask)
        console.log(`✅ Updated started task: ${updatedTask.name}`)
      } else {
        // Started task no longer in timeline - keep it but log warning
        console.log(`⚠️ Started task not in timeline, preserving: ${startedTask.name}`)
      }
    }
    
    // COMPLETED TASKS: Preserve if still in timeline, otherwise keep for history
    console.log('✅ Processing completed tasks...')
    for (const completedTask of tasksByCategory.completed) {
      if (timelineTaskMap.has(completedTask.id)) {
        const timelineData = timelineTaskMap.get(completedTask.id)!
        const updatedTask = {
          ...completedTask,
          name: timelineData.name || timelineData.title || completedTask.name,
          start_time: timelineData.start_time || completedTask.start_time,
          end_time: timelineData.end_time || completedTask.end_time,
          updated_at: new Date().toISOString(),
          // Preserve completion state
          status: 'completed' as const,
          completed_at: completedTask.completed_at
        }
        await internalDB.saveTask(updatedTask)
        console.log(`✅ Updated completed task: ${updatedTask.name}`)
      } else {
        // Completed task no longer in timeline - preserve for history
        console.log(`📚 Completed task not in timeline, preserving for history: ${completedTask.name}`)
      }
    }
    
    // PENDING TASKS: Update with new timeline data or remove if not present
    console.log('⏳ Processing pending tasks...')
    for (const pendingTask of tasksByCategory.pending) {
      if (timelineTaskMap.has(pendingTask.id)) {
        const timelineData = timelineTaskMap.get(pendingTask.id)!
        const updatedTask = {
          ...pendingTask,
          name: timelineData.name || timelineData.title || pendingTask.name,
          start_time: timelineData.start_time || pendingTask.start_time,
          end_time: timelineData.end_time || pendingTask.end_time,
          updated_at: new Date().toISOString(),
          status: 'pending' as const
        }
        await internalDB.saveTask(updatedTask)
        console.log(`⏳ Updated pending task: ${updatedTask.name}`)
      } else {
        // Pending task no longer in timeline - safe to remove
        console.log(`🗑️ Removing pending task not in timeline: ${pendingTask.name}`)
        await internalDB.deleteTask(pendingTask.id)
      }
    }
    
    // 4. Add new tasks from timeline that don't exist in any category
    console.log('➕ Adding new tasks from timeline...')
    const existingTaskIds = new Set(currentTasks.map(t => t.id))
    
    for (const [taskId, timelineTask] of Array.from(timelineTaskMap)) {
      if (!existingTaskIds.has(taskId)) {
        // Check if task was deleted before adding it back
        const isDeleted = await internalDB.isTaskDeleted(taskId)
        if (isDeleted) {
          console.log(`⏭️ Skipping deleted task from timeline: ${timelineTask.name || taskId}`)
          continue
        }
        
        const newTask = {
          id: taskId,
          name: timelineTask.name || timelineTask.title || 'Unnamed Task',
          status: 'pending' as const,
          priority: timelineTask.priority || 'medium' as const,
          start_time: timelineTask.start_time,
          end_time: timelineTask.end_time,
          duration: timelineTask.duration || InternalDB.calculateDuration(timelineTask.start_time, timelineTask.end_time),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        await internalDB.saveTask(newTask)
        console.log(`➕ Added new task: ${newTask.name} with start time: ${new Date(newTask.start_time).toLocaleString()}`)
      }
    }
    
    console.log('✅ Category-based task sync completed')
  }

  const loadInternalTasks = async () => {
    try {
      const allInternalTasks = await internalDB.getAllTasks()
      
      // Clean up stale tasks on startup
      const now = new Date().getTime()
      const cleanedTasks = await Promise.all(
        allInternalTasks.map(async (task) => {
          // If task is in_progress but its end time has passed by more than 1 minute, reset it to pending
          if (task.status === 'in_progress' && task.end_time) {
            const taskEnd = new Date(task.end_time).getTime()
            const timeSinceEnd = now - taskEnd
            
            // If task ended more than 1 minute ago, reset to pending
            if (timeSinceEnd > 60000) {
              console.log(`🧹 Cleaning up stale task: ${task.name} (ended ${Math.round(timeSinceEnd / 1000)}s ago)`)
              await internalDB.updateTask(task.id, { status: 'pending' })
              return { ...task, status: 'pending' as const }
            }
          }
          return task
        })
      )
      
      const convertedTasks = cleanedTasks.map(convertInternalTaskToTask)
      setInternalTasks(convertedTasks)
    } catch (error) {
      console.error('Error loading internal tasks:', error)
      setInternalTasks([])
    }
  }

  // Helper function to check if notifications should be suppressed
  const shouldSuppressNotification = () => {
    return appState === 'active' // Don't send notifications if app is in foreground
  }


  // Initialize notification service and listen for interactions
  useEffect(() => {
    // Initialize Expo notifications
    expoNotificationService.initialize().then(() => {
      console.log('Expo notifications initialized successfully')
    }).catch(error => {
      console.error('Failed to initialize Expo notifications:', error)
    })

    // Set up notification categories with action buttons
    const setupNotificationCategories = async () => {
      try {
        // Test notification category
        await Notifications.setNotificationCategoryAsync('test_notification', [
          {
            identifier: 'open_app',
            buttonTitle: 'Take me back to the app',
            options: {
              opensAppToForeground: true,
            },
          },
          {
            identifier: 'ok_action',
            buttonTitle: 'OK',
            options: {
              opensAppToForeground: false,
            },
          },
        ])

        // Task start notification category
        await Notifications.setNotificationCategoryAsync('task_start', [
          {
            identifier: 'start_task',
            buttonTitle: 'Start Task',
            options: {
              opensAppToForeground: false, // Execute in background
            },
          },
          {
            identifier: 'dismiss',
            buttonTitle: 'Dismiss',
            options: {
              opensAppToForeground: false,
            },
          },
        ])

        // Task completion notification category
        await Notifications.setNotificationCategoryAsync('task_complete', [
          {
            identifier: 'complete_task',
            buttonTitle: 'Mark Complete',
            options: {
              opensAppToForeground: false, // Execute in background
            },
          },
          {
            identifier: 'keep_running',
            buttonTitle: 'Keep Running',
            options: {
              opensAppToForeground: false,
            },
          },
        ])
        console.log('Notification categories set up successfully')
      } catch (error) {
        console.error('Failed to set up notification categories:', error)
      }
    }

    setupNotificationCategories()

    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      console.log('Notification interaction:', response)
      console.log('Action identifier:', response.actionIdentifier)
      console.log('Notification content:', response.notification.request.content)
      
      const actionIdentifier = response.actionIdentifier
      const notificationTitle = response.notification.request.content.title
      
      if (actionIdentifier === 'open_app') {
        // User tapped "Take me back to the app" - just log it
        console.log(`User returned to app via notification: ${notificationTitle}`)
      } else if (actionIdentifier === 'ok_action') {
        // User tapped OK - just log it
        console.log(`User tapped OK on notification: ${notificationTitle}`)
      } else if (actionIdentifier === 'start_task') {
        const taskId = response.notification.request.content.data?.taskId as string
        console.log(`User pressed Start Task from notification for task: ${taskId}`)
        
        // Actually start the task
        if (taskId) {
          try {
            await internalDB.updateTask(taskId, { status: 'in_progress' })
            // Log the start action
            const task = await internalDB.getTaskById(taskId)
            if (task) {
              await internalDB.addAction({
                action_type: 'task_started',
                task_id: taskId,
                task_name: task.name,
                details: `Started via notification at ${new Date().toLocaleTimeString()}`
              })
            }
            console.log(`✅ Started task via notification: ${taskId}`)
            
            // Send confirmation notification
            setTimeout(async () => {
              try {
                if (!shouldSuppressNotification()) {
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: '✅ Task Started',
                      body: task ? `"${task.name}" is now running` : 'Task started successfully',
                      data: { type: 'confirmation' },
                    },
                    trigger: null,
                  })
                }
              } catch (error) {
                console.error('Error sending start confirmation:', error)
              }
            }, 500)
          } catch (error) {
            console.error('❌ Error starting task from notification:', error)
            // Send error notification
            setTimeout(async () => {
              try {
                if (!shouldSuppressNotification()) {
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: '❌ Failed to Start Task',
                      body: 'Please try again from the app',
                      data: { type: 'error' },
                    },
                    trigger: null,
                  })
                }
              } catch {}
            }, 500)
          }
        }
      } else if (actionIdentifier === 'complete_task') {
        const taskId = response.notification.request.content.data?.taskId as string
        console.log(`User pressed Mark Complete from notification for task: ${taskId}`)
        
        // Actually complete the task
        if (taskId) {
          try {
            const completedAt = new Date().toISOString()
            await internalDB.updateTask(taskId, { 
              status: 'completed', 
              completed_at: completedAt 
            })
            // Log the completion action
            const task = await internalDB.getTaskById(taskId)
            if (task) {
              await internalDB.addAction({
                action_type: 'task_completed',
                task_id: taskId,
                task_name: task.name,
                details: `Completed via notification at ${new Date().toLocaleTimeString()}`
              })
            }
            console.log(`✅ Completed task via notification: ${taskId}`)
            
            // Send confirmation notification
            setTimeout(async () => {
              try {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: '🎉 Task Completed',
                    body: task ? `"${task.name}" finished!` : 'Task completed successfully',
                    data: { type: 'confirmation' },
                  },
                  trigger: null,
                })
              } catch (error) {
                console.error('Error sending completion confirmation:', error)
              }
            }, 500)
          } catch (error) {
            console.error('❌ Error completing task from notification:', error)
            // Send error notification
            setTimeout(async () => {
              try {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: '❌ Failed to Complete Task',
                    body: 'Please try again from the app',
                    data: { type: 'error' },
                  },
                  trigger: null,
                })
              } catch {}
            }, 500)
          }
        }
      } else if (actionIdentifier === 'dismiss' || actionIdentifier === 'keep_running') {
        // User dismissed or chose to keep running - just log it
        console.log(`User chose ${actionIdentifier} for notification: ${notificationTitle}`)
      } else {
        // Default tap (on notification body) - just log it
        console.log(`User tapped notification: ${notificationTitle}`)
      }
    })

    return () => subscription.remove()
  }, [])

  // Update current time every second
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  // Track app state and refresh tasks when coming to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      setAppState(nextAppState)
      // Refresh tasks when app comes to foreground  
      if (nextAppState === 'active') {
        loadInternalTasks()
      }
    })

    return () => {
      subscription.remove()
    }
  }, [])


  // Always use internal DB only - no fallback to sample tasks
  const tasks = internalTasks

  // Get all tasks with start times, sorted by start time
  const allTasksWithTimes = [...tasks]
    .filter(task => !task.deleted_at && task.start_time)
    .sort((a, b) => {
      const aTime = new Date(a.start_time!).getTime()
      const bTime = new Date(b.start_time!).getTime()
      return aTime - bTime
    })

  // Find current task (in progress tasks)
  const runningTask = allTasksWithTimes.find(task => {
    if (!task.start_time || !task.end_time) return false
    
    // Any task with 'in_progress' status should be considered running, regardless of scheduled time
    // This allows manually started tasks to appear in the current section immediately
    return task.status === 'in_progress'
  })
  
  // Current task is either the running task or just completed task for display
  const currentTask = justCompletedTask || runningTask

  // Sort tasks excluding completed and cancelled ones (for upcoming/next sections)
  const sortedTasks = allTasksWithTimes.filter(task => task.status !== 'completed' && task.status !== 'cancelled')

  const upcomingTasks = allTasksWithTimes.filter(task => {
    if (!task.start_time || task.status === 'completed' || task.status === 'cancelled') return false
    // Exclude tasks that are already running (in_progress) or paused
    if (task.status === 'in_progress' || task.status === 'paused') return false
    const startTime = new Date(task.start_time).getTime()
    const now = currentTime.getTime()
    return startTime > now
  })

  const nextTask = upcomingTasks[0]

  // Get paused tasks
  const pausedTasks = allTasksWithTimes.filter(task => task.status === 'paused')

  // Helper functions
  const formatTime = (time: { hours: number; minutes: number; seconds: number }) => {
    return `${time.hours.toString().padStart(2, '0')}:${time.minutes
      .toString()
      .padStart(2, '0')}:${time.seconds.toString().padStart(2, '0')}`
  }

  const formatTaskTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Format time until task starts with smart units
  const formatTimeUntil = (milliseconds: number) => {
    if (milliseconds <= 0) return 'Starting soon'
    
    const totalSeconds = Math.ceil(milliseconds / 1000)
    const totalMinutes = Math.ceil(totalSeconds / 60)
    const totalHours = Math.floor(totalMinutes / 60)
    
    // Less than 1 minute: show seconds
    if (totalSeconds < 60) {
      return `${totalSeconds}s`
    }
    
    // Less than 1 hour: show minutes only
    if (totalMinutes < 60) {
      return `${totalMinutes}m`
    }
    
    // 1 hour or more: show hours and remaining minutes
    const remainingMinutes = totalMinutes % 60
    if (remainingMinutes === 0) {
      return `${totalHours}h`
    }
    return `${totalHours}h ${remainingMinutes}m`
  }


  // Check if a task should be started now (within half-granularity of start time)
  const shouldTaskStartNow = (task: Task) => {
    if (!task.start_time || !task.end_time) return false
    const now = currentTime.getTime()
    const taskStart = new Date(task.start_time).getTime()
    const taskEnd = new Date(task.end_time).getTime()
    
    // Task should not be startable if:
    // 1. It's not within half-granularity window of start time
    // 2. It's already past end time (task window has passed)
    // 3. It's already in progress or completed
    if (taskEnd <= now) return false
    if (task.status === 'in_progress' || task.status === 'completed') return false
    
    // Ready to start if within half-granularity window (g/2) of start time
    const timeUntilStart = taskStart - now
    return timeUntilStart <= HALF_GRANULARITY * 1000
  }

  // Calculate time until next task
  const getTimeUntilNext = () => {
    if (!nextTask || !nextTask.start_time) {
      return { hours: 0, minutes: 0, seconds: 0, total: 0 }
    }

    const now = currentTime.getTime()
    const nextTime = new Date(nextTask.start_time).getTime()
    const diff = Math.max(0, nextTime - now)

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    return { hours, minutes, seconds, total: diff }
  }

  // Check if task is ready to complete (within half-granularity of end time)
  const isTaskReadyToComplete = (task: Task) => {
    if (!task || !task.end_time || task.status !== 'in_progress') return false
    const now = currentTime.getTime()
    const taskEnd = new Date(task.end_time).getTime()
    const timeUntilEnd = taskEnd - now
    
    // Ready to complete if within half-granularity window (g/2) of end time
    return timeUntilEnd <= HALF_GRANULARITY * 1000
  }

  // Get time remaining in current task
  const getCurrentTaskRemaining = () => {
    if (!currentTask || !currentTask.end_time) {
      return { hours: 0, minutes: 0, seconds: 0, total: 0, isOvertime: false, readyToComplete: false }
    }

    const now = currentTime.getTime()
    const endTime = new Date(currentTask.end_time).getTime()
    const diff = endTime - now
    const isOvertime = diff <= 0
    const readyToComplete = isTaskReadyToComplete(currentTask)

    // If task is overtime, show 0:00:00 but track that it's overtime
    if (isOvertime) {
      return { hours: 0, minutes: 0, seconds: 0, total: 0, isOvertime: true, readyToComplete: true }
    }

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    return { hours, minutes, seconds, total: diff, isOvertime: false, readyToComplete }
  }

  const timeUntilNext = getTimeUntilNext()
  const currentTaskRemaining = getCurrentTaskRemaining()

  // Check for task notifications (manual start only)
  useEffect(() => {
    // Send notifications when tasks are ready to start, but don't auto-start them
    if (nextTask && !runningTask) {
      const now = currentTime.getTime()
      const taskStart = new Date(nextTask.start_time!).getTime()
      const timeDiff = taskStart - now
      
      // Debug logging for notification timing
      if (Math.abs(timeDiff) < 15000) { // Log when within 15 seconds
        console.log(`🔔 Next task "${nextTask.name}" timing:`, {
          timeDiff: Math.round(timeDiff / 1000) + 's',
          isReady: taskStart <= now + 2000,
          inWindow: taskStart > now - 10000,
          alreadyAlerted: alertedTasks.has(nextTask.local_id),
          appState
        })
      }
      
      // Task is ready to start (within 10 seconds of start time, allowing 2s early trigger)
      if (taskStart <= now + 2000 && taskStart > now - 10000) {
        // Only notify once per task
        if (!alertedTasks.has(nextTask.local_id)) {
          console.log(`🚨 TRIGGERING start notification for: ${nextTask.name}`)
          setAlertedTasks(prev => new Set(prev).add(nextTask.local_id))
          
          // Send background notification only if app is not in foreground
          {
            // Check if app is in background before sending notification
            setTimeout(async () => {
              try {
                if (!shouldSuppressNotification()) {
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: `Time to Start: ${nextTask.name}`,
                      body: 'Tap to start your scheduled task!',
                      data: { taskId: nextTask.local_id, type: 'task_start' },
                      categoryIdentifier: 'task_start',
                    },
                    trigger: null,
                  })
                  console.log('✅ Task start notification sent for:', nextTask.name)
                }
              } catch (error) {
                console.error('❌ Task start notification failed:', error)
              }
            }, 100)
          }
        }
      }
    }

    // Check if current task has ended and send notification (but don't auto-complete)
    if (runningTask) {
      const now = currentTime.getTime()
      const taskEnd = new Date(runningTask.end_time!).getTime()
      
      // Task just ended (within 2 seconds) and we haven't alerted for this completion
      if (taskEnd <= now && taskEnd > now - 2000) {
        const completionKey = `${runningTask.local_id}_completion`
        if (!alertedTasks.has(completionKey)) {
          setAlertedTasks(prev => new Set(prev).add(completionKey))
          
          // Always send background notification, no in-app alerts
          {
            // App is in background - send completion notification
            setTimeout(async () => {
              try {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: `Task Time Ended: ${runningTask.name}`,
                    body: 'Time is up! Complete it when ready.',
                    data: { taskId: runningTask.local_id, type: 'task_complete' },
                    categoryIdentifier: 'task_complete',
                  },
                  trigger: null,
                })
                console.log('✅ Task completion notification sent')
              } catch (error) {
                console.error('❌ Task completion notification failed:', error)
              }
            }, 100)
          }
        }
      }
    }
  }, [runningTask, nextTask, currentTime, appState, alertedTasks])

  const handleStartTask = async (task: Task) => {
    // Update internal task status if it's from internal DB
    if (task.user_id === 'internal_user') {
      try {
        // Update in AsyncStorage first
        await internalDB.updateTask(task.local_id, { status: 'in_progress' })
        // Log the start action
        await internalDB.addAction({
          action_type: 'task_started',
          task_id: task.local_id,
          task_name: task.name,
          details: `Started at ${new Date().toLocaleTimeString()}`
        })
        // Then update local state
        setInternalTasks(prev => prev.map(t => 
          t.local_id === task.local_id 
            ? { ...t, status: 'in_progress' }
            : t
        ))
        console.log(`✅ Started task: ${task.name}`)
      } catch (error) {
        console.error('❌ Error starting task:', error)
      }
    }
    // Note: sampleTasks are static and don't need updates
  }

  const handleCompleteTask = async (task: Task) => {
    if (task.user_id === 'internal_user') {
      try {
        const completedAt = new Date().toISOString()
        const completedTask = { ...task, status: 'completed' as const, completed_at: completedAt }
        
        // Update database first
        await internalDB.updateTask(task.local_id, { 
          status: 'completed', 
          completed_at: completedAt 
        })
        
        // Log the completion action
        await internalDB.addAction({
          action_type: 'task_completed',
          task_id: task.local_id,
          task_name: task.name,
          details: `Completed at ${new Date().toLocaleTimeString()}`
        })
        
        // Update local state
        setInternalTasks(prev => prev.map(t => 
          t.local_id === task.local_id 
            ? { ...t, status: 'completed', completed_at: completedAt }
            : t
        ))
        
        // Show completed state for 2 seconds then fade away
        setJustCompletedTask(completedTask)
        
        setTimeout(() => {
          // Start fade out animation
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }).start(() => {
            // After fade out, hide completed task and reset animation
            setJustCompletedTask(null)
            fadeAnim.setValue(1)
          })
        }, 2000) // Show completed state for 2 seconds
        
        console.log(`✅ Manually completed task: ${task.name}`)
      } catch (error) {
        console.error('❌ Error completing task:', error)
      }
    }
  }

  const handlePauseTask = async (task: Task) => {
    if (task.user_id === 'internal_user') {
      try {
        const pausedAt = new Date().toISOString()
        
        // Update database first
        await internalDB.updateTask(task.local_id, { 
          status: 'paused', 
          paused_at: pausedAt 
        })
        
        // Log the pause action
        await internalDB.addAction({
          action_type: 'task_paused',
          task_id: task.local_id,
          task_name: task.name,
          details: `Paused at ${new Date().toLocaleTimeString()}`
        })
        
        // Update local state
        setInternalTasks(prev => prev.map(t => 
          t.local_id === task.local_id 
            ? { ...t, status: 'paused', paused_at: pausedAt }
            : t
        ))
        
        console.log(`⏸️ Paused task: ${task.name}`)
      } catch (error) {
        console.error('❌ Error pausing task:', error)
      }
    }
  }

  const handleCancelTask = async (task: Task) => {
    if (task.user_id === 'internal_user') {
      try {
        const cancelledAt = new Date().toISOString()
        
        // Update database first
        await internalDB.updateTask(task.local_id, { 
          status: 'cancelled', 
          cancelled_at: cancelledAt 
        })
        
        // Log the cancel action
        await internalDB.addAction({
          action_type: 'task_cancelled',
          task_id: task.local_id,
          task_name: task.name,
          details: `Cancelled at ${new Date().toLocaleTimeString()}`
        })
        
        // Update local state
        setInternalTasks(prev => prev.map(t => 
          t.local_id === task.local_id 
            ? { ...t, status: 'cancelled', cancelled_at: cancelledAt }
            : t
        ))
        
        console.log(`❌ Cancelled task: ${task.name}`)
      } catch (error) {
        console.error('❌ Error cancelling task:', error)
      }
    }
  }

  const handleResumeTask = async (task: Task) => {
    if (task.user_id === 'internal_user') {
      try {
        // Update database first
        await internalDB.updateTask(task.local_id, { 
          status: 'in_progress',
          paused_at: undefined // Clear pause timestamp
        })
        
        // Log the resume action
        await internalDB.addAction({
          action_type: 'task_resumed',
          task_id: task.local_id,
          task_name: task.name,
          details: `Resumed at ${new Date().toLocaleTimeString()}`
        })
        
        // Update local state
        setInternalTasks(prev => prev.map(t => 
          t.local_id === task.local_id 
            ? { ...t, status: 'in_progress', paused_at: undefined }
            : t
        ))
        
        console.log(`▶️ Resumed task: ${task.name}`)
      } catch (error) {
        console.error('❌ Error resuming task:', error)
      }
    }
  }

  const handleLongPress = (task: Task) => {
    // Show context menu for running or paused tasks
    if (task.status === 'in_progress' || task.status === 'paused') {
      setContextMenuTask(task)
      setShowContextMenu(true)
    }
  }

  const closeContextMenu = () => {
    setShowContextMenu(false)
    setContextMenuTask(null)
  }

  const handleContextMenuAction = async (action: 'complete' | 'pause' | 'cancel' | 'resume') => {
    if (!contextMenuTask) return
    
    closeContextMenu()
    
    switch (action) {
      case 'complete':
        await handleCompleteTask(contextMenuTask)
        break
      case 'pause':
        await handlePauseTask(contextMenuTask)
        break
      case 'cancel':
        await handleCancelTask(contextMenuTask)
        break
      case 'resume':
        await handleResumeTask(contextMenuTask)
        break
    }
  }

  const handleQuickAddTask = () => {
    setShowTaskInput(true)
  }

  const handleVoiceInput = async () => {
    try {
      setIsListening(true)
      
      // For now, we'll simulate voice input with a placeholder
      // In a real implementation, you'd use expo-speech-to-text or similar
      setTimeout(() => {
        setTaskInputText('Work on project presentation for 30 minutes starting in 5 minutes')
        setIsListening(false)
      }, 2000)
      
    } catch (error) {
      console.error('Voice input error:', error)
      setIsListening(false)
      Alert.alert('Voice Error', 'Could not access microphone. Please type your task instead.')
    }
  }

  const handleCreateTaskFromInput = async () => {
    if (!taskInputText.trim()) {
      Alert.alert('Error', 'Please enter a task description')
      return
    }
    
    setIsProcessing(true)
    
    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      console.log('🔍 Auth check - user:', user ? 'exists' : 'null', 'error:', authError)
      
      if (!user) {
        Alert.alert('Error', 'Please log in to create tasks')
        return
      }

      console.log('🔍 User ID:', user.id)
      console.log('🤖 Using LLM assistant to create task...')

      // Use LLM assistant to create task directly
      let fullResponse = ''
      await assistantService.sendMessage(taskInputText.trim(), (chunk: string) => {
        fullResponse += chunk
        // Could show streaming in UI if needed
      })

      console.log('✅ LLM response:', fullResponse)
      
      // Reset modal state
      setTaskInputText('')
      setShowTaskInput(false)
      
      // Show success message
      Alert.alert(
        'Success',
        'Task created successfully! The schedule will update shortly.',
        [{ text: 'OK' }]
      )
      
      // Clear any existing sync interval before starting a new one
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }

      // Reload tasks after a delay to allow backend solver to process
      // The solver needs to: 1) solve the task, 2) create solution in task_solution table
      // This can take 5-10 seconds, so we'll check multiple times
      let attempts = 0;
      const maxAttempts = 30; // Check for up to 30 seconds (solver can take 20-30 seconds)
      const checkInterval = setInterval(async () => {
        attempts++;
        console.log(`🔄 Syncing tasks from Supabase (attempt ${attempts}/${maxAttempts})...`);
        
        // Sync from task_solution table (same as web app)
        const result = await syncTasksFromSupabase();
        
        if (result.success && result.taskCount > 0) {
          console.log(`✅ Synced ${result.taskCount} tasks! Reloading schedule...`);
          loadInternalTasks();
          clearInterval(checkInterval);
          syncIntervalRef.current = null;
          return;
        } else if (result.success && result.taskCount === 0) {
          console.log('⏳ No tasks found yet, solver may still be processing...');
        } else {
          console.log(`⏳ Sync failed or no tasks: ${result.error || 'no tasks'}`);
        }

        // If we've tried enough times, stop checking
        if (attempts >= maxAttempts) {
          console.log('⏰ Stopped checking for task updates');
          clearInterval(checkInterval);
          syncIntervalRef.current = null;
          // Final sync attempt
          const finalResult = await syncTasksFromSupabase();
          if (finalResult.success && finalResult.taskCount > 0) {
            loadInternalTasks();
          }
        }
      }, 1000); // Check every second
      
      // Store interval reference for cleanup
      syncIntervalRef.current = checkInterval;
      
    } catch (error: any) {
      console.error('❌ Error creating task:', error)
      
      let errorMessage = 'Failed to create task. Please try again.'
      
      if (error.message?.includes('not authenticated') || error.message?.includes('Auth error')) {
        errorMessage = 'Please sign in to create tasks.'
      } else if (error.message?.includes('not configured')) {
        errorMessage = 'LLM not configured. Please check your settings.'
      } else if (error.message) {
        errorMessage = error.message
      }
      
      Alert.alert('Error', errorMessage, [{ text: 'OK' }])
    } finally {
      setIsProcessing(false)
      // Clean up interval on error
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    }
  }

  return (
    <ThemedGradient style={styles.container}>
      {/* Processing Indicator */}
      {showProcessingIndicator && (
        <View style={styles.processingBanner}>
          <ThemedIcon 
            name="cog" 
            size={16} 
            color="#fff" 
            glassIntensity="light"
            containerStyle={{ marginRight: 8, padding: 4 }}
          />
          <Text style={styles.processingBannerText}>Processing your task request...</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={false} 
            onRefresh={() => {
              console.log('📱 Manual refresh triggered')
              loadTimelineData() // This will clear tasks and load fresh timeline data
            }} 
          />
        }
      >
        
        {/* Ready to Start Section */}
        {!runningTask && sortedTasks.some(shouldTaskStartNow) && (
          <View style={styles.readySection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Ready to Start</Text>
            {sortedTasks.filter(shouldTaskStartNow).map((task) => (
              <GlassMorphism key={task.local_id} style={[styles.readyCard, { backgroundColor: '#4CAF50' }]} intensity="strong">
                <View style={styles.taskInfo}>
                  <Text style={[styles.readyTaskName, { color: '#fff' }]}>{task.name}</Text>
                  <Text style={[styles.readyTaskTime, { color: '#fff' }]}>
                    {formatTaskTime(task.start_time!)} - {formatTaskTime(task.end_time!)}
                  </Text>
                  <Text style={[styles.readyIndicator, { color: '#fff' }]}>Ready to start now!</Text>
                </View>
                <TouchableOpacity
                  style={styles.readyStartButton}
                  onPress={() => handleStartTask(task)}
                >
                  <ThemedIcon 
                    name="play" 
                    size={20} 
                    color="#fff" 
                    glassIntensity="medium"
                    containerStyle={{ padding: 6 }}
                  />
                  <Text style={styles.readyStartButtonText}>Start</Text>
                </TouchableOpacity>
              </GlassMorphism>
            ))}
          </View>
        )}

        {/* Current Status Section */}
        <View style={styles.currentSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Now</Text>
          {currentTask ? (
            <TouchableOpacity
              onLongPress={() => handleLongPress(currentTask)}
              delayLongPress={500}
              activeOpacity={0.8}
            >
              <GlassMorphism style={[
                styles.currentCard, 
                currentTask?.status === 'in_progress' && { backgroundColor: '#FFA726' }, // Default yellow for in-progress
                currentTaskRemaining.readyToComplete && !currentTaskRemaining.isOvertime && { ...styles.readyToCompleteCard, backgroundColor: '#FFA726' },
                currentTaskRemaining.isOvertime && { ...styles.overtimeCard, backgroundColor: '#ff6b35' },
                currentTask?.status === 'completed' && { ...styles.completedCard, backgroundColor: '#4CAF50' },
              ]} intensity="extra-strong">
              <Animated.View style={[{ opacity: fadeAnim }]}>
              <Text style={styles.currentTaskName}>{currentTask.name}</Text>
              <Text style={styles.currentTaskTime}>
                {formatTaskTime(currentTask.start_time!)} - {formatTaskTime(currentTask.end_time!)}
              </Text>
              {currentTask.status === 'completed' ? (
                <View style={styles.timerContainer}>
                  <Text style={styles.timerLabel}>Task Completed!</Text>
                  <ThemedIcon 
                    name="check-circle" 
                    size={48} 
                    color="#fff" 
                    glassIntensity="strong"
                    containerStyle={{ marginVertical: 10, padding: 12 }}
                  />
                  <Text style={styles.completedTime}>
                    Completed at {currentTask.completed_at ? new Date(currentTask.completed_at).toLocaleTimeString() : 'now'}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.timerContainer}>
                    <Text style={styles.timerLabel}>
                      {currentTaskRemaining.isOvertime 
                        ? 'Time Up - Ready to Complete' 
                        : currentTaskRemaining.readyToComplete 
                          ? 'Almost Done - Ready to Complete'
                          : 'Time Remaining'
                      }
                    </Text>
                    <Text style={[
                      styles.timerText, 
                      currentTaskRemaining.isOvertime && styles.overtimeText,
                      currentTaskRemaining.readyToComplete && !currentTaskRemaining.isOvertime && styles.readyToCompleteText
                    ]}>
                      {formatTime(currentTaskRemaining)}
                    </Text>
                    {currentTaskRemaining.isOvertime && (
                      <Text style={styles.overtimeLabel}>Task time has ended</Text>
                    )}
                    {currentTaskRemaining.readyToComplete && !currentTaskRemaining.isOvertime && (
                      <Text style={styles.readyToCompleteLabel}>Task is almost complete!</Text>
                    )}
                  </View>
                  {(currentTaskRemaining.isOvertime || currentTaskRemaining.readyToComplete) && (
                    <TouchableOpacity
                      style={styles.completeButton}
                      onPress={() => handleCompleteTask(currentTask)}
                    >
                      <FontAwesome name="check" size={16} color="#fff" />
                      <Text style={styles.completeButtonText}>Complete Task</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              </Animated.View>
              </GlassMorphism>
            </TouchableOpacity>
          ) : (
            <GlassMorphism style={styles.freeTimeCard} intensity="light">
              <FontAwesome name="coffee" size={32} color={colors.textSecondary} style={styles.freeTimeIcon} />
              <Text style={[styles.freeTimeTaskName, { color: colors.textSecondary }]}>Free Time</Text>
              {nextTask && (
                <>
                  <Text style={[styles.freeTimeSubtext, { color: colors.textTertiary }]}>Next task in</Text>
                  <Text style={[styles.freeTimeTimer, { color: colors.textSecondary }]}>{formatTime(timeUntilNext)}</Text>
                </>
              )}
              {!nextTask && <Text style={[styles.freeTimeSubtext, { color: colors.textTertiary }]}>No upcoming tasks</Text>}
            </GlassMorphism>
          )}
        </View>

        {/* Paused Tasks Section */}
        {pausedTasks.length > 0 && (
          <View style={styles.pausedSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Paused Tasks</Text>
            {pausedTasks.map((task) => (
              <GlassMorphism key={task.local_id} style={styles.pausedCard} intensity="light" borderRadius={12}>
                <TouchableOpacity
                  onLongPress={() => handleLongPress(task)}
                  delayLongPress={500}
                  activeOpacity={0.8}
                  style={styles.pausedCardContent}
                >
                  <View style={styles.pausedTaskInfo}>
                    <Text style={[styles.pausedTaskName, { color: colors.text }]}>{task.name}</Text>
                    <Text style={[styles.pausedTaskTime, { color: colors.textSecondary }]}>
                      {formatTaskTime(task.start_time!)} - {formatTaskTime(task.end_time!)}
                    </Text>
                    <Text style={styles.pausedTaskStatus}>
                      Paused at {task.paused_at ? new Date(task.paused_at).toLocaleTimeString() : 'unknown time'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.resumeButton}
                    onPress={() => handleResumeTask(task)}
                  >
                    <FontAwesome name="play" size={16} color="#fff" />
                    <Text style={styles.resumeButtonText}>Resume</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              </GlassMorphism>
            ))}
          </View>
        )}

        {/* Next Task Section */}
        {nextTask && !shouldTaskStartNow(nextTask) && (
          <View style={styles.nextSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Next Up</Text>
            <GlassMorphism style={styles.nextCard} intensity="medium">
              <View style={styles.taskInfo}>
                <Text style={[styles.nextTaskName, { color: colors.text }]}>{nextTask.name}</Text>
                <Text style={[styles.nextTaskTime, { color: colors.textSecondary }]}>
                  {formatTaskTime(nextTask.start_time!)} - {formatTaskTime(nextTask.end_time!)}
                </Text>
                <Text style={[styles.aboutToStartText, { color: colors.textSuccess }]}>
                  Starting in {formatTimeUntil(new Date(nextTask.start_time!).getTime() - currentTime.getTime())}
                </Text>
              </View>
            </GlassMorphism>
          </View>
        )}

        {/* Upcoming Tasks Section - Always show if there are any tasks */}
        {sortedTasks.length > 0 && (
          <View style={styles.upcomingSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming Tasks</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                {upcomingTasks.filter(task => !shouldTaskStartNow(task) && task.local_id !== nextTask?.local_id).length} remaining
              </Text>
            </View>
            
            {upcomingTasks.filter(task => !shouldTaskStartNow(task) && task.local_id !== nextTask?.local_id).length > 0 ? (
              upcomingTasks
                .filter(task => !shouldTaskStartNow(task) && task.local_id !== nextTask?.local_id)
                .slice(0, 5)
                .map((task, index) => {
                  const timeUntilTask = new Date(task.start_time!).getTime() - currentTime.getTime()
                  
                  return (
                    <GlassMorphism
                      key={task.local_id}
                      style={[styles.upcomingCard, index === 0 && styles.upcomingCardFirst]}
                      intensity={index === 0 ? "medium" : "light"}
                    >
                      <View style={styles.taskInfo}>
                        <Text style={[styles.upcomingTaskName, { color: colors.text }]}>{task.name}</Text>
                        <Text style={[styles.upcomingTaskTime, { color: colors.textSecondary }]}>
                          {formatTaskTime(task.start_time!)} - {formatTaskTime(task.end_time!)}
                        </Text>
                        <Text style={styles.upcomingTimeUntil}>
                          in {formatTimeUntil(timeUntilTask)}
                        </Text>
                      </View>
                      <View style={styles.upcomingIndicator}>
                        <FontAwesome 
                          name="clock-o" 
                          size={16} 
                          color={index === 0 ? Colors.light.tint : '#999'} 
                        />
                      </View>
                    </GlassMorphism>
                  )
                })
            ) : (
              <GlassMorphism style={styles.noUpcomingCard} intensity="light">
                <FontAwesome name="check-circle" size={24} color="#4CAF50" style={styles.noUpcomingIcon} />
                <View style={styles.noUpcomingTextContainer}>
                  <Text style={[styles.noUpcomingText, { color: colors.textSuccess }]}>All caught up!</Text>
                  <Text style={[styles.noUpcomingSubtext, { color: colors.textSecondary }]}>
                    {currentTask ? 
                      'No more tasks after your current one' : 
                      'No upcoming tasks scheduled'
                    }
                  </Text>
                </View>
              </GlassMorphism>
            )}
          </View>
        )}

        {/* No tasks message */}
        {sortedTasks.length === 0 && (
          <View style={styles.emptyContainer}>
            <FontAwesome name="calendar-o" size={60} color="#ccc" />
            <Text style={styles.emptyText}>No scheduled tasks</Text>
            <Text style={styles.emptySubtext}>
              Use the Dev tab to add test tasks
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Chat Assistant Modal - Replaces Task Input Modal */}
      <Modal
        visible={showTaskInput}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTaskInput(false)}
      >
        <View style={styles.modalContainer}>
          <KeyboardAvoidingView 
            style={styles.modalKeyboardContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
          >
            <View style={[styles.modalContentWrapper, { backgroundColor: colors.background }]}>
              {/* Header with close button */}
              <View style={[styles.modalHeader, { backgroundColor: colors.background, borderBottomColor: colors.borderColor }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>AI Assistant</Text>
                <TouchableOpacity 
                  onPress={() => setShowTaskInput(false)}
                  style={styles.cancelButton}
                >
                  <FontAwesome name="times" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Chat Assistant Component */}
              <View style={styles.chatContainer}>
                <ChatAssistant 
                  onTaskCreated={() => {
                    // Clear any existing sync interval before starting a new one
                    if (syncIntervalRef.current) {
                      clearInterval(syncIntervalRef.current)
                      syncIntervalRef.current = null
                    }

                    // Reload tasks after a delay to allow backend solver to process
                    // The solver needs to: 1) solve the task, 2) create solution in task_solution table
                    // This can take 5-10 seconds, so we'll check multiple times
                    let attempts = 0
                    const maxAttempts = 30 // Check for up to 30 seconds (solver can take 20-30 seconds)
                    const checkInterval = setInterval(async () => {
                      attempts++
                      console.log(`🔄 Syncing tasks from Supabase (attempt ${attempts}/${maxAttempts})...`)
                      
                      // Sync from task_solution table (same as web app)
                      const result = await syncTasksFromSupabase()
                      
                      if (result.success && result.taskCount > 0) {
                        console.log(`✅ Synced ${result.taskCount} tasks! Reloading schedule...`)
                        loadInternalTasks()
                        clearInterval(checkInterval)
                        syncIntervalRef.current = null
                        return
                      } else if (result.success && result.taskCount === 0) {
                        console.log('⏳ No tasks found yet, solver may still be processing...')
                      } else {
                        console.log(`⏳ Sync failed or no tasks: ${result.error || 'no tasks'}`)
                      }

                      // If we've tried enough times, stop checking
                      if (attempts >= maxAttempts) {
                        console.log('⏰ Stopped checking for task updates')
                        clearInterval(checkInterval)
                        syncIntervalRef.current = null
                        // Final sync attempt
                        const finalResult = await syncTasksFromSupabase()
                        if (finalResult.success && finalResult.taskCount > 0) {
                          loadInternalTasks()
                        }
                      }
                    }, 1000)
                    syncIntervalRef.current = checkInterval
                  }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Context Menu Modal */}
      <Modal
        visible={showContextMenu}
        animationType="fade"
        transparent={true}
        onRequestClose={closeContextMenu}
      >
        <TouchableOpacity 
          style={styles.contextMenuOverlay}
          activeOpacity={1}
          onPress={closeContextMenu}
        >
          <GlassMorphism style={styles.contextMenuContainer} intensity={actualTheme === 'dark' ? 'strong' : 'medium'} borderRadius={12}>
            <View style={[styles.contextMenuHeader, { borderBottomColor: actualTheme === 'dark' ? '#333' : '#f0f0f0' }]}>
              <Text style={[styles.contextMenuTitle, { color: colors.text }]}>
                {contextMenuTask?.name}
              </Text>
              <Text style={[styles.contextMenuSubtitle, { color: colors.textSecondary }]}>Choose an action</Text>
            </View>
            
            {contextMenuTask?.status === 'in_progress' && (
              <>
                <TouchableOpacity
                  style={[styles.contextMenuItem, styles.completeMenuItem]}
                  onPress={() => handleContextMenuAction('complete')}
                >
                  <FontAwesome name="check" size={20} color="#fff" />
                  <Text style={[styles.contextMenuText, styles.completeMenuText]}>Complete Task</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.contextMenuItem, styles.pauseMenuItem]}
                  onPress={() => handleContextMenuAction('pause')}
                >
                  <FontAwesome name="pause" size={20} color="#fff" />
                  <Text style={[styles.contextMenuText, styles.pauseMenuText]}>Pause Task</Text>
                </TouchableOpacity>
              </>
            )}
            
            {contextMenuTask?.status === 'paused' && (
              <TouchableOpacity
                style={[styles.contextMenuItem, styles.resumeMenuItem]}
                onPress={() => handleContextMenuAction('resume')}
              >
                <FontAwesome name="play" size={20} color="#fff" />
                <Text style={[styles.contextMenuText, styles.resumeMenuText]}>Resume Task</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[styles.contextMenuItem, styles.cancelMenuItem]}
              onPress={() => handleContextMenuAction('cancel')}
            >
              <FontAwesome name="times" size={20} color="#fff" />
              <Text style={[styles.contextMenuText, styles.cancelMenuText]}>Cancel Task</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.contextMenuItem, styles.dismissMenuItem, { backgroundColor: actualTheme === 'dark' ? '#2a2a2a' : '#f8f9fa' }]}
              onPress={closeContextMenu}
            >
              <Text style={[styles.dismissMenuText, { color: colors.textSecondary }]}>Dismiss</Text>
            </TouchableOpacity>
          </GlassMorphism>
        </TouchableOpacity>
      </Modal>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, {
          backgroundColor: actualTheme === 'dark' 
            ? 'rgba(177, 156, 217, 0.9)' 
            : 'rgba(74, 144, 226, 0.9)',
          shadowColor: actualTheme === 'dark' ? '#B19CD9' : '#4A90E2',
        }]}
        onPress={handleQuickAddTask}
        activeOpacity={0.8}
      >
        <ThemedIcon 
          name="plus" 
          size={24} 
          color="#fff" 
          glassIntensity="strong"
          containerStyle={{ padding: 0, backgroundColor: 'transparent', borderWidth: 0 }}
        />
      </TouchableOpacity>
    </ThemedGradient>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  processingBanner: {
    backgroundColor: Colors.light.tint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 100,
  },
  processingIcon: {
    marginRight: 8,
  },
  processingBannerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  readySection: {
    padding: 20,
    paddingBottom: 10,
  },
  readyCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readyTaskName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 4,
  },
  readyTaskTime: {
    fontSize: 14,
    color: '#4CAF50',
    marginBottom: 4,
  },
  readyIndicator: {
    fontSize: 12,
    color: '#2e7d32',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  readyStartButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  readyStartButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  currentSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  currentCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  currentTaskName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  currentTaskTime: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 20,
  },
  timerContainer: {
    alignItems: 'center',
  },
  timerLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 8,
  },
  timerText: {
    fontSize: 36,
    fontWeight: '300',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  overtimeCard: {
    backgroundColor: '#ff6b35',
    shadowColor: '#ff6b35',
    shadowOpacity: 0.3,
  },
  overtimeText: {
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  overtimeLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 8,
    fontWeight: '500',
  },
  completeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 25,
    paddingHorizontal: 24,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  completeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  completedCard: {
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOpacity: 0.3,
  },
  completedTime: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 12,
    fontWeight: '500',
  },
  readyToCompleteCard: {
    backgroundColor: '#FFA726',
    shadowColor: '#FFA726',
    shadowOpacity: 0.3,
  },
  readyToCompleteText: {
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  readyToCompleteLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 8,
    fontWeight: '500',
  },
  freeTimeCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  freeTimeIcon: {
    marginBottom: 8,
    opacity: 0.7,
    alignSelf: 'center',
  },
  freeTimeTaskName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6c757d',
    marginBottom: 8,
    textAlign: 'center',
  },
  freeTimeSubtext: {
    fontSize: 16,
    color: '#868e96',
    marginBottom: 12,
    textAlign: 'center',
  },
  freeTimeTimer: {
    fontSize: 28,
    fontWeight: '300',
    color: '#6c757d',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  freeTimeText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 12,
  },
  nextSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  nextCard: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aboutToStartCard: {
    backgroundColor: '#f0f9f0',
    borderColor: '#90EE90',
    borderWidth: 2,
  },
  shouldStartCard: {
    backgroundColor: '#e8f5e8',
    borderColor: '#4CAF50',
    borderWidth: 2,
    shadowColor: '#4CAF50',
    shadowOpacity: 0.3,
  },
  taskInfo: {
    flex: 1,
  },
  nextTaskName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  nextTaskTime: {
    fontSize: 14,
    color: '#666',
  },
  aboutToStartText: {
    fontSize: 12,
    color: '#45a049',
    fontWeight: '600',
    marginTop: 4,
  },
  shouldStartText: {
    color: '#2e7d32',
    fontWeight: 'bold',
  },
  shouldStartSubtext: {
    color: '#4CAF50',
  },
  shouldStartIndicator: {
    fontSize: 12,
    color: '#2e7d32',
    fontWeight: '600',
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  startButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallStartButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  startButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  upcomingSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  upcomingCard: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  upcomingCardFirst: {
    borderColor: Colors.light.tint,
    borderWidth: 1.5,
    shadowColor: Colors.light.tint,
    shadowOpacity: 0.1,
  },
  upcomingTaskName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  upcomingTaskTime: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  upcomingTimeUntil: {
    fontSize: 12,
    color: Colors.light.tint,
    fontWeight: '600',
  },
  upcomingIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noUpcomingCard: {
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  noUpcomingIcon: {
    marginRight: 12,
  },
  noUpcomingTextContainer: {
    flex: 1,
  },
  noUpcomingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
    marginBottom: 2,
  },
  noUpcomingSubtext: {
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 1000,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalKeyboardContainer: {
    justifyContent: 'flex-end',
    flex: 1,
  },
  modalContentWrapper: {
    backgroundColor: 'transparent',
    flex: 1,
    maxHeight: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  chatContainer: {
    flex: 1,
    minHeight: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalContent: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  createButton: {
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  disabledButtonText: {
    color: '#999',
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 20,
  },
  inputHint: {
    fontSize: 14,
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    maxHeight: 100,
    paddingVertical: 8,
  },
  voiceButton: {
    marginLeft: 8,
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
  },
  voiceButtonActive: {
    backgroundColor: '#ff4444',
  },
  listeningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  listeningText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#ff4444',
    fontWeight: '500',
  },
  processingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  processingText: {
    marginLeft: 8,
    fontSize: 16,
    color: Colors.light.tint,
    fontWeight: '500',
  },
  examplesContainer: {
    marginTop: 20,
  },
  examplesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  exampleChip: {
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  exampleText: {
    fontSize: 14,
    color: '#666',
  },
  // Context Menu Styles
  contextMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenuContainer: {
    backgroundColor: 'transparent',
    borderRadius: 16,
    margin: 20,
    padding: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 280,
  },
  contextMenuHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  contextMenuTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  contextMenuSubtitle: {
    fontSize: 14,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  contextMenuText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
  completeMenuItem: {
    backgroundColor: '#4CAF50',
  },
  completeMenuText: {
    color: '#fff',
  },
  pauseMenuItem: {
    backgroundColor: '#FF9800',
  },
  pauseMenuText: {
    color: '#fff',
  },
  cancelMenuItem: {
    backgroundColor: '#f44336',
  },
  cancelMenuText: {
    color: '#fff',
  },
  resumeMenuItem: {
    backgroundColor: '#4CAF50',
  },
  resumeMenuText: {
    color: '#fff',
  },
  dismissMenuItem: {
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 0,
  },
  dismissMenuText: {
    fontSize: 16,
    textAlign: 'center',
    flex: 1,
  },
  // Paused Tasks Styles
  pausedSection: {
    margin: 16,
    marginBottom: 8,
  },
  pausedCard: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  pausedCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  pausedTaskInfo: {
    flex: 1,
  },
  pausedTaskName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  pausedTaskTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  pausedTaskStatus: {
    fontSize: 12,
    color: '#FF9800',
    fontStyle: 'italic',
  },
  resumeButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resumeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
})