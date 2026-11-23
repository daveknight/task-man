# Going live: hosted Supabase and Vercel

Everything here uses Supabase's free plan and Vercel's free Hobby plan. Development and tests only ever use **local** Supabase. Nothing in the repo reads or writes the hosted project's data: the web app talks to it as the signed-in user, and database changes arrive only as migrations.

| Piece | Where | How it gets there |
|---|---|---|
| Web app | Vercel project `task-man`, free `*.vercel.app` address | Vercel builds `main` on every push, using [`apps/web/vercel.json`](../apps/web/vercel.json) |
| Database schema | Supabase project `aihwgaginnmrrcasmhwt` | The Supabase GitHub integration applies `supabase/migrations/` when something merges to `main` |
| Auth settings (sign-ups off, redirect URLs) | Supabase dashboard | By hand, once (below). `supabase/config.toml` is local only |
| Your user | Supabase dashboard | By hand, once |

## Vercel

- **Root Directory** is `apps/web` (already set). Vercel finds the npm workspaces lockfile at the repo root, installs there and runs the Vite build. [`apps/web/vercel.json`](../apps/web/vercel.json) only adds the single-page-app rewrite, caching and security headers; it deliberately sets no build, install or output settings. Keep it in `apps/web`, the project's root directory. Node.js 22.x.
- **Environment Variables**, **Production only**: `VITE_SUPABASE_URL` (the Project URL) and `VITE_SUPABASE_ANON_KEY` (the anon or publishable key). Both are public by design. Never put the `service_role` or secret key anywhere in Vercel.
- Preview deployments have no Supabase variables on purpose, so a pull request preview can't reach real data; the app says it has no Supabase address. A Production build without the variables fails with a message saying so.
- The service worker (`sw.js`) is served with no caching, so a new deploy reaches installed copies on their next open.
- If the `.vercel.app` address asks for a Vercel login, turn off Deployment Protection for Production.

## Supabase dashboard, once

1. **Authentication**, **Sign In / Providers**, **Email**: turn off **Allow new users to sign up**. This is not covered by migrations or `config.toml`, so do it before sharing the address.
2. **Authentication**, **Users**, **Add user**, **Create new user**: your email and password, tick **Auto Confirm User**.
3. **Authentication**, **URL Configuration**: **Site URL** `https://<your-address>.vercel.app`, and add `https://<your-address>.vercel.app/**` under **Redirect URLs**. Password reset links return there.
4. Password reset emails use Supabase's built-in sender, which is limited to a few emails an hour and to your own team's addresses. That's fine for one user.

## How migrations reach the hosted database

**Project Settings**, **Integrations**, **GitHub Integration**: repository `daveknight/task-man`, working directory `.`, **Deploy to production** on with branch `main`, **Automatic branching** off (it needs the paid plan). The first merge to `main` after connecting applies every migration not yet in the hosted history, in filename order.

Because each merge deploys to the real database, CI runs `npm run check:hosted` (see `apps/cli/src/hosted-safety.ts`) on every pull request:

- A migration already on `main` can't be edited, renamed or deleted. The hosted history already holds it, and a missing file fails the deploy.
- A new migration's timestamp must be newer than the newest one on `main`.
- Statements that remove or rewrite data (`drop table`, `drop column`, `drop schema`, `truncate`, `delete from`, `update ... set`, `alter column ... type`) fail unless the file carries a line `-- allow-data-change: <why this is safe>`. Read any PR that has one before merging.
- `supabase/config.toml` may not have a `[remotes.*]` section (it would let the integration apply the seed and config to production), and the seed list may only contain `seed.sql`.
- `supabase/seed.sql` creates the local dev user. It only runs on the local stack (it checks for the local JWT secret), and the integration ignores it for production anyway. Never run `supabase db reset --linked` or `supabase db push --include-seed`.

Free projects have no preview branches, so a failing migration shows up only **after** the merge, as a red "Supabase Preview" check on the merge commit in GitHub (the dashboard shows no error). Each migration runs in one transaction, so nothing is half-applied, but later migrations wait until the failing one is fixed. Fix it with a new migration (or, if it never applied, by correcting the file) and merge again. Don't make "Supabase Preview" a required check: on the free plan it is always skipped.

`pg_cron` is the one extension that can behave differently on hosted. If its migration fails, enable it under **Database**, **Extensions**, then push an empty commit to `main` to retry.

### Applying a risky migration by hand

If a migration needs care, turn **Deploy to production** off, merge it, and apply it yourself from your machine:

```bash
supabase link --project-ref aihwgaginnmrrcasmhwt   # asks for the database password
supabase db push                                    # shows what it will apply and asks first
```

then turn **Deploy to production** back on.
