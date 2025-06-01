import React, { useState } from 'react'
import {
  Alert,
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { Text } from '../components/Themed'
import Colors from '../constants/Colors'
import { useRouter } from 'expo-router'

export default function TestEmail() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const router = useRouter()

  const addLog = (message: string) => {
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }

  async function testSignUp() {
    if (!email) {
      Alert.alert('Error', 'Please enter an email address')
      return
    }
    
    setLoading(true)
    setLog([])
    addLog('Starting sign up test...')
    
    try {
      addLog(`Attempting to sign up: ${email}`)
      
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: 'TestPassword123!',
      })
      
      if (error) {
        addLog(`Error: ${error.message}`)
        addLog(`Error status: ${error.status}`)
        addLog(`Error name: ${error.name}`)
        
        // Check if it's a specific error
        if (error.message.includes('email')) {
          addLog('This appears to be an email-related error')
        }
        if (error.status === 500) {
          addLog('500 error - Server-side issue, likely SMTP configuration')
        }
      } else if (data) {
        addLog('Success! User data received:')
        addLog(`User ID: ${data.user?.id}`)
        addLog(`Email: ${data.user?.email}`)
        addLog(`Confirmed: ${data.user?.email_confirmed_at ? 'Yes' : 'No'}`)
        
        if (data.user?.identities?.length === 0) {
          addLog('Note: User already exists (identities length is 0)')
        }
      }
    } catch (err: any) {
      addLog(`Caught exception: ${err.message}`)
    }
    
    setLoading(false)
  }

  async function testOTP() {
    setLoading(true)
    addLog('Testing OTP/Magic Link...')
    
    try {
      const { data, error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
      })
      
      if (error) {
        addLog(`OTP Error: ${error.message}`)
      } else {
        addLog('OTP request successful!')
        addLog('Check your email for the magic link')
      }
    } catch (err: any) {
      addLog(`OTP Exception: ${err.message}`)
    }
    
    setLoading(false)
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Email Configuration Test</Text>
        <Text style={styles.subtitle}>
          Test different email sending methods
        </Text>
        
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="test@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        
        <TouchableOpacity
          style={[styles.button, { opacity: loading ? 0.5 : 1 }]}
          onPress={testSignUp}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Test Sign Up Email</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, { opacity: loading ? 0.5 : 1 }]}
          onPress={testOTP}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Test Magic Link (OTP)</Text>
        </TouchableOpacity>
        
        <View style={styles.logContainer}>
          <Text style={styles.logTitle}>Debug Log:</Text>
          {log.map((entry, index) => (
            <Text key={index} style={styles.logEntry}>{entry}</Text>
          ))}
        </View>
        
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Common SMTP Issues:</Text>
          <Text style={styles.infoText}>• API key expired or invalid</Text>
          <Text style={styles.infoText}>• Sender email not verified in Resend</Text>
          <Text style={styles.infoText}>• Wrong sender domain</Text>
          <Text style={styles.infoText}>• Port 465 requires SSL enabled</Text>
          <Text style={styles.infoText}>• Rate limiting</Text>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  inner: {
    padding: 20,
    paddingTop: 60,
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
    marginBottom: 10,
  },
  secondaryButton: {
    backgroundColor: '#6c757d',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    marginTop: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  backText: {
    color: Colors.light.tint,
    fontSize: 14,
  },
  logContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    minHeight: 200,
  },
  logTitle: {
    fontWeight: '600',
    marginBottom: 10,
  },
  logEntry: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 5,
    color: '#333',
  },
  infoBox: {
    backgroundColor: '#fff3cd',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffeeba',
  },
  infoTitle: {
    fontWeight: '600',
    marginBottom: 10,
    color: '#856404',
  },
  infoText: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 5,
  },
})