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
import * as Linking from 'expo-linking'
import { FontAwesome } from '@expo/vector-icons'


// Conditionally import Google Sign-In to avoid errors in Expo Go
let GoogleSignin: any = null;
let GoogleSigninButton: any = null;
let statusCodes: any = null;

// Only try to import if we're not on web
if (Platform.OS !== 'web') {
  try {
    const googleSignIn = require('@react-native-google-signin/google-signin');
    GoogleSignin = googleSignIn.GoogleSignin;
    GoogleSigninButton = googleSignIn.GoogleSigninButton;
    statusCodes = googleSignIn.statusCodes;
    console.log('✅ Google Sign-In native module loaded successfully');
  } catch (error) {
    console.log('📱 Google Sign-In native module not available - using web OAuth flow');
    GoogleSignin = null;
    GoogleSigninButton = null;
    statusCodes = null;
  }
}

WebBrowser.maybeCompleteAuthSession()

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [isAppleAuthAvailable, setIsAppleAuthAvailable] = useState(false)
  const router = useRouter()
  
  const redirectTo = makeRedirectUri({
    scheme: 'skedaiapp',
    path: 'auth-callback',
    preferLocalhost: false,  // Force use of custom scheme
  })
  
  // For OAuth, we need to ensure the redirect goes back to the app, not website
  const oauthRedirectTo = Platform.OS === 'web' 
    ? `${window.location.origin}/auth-callback`
    : redirectTo
  
  // Alternative redirect for testing if main one doesn't work
  const deepLinkRedirect = 'skedaiapp://auth-callback'
  
  // HTTPS redirect that should work with OAuth providers
  const httpsRedirect = 'https://api.skedai.com/auth/callback'
  
  // For debugging - show the redirect URI
  console.log('Redirect URI:', redirectTo)
  console.log('OAuth Redirect URI:', oauthRedirectTo)
  console.log('Deep Link Redirect:', deepLinkRedirect)
  console.log('Platform:', Platform.OS)
  
  // Test if the app scheme is working
  useEffect(() => {
    const testScheme = async () => {
      try {
        const canOpen = await Linking.canOpenURL('skedaiapp://test')
        console.log('Can open skedaiapp:// scheme:', canOpen)
      } catch (error) {
        console.log('Error testing scheme:', error)
      }
    }
    testScheme()
  }, [])

  // Configure Google Sign-In and check Apple Auth availability
  useEffect(() => {
    // Check Apple authentication availability
    const checkAppleAuth = async () => {
      if (Platform.OS === 'ios') {
        try {
          const { isAppleAuthenticationAvailable } = require('../utils/appleAuth')
          const available = await isAppleAuthenticationAvailable()
          setIsAppleAuthAvailable(available)
        } catch (error) {
          console.log('Apple Authentication not available')
          setIsAppleAuthAvailable(false)
        }
      }
    }
    
    checkAppleAuth()

    // Skip Google Sign-In configuration on web or if not available
    if (Platform.OS === 'web' || !GoogleSignin) return

    const configureGoogleSignIn = async () => {
      try {
        // Test if the module is actually available
        await GoogleSignin.configure({
          scopes: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
          webClientId: '434260085381-cppbc7o9l0t7eim9vit9a36eltn4nnmq.apps.googleusercontent.com', // TODO: Replace with your actual web client ID from Google Console
          offlineAccess: true,
          forceCodeForRefreshToken: true,
        })
        console.log('✅ Google Sign-In configured successfully')
      } catch (error) {
        console.log('❌ Google Sign-In configuration failed:', error)
        console.log('📱 Falling back to web OAuth flow for Google Sign-In')
        // Set GoogleSignin to null to force fallback to web OAuth
        GoogleSignin = null
      }
    }

    configureGoogleSignIn()
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
        
        // Sign out first to clear any cached sessions and force account selection
        try {
          await GoogleSignin.signOut()
        } catch (signOutError) {
          console.log('No existing Google session to sign out from')
        }
        
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
          
          console.log('Successfully authenticated with Supabase:', data)
          // The auth state listener in _layout.tsx will handle navigation
          // No need to manually navigate - the session change will trigger it
        } else {
          throw new Error('No ID token received from Google')
        }
      } catch (error: any) {
        console.error('Google sign-in error:', error)
        
        if (error.code === statusCodes?.SIGN_IN_CANCELLED) {
          console.log('User cancelled the login flow')
          // Don't show error for cancellation
          setLoading(false)
          return
        } else if (error.code === statusCodes?.IN_PROGRESS) {
          Alert.alert('Sign In In Progress', 'Please wait for the current sign-in to complete')
        } else if (error.code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
          Alert.alert('Google Play Services Error', 'Google Play Services are not available or outdated')
        } else {
          // Check if it's a module not found error
          if (error.message?.includes('RNGoogleSignin') || error.message?.includes('TurboModuleRegistry')) {
            console.log('❌ Google Sign-In module not available, falling back to web OAuth')
            setLoading(false)
            // Fall back to web OAuth flow
            signInWithProvider('google')
            return
          }
          
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
    console.log('🚀 Starting OAuth flow for:', provider)
    setLoading(true)
    try {
      console.log('📝 Calling supabase.auth.signInWithOAuth...')
      // Final approach - force the OAuth to stay in app by handling it manually
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: deepLinkRedirect,  // Use the deep link redirect instead of expo URL
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',  // Force account selection for Google
            access_type: 'offline',
          },
        },
      })
      
      console.log('📊 OAuth response:', { data, error })
      
      if (error) {
        console.error('❌ OAuth error:', error)
        throw error
      }
      
      // On web, just redirect
      if (Platform.OS === 'web') {
        console.log('🌐 Web platform - redirecting to:', data.url)
        window.location.href = data.url
        return
      }
      
      console.log('📱 Mobile platform')
      console.log('🔗 OAuth URL:', data.url)
      console.log('🔄 Using Redirect URI:', deepLinkRedirect)
      
      // Manual OAuth flow - open browser and handle callback manually
      console.log('🌐 Opening WebBrowser...')
      const res = await WebBrowser.openAuthSessionAsync(
        data?.url ?? '',
        deepLinkRedirect,
        {
          showInRecents: false,
          preferEphemeralSession: false,
        }
      )
      
      console.log('📋 WebBrowser result:', res)
      console.log('📋 WebBrowser result type:', res.type)
      
      if (res.type === 'success') {
        const { url } = res
        console.log('✅ OAuth success URL:', url)
        
        // If we get here, it means the OAuth worked and we have the callback URL
        // Don't navigate to the website - handle the callback directly
        
        try {
          // Extract the URL parameters
          const callbackUrl = new URL(url)
          console.log('🔍 Parsing callback URL:', callbackUrl.href)
          console.log('🔍 Search params:', callbackUrl.search)
          console.log('🔍 Hash params:', callbackUrl.hash)
          
          const searchParams = new URLSearchParams(callbackUrl.search)
          
          // Also check hash parameters
          if (callbackUrl.hash) {
            const hashParams = new URLSearchParams(callbackUrl.hash.substring(1))
            hashParams.forEach((value, key) => {
              searchParams.set(key, value)
            })
          }
          
          // Get the authorization code or tokens
          const code = searchParams.get('code')
          const access_token = searchParams.get('access_token')
          const refresh_token = searchParams.get('refresh_token')
          const errorParam = searchParams.get('error')
          
          console.log('🔑 OAuth params:', {
            code: code ? 'present' : 'missing',
            access_token: access_token ? 'present' : 'missing',
            refresh_token: refresh_token ? 'present' : 'missing',
            error: errorParam
          })
          
          if (errorParam) {
            throw new Error(searchParams.get('error_description') || errorParam)
          }
          
          if (access_token) {
            // Set session with tokens
            console.log('🔐 Setting session with access token...')
            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
              access_token,
              refresh_token: refresh_token || '',
            })
            
            if (sessionError) throw sessionError
            console.log('✅ OAuth session set successfully!')
            return
          } else if (code) {
            // Exchange code for session
            console.log('🔄 Exchanging code for session...')
            const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
            
            if (sessionError) throw sessionError
            console.log('✅ OAuth session exchanged successfully!')
            return
          }
          
          throw new Error('No valid authentication response received from OAuth')
        } catch (urlError) {
          console.error('🚨 Failed to parse OAuth callback URL:', urlError)
          throw new Error('Failed to process OAuth response')
        }
      } else if (res.type === 'cancel') {
        console.log('❌ User cancelled OAuth flow')
        setLoading(false)
        return
      } else {
        console.log('❓ OAuth flow result:', res)
        throw new Error('OAuth authentication was not completed')
      }
    } catch (error: any) {
      console.error('OAuth error:', error)
      const providerName = provider.charAt(0).toUpperCase() + provider.slice(1)
      Alert.alert(
        `${providerName} Sign In Failed`,
        error.message || `Failed to sign in with ${providerName}`,
        [{ text: 'OK' }]
      )
    }
    setLoading(false)
  }

  const signInWithApple = async () => {
    // Use native Apple Sign-In implementation instead of web OAuth
    const { initiateAppleSignIn } = require('../utils/appleAuth')
    
    try {
      setLoading(true)
      await initiateAppleSignIn()
      console.log('✅ Apple Sign-In completed successfully!')
    } catch (error: any) {
      console.error('❌ Apple Sign-In error:', error)
      Alert.alert(
        'Apple Sign In Failed',
        error.message || 'Failed to sign in with Apple',
        [{ text: 'OK' }]
      )
    }
    setLoading(false)
  }

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
          
          {Platform.OS === 'ios' && isAppleAuthAvailable && (
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