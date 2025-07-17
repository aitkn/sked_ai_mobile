import { ViewStyle } from 'react-native';

export interface GlassStyleOptions {
  theme: 'light' | 'dark';
  intensity?: 'light' | 'medium' | 'strong';
  borderRadius?: number;
  blur?: number;
}

export const createGlassStyle = ({
  theme,
  intensity = 'medium',
  borderRadius = 12,
  blur = 10,
}: GlassStyleOptions): ViewStyle => {
  const glassConfigs = {
    light: {
      light: {
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
        borderColor: 'rgba(255, 255, 255, 0.3)',
      },
      medium: {
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        borderColor: 'rgba(255, 255, 255, 0.4)',
      },
      strong: {
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        borderColor: 'rgba(255, 255, 255, 0.5)',
      },
    },
    dark: {
      light: {
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      medium: {
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        borderColor: 'rgba(255, 255, 255, 0.15)',
      },
      strong: {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        borderColor: 'rgba(255, 255, 255, 0.2)',
      },
    },
  };

  const config = glassConfigs[theme][intensity];

  return {
    ...config,
    borderRadius,
    borderWidth: 1,
    backdropFilter: `blur(${blur}px)`,
    shadowColor: theme === 'dark' ? '#000' : '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: theme === 'dark' ? 0.3 : 0.1,
    shadowRadius: 3,
    elevation: 3,
  };
};

export const glassIconContainerStyle = (theme: 'light' | 'dark'): ViewStyle => ({
  padding: 8,
  ...createGlassStyle({ theme, intensity: 'medium', borderRadius: 12 }),
});

export const glassButtonStyle = (theme: 'light' | 'dark'): ViewStyle => ({
  paddingHorizontal: 16,
  paddingVertical: 12,
  ...createGlassStyle({ theme, intensity: 'light', borderRadius: 8 }),
});

export const glassCardStyle = (theme: 'light' | 'dark'): ViewStyle => ({
  padding: 16,
  ...createGlassStyle({ theme, intensity: 'strong', borderRadius: 16 }),
});