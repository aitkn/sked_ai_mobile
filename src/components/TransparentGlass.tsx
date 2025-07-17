import React from 'react';
import { View, ViewStyle, StyleSheet, Platform } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

interface TransparentGlassProps {
  children?: React.ReactNode;
  style?: ViewStyle;
  intensity?: 'light' | 'medium' | 'strong';
  borderRadius?: number;
}

export const TransparentGlass: React.FC<TransparentGlassProps> = ({
  children,
  style,
  intensity = 'medium',
  borderRadius = 16,
}) => {
  const { actualTheme } = useTheme();

  const intensityConfig = {
    'light': {
      light: {
        borderColor: 'rgba(255, 255, 255, 0.5)',
        shadowOpacity: 0.05,
      },
      dark: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        shadowOpacity: 0.1,
      },
    },
    'medium': {
      light: {
        borderColor: 'rgba(255, 255, 255, 0.7)',
        shadowOpacity: 0.08,
      },
      dark: {
        borderColor: 'rgba(255, 255, 255, 0.15)',
        shadowOpacity: 0.15,
      },
    },
    'strong': {
      light: {
        borderColor: 'rgba(255, 255, 255, 0.9)',
        shadowOpacity: 0.1,
      },
      dark: {
        borderColor: 'rgba(255, 255, 255, 0.2)',
        shadowOpacity: 0.2,
      },
    },
  };

  const config = intensityConfig[intensity][actualTheme];

  return (
    <View
      style={[
        styles.container,
        {
          borderRadius,
          borderColor: config.borderColor,
          ...Platform.select({
            ios: {
              shadowColor: actualTheme === 'dark' ? '#fff' : '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: config.shadowOpacity,
              shadowRadius: 8,
            },
            android: {
              elevation: 3,
            },
          }),
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: 'transparent',
    borderWidth: 1,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
});