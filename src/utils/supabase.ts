import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Cloud sync (Supabase) configuration. Values come from Vite env vars so no
// secret is ever committed to the repo. Set them in `.env` locally and in the
// Render dashboard (Environment Variables) for production:
//   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;
