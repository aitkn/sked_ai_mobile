import { StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { internalDB, InternalTask } from '@/lib/internal-db';
import { GlassMorphism } from '@/components/GlassMorphism';
import { ThemedGradient } from '@/components/ThemedGradient';

export default function ScheduledTasksScreen() {
  const { actualTheme, colors } = useTheme();
  const [tasks, setTasks] = useState<InternalTask[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadWeekTasks();
    // Refresh tasks every second to catch updates
    const interval = setInterval(loadWeekTasks, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadWeekTasks = async () => {
    try {
      const allTasks = await internalDB.getAllTasks();
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      
      // Calculate end date (today + 7 days)
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 7);
      endDate.setHours(23, 59, 59, 999); // End of the 7th day

      // Filter tasks for this week (today through today + 7 days)
      const weekTasks = allTasks.filter(task => {
        const taskDate = new Date(task.start_time);
        return taskDate >= today && taskDate <= endDate;
      });

      // Sort tasks by start time
      weekTasks.sort((a, b) => {
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      });

      console.log('📋 Scheduled Tasks: Loaded tasks for this week:', weekTasks.length);
      setTasks(weekTasks);
    } catch (error) {
      console.error('Error loading tasks for scheduled tasks:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWeekTasks();
    setRefreshing(false);
  };

  // Helper to format date range
  const getWeekRange = () => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);
    
    const startStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    return `${startStr} - ${endStr}`;
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

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'completed': return '✓';
      case 'in_progress': return '⟳';
      default: return '○';
    }
  };

  return (
    <ThemedGradient style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <GlassMorphism intensity={actualTheme === 'dark' ? 'strong' : 'strong'} style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>This Week's Schedule</Text>
          <Text style={[styles.subtitle, { color: colors.text }]}>
            {getWeekRange()}
          </Text>
        </GlassMorphism>

        <GlassMorphism
          intensity={actualTheme === 'dark' ? 'extra-strong' : 'strong'}
          style={styles.tasksSection}
          borderRadius={20}
        >
          <GlassMorphism
            intensity={actualTheme === 'dark' ? 'medium' : 'extra-strong'}
            style={styles.tasksTitleContainer}
            borderRadius={12}
          >
            <View style={styles.tasksTitleRow}>
              <Text style={[styles.tasksTitle, { color: colors.text }]}>This Week's Tasks</Text>
              <Text style={[styles.taskCount, { color: colors.textSecondary }]}>
                {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
              </Text>
            </View>
          </GlassMorphism>

          <View style={styles.tasksList}>
            {tasks.length === 0 ? (
              <View style={[
                styles.noTasksItem,
                { backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.15)' }
              ]}>
                <Text style={[styles.noTasksText, { color: colors.text }]}>No tasks scheduled for this week</Text>
                <Text style={[
                  styles.promptText,
                  { color: actualTheme === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)' }
                ]}>
                  Add tasks from the Calendar tab
                </Text>
              </View>
            ) : (
              tasks.map((task) => (
                <GlassMorphism
                  key={task.id}
                  intensity={actualTheme === 'dark' ? 'medium' : 'light'}
                  style={[
                    styles.taskItem,
                    {
                      backgroundColor: actualTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)',
                      borderLeftColor: task.status === 'completed' ? '#4CAF50' :
                                      task.status === 'in_progress' ? '#FFA726' :
                                      colors.tint,
                    }
                  ]}
                  borderRadius={12}
                >
                  <View style={styles.taskHeader}>
                    <View style={styles.taskTitleContainer}>
                      <Text style={[styles.statusIcon, {
                        color: task.status === 'completed' ? '#4CAF50' :
                              task.status === 'in_progress' ? '#FFA726' :
                              colors.tint
                      }]}>
                        {getStatusIcon(task.status)}
                      </Text>
                      <Text style={[
                        styles.taskName,
                        {
                          color: colors.text,
                          textDecorationLine: task.status === 'completed' ? 'line-through' : 'none',
                          opacity: task.status === 'completed' ? 0.7 : 1,
                        }
                      ]}>
                        {task.name}
                      </Text>
                    </View>
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

                  <View style={styles.taskDetails}>
                    <Text style={[styles.taskTime, { color: colors.textSecondary }]}>
                      {new Date(task.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at{' '}
                      {new Date(task.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                      {new Date(task.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={[styles.taskStatus, {
                      color: task.status === 'completed' ? '#4CAF50' :
                            task.status === 'in_progress' ? '#FFA726' :
                            colors.textSecondary
                    }]}>
                      {task.status.replace('_', ' ')}
                    </Text>
                  </View>

                  {task.description && (
                    <Text style={[styles.taskDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                      {task.description}
                    </Text>
                  )}
                </GlassMorphism>
              ))
            )}
          </View>
        </GlassMorphism>

        {/* Summary Section */}
        {tasks.length > 0 && (
          <GlassMorphism
            intensity={actualTheme === 'dark' ? 'strong' : 'medium'}
            style={styles.summarySection}
            borderRadius={20}
          >
            <Text style={[styles.summaryTitle, { color: colors.text }]}>Summary</Text>
            <View style={styles.summaryGrid}>
              <View style={[styles.summaryCard, { backgroundColor: 'rgba(76, 175, 80, 0.15)' }]}>
                <Text style={styles.summaryNumber}>{tasks.filter(t => t.status === 'completed').length}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Completed</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: 'rgba(255, 167, 38, 0.15)' }]}>
                <Text style={styles.summaryNumber}>{tasks.filter(t => t.status === 'in_progress').length}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>In Progress</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: actualTheme === 'dark' ? 'rgba(177, 156, 217, 0.15)' : 'rgba(74, 144, 226, 0.15)' }]}>
                <Text style={styles.summaryNumber}>{tasks.filter(t => t.status === 'pending').length}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Pending</Text>
              </View>
            </View>
          </GlassMorphism>
        )}
      </ScrollView>
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
  tasksTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tasksTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  taskCount: {
    fontSize: 14,
    fontWeight: '500',
  },
  tasksList: {
    gap: 12,
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
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  taskTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusIcon: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  taskName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  taskDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  taskTime: {
    fontSize: 14,
    fontWeight: '500',
  },
  taskStatus: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  taskDescription: {
    fontSize: 14,
    marginTop: 4,
    opacity: 0.8,
  },
  summarySection: {
    margin: 20,
    marginTop: 10,
    padding: 16,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
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
    color: '#fff',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
});