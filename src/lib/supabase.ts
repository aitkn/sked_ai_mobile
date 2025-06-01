import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

// Use custom domain if available, otherwise fall back to Supabase domain
const supabaseUrl = 'https://api.skedai.com' // Custom domain
// const supabaseUrl = 'https://jfcurpgmlzlceotuthat.supabase.co' // Supabase domain
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmY3VycGdtbHpsY2VvdHV0aGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjg3OTg4ODksImV4cCI6MjA0NDM3NDg4OX0.fLKoJ_WOoCT_HZvoC1OlJnek57_WMd_C0vwYvh_1C1g'

// Create custom storage adapter that works on web
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
} : AsyncStorage

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})