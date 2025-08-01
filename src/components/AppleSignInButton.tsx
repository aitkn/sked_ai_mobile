import React from 'react'
import { Alert, Platform } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import { useAuth } from '../contexts/AuthContext'

interface AppleSignInButtonProps {
  onPress?: () => void
}

export const AppleSignInButton: React.FC<AppleSignInButtonProps> = ({ onPress }) => {
  const { signInWithApple, isAppleAuthAvailable } = useAuth()

  const handleAppleSignIn = async () => {
    try {
      await signInWithApple()
      onPress?.()
    } catch (error: any) {
      console.error('Apple Sign-In Error:', error)
      Alert.alert('Sign In Error', error.message || 'Failed to sign in with Apple')
    }
  }

  if (!isAppleAuthAvailable || Platform.OS !== 'ios') {
    return null
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={5}
      style={{ width: '100%', height: 50 }}
      onPress={handleAppleSignIn}
    />
  )
}