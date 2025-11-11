/**
 * LLM Configuration for Mobile
 *
 * Configuration for LLM integration via Supabase Edge Functions
 */

import Constants from 'expo-constants';

// Get Supabase URL from supabase.ts
const SUPABASE_URL = 'https://api.skedai.com'; // Match supabase.ts

// Use Edge Function (production) or local proxy (development)
// Check environment variables
const USE_EDGE_FUNCTION = 
  Constants.expoConfig?.extra?.useEdgeFunction !== false;

// API endpoint
const API_URL = USE_EDGE_FUNCTION
  ? `${SUPABASE_URL}/functions/v1/assistant-chat`
  : 'http://localhost:3001/api/claude'; // Fallback to proxy for testing

// Export configuration
export const llmConfig = {
  apiUrl: API_URL,
  useEdgeFunction: USE_EDGE_FUNCTION,
  maxTokens: 4096,
  temperature: 1.0,
};

// Validate configuration
export function validateLLMConfig(): boolean {
  if (!llmConfig.apiUrl) {
    console.error('[LLM Config] API URL not configured');
    return false;
  }
  console.log('[LLM Config] Using', llmConfig.useEdgeFunction ? 'Edge Function' : 'Proxy', 'at', llmConfig.apiUrl);
  return true;
}

export default llmConfig;

