import * as AppleAuthentication from 'expo-apple-authentication'
import { supabase } from '../lib/supabase'
import Constants from 'expo-constants'

export const initiateAppleSignIn = async () => {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })

    if (credential.identityToken) {
      try {
        // Get the current bundle identifier - use development one in Expo
        const bundleIdentifier = Constants.expoConfig?.ios?.bundleIdentifier || 'host.exp.Exponent'
        
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
          nonce: credential.nonce,
          options: {
            redirectTo: `${bundleIdentifier}://auth/callback`
          }
        })

        if (error) {
          throw error
        }

        return data
      } catch (signInError: any) {
        if (signInError.message?.includes('Email address already registered') || 
            signInError.message?.includes('Unable to exchange external code') ||
            signInError.message?.includes('email_address_already_registered')) {
          
          const { data: currentUser } = await supabase.auth.getUser()
          
          if (currentUser?.user) {
            try {
              const { error: linkError } = await supabase.auth.linkIdentity({
                provider: 'apple',
                token: credential.identityToken,
                nonce: credential.nonce,
                options: {
                  redirectTo: `${bundleIdentifier}://auth/callback`
                }
              })
              
              if (linkError) {
                throw new Error('This email is already registered with another sign-in method. Please sign in with your original method first, then link Apple Sign-In from your profile settings.')
              }
              
              return { user: currentUser.user, session: null }
            } catch (linkingError: any) {
              throw new Error('This email is already registered with another sign-in method. Please sign in with your original method (like Google) to continue.')
            }
          } else {
            throw new Error('This email is already registered with another sign-in method. Please sign in with your original method (like Google) to continue.')
          }
        } else {
          throw signInError
        }
      }
    } else {
      throw new Error('No Apple ID token received')
    }
  } catch (error: any) {
    if (error.code === 'ERR_REQUEST_CANCELED') {
      throw new Error('Apple Sign-In was canceled')
    } else {
      throw error
    }
  }
}

export const isAppleAuthenticationAvailable = async (): Promise<boolean> => {
  return await AppleAuthentication.isAvailableAsync()
}