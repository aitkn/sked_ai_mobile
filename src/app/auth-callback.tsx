import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import * as Linking from 'expo-linking';

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Handle the OAuth callback
    const handleCallback = async () => {
      try {
        // Get the callback URL from deep link
        let url = await Linking.getInitialURL();
        
        // Also listen for URL events in case the app is already open
        const subscription = Linking.addEventListener('url', (event) => {
          url = event.url;
        });

        if (!url) {
          // Wait a bit for the URL to arrive
          await new Promise(resolve => setTimeout(resolve, 1000));
          url = await Linking.getInitialURL();
        }

        if (!url) {
          throw new Error('No callback URL received');
        }

        console.log('Auth callback URL:', url);
        
        // Parse the URL
        const parsedUrl = new URL(url);
        
        // Check for error in URL
        const errorParam = parsedUrl.searchParams.get('error');
        const errorDescription = parsedUrl.searchParams.get('error_description');
        if (errorParam) {
          throw new Error(errorDescription || errorParam || 'Authentication failed');
        }

        // Handle hash-based tokens (implicit flow)
        if (parsedUrl.hash) {
          const hashParams = new URLSearchParams(parsedUrl.hash.substring(1));
          const access_token = hashParams.get('access_token');
          const refresh_token = hashParams.get('refresh_token');
          
          if (access_token) {
            console.log('Setting session from hash tokens');
            const { data, error: sessionError } = await supabase.auth.setSession({
              access_token,
              refresh_token: refresh_token || '',
            });
            
            if (sessionError) {
              console.error('Session error:', sessionError);
              throw sessionError;
            }
            
            if (data.session) {
              console.log('Session set successfully');
              router.replace('/(tabs)');
              return;
            }
          }
        }
        
        // Handle code-based flow (PKCE)
        const code = parsedUrl.searchParams.get('code');
        if (code) {
          console.log('Exchanging code for session');
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          
          if (exchangeError) {
            console.error('Exchange error:', exchangeError);
            throw exchangeError;
          }
          
          if (data.session) {
            console.log('Session exchanged successfully');
            router.replace('/(tabs)');
            return;
          }
        }

        // Fallback: check if session already exists
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Get session error:', sessionError);
          throw sessionError;
        }
        
        if (session) {
          console.log('Session already exists');
          router.replace('/(tabs)');
        } else {
          throw new Error('No session found after callback');
        }
      } catch (error: any) {
        console.error('Auth callback error:', error);
        const errorMessage = error.message || 'Failed to complete authentication';
        setError(errorMessage);
        
        // Show alert and redirect to auth
        Alert.alert(
          'Authentication Error',
          errorMessage,
          [
            {
              text: 'OK',
              onPress: () => router.replace('/auth'),
            },
          ]
        );
      }
    };

    handleCallback();
  }, [router]);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: 'red', textAlign: 'center', marginBottom: 20 }}>
          {error}
        </Text>
        <Text style={{ color: '#666', textAlign: 'center' }}>
          Redirecting to login...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 20 }}>Completing sign in...</Text>
    </View>
  );
}