import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import * as Linking from 'expo-linking';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // Handle the OAuth callback
    const handleCallback = async () => {
      const url = await Linking.getInitialURL();
      if (url) {
        console.log('Auth callback URL:', url);
        
        // The session should already be set by Supabase
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          router.replace('/(tabs)');
        } else {
          router.replace('/auth');
        }
      }
    };

    handleCallback();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 20 }}>Completing sign in...</Text>
    </View>
  );
}