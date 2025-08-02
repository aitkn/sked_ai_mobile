import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ThemedGradient } from '@/components/ThemedGradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';

export default function NotFoundScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    // Redirect to schedule after a brief moment
    const timer = setTimeout(() => {
      router.replace('/schedule');
    }, 100);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <ThemedGradient style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={[styles.text, { color: colors.text }]}>Redirecting to schedule...</Text>
        </View>
      </SafeAreaView>
    </ThemedGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
  },
});