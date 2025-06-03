import React, { useState, useEffect } from 'react'
import {
  Alert,
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { supabase } from '../lib/supabase'
const supabaseUrl = 'https://api.skedai.com'
import { Text } from '../components/Themed'
import Colors from '../constants/Colors'
import { IS_DEVELOPMENT, TEST_ACCOUNTS } from '../config/constants'
import { useRouter } from 'expo-router'
import { makeRedirectUri } from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { FontAwesome } from '@expo/vector-icons'
// Conditionally import Google Sign-In to avoid errors in Expo Go
let GoogleSignin: any;
let GoogleSigninButton: any;
let statusCodes: any;

try {
  const googleSignIn = require('@react-native-google-signin/google-signin');
  GoogleSignin = googleSignIn.GoogleSignin;
  GoogleSigninButton = googleSignIn.GoogleSigninButton;
  statusCodes = googleSignIn.statusCodes;
} catch (error) {
  console.log('Google Sign-In not available - using web OAuth flow');
}

WebBrowser.maybeCompleteAuthSession()

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const router = useRouter()
  
  const redirectTo = makeRedirectUri({
    scheme: 'skedaiapp',
    path: 'auth-callback',
  })
  
  // For debugging - show the redirect URI
  console.log('Redirect URI:', redirectTo)
  console.log('Platform:', Platform.OS)

  // Configure Google Sign-In if available
  useEffect(() => {
    // Skip Google Sign-In configuration on web or if not available
    if (Platform.OS === 'web' || !GoogleSignin) return

    try {
      GoogleSignin.configure({
        scopes: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
        webClientId: '434260085381-cppbc7o9l0t7eim9vit9a36eltn4nnmq.apps.googleusercontent.com', // TODO: Replace with your actual web client ID from Google Console
        offlineAccess: true,
        forceCodeForRefreshToken: true,
      })
    } catch (error) {
      console.log('Error configuring Google Sign-In:', error)
    }
  }, [])

  async function signInWithEmail() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    })

    if (error) Alert.alert(error.message)
    setLoading(false)
  }

  async function signUpWithEmail() {
    setLoading(true)
    try {
      console.log('Attempting sign up for:', email.trim())
      Alert.alert('Debug', `Attempting sign up for: ${email.trim()}`)
      
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
      })

      console.log('Sign up response:', { data, error })
      
      // Show the actual error details
      if (error) {
        Alert.alert(
          'Sign Up Error Details',
          `Message: ${error.message}\nStatus: ${error.status}\nName: ${error.name}`,
          [{ text: 'OK' }]
        )
      }

      if (error) {
        console.error('Sign up error:', error)
        // Check if it's an email sending error
        if (error.message?.includes('email') || error.status === 500) {
          Alert.alert(
            'Email Service Issue', 
            'There was an issue sending the confirmation email. The account may have been created. Try signing in or contact support.',
            [
              { text: 'Try Sign In', onPress: () => setIsSignUp(false) },
              { text: 'OK' }
            ]
          )
        } else {
          Alert.alert('Sign Up Error', error.message)
        }
      } else if (data?.user?.identities?.length === 0) {
        Alert.alert('Account Exists', 'An account with this email already exists. Please sign in instead.')
        setIsSignUp(false)
      } else if (data?.user) {
        Alert.alert(
          'Success!', 
          'Account created successfully! Please check your email for the confirmation link.',
          [{ text: 'OK', onPress: () => setIsSignUp(false) }]
        )
        setEmail('')
        setPassword('')
      }
    } catch (error: any) {
      console.error('Caught error:', error)
      Alert.alert('Error', error.message || 'An error occurred during sign up')
    }
    setLoading(false)
  }

  async function signInWithGoogle() {
    // Use native Google Sign-In for mobile platforms if available
    if (Platform.OS !== 'web' && GoogleSignin) {
      setLoading(true)
      try {
        // Check if Google Play Services are available
        await GoogleSignin.hasPlayServices()
        
        // Sign in with Google
        const userInfo = await GoogleSignin.signIn()
        console.log('Google sign-in response:', userInfo)
        
        if (userInfo.data?.idToken) {
          // Sign in with Supabase using the ID token
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: userInfo.data.idToken,
          })
          
          if (error) {
            console.error('Supabase auth error:', error)
            throw error
          }
          
          console.log('Successfully authenticated with Supabase')
          // The auth state listener in _layout.tsx will handle navigation
        } else {
          throw new Error('No ID token received from Google')
        }
      } catch (error: any) {
        console.error('Google sign-in error:', error)
        
        if (error.code === statusCodes?.SIGN_IN_CANCELLED) {
          console.log('User cancelled the login flow')
        } else if (error.code === statusCodes?.IN_PROGRESS) {
          Alert.alert('Sign In In Progress', 'Please wait for the current sign-in to complete')
        } else if (error.code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
          Alert.alert('Google Play Services Error', 'Google Play Services are not available or outdated')
        } else {
          Alert.alert(
            'Google Sign In Failed',
            error.message || 'An error occurred during Google sign-in',
            [
              { text: 'OK' },
              { text: 'Try Again', onPress: signInWithGoogle }
            ]
          )
        }
      }
      setLoading(false)
    } else {
      // Fall back to OAuth flow for web or Expo Go
      signInWithProvider('google')
    }
  }

  async function signInWithProvider(provider: 'google' | 'apple') {
    setLoading(true)
    try {
      // This is now mainly used for web and Apple sign-in
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectTo,
          skipBrowserRedirect: Platform.OS !== 'web',
        },
      })
      
      if (error) throw error
      
      // On web, just redirect
      if (Platform.OS === 'web') {
        window.location.href = data.url
        return
      }
      
      // On mobile, use WebBrowser (for Apple sign-in)
      const res = await WebBrowser.openAuthSessionAsync(
        data?.url ?? '',
        redirectTo,
        {
          showInRecents: true,
          preferEphemeralSession: true,
        }
      )
      
      if (res.type === 'success') {
        const { url } = res
        const responseUrl = new URL(url)
        
        // Check for error in response
        const error = responseUrl.searchParams.get('error')
        if (error) {
          const errorDescription = responseUrl.searchParams.get('error_description')
          throw new Error(errorDescription || error)
        }
        
        // Handle the OAuth response
        if (responseUrl.hash) {
          const hashParams = new URLSearchParams(responseUrl.hash.substring(1))
          const access_token = hashParams.get('access_token')
          const refresh_token = hashParams.get('refresh_token')
          
          if (access_token) {
            await supabase.auth.setSession({
              access_token,
              refresh_token: refresh_token || '',
            })
          }
        } else if (responseUrl.searchParams.get('code')) {
          const code = responseUrl.searchParams.get('code')
          await supabase.auth.exchangeCodeForSession(code!)
        }
      }
    } catch (error: any) {
      const providerName = provider.charAt(0).toUpperCase() + provider.slice(1)
      Alert.alert(
        `${providerName} Sign In Failed`,
        error.message || `Failed to sign in with ${providerName}`,
        [{ text: 'OK' }]
      )
    }
    setLoading(false)
  }

  const signInWithApple = () => signInWithProvider('apple')

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.innerContainer}>
          <Text style={styles.title}>SkedAI</Text>
          <Text style={styles.subtitle}>
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </Text>
          
          <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            onChangeText={(text) => setEmail(text)}
            value={email}
            placeholder="email@address.com"
            autoCapitalize={'none'}
            placeholderTextColor="#666"
          />
          <TextInput
            style={styles.input}
            onChangeText={(text) => setPassword(text)}
            value={password}
            secureTextEntry={true}
            placeholder="Password"
            placeholderTextColor="#666"
            autoCapitalize={'none'}
          />
          
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={() => (isSignUp ? signUpWithEmail() : signInWithEmail())}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {isSignUp ? 'Sign Up' : 'Sign In'}
            </Text>
          </TouchableOpacity>
          
          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>
          
          {Platform.OS !== 'web' && GoogleSigninButton ? (
            <View style={styles.googleButtonContainer}>
              <GoogleSigninButton
                style={styles.googleButton}
                size={GoogleSigninButton.Size.Wide}
                color={GoogleSigninButton.Color.Dark}
                onPress={signInWithGoogle}
                disabled={loading}
              />
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.button, styles.socialButton]}
              onPress={signInWithGoogle}
              disabled={loading}
            >
              <FontAwesome name="google" size={20} color="#DB4437" style={styles.socialIcon} />
              <Text style={styles.socialButtonText}>Continue with Google</Text>
            </TouchableOpacity>
          )}
          
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[styles.button, styles.socialButton, styles.appleButton]}
              onPress={signInWithApple}
              disabled={loading}
            >
              <FontAwesome name="apple" size={20} color="#fff" style={styles.socialIcon} />
              <Text style={[styles.socialButtonText, { color: '#fff' }]}>Continue with Apple</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setIsSignUp(!isSignUp)}
          >
            <Text style={styles.switchText}>
              {isSignUp
                ? 'Already have an account? Sign In'
                : "Don't have an account? Sign Up"}
            </Text>
          </TouchableOpacity>

          {IS_DEVELOPMENT && (
            <View style={styles.devContainer}>
              <Text style={styles.devTitle}>Development Mode</Text>
              <Text style={[styles.devButtonText, { marginBottom: 10, color: '#333' }]}>
                Redirect URI: {redirectTo}
              </Text>
              <TouchableOpacity
                style={styles.devButton}
                onPress={async () => {
                  // Try to create test account first, then fill
                  setEmail(TEST_ACCOUNTS.user1.email);
                  setPassword(TEST_ACCOUNTS.user1.password);
                  Alert.alert(
                    'Test Account', 
                    'Email: test1@skedai.com\nPassword: testpass123\n\nNote: You need to create this account first using Sign Up.',
                    [{ text: 'OK' }]
                  );
                }}
              >
                <Text style={styles.devButtonText}>Fill Test Account</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devButton, { marginTop: 10 }]}
                onPress={() => router.push('/create-test-user')}
              >
                <Text style={styles.devButtonText}>Create Test User</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devButton, { marginTop: 10, backgroundColor: '#9C27B0' }]}
                onPress={() => router.push('/magic-link')}
              >
                <Text style={styles.devButtonText}>Magic Link Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devButton, { marginTop: 10, backgroundColor: '#FF5722' }]}
                onPress={() => router.push('/web-auth')}
              >
                <Text style={styles.devButtonText}>Web-Based Login</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devButton, { marginTop: 10, backgroundColor: '#607D8B' }]}
                onPress={async () => {
                  // Direct SMTP test without navigation
                  Alert.alert('Testing SMTP...', 'Attempting to send a test email')
                  try {
                    const testEmail = `test${Date.now()}@example.com`
                    const { data, error } = await supabase.auth.signUp({
                      email: testEmail,
                      password: 'TestPass123!',
                    })
                    
                    if (error) {
                      Alert.alert(
                        'SMTP Test Failed',
                        `Error: ${error.message}\n\nThis indicates your SMTP settings in Supabase are incorrect.\n\nCheck:\n1. Resend API key\n2. Sender email domain\n3. SSL settings`,
                        [{ text: 'OK' }]
                      )
                    } else {
                      Alert.alert('SMTP Test Result', 'Email system is working! Check if user was created.')
                    }
                  } catch (err: any) {
                    Alert.alert('Test Error', err.message)
                  }
                }}
              >
                <Text style={styles.devButtonText}>Test SMTP Directly</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devButton, { marginTop: 10, backgroundColor: '#4CAF50' }]}
                onPress={async () => {
                  // Test with a known working account
                  setEmail('abc858@gmail.com');
                  setPassword('');
                  setIsSignUp(false);
                  Alert.alert('Test Mode', 'Use your existing password for abc858@gmail.com');
                }}
              >
                <Text style={styles.devButtonText}>Use Existing Account</Text>
              </TouchableOpacity>
            </View>
          )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  innerContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: Colors.light.tint,
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 40,
    color: '#666',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
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
    marginTop: 10,
  },
  primaryButton: {
    backgroundColor: Colors.light.tint,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  switchText: {
    color: Colors.light.tint,
    fontSize: 14,
  },
  devContainer: {
    marginTop: 40,
    padding: 20,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  devTitle: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
    color: '#666',
  },
  devButton: {
    backgroundColor: '#666',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  devButtonText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e1e1e1',
  },
  dividerText: {
    marginHorizontal: 10,
    color: '#666',
    fontSize: 14,
  },
  socialButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1e1e1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  appleButton: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  socialIcon: {
    marginRight: 10,
  },
  socialButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '500',
  },
  googleButtonContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  googleButton: {
    width: '100%',
    height: 48,
  },
})