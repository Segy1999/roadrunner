/**
 * Supabase Browser Client
 * 
 * This file initializes the Supabase client for browser-side use.
 * It uses only the anon key (public key) and should never have access
 * to service role keys.
 * 
 * Usage: Import this in client-side code when you need Supabase features
 * in the browser (e.g., authentication, public data access).
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase browser client not initialized. PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY must be set in .env'
  );
}

export const supabaseBrowser = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;


