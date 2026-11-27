/**
 * Public Supabase settings. The anon key cannot read rows by itself: every query also sends
 * the caller's user access token, and row-level security applies. This server never reads a
 * service-role key.
 */
export function supabasePublicConfig(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL?.trim() ?? '';
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? '';
  if (!url || !anonKey) {
    throw new Error('The MCP server needs SUPABASE_URL and SUPABASE_ANON_KEY.');
  }
  return { url, anonKey };
}
