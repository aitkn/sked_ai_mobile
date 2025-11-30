import { StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert, Modal, View, Pressable } from 'react-native';
import { Text } from '@/components/Themed';
import { useState, useEffect, useRef } from 'react';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
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
  const [viewMode, setViewMode] = useState<'month' | 'week' | '3day' | 'day'>('month');
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
  const syncIntervalRef = useRef<NodeJS.Timeout | number | null>(null);

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

  // Helper function to get priority-based color for pending tasks
  const getPriorityColor = (task: InternalTask, themeColor: string): string => {
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
  };

  const closeTaskDetails = () => {
    setSelectedTask(null);
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
                                       getPriorityColor(task, colors.tint),
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

  const renderWeekView = () => {
    const weekDays = getWeekDays();
    const weekDayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    return (
      <View style={styles.weekContainer}>
        {/* Week day headers */}
        <View style={styles.weekHeaderRow}>
          {weekDayLabels.map((label, index) => (
            <View key={label} style={styles.weekHeaderCell}>
              <Text style={[styles.weekHeaderText, { color: colors.text }]}>{label}</Text>
            </View>
          ))}
        </View>
        
        {/* Week day cells */}
        <View style={styles.weekDaysRow}>
          {weekDays.map((day, index) => {
            const isToday = 
              day.getDate() === new Date().getDate() && 
              day.getMonth() === new Date().getMonth() && 
              day.getFullYear() === new Date().getFullYear();

            const isSelected = 
              day.getDate() === selectedDate.getDate() && 
              day.getMonth() === selectedDate.getMonth() && 
              day.getFullYear() === selectedDate.getFullYear();

            const hasTasks = hasTasksOnDate(day);
            const dayTasks = getTasksForDate(day);

            return (
              <TouchableOpacity
                key={index}
                style={styles.weekDayCell}
                onPress={() => {
                  const newDate = new Date(day);
                  setSelectedDate(newDate);
                  updateViewsForSelectedDate(newDate);
                }}
              >
                <View 
                  style={[
                    styles.weekDayCellContent,
                    {
                      backgroundColor: isSelected 
                        ? colors.tint 
                        : (isToday 
                          ? actualTheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(74,144,226,0.1)'
                          : actualTheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.08)'
                        ),
                      borderColor: isSelected ? colors.tint : (isToday ? colors.tint + '80' : 'transparent'),
                      borderWidth: isSelected || isToday ? 2 : 1,
                    }
                  ]}
                >
                  {/* Day number */}
                  <Text style={[
                    styles.weekDayNumber,
                    { 
                      color: isSelected ? '#fff' : colors.text,
                      fontWeight: isToday ? '800' : '600' 
                    }
                  ]}>
                    {day.getDate()}
                  </Text>
                  
                  {/* Month label for first/last days */}
                  {(index === 0 || day.getDate() === 1) && (
                    <Text style={[
                      styles.weekMonthLabel,
                      { color: isSelected ? '#fff' : colors.textSecondary }
                    ]}>
                      {day.toLocaleDateString('en-US', { month: 'short' })}
                    </Text>
                  )}
                  
                  {/* Task indicators */}
                  {hasTasks && (
                    <View style={styles.weekTaskIndicators}>
                      {dayTasks.slice(0, 2).map((task, taskIndex) => (
                        <View 
                          key={task.id} 
                          style={[
                            styles.weekTaskDot,
                            {
                              backgroundColor: isSelected && task.status === 'pending' ? '#fff' : 
                                             getPriorityColor(task, colors.tint),
                            }
                          ]} 
                        />
                      ))}
                      {dayTasks.length > 2 && (
                        <Text style={[
                          styles.weekMoreTasks, 
                          { color: isSelected ? '#fff' : colors.text }
                        ]}>
                          +{dayTasks.length - 2}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const render3DayView = () => {
    const threeDays = get3DayDays();
    const dayLabels = threeDays.map(day => day.toLocaleDateString('en-US', { weekday: 'short' }));
    
    return (
      <View style={styles.threeDayContainer}>
        {/* 3-day headers */}
        <View style={styles.threeDayHeaderRow}>
          {dayLabels.map((label, index) => (
            <View key={label} style={styles.threeDayHeaderCell}>
              <Text style={[styles.threeDayHeaderText, { color: colors.text }]}>{label}</Text>
            </View>
          ))}
        </View>
        
        {/* 3-day cells */}
        <View style={styles.threeDayDaysRow}>
          {threeDays.map((day, index) => {
            const isToday = 
              day.getDate() === new Date().getDate() && 
              day.getMonth() === new Date().getMonth() && 
              day.getFullYear() === new Date().getFullYear();

            const isSelected = 
              day.getDate() === selectedDate.getDate() && 
              day.getMonth() === selectedDate.getMonth() && 
              day.getFullYear() === selectedDate.getFullYear();

            const hasTasks = hasTasksOnDate(day);
            const dayTasks = getTasksForDate(day);

            return (
              <TouchableOpacity
                key={index}
                style={styles.threeDayCell}
                onPress={() => {
                  const newDate = new Date(day);
                  setSelectedDate(newDate);
                  updateViewsForSelectedDate(newDate);
                }}
              >
                <View 
                  style={[
                    styles.threeDayCellContent,
                    {
                      backgroundColor: isSelected 
                        ? colors.tint 
                        : (isToday 
                          ? actualTheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(74,144,226,0.1)'
                          : actualTheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.08)'
                        ),
                      borderColor: isSelected ? colors.tint : (isToday ? colors.tint + '80' : 'transparent'),
                      borderWidth: isSelected || isToday ? 2 : 1,
                    }
                  ]}
                >
                  {/* Day number */}
                  <Text style={[
                    styles.threeDayNumber,
                    { 
                      color: isSelected ? '#fff' : colors.text,
                      fontWeight: isToday ? '800' : '600' 
                    }
                  ]}>
                    {day.getDate()}
                  </Text>
                  
                  {/* Month label */}
                  <Text style={[
                    styles.threeDayMonthLabel,
                    { color: isSelected ? '#fff' : colors.textSecondary }
                  ]}>
                    {day.toLocaleDateString('en-US', { month: 'short' })}
                  </Text>
                  
                  {/* Task indicators */}
                  {hasTasks && (
                    <View style={styles.threeDayTaskIndicators}>
                      {dayTasks.slice(0, 3).map((task, taskIndex) => (
                        <View 
                          key={task.id} 
                          style={[
                            styles.threeDayTaskDot,
                            {
                              backgroundColor: isSelected && task.status === 'pending' ? '#fff' : 
                                             getPriorityColor(task, colors.tint),
                            }
                          ]} 
                        />
                      ))}
                      {dayTasks.length > 3 && (
                        <Text style={[
                          styles.threeDayMoreTasks, 
                          { color: isSelected ? '#fff' : colors.text }
                        ]}>
                          +{dayTasks.length - 3}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };


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
        <GlassMorphism intensity={actualTheme === 'dark' ? 'strong' : 'strong'} style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Calendar</Text>
          <Text style={[styles.subtitle, { color: colors.text }]}>
            {selectedDate.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </Text>
        </GlassMorphism>
      
      <GlassMorphism intensity={actualTheme === 'dark' ? 'strong' : 'strong'} style={styles.calendarContainer} borderRadius={20}>
        <GlassMorphism intensity={actualTheme === 'dark' ? 'light' : 'medium'} style={styles.monthNavigation} borderRadius={12}>
          <View style={styles.navigationHeader}>
            <GlassMorphism 
              intensity={actualTheme === 'dark' ? 'light' : 'strong'} 
              style={styles.monthTitleContainer} 
              borderRadius={8}
            >
              <Text style={[styles.monthText, { color: colors.text }]}>
                {viewMode === 'month' 
                  ? currentDate.toLocaleDateString('en-US', { 
                      month: 'long', 
                      year: 'numeric' 
                    })
                  : viewMode === 'week'
                  ? `${currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : viewMode === '3day'
                  ? `${current3DayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(current3DayStart.getTime() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : selectedDate.toLocaleDateString('en-US', { 
                      month: 'long', 
                      day: 'numeric',
                      year: 'numeric'
                    })
                }
              </Text>
            </GlassMorphism>
            <View style={styles.viewToggle}>
            <TouchableOpacity 
                onPress={() => setViewMode('month')}
                style={[
                  styles.viewModeButton, 
                  { 
                    backgroundColor: viewMode === 'month' 
                      ? colors.tint 
                      : actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' 
                  }
                ]}
              >
                <Text style={[
                  styles.viewToggleText, 
                  { color: viewMode === 'month' ? '#fff' : colors.text }
                ]}>
                  Month
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => {
                  setViewMode('week');
                  updateViewsForSelectedDate(selectedDate);
                }}
                style={[
                  styles.viewModeButton, 
                  { 
                    backgroundColor: viewMode === 'week' 
                      ? colors.tint 
                      : actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' 
                  }
                ]}
              >
                <Text style={[
                  styles.viewToggleText, 
                  { color: viewMode === 'week' ? '#fff' : colors.text }
                ]}>
                  Week
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => {
                  setViewMode('3day');
                  updateViewsForSelectedDate(selectedDate);
                }}
                style={[
                  styles.viewModeButton, 
                  { 
                    backgroundColor: viewMode === '3day' 
                      ? colors.tint 
                      : actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' 
                  }
                ]}
              >
                <Text style={[
                  styles.viewToggleText, 
                  { color: viewMode === '3day' ? '#fff' : colors.text }
                ]}>
                  3-Day
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => setViewMode('day')}
                style={[
                  styles.viewModeButton, 
                  { 
                    backgroundColor: viewMode === 'day' 
                      ? colors.tint 
                      : actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' 
                  }
                ]}
              >
                <Text style={[
                  styles.viewToggleText, 
                  { color: viewMode === 'day' ? '#fff' : colors.text }
                ]}>
                  Day
              </Text>
            </TouchableOpacity>
            </View>
          </View>
          <View style={styles.monthArrows}>
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
                size={24} 
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
                size={24} 
                color={colors.text}
              />
            </TouchableOpacity>
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
           <View style={styles.dayContainer}>
             <View style={styles.dayHeader}>
               <Text style={[styles.dayHeaderText, { color: colors.text }]}>
                 {selectedDate.toLocaleDateString('en-US', { 
                   weekday: 'long', 
                   month: 'long', 
                   day: 'numeric',
                   year: 'numeric'
                 })}
               </Text>
               {(() => {
                 const isToday = 
                   selectedDate.getDate() === new Date().getDate() && 
                   selectedDate.getMonth() === new Date().getMonth() && 
                   selectedDate.getFullYear() === new Date().getFullYear();
                 
                 return isToday && (
                   <View style={[styles.todayBadge, { backgroundColor: colors.tint }]}>
                     <Text style={styles.todayBadgeText}>Today</Text>
                   </View>
                 );
               })()}
             </View>
           </View>
        )}
      </GlassMorphism>

         <GlassMorphism 
           intensity={actualTheme === 'dark' ? 'extra-strong' : 'strong'} 
           style={[
             styles.tasksSection, 
             viewMode === 'day' && styles.tasksSectionDayView
           ]} 
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
        </GlassMorphism>
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
             <View style={styles.simpleModalContent}>
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

                   {/* Start Time */}
                   <View style={styles.simpleModalRow}>
                     <Text style={[styles.simpleModalLabel, { color: colors.textSecondary }]}>Start Time:</Text>
                     <Text style={[styles.simpleModalValue, { color: colors.text }]}>
                       {formatDateTime(selectedTask.start_time)}
                     </Text>
                   </View>

                   {/* End Time */}
                   <View style={styles.simpleModalRow}>
                     <Text style={[styles.simpleModalLabel, { color: colors.textSecondary }]}>End Time:</Text>
                     <Text style={[styles.simpleModalValue, { color: colors.text }]}>
                       {formatDateTime(selectedTask.end_time)}
                     </Text>
                   </View>

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
             </View>
           </View>
         </Modal>
       )}

      {/* Chat Assistant Modal - Replaces Task Input Modal */}
      <Modal
        visible={showTaskInput}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTaskInput(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: '#ffffff' }]}>
          <KeyboardAvoidingView 
            style={styles.modalKeyboardContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
          >
            <GlassMorphism 
              style={[styles.modalContentWrapper, { backgroundColor: '#ffffff' }]} 
              intensity={actualTheme === 'dark' ? 'extra-strong' : 'strong'} 
              borderRadius={0}
            >
              {/* Header with close button */}
              <View style={[styles.modalHeader, { backgroundColor: 'transparent', borderBottomColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
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
            </GlassMorphism>
          </KeyboardAvoidingView>
        </View>
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
  header: {
    padding: 20,
    margin: 20,
    marginBottom: 10,
    borderRadius: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
  },
  calendarContainer: {
    margin: 20,
    marginBottom: 10,
    padding: 16,
  },
  monthNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  navigationHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: 16,
  },
  viewToggle: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 12,
  },
  viewModeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 50,
    alignItems: 'center',
  },
  viewToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  monthTitleContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '600',
  },
  monthArrows: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  arrowButton: {
    padding: 8,
    borderRadius: 20,
  },
  todayButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginHorizontal: 8,
  },
  todayButtonText: {
    fontSize: 12,
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
  },
  modalKeyboardContainer: {
    flex: 1,
  },
  modalContentWrapper: {
    backgroundColor: 'transparent',
    flex: 1,
    height: '100%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  chatContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
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
});