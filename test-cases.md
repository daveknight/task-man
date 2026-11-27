# Figma review test cases

The screens and states to capture for each Figma review round. This file is the list of states. For how to capture them and place them in Figma, follow the [`figma-review`](.cursor/skills/figma-review/SKILL.md) skill.

Review rounds happen only when Dave explicitly asks for one. Adding states here as features land doesn't mean capturing them in Figma; that waits for his request. Local screenshots for a PR are fine without it.

## Figma page naming

New review pages are named **`YYYY-MM-DD: {description of phase or PRs}`**, for example `2026-11-20: Open PRs 15–18`. Put the same date on the page as a canvas title. Add a new page for each round and never edit existing pages.

## How to capture

- Run the app against local Supabase, seeded with `npm run -s cli -- seed --reset --today 2026-11-18`, and open the dev server at http://127.0.0.1:5179/?today=2026-11-18.
- Title each frame with its state, in the form `{Area}: {state} – {viewport}, {light|dark}`, for example `Search: query “pa” with results – desktop 1440, dark`.
- Capture every state in light and dark unless the item says otherwise.
- Viewports: **desktop 1440** (two-pane), **overlay 900** (any width from 768 to 1023 px, where the task sheet overlays the board), and **phone** (iPhone 15 Pro, 393 × 852).

Tick a box when a round has the state. Add new states under the right area as features land, and note which PR or phase they came from.


### 2026-11-25

Dave asked this round to capture settled screens and omit in-process motion. A listed state that is only a mid-animation frame stays unchecked, with the reason on the line. The just-dropped highlight is a settled hold of about two seconds, so it is captured.

The preview build (`npm run preview:local -w @app/web`) ignores `?today=`, which only works on the dev server. Offline frames pin the page clock to 2026-11-18 so the seeded board stays on that day.

Some listed states are more than one frame, because one screen cannot show both at once:

- Phone swipe: a Ready row, and a Waiting row.
- Detail pane dates: “Today, Nov 18” on Call the dentist, and “Tomorrow, Nov 19” on Return library books.
- Handle grip: hidden at rest, shown on the hovered row, and shown with keyboard focus.
- Drag grip: the quiet color on a hovered row, and medium grey when the handle itself is hovered, on desktop. On phone the grip column is always visible (`hover: none`), so the phone frames show that column rather than a pointer hover.
- A refused tag name: a comma, and a name over 30 characters.
- Rename: the field, and the duplicate-name reason.
- Task detail: an Open task, a Waiting task, and an In Progress task.
- Hide until: from a Ready row, and from an In Progress row.
- Context menu highlight: a Ready row and a Waiting row. The selected task is shown with the menu open, and again after it closes.
- Phone History: the history screen, and the task after Back.
- A dates repeat: the completed toast, then Undo.
- Ends: “On a date” with the calendar, and “After a count” with the stepper.
- Subtasks card: the overlay, and the phone sheet.
- Presets popover: Daily is selected, because the note “Repeats from the due date” is only rendered once a rule is set.
- Completed row: the settled Completed section. The held row just checked off is the mid-animation state left unchecked above.
- Sections expanded and collapsed: desktop 1440 is the two-pane layout, plus overlay 900 and phone.
- Repeat row read-only: a task in Recently deleted, a completed task, and the offline board, as three frames.


## Board baseline

- [x] Board: no task open, full scroll height – desktop 1440
- [x] Board: no task open, full scroll height – phone
- [x] Sections expanded – desktop 1440, two-pane, overlay 900, phone
- [x] Sections collapsed – desktop 1440, two-pane, overlay 900, phone
- [ ] Section mid-fold, held at half its open height (Ready light, Waiting dark) – desktop 1440 — skipped 2026-11-25: mid-animation only. Dave asked for settled screens.
- [x] Waiting with tasks hidden until a later date – desktop 1440
- [x] Upcoming section – desktop 1440

## Layouts

- [x] Task sheet, two-pane: “Renew passport” open beside the board – desktop 1440
- [x] Task sheet, overlay: “Renew passport” over the board – overlay 900
- [x] Task sheet, bottom sheet: “Renew passport” – phone
- [x] Task sheet stays a bottom sheet when its content is within 75% of the screen – phone
- [x] Task sheet fills the screen when its content is taller than 75% – phone
- [x] Phone board shows no row quick actions – phone
- [x] Phone swipe left on a Ready row: Delete, Move to Waiting, Due; on a Waiting row: Delete, Hide until, Move to In Progress, Due – phone

