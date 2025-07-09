import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    // Handle the OAuth callback
    const handleCallback = async () => {
      try {
        console.log('Auth callback params:', params);
        
        // Get the URL from either linking or params
        const url = await Linking.getInitialURL();
        console.log('Auth callback URL:', url);
        
        // On mobile, also check for deep link URL parameters
        let authParams = { ...params };
        
        if (Platform.OS !== 'web' && url && url.includes('skedaiapp://auth-callback')) {
          try {
            const parsedUrl = new URL(url);
            
            // Extract parameters from the URL
            const urlParams = new URLSearchParams(parsedUrl.search);
            
            // Also check hash parameters
            if (parsedUrl.hash) {
              const hashParams = new URLSearchParams(parsedUrl.hash.substring(1));
              hashParams.forEach((value, key) => {
                authParams[key] = value;
              });
            }
            
            // Add query parameters
            urlParams.forEach((value, key) => {
              authParams[key] = value;
            });
            
            console.log('Parsed auth params from URL:', authParams);
          } catch (urlError) {
            console.warn('Failed to parse URL:', urlError);
          }
        }
        
        // Check if we have auth parameters
        const code = authParams.code as string;
        const access_token = authParams.access_token as string;
        const refresh_token = authParams.refresh_token as string;
        const error = authParams.error as string;
        
        if (error) {
          console.error('OAuth error:', error, authParams.error_description);
          router.replace('/auth');
          return;
        }
        
        // Handle different auth flows
        if (access_token) {
          // Direct token - set session
          console.log('Setting session with access token');
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token: refresh_token || '',
          });
          
          if (sessionError) {
            console.error('Session error:', sessionError);
            router.replace('/auth');
            return;
          }
          
          console.log('Session set from callback:', data);
        } else if (code) {
          // Authorization code - exchange for session
          console.log('Exchanging code for session');
          const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
          
          if (sessionError) {
            console.error('Code exchange error:', sessionError);
            router.replace('/auth');
            return;
          }
          
          console.log('Session exchanged from callback:', data);
        } else {
          console.log('No code or access token found in params');
          // Check if we already have a session
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            console.log('Existing session found, redirecting to app');
            router.replace('/(tabs)');
            return;
          }
        }
        
        // Check if we have a session now
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          console.log('Successfully authenticated, redirecting to app');
          router.replace('/(tabs)');
        } else {
          console.log('No session found, redirecting to auth');
          router.replace('/auth');
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        router.replace('/auth');
      }
    };

    handleCallback();
  }, [params]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 20 }}>Completing sign in...</Text>
    </View>
  );
}