import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** In dev, read the local stack's URL and public key from `supabase status` unless set in the environment. */
function localSupabase(): { url: string; anonKey: string } {
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
    return { url: process.env.VITE_SUPABASE_URL, anonKey: process.env.VITE_SUPABASE_ANON_KEY };
  }
  try {
    const out = execFileSync('supabase', ['status', '-o', 'json'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const status = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>;
    return { url: status.API_URL ?? '', anonKey: status.ANON_KEY ?? status.PUBLISHABLE_KEY ?? '' };
  } catch {
    return { url: '', anonKey: '' };
  }
}

export default defineConfig(({ command }) => {
  const supabase = command === 'serve' ? localSupabase() : { url: process.env.VITE_SUPABASE_URL ?? '', anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? '' };
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabase.url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabase.anonKey),
    },
    server: { host: '127.0.0.1', port: 5179, strictPort: true },
    preview: { host: '127.0.0.1', port: 5179, strictPort: true },
  };
});
