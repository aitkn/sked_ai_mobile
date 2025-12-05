import { StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert, Modal, View, Pressable, SafeAreaView } from 'react-native';
import { Text } from '@/components/Themed';
import { useState, useEffect, useRef } from 'react';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import ThemedIcon from '@/components/ThemedIcon';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import Colors from '@/constants/Colors';
import { GlassMorphism } from '@/components/GlassMorphism';
import { ThemedGradient } from '@/components/ThemedGradient';
import { internalDB, InternalTask, InternalDB } from '@/lib/internal-db';
import { syncTasksFromSupabase } from '@/lib/sync/TaskSyncService';
import { ChatAssistant } from '@/components/ChatAssistant';
import { ColorLegendBar } from '@/components/ColorLegendBar';
import { ColorLabelPicker } from '@/components/ColorLabelPicker';
import { getColorForLabel, getLabelName, ColorLabelKey } from '@/constants/ColorLabels';

export default function CalendarScreen() {
  const { actualTheme, colors } = useTheme();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [taskInputText, setTaskInputText] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showProcessingIndicator, setShowProcessingIndicator] = useState(false);
  const [tasks, setTasks] = useState<InternalTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<InternalTask | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week' | '3day' | 'day'>('week');
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    return weekStart;
  });
  const [current3DayStart, setCurrent3DayStart] = useState(() => {
    const today = new Date();
    return new Date(today);
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [editingTime, setEditingTime] = useState<'start' | 'end' | null>(null);
  const [editedStartTime, setEditedStartTime] = useState<Date | null>(null);
  const [editedEndTime, setEditedEndTime] = useState<Date | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | number | null>(null);
  const monthPickerScrollRef = useRef<ScrollView>(null);
  const timeGridScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load tasks from internal database
  useEffect(() => {
    loadTasks();
    // Refresh tasks every second to catch updates
    const interval = setInterval(loadTasks, 1000);
    return () => {
      clearInterval(interval);
      // Clean up sync interval on unmount
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, []);

  // Scroll to current year when month picker opens
  useEffect(() => {
    if (monthPickerOpen && monthPickerScrollRef.current) {
      // Calculate scroll position to current year (the year being viewed)
      // Each year section is approximately: year label (50px) + 3 rows of months (3 * 70px) = ~260px
      const viewingYear = currentDate.getFullYear();
      const startYear = viewingYear - 5;
      const yearIndex = viewingYear - startYear;
      const estimatedSectionHeight = 260; // Approximate height per year section
      const scrollPosition = yearIndex * estimatedSectionHeight;
      
      // Use setTimeout to ensure content is rendered before scrolling
      setTimeout(() => {
        monthPickerScrollRef.current?.scrollTo({
          y: scrollPosition,
          animated: true,
        });
      }, 100);
    }
  }, [monthPickerOpen, currentDate]);

  // Scroll to 12 PM when week/3day/day view is shown
  useEffect(() => {
    if (['week', '3day', 'day'].includes(viewMode) && timeGridScrollRef.current) {
      const HOUR_HEIGHT = 60;
      const scrollTo12PM = 12 * HOUR_HEIGHT; // 12 PM is hour 12
      
      // Use setTimeout to ensure content is rendered before scrolling
      setTimeout(() => {
        timeGridScrollRef.current?.scrollTo({
          y: scrollTo12PM,
          animated: false, // Instant scroll on initial load
        });
      }, 100);
    }
  }, [viewMode]);

  const loadTasks = async () => {
    try {
      console.log('📅 Calendar: loadTasks() called');
      const allTasks = await internalDB.getAllTasks();
      console.log('📅 Calendar: Loaded tasks from internalDB:', allTasks.length);
      if (allTasks.length > 0) {
        console.log('📅 Calendar: Task details:', allTasks.map(t => ({
          id: t.id,
          name: t.name,
          start: new Date(t.start_time).toLocaleString(),
          end: new Date(t.end_time).toLocaleString(),
          status: t.status,
          duration: t.duration
        })));
      } else {
        console.log('📅 Calendar: ⚠️ No tasks in internalDB - checking if sync is needed...');
        // Trigger a sync to see what happens
        const syncResult = await syncTasksFromSupabase();
        console.log('📅 Calendar: Sync result:', syncResult);
        // Reload after sync
        const tasksAfterSync = await internalDB.getAllTasks();
        console.log('📅 Calendar: Tasks after sync:', tasksAfterSync.length);
      }
      setTasks(allTasks);
    } catch (error) {
      console.error('📅 Calendar: ❌ Error loading tasks:', error);
    }
  };

  // Helper function to check if a specific date has tasks
  const hasTasksOnDate = (date: Date): boolean => {
    const dateStr = date.toDateString();
    return tasks.some(task => {
      const taskDate = new Date(task.start_time);
      return taskDate.toDateString() === dateStr;
    });
  };

  // Helper function to get tasks for a specific date
  const getTasksForDate = (date: Date): InternalTask[] => {
    const dateStr = date.toDateString();
    const isToday = date.toDateString() === new Date().toDateString();
    
    const filteredTasks = tasks.filter(task => {
      const taskDate = new Date(task.start_time);
      const taskDateStr = taskDate.toDateString();
      const matches = taskDateStr === dateStr;
      
      // Debug logging for today's tasks
      if (isToday && tasks.length > 0) {
        console.log('📅 Calendar: Task date check:', {
          taskName: task.name,
          taskDate: taskDateStr,
          targetDate: dateStr,
          matches
        });
      }
      
      return matches;
    });
    
    if (isToday && filteredTasks.length === 0 && tasks.length > 0) {
      console.log('📅 Calendar: No tasks found for today, but tasks exist:', tasks.length);
    }
    
    return filteredTasks;
  };

  // Helper function to get color for task (prioritizes colorLabel over status/priority)
  const getTaskColor = (task: InternalTask, themeColor: string): string => {
    // If task has a color label, use it (unless it's 'none')
    if (task.colorLabel && task.colorLabel !== 'none') {
      return getColorForLabel(task.colorLabel);
    }
    
    // Fallback to status-based colors
    if (task.status === 'completed') return '#4CAF50';
    if (task.status === 'in_progress') return '#FFA726';
    
    // For pending tasks, use priority-based shading of the theme color
    const priority = task.priority || 'medium';
    
    if (themeColor === '#4A90E2' || themeColor === '#B19CD9') { // Light or dark theme blues
      switch (priority) {
        case 'high': return '#1565C0';    // Deeper blue for high priority
        case 'medium': return themeColor; // Theme color for medium priority  
        case 'low': return '#90CAF9';     // Lighter blue for low priority
        default: return themeColor;
      }
    }
    
    // Fallback for any other theme colors
    return themeColor;
  };

  // Keep getPriorityColor for backward compatibility (now uses getTaskColor)
  const getPriorityColor = (task: InternalTask, themeColor: string): string => {
    return getTaskColor(task, themeColor);
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newWeekStart = new Date(currentWeekStart);
    if (direction === 'prev') {
      newWeekStart.setDate(newWeekStart.getDate() - 7);
    } else {
      newWeekStart.setDate(newWeekStart.getDate() + 7);
    }
    setCurrentWeekStart(newWeekStart);
  };

  const navigate3Day = (direction: 'prev' | 'next') => {
    const new3DayStart = new Date(current3DayStart);
    if (direction === 'prev') {
      new3DayStart.setDate(new3DayStart.getDate() - 3);
    } else {
      new3DayStart.setDate(new3DayStart.getDate() + 3);
    }
    setCurrent3DayStart(new3DayStart);
  };

  const navigateDay = (direction: 'prev' | 'next') => {
    const newSelectedDate = new Date(selectedDate);
    if (direction === 'prev') {
      newSelectedDate.setDate(newSelectedDate.getDate() - 1);
    } else {
      newSelectedDate.setDate(newSelectedDate.getDate() + 1);
    }
    setSelectedDate(newSelectedDate);
  };

  const getWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeekStart);
      day.setDate(currentWeekStart.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const get3DayDays = () => {
    const days = [];
    for (let i = 0; i < 3; i++) {
      const day = new Date(current3DayStart);
      day.setDate(current3DayStart.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const updateViewsForSelectedDate = (date: Date) => {
    const dayOfWeek = date.getDay();
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - dayOfWeek);
    setCurrentWeekStart(weekStart);

    setCurrent3DayStart(new Date(date));
  };

  const jumpToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    
    setCurrentDate(today);
    
    updateViewsForSelectedDate(today);
  };

  const handleDeleteAllTasks = async () => {
    console.log('🗑️ Delete all tasks button pressed');
    console.log('🗑️ Current task count:', tasks.length);
    
    Alert.alert(
      'Delete All Tasks',
      `Are you sure you want to delete all ${tasks.length} task(s)? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => console.log('🗑️ Delete cancelled'),
        },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🗑️ Deleting all tasks from internalDB...');
              await internalDB.clearAllTasks();
              console.log('✅ All tasks deleted');
              await loadTasks(); // Reload to update UI
              Alert.alert('Success', 'All tasks have been deleted.');
            } catch (error) {
              console.error('❌ Error deleting all tasks:', error);
              Alert.alert('Error', 'Failed to delete tasks. Please try again.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleQuickAddTask = () => {
    setShowTaskInput(true);
  };

  const handleTaskPress = (task: InternalTask) => {
    setSelectedTask(task);
    setEditedStartTime(new Date(task.start_time));
    setEditedEndTime(new Date(task.end_time));
    setEditingTime(null);
  };

  const closeTaskDetails = () => {
    setSelectedTask(null);
    setEditingTime(null);
    setEditedStartTime(null);
    setEditedEndTime(null);
  };

  const handleTimeChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setEditingTime(null);
    }
    
    if (selectedDate && editingTime) {
      if (editingTime === 'start') {
        setEditedStartTime(selectedDate);
        // If new start time is after end time, adjust end time
        if (editedEndTime && selectedDate >= editedEndTime) {
          const newEndTime = new Date(selectedDate);
          newEndTime.setHours(selectedDate.getHours() + 1); // Default 1 hour duration
          setEditedEndTime(newEndTime);
        }
      } else if (editingTime === 'end') {
        setEditedEndTime(selectedDate);
        // If new end time is before start time, adjust start time
        if (editedStartTime && selectedDate <= editedStartTime) {
          const newStartTime = new Date(selectedDate);
          newStartTime.setHours(selectedDate.getHours() - 1); // Default 1 hour before
          setEditedStartTime(newStartTime);
        }
      }
      
      if (Platform.OS === 'ios') {
        // On iOS, keep picker open for further adjustments
      } else {
        setEditingTime(null);
      }
    }
  };

  const handleSaveTimeChanges = async () => {
    if (!selectedTask || !editedStartTime || !editedEndTime) return;
    
    try {
      const newDuration = Math.floor((editedEndTime.getTime() - editedStartTime.getTime()) / 1000);
      
      if (newDuration <= 0) {
        Alert.alert('Invalid Time', 'End time must be after start time');
        return;
      }

      await internalDB.updateTask(selectedTask.id, {
        start_time: editedStartTime.toISOString(),
        end_time: editedEndTime.toISOString(),
        duration: newDuration,
      });

      await internalDB.addAction({
        action_type: 'task_skipped',
        task_id: selectedTask.id,
        task_name: selectedTask.name,
        details: `Time updated: ${editedStartTime.toLocaleString()} - ${editedEndTime.toLocaleString()}`
      });

      // Reload tasks to reflect changes
      await loadTasks();
      
      // Update selected task to show new times
      const updatedTask = await internalDB.getTaskById(selectedTask.id);
      if (updatedTask) {
        setSelectedTask(updatedTask);
      }
      
      setEditingTime(null);
      Alert.alert('Success', 'Task time updated successfully');
    } catch (error) {
      console.error('Error updating task time:', error);
      Alert.alert('Error', 'Failed to update task time');
    }
  };

  const handleColorLabelChange = async (labelKey: ColorLabelKey) => {
    if (!selectedTask) return;
    
    try {
      await internalDB.updateTask(selectedTask.id, {
        colorLabel: labelKey,
      });

      // Reload tasks to reflect changes
      await loadTasks();
      
      // Update selected task to show new color
      const updatedTask = await internalDB.getTaskById(selectedTask.id);
      if (updatedTask) {
        setSelectedTask(updatedTask);
      }
    } catch (error) {
      console.error('Error updating task color label:', error);
      Alert.alert('Error', 'Failed to update color label');
    }
  };

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) {
      return 'Under 1m';
    }
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const parts: string[] = [];
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (!parts.length) {
      return 'Under 1m';
    }
    return parts.join(' ');
  };

  const handleVoiceInput = async () => {
    try {
      setIsListening(true);
      
      // For now, we'll simulate voice input with a placeholder
      // In a real implementation, you'd use expo-speech-to-text or similar
      setTimeout(() => {
        const dateStr = selectedDate.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric'
        });
        setTaskInputText(`Meeting on ${dateStr} at 2pm for 1 hour`);
        setIsListening(false);
      }, 2000);
      
    } catch (error) {
      console.error('Voice input error:', error);
      setIsListening(false);
      Alert.alert('Voice Error', 'Could not access microphone. Please type your task instead.');
    }
  };

  const handleCreateTaskFromInput = async () => {
    if (!taskInputText.trim()) {
      Alert.alert('Error', 'Please enter a task description');
      return;
    }
    
    if (!session?.user) {
      Alert.alert('Error', 'Please log in to create tasks');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // Format the date for the task
      const dateStr = selectedDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });

      // Create prompt with date context if not already included
      let finalPrompt = taskInputText.trim();
      if (!finalPrompt.toLowerCase().includes(dateStr.toLowerCase())) {
        finalPrompt = `On ${dateStr}: ${finalPrompt}`;
      }

      console.log('🤖 Using LLM assistant to create task for date:', dateStr);
      
      // Import assistant service dynamically to avoid circular dependencies
      const { assistantService } = await import('@/lib/llm/AssistantService');
      
      // Use LLM assistant to create task directly
      let fullResponse = '';
      await assistantService.sendMessage(finalPrompt, (chunk: string) => {
        fullResponse += chunk;
        // Could show streaming in UI if needed
      });

      console.log('✅ LLM response:', fullResponse);
      
      // Reset modal state
      setTaskInputText('');
      setShowTaskInput(false);
      
      // Show success message
      Alert.alert(
        'Success',
        'Task created successfully! The calendar will update shortly.',
        [{ text: 'OK' }]
      );

      // Clear any existing sync interval before starting a new one
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }

      // Reload tasks after a delay to allow backend processing
      // The backend needs to: 1) solve the task, 2) create solution, 3) processor creates timeline
      // This can take 5-10 seconds, so we'll check multiple times
      let attempts = 0;
      const maxAttempts = 30; // Check for up to 30 seconds (solver can take 20-30 seconds)
      const checkInterval = setInterval(async () => {
        attempts++;
        console.log(`🔄 Checking for timeline update (attempt ${attempts}/${maxAttempts})...`);
        
        // Sync from task_solution table (same as web app)
        const result = await syncTasksFromSupabase();
        
        if (result.success && result.taskCount > 0) {
          console.log(`✅ Synced ${result.taskCount} tasks! Reloading calendar...`);
          // Reload tasks from internalDB
          loadTasks();
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
            loadTasks();
          }
        }
      }, 1000); // Check every second
      
      // Store interval reference for cleanup
      syncIntervalRef.current = checkInterval;
      
    } catch (error: any) {
      console.error('❌ Error creating task:', error);
      
      let errorMessage = 'Failed to create task. Please try again.';
      
      if (error.message?.includes('not authenticated') || error.message?.includes('Auth error')) {
        errorMessage = 'Please sign in to create tasks.';
      } else if (error.message?.includes('not configured')) {
        errorMessage = 'LLM not configured. Please check your settings.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Error', errorMessage, [{ text: 'OK' }]);
    } finally {
      setIsProcessing(false);
      // Clean up interval on error
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    }
  };

  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Render week day headers with simplified styling
    for (let i = 0; i < 7; i++) {
      days.push(
        <View key={`header-${i}`} style={styles.weekDayHeader}>
          <View style={[styles.weekDayHeaderContent, { backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.15)' }]}>
            <Text style={[styles.weekDayText, { color: colors.text }]}>{weekDays[i]}</Text>
          </View>
        </View>
      );
    }

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(
        <View key={`empty-${i}`} style={styles.dayCell} />
      );
    }

    // Days of the month with optimized rendering
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = 
        day === new Date().getDate() && 
        currentDate.getMonth() === new Date().getMonth() && 
        currentDate.getFullYear() === new Date().getFullYear();

      const isSelected = 
        day === selectedDate.getDate() && 
        currentDate.getMonth() === selectedDate.getMonth() && 
        currentDate.getFullYear() === selectedDate.getFullYear();

      // Check if this date has tasks
      const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const hasTasks = hasTasksOnDate(dayDate);
      const dayTasks = getTasksForDate(dayDate);

      days.push(
        <TouchableOpacity
          key={`day-${day}`}
          style={styles.dayCell}
          onPress={() => {
            const newSelected = new Date(currentDate);
            newSelected.setDate(day);
            setSelectedDate(newSelected);
            updateViewsForSelectedDate(newSelected);
          }}
        >
          <View 
            style={[
              styles.dayCellContent,
              {
                backgroundColor: isSelected 
                  ? colors.tint 
                  : (isToday 
                    ? actualTheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.1)'
                    : actualTheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.08)'
                  ),
                borderColor: isSelected ? colors.tint : (isToday ? colors.tint + '80' : 'rgba(255,255,255,0.15)'),
                borderWidth: isSelected || isToday ? 2 : 1,
              }
            ]}
          >
            <Text style={[
              styles.dayText,
              { color: isSelected ? '#fff' : colors.text },
              isToday && !isSelected && [styles.todayText, { color: colors.tint }],
              isSelected && styles.selectedText
            ]}>{day}</Text>
            {hasTasks && (
              <View style={styles.taskIndicators}>
                    {dayTasks.slice(0, 3).map((task, index) => (
                      <View 
                        key={task.id} 
                        style={[
                          styles.taskIndicatorLine,
                          {
                            backgroundColor: isSelected && task.status === 'pending' ? '#fff' : 
                                           getTaskColor(task, colors.tint),
                            top: 4 + (index * 3),
                          }
                        ]} 
                      />
                    ))}
                {dayTasks.length > 3 && (
                  <Text style={[styles.moreTasksIndicator, { color: isSelected ? '#fff' : colors.text }]}>
                    +{dayTasks.length - 3}
                  </Text>
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>
      );
    }

    return days;
  };

  const renderTimeGrid = (days: Date[]) => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const HOUR_HEIGHT = 60;
    const weekDayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
      <View style={styles.weekViewContainer}>
        {/* Header Row */}
        <View style={[styles.weekHeaderRow, { marginBottom: 0, paddingLeft: 40 }]}>
          {days.map((day, index) => {
              const isToday = day.toDateString() === new Date().toDateString();
              const isSelected = day.toDateString() === selectedDate.toDateString();

              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.weekHeaderCell, { paddingVertical: 4 }]}
                  onPress={() => {
                    const newDate = new Date(day);
                    setSelectedDate(newDate);
                    updateViewsForSelectedDate(newDate);
                  }}
                >
                  <Text style={[styles.weekHeaderText, { color: isToday ? colors.tint : colors.text }]}>
                    {weekDayLabels[day.getDay()]}
                  </Text>
                  <View style={[
                    styles.weekHeaderDateContainer,
                    isSelected && { backgroundColor: colors.tint + '20' }, 
                    isToday && { backgroundColor: colors.tint }
                  ]}>
                    <Text style={[
                      styles.weekHeaderDateText, 
                      { color: isToday ? '#fff' : colors.text }
                    ]}>
                      {day.getDate()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
           })}
        </View>
        
        {/* Scrollable Grid */}
        <ScrollView 
          ref={timeGridScrollRef}
          nestedScrollEnabled 
          style={{ height: 600 }} 
          showsVerticalScrollIndicator={false}
          contentOffset={{ x: 0, y: 12 * 60 }} // Start at 12 PM
        >
           <View style={styles.weekGridContainer}>
             {/* Time Labels */}
             <View style={styles.timeColumn}>
               {hours.map(hour => (
                 <View key={hour} style={[styles.timeLabelCell, { height: HOUR_HEIGHT }]}>
                   <Text style={[styles.timeLabelText, { color: colors.textSecondary, transform: [{ translateY: -6 }] }]}>
                     {hour === 0 ? '' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                   </Text>
                 </View>
               ))}
             </View>

             {/* Day Columns */}
             {days.map((day, dayIndex) => {
                const dayTasks = getTasksForDate(day);
                const isToday = day.toDateString() === new Date().toDateString();
                
                return (
                  <View key={dayIndex} style={[
                      styles.dayColumn, 
                      { 
                        borderColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        borderLeftWidth: 1,
                        backgroundColor: isToday ? (actualTheme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)') : 'transparent'
                      }
                  ]}>
                    {/* Grid Lines */}
                    {hours.map(hour => (
                       <View key={hour} style={[
                         styles.gridCell, 
                         { 
                           height: HOUR_HEIGHT, 
                           borderColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' 
                         }
                       ]} />
                    ))}

                    {/* Tasks */}
                    {dayTasks.map(task => {
                       const start = new Date(task.start_time);
                       const end = new Date(task.end_time);
                       const startHour = start.getHours();
                       const startMin = start.getMinutes();
                       let durationMin = (end.getTime() - start.getTime()) / (1000 * 60);
                       if (durationMin < 15) durationMin = 15; 
                       
                       const top = (startHour * HOUR_HEIGHT) + ((startMin / 60) * HOUR_HEIGHT);
                       const height = (durationMin / 60) * HOUR_HEIGHT;

                       return (
                         <TouchableOpacity
                           key={task.id}
                           style={[
                             styles.weekTaskBox,
                             {
                               top,
                               height: height - 1,
                               backgroundColor: getTaskColor(task, colors.tint),
                             }
                           ]}
                           onPress={() => handleTaskPress(task)}
                         >
                           <Text numberOfLines={1} style={styles.weekTaskText}>
                             {task.name}
                           </Text>
                           {height > 30 && (
                              <Text numberOfLines={1} style={[styles.weekTaskText, { opacity: 0.8, fontSize: 8 }]}>
                                {start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </Text>
                           )}
                         </TouchableOpacity>
                       );
                    })}
                  </View>
                );
             })}
           </View>
        </ScrollView>
      </View>
    );
  };

  const renderWeekView = () => renderTimeGrid(getWeekDays());
  const render3DayView = () => renderTimeGrid(get3DayDays());
  const renderDayView = () => renderTimeGrid([selectedDate]);


  return (
    <ThemedGradient style={styles.container}>
      {/* Processing Indicator */}
      {showProcessingIndicator && (
        <View style={[styles.processingBanner, { backgroundColor: Colors.light.tint }]}>
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
      
      <ScrollView style={styles.scrollView}>
      <GlassMorphism intensity={actualTheme === 'dark' ? 'strong' : 'strong'} style={styles.calendarContainer} borderRadius={20}>
        <GlassMorphism intensity={actualTheme === 'dark' ? 'light' : 'medium'} style={styles.monthNavigation} borderRadius={12}>
          <View style={styles.navigationHeader}>
            <TouchableOpacity 
              onPress={() => setDrawerOpen(true)}
              style={styles.hamburgerButton}
            >
              <Ionicons 
                name="menu" 
                size={22} 
                color={colors.text}
              />
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={() => setMonthPickerOpen(true)}
              style={styles.monthTitleButton}
              activeOpacity={0.7}
            >
              <Text 
                style={[styles.monthText, { color: colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.8}
              >
                {viewMode === 'month' 
                  ? currentDate.toLocaleDateString('en-US', { 
                      month: 'short', 
                      year: 'numeric' 
                    })
                  : viewMode === 'week'
                  ? `${currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : viewMode === '3day'
                  ? `${current3DayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(current3DayStart.getTime() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : selectedDate.toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    })
                }
              </Text>
              <Ionicons 
                name="chevron-down" 
                size={14} 
                color={colors.text}
                style={styles.monthChevron}
              />
            </TouchableOpacity>
            
            <View style={styles.navigationControls}>
              <TouchableOpacity 
                onPress={() => {
                  switch (viewMode) {
                    case 'month': navigateMonth('prev'); break;
                    case 'week': navigateWeek('prev'); break;
                    case '3day': navigate3Day('prev'); break;
                    case 'day': navigateDay('prev'); break;
                  }
                }} 
                style={styles.arrowButton}
              >
                <Ionicons 
                  name="chevron-back" 
                  size={20} 
                  color={colors.text}
                />
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={jumpToToday}
                style={[styles.todayButton, { backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}
              >
                <Text style={[styles.todayButtonText, { color: colors.text }]}>Today</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => {
                  switch (viewMode) {
                    case 'month': navigateMonth('next'); break;
                    case 'week': navigateWeek('next'); break;
                    case '3day': navigate3Day('next'); break;
                    case 'day': navigateDay('next'); break;
                  }
                }} 
                style={styles.arrowButton}
              >
                <Ionicons 
                  name="chevron-forward" 
                  size={20} 
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>
          </View>
        </GlassMorphism>

        {viewMode === 'month' ? (
          <View style={styles.calendarGrid}>
            {renderCalendarDays()}
          </View>
         ) : viewMode === 'week' ? (
          renderWeekView()
         ) : viewMode === '3day' ? (
           render3DayView()
         ) : (
           renderDayView()
        )}
      </GlassMorphism>

         {/* <GlassMorphism 
           intensity={actualTheme === 'dark' ? 'extra-strong' : 'strong'} 
           style={[
             styles.tasksSection, 
             viewMode === 'day' && styles.tasksSectionDayView
           ] as any} 
           borderRadius={20}
         >
          <GlassMorphism 
            intensity={actualTheme === 'dark' ? 'medium' : 'extra-strong'} 
            style={styles.tasksTitleContainer} 
            borderRadius={12}
          >
             <Text style={[styles.tasksTitle, { color: colors.text }]}>
               {viewMode === 'day' ? 'Timeline View' : `Tasks for ${selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
             </Text>
          </GlassMorphism>
          
           {viewMode === 'day' ? (
             // Day view timeline
             <ScrollView 
               style={styles.timelineContainer} 
               showsVerticalScrollIndicator={false}
               contentContainerStyle={styles.timelineScrollContent}
             >
               {(() => {
                 const dayTasks = getTasksForDate(selectedDate);
                 const now = new Date();
                 const currentHour = now.getHours();
                 const currentMinute = now.getMinutes();
                 const isToday = 
                   selectedDate.getDate() === new Date().getDate() && 
                   selectedDate.getMonth() === new Date().getMonth() && 
                   selectedDate.getFullYear() === new Date().getFullYear();

                 // Generate hours for the timeline (6 AM to 11 PM)
                 const hours = [];
                 for (let hour = 6; hour <= 23; hour++) {
                   hours.push(hour);
                 }

                 // Get tasks for a specific hour
                 const getTasksForHour = (hour: number) => {
                   return dayTasks.filter(task => {
                     const taskStart = new Date(task.start_time);
                     const taskEnd = new Date(task.end_time);
                     return taskStart.getHours() <= hour && taskEnd.getHours() >= hour;
                   });
                 };

                 // Format time for display
                 const formatTime = (hour: number) => {
                   if (hour === 0) return '12 AM';
                   if (hour < 12) return `${hour} AM`;
                   if (hour === 12) return '12 PM';
                   return `${hour - 12} PM`;
                 };

                 return hours.map((hour) => {
                   const hourTasks = getTasksForHour(hour);
                   const isCurrentHour = isToday && hour === currentHour;
                   const isPastHour = isToday && hour < currentHour;
                   const isFutureHour = isToday && hour > currentHour;

                   return (
                     <View key={hour} style={styles.timelineHour}>
                       <View style={styles.timelineHourHeader}>
                         <Text style={[
                           styles.timelineHourText, 
                           { 
                             color: isCurrentHour ? colors.tint : 
                                    isPastHour ? colors.textSecondary : 
                                    colors.text 
                           }
                         ]}>
                           {formatTime(hour)}
                         </Text>
                         
                         {isCurrentHour && (
                           <View style={[styles.currentTimeIndicator, { backgroundColor: colors.tint }]}>
                             <Text style={styles.currentTimeText}>
                               {currentMinute < 10 ? `0${currentMinute}` : currentMinute}
                             </Text>
                           </View>
                         )}
                       </View>

                       <View style={[
                         styles.timelineHourContent,
                         {
                           backgroundColor: isCurrentHour ? 
                             actualTheme === 'dark' ? 'rgba(74,144,226,0.1)' : 'rgba(74,144,226,0.05)' :
                             actualTheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.05)',
                           borderColor: isCurrentHour ? colors.tint + '40' : 'rgba(255,255,255,0.1)',
                         }
                       ]}>
                         {hourTasks.length > 0 ? (
                           hourTasks.map((task) => (
                             <TouchableOpacity
                               key={task.id}
                               style={[
                                 styles.timelineTaskItem,
                                 {
                                   backgroundColor: getPriorityColor(task, colors.tint) + '20',
                                   borderLeftColor: getPriorityColor(task, colors.tint),
                                 }
                               ]}
                               onPress={() => handleTaskPress(task)}
                             >
                               <View style={styles.timelineTaskContent}>
                                 <Text style={[styles.timelineTaskName, { color: colors.text }]}>
                                   {task.name}
                                 </Text>
                                 <Text style={[styles.timelineTaskTime, { color: colors.textSecondary }]}>
                                   {new Date(task.start_time).toLocaleTimeString([], { 
                                     hour: '2-digit', 
                                     minute: '2-digit' 
                                   })} - {new Date(task.end_time).toLocaleTimeString([], { 
                                     hour: '2-digit', 
                                     minute: '2-digit' 
                                   })}
                                 </Text>
                                 <View style={styles.timelineTaskMeta}>
                                   <View style={[
                                     styles.timelineTaskPriority,
                                     { backgroundColor: getPriorityColor(task, colors.tint) + '40' }
                                   ]}>
                                     <Text style={[
                                       styles.timelineTaskPriorityText,
                                       { color: getPriorityColor(task, colors.tint) }
                                     ]}>
                                       {task.priority || 'medium'}
                                     </Text>
                                   </View>
                                   <Text style={[
                                     styles.timelineTaskStatus,
                                     { 
                                       color: task.status === 'completed' ? '#4CAF50' :
                                              task.status === 'in_progress' ? '#FFA726' :
                                              colors.textSecondary
                                     }
                                   ]}>
                                     {task.status.replace('_', ' ')}
                                   </Text>
                                 </View>
                               </View>
                             </TouchableOpacity>
                           ))
                         ) : (
                           <View style={styles.timelineEmptyHour}>
                             <Text style={[styles.timelineEmptyText, { color: colors.textSecondary }]}>
                               No tasks scheduled
                             </Text>
                           </View>
                         )}
                       </View>
                     </View>
                   );
                 });
               })()}
             </ScrollView>
           ) : (
             // Regular list view for other modes
          <View style={styles.tasksList}>
            {(() => {
              const selectedDateTasks = getTasksForDate(selectedDate);
              
              if (selectedDateTasks.length === 0) {
                return (
                  <View style={[styles.noTasksItem, { backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.15)' }]}>
                    <Text style={[styles.noTasksText, { color: colors.text }]}>No tasks scheduled</Text>
                    <Text style={[styles.promptText, { color: actualTheme === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)' }]}>Tap the + button to add a task</Text>
                  </View>
                );
              }
              
              return selectedDateTasks.map((task) => (
                <View 
                  key={task.id} 
                  style={[
                    styles.taskItem, 
                    { 
                      backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)',
                      borderLeftColor: task.status === 'completed' ? '#4CAF50' :
                                      task.status === 'in_progress' ? '#FFA726' :
                                      colors.tint,
                    }
                  ]}
                >
                  <View style={styles.taskHeader}>
                    <View style={styles.taskTitleContainer}>
                      <Text style={[styles.taskName, { color: colors.text }]}>{task.name}</Text>
                      <View style={[styles.priorityBadge, { 
                        backgroundColor: getPriorityColor(task, colors.tint) + '20',
                        borderColor: getPriorityColor(task, colors.tint),
                      }]}>
                        <Text style={[styles.priorityText, { 
                          color: getPriorityColor(task, colors.tint) 
                        }]}>
                          {task.priority || 'medium'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.taskStatus, { 
                      color: task.status === 'completed' ? '#4CAF50' :
                            task.status === 'in_progress' ? '#FFA726' :
                            colors.textSecondary
                    }]}>
                      {task.status.replace('_', ' ')}
                    </Text>
                  </View>
                  <Text style={[styles.taskTime, { color: colors.textSecondary }]}>
                    {new Date(task.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                    {new Date(task.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              ));
            })()}
          </View>
           )}
        </GlassMorphism> */}
      </ScrollView>

       {selectedTask && (
         <Modal
           visible
           animationType="slide"
           transparent
           onRequestClose={closeTaskDetails}
         >
           <View style={styles.simpleModalOverlay}>
             <Pressable style={StyleSheet.absoluteFillObject} onPress={closeTaskDetails} />
             <Pressable style={styles.simpleModalContent} onPress={(e) => e.stopPropagation()}>
               <View style={[
                 styles.simpleModalCard,
                 { backgroundColor: actualTheme === 'dark' ? 'rgba(30,30,40,0.95)' : 'rgba(255,255,255,0.95)' }
               ]}>
                 <View style={styles.simpleModalHeader}>
                   <Text style={[styles.simpleModalTitle, { color: colors.text }]}>
                     {selectedTask.name}
                   </Text>
                   <TouchableOpacity onPress={closeTaskDetails} style={styles.simpleModalClose}>
                     <Ionicons name="close" size={24} color={colors.text} />
                   </TouchableOpacity>
                 </View>

                 <View style={styles.simpleModalBody}>
                   {/* Priority */}
                   <View style={styles.simpleModalRow}>
                     <Text style={[styles.simpleModalLabel, { color: colors.textSecondary }]}>Priority:</Text>
                     <Text style={[styles.simpleModalValue, { color: colors.text }]}>
                       {selectedTask.priority}
                     </Text>
                   </View>

                   {/* Status */}
                   <View style={styles.simpleModalRow}>
                     <Text style={[styles.simpleModalLabel, { color: colors.textSecondary }]}>Status:</Text>
                     <Text style={[
                       styles.simpleModalValue, 
                       { color: selectedTask.status === 'in_progress' ? '#FFA726' : 
                                selectedTask.status === 'completed' ? '#4CAF50' :
                                selectedTask.status === 'paused' ? '#FF7043' :
                                selectedTask.status === 'cancelled' ? '#EF5350' :
                                colors.text }
                     ]}>
                       {selectedTask.status.replace('_', ' ')}
                     </Text>
                   </View>

                   {/* Duration */}
                   <View style={styles.simpleModalRow}>
                     <Text style={[styles.simpleModalLabel, { color: colors.textSecondary }]}>Duration:</Text>
                     <Text style={[styles.simpleModalValue, { color: colors.text }]}>
                       {formatDuration(selectedTask.duration)}
                     </Text>
                   </View>

                   {/* Color Label */}
                   <TouchableOpacity
                     onPress={() => {
                       console.log('Color label button pressed, opening picker...');
                       setShowColorPicker(true);
                     }}
                     activeOpacity={0.7}
                     style={styles.simpleModalRow}
                   >
                     <Text style={[styles.simpleModalLabel, { color: colors.textSecondary }]}>Color Label:</Text>
                     <View style={[styles.colorLabelButton, { backgroundColor: getColorForLabel(selectedTask.colorLabel) + '20' }]}>
                       <View style={[styles.colorLabelSwatch, { backgroundColor: getColorForLabel(selectedTask.colorLabel) }]} />
                       <Text style={[styles.simpleModalValue, { color: colors.text, marginLeft: 8 }]}>
                         {getLabelName(selectedTask.colorLabel)}
                       </Text>
                       <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} style={{ marginLeft: 8 }} />
                     </View>
                   </TouchableOpacity>

                   {/* Start Time */}
                   <View style={styles.simpleModalRow}>
                     <Text style={[styles.simpleModalLabel, { color: colors.textSecondary }]}>Start Time:</Text>
                     <View style={styles.timeEditContainer}>
                       <Text style={[styles.simpleModalValue, { color: colors.text, flex: 1 }]}>
                         {editedStartTime ? formatDateTime(editedStartTime.toISOString()) : formatDateTime(selectedTask.start_time)}
                       </Text>
                       <TouchableOpacity
                         onPress={() => setEditingTime('start')}
                         style={[styles.editButton, { backgroundColor: colors.tint + '20' }]}
                       >
                         <Ionicons name="create-outline" size={18} color={colors.tint} />
                       </TouchableOpacity>
                     </View>
                   </View>

                   {/* End Time */}
                   <View style={styles.simpleModalRow}>
                     <Text style={[styles.simpleModalLabel, { color: colors.textSecondary }]}>End Time:</Text>
                     <View style={styles.timeEditContainer}>
                       <Text style={[styles.simpleModalValue, { color: colors.text, flex: 1 }]}>
                         {editedEndTime ? formatDateTime(editedEndTime.toISOString()) : formatDateTime(selectedTask.end_time)}
                       </Text>
                       <TouchableOpacity
                         onPress={() => setEditingTime('end')}
                         style={[styles.editButton, { backgroundColor: colors.tint + '20' }]}
                       >
                         <Ionicons name="create-outline" size={18} color={colors.tint} />
                       </TouchableOpacity>
                     </View>
                   </View>

                   {/* Save/Cancel buttons when editing */}
                   {(editingTime || (editedStartTime && editedEndTime && 
                     (editedStartTime.toISOString() !== selectedTask.start_time || 
                      editedEndTime.toISOString() !== selectedTask.end_time))) && (
                     <View style={styles.timeEditActions}>
                       <TouchableOpacity
                         onPress={() => {
                           setEditingTime(null);
                           setEditedStartTime(new Date(selectedTask.start_time));
                           setEditedEndTime(new Date(selectedTask.end_time));
                         }}
                         style={[styles.cancelTimeButton, { backgroundColor: actualTheme === 'dark' ? '#2a2a2a' : '#f0f0f0' }]}
                       >
                         <Text style={[styles.cancelTimeButtonText, { color: colors.text }]}>Cancel</Text>
                       </TouchableOpacity>
                       <TouchableOpacity
                         onPress={handleSaveTimeChanges}
                         style={[styles.saveTimeButton, { backgroundColor: colors.tint }]}
                       >
                         <Text style={styles.saveTimeButtonText}>Save Changes</Text>
                       </TouchableOpacity>
                     </View>
                   )}

                   {/* DateTime Picker */}
                   {editingTime && (editedStartTime || editedEndTime) && (
                     <View style={styles.dateTimePickerContainer}>
                       {Platform.OS === 'ios' ? (
                         <View style={[styles.dateTimePickerWrapper, { backgroundColor: actualTheme === 'dark' ? '#2a2a2a' : '#f8f9fa' }]}>
                           <DateTimePicker
                             value={editingTime === 'start' ? (editedStartTime || new Date()) : (editedEndTime || new Date())}
                             mode="datetime"
                             display="spinner"
                             onChange={handleTimeChange}
                             textColor={colors.text}
                           />
                           <View style={styles.pickerActions}>
                             <TouchableOpacity
                               onPress={() => setEditingTime(null)}
                               style={styles.pickerCancelButton}
                             >
                               <Text style={[styles.pickerButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                             </TouchableOpacity>
                             <TouchableOpacity
                               onPress={() => {
                                 if (editingTime === 'start' && editedStartTime) {
                                   setEditingTime(null);
                                 } else if (editingTime === 'end' && editedEndTime) {
                                   setEditingTime(null);
                                 }
                               }}
                               style={[styles.pickerDoneButton, { backgroundColor: colors.tint }]}
                             >
                               <Text style={[styles.pickerButtonText, { color: '#fff' }]}>Done</Text>
                             </TouchableOpacity>
                           </View>
                         </View>
                       ) : (
                         editingTime && (
                           <DateTimePicker
                             value={editingTime === 'start' ? (editedStartTime || new Date()) : (editedEndTime || new Date())}
                             mode="datetime"
                             display="default"
                             onChange={handleTimeChange}
                           />
                         )
                       )}
                     </View>
                   )}

                   {/* Created At */}
                   <View style={styles.simpleModalRow}>
                     <Text style={[styles.simpleModalLabel, { color: colors.textSecondary }]}>Created:</Text>
                     <Text style={[styles.simpleModalValue, { color: colors.text }]}>
                       {formatDateTime(selectedTask.created_at)}
                     </Text>
                   </View>

                   {/* Updated At */}
                   <View style={styles.simpleModalRow}>
                     <Text style={[styles.simpleModalLabel, { color: colors.textSecondary }]}>Updated:</Text>
                     <Text style={[styles.simpleModalValue, { color: colors.text }]}>
                       {formatDateTime(selectedTask.updated_at)}
                     </Text>
                   </View>

                   {/* Completed At (if applicable) */}
                   {selectedTask.completed_at && (
                     <View style={styles.simpleModalRow}>
                       <Text style={[styles.simpleModalLabel, { color: colors.textSecondary }]}>Completed:</Text>
                       <Text style={[styles.simpleModalValue, { color: '#4CAF50' }]}>
                         {formatDateTime(selectedTask.completed_at)}
                       </Text>
                     </View>
                   )}

                   {/* Paused At (if applicable) */}
                   {selectedTask.paused_at && (
                     <View style={styles.simpleModalRow}>
                       <Text style={[styles.simpleModalLabel, { color: colors.textSecondary }]}>Paused:</Text>
                       <Text style={[styles.simpleModalValue, { color: '#FF7043' }]}>
                         {formatDateTime(selectedTask.paused_at)}
                       </Text>
                     </View>
                   )}

                   {/* Cancelled At (if applicable) */}
                   {selectedTask.cancelled_at && (
                     <View style={styles.simpleModalRow}>
                       <Text style={[styles.simpleModalLabel, { color: colors.textSecondary }]}>Cancelled:</Text>
                       <Text style={[styles.simpleModalValue, { color: '#EF5350' }]}>
                         {formatDateTime(selectedTask.cancelled_at)}
                       </Text>
                     </View>
                   )}
                 </View>
               </View>
             </Pressable>
             {/* Color Label Picker - Rendered inside modal to ensure proper layering */}
             <ColorLabelPicker
               visible={showColorPicker}
               selectedLabel={selectedTask?.colorLabel}
               onSelect={handleColorLabelChange}
               onClose={() => setShowColorPicker(false)}
             />
           </View>
         </Modal>
       )}

      {/* Chat Assistant Modal - Replaces Task Input Modal */}
      <Modal
        visible={showTaskInput}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowTaskInput(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          {/* Header with close button */}
          <View style={[styles.modalHeader, { borderBottomColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
            <Text style={[styles.modalTitle, { color: actualTheme === 'dark' ? '#fff' : '#333' }]}>
              AI Assistant - {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
            <TouchableOpacity 
              onPress={() => setShowTaskInput(false)}
              style={styles.cancelButton}
            >
              <FontAwesome name="times" size={20} color={actualTheme === 'dark' ? '#fff' : '#666'} />
            </TouchableOpacity>
          </View>

          {/* Chat Assistant Component */}
          <View style={styles.chatContainer}>
            <ChatAssistant 
              initialMessage={`Schedule a task for ${selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
              onClose={() => setShowTaskInput(false)}
              hideHeader={true}
              onTaskCreated={() => {
                    // Clear any existing sync interval before starting a new one
                    if (syncIntervalRef.current) {
                      clearInterval(syncIntervalRef.current)
                      syncIntervalRef.current = null
                    }

                    // Reload tasks after a delay to allow backend processing
                    // The backend needs to: 1) solve the task, 2) create solution, 3) processor creates timeline
                    // This can take 5-10 seconds, so we'll check multiple times
                    let attempts = 0
                    const maxAttempts = 30 // Check for up to 30 seconds (solver can take 20-30 seconds)
                    const checkInterval = setInterval(async () => {
                      attempts++
                      console.log(`🔄 Checking for timeline update (attempt ${attempts}/${maxAttempts})...`)
                      
                      // Sync from task_solution table (same as web app)
                      const result = await syncTasksFromSupabase()
                      
                      if (result.success && result.taskCount > 0) {
                        console.log(`✅ Synced ${result.taskCount} tasks! Reloading calendar...`)
                        // Reload tasks from internalDB
                        loadTasks()
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
                          loadTasks()
                        }
                      }
                    }, 1000)
                    syncIntervalRef.current = checkInterval
                  }}
                />
          </View>
        </SafeAreaView>
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

      {/* Navigation Drawer */}
      <Modal
        visible={drawerOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setDrawerOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <Pressable 
            style={StyleSheet.absoluteFill}
            onPress={() => setDrawerOpen(false)}
          />
          <View 
            style={[
              styles.drawerContent,
              { backgroundColor: actualTheme === 'dark' ? 'rgba(30, 30, 40, 0.98)' : 'rgba(255, 255, 255, 0.98)' }
            ]}
          >
            <View style={styles.drawerHeader}>
              <Text style={[styles.drawerTitle, { color: colors.text }]}>View Options</Text>
              <TouchableOpacity 
                onPress={() => setDrawerOpen(false)}
                style={styles.drawerCloseButton}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.drawerOptions}>
              <TouchableOpacity
                onPress={() => {
                  setViewMode('month');
                  setDrawerOpen(false);
                }}
                style={[
                  styles.drawerOption,
                  {
                    backgroundColor: viewMode === 'month' 
                      ? colors.tint 
                      : 'transparent',
                  }
                ]}
              >
                <Ionicons 
                  name="grid" 
                  size={24} 
                  color={viewMode === 'month' ? '#fff' : colors.text} 
                />
                <Text style={[
                  styles.drawerOptionText,
                  { color: viewMode === 'month' ? '#fff' : colors.text }
                ]}>
                  Month
                </Text>
                {viewMode === 'month' && (
                  <Ionicons name="checkmark" size={20} color="#fff" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setViewMode('week');
                  updateViewsForSelectedDate(selectedDate);
                  setDrawerOpen(false);
                }}
                style={[
                  styles.drawerOption,
                  {
                    backgroundColor: viewMode === 'week' 
                      ? colors.tint 
                      : 'transparent',
                  }
                ]}
              >
                <Ionicons 
                  name="calendar" 
                  size={24} 
                  color={viewMode === 'week' ? '#fff' : colors.text} 
                />
                <Text style={[
                  styles.drawerOptionText,
                  { color: viewMode === 'week' ? '#fff' : colors.text }
                ]}>
                  Week
                </Text>
                {viewMode === 'week' && (
                  <Ionicons name="checkmark" size={20} color="#fff" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setViewMode('3day');
                  updateViewsForSelectedDate(selectedDate);
                  setDrawerOpen(false);
                }}
                style={[
                  styles.drawerOption,
                  {
                    backgroundColor: viewMode === '3day' 
                      ? colors.tint 
                      : 'transparent',
                  }
                ]}
              >
                <Ionicons 
                  name="calendar-outline" 
                  size={24} 
                  color={viewMode === '3day' ? '#fff' : colors.text} 
                />
                <Text style={[
                  styles.drawerOptionText,
                  { color: viewMode === '3day' ? '#fff' : colors.text }
                ]}>
                  3 Day
                </Text>
                {viewMode === '3day' && (
                  <Ionicons name="checkmark" size={20} color="#fff" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setViewMode('day');
                  setDrawerOpen(false);
                }}
                style={[
                  styles.drawerOption,
                  {
                    backgroundColor: viewMode === 'day' 
                      ? colors.tint 
                      : 'transparent',
                  }
                ]}
              >
                <Ionicons 
                  name="today" 
                  size={24} 
                  color={viewMode === 'day' ? '#fff' : colors.text} 
                />
                <Text style={[
                  styles.drawerOptionText,
                  { color: viewMode === 'day' ? '#fff' : colors.text }
                ]}>
                  Day
                </Text>
                {viewMode === 'day' && (
                  <Ionicons name="checkmark" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Month/Year Picker Modal */}
      <Modal
        visible={monthPickerOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setMonthPickerOpen(false)}
      >
        <Pressable 
          style={styles.monthPickerOverlay}
          onPress={() => setMonthPickerOpen(false)}
        >
          <Pressable 
            style={[
              styles.monthPickerContent,
              { backgroundColor: actualTheme === 'dark' ? 'rgba(30, 30, 40, 0.98)' : 'rgba(255, 255, 255, 0.98)' }
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.monthPickerHeader}>
              <Text style={[styles.monthPickerTitle, { color: colors.text }]}>Select Month</Text>
              <TouchableOpacity 
                onPress={() => setMonthPickerOpen(false)}
                style={styles.monthPickerCloseButton}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView 
              ref={monthPickerScrollRef}
              style={styles.monthPickerScroll}
              contentContainerStyle={styles.monthPickerScrollContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {(() => {
                const months = [];
                // Use the current date's year (the month being viewed), not today's year
                const currentYear = currentDate.getFullYear();
                const years = [];
                
                // Generate years (current year ± 5 years)
                for (let year = currentYear - 5; year <= currentYear + 5; year++) {
                  years.push(year);
                }

                const monthNames = [
                  'January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'
                ];

                return years.map((year) => (
                  <View key={year} style={styles.monthPickerYearSection}>
                    <Text style={[styles.monthPickerYearLabel, { color: colors.textSecondary }]}>
                      {year}
                    </Text>
                    <View style={styles.monthPickerMonthsGrid}>
                      {monthNames.map((month, index) => {
                        const isSelected = 
                          currentDate.getFullYear() === year && 
                          currentDate.getMonth() === index;
                        const isCurrentMonth = 
                          new Date().getFullYear() === year && 
                          new Date().getMonth() === index;

                        return (
                          <TouchableOpacity
                            key={`${year}-${index}`}
                            onPress={() => {
                              const newDate = new Date(year, index, 1);
                              setCurrentDate(newDate);
                              setSelectedDate(newDate);
                              updateViewsForSelectedDate(newDate);
                              setMonthPickerOpen(false);
                            }}
                            style={[
                              styles.monthPickerMonthItem,
                              {
                                backgroundColor: isSelected 
                                  ? colors.tint 
                                  : isCurrentMonth
                                  ? actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                                  : 'transparent',
                              }
                            ]}
                          >
                            <Text style={[
                              styles.monthPickerMonthText,
                              { 
                                color: isSelected ? '#fff' : colors.text,
                                fontWeight: isSelected ? '700' : isCurrentMonth ? '600' : '500'
                              }
                            ]}>
                              {month.substring(0, 3)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ));
              })()}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
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
  processingBannerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  hamburgerButton: {
    padding: 8,
    marginRight: 8,
  },
  calendarContainer: {
    margin: 20,
    marginBottom: 10,
    padding: 16,
  },
  monthNavigation: {
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  navigationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'nowrap',
  },
  monthTitleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexShrink: 0,
    minWidth: 100,
  },
  monthText: {
    fontSize: 17,
    fontWeight: '600',
    marginRight: 4,
    flexShrink: 0,
  },
  monthChevron: {
    opacity: 0.6,
  },
  navigationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  arrowButton: {
    padding: 8,
    borderRadius: 8,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  deleteAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
    minHeight: 40,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginTop: 8,
    minHeight: 280,
    borderRadius: 12,
  },
  weekDayHeader: {
    width: '14.28%',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  weekDayHeaderContent: {
    padding: 6,
    width: '100%',
    alignItems: 'center',
    minHeight: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  weekDayText: {
    fontSize: 10,
    fontWeight: '700',
    opacity: 0.8,
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    padding: 3,
    maxHeight: 50,
  },
  dayCellContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    minHeight: 40,
    minWidth: 40,
    maxHeight: 44,
    borderRadius: 8,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  dayCellGradientOverlay: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    overflow: 'hidden',
  },
  dayText: {
    fontSize: 16,
    fontWeight: '600',
  },
  todayText: {
    fontWeight: '800',
  },
  selectedText: {
    fontWeight: '700',
  },
  taskIndicators: {
    position: 'absolute',
    right: 2,
    top: 0,
    width: 12,
    height: '100%',
  },
  taskIndicatorLine: {
    position: 'absolute',
    right: 0,
    width: 8,
    height: 2,
    borderRadius: 1,
  },
  moreTasksIndicator: {
    position: 'absolute',
    bottom: 1,
    right: -1,
    fontSize: 8,
    fontWeight: 'bold',
  },
  tasksSection: {
    margin: 20,
    marginTop: 10,
    padding: 16,
    minHeight: 150,
  },
  tasksSectionDayView: {
    marginTop: 0,
    paddingTop: 8,
  },
  tasksTitleContainer: {
    marginBottom: 16,
    padding: 16,
    marginHorizontal: 0,
  },
  tasksTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  tasksList: {
    gap: 8,
  },
  noTasksItem: {
    padding: 20,
    alignItems: 'center',
    minHeight: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  noTasksText: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 4,
  },
  promptText: {
    fontSize: 14,
    opacity: 0.5,
  },
  taskItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  taskTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  taskStatus: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  taskTime: {
    fontSize: 14,
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
  taskDetailsModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  taskDetailsModalContent: {
    width: '100%',
    maxWidth: 400,
  },
  taskDetailsCard: {
    padding: 20,
    borderRadius: 20,
  },
  taskDetailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  taskDetailsTitleWrapper: {
    flex: 1,
    marginRight: 12,
  },
  taskDetailsTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  taskDetailsPriority: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  taskDetailsPriorityText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  taskDetailsCloseButton: {
    padding: 6,
  },
  taskDetailsRow: {
    marginBottom: 16,
  },
  taskDetailsLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 6,
    opacity: 0.7,
  },
  taskDetailsStatus: {
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  taskDetailsInfoRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  taskDetailsInfoColumn: {
    flex: 1,
  },
  taskDetailsInfoColumnSpacing: {
    marginRight: 16,
  },
  taskDetailsValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  taskDetailsDivider: {
    height: 1,
    borderRadius: 1,
  },
  taskDetailsTimestamps: {
    marginTop: 8,
  },
  taskDetailsTimestampText: {
    fontSize: 12,
    opacity: 0.65,
    marginTop: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  chatContainer: {
    flex: 1,
    width: '100%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 10,
  },
  modalContent: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
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
    opacity: 0.6,
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
  },
  voiceButtonActive: {
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
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
    color: Colors.light.textDanger,
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
    marginBottom: 12,
  },
  exampleChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  exampleText: {
    fontSize: 14,
  },
  // Weekly view styles
  weekContainer: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginTop: 8,
  },
  weekHeaderRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekHeaderCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  weekHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.8,
  },
  weekDaysRow: {
    flexDirection: 'row',
    minHeight: 120,
  },
  weekDayCell: {
    flex: 1,
    padding: 4,
  },
  weekDayCellContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    minHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  weekDayNumber: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  weekMonthLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 8,
    opacity: 0.7,
  },
  weekTaskIndicators: {
    alignItems: 'center',
    gap: 4,
    marginTop: 'auto',
    paddingBottom: 8,
  },
  weekTaskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginVertical: 1,
  },
  weekMoreTasks: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  // 3-day view styles
  threeDayContainer: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginTop: 8,
  },
  threeDayHeaderRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  threeDayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  threeDayHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.8,
  },
  threeDayDaysRow: {
    flexDirection: 'row',
    minHeight: 140,
  },
  threeDayCell: {
    flex: 1,
    padding: 6,
  },
  threeDayCellContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    minHeight: 120,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  threeDayNumber: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  threeDayMonthLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 12,
    opacity: 0.7,
  },
  threeDayTaskIndicators: {
    alignItems: 'center',
    gap: 4,
    marginTop: 'auto',
    paddingBottom: 12,
  },
  threeDayTaskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginVertical: 1,
  },
  threeDayMoreTasks: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  // Day view styles
  dayContainer: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginTop: 8,
    flex: 1,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  dayHeaderText: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
  },
  todayBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  todayBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  timelineContainer: {
    flex: 1,
    paddingHorizontal: 12,
    maxHeight: 400, // Limit height to make it scrollable
  },
  timelineScrollContent: {
    paddingBottom: 20, // Add padding at bottom for better scrolling
  },
  timelineHour: {
    marginBottom: 8,
  },
  timelineHourHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  timelineHourText: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 60,
  },
  currentTimeIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  currentTimeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  timelineHourContent: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    minHeight: 60,
  },
  timelineTaskItem: {
    borderRadius: 6,
    borderLeftWidth: 4,
    padding: 12,
    marginBottom: 8,
  },
  timelineTaskContent: {
    flex: 1,
  },
  timelineTaskName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  timelineTaskTime: {
    fontSize: 12,
    marginBottom: 8,
  },
  timelineTaskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineTaskPriority: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timelineTaskPriorityText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  timelineTaskStatus: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  timelineEmptyHour: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  timelineEmptyText: {
    fontSize: 14,
    opacity: 0.6,
  },
  // Simple modal styles
  simpleModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
  },
  simpleModalContent: {
    width: '100%',
    maxWidth: 400,
  },
  simpleModalCard: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  simpleModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  simpleModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  simpleModalClose: {
    padding: 4,
  },
  simpleModalBody: {
    gap: 12,
  },
  simpleModalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  simpleModalLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  simpleModalValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    marginLeft: 12,
  },
  timeEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  editButton: {
    padding: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeEditActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  cancelTimeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelTimeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveTimeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveTimeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  dateTimePickerContainer: {
    marginTop: 12,
  },
  dateTimePickerWrapper: {
    borderRadius: 12,
    padding: 12,
  },
  pickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  pickerCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pickerDoneButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pickerButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  colorLabelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    marginLeft: 12,
  },
  colorLabelSwatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  // Drawer styles
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  drawerContent: {
    width: '75%',
    maxWidth: 300,
    height: '100%',
    paddingTop: 60,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  drawerCloseButton: {
    padding: 4,
  },
  drawerOptions: {
    paddingTop: 20,
  },
  drawerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
  },
  drawerOptionText: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 16,
    flex: 1,
  },
  // Month picker styles
  monthPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  monthPickerContent: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  monthPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  monthPickerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  monthPickerCloseButton: {
    padding: 4,
  },
  monthPickerScroll: {
    maxHeight: 400,
  },
  monthPickerScrollContent: {
    paddingBottom: 20,
  },
  monthPickerYearSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  monthPickerYearLabel: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    opacity: 0.7,
  },
  monthPickerMonthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthPickerMonthItem: {
    width: '22%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginBottom: 8,
  },
  monthPickerMonthText: {
    fontSize: 14,
  },
  // New Week View Styles
  weekViewContainer: {
    flex: 1,
  },
  weekHeaderDateContainer: {
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 24,
  },
  weekHeaderDateText: {
    fontSize: 14,
    fontWeight: '600',
  },
  weekGridContainer: {
    flexDirection: 'row',
    flex: 1,
  },
  timeColumn: {
    width: 40,
    paddingRight: 4,
  },
  timeLabelCell: {
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  timeLabelText: {
    fontSize: 10,
    fontWeight: '500',
  },
  dayColumn: {
    flex: 1,
    borderLeftWidth: 1,
  },
  gridCell: {
    borderBottomWidth: 1,
  },
  weekTaskBox: {
    position: 'absolute',
    left: 1,
    right: 1,
    borderRadius: 4,
    padding: 2,
    zIndex: 10,
    justifyContent: 'center',
  },
  weekTaskText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#fff',
  },
});