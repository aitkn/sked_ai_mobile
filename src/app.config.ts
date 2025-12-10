import 'dotenv/config'
import { config as load } from 'dotenv'

// Allow selecting env via APP_ENV=test|development|production
if (process.env.APP_ENV) {
  load({ path: `.env.${process.env.APP_ENV}` })
}

export default {
  expo: {
    name: 'skedaiapp',
    slug: 'skedaiapp',
    extra: {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      APP_ENV: process.env.APP_ENV || 'development',
    },
  },
}


