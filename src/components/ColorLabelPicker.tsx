import React from 'react'
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/contexts/ThemeContext'
import { ColorLabelKey, COLOR_LABELS, getAllColorLabels } from '@/constants/ColorLabels'
import { GlassMorphism } from './GlassMorphism'

interface ColorLabelPickerProps {
  visible: boolean
  selectedLabel?: ColorLabelKey
  onSelect: (label: ColorLabelKey) => void
  onClose: () => void
}

export function ColorLabelPicker({
  visible,
  selectedLabel,
  onSelect,
  onClose,
}: ColorLabelPickerProps) {
  const { actualTheme, colors } = useTheme()
  const allLabels = getAllColorLabels()

  const handleSelect = (labelKey: ColorLabelKey) => {
    onSelect(labelKey)
    onClose()
  }

  if (!visible) return null

  return (
    <View style={styles.modalContainer}>
      <Pressable style={styles.overlayPressable} onPress={onClose} />
      <View
        style={[
          styles.container,
          {
            backgroundColor:
              actualTheme === 'dark'
                ? 'rgba(30, 30, 40, 0.98)'
                : 'rgba(255, 255, 255, 0.98)',
          },
        ]}
      >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              Select Color Label
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
          >
            {allLabels.map(({ key, label }) => {
              const isSelected = selectedLabel === key
              const isNone = key === 'none'

              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.labelOption,
                    {
                      backgroundColor:
                        actualTheme === 'dark'
                          ? 'rgba(255,255,255,0.1)'
                          : 'rgba(0,0,0,0.05)',
                      borderColor: isSelected
                        ? label.color
                        : actualTheme === 'dark'
                        ? 'rgba(255,255,255,0.2)'
                        : 'rgba(0,0,0,0.1)',
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                  onPress={() => handleSelect(key)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.colorSwatch,
                      {
                        backgroundColor: label.color,
                        borderColor:
                          actualTheme === 'dark'
                            ? 'rgba(255,255,255,0.3)'
                            : 'rgba(0,0,0,0.2)',
                      },
                    ]}
                  />
                  <View style={styles.labelInfo}>
                    <Text style={[styles.labelName, { color: colors.text }]}>
                      {label.name}
                    </Text>
                    {label.description && (
                      <Text
                        style={[
                          styles.labelDescription,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {label.description}
                      </Text>
                    )}
                  </View>
                  {isSelected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={24}
                      color={label.color}
                    />
                  )}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
    </View>
  )
}

const styles = StyleSheet.create({
  modalContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    justifyContent: 'flex-end',
  },
  overlayPressable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '80%',
    minHeight: 400, // Ensure minimum height to show content
    width: '100%',
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    padding: 20,
    gap: 12,
  },
  labelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
  },
  labelInfo: {
    flex: 1,
  },
  labelName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  labelDescription: {
    fontSize: 12,
    opacity: 0.7,
  },
})

