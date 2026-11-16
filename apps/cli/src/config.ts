import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const DEFAULT_SEED_FILE = fileURLToPath(new URL('../../../seed/tasks.json', import.meta.url));

/** The local development user. Keep in sync with supabase/seed.sql and apps/web/.env.development. */
export const DEV_USER = {
  email: process.env.DEV_USER_EMAIL ?? 'dev@example.com',
  password: process.env.DEV_USER_PASSWORD ?? 'dev-password',
};

export interface Connection {
  url: string;
  serviceKey: string;
  anonKey: string;
  /** Direct Postgres URL, used only by the database tests. */
  dbUrl: string;
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Phase 0 only ever talks to local Supabase; real data needs a later, explicit `--env prod`. */
export function assertLocal(url: string): void {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to use ${url}: this CLI only talks to local Supabase (127.0.0.1/localhost).`);
  }
}

function fromSupabaseStatus(): Connection {
  let out: string;
  try {
    out = execFileSync('supabase', ['status', '-o', 'json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(
      'Local Supabase is not running (or the supabase CLI is missing). Start it with `npm run db:start`.\n' +
        String((error as { stderr?: string }).stderr ?? error),
    );
  }
  const status = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>;
  return {
    url: status.API_URL!,
    serviceKey: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY!,
    anonKey: status.ANON_KEY ?? status.PUBLISHABLE_KEY!,
    dbUrl: status.DB_URL!,
  };
}

let cached: Connection | undefined;

/** SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY if set, otherwise `supabase status`. */
export function connection(): Connection {
  if (cached) return cached;
  const env = process.env;
  const conn =
    env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? {
          url: env.SUPABASE_URL,
          serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
          anonKey: env.SUPABASE_ANON_KEY ?? '',
          dbUrl: env.SUPABASE_DB_URL ?? '',
        }
      : fromSupabaseStatus();
  assertLocal(conn.url);
  cached = conn;
  return conn;
}
