# task-man

Personal task manager for todos. "TaskMan" is a working name: it lives in `APP_NAME` (`packages/core/src/app.ts`), and packages use the neutral `@app/*` scope, so renaming is a one-line change. Product plan: [PLAN.md](PLAN.md). Deferred ideas: [BACKLOG.md](BACKLOG.md).

## Layout

| Path | What |
|---|---|
| `packages/core` | UI-free shared rules (`sectionFor`, board order, dates, sort keys, transitions, validation) and the JSON test vectors in `vectors/` that the Swift port will reuse |
| `packages/tokens` | Design tokens (light and dark colors from Apple's system palette, type scale, spacing, row heights) and the Phosphor/SF Symbols icon map. `npm run generate -w @app/tokens` writes `generated/tokens.css` and the Tailwind theme `generated/tailwind.css` |
| `packages/data` | Supabase reads and writes shared by the CLI and the web app (`loadSnapshot`, `writeChange`, `insertTask`, `searchTasks`, row mapping) |
| `apps/cli` | Agent and seeding CLI: every Phase 1a action, through the same `core` rules and `@app/data` writes as the app. Local Supabase only |
| `apps/web` | Vite + React with shadcn/ui on Base UI (components in `src/components/ui`, owned by us), Tailwind on the tokens, Phosphor icons. Signs in as the dev user in dev; the board, task sheet, search and Trash. Static Phase 1a design screens at `/design` in dev |
| `supabase/` | Local Supabase config, migrations, and `seed.sql` (the dev user) |
| `seed/` | Fixture tasks with hand-written expectations, and AI-capture examples |

## Getting started

Needs Node 22+, Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). Everything runs against **local Supabase**; nothing here touches real data or a paid plan.

```bash
npm install
npm run db:start                            # local Supabase in Docker; applies migrations and the dev user
npm run -s cli -- seed --reset --today 2026-11-18
npm run -s cli -- board --today 2026-11-18  # add --json for machine-readable output
npm run web                                 # http://127.0.0.1:5179/?today=2026-11-18
```

Design screens (no database needed): `npm run web`, then open http://127.0.0.1:5179/design. They render `seed/tasks.json` at the pinned Wednesday (override with `?today=`). With the dev server running, `npm run screenshots -- --out <dir>` saves every screen in light and dark at desktop and iPhone sizes (uses the installed Google Chrome; set `CHROME_PATH` to use another).

To try the installable app (manifest, service worker, offline read-only mode), stop the dev server and run `npm run preview:local -w @app/web`: a production build against local Supabase, signed in as the dev user, on the same port. Offline, it opens with the last-loaded board and a banner, and nothing can be changed until it's back online. The app icon is `apps/web/public/icon.svg`; after changing it, `npm run icons -w @app/web` renders the PNG sizes.

The dev user is `dev@example.com` / `dev-password` (local only). The web app signs in as it automatically in `vite dev`, so every query runs through row-level security exactly as in production.

## CLI

`npm run -s cli -- <command> [--today <date>] [--json]` (`-s` keeps npm's banner out of JSON output).

```
seed [--file seed/tasks.json] [--reset]   load fixtures, dates relative to today
reset                                     wipe all data for the dev user
board [--completed] [--trash]             the main view, grouped and ordered like the app
export / import <file> [--reset]          JSON backup and restore
add "Title" [--desc] [--start] [--due] [--status] [--flag]
show <task>                               fields, placement and the actions the app offers
edit <task> [--title] [--desc] [--start <date>|none] [--due <date>|none] [--flag|--no-flag]
status <task> open|in_progress|waiting [--start clear|keep|<date>|none]
act <task> <action> [--date <date>]       a row action: due.tomorrow, waitUntil.saturday, moveToInProgress, ...
move <task> --top | --before <task> | --after <task>
done / undone / delete [--forever] / restore <task>
purge-trash                               remove Trash older than 30 days
search "query" [--completed] [--flagged]
```

`<task>` is an id, an id prefix, or a title prefix. `npm run -s cli -- --help` lists everything. A status change that would change a date without asking fails with the question and exit code 2 unless `--start` answers it.

`--today` takes `YYYY-MM-DD` or a date relative to the real today (`+1d`, `-2w`, `+1m`). The CLI refuses any Supabase URL that isn't localhost.

## Tests

| Command | Needs Supabase | Checks |
|---|---|---|
| `npm test` | no | core vectors and unit tests; tokens (generated CSS is current, every declared text pair reaches 4.5:1 in light and dark, and the listed exact-Apple exceptions stay at 2:1 or more); seed expectations at the pinned Wednesday (2026-11-18) and Saturday (2026-11-21) |
| `npm run typecheck` | no | all packages |
| `npm run db:reset && npm run db:lint` | yes | every migration applies from scratch; Supabase linter |
| `npm run test:db` | yes | RLS on every table as real signed-in users, `user_id default auth.uid()`, trigger-set `updated_at`, start ≤ due, completion uniqueness, tombstones, byte-wise sort keys; `search_tasks` (own tasks only, never Trash, literal `%` and `_`) and `purge_trash` (30 days, not callable by users, scheduled daily) |
| `npm run check:seed -- 2026-11-18 2026-11-21` | yes | seeds through the real CLI and compares `board --json` with every `expect` in `seed/tasks.json` |
| `npm run e2e -w @app/web` | yes | Playwright against the dev server at the pinned Wednesday: the board matches `board --json`, and the main actions (complete and undo, presets, Waiting picker, drag-and-drop, quick add, sheet edits, search, Trash) in light, dark and on an iPhone-sized touch screen. Uses the installed Google Chrome |

CI (`.github/workflows/ci.yml`) runs all of these.

## Design

shadcn/ui components are added with `npx shadcn@latest add <name>` from `apps/web` (`components.json` uses the Base UI base and Phosphor icons). Colors, sizes and spacing come only from `@app/tokens`: change `packages/tokens/src/tokens.ts`, run `npm run generate -w @app/tokens`, and commit the generated files. Text colors must be listed in `textPairs` so the contrast test covers them, or in `exactApplePairs` when they're Apple's exact colors used as Apple uses them. The Appearance setting (System, Light, Dark) is in the board's menu and stored in `localStorage`.

## Product defaults that may change

`packages/core/src/policy.ts` holds them, pinned by `vectors/transitions.json`:

- Move to In Progress (formerly Resume) sends a waiting task to In Progress (`resumeStatus`).
- A non-interactive move into Waiting with a future start date clears it (`enterWaitingDefault`); the app always shows the Hide until picker instead.
- Moving the due date earlier than the start date moves the start date to match (`dueBeforeStart`).

## Environment notes (cloud agents)

A fresh Ubuntu VM needs Docker and the Supabase CLI:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# If dockerd isn't managed by systemd: sudo dockerd > /var/log/dockerd.log 2>&1 &
# Leftover legacy iptables rules with FORWARD DROP block container-to-container traffic
# (symptom: `supabase start` fails with DbSetupError / realtime "connection not available"):
sudo iptables-legacy -P FORWARD ACCEPT
V=3.1.0; curl -fsSL -o /tmp/supabase.deb "https://github.com/supabase/cli/releases/download/v$V/supabase_${V}_linux_amd64.deb" && sudo dpkg -i /tmp/supabase.deb
```
