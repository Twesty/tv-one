import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

const sharedOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
};

// This client is server-only. Never import this module from browser applications.
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  sharedOptions
);

export const supabaseAuth = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  sharedOptions
);
