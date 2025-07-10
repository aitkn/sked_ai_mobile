import { createClient } from '@supabase/supabase-js'
import { DATABASE_CONFIG } from './config/globals.js'

const SUPABASE_URL = 'https://jfcurpgmlzlceotuthat.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmY3VycGdtbHpsY2VvdHV0aGF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyODc5ODg4OSwiZXhwIjoyMDQ0Mzc0ODg5fQ.zDuMjKEMOt-vI41b_AS_8_jaTyoSndE2nSepQsQXiHU'

async function checkSchema() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  
  console.log('🔍 Checking user_timeline table schema...')
  
  try {
    const { data, error } = await supabase
      .schema(DATABASE_CONFIG.SCHEMA)
      .from(DATABASE_CONFIG.TABLES.USER_TIMELINE)
      .select('*')
      .limit(1)

    if (error) {
      console.error('❌ Error:', error)
    } else {
      console.log('✅ Schema found!')
      if (data && data.length > 0) {
        console.log('📋 Columns:', Object.keys(data[0]))
        console.log('📝 Sample data:', data[0])
      } else {
        console.log('📋 No data found, but table exists')
      }
    }
  } catch (error) {
    console.error('❌ Exception:', error)
  }
}

checkSchema()