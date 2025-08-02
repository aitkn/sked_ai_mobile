import { StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert, Modal, View, Dimensions } from 'react-native';
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

  // Scroll to middle period when 3-day view is active
  useEffect(() => {
    if (viewMode === '3day' && threeDayScrollRef.current) {
      // Scroll to the middle period (index 2 out of 5 periods, which is period 0)
      const screenWidth = Dimensions.get('window').width;
      const middlePeriodIndex = 2;
      setTimeout(() => {
        threeDayScrollRef.current?.scrollTo({
          x: middlePeriodIndex * screenWidth,
          animated: false
        });
      }, 100);
    }
  }, [viewMode]);

  const loadTasks = async () => {
    try {
      const allTasks = await internalDB.getAllTasks();
      console.log('📅 Calendar: Loaded tasks:', allTasks.length);
      console.log('📅 Calendar: Task details:', allTasks.map(t => ({
        id: t.id,
        name: t.name,
        start: new Date(t.start_time).toLocaleString(),
        status: t.status
      })));
      setTasks(allTasks);
    } catch (error) {
      console.error('Error loading tasks for calendar:', error);
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

  const getWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeekStart);
      day.setDate(currentWeekStart.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const get3Days = () => {
    const days = [];
    for (let i = 0; i < 3; i++) {
      const day = new Date(current3DayStart);
      day.setDate(current3DayStart.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const get3DayPeriods = () => {
    const periods = [];
    // Generate 5 periods (15 days total) for scrolling
    for (let period = -2; period <= 2; period++) {
      const periodDays = [];
      for (let i = 0; i < 3; i++) {
        const day = new Date(current3DayStart);
        day.setDate(current3DayStart.getDate() + (period * 3) + i);
        periodDays.push(day);
      }
      periods.push(periodDays);
    }
    return periods;
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

      console.log('🔍 Saving prompt for calendar date:', dateStr);
      const promptData = {
        user_id: session.user.id,
        prompt_text: finalPrompt
      };
      
      console.log('🔍 About to insert into public.user_prompt table...')
      console.log('🔍 Prompt data:', promptData)
      
      const { data, error } = await supabase
        .from('user_prompt')
        .insert(promptData)
        .select(); // Add select to return inserted data
        
      console.log('🔍 Insert response - data:', data, 'error:', error)

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

      console.log('✅ Prompt saved successfully to public.user_prompt!');
      console.log('✅ Inserted data:', data);
      
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
    const threeDayPeriods = get3DayPeriods();
    
    return (
      <ScrollView 
        ref={threeDayScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.threeDayScrollView}
        contentContainerStyle={styles.threeDayScrollContent}
      >
        {threeDayPeriods.map((threeDays, periodIndex) => (
          <View key={periodIndex} style={styles.threeDayContainer}>
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
            const isActualToday = 
              day.getDate() === new Date().getDate() && 
              day.getMonth() === new Date().getMonth() && 
              day.getFullYear() === new Date().getFullYear();
            const dayLabel = isActualToday ? 'Today' : '';

            return (
              <TouchableOpacity
                key={index}
                style={styles.threeDayCard}
                onPress={() => setSelectedDate(new Date(day))}
              >
                <View 
                  style={[
                    styles.threeDayCardContent,
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
                  {/* Day label - only show if not empty */}
                  {dayLabel !== '' && (
                    <Text style={[
                      styles.threeDayLabel,
                      { 
                        color: isSelected ? '#fff' : colors.text,
                        fontWeight: isToday ? '800' : '600' 
                      }
                    ]}>
                      {dayLabel}
                    </Text>
                  )}
                  
                  {/* Date */}
                  <Text style={[
                    styles.threeDayDate,
                    { 
                      color: isSelected ? '#fff' : colors.text,
                      fontWeight: isToday ? '700' : '500' 
                    }
                  ]}>
                    {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  
                  {/* Task list */}
                  <View style={styles.threeDayTasks}>
                    {dayTasks.slice(0, 4).map((task, taskIndex) => (
                      <View 
                        key={task.id}
                        style={[
                          styles.threeDayTaskItem,
                          {
                            backgroundColor: isSelected 
                              ? 'rgba(255,255,255,0.2)' 
                              : actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                          }
                        ]}
                      >
                        <View 
                          style={[
                            styles.threeDayTaskDot,
                            {
                              backgroundColor: getPriorityColor(task, colors.tint),
                            }
                          ]} 
                        />
                        <Text 
                          style={[
                            styles.threeDayTaskText,
                            { 
                              color: isSelected ? '#fff' : colors.text,
                              textDecorationLine: task.status === 'completed' ? 'line-through' : 'none',
                              opacity: task.status === 'completed' ? 0.7 : 1,
                            }
                          ]}
                          numberOfLines={1}
                        >
                          {task.name}
                        </Text>
                        {task.start_time && (
                          <Text 
                            style={[
                              styles.threeDayTaskTime,
                              { color: isSelected ? 'rgba(255,255,255,0.8)' : colors.textSecondary }
                            ]}
                          >
                            {new Date(task.start_time).toLocaleTimeString('en-US', { 
                              hour: 'numeric', 
                              minute: '2-digit',
                              hour12: true 
                            })}
                          </Text>
                        )}
                      </View>
                    ))}
                    
                    {dayTasks.length > 4 && (
                      <Text style={[
                        styles.threeDayMoreTasks, 
                        { color: isSelected ? 'rgba(255,255,255,0.8)' : colors.textSecondary }
                      ]}>
                        +{dayTasks.length - 4} more tasks
                      </Text>
                    )}
                    
                    {dayTasks.length === 0 && (
                      <Text style={[
                        styles.threeDayNoTasks, 
                        { color: isSelected ? 'rgba(255,255,255,0.7)' : colors.textSecondary }
                      ]}>
                        No tasks scheduled
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
            })}
          </View>
        ))}
      </ScrollView>
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
      
      <View style={styles.calendarContainer}>
        <TouchableOpacity 
          onPress={toggleViewMode}
          style={[styles.cleanViewToggle, { backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}
        >
          <Text style={[styles.viewToggleText, { color: colors.text }]}>
            {viewMode === 'month' ? 'Week' : viewMode === 'week' ? '3 Day' : 'Month'}
          </Text>
        </TouchableOpacity>

        <GlassMorphism intensity={actualTheme === 'dark' ? 'strong' : 'strong'} style={styles.calendarContent} borderRadius={20}>
          {viewMode === 'month' ? (
            <View style={styles.calendarGrid}>
              {renderCalendarDays()}
            </View>
          ) : viewMode === 'week' ? (
            renderWeekView()
          ) : null}
        </GlassMorphism>
      </View>
      
      {viewMode === '3day' && render3DayView()}

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
        </GlassMorphism>
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
                  <Text style={[styles.modalTitle, { color: actualTheme === 'dark' ? '#fff' : '#333' }]}>Add Task for {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                  <TouchableOpacity 
                    onPress={handleCreateTaskFromInput}
                    style={[styles.createButton, (!taskInputText.trim() || isProcessing) && styles.disabledButton]}
                    disabled={!taskInputText.trim() || isProcessing}
                  >
                    <Text style={[styles.createButtonText, (!taskInputText.trim() || isProcessing) && styles.disabledButtonText]}>
                      {isProcessing ? 'Saving...' : 'Save'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.modalContent, { backgroundColor: 'transparent' }]}>
                  <Text style={[styles.inputLabel, { color: actualTheme === 'dark' ? '#fff' : '#333' }]}>Describe your task:</Text>
                  <Text style={[styles.inputHint, { color: actualTheme === 'dark' ? '#aaa' : '#666' }]}>
                    Tell us what you'd like to schedule for {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                  </Text>
                  
                  <GlassMorphism style={[styles.inputContainer, { backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'transparent' }]} intensity={actualTheme === 'dark' ? 'strong' : 'light'} borderRadius={12}>
                    <TextInput
                      style={[styles.textInput, { color: actualTheme === 'dark' ? '#fff' : '#333' }]}
                      value={taskInputText}
                      onChangeText={setTaskInputText}
                      placeholder="What would you like to do?"
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
  },
  calendarContent: {
    padding: 16,
    marginTop: 16,
  },
  monthNavigation: {
    flexDirection: 'row',
    justifyContent: 'center',
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 12,
  },
  singleViewToggle: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
  },
  cleanViewToggle: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    alignSelf: 'center',
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
  // 3-Day View Styles
  threeDayScrollView: {
    flex: 1,
  },
  threeDayScrollContent: {
    // Content will size automatically
  },
  threeDayContainer: {
    flexDirection: 'row',
    width: Dimensions.get('window').width,
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  threeDayCard: {
    flex: 1,
    minHeight: 350,
  },
  threeDayCardContent: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  threeDayLabel: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  threeDayDate: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    opacity: 0.8,
  },
  threeDayTasks: {
    flex: 1,
    gap: 8,
  },
  threeDayTaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    gap: 8,
  },
  threeDayTaskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  threeDayTaskText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  threeDayTaskTime: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.8,
  },
  threeDayMoreTasks: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.7,
  },
  threeDayNoTasks: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20,
    fontStyle: 'italic',
    opacity: 0.6,
  },
});