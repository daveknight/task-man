import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'http://127.0.0.1:54321', anonKey || 'missing-key');

function isLocal(value: string): boolean {
  try {
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * Signs in as the seeded dev user, only in `vite dev` against a local stack.
 * Every query still runs as a real authenticated user, so RLS applies exactly as in production.
 */
export async function ensureDevSession(): Promise<string> {
  const existing = await supabase.auth.getSession();
  if (existing.data.session) return existing.data.session.user.email ?? '';
  if (!import.meta.env.DEV || !isLocal(url)) {
    throw new Error('Not signed in. The login screen arrives in Phase 1b.');
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: import.meta.env.VITE_DEV_USER_EMAIL as string,
    password: import.meta.env.VITE_DEV_USER_PASSWORD as string,
  });
  if (error) throw error;
  return data.user.email ?? '';
}
