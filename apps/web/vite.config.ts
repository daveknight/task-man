import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_NAME } from '@app/core';

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

/** A production build on Vercel must point at the hosted project, never at nothing or at a local stack. */
function assertHostedConfig(url: string | undefined, anonKey: string | undefined) {
  if (process.env.VERCEL_ENV !== 'production') return;
  if (!url || !anonKey) {
    throw new Error('Production builds need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (Vercel, Settings, Environment Variables, Production).');
  }
  if (/127\.0\.0\.1|localhost/.test(url)) throw new Error('VITE_SUPABASE_URL points at a local stack; a production build needs the hosted project URL.');
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'production') assertHostedConfig(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const supabase = command === 'serve' || mode === 'localpreview' ? localSupabase() : { url: process.env.VITE_SUPABASE_URL ?? '', anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? '' };
  return {
    plugins: [
      react(),
      tailwindcss(),
      // The installable app: a manifest and a service worker that caches the app shell, so it
      // opens instantly and, offline, shows the last-loaded board read-only.
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: APP_NAME,
          short_name: APP_NAME,
          description: 'Personal task manager',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#F2F2F7',
          theme_color: '#F2F2F7',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png}'],
          navigateFallback: '/index.html',
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        },
      }),
    ],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabase.url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabase.anonKey),
    },
    server: { host: '127.0.0.1', port: 5179, strictPort: true },
    preview: { host: '127.0.0.1', port: 5179, strictPort: true },
  };
});
