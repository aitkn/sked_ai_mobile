import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import { supabase } from '../lib/supabase'

WebBrowser.maybeCompleteAuthSession()

export const initiateGoogleSignIn = async () => {
  const redirectTo = makeRedirectUri({
    path: '/auth/callback',
  })

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  })

  if (error) throw error

  const res = await WebBrowser.openAuthSessionAsync(
    data?.url ?? '',
    redirectTo
  )

  if (res.type === 'success') {
    const { url } = res
    const params = new URLSearchParams(url.split('#')[1])
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')

    if (access_token && refresh_token) {
      await supabase.auth.setSession({
        access_token,
        refresh_token,
      })
    }
  }
}