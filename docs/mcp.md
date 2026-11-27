# Task MCP server

Agents call TaskMan over HTTP. The server is `apps/mcp`. It uses the same task rules as the app and the same reads and writes as the CLI. It does not upload or download files, reorder tasks, or send reminders.

The URL is not live until the Vercel project below exists. After that project is deployed, the address is its production URL plus `/mcp`. Name the project `task-man-mcp` and the address is:

`https://task-man-mcp.vercel.app/mcp`

If Vercel adds a suffix because that name is taken, use the production URL shown on the project, still with `/mcp` on the end. Locally, with the server started as below, the address is `http://127.0.0.1:8787/mcp`.

## The access token

Every request needs the signed-in user's Supabase **access token**. The server checks that token with Supabase Auth and sends it on every read and write, so row-level security applies. A request with no token is rejected. A service-role key is rejected too. Do not put a service-role key in the client or in the server's environment.

The access token expires (Supabase's default is one hour). This server does not take the refresh token. Sign in again and send the new access token.

Get one with the hosted project's URL and anon key (the same public values as the web app's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`):

```bash
curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}'
```

The `access_token` field in the JSON is the token. Send it on every request:

```
Authorization: Bearer <access_token>
```

A Cursor MCP config, once the Vercel URL is live:

```json
{
  "mcpServers": {
    "taskman": {
      "url": "https://task-man-mcp.vercel.app/mcp",
      "headers": {
        "Authorization": "Bearer <access_token>"
      }
    }
  }
}
```

Replace the URL if the project name differs, and replace the token when it expires.

## Tools

| Tool | What it does |
|---|---|
| `board` | The board for a day. Leave `today` out for the Pacific calendar day. Completed and Recently deleted are not included |
| `task` | One task, by id, id prefix (4 or more characters), or title prefix |
| `search` | Titles, descriptions, and tag names. Never Recently deleted. `tags` is AND |
| `history` | Field changes, plus Done and Skipped, oldest first |
| `create_task` | A new task. Optional description, status, flag, start, due, Hide until, repeat, tags, and subtasks |
| `update_task` | Change any of those fields. Only the fields you send are written |
| `complete_task` | Mark done. A repeat records the occurrence and advances |
| `skip_task` | Skip the current occurrence of a repeat |
| `undo_task` | Undo the latest Done or Skipped occurrence. A one-off completed task is marked not done |
| `list_attachments` | Name, type, and size of files on a task. No upload and no download |

Dates are `YYYY-MM-DD`, `today`, or relative (`+3d`, `-2w`, `+1m`). `none` clears a date. Only an Open task has a start date. Only a Waiting task has a Hide until date. Going into Waiting with no Hide until date is Don't hide. Tags replace the whole set; an empty list removes them.

Reordering, file bytes, and reminders are not tools. A webhook that posts history changes is not part of this server.

## Run it locally

Local Supabase has to be up (`npm run db:start`). The anon key is in `supabase status`.

```bash
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_ANON_KEY="<anon key from supabase status>"
npm run start -w @app/mcp
```

That listens on `http://127.0.0.1:8787/mcp`. Sign in as the dev user (`dev@example.com` / `dev-password`) with the curl above to get a local access token. Nothing here talks to the hosted database unless you point `SUPABASE_URL` at it yourself.

## Deploy it beside the web app

The web app stays the Vercel project `task-man` (`apps/web`). This server is a second Vercel project from the same repo, so its URL stays up against the hosted database. Creating that project needs the Vercel account. The steps:

1. In Vercel, **Add New…**, **Project**, and import `daveknight/task-man` (the same repository as the web app).
2. Set the project name to `task-man-mcp`.
3. **Root Directory**: `apps/mcp`. Edit that setting and turn on **Include source files outside of the Root Directory in the Build Step**. The build imports `packages/core`, `packages/data`, and `apps/cli`, which sit outside `apps/mcp`.
4. **Framework Preset**: Other. `apps/mcp/vercel.json` sets the build command to `npm run build`, which writes `.vercel/output` and serves `/mcp`. Leave the install command empty so Vercel installs from the repository lockfile, the same way the web app does. If the build log shows the command running from the repository root instead of `apps/mcp`, set **Build Command** to `npm run build -w @app/mcp`.
5. **Node.js Version**: 22.x.
6. **Environment Variables**, **Production** only:
   - `SUPABASE_URL` — the hosted Project URL, `https://aihwgaginnmrrcasmhwt.supabase.co`
   - `SUPABASE_ANON_KEY` — the anon / publishable key. It is the same value as `VITE_SUPABASE_ANON_KEY` on the web project. Copy the value. Do not reuse the `VITE_` name.
   - Do not add a service-role or secret key. The server never reads one, and it rejects that key if a client sends it.
7. Deploy. The production URL plus `/mcp` is the address in the config above. Preview deployments have no Supabase variables unless you add them, so leave them off previews.

The hosted database is the one that token can read: the access token is a session for your user in project `aihwgaginnmrrcasmhwt`, and row-level security limits every tool to that user's rows.
