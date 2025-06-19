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
import { ExpoNotificationService } from '@/lib/notifications/expo-notifications'
import * as Notifications from 'expo-notifications'
import * as Speech from 'expo-speech'
import { internalDB, InternalTask } from '@/lib/internal-db'
import { supabase } from '@/lib/supabase'
import { useFocusEffect } from 'expo-router'

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
const TASK_GRANULARITY = 300 // 10 seconds for debugging, change to 300 (5 minutes) for production
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
  priority: 'medium',
  sync_status: 'synced',
  created_at: internalTask.created_at,
  updated_at: internalTask.updated_at,
})

export default function ScheduleScreen() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [internalTasks, setInternalTasks] = useState<Task[]>([])
  const [sampleTasks] = useState<Task[]>([
    {
      id: '1',
      local_id: 'sample_1',
      user_id: 'sample_user',
      name: 'Quick Test 1',
      status: 'pending',
      start_time: new Date(Date.now() + 1000 * 10).toISOString(),
      end_time: new Date(Date.now() + 1000 * 25).toISOString(),
      priority: 'high',
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ])
  const [alertedTasks, setAlertedTasks] = useState<Set<string>>(new Set())
  const [appState, setAppState] = useState(AppState.currentState)
  const [justCompletedTask, setJustCompletedTask] = useState<Task | null>(null)
  const [showTaskInput, setShowTaskInput] = useState(false)
  const [taskInputText, setTaskInputText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showProcessingIndicator, setShowProcessingIndicator] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | number | null>(null)
  const fadeAnim = useRef(new Animated.Value(1)).current
  const expoNotificationService = useRef(new ExpoNotificationService()).current

  // Load internal tasks when component mounts and set up frequent refresh
  useEffect(() => {
    loadInternalTasks()
    // Refresh internal tasks every 1 second for immediate updates
    const interval = setInterval(loadInternalTasks, 1000)
    return () => clearInterval(interval)
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


  // Always use internal DB, fallback to sample tasks if empty
  const tasks = internalTasks.length > 0 ? internalTasks : sampleTasks

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
    const startTime = new Date(task.start_time).getTime()
    const now = currentTime.getTime()
    
    // Only consider manually started tasks as current
    return task.status === 'in_progress' && now >= startTime
  })
  
  // Current task is either the running task or just completed task for display
  const currentTask = justCompletedTask || runningTask

  // Sort tasks excluding completed ones (for upcoming/next sections)
  const sortedTasks = allTasksWithTimes.filter(task => task.status !== 'completed')

  const upcomingTasks = allTasksWithTimes.filter(task => {
    if (!task.start_time || task.status === 'completed') return false
    const startTime = new Date(task.start_time).getTime()
    const now = currentTime.getTime()
    return startTime > now
  })

  const nextTask = upcomingTasks[0]

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

  const handleQuickAddTask = () => {
    setTaskInputText('')
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
        Alert.alert('Error', 'Please log in to save prompts')
        return
      }

      console.log('🔍 User ID:', user.id)

      // Save the prompt directly - no need to check table existence
      console.log('🔍 Attempting to save prompt...')
      const promptData = {
        user_id: user.id,
        prompt_text: taskInputText.trim()
      }
      
      console.log('🔍 Prompt data to insert:', promptData)
      
      const { data, error } = await supabase
        .schema('skedai')
        .from('user_prompt')
        .insert(promptData)

      if (error) {
        console.error('❌ Error saving prompt:', error)
        console.error('❌ Error details:', JSON.stringify(error, null, 2))
        console.error('❌ Error code:', error.code)
        console.error('❌ Error message:', error.message)
        
        Alert.alert(
          'Error',
          `Failed to save your prompt: ${error.message || 'Unknown error'}`,
          [{ text: 'OK' }]
        )
        return
      }

      console.log('✅ Prompt saved successfully:', data)
      
      // Reset modal state
      setTaskInputText('')
      setShowTaskInput(false)
      
      // Show processing indicator for 2 seconds
      setShowProcessingIndicator(true)
      setTimeout(() => {
        setShowProcessingIndicator(false)
      }, 2000)
      
    } catch (error: any) {
      console.error('❌ Error saving prompt:', error)
      Alert.alert(
        'Error',
        `Failed to save your prompt: ${error.message}`,
        [{ text: 'OK' }]
      )
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <View style={styles.container}>
      {/* Processing Indicator */}
      {showProcessingIndicator && (
        <View style={styles.processingBanner}>
          <FontAwesome name="cog" size={16} color="#fff" style={styles.processingIcon} />
          <Text style={styles.processingBannerText}>Processing your task request...</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={false} 
            onRefresh={loadInternalTasks} 
          />
        }
      >
        
        {/* Ready to Start Section */}
        {!runningTask && sortedTasks.some(shouldTaskStartNow) && (
          <View style={styles.readySection}>
            <Text style={styles.sectionTitle}>Ready to Start</Text>
            {sortedTasks.filter(shouldTaskStartNow).map((task) => (
              <View key={task.local_id} style={styles.readyCard}>
                <View style={styles.taskInfo}>
                  <Text style={styles.readyTaskName}>{task.name}</Text>
                  <Text style={styles.readyTaskTime}>
                    {formatTaskTime(task.start_time!)} - {formatTaskTime(task.end_time!)}
                  </Text>
                  <Text style={styles.readyIndicator}>Ready to start now!</Text>
                </View>
                <TouchableOpacity
                  style={styles.readyStartButton}
                  onPress={() => handleStartTask(task)}
                >
                  <FontAwesome name="play" size={20} color="#fff" />
                  <Text style={styles.readyStartButtonText}>Start</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Current Status Section */}
        <View style={styles.currentSection}>
          <Text style={styles.sectionTitle}>Now</Text>
          {currentTask ? (
            <Animated.View style={[
              styles.currentCard, 
              currentTaskRemaining.readyToComplete && !currentTaskRemaining.isOvertime && styles.readyToCompleteCard,
              currentTaskRemaining.isOvertime && styles.overtimeCard,
              currentTask?.status === 'completed' && styles.completedCard,
              { opacity: fadeAnim }
            ]}>
              <Text style={styles.currentTaskName}>{currentTask.name}</Text>
              <Text style={styles.currentTaskTime}>
                {formatTaskTime(currentTask.start_time!)} - {formatTaskTime(currentTask.end_time!)}
              </Text>
              {currentTask.status === 'completed' ? (
                <View style={styles.timerContainer}>
                  <Text style={styles.timerLabel}>Task Completed!</Text>
                  <FontAwesome name="check-circle" size={48} color="#fff" />
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
          ) : (
            <View style={styles.freeTimeCard}>
              <FontAwesome name="coffee" size={32} color="#999" style={styles.freeTimeIcon} />
              <Text style={styles.freeTimeTaskName}>Free Time</Text>
              {nextTask && (
                <>
                  <Text style={styles.freeTimeSubtext}>Next task in</Text>
                  <Text style={styles.freeTimeTimer}>{formatTime(timeUntilNext)}</Text>
                </>
              )}
              {!nextTask && <Text style={styles.freeTimeSubtext}>No upcoming tasks</Text>}
            </View>
          )}
        </View>

        {/* Next Task Section */}
        {nextTask && !shouldTaskStartNow(nextTask) && (
          <View style={styles.nextSection}>
            <Text style={styles.sectionTitle}>Next Up</Text>
            <View style={styles.nextCard}>
              <View style={styles.taskInfo}>
                <Text style={styles.nextTaskName}>{nextTask.name}</Text>
                <Text style={styles.nextTaskTime}>
                  {formatTaskTime(nextTask.start_time!)} - {formatTaskTime(nextTask.end_time!)}
                </Text>
                <Text style={styles.aboutToStartText}>
                  Starting in {Math.ceil((new Date(nextTask.start_time!).getTime() - currentTime.getTime()) / 1000)}s
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Upcoming Tasks Section - Always show if there are any tasks */}
        {sortedTasks.length > 0 && (
          <View style={styles.upcomingSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Tasks</Text>
              <Text style={styles.sectionSubtitle}>
                {upcomingTasks.filter(task => !shouldTaskStartNow(task) && task.local_id !== nextTask?.local_id).length} remaining
              </Text>
            </View>
            
            {upcomingTasks.filter(task => !shouldTaskStartNow(task) && task.local_id !== nextTask?.local_id).length > 0 ? (
              upcomingTasks
                .filter(task => !shouldTaskStartNow(task) && task.local_id !== nextTask?.local_id)
                .slice(0, 5)
                .map((task, index) => {
                  const timeUntilTask = new Date(task.start_time!).getTime() - currentTime.getTime()
                  const hoursUntil = Math.floor(timeUntilTask / (1000 * 60 * 60))
                  const minutesUntil = Math.floor((timeUntilTask % (1000 * 60 * 60)) / (1000 * 60))
                  
                  return (
                    <TouchableOpacity
                      key={task.local_id}
                      style={[styles.upcomingCard, index === 0 && styles.upcomingCardFirst]}
                    >
                      <View style={styles.taskInfo}>
                        <Text style={styles.upcomingTaskName}>{task.name}</Text>
                        <Text style={styles.upcomingTaskTime}>
                          {formatTaskTime(task.start_time!)} - {formatTaskTime(task.end_time!)}
                        </Text>
                        <Text style={styles.upcomingTimeUntil}>
                          {timeUntilTask > 0 ? (
                            hoursUntil > 0 ? 
                              `in ${hoursUntil}h ${minutesUntil}m` : 
                              `in ${minutesUntil}m`
                          ) : 'Starting soon'}
                        </Text>
                      </View>
                      <View style={styles.upcomingIndicator}>
                        <FontAwesome 
                          name="clock-o" 
                          size={16} 
                          color={index === 0 ? Colors.light.tint : '#999'} 
                        />
                      </View>
                    </TouchableOpacity>
                  )
                })
            ) : (
              <View style={styles.noUpcomingCard}>
                <FontAwesome name="check-circle" size={24} color="#4CAF50" style={styles.noUpcomingIcon} />
                <View style={styles.noUpcomingTextContainer}>
                  <Text style={styles.noUpcomingText}>All caught up!</Text>
                  <Text style={styles.noUpcomingSubtext}>
                    {currentTask ? 
                      'No more tasks after your current one' : 
                      'No upcoming tasks scheduled'
                    }
                  </Text>
                </View>
              </View>
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

      {/* Task Input Modal */}
      <Modal
        visible={showTaskInput}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTaskInput(false)}
      >
        <TouchableOpacity 
          style={styles.modalContainer}
          activeOpacity={1}
          onPress={() => setShowTaskInput(false)}
        >
          <KeyboardAvoidingView 
            style={styles.modalKeyboardContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalContentWrapper}>
                <View style={styles.modalHeader}>
            <TouchableOpacity 
              onPress={() => setShowTaskInput(false)}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Task Prompt</Text>
            <TouchableOpacity 
              onPress={handleCreateTaskFromInput}
              style={[styles.createButton, (!taskInputText.trim() || isProcessing) && styles.disabledButton]}
              disabled={!taskInputText.trim() || isProcessing}
            >
              <Text style={[styles.createButtonText, (!taskInputText.trim() || isProcessing) && styles.disabledButtonText]}>
                {isProcessing ? 'Saving...' : 'Save Prompt'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.inputLabel}>Describe your task request:</Text>
            <Text style={styles.inputHint}>
              Tell us what task you'd like to schedule and when
            </Text>
            
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                value={taskInputText}
                onChangeText={setTaskInputText}
                placeholder="What would you like to work on?"
                placeholderTextColor="#999"
                multiline
                textAlignVertical="top"
                autoFocus
              />
              
              <TouchableOpacity
                style={[styles.voiceButton, isListening && styles.voiceButtonActive]}
                onPress={handleVoiceInput}
                disabled={isListening}
              >
                <FontAwesome 
                  name={isListening ? "microphone" : "microphone-slash"} 
                  size={20} 
                  color={isListening ? "#fff" : "#666"} 
                />
              </TouchableOpacity>
            </View>

            {isListening && (
              <View style={styles.listeningIndicator}>
                <FontAwesome name="volume-up" size={16} color={Colors.light.tint} />
                <Text style={styles.listeningText}>Listening...</Text>
              </View>
            )}

            {isProcessing && (
              <View style={styles.processingIndicator}>
                <FontAwesome name="cog" size={16} color={Colors.light.tint} />
                <Text style={styles.processingText}>AI is processing your request...</Text>
              </View>
            )}

            <View style={styles.examplesContainer}>
              <Text style={styles.examplesTitle}>Example phrases:</Text>
              <TouchableOpacity 
                style={styles.exampleChip}
                onPress={() => setTaskInputText('Read emails for 15 minutes')}
              >
                <Text style={styles.exampleText}>"Read emails for 15 minutes"</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.exampleChip}
                onPress={() => setTaskInputText('Meeting with team in 10 minutes for 1 hour')}
              >
                <Text style={styles.exampleText}>"Meeting with team in 10 minutes for 1 hour"</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.exampleChip}
                onPress={() => setTaskInputText('Exercise for 30 minutes starting now')}
              >
                <Text style={styles.exampleText}>"Exercise for 30 minutes starting now"</Text>
              </TouchableOpacity>
            </View>
          </View>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleQuickAddTask}
        activeOpacity={0.8}
      >
        <FontAwesome name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
    backgroundColor: '#e8f5e8',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
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
    color: '#666',
    marginBottom: 12,
  },
  currentCard: {
    backgroundColor: Colors.light.tint,
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
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e9ecef',
    borderStyle: 'dashed',
  },
  freeTimeIcon: {
    marginBottom: 8,
    opacity: 0.7,
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
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
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
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
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
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  modalKeyboardContainer: {
    justifyContent: 'flex-end',
    flex: 0,
  },
  modalContentWrapper: {
    backgroundColor: 'transparent',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalContent: {
    backgroundColor: '#fff',
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
    color: '#666',
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
    color: '#333',
    marginBottom: 8,
    marginTop: 20,
  },
  inputHint: {
    fontSize: 14,
    color: '#666',
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
    color: '#333',
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
})