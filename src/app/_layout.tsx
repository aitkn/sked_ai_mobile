import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useRef } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { TaskProvider } from '../contexts/TaskContext';
import { ThemeProvider as CustomThemeProvider, useTheme } from '../contexts/ThemeContext';

// Push notification services
import { initializePushNotifications, unregisterPushNotifications } from '../lib/notifications/push-service';
import { initializeNotificationCategories } from '../lib/notifications/local-scheduler';
import { setupBackgroundNotificationHandlers } from '../lib/notifications/action-handler';
import { initializeLocationTriggers, cleanupLocationTriggers } from '../lib/location/location-triggers';

// ErrorBoundary is exported separately
import { ErrorBoundary } from 'expo-router';
export { ErrorBoundary };

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: 'auth',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <CustomThemeProvider>
      <RootLayoutNav />
    </CustomThemeProvider>
  );
}

function RootLayoutNav() {
  const { actualTheme } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();
  const pushInitialized = useRef(false);

  // Initialize notification categories and background handlers once
  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        // Set up notification categories (action buttons)
        await initializeNotificationCategories();
        
        // Set up background notification handlers
        setupBackgroundNotificationHandlers();
        
        console.log('[App] Notification system initialized');
      } catch (error) {
        console.error('[App] Error initializing notifications:', error);
      }
    };

    initializeNotifications();
  }, []);

  // Initialize push notifications when user logs in
  useEffect(() => {
    const initializePush = async () => {
      if (session && !pushInitialized.current) {
        try {
          // Initialize FCM token registration
          await initializePushNotifications();
          
          // Initialize location-based triggers
          await initializeLocationTriggers();
          
          pushInitialized.current = true;
          console.log('[App] Push notifications initialized for user');
        } catch (error) {
          console.error('[App] Error initializing push:', error);
        }
      } else if (!session && pushInitialized.current) {
        // User logged out - cleanup
        try {
          await unregisterPushNotifications();
          await cleanupLocationTriggers();
          pushInitialized.current = false;
          console.log('[App] Push notifications cleaned up');
        } catch (error) {
          console.error('[App] Error cleaning up push:', error);
        }
      }
    };

    initializePush();
  }, [session]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!session && !inAuthGroup) {
      // Redirect to auth if no session
      router.replace('/auth');
    } else if (session && inAuthGroup) {
      // Redirect away from auth if session exists
      router.replace('/(tabs)');
    }
  }, [session, segments, isLoading]);

  if (isLoading) {
    return null;
  }

  return (
    <ThemeProvider value={actualTheme === 'dark' ? DarkTheme : DefaultTheme}>
      {session ? (
        <TaskProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          </Stack>
        </TaskProvider>
      ) : (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
      )}
    </ThemeProvider>
  );
}
