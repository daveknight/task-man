# Task MCP server

Agents call TaskMan over HTTP. The server is `apps/mcp`. It uses the same task rules as the app and the same reads and writes as the CLI. File upload and download use the same private storage bucket and the caller's access token, so row-level security applies. It does not reorder tasks or send reminders.

The URL is not live until the Vercel project below exists. After that project is deployed, the address is its production URL plus `/mcp`. Name the project `task-man-mcp` and the address is:

`https://task-man-mcp.vercel.app/mcp`

If Vercel adds a suffix because that name is taken, use the production URL shown on the project, still with `/mcp` on the end. Locally, with the server started as below, the address is `http://127.0.0.1:8787/mcp`.

## Sign in

Every tool call needs the signed-in user's Supabase **access token**. The server checks that token with Supabase Auth and sends it on every read and write, so row-level security applies. A request with no token is rejected. A service-role key is rejected too. Do not put a service-role key in the client or in the server's environment.

Claude and ChatGPT sign in through the browser. The client opens a page on this server. You enter the TaskMan email and password. Sign-ups stay off. The web app keeps its own login screen. The client then receives that user's access token and refresh token. Later calls send the access token. When it expires (Supabase's default is one hour), the client exchanges the refresh token here, and this server asks Supabase for a new pair. The page asks only for that email and password.

A pasted access token still works, for Cursor and for any client that sends a header instead of signing in. This server does not refresh a pasted token. When it expires, sign in again and send the new one.

Get a pasted token with the hosted project's URL and anon key (the same public values as the web app's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`):

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

## Claude

Claude signs in with the browser page. Leave the connector on the server's own sign-in.

In Claude, open **Customize**, then **Connectors**, then **Add custom connector**. On a Team or Enterprise plan, an Owner adds it under **Organization settings**, **Connectors**, **Add**, **Custom**, **Web**. Name it TaskMan. The server URL is the production address ending in `/mcp`. Leave authentication as the sign-in the server offers. Add the connector. Claude opens a browser to this server. Sign in with the TaskMan email and password, then turn TaskMan on in a chat.

That connector calls the server from Anthropic's cloud, so the URL has to be the public HTTPS address. The local `127.0.0.1` address is unreachable from there. The same sign-in works from the desktop app's config when you want the local server, or when the connector form is not available. Open **Settings**, **Developer**, **Edit Config**. The file is `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS and `%APPDATA%\Claude\claude_desktop_config.json` on Windows. Node has to be installed so `npx` can run. Add this beside any servers already in the file:

```json
{
  "mcpServers": {
    "taskman": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://task-man-mcp.vercel.app/mcp",
        "--transport",
        "http-only"
      ]
    }
  }
}
```

Quit Claude completely and open it again. `mcp-remote` opens the same sign-in page. For the local server, use `http://127.0.0.1:8787/mcp` and add `"--allow-http"` to `args`.

Claude refreshes the token on its own. Sign in again only when Claude asks.

## ChatGPT

ChatGPT and Codex sign in with the same browser page. Leave the bearer-token field empty.

Add TaskMan by its production URL ending in `/mcp`. When ChatGPT asks you to sign in, use the TaskMan email and password. The website and the desktop app both reach a public HTTPS address. The local `127.0.0.1` address works from the desktop app and from Codex on this machine. The website needs the public HTTPS address.

The desktop app reads `~/.codex/config.toml` (on Windows, `%USERPROFILE%\.codex\config.toml`). Leave the bearer token out:

```toml
[mcp_servers.taskman]
url = "https://task-man-mcp.vercel.app/mcp"
```

For the local server, use `http://127.0.0.1:8787/mcp` as the URL. ChatGPT refreshes the token on its own.

A pasted token, if you prefer it for this app, is the section above: set `bearer_token_env_var = "TASKMAN_ACCESS_TOKEN"` and put the raw access token in that variable, with no `Bearer` prefix. The app only sees variables that exist when it starts.

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
| `delete_task` | Move a task to Recently deleted. This is not marking it done. It is not `complete_task`, `skip_task`, or `undo_task`, and it does not delete the task permanently |
| `list_attachments` | Id, name, type, and size of files on a task |
| `upload_attachment` | Add a file. `data` is the bytes as base64. Stored with the caller's access token. Photos are not downscaled |
| `download_attachment` | Read one file. `data` in the result is the bytes as base64. A read: it does not change the task |

Dates are `YYYY-MM-DD`, `today`, or relative (`+3d`, `-2w`, `+1m`). `none` clears a date. Only an Open task has a start date. Only a Waiting task has a Hide until date. Going into Waiting with no Hide until date is Don't hide. Tags replace the whole set; an empty list removes them.

`delete_task` moves the task to Recently deleted by setting the deletion time. The task stays in the account. Delete is not marking the task done, not completing it, not skipping an occurrence, and not undoing one. Use `complete_task` to mark a task done, `skip_task` to skip the current occurrence of a repeat, and `undo_task` to undo the latest Done or Skipped occurrence. A task that is already in Recently deleted is left there. This server has no tool that deletes a task permanently.

`upload_attachment` and `download_attachment` send file bytes as base64. The server stores and reads them with the same Supabase client the other tools use: the caller's access token, the anon key, and the private `attachments` bucket. A service-role key is still rejected. Uploading a file adds one history row that a file was added. Downloading a file writes no history row. Deleting a task adds one history row that the task was deleted, which is a different row from a completion. A task in Recently deleted cannot take a new file. Downloading a file that is already there still works.

Reordering and reminders are not tools. A webhook that posts history changes is not part of this server.

## Run it locally

Local Supabase has to be up (`npm run db:start`). The anon key is in `supabase status`.

```bash
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_ANON_KEY="<anon key from supabase status>"
npm run start -w @app/mcp
```

That listens on `http://127.0.0.1:8787/mcp`. Sign in as the dev user (`dev@example.com` / `dev-password`) with the curl above to get a local access token, or point a client that allows HTTP at that address and use the browser page. Nothing here talks to the hosted database unless you point `SUPABASE_URL` at it yourself.

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
   - Do not add a service-role or secret key. The server never reads one, and it rejects that key if a client sends it. The browser sign-in uses the anon key and the user's password. The sign-in code is stored in the database for a few minutes; that table arrives with the migrations. No other variable is required.
7. Deploy. The production URL plus `/mcp` is the address in the config above. The sign-in page, the token endpoint, and the discovery documents are on that same host. Preview deployments have no Supabase variables unless you add them, so leave them off previews.

The hosted database is the one that token can read: the access token is a session for your user in project `aihwgaginnmrrcasmhwt`, and row-level security limits every tool to that user's rows.
