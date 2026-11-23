# TaskMan backup

Private repo. It holds a nightly JSON backup of the TaskMan database and the two scheduled jobs that make it. Nothing else lives here.

| File | What |
|---|---|
| `.github/workflows/nightly-backup.yml` | Every night at 09:23 UTC: exports the database with the read-only `backup_reader` role and commits `backup/tasks.json`. |
| `.github/workflows/keep-alive.yml` | Every day: one tiny request to the Supabase API, so the free project is never paused for inactivity. |
| `backup/tasks.json` | The latest backup (version 2: tasks, including completed and Trash, and the board order). Git history keeps the earlier ones. |

Secrets (Settings, Secrets and variables, Actions):

| Secret | Value |
|---|---|
| `BACKUP_DATABASE_URL` | The Supabase **Session pooler** connection string for the `backup_reader` role (user `backup_reader.<project-ref>`) |
| `SUPABASE_URL` | The project URL |
| `SUPABASE_ANON_KEY` | The anon or publishable key (public by design; only used for the keep-alive request) |

GitHub emails you when a scheduled run fails. Run either workflow by hand from the Actions tab.

## Restoring

The restore tool is in the [task-man](https://github.com/daveknight/task-man) repo and is tested in its CI against a wiped local database (seed, export, wipe, restore, export, compare).

1. Have a Supabase project with the migrations applied and your user created (a new project, if the old one is gone: link it and run `supabase db push`, then Authentication, Users, Add user).
2. Get the **Session pooler** connection string for the `postgres` role from Supabase (Connect), with your database password filled in.
3. From a clone of task-man (`npm ci` first):

```bash
RESTORE_DATABASE_URL='postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres' \
  npm run backup:restore -- --file ../task-man-backup/backup/tasks.json --user-email you@example.com --yes
```

It refuses if your user already has tasks; add `--replace` to delete those first. It restores in one transaction, so a failure changes nothing. To restore an older night, check out that commit of this repo first.
