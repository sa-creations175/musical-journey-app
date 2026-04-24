import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client singleton.
 *
 * Reads from Vite env vars (VITE_SUPABASE_URL,
 * VITE_SUPABASE_PUBLISHABLE_KEY). The publishable key is the
 * PKCE/anon-style key safe to ship in a client bundle — actual data
 * protection comes from Row Level Security policies on the database.
 *
 * Session persistence is enabled so the user stays signed in across
 * reloads; tokens live in localStorage and are refreshed automatically.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // Thrown at import time so a misconfigured deploy surfaces loudly
  // instead of silently failing at the first auth call.
  throw new Error(
    'Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local (or in Vercel Project Settings → Environment Variables).',
  );
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
