import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../contexts/AuthContext'
import { RootStackParamList } from '../navigation/types'

type SignUpScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'SignUp'>

export default function SignUpScreen() {
  const navigation = useNavigation<SignUpScreenNavigationProp>()
  const { signUpWithEmail, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleEmailSignUp = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields')
      return
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match')
      return
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      await signUpWithEmail(email, password)
      Alert.alert('Success', 'Please check your email to confirm your account')
    } catch (error: any) {
      Alert.alert('Error', error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch (error: any) {
      Alert.alert('Error', error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <View className="flex-1 justify-center px-8 bg-white">
        <Text className="text-3xl font-bold text-center mb-8">Sign Up</Text>
        
        <View className="space-y-4">
          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 text-base"
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          
          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 text-base mt-4"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 text-base mt-4"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
          
          <TouchableOpacity
            onPress={handleEmailSignUp}
            disabled={loading}
            className={`mt-6 rounded-lg py-3 ${loading ? 'bg-gray-400' : 'bg-blue-500'}`}
          >
            <Text className="text-white text-center font-semibold text-lg">
              {loading ? 'Creating account...' : 'Sign Up'}
            </Text>
          </TouchableOpacity>

          <View className="flex-row items-center my-4">
            <View className="flex-1 h-px bg-gray-300" />
            <Text className="mx-4 text-gray-500">OR</Text>
            <View className="flex-1 h-px bg-gray-300" />
          </View>

          <TouchableOpacity
            onPress={handleGoogleSignIn}
            disabled={loading}
            className="border border-gray-300 rounded-lg py-3"
          >
            <Text className="text-center font-semibold text-base">
              Continue with Google
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('SignIn')}
            className="mt-4"
          >
            <Text className="text-center text-blue-500">
              Already have an account? Sign In
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}