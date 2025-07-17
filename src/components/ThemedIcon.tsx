import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { FontAwesome, Ionicons, MaterialIcons, Feather, AntDesign } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import Colors from '../constants/Colors';

type IconLibrary = 'FontAwesome' | 'Ionicons' | 'MaterialIcons' | 'Feather' | 'AntDesign';

interface ThemedIconProps {
  library?: IconLibrary;
  name: string;
  size?: number;
  color?: string;
  style?: ViewStyle;
  containerStyle?: ViewStyle;
  glassIntensity?: 'light' | 'medium' | 'strong';
  onPress?: () => void;
}

const IconComponents = {
  FontAwesome,
  Ionicons,
  MaterialIcons,
  Feather,
  AntDesign,
};

export default function ThemedIcon({
  library = 'FontAwesome',
  name,
  size = 24,
  color,
  style,
  containerStyle,
  glassIntensity = 'medium',
  onPress,
}: ThemedIconProps) {
  const { theme } = useTheme();
  const actualTheme = theme || 'light';
  
  const IconComponent = IconComponents[library] as any;
  
  const iconColor = color || Colors[actualTheme].tint;
  
  const glassStyles = {
    light: {
      backgroundColor: actualTheme === 'dark' 
        ? 'rgba(255, 255, 255, 0.05)' 
        : 'rgba(0, 0, 0, 0.03)',
      borderColor: actualTheme === 'dark'
        ? 'rgba(255, 255, 255, 0.1)'
        : 'rgba(0, 0, 0, 0.05)',
    },
    medium: {
      backgroundColor: actualTheme === 'dark' 
        ? 'rgba(255, 255, 255, 0.08)' 
        : 'rgba(0, 0, 0, 0.05)',
      borderColor: actualTheme === 'dark'
        ? 'rgba(255, 255, 255, 0.15)'
        : 'rgba(0, 0, 0, 0.08)',
    },
    strong: {
      backgroundColor: actualTheme === 'dark' 
        ? 'rgba(255, 255, 255, 0.12)' 
        : 'rgba(0, 0, 0, 0.08)',
      borderColor: actualTheme === 'dark'
        ? 'rgba(255, 255, 255, 0.2)'
        : 'rgba(0, 0, 0, 0.1)',
    },
  };
  
  const selectedGlassStyle = glassStyles[glassIntensity];
  
  if (onPress) {
    return (
      <View
        style={[
          styles.glassContainer,
          selectedGlassStyle,
          containerStyle,
        ]}
        onTouchEnd={onPress}
      >
        <IconComponent
          name={name}
          size={size}
          color={iconColor}
          style={[{ opacity: 0.9 }, style]}
        />
      </View>
    );
  }
  
  return (
    <View
      style={[
        styles.glassContainer,
        selectedGlassStyle,
        containerStyle,
      ]}
    >
      <IconComponent
        name={name}
        size={size}
        color={iconColor}
        style={[{ opacity: 0.9 }, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  glassContainer: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    backdropFilter: 'blur(10px)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
});