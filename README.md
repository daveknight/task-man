# task-man

Personal task manager for todos. "TaskMan" is a working name: it lives in `APP_NAME` (`packages/core/src/app.ts`), and packages use the neutral `@app/*` scope, so renaming is a one-line change. Product plan: [PLAN.md](PLAN.md). Deferred ideas: [BACKLOG.md](BACKLOG.md).

## Layout

| Path | What |
|---|---|
| `packages/core` | UI-free shared rules (`sectionFor`, board order, dates, sort keys, transitions, validation) and the JSON test vectors in `vectors/` that the Swift port will reuse |
| `packages/tokens` | Design tokens (light and dark colors from Apple's system palette, type scale, spacing, row heights) and the Phosphor/SF Symbols icon map. `npm run generate -w @app/tokens` writes `generated/tokens.css` and the Tailwind theme `generated/tailwind.css` |
| `packages/data` | Supabase reads and writes shared by the CLI and the web app (`loadSnapshot`, `writeChange`, `insertTask`, `searchTasks`, row mapping) |
| `apps/cli` | Agent and seeding CLI: every Phase 1a action, through the same `core` rules and `@app/data` writes as the app. Local Supabase only |
| `apps/web` | Vite + React with shadcn/ui on Base UI (components in `src/components/ui`, owned by us), Tailwind on the tokens, Phosphor icons. Login screen (email and password, password reset, sign out); signs in as the dev user in local dev; the board, task sheet, search and Trash. Static Phase 1a design screens at `/design` in dev |
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

To see the real login screen locally, open http://127.0.0.1:5179/?autosignin=off (or choose Sign out in the board menu, which does the same until you open `?autosignin=on`). Production builds never sign in automatically, and the dev credentials are only ever in `.env.development` and `.env.localpreview`. Password reset emails land in the local Mailpit inbox at http://127.0.0.1:54324.

## CLI

`npm run -s cli -- <command> [--today <date>] [--json]` (`-s` keeps npm's banner out of JSON output).

```
seed [--file seed/tasks.json] [--reset]   load fixtures, dates relative to today
reset                                     wipe all data for the dev user
board [--completed] [--trash]             the main view, grouped and ordered like the app
export / import <file> [--reset]          JSON backup and restore
add "Title" [--desc] [--start] [--hide-until] [--due] [--status] [--flag] [--subtask "x" ...] [--tags a,b]
     [--repeat daily|weekly|monthly|yearly|weekdays|none] [--repeat-mode schedule|after_completion|dates]
     [--interval N] [--by-weekday mon,wed] [--monthly 31|last|2nd tue] [--dates d,d] [--start-offset N|none] [--ends never|<date>|count:N]
show <task>                               fields, placement and the actions the app offers
edit <task> [--title] [--desc] [--start <date>|none] [--hide-until <date>|none] [--due <date>|none] [--flag|--no-flag] [--tags a,b]
     [--repeat ...] [--repeat-mode ...] [--interval N] [--by-weekday mon,wed] [--monthly ...] [--dates d,d] [--start-offset N|none] [--ends ...]
     [--add-subtask "x" ...] [--done-subtask <ref> ...] [--undone-subtask <ref> ...] [--rename-subtask <ref>=<title> ...] [--remove-subtask <ref> ...] [--move-subtask <ref>=<position> ...]
status <task> open|in_progress|waiting [--hide-until <date>|none]
act <task> <action> [--date <date>]       a row action: due.tomorrow, due.skip, moveToWaiting --hide-until +3d, moveToInProgress, ...
move <task> --top | --before <task> | --after <task>
done [--on <date>] / skip [--on <date>] / undone / history / delete [--forever] / restore <task>
purge-trash                               remove Trash older than 30 days
search "query" [--completed] [--flagged] [--tag <name> ...]
capture "note" [--provider gemini|claude|openai] [--apply]
capture --example <id> [--apply]
capture "note" --reply <file> [--apply]
tags                                      every tag with how many tasks still to do have it
tags rename <tag> <new name> / tags delete <tag>
```

`<task>` is an id, an id prefix, or a title prefix. `npm run -s cli -- --help` lists everything. Only Ready and Upcoming tasks have a start date, and only Waiting tasks have a hide-until date: `--start` on a Waiting or In Progress task fails, as does `--hide-until` on any other task. Status changes never ask: going into Waiting or In Progress clears the start date, leaving Waiting clears the hide-until date, and going into Waiting with no `--hide-until` is Don't hide. Only `move <task> --upcoming` for a task due today or earlier still asks (exit code 2) unless `--clear-due` answers it. A subtask `<ref>` is its position (1 is the top), an id prefix, or a title prefix, always read against the list as it was before the edit; renames and ticks apply first, then removals, then adds, then moves (`<position>` is the final place, 1 is the top). `show` and `board --json` list each task's subtasks and a `subtaskCount` of `done` and `total`. A repeat is one rule on the task. `--repeat` sets daily, weekly, monthly, yearly or weekdays (Mon–Fri); `--repeat-mode` picks schedule (by due date), after_completion or dates. `--monthly` is a day (`31` or `last`) or an nth weekday (`2nd tue`). `--ends` is never, a date (that day is included) or `count:N` (completions and skips). `--start-offset N` shows the task N days before each due date (`0` means the due date; leaving it off means no start date). A repeat with no due date uses today, or the first listed date. `done --on` and `skip --on` record that calendar day, and both follow `--today` when `--on` is left off. `history` lists the task's occurrences, oldest first. `undone` restores the latest one until the task is edited. `export` writes backup version 2 (with subtasks and, when present, completion history; older backups import without any); `import` also reads version 1. `--tags a,b` gives a task exactly these tags (`--tags ""` clears them) and creates any that don't exist; a tag name is unique ignoring case, at most 30 characters, with no comma. `search --tag` repeats, and a task must have every tag given (AND). `show`, `board --json` and every change report list a task's tags in the order they were added; `tags delete` removes the tag from every task and leaves the tasks. Backups include the tag list and each task's tags too.

`capture` prints proposed new tasks as JSON and saves nothing unless `--apply`. `--example` replays one row of `seed/capture-examples.json` and `--reply` replays a saved model reply; neither calls a provider. Only the create rows can be saved. Update, append-note, no-match, and ambiguous rows are fixtures for later slices: replaying them prints no tasks, and `--apply` still saves nothing. A live capture goes through the local `parse-capture` Edge Function, which holds the provider key. With no key set it reports that capture isn't set up and still saves nothing.

`--today` takes `YYYY-MM-DD` or a date relative to the real today (`+1d`, `-2w`, `+1m`). The CLI refuses any Supabase URL that isn't localhost.

## Tests

| Command | Needs Supabase | Checks |
|---|---|---|
| `npm test` | no | core vectors and unit tests; tokens (generated CSS is current, every declared text pair reaches 4.5:1 in light and dark, and the listed exact-Apple exceptions stay at 2:1 or more); seed expectations at the pinned Wednesday (2026-11-18) and Saturday (2026-11-21) |
| `npm run typecheck` | no | all packages |
| `npm run check:hosted -- --base origin/main` | no | the hosted-safety guard: existing migrations unchanged, new ones newer and free of unflagged data changes, no `[remotes]` in `config.toml`, the seed's local-only guard |
| `npm run db:reset && npm run db:lint` | yes | every migration applies from scratch; Supabase linter |
| `npm run test:db` | yes | RLS on every table as real signed-in users, `user_id default auth.uid()`, trigger-set `updated_at`, start ≤ due, start only on Open and hide-until only on Waiting, completion uniqueness, tombstones, byte-wise sort keys; `search_tasks` (own tasks only, never Trash, literal `%` and `_`, tag filter that needs every tag) and the tag commands and `purge_trash` (30 days, not callable by users, scheduled daily) |
| `npm run check:seed -- 2026-11-18 2026-11-21` | yes | seeds through the real CLI and compares `board --json` with every `expect` in `seed/tasks.json` |
| `npm run e2e -w @app/web` | yes | Playwright against the dev server at the pinned Wednesday: the board matches `board --json`, and the main actions (complete and undo, presets, subtasks, tags, repeating complete/skip/undo, Waiting picker, drag-and-drop, quick add, sheet edits, search, Trash) in light, dark and on an iPhone-sized touch screen. Uses the installed Google Chrome |

CI (`.github/workflows/ci.yml`) runs all of these. The end-to-end suite is split across two jobs so they run in parallel (light and phone with the database checks, dark in its own job), and pull requests that change only docs, `.cursor/` or the keep-alive workflow skip the two local-Supabase jobs, which then report as skipped (passing). Core tests and Hosted safety always run.

## Design

shadcn/ui components are added with `npx shadcn@latest add <name>` from `apps/web` (`components.json` uses the Base UI base and Phosphor icons). Colors, sizes and spacing come only from `@app/tokens`: change `packages/tokens/src/tokens.ts`, run `npm run generate -w @app/tokens`, and commit the generated files. Text colors must be listed in `textPairs` so the contrast test covers them, or in `exactApplePairs` when they're Apple's exact colors used as Apple uses them. The Appearance setting (System, Light, Dark) is in the board's menu and stored in `localStorage`.

## Product defaults that may change

`packages/core/src/policy.ts` holds them, pinned by `vectors/transitions.json`:

- Move to In Progress (formerly Resume) sends a waiting task to In Progress (`resumeStatus`).
- Moving the due date earlier than the start date moves the start date to match (`dueBeforeStart`).

## Going live

Hosted Supabase, the Vercel deploy and how migrations reach the real database: [docs/go-live.md](docs/go-live.md). Read it before adding a migration, because every migration merged to `main` runs on the hosted database. `npm run check:hosted` runs the guard that CI applies.

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
