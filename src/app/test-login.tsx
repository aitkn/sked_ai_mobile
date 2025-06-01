import React from 'react'
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { Text } from '../components/Themed'
import Colors from '../constants/Colors'
import { useRouter } from 'expo-router'

export default function TestLogin() {
  const router = useRouter()

  async function createTestUser() {
    // This bypasses email verification for testing
    const { data: { user }, error } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'testpass123',
    })

    if (error) {
      // If login fails, the user doesn't exist
      Alert.alert('Test User Not Found', 'Please create the test user in Supabase dashboard first.')
    } else {
      Alert.alert('Success', 'Logged in as test user')
      router.replace('/(tabs)')
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Test Login</Text>
      <Text style={styles.subtitle}>Skip email verification for testing</Text>
      
      <TouchableOpacity style={styles.button} onPress={createTestUser}>
        <Text style={styles.buttonText}>Login as Test User</Text>
      </TouchableOpacity>
      
      <View style={styles.instructions}>
        <Text style={styles.instructionText}>To use this:</Text>
        <Text style={styles.instructionText}>1. Go to Supabase dashboard</Text>
        <Text style={styles.instructionText}>2. Create user: test@example.com</Text>
        <Text style={styles.instructionText}>3. Password: testpass123</Text>
        <Text style={styles.instructionText}>4. Manually confirm the email</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
  button: {
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
    marginBottom: 30,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  instructions: {
    backgroundColor: '#f0f0f0',
    padding: 20,
    borderRadius: 8,
  },
  instructionText: {
    fontSize: 14,
    marginBottom: 5,
    color: '#333',
  },
})