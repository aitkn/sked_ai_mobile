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
} from 'react-native'
import { Text } from '@/components/Themed'
import { useTaskContext } from '@/contexts/TaskContext'
import { Task } from '@/lib/offline/database'
import Colors from '@/constants/Colors'
import { FontAwesome } from '@expo/vector-icons'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

// Sample tasks for development mode
const SAMPLE_TASKS: Task[] = [
  {
    id: '1',
    local_id: 'sample_1',
    user_id: 'sample_user',
    name: 'Morning Workout',
    status: 'pending',
    start_time: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // Started 15 mins ago
    end_time: new Date(Date.now() + 1000 * 60 * 45).toISOString(), // Ends in 45 mins
    priority: 'high',
    sync_status: 'synced',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    local_id: 'sample_2',
    user_id: 'sample_user',
    name: 'Team Standup Meeting',
    status: 'pending',
    start_time: new Date(Date.now() + 1000 * 60 * 120).toISOString(), // 2 hours from now
    end_time: new Date(Date.now() + 1000 * 60 * 150).toISOString(), // 2.5 hours from now
    priority: 'high',
    sync_status: 'synced',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    local_id: 'sample_3',
    user_id: 'sample_user',
    name: 'Code Review',
    status: 'pending',
    start_time: new Date(Date.now() + 1000 * 60 * 180).toISOString(), // 3 hours from now
    end_time: new Date(Date.now() + 1000 * 60 * 240).toISOString(), // 4 hours from now
    priority: 'medium',
    sync_status: 'synced',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '4',
    local_id: 'sample_4',
    user_id: 'sample_user',
    name: 'Lunch Break',
    status: 'pending',
    start_time: new Date(Date.now() + 1000 * 60 * 270).toISOString(), // 4.5 hours from now
    end_time: new Date(Date.now() + 1000 * 60 * 330).toISOString(), // 5.5 hours from now
    priority: 'low',
    sync_status: 'synced',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

export default function ScheduleScreen() {
  const { tasks: supabaseTasks, loading, syncing, updateTask, syncNow } = useTaskContext()
  const [useSupabase, setUseSupabase] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [sampleTasks, setSampleTasks] = useState<Task[]>(SAMPLE_TASKS)
  const timerRef = useRef<NodeJS.Timeout>()

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

  // Get tasks based on mode
  const tasks = useSupabase ? supabaseTasks : sampleTasks

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
    return now >= startTime && now < endTime
  })

  const upcomingTasks = sortedTasks.filter(task => {
    if (!task.start_time) return false
    const startTime = new Date(task.start_time).getTime()
    const now = currentTime.getTime()
    return startTime > now
  })

  const nextTask = upcomingTasks[0]

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

  // Swap task times
  const swapWithCurrent = async (task: Task) => {
    if (!currentTask) return

    Alert.alert(
      'Swap Tasks',
      `Swap "${currentTask.name}" with "${task.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Swap',
          onPress: async () => {
            // Swap start and end times
            const currentStart = currentTask.start_time
            const currentEnd = currentTask.end_time
            const taskStart = task.start_time
            const taskEnd = task.end_time

            if (useSupabase) {
              // Update via Supabase
              await updateTask(currentTask.local_id, {
                start_time: taskStart,
                end_time: taskEnd,
              })

              await updateTask(task.local_id, {
                start_time: currentStart,
                end_time: currentEnd,
              })
            } else {
              // Update sample tasks locally
              setSampleTasks(prevTasks => {
                return prevTasks.map(t => {
                  if (t.local_id === currentTask.local_id) {
                    return { ...t, start_time: taskStart, end_time: taskEnd }
                  } else if (t.local_id === task.local_id) {
                    return { ...t, start_time: currentStart, end_time: currentEnd }
                  }
                  return t
                })
              })
            }
          },
        },
      ]
    )
  }

  const formatTime = (time: { hours: number; minutes: number; seconds: number }) => {
    return `${time.hours.toString().padStart(2, '0')}:${time.minutes
      .toString()
      .padStart(2, '0')}:${time.seconds.toString().padStart(2, '0')}`
  }

  const formatTaskTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <View style={styles.container}>
      {/* Header with Dev Toggle */}
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
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
              </>
            )}
          </View>
        </View>

        {/* Next Task Section */}
        {nextTask && (
          <View style={styles.nextSection}>
            <Text style={styles.sectionTitle}>Next Up</Text>
            <View style={styles.nextCard}>
              <View style={styles.taskInfo}>
                <Text style={styles.nextTaskName}>{nextTask.name}</Text>
                <Text style={styles.nextTaskTime}>
                  {formatTaskTime(nextTask.start_time!)} - {formatTaskTime(nextTask.end_time!)}
                </Text>
              </View>
              {currentTask && (
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={() => swapWithCurrent(nextTask)}
                >
                  <FontAwesome name="play-circle" size={40} color={Colors.light.tint} />
                </TouchableOpacity>
              )}
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
                style={styles.upcomingCard}
                onPress={() => currentTask && swapWithCurrent(task)}
                disabled={!currentTask}
              >
                <View style={styles.taskInfo}>
                  <Text style={styles.upcomingTaskName}>{task.name}</Text>
                  <Text style={styles.upcomingTaskTime}>
                    {formatTaskTime(task.start_time!)} - {formatTaskTime(task.end_time!)}
                  </Text>
                </View>
                {currentTask && (
                  <FontAwesome name="play-circle-o" size={28} color="#666" />
                )}
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
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
  playButton: {
    padding: 8,
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
})