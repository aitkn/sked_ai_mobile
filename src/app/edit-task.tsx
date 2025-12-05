import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
  KeyboardAvoidingView,
  Modal,
  View as RNView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Text, View } from '@/components/Themed';
import { useTheme } from '@/contexts/ThemeContext';
import { internalDB, InternalTask } from '@/lib/internal-db';
import { GlassMorphism } from '@/components/GlassMorphism';
import { ThemedGradient } from '@/components/ThemedGradient';

export default function EditTaskScreen() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { actualTheme, colors } = useTheme();
  
  const [task, setTask] = useState<InternalTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [duration, setDuration] = useState(0);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [status, setStatus] = useState<'pending' | 'in_progress' | 'completed' | 'paused' | 'cancelled'>('pending');
  
  // Date picker states
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  useEffect(() => {
    loadTask();
  }, [taskId]);

  const loadTask = async () => {
    if (!taskId) {
      Alert.alert('Error', 'No task ID provided');
      router.back();
      return;
    }

    try {
      const loadedTask = await internalDB.getTaskById(taskId);
      if (!loadedTask) {
        Alert.alert('Error', 'Task not found');
        router.back();
        return;
      }

      setTask(loadedTask);
      setName(loadedTask.name);
      setDescription(loadedTask.description || '');
      setStartDate(new Date(loadedTask.start_time));
      setEndDate(new Date(loadedTask.end_time));
      setDuration(loadedTask.duration);
      setPriority(loadedTask.priority);
      setStatus(loadedTask.status);
      setLoading(false);
    } catch (error) {
      console.error('Error loading task:', error);
      Alert.alert('Error', 'Failed to load task');
      router.back();
    }
  };

  const handleStartDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartDatePicker(false);
    }
    if (selectedDate) {
      setStartDate(selectedDate);
      // Update end date if it's before the new start date
      if (selectedDate > endDate) {
        const newEndDate = new Date(selectedDate);
        newEndDate.setHours(endDate.getHours(), endDate.getMinutes());
        setEndDate(newEndDate);
      }
      updateDuration(selectedDate, endDate);
    }
  };

  const handleStartTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartTimePicker(false);
    }
    if (selectedTime) {
      const newStartDate = new Date(startDate);
      newStartDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setStartDate(newStartDate);
      // Update end date if it's before the new start date
      if (newStartDate >= endDate) {
        const newEndDate = new Date(newStartDate);
        newEndDate.setHours(newStartDate.getHours() + 1);
        setEndDate(newEndDate);
      }
      updateDuration(newStartDate, endDate);
    }
  };

  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndDatePicker(false);
    }
    if (selectedDate) {
      setEndDate(selectedDate);
      // Ensure end date is after start date
      if (selectedDate < startDate) {
        const newEndDate = new Date(startDate);
        newEndDate.setHours(endDate.getHours(), endDate.getMinutes());
        setEndDate(newEndDate);
      } else {
        updateDuration(startDate, selectedDate);
      }
    }
  };

  const handleEndTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndTimePicker(false);
    }
    if (selectedTime) {
      const newEndDate = new Date(endDate);
      newEndDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      // Ensure end time is after start time
      if (newEndDate <= startDate) {
        const newEndDate = new Date(startDate);
        newEndDate.setHours(startDate.getHours() + 1);
        setEndDate(newEndDate);
      } else {
        setEndDate(newEndDate);
      }
      updateDuration(startDate, newEndDate);
    }
  };

  const updateDuration = (start: Date, end: Date) => {
    const diffMs = end.getTime() - start.getTime();
    const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
    setDuration(diffSeconds);
  };

  const handleDurationChange = (hours: number, minutes: number) => {
    const totalSeconds = hours * 3600 + minutes * 60;
    setDuration(totalSeconds);
    // Update end date based on duration
    const newEndDate = new Date(startDate);
    newEndDate.setSeconds(newEndDate.getSeconds() + totalSeconds);
    setEndDate(newEndDate);
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Task name is required');
      return;
    }

    if (!taskId) {
      Alert.alert('Error', 'No task ID provided');
      return;
    }

    setSaving(true);
    try {
      const updates: Partial<InternalTask> = {
        name: name.trim(),
        description: description.trim() || undefined,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        duration,
        priority,
        status,
      };

      await internalDB.updateTask(taskId, updates);
      Alert.alert('Success', 'Task updated successfully', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error saving task:', error);
      Alert.alert('Error', 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ThemedGradient style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading task...</Text>
        </View>
      </ThemedGradient>
    );
  }

  const durationHours = Math.floor(duration / 3600);
  const durationMinutes = Math.floor((duration % 3600) / 60);

  return (
    <ThemedGradient style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <GlassMorphism
            intensity={actualTheme === 'dark' ? 'strong' : 'strong'}
            style={styles.header}
            borderRadius={20}
          >
            <Text style={[styles.title, { color: colors.text }]}>Edit Task</Text>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.closeButton}
            >
              <Text style={[styles.closeButtonText, { color: colors.tint }]}>Cancel</Text>
            </TouchableOpacity>
          </GlassMorphism>

          <GlassMorphism
            intensity={actualTheme === 'dark' ? 'extra-strong' : 'strong'}
            style={styles.formSection}
            borderRadius={20}
          >
            {/* Task Name */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.label, { color: colors.text }]}>Task Name *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)',
                    borderColor: colors.tint + '40',
                  },
                ]}
                value={name}
                onChangeText={setName}
                placeholder="Enter task name"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Description */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.label, { color: colors.text }]}>Description</Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    color: colors.text,
                    backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)',
                    borderColor: colors.tint + '40',
                  },
                ]}
                value={description}
                onChangeText={setDescription}
                placeholder="Enter task description"
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
              />
            </View>

            {/* Start Date & Time */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.label, { color: colors.text }]}>Start Date & Time</Text>
              <View style={styles.dateTimeRow}>
                <TouchableOpacity
                  style={[
                    styles.dateTimeButton,
                    {
                      backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)',
                      borderColor: colors.tint + '40',
                    },
                  ]}
                  onPress={() => setShowStartDatePicker(true)}
                >
                  <Text style={[styles.dateTimeText, { color: colors.text }]}>
                    {formatDate(startDate)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.dateTimeButton,
                    {
                      backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)',
                      borderColor: colors.tint + '40',
                    },
                  ]}
                  onPress={() => setShowStartTimePicker(true)}
                >
                  <Text style={[styles.dateTimeText, { color: colors.text }]}>
                    {formatTime(startDate)}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* End Date & Time */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.label, { color: colors.text }]}>End Date & Time</Text>
              <View style={styles.dateTimeRow}>
                <TouchableOpacity
                  style={[
                    styles.dateTimeButton,
                    {
                      backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)',
                      borderColor: colors.tint + '40',
                    },
                  ]}
                  onPress={() => setShowEndDatePicker(true)}
                >
                  <Text style={[styles.dateTimeText, { color: colors.text }]}>
                    {formatDate(endDate)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.dateTimeButton,
                    {
                      backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)',
                      borderColor: colors.tint + '40',
                    },
                  ]}
                  onPress={() => setShowEndTimePicker(true)}
                >
                  <Text style={[styles.dateTimeText, { color: colors.text }]}>
                    {formatTime(endDate)}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Duration */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.label, { color: colors.text }]}>Duration</Text>
              <View style={styles.durationContainer}>
                <View style={styles.durationInputRow}>
                  <Text style={[styles.durationLabel, { color: colors.textSecondary }]}>Hours:</Text>
                  <TextInput
                    style={[
                      styles.durationInput,
                      {
                        color: colors.text,
                        backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)',
                        borderColor: colors.tint + '40',
                      },
                    ]}
                    value={durationHours.toString()}
                    onChangeText={(text) => {
                      const hours = parseInt(text) || 0;
                      handleDurationChange(hours, durationMinutes);
                    }}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={styles.durationInputRow}>
                  <Text style={[styles.durationLabel, { color: colors.textSecondary }]}>Minutes:</Text>
                  <TextInput
                    style={[
                      styles.durationInput,
                      {
                        color: colors.text,
                        backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)',
                        borderColor: colors.tint + '40',
                      },
                    ]}
                    value={durationMinutes.toString()}
                    onChangeText={(text) => {
                      const minutes = parseInt(text) || 0;
                      handleDurationChange(durationHours, minutes);
                    }}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
              <Text style={[styles.durationDisplay, { color: colors.textSecondary }]}>
                Total: {formatDuration(duration)}
              </Text>
            </View>

            {/* Priority */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.label, { color: colors.text }]}>Priority</Text>
              <View style={styles.priorityRow}>
                {(['low', 'medium', 'high'] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.priorityButton,
                      {
                        backgroundColor:
                          priority === p
                            ? colors.tint
                            : actualTheme === 'dark'
                            ? 'rgba(255,255,255,0.1)'
                            : 'rgba(255,255,255,0.3)',
                        borderColor: priority === p ? colors.tint : colors.tint + '40',
                      },
                    ]}
                    onPress={() => setPriority(p)}
                  >
                    <Text
                      style={[
                        styles.priorityButtonText,
                        {
                          color: priority === p ? '#fff' : colors.text,
                          textTransform: 'capitalize',
                        },
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Status */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.label, { color: colors.text }]}>Status</Text>
              <View style={styles.statusRow}>
                {(['pending', 'in_progress', 'completed', 'paused', 'cancelled'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.statusButton,
                      {
                        backgroundColor:
                          status === s
                            ? colors.tint
                            : actualTheme === 'dark'
                            ? 'rgba(255,255,255,0.1)'
                            : 'rgba(255,255,255,0.3)',
                        borderColor: status === s ? colors.tint : colors.tint + '40',
                      },
                    ]}
                    onPress={() => setStatus(s)}
                  >
                    <Text
                      style={[
                        styles.statusButtonText,
                        {
                          color: status === s ? '#fff' : colors.text,
                          textTransform: 'capitalize',
                        },
                      ]}
                    >
                      {s.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[
                styles.saveButton,
                {
                  backgroundColor: colors.tint,
                  opacity: saving ? 0.6 : 1,
                },
              ]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </GlassMorphism>
        </ScrollView>

        {/* Date/Time Pickers */}
        {Platform.OS === 'ios' ? (
          <>
            <Modal
              visible={showStartDatePicker}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowStartDatePicker(false)}
            >
              <RNView style={styles.pickerModalContainer}>
                <RNView style={[styles.pickerModalContent, { backgroundColor: colors.background }]}>
                  <View style={styles.pickerModalHeader}>
                    <TouchableOpacity onPress={() => setShowStartDatePicker(false)}>
                      <Text style={[styles.pickerModalButton, { color: colors.tint }]}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={[styles.pickerModalTitle, { color: colors.text }]}>Start Date</Text>
                    <TouchableOpacity onPress={() => setShowStartDatePicker(false)}>
                      <Text style={[styles.pickerModalButton, { color: colors.tint }]}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={startDate}
                    mode="date"
                    display="spinner"
                    onChange={handleStartDateChange}
                    minimumDate={new Date()}
                    textColor={colors.text}
                  />
                </RNView>
              </RNView>
            </Modal>
            <Modal
              visible={showStartTimePicker}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowStartTimePicker(false)}
            >
              <RNView style={styles.pickerModalContainer}>
                <RNView style={[styles.pickerModalContent, { backgroundColor: colors.background }]}>
                  <View style={styles.pickerModalHeader}>
                    <TouchableOpacity onPress={() => setShowStartTimePicker(false)}>
                      <Text style={[styles.pickerModalButton, { color: colors.tint }]}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={[styles.pickerModalTitle, { color: colors.text }]}>Start Time</Text>
                    <TouchableOpacity onPress={() => setShowStartTimePicker(false)}>
                      <Text style={[styles.pickerModalButton, { color: colors.tint }]}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={startDate}
                    mode="time"
                    display="spinner"
                    onChange={handleStartTimeChange}
                    is24Hour={false}
                    textColor={colors.text}
                  />
                </RNView>
              </RNView>
            </Modal>
            <Modal
              visible={showEndDatePicker}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowEndDatePicker(false)}
            >
              <RNView style={styles.pickerModalContainer}>
                <RNView style={[styles.pickerModalContent, { backgroundColor: colors.background }]}>
                  <View style={styles.pickerModalHeader}>
                    <TouchableOpacity onPress={() => setShowEndDatePicker(false)}>
                      <Text style={[styles.pickerModalButton, { color: colors.tint }]}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={[styles.pickerModalTitle, { color: colors.text }]}>End Date</Text>
                    <TouchableOpacity onPress={() => setShowEndDatePicker(false)}>
                      <Text style={[styles.pickerModalButton, { color: colors.tint }]}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={endDate}
                    mode="date"
                    display="spinner"
                    onChange={handleEndDateChange}
                    minimumDate={startDate}
                    textColor={colors.text}
                  />
                </RNView>
              </RNView>
            </Modal>
            <Modal
              visible={showEndTimePicker}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowEndTimePicker(false)}
            >
              <RNView style={styles.pickerModalContainer}>
                <RNView style={[styles.pickerModalContent, { backgroundColor: colors.background }]}>
                  <View style={styles.pickerModalHeader}>
                    <TouchableOpacity onPress={() => setShowEndTimePicker(false)}>
                      <Text style={[styles.pickerModalButton, { color: colors.tint }]}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={[styles.pickerModalTitle, { color: colors.text }]}>End Time</Text>
                    <TouchableOpacity onPress={() => setShowEndTimePicker(false)}>
                      <Text style={[styles.pickerModalButton, { color: colors.tint }]}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={endDate}
                    mode="time"
                    display="spinner"
                    onChange={handleEndTimeChange}
                    is24Hour={false}
                    textColor={colors.text}
                  />
                </RNView>
              </RNView>
            </Modal>
          </>
        ) : (
          <>
            {showStartDatePicker && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display="default"
                onChange={handleStartDateChange}
                minimumDate={new Date()}
              />
            )}
            {showStartTimePicker && (
              <DateTimePicker
                value={startDate}
                mode="time"
                display="default"
                onChange={handleStartTimeChange}
                is24Hour={false}
              />
            )}
            {showEndDatePicker && (
              <DateTimePicker
                value={endDate}
                mode="date"
                display="default"
                onChange={handleEndDateChange}
                minimumDate={startDate}
              />
            )}
            {showEndTimePicker && (
              <DateTimePicker
                value={endDate}
                mode="time"
                display="default"
                onChange={handleEndTimeChange}
                is24Hour={false}
              />
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </ThemedGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  header: {
    padding: 20,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  formSection: {
    padding: 20,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateTimeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  dateTimeText: {
    fontSize: 16,
    fontWeight: '500',
  },
  durationContainer: {
    gap: 12,
  },
  durationInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  durationLabel: {
    fontSize: 14,
    width: 80,
  },
  durationInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  durationDisplay: {
    marginTop: 8,
    fontSize: 14,
    fontStyle: 'italic',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 12,
  },
  priorityButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  priorityButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusButton: {
    flex: 1,
    minWidth: '30%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveButton: {
    marginTop: 20,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  pickerModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  pickerModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  pickerModalButton: {
    fontSize: 16,
    fontWeight: '600',
  },
});

