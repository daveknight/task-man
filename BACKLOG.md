# Backlog

Ideas deferred until the phased plan is working. Add new ones here.

## Views

- **Month calendar view.** A month grid showing which days have tasks due, with a count or dots per day. Tapping a day drills into that day's due tasks; swiping changes months. Recurring tasks show their current occurrence, and optionally projected future occurrences in a lighter style.
- **Board (column) view.** The same sections laid out as horizontal columns instead of stacked vertically, with drag-and-drop between columns to change status. Its order lives in `task_positions` under its own `view_id`, separate from the list's order.
- **Filtered or saved views:** by tag, due this week, has attachments, and so on, each keeping its own order.

## Sign-in

Email and password is the only method until the app is working end to end.

- Sign in with Apple, a natural fit once the native apps exist.
- Sign in with Google.
- Magic link (emailed sign-in link).
- Passkeys.
- Face ID or Touch ID to unlock the native app.

## Capture and convenience

- **Import from TickTick:** read TickTick's backup export and bring over tasks, tags, subtasks, descriptions, repeat rules and completed history.

- Natural-language dates in quick add ("pay rent fri", "start dec 1").
- Share Sheet and Siri or Shortcuts capture on iOS and macOS, feeding the AI capture review sheet.
- Capture from the terminal tool and the MCP server through the same `parse-capture` function.
- Edit by voice: "push the dentist to next week" changes existing tasks, with the same review step.
- Home Screen and Lock Screen widgets.
- Keyboard shortcuts on macOS and the web.

## Tracking and history

- **Completed log:** a "what I finished" view grouped by day and week, including each recurring task's completion history.
- Simple stats: completed per week, and average time spent waiting.

## Integrations

- Calendar subscription feed (ICS), so due dates show up in Apple Calendar or Google Calendar.
- Email a task in through a private forwarding address.
- Location-based reminders on iOS.
- App icon badge count on iOS and macOS (for example, overdue tasks plus waiting tasks that need follow-up).

## Task editing

- **Undo for everything:** delete, status changes and drag moves, not just completing.
- **Bulk select:** complete, delete, flag or set a date on several tasks at once.
- **Overdue visibility:** Ready is ordered by hand, so overdue tasks can sink. Add an overdue count in the header, or a one-tap "Due" filter.

- Customize the swipe buttons and their presets (TickTick's "long press to customize").

- Duplicate a task.
- Turn a subtask into a task, or a task into a subtask.
- Richer description formatting: clickable links, bold and italic, checklist lines.

## Terminal and agent access

- **Everyday terminal interface.** Grow the testing CLI into a tool for daily use against your real account: `tt` to print the board as a readable table, plus `tt add`, `tt edit`, `tt done`, `tt search`, `tt show`. It signs in as you (stored token) rather than with the testing CLI's admin key, can never run `seed` or `reset` against real data, and keeps `--json` for scripting.
- **MCP server for AI agents.** Exposes the same operations as tools (`get_board`, `search_tasks`, `get_task`, `add_task`, `update_task`, `complete_task`, `skip_occurrence`, `delete_task`, `restore_task`) so an agent in Cursor, Claude or ChatGPT can read and manage your tasks. It is built on the same shared rules package as the CLI so sections and recurrence behave identically. It authenticates with a personal access token you can revoke. It can run locally (stdio) or hosted as a Supabase Edge Function, which the free plan covers. Destructive tools (delete, emptying the trash) should ask for confirmation.

## Waiting

- **Blocked by another task:** a task waits on another task and returns to Ready automatically when that task is completed.
- A "people" list for the "waiting on" field, so you can search "everything I'm waiting on from Alex."
