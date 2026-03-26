import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const getSupabaseUrl = () => {
  const value = import.meta.env.VITE_SUPABASE_URL;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
};

const getSupabasePublishableKey = () => {
  const value =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY;

  return typeof value === 'string' && value.trim() ? value.trim() : '';
};

let supabaseBrowserClient: SupabaseClient | null = null;

export const hasSupabaseBrowserAuth = () =>
  Boolean(getSupabaseUrl() && getSupabasePublishableKey());

export const getSupabaseBrowserClient = () => {
  if (!hasSupabaseBrowserAuth()) {
    return null;
  }

  if (!supabaseBrowserClient) {
    supabaseBrowserClient = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return supabaseBrowserClient;
};
