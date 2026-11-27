import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabaseConfigured = Boolean(url && anonKey);

/** Where supabase-js keeps the session, so the offline fallback below can read it without a network call. */
const STORAGE_KEY = 'taskman-auth';

export const supabase = createClient(url || 'http://127.0.0.1:54321', anonKey || 'missing-key', {
  // Sessions last until sign-out: the access token refreshes itself, so the installed app stays signed in.
  auth: { storageKey: STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

function isLocal(value: string): boolean {
  try {
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

export interface Session {
  email: string;
  userId: string;
  /** Empty when the account has no name. The history screen then says You. */
  name: string;
}

/** The account name, when the user record has one. Email is not a name. */
export function accountName(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const meta = metadata as Record<string, unknown>;
  for (const key of ['full_name', 'name']) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function sessionFrom(user: { id: string; email?: string | null; user_metadata?: unknown }): Session {
  return { userId: user.id, email: user.email ?? '', name: accountName(user.user_metadata) };
}

const AUTOSIGNIN_KEY = 'taskman-autosignin';

/**
 * Dev builds against a local stack sign in as the seeded dev user without a login screen. Production
 * builds never do: the dev credentials are only defined in `.env.development` and `.env.localpreview`,
 * and the URL has to be local on top of that. `?autosignin=off` shows the real login locally, and so
 * does signing out; `?autosignin=on` goes back.
 */
export function autoSignInAvailable(): boolean {
  return Boolean(import.meta.env.DEV || import.meta.env.MODE === 'localpreview') && isLocal(url) && Boolean(import.meta.env.VITE_DEV_USER_EMAIL);
}

export function autoSignInEnabled(): boolean {
  if (!autoSignInAvailable()) return false;
  const param = new URLSearchParams(window.location.search).get('autosignin');
  if (param === 'off' || param === 'on') window.localStorage.setItem(AUTOSIGNIN_KEY, param);
  return window.localStorage.getItem(AUTOSIGNIN_KEY) !== 'off';
}

export function setAutoSignIn(on: boolean) {
  window.localStorage.setItem(AUTOSIGNIN_KEY, on ? 'on' : 'off');
}

export async function signInAsDevUser(): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: import.meta.env.VITE_DEV_USER_EMAIL as string,
    password: import.meta.env.VITE_DEV_USER_PASSWORD as string,
  });
  if (error) throw error;
}

/** The user kept in storage, for opening the cached board offline after the access token has expired. */
export function storedSession(): Session | null {
  try {
    const user = (JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as { user?: { id?: string; email?: string; user_metadata?: unknown } } | null)?.user;
    if (!user?.id) return null;
    return sessionFrom({ id: user.id, email: user.email, user_metadata: user.user_metadata });
  } catch {
    return null;
  }
}

/** The signed-in user. Offline with an expired token it falls back to the stored one, so the cached board still opens. */
export async function currentSession(): Promise<Session> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return sessionFrom(data.session.user);
  const stored = storedSession();
  if (stored && !navigator.onLine) return stored;
  throw new Error('Not signed in.');
}
