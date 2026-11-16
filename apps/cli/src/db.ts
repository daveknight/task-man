import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { connection, DEV_USER } from './config.ts';

/** Service-role client: bypasses RLS, so every query must filter by user_id itself. */
export function adminClient(): SupabaseClient {
  const { url, serviceKey } = connection();
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The dev user's id, creating the user if `supabase/seed.sql` hasn't. */
export async function devUserId(db: SupabaseClient): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === DEV_USER.email.toLowerCase());
    if (user) return user.id;
    if (data.users.length < 200) break;
  }
  const { data, error } = await db.auth.admin.createUser({
    email: DEV_USER.email,
    password: DEV_USER.password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

export function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T | null {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export function checkRows<T>(result: { data: T[] | null; error: { message: string } | null }, what: string): T[] {
  return check(result, what) ?? [];
}
