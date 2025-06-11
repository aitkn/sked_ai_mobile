import React, { useState, useEffect, useRef } from 'react'
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
  RefreshControl,
  Alert,
  Dimensions,
  AppState,
  Platform,
} from 'react-native'
import { Text } from '@/components/Themed'
import { useTaskContext } from '@/contexts/TaskContext'
import { Task } from '@/lib/offline/database'
import Colors from '@/constants/Colors'
import { FontAwesome } from '@expo/vector-icons'
import { ExpoNotificationService } from '@/lib/notifications/expo-notifications'
import * as Notifications from 'expo-notifications'
import { internalDB, InternalTask } from '@/lib/internal-db'

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


// Helper function to convert InternalTask to Task format
const convertInternalTaskToTask = (internalTask: InternalTask): Task => ({
  id: internalTask.id,
  local_id: internalTask.id,
  user_id: 'internal_user',
  name: internalTask.name,
  status: 'pending',
  start_time: internalTask.start_time,
  end_time: internalTask.end_time,
  priority: 'medium',
  sync_status: 'synced',
  created_at: internalTask.created_at,
  updated_at: internalTask.updated_at,
})

export default function ScheduleScreen() {
  const { tasks: supabaseTasks, loading, updateTask, syncNow } = useTaskContext()
  const [useSupabase, setUseSupabase] = useState(true)
  const [autoStart, setAutoStart] = useState(true)
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
  const timerRef = useRef<NodeJS.Timeout | number | null>(null)
  const expoNotificationService = useRef(new ExpoNotificationService()).current

  // Load internal tasks when component mounts or when switching to sample mode
  useEffect(() => {
    if (!useSupabase) {
      loadInternalTasks()
      // Refresh internal tasks every 5 seconds when in sample mode
      const interval = setInterval(loadInternalTasks, 5000)
      return () => clearInterval(interval)
    }
  }, [useSupabase])

  const loadInternalTasks = async () => {
    try {
      const allInternalTasks = await internalDB.getAllTasks()
      const convertedTasks = allInternalTasks.map(convertInternalTaskToTask)
      setInternalTasks(convertedTasks)
    } catch (error) {
      console.error('Error loading internal tasks:', error)
      setInternalTasks([])
    }
  }

  // Initialize notification service and listen for interactions
  useEffect(() => {
    // Initialize Expo notifications
    expoNotificationService.initialize().then(() => {
      console.log('Expo notifications initialized successfully')
    }).catch(error => {
      console.error('Failed to initialize Expo notifications:', error)
    })

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped:', response.notification.request.content)
      Alert.alert(
        'Notification Tapped!', 
        `You tapped: ${response.notification.request.content.title}\\n\\nThis proves notifications are working!`
      )
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

  // Track app state
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      setAppState(nextAppState)
    })

    return () => {
      subscription.remove()
    }
  }, [])


  // Get tasks based on mode
  const tasks = useSupabase ? supabaseTasks : (internalTasks.length > 0 ? internalTasks : sampleTasks)

  // Sort tasks by start time
  const sortedTasks = [...tasks]
    .filter(task => !task.deleted_at && task.status !== 'completed')
    .filter(task => task.start_time) // Only show tasks with start times
    .sort((a, b) => {
      const aTime = new Date(a.start_time!).getTime()
      const bTime = new Date(b.start_time!).getTime()
      return aTime - bTime
    })

  // Find current and next task
  const currentTask = sortedTasks.find(task => {
    if (!task.start_time || !task.end_time) return false
    const startTime = new Date(task.start_time).getTime()
    const endTime = new Date(task.end_time).getTime()
    const now = currentTime.getTime()
    
    // If autoStart is disabled, only consider manually started tasks as current
    if (!autoStart) {
      return task.status === 'in_progress' && now >= startTime && now < endTime
    }
    
    // If autoStart is enabled, any task in its time window is current
    return now >= startTime && now < endTime
  })

  const upcomingTasks = sortedTasks.filter(task => {
    if (!task.start_time) return false
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

  // Check if a task is about to start (within 30 seconds)
  const isTaskAboutToStart = (task: Task) => {
    if (!task.start_time) return false
    const now = currentTime.getTime()
    const taskStart = new Date(task.start_time).getTime()
    return taskStart <= now + 30000 && taskStart > now - 5000 && task.status !== 'in_progress'
  }

  // Check if a task should be started now
  const shouldTaskStartNow = (task: Task) => {
    if (!task.start_time) return false
    const now = currentTime.getTime()
    const taskStart = new Date(task.start_time).getTime()
    return taskStart <= now && task.status !== 'in_progress' && task.status !== 'completed'
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

  // Get time remaining in current task
  const getCurrentTaskRemaining = () => {
    if (!currentTask || !currentTask.end_time) {
      return { hours: 0, minutes: 0, seconds: 0, total: 0 }
    }

    const now = currentTime.getTime()
    const endTime = new Date(currentTask.end_time).getTime()
    const diff = Math.max(0, endTime - now)

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    return { hours, minutes, seconds, total: diff }
  }

  const timeUntilNext = getTimeUntilNext()
  const currentTaskRemaining = getCurrentTaskRemaining()

  // Check for task transitions and send notifications
  useEffect(() => {
    // Debug logging every second
    console.log('🔍 Task transition check:', new Date().toLocaleTimeString())
    console.log('- Next task:', nextTask?.name || 'none')
    console.log('- Current task:', currentTask?.name || 'none')
    console.log('- App state:', appState)
    console.log('- Auto start:', autoStart)
    console.log('- Alerted tasks:', Array.from(alertedTasks))
    
    if (nextTask) {
      const now = currentTime.getTime()
      const taskStart = new Date(nextTask.start_time!).getTime()
      const timeUntilStart = (taskStart - now) / 1000
      console.log('- Time until next task:', Math.round(timeUntilStart), 'seconds')
    }
    
    // Check for upcoming task notifications (30 seconds before start)
    if (nextTask && !currentTask) {
      const now = currentTime.getTime()
      const taskStart = new Date(nextTask.start_time!).getTime()
      const timeUntilStart = (taskStart - now) / 1000
      
      console.log('🕰 Time check:')
      console.log('- Now:', new Date(now).toISOString())
      console.log('- Task starts:', new Date(taskStart).toISOString())
      console.log('- Time diff:', timeUntilStart, 'seconds')
      
      // Check 30-second warning conditions
      console.log('🕰 30s warning check:')
      console.log('- timeUntilStart <= 30:', timeUntilStart <= 30)
      console.log('- timeUntilStart > 25:', timeUntilStart > 25)
      console.log('- appState !== active:', appState !== 'active')
      console.log('- appState value:', appState)
      
      // Send 30-second warning notification (test with shorter time for debugging)
      if (timeUntilStart <= 15 && timeUntilStart > 10 && appState !== 'active') {
        const warningKey = `${nextTask.local_id}_30s_warning`
        console.log('🕰 Warning key:', warningKey)
        console.log('🕰 Already alerted:', alertedTasks.has(warningKey))
        
        if (!alertedTasks.has(warningKey)) {
          setAlertedTasks(prev => new Set(prev).add(warningKey))
          console.log('⏰ SENDING 30-second warning notification...')
          
          setTimeout(async () => {
            try {
              const result = await Notifications.scheduleNotificationAsync({
                content: {
                  title: `Starting Soon: ${nextTask.name}`,
                  body: `Your task starts in ${Math.ceil(timeUntilStart)} seconds`,
                  data: { taskId: nextTask.local_id, type: 'task_warning' },
                },
                trigger: null,
              })
              console.log('✅ 30-second warning notification sent, result:', result)
            } catch (error) {
              console.error('❌ Warning notification failed:', error)
            }
          }, 100)
        } else {
          console.log('🕰 30s warning already sent for this task')
        }
      } else {
        console.log('🕰 30s warning conditions not met')
      }
      
      // Check task start conditions
      console.log('🕰 Task start check:')
      console.log('- taskStart <= now:', taskStart <= now)
      console.log('- taskStart > now - 2000:', taskStart > now - 2000)
      console.log('- Combined condition:', taskStart <= now && taskStart > now - 2000)
      
      // Task is starting now or has just started (within 5 seconds for easier testing)
      if (taskStart <= now && taskStart > now - 5000) {
        console.log('✅ Task should start now!')
        console.log('🕰 Start alert key:', nextTask.local_id)
        console.log('🕰 Already alerted for start:', alertedTasks.has(nextTask.local_id))
        
        // Only show alert once per task
        if (!alertedTasks.has(nextTask.local_id)) {
          setAlertedTasks(prev => new Set(prev).add(nextTask.local_id))
          
          if (appState === 'active') {
            // App is in foreground - show alert based on autostart setting
            if (autoStart) {
              // Autostart mode - automatically start and offer cancel option
              Alert.alert(
                'Auto-Starting Task!',
                `"${nextTask.name}" is starting automatically...`,
                [
                  {
                    text: 'Cancel Start',
                    style: 'destructive',
                    onPress: () => {
                      console.log('User cancelled auto-start')
                      // Don't start the task
                    },
                  },
                  {
                    text: 'OK',
                    style: 'default',
                  },
                ]
              )
              
              // Auto-start the task immediately
              setTimeout(async () => {
                if (useSupabase) {
                  await updateTask(nextTask.local_id, { status: 'in_progress' })
                } else if (nextTask.user_id === 'internal_user') {
                  setInternalTasks(prev => prev.map(t => 
                    t.local_id === nextTask.local_id 
                      ? { ...t, status: 'in_progress' }
                      : t
                  ))
                }
              }, 100)
              
            } else {
              // Manual mode - offer start option
              Alert.alert(
                'Time to Start!',
                `It's time to start "${nextTask.name}"`,
                [
                  {
                    text: 'Start Task',
                    onPress: async () => {
                      // Manually start the task
                      if (useSupabase) {
                        await updateTask(nextTask.local_id, { status: 'in_progress' })
                      } else if (nextTask.user_id === 'internal_user') {
                        setInternalTasks(prev => prev.map(t => 
                          t.local_id === nextTask.local_id 
                            ? { ...t, status: 'in_progress' }
                            : t
                        ))
                      }
                    },
                  },
                  {
                    text: 'Do Nothing',
                    style: 'cancel',
                  },
                ]
              )
            }
          } else {
            // App is in background - send notification immediately
            console.log('📱 App in background, task should start, sending notification...')
            console.log('📱 Task:', nextTask.name, 'Start time:', nextTask.start_time)
            console.log('📱 Current time:', new Date().toISOString())
            console.log('📱 App state:', appState)
            
            // Send notification immediately using direct Expo API (most reliable)
            setTimeout(async () => {
              try {
                console.log('📱 Sending task start notification...')
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: `Time to Start: ${nextTask.name}`,
                    body: 'Your scheduled task is ready to begin!',
                    data: { taskId: nextTask.local_id, type: 'task_start' },
                  },
                  trigger: null, // Immediate
                })
                console.log('✅ Task start notification sent successfully')
              } catch (error) {
                console.error('❌ Task start notification failed:', error)
              }
            }, 100) // Small delay to ensure app state is properly detected
          }
        }
      }
    }

    // Check if current task has ended
    if (currentTask) {
      const now = currentTime.getTime()
      const taskEnd = new Date(currentTask.end_time!).getTime()
      
      // Task just ended (within 2 seconds) and we haven't alerted for this completion
      if (taskEnd <= now && taskEnd > now - 2000) {
        const completionKey = `${currentTask.local_id}_completion`
        if (!alertedTasks.has(completionKey)) {
          setAlertedTasks(prev => new Set(prev).add(completionKey))
          
          // Only auto-complete if autoStart is enabled
          if (autoStart) {
            console.log('Auto-completing task:', currentTask.name)
            
            // Send notification if app is in background
            if (appState !== 'active') {
              setTimeout(async () => {
                try {
                  console.log('📱 Sending auto-completion notification...')
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: `Auto-Completed: ${currentTask.name}`,
                      body: 'Your task time ended and was automatically marked as complete.',
                      data: { taskId: currentTask.local_id, type: 'auto_complete' },
                    },
                    trigger: null,
                  })
                  console.log('✅ Auto-completion notification sent')
                } catch (error) {
                  console.error('❌ Auto-completion notification failed:', error)
                }
              }, 100)
            }
            
            // Mark task as completed automatically
            if (useSupabase) {
              updateTask(currentTask.local_id, { 
                status: 'completed',
                completed_at: new Date().toISOString()
              }).catch(error => console.error('Error completing task:', error))
            } else if (currentTask.user_id === 'internal_user') {
              setInternalTasks(prev => prev.map(t => 
                t.local_id === currentTask.local_id 
                  ? { ...t, status: 'completed', completed_at: new Date().toISOString() }
                  : t
              ))
            }
          } else {
            // Manual mode - show alert to complete task if app is active, notification if backgrounded
            if (appState === 'active') {
              Alert.alert(
                'Task Time Ended',
                `"${currentTask.name}" time is up. Mark as completed?`,
                [
                  {
                    text: 'Complete Task',
                    onPress: async () => {
                      if (useSupabase) {
                        await updateTask(currentTask.local_id, { 
                          status: 'completed',
                          completed_at: new Date().toISOString()
                        })
                      } else if (currentTask.user_id === 'internal_user') {
                        setInternalTasks(prev => prev.map(t => 
                          t.local_id === currentTask.local_id 
                            ? { ...t, status: 'completed', completed_at: new Date().toISOString() }
                            : t
                        ))
                      }
                    },
                  },
                  {
                    text: 'Keep Running',
                    style: 'cancel',
                  },
                ]
              )
            } else {
              // App is in background - send task completion notification
              console.log('📱 App in background, task finished, sending completion notification...')
              console.log('📱 Task:', currentTask.name, 'End time:', currentTask.end_time)
              
              setTimeout(async () => {
                try {
                  console.log('📱 Sending task completion notification...')
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: `Task Completed: ${currentTask.name}`,
                      body: 'Your scheduled task time has ended. Tap to mark as complete or continue.',
                      data: { taskId: currentTask.local_id, type: 'task_complete' },
                    },
                    trigger: null, // Immediate
                  })
                  console.log('✅ Task completion notification sent successfully')
                } catch (error) {
                  console.error('❌ Task completion notification failed:', error)
                }
              }, 100)
            }
          }
        }
      }
    }
  }, [currentTask, nextTask, currentTime, appState, autoStart, useSupabase, updateTask, alertedTasks])

  const handleStartTask = async (task: Task) => {
    if (useSupabase) {
      await updateTask(task.local_id, { status: 'in_progress' })
    } else {
      // Update internal task status if it's from internal DB
      if (task.user_id === 'internal_user') {
        setInternalTasks(prev => prev.map(t => 
          t.local_id === task.local_id 
            ? { ...t, status: 'in_progress' }
            : t
        ))
      }
      // Note: sampleTasks are static and don't need updates
    }
  }

  return (
    <View style={styles.container}>
      {/* Header with Dev Toggle */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Schedule</Text>
          <View style={styles.autoStartToggle}>
            <Text style={styles.autoStartText}>Auto-Start</Text>
            <Switch
              value={autoStart}
              onValueChange={setAutoStart}
              trackColor={{ false: '#767577', true: '#4CAF50' }}
              thumbColor="#f4f3f4"
              style={styles.smallSwitch}
            />
          </View>
        </View>
        <View style={styles.headerRight}>
          {/* Force task start notification test */}
          <TouchableOpacity
            style={[styles.testButton, { backgroundColor: '#FF6B35' }]}
            onPress={async () => {
              try {
                console.log('📱 Force testing task start notification...')
                const testTaskName = nextTask?.name || 'Test Task'
                
                console.log('📱 Current app state:', appState)
                console.log('📱 Sending notification...')
                
                const result = await Notifications.scheduleNotificationAsync({
                  content: {
                    title: `Time to Start: ${testTaskName}`,
                    body: 'Your scheduled task is ready to begin! (Forced test)',
                    data: { type: 'force_task_start', timestamp: Date.now() },
                  },
                  trigger: null, // Immediate
                })
                
                console.log('📱 Notification result:', result)
                Alert.alert('🚀 Notification Sent!', `Check your notification panel for "${testTaskName}"`)
              } catch (error: any) {
                console.error('❌ Notification error:', error)
                Alert.alert('❌ Failed', `Error: ${error.message}`)
              }
            }}
          >
            <FontAwesome name="rocket" size={14} color="#fff" />
          </TouchableOpacity>
          
          {/* Force task completion notification test */}
          <TouchableOpacity
            style={[styles.testButton, { backgroundColor: '#9B59B6' }]}
            onPress={async () => {
              try {
                console.log('📱 Force testing task completion notification...')
                const testTaskName = currentTask?.name || 'Test Task'
                
                const result = await Notifications.scheduleNotificationAsync({
                  content: {
                    title: `Task Completed: ${testTaskName}`,
                    body: 'Your task time has ended. (Forced test)',
                    data: { type: 'force_task_complete', timestamp: Date.now() },
                  },
                  trigger: null,
                })
                
                console.log('📱 Completion notification result:', result)
                Alert.alert('🚀 Completion Sent!', `Check your notification panel for "${testTaskName}"`)
              } catch (error: any) {
                console.error('❌ Completion notification error:', error)
                Alert.alert('❌ Failed', `Error: ${error.message}`)
              }
            }}
          >
            <FontAwesome name="check" size={14} color="#fff" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.testButton}
            onPress={async () => {
              try {
                console.log('Testing Expo Go notifications...')
                
                // Request permissions
                const { status } = await Notifications.requestPermissionsAsync()
                console.log('Permission status:', status)
                
                if (status !== 'granted') {
                  Alert.alert('Permission Denied', 'Please enable notifications in your device settings to test.')
                  return
                }

                // Test immediate notification
                console.log('Sending immediate notification...')
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: 'Immediate Test',
                    body: 'This notification appeared instantly!',
                    data: { type: 'immediate' },
                  },
                  trigger: null, // Immediate
                })

                Alert.alert(
                  'Notification Test',
                  'Test notifications with 10-second delay',
                  [
                    {
                      text: 'Test 10s Delay',
                      onPress: async () => {
                        Alert.alert('⏰ Starting 10s Timer', 'Leave the app now! Notification will send in 10 seconds.')
                        
                        // Use JavaScript setTimeout for reliable delay in Expo Go
                        setTimeout(async () => {
                          try {
                            console.log('⏰ Sending delayed notification via JS timer...')
                            await Notifications.scheduleNotificationAsync({
                              content: {
                                title: '⏰ Scheduled Test',
                                body: 'This notification was sent after 10 seconds!',
                                data: { type: 'scheduled_test' },
                              },
                              trigger: null, // Immediate
                            })
                            console.log('✅ Delayed notification sent!')
                          } catch (error) {
                            console.error('❌ Delayed notification failed:', error)
                          }
                        }, 10000) // 10 seconds
                      }
                    },
                    { text: 'Cancel', style: 'cancel' }
                  ]
                )
              } catch (error: any) {
                console.error('Notification test failed:', error)
                Alert.alert(
                  'Test Failed', 
                  `Error: ${error?.message}\\n\\nMake sure you're using Expo Go and have notifications enabled.`
                )
              }
            }}
          >
            <FontAwesome name="bell" size={16} color="#fff" />
          </TouchableOpacity>
          
          <View style={styles.devToggle}>
            <Text style={styles.devToggleText}>
              {useSupabase ? 'Supabase' : 'Sample'}
            </Text>
            <Switch
              value={useSupabase}
              onValueChange={setUseSupabase}
              trackColor={{ false: '#767577', true: Colors.light.tint }}
              thumbColor="#f4f3f4"
            />
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={loading && useSupabase} 
            onRefresh={useSupabase ? syncNow : undefined} 
          />
        }
      >
        {/* Debug Section */}
        <View style={styles.debugSection}>
          <Text style={styles.debugTitle}>Debug Info</Text>
          <Text style={styles.debugText}>App State: {appState}</Text>
          <Text style={styles.debugText}>Auto Start: {autoStart ? 'ON' : 'OFF'}</Text>
          <Text style={styles.debugText}>Time: {currentTime.toLocaleTimeString()}</Text>
          <Text style={styles.debugText}>Data Source: {useSupabase ? 'Supabase' : internalTasks.length > 0 ? 'Internal DB' : 'Sample'}</Text>
          <Text style={styles.debugText}>Tasks Count: {tasks.length}</Text>
          {nextTask && (
            <>
              <Text style={styles.debugText}>
                Next: {nextTask.name} at {formatTaskTime(nextTask.start_time!)}
              </Text>
              <Text style={styles.debugText}>
                Countdown: {Math.round((new Date(nextTask.start_time!).getTime() - currentTime.getTime()) / 1000)}s
              </Text>
              {(() => {
                const now = currentTime.getTime()
                const taskStart = new Date(nextTask.start_time!).getTime()
                const startCondition = taskStart <= now && taskStart > now - 3000 && !currentTask
                const alreadyAlerted = alertedTasks.has(nextTask.local_id)
                return (
                  <Text style={[styles.debugText, startCondition && !alreadyAlerted && { backgroundColor: '#ccffcc' }]}>
                    Start: {taskStart <= now ? '✓' : '✗'} time, {taskStart > now - 3000 ? '✓' : '✗'} window, {!currentTask ? '✓' : '✗'} free, {appState !== 'active' ? '✓' : '✗'} bg
                  </Text>
                )
              })()} 
            </>
          )}
          <Text style={styles.debugText}>Alerts: {Array.from(alertedTasks).join(', ') || 'none'}</Text>
        </View>
        
        {/* Current Status Section */}
        <View style={styles.currentSection}>
          <Text style={styles.sectionTitle}>Now</Text>
          <View style={styles.currentCard}>
            {currentTask ? (
              <>
                <Text style={styles.currentTaskName}>{currentTask.name}</Text>
                <Text style={styles.currentTaskTime}>
                  {formatTaskTime(currentTask.start_time!)} - {formatTaskTime(currentTask.end_time!)}
                </Text>
                <View style={styles.timerContainer}>
                  <Text style={styles.timerLabel}>Time Remaining</Text>
                  <Text style={styles.timerText}>{formatTime(currentTaskRemaining)}</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.currentTaskName}>Free Time</Text>
                {nextTask && (
                  <>
                    <Text style={styles.freeTimeText}>Next task in</Text>
                    <Text style={styles.timerText}>{formatTime(timeUntilNext)}</Text>
                  </>
                )}
                {!nextTask && <Text style={styles.freeTimeText}>No upcoming tasks</Text>}
                {/* Show ready tasks that can be started manually */}
                {!currentTask && sortedTasks.some(shouldTaskStartNow) && (
                  <>
                    <Text style={styles.readyTasksHeader}>Ready to Start:</Text>
                    {sortedTasks.filter(shouldTaskStartNow).slice(0, 2).map((task) => (
                      <TouchableOpacity
                        key={task.local_id}
                        style={styles.readyTaskButton}
                        onPress={() => handleStartTask(task)}
                      >
                        <FontAwesome name="play" size={16} color="#fff" />
                        <Text style={styles.readyTaskButtonText}>{task.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </>
            )}
          </View>
        </View>

        {/* Next Task Section */}
        {nextTask && (
          <View style={styles.nextSection}>
            <Text style={styles.sectionTitle}>Next Up</Text>
            <View style={[
              styles.nextCard,
              isTaskAboutToStart(nextTask) && styles.aboutToStartCard,
              shouldTaskStartNow(nextTask) && styles.shouldStartCard
            ]}>
              <View style={styles.taskInfo}>
                <Text style={[
                  styles.nextTaskName,
                  shouldTaskStartNow(nextTask) && styles.shouldStartText
                ]}>{nextTask.name}</Text>
                <Text style={[
                  styles.nextTaskTime,
                  shouldTaskStartNow(nextTask) && styles.shouldStartSubtext
                ]}>
                  {formatTaskTime(nextTask.start_time!)} - {formatTaskTime(nextTask.end_time!)}
                </Text>
                {isTaskAboutToStart(nextTask) && (
                  <Text style={styles.aboutToStartText}>
                    Starting in {Math.ceil((new Date(nextTask.start_time!).getTime() - currentTime.getTime()) / 1000)}s
                  </Text>
                )}
                {shouldTaskStartNow(nextTask) && (
                  <Text style={styles.shouldStartText}>Ready to Start!</Text>
                )}
              </View>
              <View style={styles.actionButtons}>
                {shouldTaskStartNow(nextTask) && !autoStart && (
                  <TouchableOpacity
                    style={styles.startButton}
                    onPress={() => handleStartTask(nextTask)}
                  >
                    <FontAwesome name="play" size={16} color="#fff" />
                    <Text style={styles.startButtonText}>Start</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Upcoming Tasks */}
        {upcomingTasks.length > 1 && (
          <View style={styles.upcomingSection}>
            <Text style={styles.sectionTitle}>Upcoming</Text>
            {upcomingTasks.slice(1, 5).map((task) => (
              <TouchableOpacity
                key={task.local_id}
                style={[
                  styles.upcomingCard,
                  isTaskAboutToStart(task) && styles.aboutToStartCard,
                  shouldTaskStartNow(task) && styles.shouldStartCard
                ]}
              >
                <View style={styles.taskInfo}>
                  <Text style={[
                    styles.upcomingTaskName,
                    shouldTaskStartNow(task) && styles.shouldStartText
                  ]}>{task.name}</Text>
                  <Text style={[
                    styles.upcomingTaskTime,
                    shouldTaskStartNow(task) && styles.shouldStartSubtext
                  ]}>
                    {formatTaskTime(task.start_time!)} - {formatTaskTime(task.end_time!)}
                  </Text>
                  {isTaskAboutToStart(task) && (
                    <Text style={styles.aboutToStartText}>
                      Starting in {Math.ceil((new Date(task.start_time!).getTime() - currentTime.getTime()) / 1000)}s
                    </Text>
                  )}
                  {shouldTaskStartNow(task) && (
                    <Text style={styles.shouldStartIndicator}>Ready!</Text>
                  )}
                </View>
                <View style={styles.actionButtons}>
                  {shouldTaskStartNow(task) && !autoStart && (
                    <TouchableOpacity
                      style={[styles.startButton, styles.smallStartButton]}
                      onPress={() => handleStartTask(task)}
                    >
                      <FontAwesome name="play" size={12} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* No tasks message */}
        {sortedTasks.length === 0 && (
          <View style={styles.emptyContainer}>
            <FontAwesome name="calendar-o" size={60} color="#ccc" />
            <Text style={styles.emptyText}>No scheduled tasks</Text>
            <Text style={styles.emptySubtext}>
              {useSupabase ? 'Add tasks with start/end times' : 'No sample tasks available'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  autoStartToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  autoStartText: {
    fontSize: 12,
    color: '#666',
  },
  smallSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  devToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  devToggleText: {
    fontSize: 12,
    color: '#666',
  },
  testButton: {
    backgroundColor: Colors.light.tint,
    borderRadius: 20,
    padding: 8,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
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
  freeTimeText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 12,
  },
  readyTasksHeader: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    opacity: 0.9,
  },
  readyTaskButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  readyTaskButtonText: {
    color: '#fff',
    fontWeight: '500',
    fontSize: 14,
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
  },
  upcomingTaskName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  upcomingTaskTime: {
    fontSize: 13,
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
  debugSection: {
    backgroundColor: '#f8f9fa',
    margin: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#495057',
  },
  debugText: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 2,
  },
})