import { StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert, Modal, View, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { internalDB, InternalTask } from '@/lib/internal-db';
import { useRouter } from 'expo-router';

export default function CalendarScreen() {
  const { actualTheme, colors } = useTheme();
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [taskInputText, setTaskInputText] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showProcessingIndicator, setShowProcessingIndicator] = useState(false);
  const [tasks, setTasks] = useState<InternalTask[]>([]);
  const [viewMode, setViewMode] = useState<'month' | 'week' | '3day'>('month');
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    return weekStart;
  });
  
  const [current3DayStart, setCurrent3DayStart] = useState(() => {
    const today = new Date();
    // Start 3-day view from today
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  });
  
  const threeDayScrollRef = useRef<ScrollView>(null);

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
    return () => clearInterval(interval);
  }, []);

  // Scroll to today when 3-day view is active
  useEffect(() => {
    if (viewMode === '3day' && threeDayScrollRef.current) {
      // Scroll to today (index 3 out of 9 days, where today starts at position 0)
      const screenWidth = Dimensions.get('window').width;
      const dayWidth = screenWidth / 3;
      const todayIndex = 3; // Today is at index 3 in our days array
      setTimeout(() => {
        threeDayScrollRef.current?.scrollTo({
          x: todayIndex * dayWidth,
          animated: false
        });
      }, 100);
    }
  }, [viewMode]);

  const loadTasks = async () => {
    try {
      const allTasks = await internalDB.getAllTasks();
      // // console.log('📅 Calendar: Loaded tasks:', allTasks.length);
      // // console.log('📅 Calendar: Task details:', allTasks.map(t => ({
      //   id: t.id,
      //   name: t.name,
      //   start: new Date(t.start_time).toLocaleString(),
      //   status: t.status
      // })));
      setTasks(allTasks);
    } catch (error) {
      console.error('Error loading tasks for calendar:', error);
    }
  };

  // Helper function to determine task category from task name
  const getTaskCategory = (taskName: string): string => {
    const name = taskName.toLowerCase()
    
    // Work/Professional
    if (name.includes('meeting') || name.includes('call') || name.includes('conference') || 
        name.includes('presentation') || name.includes('project') || name.includes('work') ||
        name.includes('email') || name.includes('report') || name.includes('team')) {
      return 'work'
    }
    
    // Exercise/Fitness
    if (name.includes('gym') || name.includes('workout') || name.includes('run') || 
        name.includes('exercise') || name.includes('yoga') || name.includes('swim') ||
        name.includes('walk') || name.includes('fitness') || name.includes('training')) {
      return 'exercise'
    }
    
    // Personal/Errands
    if (name.includes('grocery') || name.includes('shopping') || name.includes('errand') ||
        name.includes('bank') || name.includes('appointment') || name.includes('dentist') ||
        name.includes('doctor') || name.includes('laundry') || name.includes('cleaning')) {
      return 'errands'
    }
    
    // Social/Personal
    if (name.includes('lunch') || name.includes('dinner') || name.includes('breakfast') ||
        name.includes('coffee') || name.includes('friend') || name.includes('family') ||
        name.includes('date') || name.includes('party') || name.includes('birthday')) {
      return 'social'
    }
    
    // Health/Self-care
    if (name.includes('shower') || name.includes('meditation') || name.includes('sleep') ||
        name.includes('rest') || name.includes('relax') || name.includes('break')) {
      return 'selfcare'
    }
    
    // Travel
    if (name.includes('flight') || name.includes('trip') || name.includes('travel') ||
        name.includes('airport') || name.includes('pack') || name.includes('hotel')) {
      return 'travel'
    }
    
    // Default
    return 'other'
  }
  
  // Helper function to get category color
  const getCategoryColor = (category: string): string => {
    const categoryColors = {
      work: '#3B82F6',      // Blue
      exercise: '#10B981',  // Green
      errands: '#F59E0B',   // Amber
      social: '#EC4899',    // Pink
      selfcare: '#8B5CF6', // Purple
      travel: '#EF4444',    // Red
      other: '#6B7280'      // Gray
    }
    
    return categoryColors[category] || categoryColors.other
  }

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
      
      // Debug logging for today's tasks - DISABLED
      // if (isToday && tasks.length > 0) {
      //   // console.log('📅 Calendar: Task date check:', {
      //     taskName: task.name,
      //     taskDate: taskDateStr,
      //     targetDate: dateStr,
      //     matches
      //   });
      // }
      
      return matches;
    });
    
    // if (isToday && filteredTasks.length === 0 && tasks.length > 0) {
    //   // console.log('📅 Calendar: No tasks found for today, but tasks exist:', tasks.length);
    // }
    
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

  const getWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeekStart);
      day.setDate(currentWeekStart.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const getDaysForSliding = () => {
    const days = [];
    // Generate a continuous strip of days for smooth scrolling
    // Create 9 days total (3 before today, today, 5 after) for good scrolling range
    for (let i = -3; i <= 5; i++) {
      const day = new Date(current3DayStart);
      day.setDate(current3DayStart.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const toggleViewMode = () => {
    if (viewMode === 'month') {
      setViewMode('week');
    } else if (viewMode === 'week') {
      setViewMode('3day');
    } else {
      setViewMode('month');
    }
  };

  const handleQuickAddTask = () => {
    setTaskInputText('');
    setShowTaskInput(true);
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
      Alert.alert('Error', 'Please log in to save prompts');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // HARDCODED FUNCTIONALITY - Handle specific prompts locally
      const promptText = taskInputText.trim().toLowerCase()
      // console.log('🎯 Calendar: Processing prompt:', promptText)
      
      if (promptText.includes('delete tasks for saturday')) {
        // console.log('🎯 Calendar: Hardcoded response - Deleting all Saturday tasks...')
        
        // Get all tasks and filter for ANY Saturday
        const allTasks = await internalDB.getAllTasks()
        // console.log(`🎯 Calendar: Total tasks in database: ${allTasks.length}`)
        
        // Debug: Show all tasks with their dates
        allTasks.forEach(task => {
          const taskDate = new Date(task.start_time)
          // console.log(`🎯 Calendar: Task: ${task.name} - Date: ${taskDate.toDateString()} - Day: ${taskDate.getDay()}`)
        })
        
        const saturdayTasks = allTasks.filter(task => {
          const taskStart = new Date(task.start_time)
          // Check if the task is on a Saturday (day 6)
          return taskStart.getDay() === 6
        })
        
        // console.log(`🎯 Calendar: Found ${saturdayTasks.length} Saturday tasks to delete across all weeks`)
        
        if (saturdayTasks.length === 0) {
          Alert.alert(
            'No Saturday Tasks',
            'No tasks found scheduled on any Saturday. Use the Dev tab to create some Saturday tasks first.',
            [{ text: 'OK' }]
          )
          setTaskInputText('')
          setShowTaskInput(false)
          setIsProcessing(false)
          return
        }
        
        // Delete each Saturday task
        let deletedCount = 0
        for (const task of saturdayTasks) {
          // console.log(`🎯 Calendar: Deleting task: ${task.name}`)
          const success = await internalDB.deleteTask(task.id)
          if (success) {
            deletedCount++
          }
        }
        
        // Reload tasks to update UI
        loadTasks()
        
        // Show success message
        Alert.alert(
          'Tasks Deleted',
          `Successfully deleted ${deletedCount} Saturday task${deletedCount !== 1 ? 's' : ''} across all weeks.`,
          [{ text: 'OK' }]
        )
        
        // Clear input and hide modal
        setTaskInputText('')
        setShowTaskInput(false)
        setIsProcessing(false)
        return
      }
      
      // Handle phone call with Shanghai scheduling
      if (promptText.includes('phone call') && promptText.includes('shanghai')) {
        // console.log('🎯 Calendar: Hardcoded response - Scheduling phone call with Shanghai at 4pm...')
        
        // Extract the day from the prompt (default to tomorrow if not specified)
        let targetDate = new Date()
        
        if (promptText.includes('monday')) {
          const daysUntilMonday = (1 - targetDate.getDay() + 7) % 7 || 7
          targetDate.setDate(targetDate.getDate() + daysUntilMonday)
        } else if (promptText.includes('tuesday')) {
          const daysUntilTuesday = (2 - targetDate.getDay() + 7) % 7 || 7
          targetDate.setDate(targetDate.getDate() + daysUntilTuesday)
        } else if (promptText.includes('wednesday')) {
          const daysUntilWednesday = (3 - targetDate.getDay() + 7) % 7 || 7
          targetDate.setDate(targetDate.getDate() + daysUntilWednesday)
        } else if (promptText.includes('thursday')) {
          const daysUntilThursday = (4 - targetDate.getDay() + 7) % 7 || 7
          targetDate.setDate(targetDate.getDate() + daysUntilThursday)
        } else if (promptText.includes('friday')) {
          const daysUntilFriday = (5 - targetDate.getDay() + 7) % 7 || 7
          targetDate.setDate(targetDate.getDate() + daysUntilFriday)
        } else if (promptText.includes('saturday')) {
          const daysUntilSaturday = (6 - targetDate.getDay() + 7) % 7 || 7
          targetDate.setDate(targetDate.getDate() + daysUntilSaturday)
        } else if (promptText.includes('sunday')) {
          const daysUntilSunday = (0 - targetDate.getDay() + 7) % 7 || 7
          targetDate.setDate(targetDate.getDate() + daysUntilSunday)
        } else if (promptText.includes('tomorrow')) {
          targetDate.setDate(targetDate.getDate() + 1)
        } else if (promptText.includes('today')) {
          // Keep current date
        } else {
          // Default to tomorrow if no day specified
          targetDate.setDate(targetDate.getDate() + 1)
        }
        
        // Set time to 4pm
        targetDate.setHours(16, 0, 0, 0)
        
        // Create end time (1 hour duration)
        const endTime = new Date(targetDate)
        endTime.setHours(17, 0, 0, 0)
        
        // Extract who the call is with (default to "parents" if not clear)
        let callWith = 'parents'
        if (promptText.includes('parents')) {
          callWith = 'parents'
        } else if (promptText.includes('mom') || promptText.includes('mother')) {
          callWith = 'mom'
        } else if (promptText.includes('dad') || promptText.includes('father')) {
          callWith = 'dad'
        } else if (promptText.includes('family')) {
          callWith = 'family'
        }
        
        const taskName = `Phone call with ${callWith} in Shanghai`
        
        // console.log(`🎯 Calendar: Creating task: ${taskName} on ${targetDate.toDateString()} at 4pm`)
        
        try {
          await internalDB.addTaskWithDuration(
            taskName,
            targetDate.toISOString(),
            endTime.toISOString()
          )
          
          loadTasks()
          
          Alert.alert(
            'Call Scheduled!',
            `Scheduled "${taskName}" for ${targetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at 4:00 PM (1 hour duration)`,
            [{ text: 'OK' }]
          )
          
          setTaskInputText('')
          setShowTaskInput(false)
          setIsProcessing(false)
          return
        } catch (error) {
          console.error('❌ Calendar: Error creating phone call task:', error)
          Alert.alert('Error', 'Failed to schedule phone call')
          setIsProcessing(false)
          return
        }
      }
      
      // DISABLE ALL OTHER SUPABASE FUNCTIONALITY - MOCK MODE ONLY
      Alert.alert(
        'AI Schedule Request Received', 
        'Your schedule request has been received. In the full version, AI will process this and create an optimized timeline for you.',
        [{ text: 'OK' }]
      )
      setTaskInputText('')
      setShowTaskInput(false)
      setIsProcessing(false)
      return
      
      // ORIGINAL SUPABASE CODE - DISABLED
      /* 
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

      // console.log('🔍 Saving prompt for calendar date:', dateStr);
      const promptData = {
        user_id: session.user.id,
        prompt_text: finalPrompt
      };
      
      // console.log('🔍 About to insert into public.user_prompt table...')
      // console.log('🔍 Prompt data:', promptData)
      
      const { data, error } = await supabase
        .from('user_prompt')
        .insert(promptData)
        .select(); // Add select to return inserted data
        
      // console.log('🔍 Insert response - data:', data, 'error:', error)

      if (error) {
        console.error('❌ Error saving prompt:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        Alert.alert(
          'Database Error',
          `Failed to save prompt to public.user_prompt:\n\nError: ${error.message}\nCode: ${error.code}`,
          [{ text: 'OK' }]
        );
        return;
      }

      // console.log('✅ Prompt saved successfully to public.user_prompt!');
      // console.log('✅ Inserted data:', data);
      
      Alert.alert(
        'Success',
        'Your prompt has been saved successfully!',
        [{ text: 'OK' }]
      );
      
      // Reset modal state
      setTaskInputText('');
      setShowTaskInput(false);
      
      // Show processing indicator for 2 seconds
      setShowProcessingIndicator(true);
      setTimeout(() => {
        setShowProcessingIndicator(false);
      }, 2000);

      // Reload tasks to reflect any new ones created by the AI processor
      setTimeout(() => {
        loadTasks();
      }, 3000);
      */
      
    } catch (error: any) {
      console.error('❌ Error saving prompt:', error);
      Alert.alert(
        'Error',
        `Failed to save your prompt: ${error.message}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsProcessing(false);
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
                onPress={() => setSelectedDate(new Date(day))}
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
    const days = getDaysForSliding();
    const screenWidth = Dimensions.get('window').width;
    const dayWidth = screenWidth / 3;
    
    const handleScrollEnd = (event: any) => {
      const scrollX = event.nativeEvent.contentOffset.x;
      const currentDayIndex = Math.round(scrollX / dayWidth);
      
      // Snap to the nearest day boundary
      threeDayScrollRef.current?.scrollTo({
        x: currentDayIndex * dayWidth,
        animated: true
      });
    };

    return (
      <ScrollView 
        ref={threeDayScrollRef}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={styles.threeDayScrollView}
        contentContainerStyle={styles.threeDayScrollContent}
        onMomentumScrollEnd={handleScrollEnd}
        snapToInterval={dayWidth}
        decelerationRate="fast"
      >
        {days.map((day, dayIndex) => {
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
          const isActualToday = 
            day.getDate() === new Date().getDate() && 
            day.getMonth() === new Date().getMonth() && 
            day.getFullYear() === new Date().getFullYear();
          const dayLabel = isActualToday ? 'Today' : '';

          return (
            <View
              key={dayIndex}
              style={[styles.slidingDayCard, { width: dayWidth }]}
            >
              <View 
                style={[
                  styles.threeDayCardContent,
                  {
                    backgroundColor: isToday 
                      ? actualTheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(74,144,226,0.1)'
                      : actualTheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.08)',
                    borderColor: isToday ? colors.tint + '80' : 'transparent',
                    borderWidth: isToday ? 2 : 1,
                  }
                ]}
              >
                
                {/* Date */}
                <Text style={[
                  styles.threeDayDate,
                  { 
                    color: colors.text,
                    fontWeight: isToday ? '700' : '500' 
                  }
                ]}>
                  {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
                
                {/* Time Grid */}
                <View style={styles.timeGrid}>
                  {/* Hour markers */}
                  <View style={styles.hourMarkers}>
                    {Array.from({ length: 24 }, (_, hour) => (
                      <View key={hour} style={styles.hourMarker}>
                        <Text style={[
                          styles.hourText,
                          { color: colors.textSecondary }
                        ]}>
                          {hour.toString().padStart(2, '0')}
                        </Text>
                      </View>
                    ))}
                  </View>
                  
                  {/* Task blocks */}
                  <View style={styles.taskBlocks}>
                    {dayTasks.map((task, taskIndex) => {
                      const startTime = new Date(task.start_time);
                      const endTime = new Date(task.end_time);
                      const startHour = startTime.getHours() + startTime.getMinutes() / 60;
                      const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60); // Duration in hours
                      const hourHeight = 30; // Height per hour in pixels
                      
                      return (
                        <View 
                          key={task.id}
                          style={[
                            styles.taskBlock,
                            {
                              top: startHour * hourHeight,
                              height: Math.max(duration * hourHeight, 20), // Minimum height of 20px
                              backgroundColor: getPriorityColor(task, colors.tint),
                              opacity: task.status === 'completed' ? 0.6 : 0.9,
                            }
                          ]}
                        >
                          <Text 
                            style={[
                              styles.taskBlockText,
                              { 
                                color: '#fff',
                                textDecorationLine: task.status === 'completed' ? 'line-through' : 'none',
                              }
                            ]}
                            numberOfLines={duration > 1 ? 4 : 2}
                          >
                            {task.name}
                          </Text>
                        </View>
                      );
                    })}
                    
                    {dayTasks.length === 0 && (
                      <View style={styles.noTasksGrid}>
                        <Text style={[
                          styles.threeDayNoTasks, 
                          { color: colors.textSecondary }
                        ]}>
                          No tasks scheduled
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <ThemedGradient style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Navigation Header */}
        <View style={styles.navigationHeader}>
          <TouchableOpacity 
            style={styles.navButton}
            onPress={() => router.replace('/schedule')}
          >
            <ThemedIcon 
              name="list" 
              size={24} 
              color={colors.text}
              glassIntensity="light"
            />
          </TouchableOpacity>
          
          <Text style={[styles.screenTitle, { color: colors.text }]}>Calendar</Text>
          
          <TouchableOpacity 
            style={styles.navButton}
            onPress={() => router.push('/settings')}
          >
            <ThemedIcon 
              name="cog" 
              size={24} 
              color={colors.text}
              glassIntensity="light"
            />
          </TouchableOpacity>
        </View>
        
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
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <GlassMorphism intensity={actualTheme === 'dark' ? 'strong' : 'strong'} style={styles.calendarContainer} borderRadius={20}>
        <GlassMorphism intensity={actualTheme === 'dark' ? 'light' : 'medium'} style={styles.monthNavigation} borderRadius={12}>
          <View style={styles.monthNavigationHeader}>
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
                  : `${currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                }
              </Text>
            </GlassMorphism>
            <TouchableOpacity 
              onPress={toggleViewMode}
              style={[styles.viewToggle, { backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}
            >
              <Text style={[styles.viewToggleText, { color: colors.text }]}>
                {viewMode === 'month' ? 'Week' : viewMode === 'week' ? '3 Day' : 'Month'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.monthArrows}>
            <TouchableOpacity 
              onPress={() => viewMode === 'month' ? navigateMonth('prev') : navigateWeek('prev')} 
              style={styles.arrowButton}
            >
              <Ionicons 
                name="chevron-back" 
                size={24} 
                color={colors.text}
              />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => viewMode === 'month' ? navigateMonth('next') : navigateWeek('next')} 
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
        ) : null}
      </GlassMorphism>
      
      {viewMode === '3day' && render3DayView()}

      {viewMode !== '3day' && (
        <GlassMorphism intensity={actualTheme === 'dark' ? 'extra-strong' : 'strong'} style={styles.tasksSection} borderRadius={20}>
          <GlassMorphism 
            intensity={actualTheme === 'dark' ? 'medium' : 'extra-strong'} 
            style={styles.tasksTitleContainer} 
            borderRadius={12}
          >
            <Text style={[styles.tasksTitle, { color: colors.text }]}>Tasks for {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
          </GlassMorphism>
          
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
                      borderLeftColor: getCategoryColor(getTaskCategory(task.name)),
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
        </GlassMorphism>
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
          style={[styles.modalContainer, { backgroundColor: actualTheme === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.6)' }]}
          activeOpacity={1}
          onPress={() => setShowTaskInput(false)}
        >
          <KeyboardAvoidingView 
            style={styles.modalKeyboardContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <GlassMorphism style={[styles.modalContentWrapper, { backgroundColor: actualTheme === 'dark' ? 'rgba(30,30,40,0.95)' : 'rgba(255,255,255,0.85)' }]} intensity={actualTheme === 'dark' ? 'extra-strong' : 'strong'} borderRadius={20}>
                <View style={[styles.modalHeader, { backgroundColor: 'transparent', borderBottomColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
                  <TouchableOpacity 
                    onPress={() => setShowTaskInput(false)}
                    style={styles.cancelButton}
                  >
                    <Text style={[styles.cancelButtonText, { color: actualTheme === 'dark' ? '#fff' : '#666' }]}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={[styles.modalTitle, { color: actualTheme === 'dark' ? '#fff' : '#333' }]}>Update Schedule</Text>
                  <TouchableOpacity 
                    onPress={handleCreateTaskFromInput}
                    style={[styles.createButton, (!taskInputText.trim() || isProcessing) && styles.disabledButton]}
                    disabled={!taskInputText.trim() || isProcessing}
                  >
                    <Text style={[styles.createButtonText, (!taskInputText.trim() || isProcessing) && styles.disabledButtonText]}>
                      {isProcessing ? 'Processing...' : 'Send to AI'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.modalContent, { backgroundColor: 'transparent' }]}>
                  <Text style={[styles.inputLabel, { color: actualTheme === 'dark' ? '#fff' : '#333' }]}>Describe your schedule needs:</Text>
                  
                  <GlassMorphism style={[styles.inputContainer, { backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'transparent' }]} intensity={actualTheme === 'dark' ? 'strong' : 'light'} borderRadius={12}>
                    <TextInput
                      style={[styles.textInput, { color: actualTheme === 'dark' ? '#fff' : '#333' }]}
                      value={taskInputText}
                      onChangeText={setTaskInputText}
                      placeholder="I need 2 hours for project review, 30 minutes for calls, and time to plan tomorrow's presentation..."
                      placeholderTextColor={actualTheme === 'dark' ? '#888' : '#999'}
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
                        color={isListening ? "#fff" : actualTheme === 'dark' ? '#999' : '#666'} 
                      />
                    </TouchableOpacity>
                  </GlassMorphism>

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
                    <Text style={[styles.examplesTitle, { color: actualTheme === 'dark' ? '#aaa' : '#666' }]}>Example phrases:</Text>
                    <TouchableOpacity 
                      onPress={() => setTaskInputText('Doctor appointment at 10am')}
                    >
                      <GlassMorphism style={[styles.exampleChip, { backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'transparent' }]} intensity={actualTheme === 'dark' ? 'medium' : 'light'} borderRadius={20}>
                        <Text style={[styles.exampleText, { color: actualTheme === 'dark' ? '#ccc' : '#666' }]}>"Doctor appointment at 10am"</Text>
                      </GlassMorphism>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => setTaskInputText('Team lunch from 12pm to 1pm')}
                    >
                      <GlassMorphism style={[styles.exampleChip, { backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'transparent' }]} intensity={actualTheme === 'dark' ? 'medium' : 'light'} borderRadius={20}>
                        <Text style={[styles.exampleText, { color: actualTheme === 'dark' ? '#ccc' : '#666' }]}>"Team lunch from 12pm to 1pm"</Text>
                      </GlassMorphism>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => setTaskInputText('Study for exam for 2 hours in the evening')}
                    >
                      <GlassMorphism style={[styles.exampleChip, { backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'transparent' }]} intensity={actualTheme === 'dark' ? 'medium' : 'light'} borderRadius={20}>
                        <Text style={[styles.exampleText, { color: actualTheme === 'dark' ? '#ccc' : '#666' }]}>"Study for exam for 2 hours in the evening"</Text>
                      </GlassMorphism>
                    </TouchableOpacity>
                  </View>
                </View>
              </GlassMorphism>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
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
      </SafeAreaView>
    </ThemedGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  navigationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  navButton: {
    padding: 8,
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '600',
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
  scrollContent: {
    paddingBottom: 100,
  },
  calendarContainer: {
    marginHorizontal: 20,
    marginTop: 0,
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
  monthNavigationHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: 16,
  },
  viewToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 12,
  },
  viewToggleText: {
    fontSize: 14,
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
  threeDayScrollView: {
    flex: 1,
    marginTop: 8,
  },
  threeDayScrollContent: {
    flexGrow: 1,
  },
  threeDayContainer: {
    width: Dimensions.get('window').width,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  threeDayCell: {
    flex: 1,
    marginHorizontal: 4,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    minHeight: 400,
  },
  threeDayContent: {
    flex: 1,
  },
  threeDayDayLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  threeDayNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  threeDayMonthLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 12,
    textAlign: 'center',
    opacity: 0.7,
  },
  threeDayTasks: {
    marginTop: 12,
    gap: 6,
  },
  threeDayTaskItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  threeDayTaskText: {
    fontSize: 12,
    fontWeight: '500',
  },
  threeDayMoreTasks: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  // Single Day View Styles
  singleDayContainer: {
    width: Dimensions.get('window').width,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  singleDayCard: {
    flex: 1,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    minHeight: 400,
  },
  singleDayLabel: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  singleDayDate: {
    fontSize: 16,
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.8,
  },
  singleDayTasks: {
    flex: 1,
    gap: 12,
  },
  singleDayTaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  singleDayTaskDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  singleDayTaskText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  singleDayTaskTime: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.8,
  },
  singleDayMoreTasks: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
    opacity: 0.7,
  },
  singleDayNoTasks: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 40,
    fontStyle: 'italic',
    opacity: 0.6,
  },
  // Sliding day card style
  slidingDayCard: {
    minHeight: 350,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  // Time grid styles
  timeGrid: {
    flex: 1,
    flexDirection: 'row',
    marginTop: 16,
  },
  hourMarkers: {
    width: 24,
    paddingRight: 4,
  },
  hourMarker: {
    height: 30,
    justifyContent: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  hourText: {
    fontSize: 8,
    fontWeight: '500',
    textAlign: 'right',
  },
  taskBlocks: {
    flex: 1,
    position: 'relative',
    marginLeft: 4,
    height: 24 * 30, // 24 hours * 30px per hour
  },
  taskBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 4,
    padding: 4,
    marginRight: 2,
    borderLeftWidth: 3,
    borderLeftColor: '#fff',
  },
  taskBlockText: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  taskBlockTime: {
    fontSize: 8,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 10,
  },
  noTasksGrid: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});