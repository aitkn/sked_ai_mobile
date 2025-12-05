// Color label definitions for tasks
export type ColorLabelKey = 'work' | 'personal' | 'urgent' | 'meeting' | 'health' | 'shopping' | 'travel' | 'family' | 'none'

export interface ColorLabel {
  name: string
  color: string
  description?: string
}

export const COLOR_LABELS: Record<ColorLabelKey, ColorLabel> = {
  work: {
    name: 'Work',
    color: '#4285F4', // Google Blue
    description: 'Work-related tasks',
  },
  personal: {
    name: 'Personal',
    color: '#34A853', // Google Green
    description: 'Personal tasks',
  },
  urgent: {
    name: 'Urgent',
    color: '#EA4335', // Google Red
    description: 'Urgent tasks',
  },
  meeting: {
    name: 'Meeting',
    color: '#FBBC05', // Google Yellow
    description: 'Meetings and appointments',
  },
  health: {
    name: 'Health',
    color: '#9C27B0', // Purple
    description: 'Health and fitness',
  },
  shopping: {
    name: 'Shopping',
    color: '#FF9800', // Orange
    description: 'Shopping and errands',
  },
  travel: {
    name: 'Travel',
    color: '#00BCD4', // Cyan
    description: 'Travel and transportation',
  },
  family: {
    name: 'Family',
    color: '#E91E63', // Pink
    description: 'Family-related tasks',
  },
  none: {
    name: 'None',
    color: '#9E9E9E', // Gray
    description: 'No label',
  },
}

// Get color for a label key
export const getColorForLabel = (labelKey: ColorLabelKey | string | undefined): string => {
  if (!labelKey || labelKey === 'none') {
    return COLOR_LABELS.none.color
  }
  return COLOR_LABELS[labelKey as ColorLabelKey]?.color || COLOR_LABELS.none.color
}

// Get label name for a key
export const getLabelName = (labelKey: ColorLabelKey | string | undefined): string => {
  if (!labelKey || labelKey === 'none') {
    return COLOR_LABELS.none.name
  }
  return COLOR_LABELS[labelKey as ColorLabelKey]?.name || COLOR_LABELS.none.name
}

// Get all color label keys (excluding 'none')
export const getAvailableColorLabels = (): ColorLabelKey[] => {
  return Object.keys(COLOR_LABELS).filter(key => key !== 'none') as ColorLabelKey[]
}

// Get all color labels as array
export const getAllColorLabels = (): Array<{ key: ColorLabelKey; label: ColorLabel }> => {
  return Object.entries(COLOR_LABELS).map(([key, label]) => ({
    key: key as ColorLabelKey,
    label,
  }))
}

