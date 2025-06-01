import React, { useState, useEffect } from 'react'
import {
  StyleSheet,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
  Modal,
  Platform,
  ToastAndroid,
} from 'react-native'
import { Text } from '@/components/Themed'
import { useTaskContext } from '@/contexts/TaskContext'
import { Task } from '@/lib/offline/database'
import Colors from '@/constants/Colors'
import { FontAwesome } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'

export default function TasksScreen() {
  const { tasks, loading, syncing, createTask, updateTask, deleteTask, syncNow } = useTaskContext()
  const [showAddModal, setShowAddModal] = useState(false)
  const [newTaskName, setNewTaskName] = useState('')
  const [newTaskDueDate, setNewTaskDueDate] = useState<Date | null>(null)
  const [newTaskReminder, setNewTaskReminder] = useState<Date | null>(null)
  const [showDatePicker, setShowDatePicker] = useState<'due' | 'reminder' | null>(null)
  const [lastSyncState, setLastSyncState] = useState(false)

  // Show sync completion message
  useEffect(() => {
    if (lastSyncState && !syncing) {
      // Sync just completed
      const pendingCount = tasks.filter(t => t.sync_status === 'pending').length
      if (pendingCount === 0) {
        const message = 'All tasks synced successfully!'
        if (Platform.OS === 'android') {
          ToastAndroid.show(message, ToastAndroid.SHORT)
        } else {
          // For iOS, we could use a different notification method
          console.log(message)
        }
      } else {
        const message = `${pendingCount} tasks pending sync`
        if (Platform.OS === 'android') {
          ToastAndroid.show(message, ToastAndroid.SHORT)
        }
      }
    }
    setLastSyncState(syncing)
  }, [syncing, tasks])

  const handleAddTask = async () => {
    if (!newTaskName.trim()) {
      Alert.alert('Error', 'Please enter a task name')
      return
    }

    await createTask({
      name: newTaskName,
      due_at: newTaskDueDate?.toISOString(),
      reminder_at: newTaskReminder?.toISOString(),
      status: 'pending',
    })

    setNewTaskName('')
    setNewTaskDueDate(null)
    setNewTaskReminder(null)
    setShowAddModal(false)
  }

  const handleToggleComplete = async (task: Task) => {
    await updateTask(task.local_id, {
      status: task.status === 'completed' ? 'pending' : 'completed',
      completed_at: task.status === 'completed' ? undefined : new Date().toISOString(),
    })
  }

  const handleDeleteTask = async (task: Task) => {
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => deleteTask(task.local_id),
        },
      ]
    )
  }

  const renderTask = ({ item }: { item: Task }) => (
    <View style={styles.taskItem}>
      <TouchableOpacity
        style={styles.taskCheckbox}
        onPress={() => handleToggleComplete(item)}
      >
        <FontAwesome
          name={item.status === 'completed' ? 'check-square' : 'square-o'}
          size={24}
          color={item.status === 'completed' ? Colors.light.tint : '#666'}
        />
      </TouchableOpacity>
      
      <View style={styles.taskContent}>
        <Text 
          style={[
            styles.taskName,
            item.status === 'completed' && styles.taskNameCompleted
          ]}
        >
          {item.name}
        </Text>
        
        <View style={styles.taskMeta}>
          {item.due_at && (
            <Text style={styles.taskMetaText}>
              <FontAwesome name="calendar" size={12} color="#666" />
              {' Due: ' + new Date(item.due_at).toLocaleDateString()}
            </Text>
          )}
          {item.reminder_at && (
            <Text style={styles.taskMetaText}>
              <FontAwesome name="bell" size={12} color="#666" />
              {' Reminder: ' + new Date(item.reminder_at).toLocaleDateString()}
            </Text>
          )}
          {item.sync_status === 'pending' && (
            <Text style={styles.syncPending}>
              <FontAwesome name="cloud-upload" size={12} color="#ff9800" />
              {' Pending sync'}
            </Text>
          )}
        </View>
      </View>
      
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteTask(item)}
      >
        <FontAwesome name="trash" size={20} color="#ff4444" />
      </TouchableOpacity>
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Tasks</Text>
          {tasks.filter(t => t.sync_status === 'pending').length > 0 && (
            <Text style={styles.syncStatus}>
              {tasks.filter(t => t.sync_status === 'pending').length} pending sync
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.syncButton}
          onPress={syncNow}
          disabled={syncing}
        >
          <FontAwesome 
            name={syncing ? "spinner" : "refresh"} 
            size={20} 
            color={syncing ? '#ccc' : Colors.light.tint}
          />
        </TouchableOpacity>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.local_id}
        renderItem={renderTask}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={syncNow} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No tasks yet</Text>
            <Text style={styles.emptySubtext}>
              Tap the + button to create your first task
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddModal(true)}
      >
        <FontAwesome name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Add Task Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Task</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Task name"
              value={newTaskName}
              onChangeText={setNewTaskName}
              autoFocus
            />

            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker('due')}
            >
              <FontAwesome name="calendar" size={16} color="#666" />
              <Text style={styles.dateButtonText}>
                {newTaskDueDate 
                  ? `Due: ${newTaskDueDate.toLocaleDateString()}`
                  : 'Set due date'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker('reminder')}
            >
              <FontAwesome name="bell" size={16} color="#666" />
              <Text style={styles.dateButtonText}>
                {newTaskReminder 
                  ? `Reminder: ${newTaskReminder.toLocaleDateString()}`
                  : 'Set reminder'}
              </Text>
            </TouchableOpacity>

            {/* iOS Date Picker - shown inside modal */}
            {showDatePicker && Platform.OS === 'ios' && (
              <View style={styles.datePickerContainer}>
                <DateTimePicker
                  value={
                    showDatePicker === 'due' 
                      ? newTaskDueDate || new Date()
                      : newTaskReminder || new Date()
                  }
                  mode="datetime"
                  display="spinner"
                  onChange={(event, date) => {
                    if (date) {
                      if (showDatePicker === 'due') {
                        setNewTaskDueDate(date)
                      } else {
                        setNewTaskReminder(date)
                      }
                    }
                  }}
                />
                <TouchableOpacity
                  style={styles.datePickerDoneButton}
                  onPress={() => setShowDatePicker(null)}
                >
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.addButton]}
                onPress={handleAddTask}
              >
                <Text style={styles.addButtonText}>Add Task</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Android Date Picker - shown outside modal */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={
            showDatePicker === 'due' 
              ? newTaskDueDate || new Date()
              : newTaskReminder || new Date()
          }
          mode="datetime"
          display="default"
          onChange={(event, date) => {
            setShowDatePicker(null)
            if (date) {
              if (showDatePicker === 'due') {
                setNewTaskDueDate(date)
              } else {
                setNewTaskReminder(date)
              }
            }
          }}
        />
      )}
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
    fontSize: 24,
    fontWeight: 'bold',
  },
  syncStatus: {
    fontSize: 12,
    color: '#ff9800',
    marginTop: 2,
  },
  syncButton: {
    padding: 10,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  taskCheckbox: {
    marginRight: 15,
  },
  taskContent: {
    flex: 1,
  },
  taskName: {
    fontSize: 16,
    marginBottom: 5,
  },
  taskNameCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  taskMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  taskMetaText: {
    fontSize: 12,
    color: '#666',
  },
  syncPending: {
    fontSize: 12,
    color: '#ff9800',
  },
  deleteButton: {
    padding: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 15,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 15,
  },
  dateButtonText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#333',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
    marginRight: 10,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
  addButton: {
    backgroundColor: Colors.light.tint,
    marginLeft: 10,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  datePickerContainer: {
    marginVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 10,
  },
  datePickerDoneButton: {
    alignSelf: 'flex-end',
    padding: 10,
    marginBottom: 10,
  },
  datePickerDoneText: {
    color: Colors.light.tint,
    fontSize: 16,
    fontWeight: '600',
  },
})