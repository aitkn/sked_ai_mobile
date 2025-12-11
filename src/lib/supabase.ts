import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import { safeStorage } from './storage'

// Use custom domain if available, otherwise fall back to Supabase domain
// const supabaseUrl = 'https://api.skedai.com' // Custom domain (currently has SSL issues)
const supabaseUrl = 'https://jfcurpgmlzlceotuthat.supabase.co' // Supabase domain (working)
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmY3VycGdtbHpsY2VvdHV0aGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjg3OTg4ODksImV4cCI6MjA0NDM3NDg4OX0.fLKoJ_WOoCT_HZvoC1OlJnek57_WMd_C0vwYvh_1C1g'

// Create custom storage adapter that works on web and handles storage errors
const customStorage = Platform.OS === 'web' ? {
  getItem: (key: string) => {
    try {
      return Promise.resolve(localStorage.getItem(key))
    } catch {
      return Promise.resolve(null)
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
      return Promise.resolve()
    } catch {
      return Promise.resolve()
    }
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key)
      return Promise.resolve()
    } catch {
      return Promise.resolve()
    }
  },
} : {
  getItem: (key: string) => safeStorage.getItem(key),
  setItem: (key: string, value: string) => safeStorage.setItem(key, value),
  removeItem: (key: string) => safeStorage.removeItem(key),
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Use PKCE flow for better security and reliability
    flowType: 'pkce',
  },
  global: {
    // Add fetch options for better error handling
    fetch: (url, options = {}) => {
      // Create abort controller for timeout (30 seconds)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)
      
      return fetch(url, {
        ...options,
        signal: controller.signal,
      })
        .then((response) => {
          clearTimeout(timeoutId)
          return response
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          // Provide more descriptive error messages
          if (error.name === 'AbortError' || error.message?.includes('timeout') || error.message?.includes('aborted')) {
            throw new Error('Request timeout: The server took too long to respond. Please check your connection and try again.')
          }
          if (error.message?.includes('Network request failed') || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
            throw new Error('Network error: Unable to reach the server. Please check your internet connection and that api.skedai.com is accessible.')
          }
          throw error
        })
    },
  },
})