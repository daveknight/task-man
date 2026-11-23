/**
 * Backup and restore over a direct Postgres connection. Usage:
 *   BACKUP_DATABASE_URL=... npm run backup:export -- --out backup/tasks.json
 *   RESTORE_DATABASE_URL=... npm run backup:restore -- --file backup/tasks.json --user-email you@example.com --yes [--replace]
 * The export only reads (use the read-only `backup_reader` role). The restore writes one user's
 * tasks and positions in a single transaction, so it either completes or changes nothing.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { exportFromDatabase, restoreToDatabase } from '../src/backup-db.ts';
import type { Backup, BackupV1 } from '../src/backup.ts';

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    out: { type: 'string' },
    file: { type: 'string' },
    'user-email': { type: 'string' },
    replace: { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
  },
});
const cwd = process.env.INIT_CWD ?? process.cwd();

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}.`);
  return value;
}

try {
  if (command === 'export') {
    if (!values.out) throw new Error('Pass --out <file>.');
    const backup = await exportFromDatabase(need('BACKUP_DATABASE_URL'));
    const file = resolve(cwd, values.out);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(backup, null, 2)}\n`);
    console.log(`Backed up ${backup.tasks.length} tasks and ${backup.positions.length} positions to ${file}`);
  } else if (command === 'restore') {
    if (!values.file || !values['user-email']) throw new Error('Pass --file <backup.json> and --user-email <email>.');
    if (!values.yes) throw new Error('Restoring writes to the database in RESTORE_DATABASE_URL. Pass --yes to go ahead.');
    const backup = JSON.parse(readFileSync(resolve(cwd, values.file), 'utf8')) as Backup | BackupV1;
    const result = await restoreToDatabase(need('RESTORE_DATABASE_URL'), backup, { userEmail: values['user-email'], replace: values.replace });
    console.log(`Restored ${result.tasks} tasks and ${result.positions} positions for ${values['user-email']}.`);
  } else {
    throw new Error('Usage: backup.ts export --out <file> | backup.ts restore --file <file> --user-email <email> --yes [--replace]');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
