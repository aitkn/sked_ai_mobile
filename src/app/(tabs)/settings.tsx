import React from 'react';
import { StyleSheet, View, Text, Switch, TouchableOpacity } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import Colors from '@/constants/Colors';
import { ThemedGradient } from '@/components/ThemedGradient';

export default function SettingsScreen() {
  const { theme, actualTheme, setTheme } = useTheme();
  
  const colors = Colors[actualTheme];

  const themeOptions = [
    { label: 'Light', value: 'light' as const },
    { label: 'Dark', value: 'dark' as const },
    { label: 'System', value: 'system' as const },
  ];

  return (
    <ThemedGradient style={styles.container}>
      <View style={[styles.section, styles.card, { backgroundColor: colors.cardBackground }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Theme</Text>
        
        {themeOptions.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.optionRow,
              { borderBottomColor: colors.tabIconDefault }
            ]}
            onPress={() => setTheme(option.value)}
          >
            <Text style={[styles.optionText, { color: colors.text }]}>
              {option.label}
            </Text>
            <View style={[
              styles.radioButton,
              { borderColor: colors.tint }
            ]}>
              {theme === option.value && (
                <View style={[
                  styles.radioButtonInner,
                  { backgroundColor: colors.tint }
                ]} />
              )}
            </View>
          </TouchableOpacity>
        ))}
        
        <Text style={[styles.helperText, { color: colors.tabIconDefault }]}>
          Current theme: {actualTheme}
        </Text>
      </View>
    </ThemedGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginHorizontal: 20,
    marginVertical: 10,
  },
  card: {
    marginTop: 20,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    fontSize: 16,
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  helperText: {
    fontSize: 14,
    marginTop: 10,
  },
});