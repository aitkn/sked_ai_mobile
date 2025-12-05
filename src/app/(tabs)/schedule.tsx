import React, { useState, useEffect, useCallback } from 'react'
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native'
import { Text } from '@/components/Themed'
import { Task } from '@/lib/offline/database'
import { FontAwesome } from '@expo/vector-icons'
import ThemedIcon from '@/components/ThemedIcon'
import { useTheme } from '@/contexts/ThemeContext'
import { internalDB, InternalTask, InternalDB } from '@/lib/internal-db'
import { supabase } from '@/lib/supabase'
import { useFocusEffect } from 'expo-router'
import { GlassMorphism } from '@/components/GlassMorphism'
import { ThemedGradient } from '@/components/ThemedGradient'
import { syncTasksFromSupabase } from '@/lib/sync/TaskSyncService'

// Helper function to convert InternalTask to Task format
const convertInternalTaskToTask = (internalTask: InternalTask): Task => ({
  id: internalTask.id,
  local_id: internalTask.id,
  user_id: 'internal_user',
  name: internalTask.name,
  status: internalTask.status as any,
  start_time: internalTask.start_time,
  end_time: internalTask.end_time,
  completed_at: internalTask.completed_at,
  priority: internalTask.priority,
  sync_status: 'synced',
  created_at: internalTask.created_at,
  updated_at: internalTask.updated_at,
})

const TASK_GRANULARITY = 600 // 10 minutes in seconds
const HALF_GRANULARITY = TASK_GRANULARITY / 2

