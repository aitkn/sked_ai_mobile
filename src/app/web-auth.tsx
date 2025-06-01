import React, { useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from '../lib/supabase'
import Colors from '../constants/Colors'

export default function WebAuth() {
  const router = useRouter()

  async function openWebAuth() {
    // Open your web app's login page
    const authUrl = 'https://www.skedai.com/login?mobile=true'
    
    const result = await WebBrowser.openBrowserAsync(authUrl, {
      dismissButtonStyle: 'close',
      showTitle: true,
      enableBarCollapsing: false,
    })
    
    if (result.type === 'dismiss') {
      // Check if user is now logged in
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace('/(tabs)')
      }
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alternative Sign In</Text>
      <Text style={styles.subtitle}>
        Sign in using the web version, then return to the app
      </Text>
      
      <TouchableOpacity style={styles.button} onPress={openWebAuth}>
        <Text style={styles.buttonText}>Open Web Login</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
      
      <View style={styles.instructions}>
        <Text style={styles.instructionTitle}>How this works:</Text>
        <Text style={styles.instruction}>1. Opens your web login page</Text>
        <Text style={styles.instruction}>2. Sign in with any method</Text>
        <Text style={styles.instruction}>3. Close the browser when done</Text>
        <Text style={styles.instruction}>4. You'll be logged in here</Text>
      </View>
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
  button: {
    backgroundColor: Colors.light.tint,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    alignItems: 'center',
    marginBottom: 30,
  },
  backText: {
    color: Colors.light.tint,
    fontSize: 14,
  },
  instructions: {
    backgroundColor: '#f5f5f5',
    padding: 20,
    borderRadius: 8,
  },
  instructionTitle: {
    fontWeight: '600',
    marginBottom: 10,
  },
  instruction: {
    marginBottom: 5,
    color: '#666',
  },
})