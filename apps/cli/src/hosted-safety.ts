/**
 * Checks that keep the Supabase GitHub integration's "Deploy to production" safe. Every migration
 * merged to `main` runs on the real database, and the dev seed must never get there.
 */

export type Change = { status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U'; path: string };

const MIGRATION = /^supabase\/migrations\/(\d{14})_[a-z0-9_]+\.sql$/;

/** Statements that change or remove existing data or structure. Each needs an `allow-data-change` line. */
const DATA_CHANGES: [RegExp, string][] = [
  [/\bdrop\s+table\b/i, 'drop table'],
  [/\bdrop\s+column\b/i, 'drop column'],
  [/\bdrop\s+schema\b/i, 'drop schema'],
  [/\btruncate\b/i, 'truncate'],
  [/\bdelete\s+from\b/i, 'delete from'],
  [/\bupdate\s+[\w."]+\s+set\b/i, 'update ... set'],
  [/\balter\s+column\b[^;]*\btype\b/i, 'alter column ... type'],
];

const ALLOW = /^[ \t]*--[ \t]*allow-data-change:[ \t]*\S+/im;

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The data-changing statements in a migration, unless it carries an `-- allow-data-change: why` line. */
export function dataChangesIn(sql: string): string[] {
  if (ALLOW.test(sql)) return [];
  const code = stripComments(sql);
  return DATA_CHANGES.filter(([pattern]) => pattern.test(code)).map(([, label]) => label);
}

/** Problems with `supabase/config.toml` that could send the dev seed or local settings to the hosted project. */
export function configProblems(toml: string): string[] {
  const problems: string[] = [];
  if (/^\s*\[\s*remotes\b/m.test(toml)) {
    problems.push('config.toml has a [remotes.*] section. That makes the integration apply the seed and config to a hosted project; remove it.');
  }
  const paths = toml.match(/^\s*sql_paths\s*=\s*\[([^\]]*)\]/m)?.[1] ?? '';
  const listed = [...paths.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  for (const path of listed) {
    if (path.replace(/^\.\//, '') !== 'seed.sql') problems.push(`db.seed.sql_paths lists ${path}; only ./seed.sql is allowed, and it has a local-only guard.`);
  }
  return problems;
}

/** The seed has to keep its local-only guard. */
export function seedProblems(seed: string): string[] {
  return seed.includes("super-secret-jwt-token-with-at-least-32-characters-long") && /do\s+\$seed\$/i.test(seed)
    ? []
    : ['supabase/seed.sql lost its local-only guard (the check against the local stack\'s JWT secret).'];
}

/**
 * Problems with the migration files a pull request changes against its base branch.
 * `baseNames` are the migration file names already on the base branch.
 */
export function migrationProblems(changes: Change[], baseNames: string[], read: (path: string) => string): string[] {
  const problems: string[] = [];
  const newest = [...baseNames].sort().at(-1)?.slice(0, 14) ?? '';
  for (const change of changes.filter((c) => c.path.startsWith('supabase/migrations/'))) {
    if (change.status !== 'A') {
      problems.push(
        `${change.path} was ${change.status === 'D' ? 'deleted' : change.status === 'M' ? 'edited' : 'renamed'}. Migrations already on main have run on the hosted database: never change them, add a new migration instead.`,
      );
      continue;
    }
    const match = MIGRATION.exec(change.path);
    if (!match) {
      problems.push(`${change.path}: migration files are named <14-digit timestamp>_<snake_case>.sql.`);
      continue;
    }
    if (match[1]! <= newest) problems.push(`${change.path}: its timestamp must be newer than the newest migration on main (${newest}).`);
    const found = dataChangesIn(read(change.path));
    if (found.length) {
      problems.push(`${change.path} contains ${found.join(', ')}. This runs on real data when merged. If that is intended, add a line "-- allow-data-change: <why it is safe>".`);
    }
  }
  return problems;
}