export default function TaskViewScreen() {
  const { actualTheme, colors } = useTheme()
  const [internalTasks, setInternalTasks] = useState<Task[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())

  // Load internal tasks
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

  // Load timeline data from Supabase
  const loadTimelineData = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        console.log('📡 No authenticated user, skipping timeline fetch')
        return
      }

      const { data: timeline, error } = await supabase
        .schema('skedai')
        .from('user_timeline')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        if (error.code === '42501' || error.message?.includes('permission denied')) {
          return
        }
        console.log('📡 No timeline found or error:', error.message)
        return
      }

      if (timeline && timeline.timeline_json) {
        const timelineTasks = timeline.timeline_json.tasks || []
        await syncTasksWithTimeline(timelineTasks)
      }
      
      loadInternalTasks()
    } catch (error) {
      console.error('📡 Error loading timeline data:', error)
    }
  }

  // Sync tasks with timeline
  const syncTasksWithTimeline = async (timelineTasks: any[]) => {
    const currentTasks = await internalDB.getAllTasks()
    const timelineTaskMap = new Map(
      timelineTasks.map(t => [
        t.id || t.task_id || `timeline-${Date.now()}-${Math.random()}`,
        t
      ])
    )
    const existingTaskIds = new Set(currentTasks.map(t => t.id))
    
    for (const [taskId, timelineTask] of Array.from(timelineTaskMap)) {
      if (!existingTaskIds.has(taskId)) {
        const isDeleted = await internalDB.isTaskDeleted(taskId)
        if (isDeleted) continue
        
        const newTask = {
          id: taskId,
          name: timelineTask.name || timelineTask.title || 'Unnamed Task',
          status: 'pending' as const,
          priority: (timelineTask.priority || 'medium') as 'low' | 'medium' | 'high',
          start_time: timelineTask.start_time,
          end_time: timelineTask.end_time,
          duration: timelineTask.duration || InternalDB.calculateDuration(timelineTask.start_time, timelineTask.end_time),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        await internalDB.saveTask(newTask)
      }
    }
  }

  useEffect(() => {
    loadInternalTasks()
    loadTimelineData()
    const interval = setInterval(loadInternalTasks, 2000)
    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => {
      clearInterval(interval)
      clearInterval(timeInterval)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadInternalTasks()
    }, [])
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await loadTimelineData()
    await loadInternalTasks()
    setRefreshing(false)
  }

  // Get all tasks with start times, sorted by start time
  const allTasksWithTimes = [...internalTasks]
    .filter(task => task.start_time)
    .sort((a, b) => {
      const aTime = new Date(a.start_time!).getTime()
      const bTime = new Date(b.start_time!).getTime()
      return aTime - bTime
    })

  // Handle completing a task
  const handleCompleteTask = async (task: Task) => {
    if (task.user_id === 'internal_user') {
      try {
        const completedAt = new Date().toISOString()
        await internalDB.updateTask(task.local_id, { 
          status: 'completed', 
          completed_at: completedAt 
        })
        await internalDB.addAction({
          action_type: 'task_completed',
          task_id: task.local_id,
          task_name: task.name,
          details: `Completed at ${new Date().toLocaleTimeString()}`
        })
        await loadInternalTasks()
        console.log(`✅ Completed task: ${task.name}`)
      } catch (error) {
        console.error('❌ Error completing task:', error)
        Alert.alert('Error', 'Failed to complete task')
      }
    }
  }

  // Handle marking a task as failed
  const handleFailTask = async (task: Task) => {
    if (task.user_id === 'internal_user') {
      try {
        const failedAt = new Date().toISOString()
        await internalDB.updateTask(task.local_id, { 
          status: 'failed', 
          failed_at: failedAt 
        })
        await internalDB.addAction({
          action_type: 'task_skipped',
          task_id: task.local_id,
          task_name: task.name,
          details: `Marked as failed at ${new Date().toLocaleTimeString()} - task time expired without being started`
        })
        await loadInternalTasks()
        console.log(`❌ Marked task as failed: ${task.name}`)
      } catch (error) {
        console.error('❌ Error marking task as failed:', error)
      }
    }
  }

  // Auto-complete or fail tasks based on their status and end time
  useEffect(() => {
    const checkAndUpdateTasks = async () => {
      // Get fresh tasks from database to avoid stale data
      const freshTasks = await internalDB.getAllTasks()
      const tasksWithTimes = freshTasks
        .filter(task => task.start_time)
        .map(convertInternalTaskToTask)
      
      const now = currentTime.getTime()
      let hasUpdates = false
      
      for (const task of tasksWithTimes) {
        if (!task.start_time || !task.end_time) continue
        
        const taskEnd = new Date(task.end_time).getTime()
        const hasExpired = now > taskEnd
        
        if (!hasExpired) continue // Task hasn't expired yet
        
        // Skip if already in correct final state
        if (task.status === 'completed' || task.status === 'failed') continue
        
        // Task has expired - handle based on status
        if (task.status === 'in_progress') {
          // Started task that expired - auto-complete
          const completedAt = new Date().toISOString()
          await internalDB.updateTask(task.local_id, { 
            status: 'completed', 
            completed_at: completedAt 
          })
          await internalDB.addAction({
            action_type: 'task_completed',
            task_id: task.local_id,
            task_name: task.name,
            details: `Auto-completed at ${new Date().toLocaleTimeString()} - task time expired`
          })
          console.log(`✅ Auto-completed expired task: ${task.name}`)
          hasUpdates = true
        } else if (task.status === 'pending') {
          // Never started task that expired - mark as failed
          const failedAt = new Date().toISOString()
          await internalDB.updateTask(task.local_id, { 
            status: 'failed', 
            failed_at: failedAt 
          })
          await internalDB.addAction({
            action_type: 'task_skipped',
            task_id: task.local_id,
            task_name: task.name,
            details: `Auto-marked as failed at ${new Date().toLocaleTimeString()} - task time expired without being started`
          })
          console.log(`❌ Auto-marked expired task as failed: ${task.name}`)
          hasUpdates = true
        }
      }
      
      // Only reload tasks if we made updates (to avoid unnecessary re-renders)
      if (hasUpdates) {
        await loadInternalTasks()
      }
    }
    
    // Check every second (matching currentTime update frequency) for expired tasks
    const interval = setInterval(checkAndUpdateTasks, 1000)
    checkAndUpdateTasks() // Run immediately
    
    return () => clearInterval(interval)
  }, [currentTime]) // Only depend on currentTime, fetch fresh tasks inside

  // Find current task (in progress and actually within its time window)
  const runningTask = allTasksWithTimes.find(task => {
    if (!task.start_time || !task.end_time) return false
    if (task.status !== 'in_progress') return false
    
    // Only show as running if we're actually within the task's time window
    const now = currentTime.getTime()
    const taskStart = new Date(task.start_time).getTime()
    const taskEnd = new Date(task.end_time).getTime()
    
    // Task should be running if current time is between start and end
    return now >= taskStart && now < taskEnd
  })

  // Check if a task should be started now (within half-granularity of start time)
  const shouldTaskStartNow = (task: Task) => {
    if (!task.start_time || !task.end_time) return false
    const now = currentTime.getTime()
    const taskStart = new Date(task.start_time).getTime()
    const taskEnd = new Date(task.end_time).getTime()
    
    if (taskEnd <= now) return false
    if (task.status === 'in_progress' || task.status === 'completed') return false
    
    const timeUntilStart = taskStart - now
    return timeUntilStart <= HALF_GRANULARITY * 1000
  }

  // Get upcoming tasks
  const upcomingTasks = allTasksWithTimes.filter(task => {
    if (!task.start_time || task.status === 'completed' || (task.status as string) === 'cancelled') return false
    if (task.status === 'in_progress' || (task.status as string) === 'paused') return false
    const startTime = new Date(task.start_time).getTime()
    const now = currentTime.getTime()
    return startTime > now
  })

  const nextTask = upcomingTasks[0]
  const readyToStartTasks = allTasksWithTimes.filter(shouldTaskStartNow)

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

  const timeUntilNext = getTimeUntilNext()

  // Get current task remaining time
  const getCurrentTaskRemaining = () => {
    if (!runningTask || !runningTask.end_time) {
      return { hours: 0, minutes: 0, seconds: 0, total: 0 }
    }
    const now = currentTime.getTime()
    const endTime = new Date(runningTask.end_time).getTime()
    const diff = endTime - now
    const isOvertime = diff <= 0
    
    if (isOvertime) {
      return { hours: 0, minutes: 0, seconds: 0, total: 0, isOvertime: true }
    }
    
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)
    return { hours, minutes, seconds, total: diff, isOvertime: false }
  }

  const currentTaskRemaining = getCurrentTaskRemaining()

  // Handle starting a task
  const handleStartTask = async (task: Task) => {
    if (task.user_id === 'internal_user') {
      try {
        await internalDB.updateTask(task.local_id, { status: 'in_progress' })
        await internalDB.addAction({
          action_type: 'task_started',
          task_id: task.local_id,
          task_name: task.name,
          details: `Started at ${new Date().toLocaleTimeString()}`
        })
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
  }

  const formatTime = (time: { hours: number; minutes: number; seconds: number }) => {
    return `${time.hours.toString().padStart(2, '0')}:${time.minutes
      .toString()
      .padStart(2, '0')}:${time.seconds.toString().padStart(2, '0')}`
  }


  const formatTimeUntil = (milliseconds: number) => {
    if (milliseconds <= 0) return 'Starting soon'
    const totalSeconds = Math.ceil(milliseconds / 1000)
    const totalMinutes = Math.ceil(totalSeconds / 60)
    const totalHours = Math.floor(totalMinutes / 60)
    
    if (totalSeconds < 60) {
      return `${totalSeconds}s`
    }
    if (totalMinutes < 60) {
      return `${totalMinutes}m`
    }
    const remainingMinutes = totalMinutes % 60
    if (remainingMinutes === 0) {
      return `${totalHours}h`
    }
    return `${totalHours}h ${remainingMinutes}m`
  }

  // Group tasks by status
  const failedTasks = internalTasks.filter(t => (t.status as string) === 'failed')
  const scheduledTasks = internalTasks.filter(t => t.status === 'pending')
  const completedTasks = internalTasks.filter(t => t.status === 'completed')

  // Handle status change
  const handleStatusChange = async (task: Task, newStatus: 'failed' | 'pending' | 'completed') => {
    try {
      const timestamp = new Date().toISOString()
      const updates: any = { status: newStatus }
      
      if (newStatus === 'completed') {
        updates.completed_at = timestamp
      } else if (newStatus === 'failed') {
        updates.failed_at = timestamp
      }

      await internalDB.updateTask(task.local_id, updates)
      await internalDB.addAction({
        action_type: newStatus === 'completed' ? 'task_completed' : 'task_skipped',
        task_id: task.local_id,
        task_name: task.name,
        details: `Status changed to ${newStatus} at ${new Date().toLocaleTimeString()}`
      })
      
      await loadInternalTasks()
      setShowStatusMenu(false)
      setSelectedTask(null)
    } catch (error) {
      console.error('Error changing task status:', error)
      Alert.alert('Error', 'Failed to update task status')
    }
  }

  const formatTaskTimeShort = (dateString: string) => {
    const date = new Date(dateString)
    // For very short tasks (< 1 minute), show seconds too
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'failed': return '#EF5350'
      case 'completed': return '#4CAF50'
      case 'pending': return '#FFA726'
      default: return colors.tint
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'failed': return 'times-circle'
      case 'completed': return 'check-circle'
      case 'pending': return 'clock-o'
      default: return 'circle'
    }
  }

  const renderTaskItem = (task: Task) => (
    <TouchableOpacity
      key={task.local_id}
      onPress={() => {
        setSelectedTask(task)
        setShowStatusMenu(true)
      }}
      activeOpacity={0.7}
    >
      <GlassMorphism
        intensity={actualTheme === 'dark' ? 'medium' : 'light'}
        style={{
          ...styles.taskItem,
          borderLeftColor: getStatusColor(task.status as string),
          backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)',
        }}
        borderRadius={12}
      >
        <View style={styles.taskContent}>
          <View style={styles.taskHeader}>
            <Text style={[styles.taskName, { color: colors.text }]}>{task.name}</Text>
            <FontAwesome 
              name={getStatusIcon(task.status as string) as any} 
              size={20} 
              color={getStatusColor(task.status as string)} 
            />
          </View>
          <View style={styles.taskDetails}>
            <Text style={[styles.taskTime, { color: colors.textSecondary }]}>
              {task.start_time ? formatTaskTimeShort(task.start_time) : 'No time'} - {task.end_time ? formatTaskTimeShort(task.end_time) : 'No time'}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(task.status as string) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(task.status as string) }]}>
                {task.status}
              </Text>
            </View>
          </View>
        </View>
      </GlassMorphism>
    </TouchableOpacity>
  )

  // Debug: Log current time for troubleshooting
  useEffect(() => {
    const logTime = () => {
      const now = new Date()
      console.log('🕐 Current App Time:', {
        iso: now.toISOString(),
        local: now.toLocaleString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: now.getTime()
      })
    }
    logTime()
    const interval = setInterval(logTime, 60000) // Log every minute
    return () => clearInterval(interval)
  }, [])

  return (
    <ThemedGradient style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Ready to Start Section */}
        {!runningTask && readyToStartTasks.length > 0 && (
          <View style={styles.readySection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Ready to Start</Text>
            {readyToStartTasks.map((task) => (
              <GlassMorphism key={task.local_id} style={{ ...styles.readyCard, backgroundColor: '#4CAF50' }} intensity="strong">
                <View style={styles.taskInfo}>
                  <Text style={[styles.readyTaskName, { color: '#fff' }]}>{task.name}</Text>
                  <Text style={[styles.readyTaskTime, { color: '#fff' }]}>
                    {formatTaskTimeShort(task.start_time!)} - {formatTaskTimeShort(task.end_time!)}
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
          {runningTask ? (
            <GlassMorphism style={{
              ...styles.currentCard, 
              backgroundColor: currentTaskRemaining.isOvertime ? '#ff6b35' : '#FFA726',
            }} intensity="extra-strong">
              <Text style={styles.currentTaskName}>{runningTask.name}</Text>
              <Text style={styles.currentTaskTime}>
                {formatTaskTimeShort(runningTask.start_time!)} - {formatTaskTimeShort(runningTask.end_time!)}
              </Text>
              <View style={styles.timerContainer}>
                <Text style={styles.timerLabel}>
                  {currentTaskRemaining.isOvertime ? 'Time Up' : 'Time Remaining'}
                </Text>
                <Text style={[
                  styles.timerText,
                  currentTaskRemaining.isOvertime && styles.overtimeText
                ]}>
                  {formatTime(currentTaskRemaining)}
                </Text>
              </View>
            </GlassMorphism>
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

        {/* Next Task Section */}
        {nextTask && !shouldTaskStartNow(nextTask) && (
          <View style={styles.nextSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Next Up</Text>
            <GlassMorphism style={styles.nextCard} intensity="medium">
              <View style={styles.taskInfo}>
                <Text style={[styles.nextTaskName, { color: colors.text }]}>{nextTask.name}</Text>
                <Text style={[styles.nextTaskTime, { color: colors.textSecondary }]}>
                  {formatTaskTimeShort(nextTask.start_time!)} - {formatTaskTimeShort(nextTask.end_time!)}
                </Text>
                <Text style={[styles.aboutToStartText, { color: colors.textSuccess }]}>
                  Starting in {formatTimeUntil(new Date(nextTask.start_time!).getTime() - currentTime.getTime())}
                </Text>
              </View>
            </GlassMorphism>
          </View>
        )}

        {/* Summary Section */}
        <GlassMorphism intensity={actualTheme === 'dark' ? 'strong' : 'strong'} style={styles.summarySection}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>Task Overview</Text>
          <View style={styles.summaryGrid}>
            <View style={[styles.summaryCard, { backgroundColor: '#EF535020' }]}>
              <Text style={[styles.summaryNumber, { color: '#EF5350' }]}>{failedTasks.length}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Failed</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#FFA72620' }]}>
              <Text style={[styles.summaryNumber, { color: '#FFA726' }]}>{scheduledTasks.length}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Scheduled</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#4CAF5020' }]}>
              <Text style={[styles.summaryNumber, { color: '#4CAF50' }]}>{completedTasks.length}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Completed</Text>
            </View>
          </View>
        </GlassMorphism>

        {/* Failed Tasks Section */}
        {failedTasks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome name="times-circle" size={18} color="#EF5350" />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Failed Tasks ({failedTasks.length})
              </Text>
            </View>
            {failedTasks.map(renderTaskItem)}
          </View>
        )}

        {/* Scheduled Tasks Section */}
        {scheduledTasks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome name="clock-o" size={18} color="#FFA726" />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Scheduled Tasks ({scheduledTasks.length})
              </Text>
            </View>
            {scheduledTasks.map(renderTaskItem)}
          </View>
        )}

        {/* Completed Tasks Section */}
        {completedTasks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome name="check-circle" size={18} color="#4CAF50" />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Completed Tasks ({completedTasks.length})
              </Text>
            </View>
            {completedTasks.map(renderTaskItem)}
          </View>
        )}

        {/* Empty State */}
        {internalTasks.length === 0 && (
          <View style={styles.emptyContainer}>
            <FontAwesome name="tasks" size={60} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No tasks yet</Text>
            <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>
              Tasks will appear here once they're created
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Status Change Modal */}
      {showStatusMenu && selectedTask && (
        <View style={styles.modalOverlay}>
          <View 
            style={[
              styles.modalContent,
              {
                backgroundColor: actualTheme === 'dark' ? '#1a1a1a' : '#ffffff',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>Change Task Status</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              {selectedTask.name}
            </Text>
            
            <TouchableOpacity
              style={[styles.statusOption, { backgroundColor: '#EF5350' }]}
              onPress={() => handleStatusChange(selectedTask, 'failed')}
            >
              <FontAwesome name="times-circle" size={20} color="#ffffff" />
              <Text style={[styles.statusOptionText, { color: '#ffffff' }]}>Mark as Failed</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statusOption, { backgroundColor: '#FFA726' }]}
              onPress={() => handleStatusChange(selectedTask, 'pending')}
            >
              <FontAwesome name="clock-o" size={20} color="#ffffff" />
              <Text style={[styles.statusOptionText, { color: '#ffffff' }]}>Mark as Scheduled</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statusOption, { backgroundColor: '#4CAF50' }]}
              onPress={() => handleStatusChange(selectedTask, 'completed')}
            >
              <FontAwesome name="check-circle" size={20} color="#ffffff" />
              <Text style={[styles.statusOptionText, { color: '#ffffff' }]}>Mark as Completed</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.cancelButton, 
                { 
                  backgroundColor: actualTheme === 'dark' ? '#2a2a2a' : '#f0f0f0',
                  borderWidth: 1,
                  borderColor: actualTheme === 'dark' ? '#444' : '#e0e0e0',
                }
              ]}
              onPress={() => {
                setShowStatusMenu(false)
                setSelectedTask(null)
              }}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ThemedGradient>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  summarySection: {
    margin: 20,
    marginBottom: 10,
    padding: 20,
    borderRadius: 20,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  taskItem: {
    marginBottom: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  taskContent: {
    flex: 1,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  taskName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  taskDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskTime: {
    fontSize: 14,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    margin: 20,
    padding: 24,
    minWidth: 300,
    borderRadius: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  statusOptionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
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
  overtimeText: {
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
  taskInfo: {
    flex: 1,
  },
})
