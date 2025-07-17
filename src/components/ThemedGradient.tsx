import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { ViewProps } from 'react-native';

interface ThemedGradientProps extends ViewProps {
  children?: React.ReactNode;
}

export function ThemedGradient({ children, style, ...props }: ThemedGradientProps) {
  const { actualTheme } = useTheme();

  const gradients = {
    light: {
      colors: ['#FFFFFF', '#F0F0F0', '#E0E8FF', '#D0D8F0'],
      locations: [0, 0.3, 0.7, 1],
    },
    dark: {
      colors: ['#000000', '#1A1A1A', '#2D1B3D', '#3D2D4D'],
      locations: [0, 0.3, 0.7, 1],
    },
  };

  const gradient = gradients[actualTheme];

  return (
    <LinearGradient
      colors={gradient.colors}
      locations={gradient.locations}
      style={[{ flex: 1 }, style]}
      {...props}
    >
      {children}
    </LinearGradient>
  );
}