## Lists and motion

From the list polish PR. All desktop 1440 unless noted.

- [x] Unselected list sits left of center with the pane's room reserved, and doesn't move when “Renew passport” is selected
- [x] Drag handles on every draggable row; hover turns one medium grey – light and dark
- [ ] Drag in progress, picked up by the handle — skipped 2026-11-25: mid-animation only. Dave asked for settled screens.
- [x] Just-dropped row highlighted
- [ ] Delete mid-animation, rows below sliding up — skipped 2026-11-25: mid-animation only. Dave asked for settled screens.
- [x] Detail pane dates: “Today, Nov 18” (dentist), “Tomorrow, Nov 19” (library books)
- [x] Inline title edit with the pane following the typed text
- [x] Handle grip hidden at rest and shown on the hovered row only; shown with keyboard focus – desktop 1440
- [ ] Dragged overlay settling into its new position – desktop 1440 — skipped 2026-11-25: mid-animation only. Dave asked for settled screens.
- [x] Phone board with handle column – phone
- [ ] Task just checked off: struck-through title held in its list (Ready), Completed open below – desktop 1440 — skipped 2026-11-25: mid-animation only. Dave asked for settled screens.
- [ ] Same task folding away while it grows into the top of Completed – desktop 1440 — skipped 2026-11-25: mid-animation only. Dave asked for settled screens.
- [ ] Un-completing from Completed: title held without its strikethrough, then growing back into Ready – desktop 1440 — skipped 2026-11-25: mid-animation only. Dave asked for settled screens.
- [x] Completed rows: check mark proportionate in the circle – light, dark and phone
- [ ] Task checked off with Completed closed: struck-through title held in Ready, then folding away with nothing growing in below (#40) — skipped 2026-11-25: mid-animation only. Dave asked for settled screens.
- [ ] Task checked off on phone: struck-through title held in Ready – phone (#40) — skipped 2026-11-25: mid-animation only. Dave asked for settled screens.
- [ ] Last task in a section checked off: the section folds away with it (In Progress) (#40) — skipped 2026-11-25: mid-animation only. Dave asked for settled screens.
- [x] Drag handle with keyboard focus on the first row of a section: the ring fully inside the rounded corner – light and dark
- [x] Drag grip at rest on a hovered row: the quiet checkbox-ring color, turning medium grey when the handle itself is hovered – light, dark and phone (#40)

## Light and dark

- [x] Every item in this file in both light and dark, unless the item names one theme
- [x] Spot-check that dark frames have no light-only colors, such as a white backdrop or an unreadable tooltip

## Hover states

All desktop 1440.

- [x] Row hover on a Ready task with a due date: Delete, Move to Waiting, then the due date as a button (orange icon and date) – light and dark
- [x] Row hover on a Ready task with no due date: Delete, Move to Waiting, then the Due icon button
- [x] Row hover on an In Progress task: Move to Waiting, then the Due icon button
- [x] Row hover on a Waiting task with no due date: Hide until, Move to In Progress, then the Due icon button (with the “Hide until later” tooltip on the first)
- [x] Row hover on a Waiting task with a due date: the same, ending in the Due button with its date
- [x] Row hover on an Upcoming task: Start, then the Due button
- [x] Due presets: the due date button on “Get car tires rotated”, opened by clicking its date
- [x] Quick actions sit just left of the dates and flag, with the date button last
- [x] Due dates on rows: orange icon the size of the quick-action icons, with overdue red, today blue and plain grey labels – light, dark and phone
- [x] Completed row: due date struck through with the title and a grey icon, no Due button – Completed section, and the held row just checked off

## Editing states

- [x] Inline title edit on a wide desktop (field visibly live) – desktop 1440
- [x] Title edit at overlay width: rows only edit in place from 1024px wide, so the row opens the sheet and the title field is live there – overlay 900
- [x] Tapping a row on phone opens the task instead of editing in place – phone

## Subtasks

Not captured in Figma yet; these are the states to add when Dave asks. The designs are on Figma node 132-2.

- [x] Task sheet with subtasks: “Draft holiday card list” – the Subtasks card with the “N of M” count, a mix of done and not done – desktop 1440
- [x] Subtasks card in the overlay and the phone bottom sheet – overlay 900 and phone
- [x] Adding: tap Add subtask, field live with the hint “Return saves and adds another. Escape finishes.” – desktop 1440
- [x] Editing a subtask title in place (hint showing) – desktop 1440
- [x] A task with none yet: only the Add subtask row, no count – desktop 1440
- [ ] Dragging a subtask by its grip: the lifted row and the drop position – desktop 1440 — skipped 2026-11-25: mid-animation only. Dave asked for settled screens.
- [x] Board rows with subtasks show done/total next to the dates – desktop 1440 and phone
- [x] Hover shows the delete button on a subtask row (fine pointers only) – desktop 1440
- [x] A task in Recently deleted: subtasks visible but read-only, no Add row – desktop 1440
- [x] Offline: subtasks read-only – desktop 1440

## Tags

Not captured in Figma yet; these are the states to add when Dave asks. The designs are on Figma node 132-2. Tags are a neutral grey name-only pill with no colors, and phone rows show no tags. The Figma frames have no rename or delete states; those are filled in from the picker and noted below.

- [x] Board rows with tags: up to two chips, then “+N” for the rest (“Finance quarterly action items” has three) – desktop 1440, light and dark
- [x] A selected row: its chips blend into the selected row – desktop 1440
- [x] Phone board: rows show no tag chips – phone
- [x] Task sheet with tags: the Tags row after Due lists every tag, right-aligned – desktop 1440 and overlay 900
- [x] Task sheet with no tags: the Tags row reads “None” – desktop 1440
- [x] Tag picker popover: search field “Search or create tag”, the tags alphabetically with a blue check on the ones the task has, no counts – desktop 1440, light and dark
- [x] Tag picker with “out” typed: the matching tag, then “Create “out”” in blue – desktop 1440
- [x] Tag picker bottom sheet: centered “Tags” title, blue Done, same list – phone
- [x] Phone task sheet with tags in the Tags row – phone
- [x] A refused name (a comma, or over 30 characters): the reason under the field, no Create row – desktop 1440
- [x] Rename: a row’s ⋯ menu, then the row turns into a field; a duplicate name shows its reason – desktop 1440
- [x] Delete: a row’s ⋯ menu, then the confirmation “Delete “someday”? It comes off N tasks.” with Cancel and Delete tag – desktop 1440
- [x] A task in Recently deleted: tags visible, no picker – desktop 1440
- [x] Offline: the Tags row is read-only – desktop 1440
- [x] Search: the Tags chip beside Only flagged and Include completed – desktop 1440, light and dark
- [x] Search Tags menu open: every tag with its count, a blue check on the selected ones, the note “Shows tasks that have every selected tag.” – desktop 1440, light and dark
- [x] Search with two tags selected: removable blue-outlined chips, results that have both, with their tag chips – desktop 1440
- [x] Search on phone with a tag selected: the chips scroll sideways, results show no tag chips – phone

## Repeats

Not captured in Figma yet; these are the states to add when Dave asks. The picker designs are on Figma node 132-2. The field shows the cadence only (“Weekly on Wed”, “Every 2 weeks on Sun”); the menu writes the weekday out (“Weekly on Wednesday”). Choosing a repeat on a task with no due date sets the due date to today, or to the first listed date. “No due date” is hidden while a repeat is set. Clearing the repeat leaves the start and due dates. Skip this occurrence is a button on the sheet for a repeating task, and it stays in the Due menu. History is not on the sheet: the More menu opens Task Activities, newest first. One card per save, with the account name or You, the time in Pacific, and a short detail. An arrow joins before and after when both exist. An occurrence keeps Undo on the latest row while the task is unedited. A field edit has no undo. The Ends choices “On a date” and “After a count” are filled in (a calendar, and a count stepper starting at 1) because the frames only show the closed menu.

- [x] Task sheet Repeat row reads “None”, and the row has no repeat icon – desktop 1440, light and dark
- [x] Presets popover: Daily, Weekly on that weekday, Monthly on that date, Yearly, Every weekday, Custom…, No repeat, with the note “Repeats from the due date. Next: …” – desktop 1440, light and dark
- [x] A chosen preset stays checked, and the field shortens the weekday (“Weekly on Thu”) – desktop 1440, light and dark
- [x] Custom, By due date: every 2 weeks, Sunday selected, Start early on with Days before due – desktop 1440, light and dark
- [x] Custom monthly: On day N, On the nth weekday, On the last day – desktop 1440
- [x] Custom, After completion: no weekday row, the note counts from the day you complete it – desktop 1440
- [x] Custom, On specific dates: the calendar and the date chips, no Ends row – desktop 1440
- [x] Ends “On a date” shows the calendar; “After a count” shows the stepper – desktop 1440
- [x] A repeating row shows the repeat icon before its date – desktop 1440 and phone
- [x] Phone presets: a bottom sheet, centered “Repeat”, a close button – phone
- [x] Phone custom: back “Repeat”, centered “Custom”, blue Done – phone
- [x] A task in Recently deleted or completed, and offline: the Repeat row is read-only – desktop 1440

Skip is the existing “Skip this occurrence” pick inside Due, shown when the task repeats. Completing or skipping advances the due date and leaves the task open, with the same toast and Undo as a normal completion (`Completed “title”`, or `Skipped “title”`). Undo puts that occurrence back. When the repeat ends, the task completes for good and the row strikes through.

- [x] Complete a repeating Ready task (“Take out garbage”): it leaves Ready for Upcoming, toast “Completed “Take out garbage”” with Undo, no strikethrough – desktop 1440
- [x] Undo that toast: the task is back in Ready on its previous due date – desktop 1440
- [x] Due picker on a repeating row, with “Skip this occurrence” – desktop 1440
- [x] Skip (“Water the plants”): the row stays in Ready on the next due date, toast “Skipped “Water the plants”” with Undo – desktop 1440
- [x] A dates repeat (“Pay estimated quarterly taxes”, brought into Ready): complete, then undo – desktop 1440
- [ ] The last occurrence: the row strikes through and folds away like any completed task – desktop 1440 — skipped 2026-11-25: mid-animation only. Dave asked for settled screens.
- [x] Phone: complete a repeating row, toast with Undo – phone
- [x] Repeating task sheet: “Skip this occurrence” above the fields, and the sheet itself has no History list – desktop 1440, light and dark
- [ ] Task Activities for a task before a later edit: “You created the task” and the title – desktop 1440, light and dark
- [ ] Task Activities after a title edit: “You changed the title”, the old title → the new one – desktop 1440, light and dark
- [ ] Task Activities after two skips: newest first, each skip’s date, Undo on the latest – desktop 1440, light and dark
- [ ] Task Activities after the task was edited: the latest occurrence has no Undo – desktop 1440
- [x] A task that does not repeat: More menu still has History, and there is no Skip button – desktop 1440
- [ ] Phone: History from the task sheet’s More menu opens Task Activities, then back to the task – phone

## Attachments

From the web attachments phase (PLAN.md Phase 3), ahead of the native apps. Photos and other files are added only on the task sheet, through Supabase Storage, from one Add file button on desktop and phone. On a phone the system picker may still offer the camera, the photo library, or files. The board row has no paperclip and no count. Thumbnails stay in the sheet. A photo is downscaled before upload. Settings, from the board menu, shows storage used of 1 GB. A file can be removed. Offline and Recently deleted leave the files read-only. Capture does not add files. A previewable image's name opens a full-screen preview (pinch to zoom on a phone, zoom controls with a mouse, plus Open original and Close). Any other file still opens its signed URL. The address is `/tasks/<taskId>` while a task is open and `/tasks/<taskId>/files/<fileId>` while a previewable image is open, so a link or refresh reopens them. Back closes the preview, then the task, then leaves the board. Forward reopens what Back closed. A file that is not previewable does not change the address. Quick Look waits for the SwiftUI app.

- [x] Task sheet Files, empty: "Files" and Add file – desktop 1440, light and dark
- [x] Task sheet with a photo thumbnail and a named file – desktop 1440, light and dark
- [x] Phone task sheet: one Add file button – phone
- [x] Board row of a task that has a file: no paperclip, no count, no thumbnail – desktop 1440 and phone
- [x] Settings: storage used of 1 GB, with the meter – desktop 1440, light and dark
- [x] Remove a file: the row is gone – desktop 1440
- [x] A task in Recently deleted: Files shows what was attached, with no add or remove – desktop 1440
- [x] Offline: Add file disabled – desktop 1440
- [x] Capture has no way to add a file – desktop 1440
- [ ] Image preview: a photo's name opens full screen, with the picture, zoom, Open original, and Close; a named file still opens directly – desktop 1440, light and dark, and phone

## Dialogs, prompts and pickers

All desktop 1440 unless noted.

- [x] Board ⋯ menu open: Show completed, Completed log, View recently deleted (no icon), Settings, Appearance
- [x] Context menu: right-click a row, Due submenu open
- [x] Context menu: the right-clicked row stays highlighted while the menu is open, here on a Ready and a Waiting row (#39)
- [x] Context menu on the selected task: the row looks selected with the menu open and stays selected after it closes (#39)
- [x] Undo toast after checking off a task, with its X to close – desktop 1440, phone (#40)
- [x] Context menu on a flagged row: “Remove flag”
- [x] Waiting row menu
- [x] Hide until picker from a row (Ready, In Progress)
- [x] Wait until picker: status changed to Waiting in the task sheet
- [x] Upcoming drop prompt: dragging a task due today into Upcoming
- [x] Task detail for an Open, a Waiting and an In Progress task: Start and Due, Hide until and Due, Due only – desktop 1440, light and dark

## Completed log

From Phase 2c. A read-only screen opened from Completed log in the board menu (Show completed still toggles the board section). The address is `/completed`, so a link or refresh opens it. Back returns to the board, and Forward opens the log again. Grouped by Monday-start week, then by day, newest first. The newest week starts open and older weeks start collapsed; each week remembers whether you left it open, including after Back and Forward. One-off finishes and each recorded completion of a repeating task are listed. Skips are not. Rows have a check mark and a struck-through title, no checkbox, drag handle, menu or swipe. A repeating row shows the repeat icon and that occurrence's due date. Nothing here edits a task.

- [x] Completed log: This week open (Pick up dry cleaning on Tue Nov 17, Assemble bookshelf on Mon Nov 16), Last week and older weeks collapsed – desktop 1440, light and dark
- [x] An older week expanded: “Pay November credit card bill” with its due date struck through – desktop 1440
- [x] A repeating completion on Today (“Water the plants”): repeat icon and due date, title struck through, and the task still open on the board – desktop 1440, phone
- [x] Empty: “Nothing finished yet.” – desktop 1440
- [x] Phone: the log under the status bar, week header and rows full width, back returns to the board – phone

## Search

- [x] Search: query “pa” with results – desktop 1440

## Offline

- [x] Offline: read-only board with the offline banner – desktop 1440
- [x] Offline: row hover buttons and checkbox disabled – desktop 1440
- [x] Offline: right-click menu with every item disabled – desktop 1440
- [x] Offline: swipe buttons disabled – phone
- [x] Offline: task sheet with its editing controls disabled – desktop 1440, phone

## Captured so far

| Page | What it covers |
|---|---|
| `2026-11-16 - Plan proposed` | Phase 1a plan |
| `2026-11-17 - Phase 1a review` | Board, task sheet, row actions, prompts and pickers, search, offline, phone |
| `2026-11-18 - Next review: proposals` | Start-decision prompt, current three choices next to the proposed clear-only version, desktop and phone |
| `Open PRs 15–18 — Nov 20, 2026` | Quick actions and Hide until (#15), quick actions layout (#16), inline title edit (#17), section collapse (#18) |
| `2026-11-24: Login, row highlight, completion animation and grip/check polish (#33, #39, #40)` | Everything in this file against current main on local Supabase: 180 frames in nine areas, light and dark, with phone where listed |
| `2026-11-25: main after attachments` | Settled screens on main after attachments, 332 frames. Mid-animation states omitted, per Dave. |

The pages above the Nov 24 one predate the naming rule.

## Login

From Phase 1b. Static screens at `/design/login`, `/design/login-error`, `/design/login-forgot`, `/design/login-sent` and `/design/login-new-password`. All are one centered column, so capture desktop 1440 and phone in light and dark.

The real login screen (the signed-out state) shows locally at `/?autosignin=off`, or after Sign out in the board menu. Plain local dev signs in as the dev user on its own, and hosted builds never do, so a hosted visitor lands on the login screen first. The hosted behavior can't be captured against local Supabase; the signed-out frames stand in for it.

- [x] Login: sign in, empty, with a 32px Sign in button (44px on phone) – desktop 1440, phone
- [x] Login: sign in, email and password typed – desktop 1440, phone
- [x] Login: wrong email or password – desktop 1440, phone
- [x] Login: reset password, opened from Sign in with an email typed (the field already filled) – desktop 1440, phone
- [x] Login: keyboard focus on the password field, ring inside the rounded list, divider full width – desktop 1440, phone
- [x] Login: reset email sent – desktop 1440, phone
- [x] Login: choose a new password – desktop 1440, phone
- [x] Board menu with the account email and Sign out – desktop 1440
