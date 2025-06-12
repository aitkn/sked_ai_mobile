import React, { useState, useEffect, useRef } from 'react'
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  AppState,
} from 'react-native'
import { Text } from '@/components/Themed'
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
  const timerRef = useRef<NodeJS.Timeout | number | null>(null)
  const expoNotificationService = useRef(new ExpoNotificationService()).current

  // Load internal tasks when component mounts
  useEffect(() => {
    loadInternalTasks()
    // Refresh internal tasks every 5 seconds
    const interval = setInterval(loadInternalTasks, 5000)
    return () => clearInterval(interval)
  }, [])

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
              opensAppToForeground: true,
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
              opensAppToForeground: true,
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

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification interaction:', response)
      console.log('Action identifier:', response.actionIdentifier)
      console.log('Notification content:', response.notification.request.content)
      
      const actionIdentifier = response.actionIdentifier
      const notificationTitle = response.notification.request.content.title
      
      if (actionIdentifier === 'open_app') {
        Alert.alert(
          'Welcome Back!',
          `You used "Take me back to the app" from "${notificationTitle}"\n\nNotifications are working perfectly!`
        )
      } else if (actionIdentifier === 'ok_action') {
        // User tapped OK - just log it, don't show alert since app might be backgrounded
        console.log(`User tapped OK on notification: ${notificationTitle}`)
      } else if (actionIdentifier === 'start_task') {
        const taskId = response.notification.request.content.data?.taskId
        Alert.alert(
          'Start Task Action',
          `You pressed "Start Task" from the notification!\n\nTask ID: ${taskId}\n\nIn a full implementation, this would start the task automatically.`,
          [{ text: 'OK' }]
        )
      } else if (actionIdentifier === 'complete_task') {
        const taskId = response.notification.request.content.data?.taskId
        Alert.alert(
          'Complete Task Action',
          `You pressed "Mark Complete" from the notification!\n\nTask ID: ${taskId}\n\nIn a full implementation, this would mark the task as complete.`,
          [{ text: 'OK' }]
        )
      } else if (actionIdentifier === 'dismiss' || actionIdentifier === 'keep_running') {
        // User dismissed or chose to keep running - just log it
        console.log(`User chose ${actionIdentifier} for notification: ${notificationTitle}`)
      } else {
        // Default tap (on notification body)
        Alert.alert(
          'Notification Tapped!', 
          `You tapped: ${notificationTitle}\n\nThis proves notifications are working!`
        )
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

  // Track app state
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      setAppState(nextAppState)
    })

    return () => {
      subscription.remove()
    }
  }, [])


  // Always use internal DB, fallback to sample tasks if empty
  const tasks = internalTasks.length > 0 ? internalTasks : sampleTasks

  // Sort tasks by start time
  const sortedTasks = [...tasks]
    .filter(task => !task.deleted_at && task.status !== 'completed')
    .filter(task => task.start_time) // Only show tasks with start times
    .sort((a, b) => {
      const aTime = new Date(a.start_time!).getTime()
      const bTime = new Date(b.start_time!).getTime()
      return aTime - bTime
    })

  // Find current task (only manually started tasks)
  const currentTask = sortedTasks.find(task => {
    if (!task.start_time || !task.end_time) return false
    const startTime = new Date(task.start_time).getTime()
    const endTime = new Date(task.end_time).getTime()
    const now = currentTime.getTime()
    
    // Only consider manually started tasks as current
    return task.status === 'in_progress' && now >= startTime && now < endTime
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
    if (!task.start_time || !task.end_time) return false
    const now = currentTime.getTime()
    const taskStart = new Date(task.start_time).getTime()
    const taskEnd = new Date(task.end_time).getTime()
    
    // Task should not be startable if:
    // 1. It hasn't reached start time yet
    // 2. It's already past end time (task window has passed)
    // 3. It's already in progress or completed
    if (taskStart > now || taskEnd <= now) return false
    if (task.status === 'in_progress' || task.status === 'completed') return false
    
    return taskStart <= now
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

  // Check for task notifications (manual start only)
  useEffect(() => {
    // Send notifications when tasks are ready to start, but don't auto-start them
    if (nextTask && !currentTask) {
      const now = currentTime.getTime()
      const taskStart = new Date(nextTask.start_time!).getTime()
      
      // Task is ready to start (within 5 seconds of start time)
      if (taskStart <= now && taskStart > now - 5000) {
        // Only notify once per task
        if (!alertedTasks.has(nextTask.local_id)) {
          setAlertedTasks(prev => new Set(prev).add(nextTask.local_id))
          
          if (appState === 'active') {
            // App is in foreground - show manual start option
            Alert.alert(
              'Time to Start!',
              `It's time to start "${nextTask.name}"`,
              [
                {
                  text: 'Start Task',
                  onPress: async () => {
                    // Manually start the task
                    if (nextTask.user_id === 'internal_user') {
                      try {
                        await internalDB.updateTask(nextTask.local_id, { status: 'in_progress' })
                        setInternalTasks(prev => prev.map(t => 
                          t.local_id === nextTask.local_id 
                            ? { ...t, status: 'in_progress' }
                            : t
                        ))
                        console.log(`✅ Manually started task: ${nextTask.name}`)
                      } catch (error) {
                        console.error('❌ Error manually starting task:', error)
                      }
                    }
                  },
                },
                {
                  text: 'Skip',
                  style: 'cancel',
                },
              ]
            )
          } else {
            // App is in background - send notification
            setTimeout(async () => {
              try {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: `Time to Start: ${nextTask.name}`,
                    body: 'Tap to start your scheduled task!',
                    data: { taskId: nextTask.local_id, type: 'task_start' },
                    categoryIdentifier: 'task_start',
                  },
                  trigger: null,
                })
                console.log('✅ Task start notification sent')
              } catch (error) {
                console.error('❌ Task start notification failed:', error)
              }
            }, 100)
          }
        }
      }
    }

    // Check if current task has ended and offer manual completion
    if (currentTask) {
      const now = currentTime.getTime()
      const taskEnd = new Date(currentTask.end_time!).getTime()
      
      // Task just ended (within 2 seconds) and we haven't alerted for this completion
      if (taskEnd <= now && taskEnd > now - 2000) {
        const completionKey = `${currentTask.local_id}_completion`
        if (!alertedTasks.has(completionKey)) {
          setAlertedTasks(prev => new Set(prev).add(completionKey))
          
          if (appState === 'active') {
            // Show manual completion option
            Alert.alert(
              'Task Time Ended',
              `"${currentTask.name}" time is up. Mark as completed?`,
              [
                {
                  text: 'Complete Task',
                  onPress: async () => {
                    if (currentTask.user_id === 'internal_user') {
                      try {
                        const completedAt = new Date().toISOString()
                        await internalDB.updateTask(currentTask.local_id, { 
                          status: 'completed', 
                          completed_at: completedAt 
                        })
                        setInternalTasks(prev => prev.map(t => 
                          t.local_id === currentTask.local_id 
                            ? { ...t, status: 'completed', completed_at: completedAt }
                            : t
                        ))
                        console.log(`✅ Manually completed task: ${currentTask.name}`)
                      } catch (error) {
                        console.error('❌ Error manually completing task:', error)
                      }
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
            // App is in background - send completion notification
            setTimeout(async () => {
              try {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: `Task Time Ended: ${currentTask.name}`,
                    body: 'Tap to mark as complete or continue running.',
                    data: { taskId: currentTask.local_id, type: 'task_complete' },
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
  }, [currentTask, nextTask, currentTime, appState, alertedTasks])

  const handleStartTask = async (task: Task) => {
    // Update internal task status if it's from internal DB
    if (task.user_id === 'internal_user') {
      try {
        // Update in AsyncStorage first
        await internalDB.updateTask(task.local_id, { status: 'in_progress' })
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

  return (
    <View style={styles.container}>
      {/* Header with Dev Toggle */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Schedule</Text>
        </View>
        <View style={styles.headerRight}>
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
                    categoryIdentifier: 'test_notification',
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
                                categoryIdentifier: 'test_notification',
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
        </View>
      </View>

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
        {/* Debug Section */}
        <View style={styles.debugSection}>
          <Text style={styles.debugTitle}>Debug Info</Text>
          <Text style={styles.debugText}>App State: {appState}</Text>
          <Text style={styles.debugText}>Mode: Manual Start Only</Text>
          <Text style={styles.debugText}>Time: {currentTime.toLocaleTimeString()}</Text>
          <Text style={styles.debugText}>Data Source: {internalTasks.length > 0 ? 'Internal DB' : 'Sample'}</Text>
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
                {shouldTaskStartNow(nextTask) && (
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
                  {shouldTaskStartNow(task) && (
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
              Use the Dev tab to add test tasks
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