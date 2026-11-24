import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configProblems, dataChangesIn, migrationProblems, seedProblems } from '../src/hosted-safety.ts';

const root = resolve(import.meta.dirname, '../../..');
const baseNames = ['20261115000000_initial_schema.sql', '20261122000000_hide_until_date.sql'];
const read = (sql: string) => () => sql;

describe('the repo as it is', () => {
  it('has a safe config.toml and a guarded seed', () => {
    expect(configProblems(readFileSync(resolve(root, 'supabase/config.toml'), 'utf8'))).toEqual([]);
    expect(seedProblems(readFileSync(resolve(root, 'supabase/seed.sql'), 'utf8'))).toEqual([]);
  });
});

describe('configProblems', () => {
  it('rejects a [remotes] section, which would apply the seed and config to a hosted project', () => {
    expect(configProblems('[remotes.production]\nproject_id = "abc"')).toHaveLength(1);
    expect(configProblems('[db.seed]\nenabled = true\nsql_paths = ["./seed.sql"]')).toEqual([]);
  });

  it('rejects any other seed file', () => {
    expect(configProblems('[db.seed]\nsql_paths = ["./seed.sql", "./extra.sql"]')).toHaveLength(1);
  });
});

describe('seedProblems', () => {
  it('requires the local-only guard', () => {
    expect(seedProblems("insert into auth.users values ('dev@example.com');")).toHaveLength(1);
  });
});

describe('dataChangesIn', () => {
  it.each([
    ['alter table public.tasks drop column title;', 'drop column'],
    ['drop table public.tasks;', 'drop table'],
    ['truncate public.tasks;', 'truncate'],
    ['delete from public.tasks where true;', 'delete from'],
    ['update public.tasks set flagged = false;', 'update ... set'],
    ['alter table public.tasks alter column title type varchar(20);', 'alter column ... type'],
  ])('flags %s', (sql, label) => {
    expect(dataChangesIn(sql)).toContain(label);
  });

  it('ignores additive changes and comments', () => {
    expect(dataChangesIn('-- drop table later\ncreate table public.notes (id uuid primary key);\nalter table public.tasks add column note text;')).toEqual([]);
  });

  it('accepts a flagged statement that says why it is safe', () => {
    expect(dataChangesIn('-- allow-data-change: the table is empty\ndrop table public.old;')).toEqual([]);
    expect(dataChangesIn('-- allow-data-change:\ndrop table public.old;')).toEqual(['drop table']);
  });
});

describe('migrationProblems', () => {
  it('accepts a new, newer, additive migration', () => {
    const path = 'supabase/migrations/20261123000000_backup_role.sql';
    expect(migrationProblems([{ status: 'A', path }], baseNames, read('create role backup_reader nologin;'))).toEqual([]);
  });

  it.each(['M', 'D', 'R'] as const)('rejects a migration already on main that was changed (%s)', (status) => {
    expect(migrationProblems([{ status, path: 'supabase/migrations/20261122000000_hide_until_date.sql' }], baseNames, read(''))).toHaveLength(1);
  });

  it('rejects a new migration older than the newest one on main', () => {
    const path = 'supabase/migrations/20261120000000_late.sql';
    expect(migrationProblems([{ status: 'A', path }], baseNames, read('select 1;'))).toHaveLength(1);
  });

  it('rejects a badly named migration and an unflagged data change', () => {
    expect(migrationProblems([{ status: 'A', path: 'supabase/migrations/new.sql' }], baseNames, read('select 1;'))).toHaveLength(1);
    const path = 'supabase/migrations/20261123000000_wipe.sql';
    expect(migrationProblems([{ status: 'A', path }], baseNames, read('delete from public.tasks;'))).toHaveLength(1);
  });

  it('ignores changes outside supabase/migrations', () => {
    expect(migrationProblems([{ status: 'M', path: 'supabase/config.toml' }], baseNames, read(''))).toEqual([]);
  });
});
