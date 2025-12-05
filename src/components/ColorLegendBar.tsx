import React, { useMemo } from 'react'
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/contexts/ThemeContext'
import {
  ColorLabelKey,
  COLOR_LABELS,
  getColorForLabel,
  getLabelName,
} from '@/constants/ColorLabels'
import { InternalTask } from '@/lib/internal-db'
import { GlassMorphism } from './GlassMorphism'

interface ColorLegendBarProps {
  tasks: InternalTask[]
  onLabelPress?: (labelKey: ColorLabelKey) => void
  collapsible?: boolean
}

export function ColorLegendBar({
  tasks,
  onLabelPress,
  collapsible = true,
}: ColorLegendBarProps) {
  const { actualTheme, colors } = useTheme()
  const [isExpanded, setIsExpanded] = React.useState(true)

  // Get unique color labels from tasks
  const usedLabels = useMemo(() => {
    const labelSet = new Set<ColorLabelKey>()
    tasks.forEach((task) => {
      if (task.colorLabel && task.colorLabel !== 'none') {
        labelSet.add(task.colorLabel)
      }
    })
    return Array.from(labelSet)
  }, [tasks])

  // If no labels are used, don't show the legend
  if (usedLabels.length === 0) {
    return null
  }

  const handleLabelPress = (labelKey: ColorLabelKey) => {
    if (onLabelPress) {
      onLabelPress(labelKey)
    }
  }

  const renderLegendItem = (labelKey: ColorLabelKey) => {
    const label = COLOR_LABELS[labelKey]
    const taskCount = tasks.filter((t) => t.colorLabel === labelKey).length

    return (
      <TouchableOpacity
        key={labelKey}
        style={[
          styles.legendItem,
          {
            backgroundColor:
              actualTheme === 'dark'
                ? 'rgba(255,255,255,0.1)'
                : 'rgba(255,255,255,0.2)',
          },
        ]}
        onPress={() => handleLabelPress(labelKey)}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.colorDot,
            {
              backgroundColor: label.color,
              borderColor:
                actualTheme === 'dark'
                  ? 'rgba(255,255,255,0.3)'
                  : 'rgba(0,0,0,0.2)',
            },
          ]}
        />
        <Text style={[styles.labelText, { color: colors.text }]}>
          {label.name}
        </Text>
        {taskCount > 0 && (
          <View
            style={[
              styles.countBadge,
              {
                backgroundColor: label.color + '30',
              },
            ]}
          >
            <Text
              style={[
                styles.countText,
                {
                  color: label.color,
                },
              ]}
            >
              {taskCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    )
  }

  return (
    <GlassMorphism
      intensity={actualTheme === 'dark' ? 'medium' : 'light'}
      style={styles.container}
      borderRadius={12}
    >
      {collapsible && (
        <TouchableOpacity
          style={styles.header}
          onPress={() => setIsExpanded(!isExpanded)}
          activeOpacity={0.7}
        >
          <Text style={[styles.headerText, { color: colors.text }]}>
            Color Labels
          </Text>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      )}

      {(!collapsible || isExpanded) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {usedLabels.map(renderLegendItem)}
        </ScrollView>
      )}
    </GlassMorphism>
  )
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.8,
  },
  scrollContent: {
    gap: 8,
    paddingRight: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    gap: 6,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  labelText: {
    fontSize: 12,
    fontWeight: '500',
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  countText: {
    fontSize: 10,
    fontWeight: '600',
  },
})

