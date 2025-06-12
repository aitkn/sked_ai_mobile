import React, { useState, useEffect } from 'react'
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
import { internalDB, InternalTask } from '@/lib/internal-db'

export default function DevScreen() {
  const [tasks, setTasks] = useState<InternalTask[]>([])
  const [loading, setLoading] = useState(false)

  // Load tasks when component mounts
  useEffect(() => {
    loadTasks()
  }, [])

  const loadTasks = async () => {
    try {
      const allTasks = await internalDB.getAllTasks()
      setTasks(allTasks)
    } catch (error) {
      console.error('Error loading tasks:', error)
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

  const handleResetNotifications = () => {
    // TODO: This functionality will be implemented later
    Alert.alert(
      'Not Implemented',
      'This feature will reset notification permissions and settings. Coming soon!',
      [{ text: 'OK' }]
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Task Testing</Text>
          <Text style={styles.sectionDescription}>
            Tools for quickly testing task notifications and timing
          </Text>
          
          <TouchableOpacity 
            style={[styles.button, loading && styles.disabledButton]} 
            onPress={handleAddQuickTask}
            disabled={loading}
          >
            <FontAwesome name="plus" size={16} color="#fff" />
            <Text style={styles.buttonText}>
              {loading ? 'Creating...' : 'Add 10-Second Test Task'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton, loading && styles.disabledButton]} 
            onPress={handleClearTasks}
            disabled={loading}
          >
            <FontAwesome name="trash" size={16} color="#666" />
            <Text style={styles.secondaryButtonText}>
              {loading ? 'Clearing...' : 'Clear All Internal Tasks'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Testing</Text>
          <Text style={styles.sectionDescription}>
            Tools for testing notification permissions and delivery
          </Text>
          
          <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={handleResetNotifications}>
            <FontAwesome name="bell-slash" size={16} color="#666" />
            <Text style={styles.secondaryButtonText}>Reset Notification Settings</Text>
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
})