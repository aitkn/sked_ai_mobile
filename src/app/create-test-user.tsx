import React, { useState } from 'react'
import {
  Alert,
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { Text } from '../components/Themed'
import Colors from '../constants/Colors'
import { useRouter } from 'expo-router'

export default function CreateTestUser() {
  const [email, setEmail] = useState('testuser@example.com')
  const [password, setPassword] = useState('testpass123')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function createAndSignIn() {
    setLoading(true)
    
    // First try to sign in (in case user exists)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (!signInError) {
      Alert.alert('Success', 'Signed in successfully!', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') }
      ])
    } else {
      // Try to create the user
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { 
            full_name: 'Test User',
            skip_email_confirmation: true 
          }
        }
      })
      
      if (signUpError) {
        Alert.alert('Error', signUpError.message)
      } else if (data?.user) {
        // Try to sign in immediately
        const { error: secondSignInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        
        if (!secondSignInError) {
          Alert.alert('Success', 'Account created and signed in!', [
            { text: 'OK', onPress: () => router.replace('/(tabs)') }
          ])
        } else {
          Alert.alert('Account Created', 'Account created but needs email confirmation. Check your email.')
        }
      }
    }
    
    setLoading(false)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Test User</Text>
      <Text style={styles.subtitle}>
        This will create a test account and sign you in
      </Text>
      
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
      />
      
      <TouchableOpacity
        style={[styles.button, { opacity: loading ? 0.5 : 1 }]}
        onPress={createAndSignIn}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          Create & Sign In
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 30,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#f8f8f8',
  },
  button: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.tint,
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  backText: {
    color: Colors.light.tint,
    fontSize: 14,
  },
})