import React from 'react';
import { View, ViewStyle, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';

interface GlassMorphismProps {
  children?: React.ReactNode;
  style?: ViewStyle;
  intensity?: 'light' | 'medium' | 'strong' | 'extra-strong';
  blurAmount?: number;
  borderRadius?: number;
  borderWidth?: number;
}

export const GlassMorphism: React.FC<GlassMorphismProps> = ({
  children,
  style,
  intensity = 'medium',
  blurAmount = 20,
  borderRadius = 16,
  borderWidth = 1,
}) => {
  const { actualTheme } = useTheme();

  const intensityConfig = {
    'light': {
      light: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderColor: 'rgba(255, 255, 255, 0.3)',
        gradientColors: ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.04)'],
      },
      dark: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.15)',
        gradientColors: ['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)'],
      },
    },
    'medium': {
      light: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderColor: 'rgba(255, 255, 255, 0.4)',
        gradientColors: ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.08)'],
      },
      dark: {
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        borderColor: 'rgba(255, 255, 255, 0.25)',
        gradientColors: ['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.08)'],
      },
    },
    'strong': {
      light: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderColor: 'rgba(255, 255, 255, 0.5)',
        gradientColors: ['rgba(255, 255, 255, 0.18)', 'rgba(255, 255, 255, 0.12)'],
      },
      dark: {
        backgroundColor: 'rgba(255, 255, 255, 0.18)',
        borderColor: 'rgba(255, 255, 255, 0.35)',
        gradientColors: ['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.1)'],
      },
    },
    'extra-strong': {
      light: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderColor: 'rgba(255, 255, 255, 0.6)',
        gradientColors: ['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)'],
      },
      dark: {
        backgroundColor: 'rgba(255, 255, 255, 0.22)',
        borderColor: 'rgba(255, 255, 255, 0.45)',
        gradientColors: ['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)'],
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
          borderWidth,
          borderColor: config.borderColor,
          overflow: 'hidden',
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
            },
            android: {
              elevation: 5,
            },
          }),
        },
        style,
      ]}
    >
      <LinearGradient
        colors={config.gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.backdrop, { backgroundColor: config.backgroundColor }]} />
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
});

export const createGlassStyle = (theme: 'light' | 'dark', intensity: 'light' | 'medium' | 'strong' = 'medium') => {
  const configs = {
    light: {
      light: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderColor: 'rgba(255, 255, 255, 0.3)',
      },
      medium: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderColor: 'rgba(255, 255, 255, 0.4)',
      },
      strong: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderColor: 'rgba(255, 255, 255, 0.5)',
      },
    },
    dark: {
      light: {
        backgroundColor: 'rgba(30, 30, 30, 0.4)',
        borderColor: 'rgba(255, 255, 255, 0.15)',
      },
      medium: {
        backgroundColor: 'rgba(30, 30, 30, 0.6)',
        borderColor: 'rgba(255, 255, 255, 0.2)',
      },
      strong: {
        backgroundColor: 'rgba(30, 30, 30, 0.8)',
        borderColor: 'rgba(255, 255, 255, 0.3)',
      },
    },
  };

  return {
    ...configs[theme][intensity],
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  };
};