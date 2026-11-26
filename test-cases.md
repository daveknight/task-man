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

## Board baseline

- [ ] Board: no task open, full scroll height – desktop 1440
- [ ] Board: no task open, full scroll height – phone
- [ ] Sections expanded – desktop 1440, two-pane, overlay 900, phone
- [ ] Sections collapsed – desktop 1440, two-pane, overlay 900, phone
- [ ] Section mid-fold, held at half its open height (Ready light, Waiting dark) – desktop 1440
- [ ] Waiting with tasks hidden until a later date – desktop 1440
- [ ] Upcoming section – desktop 1440

## Layouts

- [ ] Task sheet, two-pane: “Renew passport” open beside the board – desktop 1440
- [ ] Task sheet, overlay: “Renew passport” over the board – overlay 900
- [ ] Task sheet, bottom sheet: “Renew passport” – phone
- [ ] Phone board shows no row quick actions – phone
- [ ] Phone swipe left on a Ready row: Delete, Move to Waiting, Due; on a Waiting row: Delete, Hide until, Move to In Progress, Due – phone

## Lists and motion

From the list polish PR. All desktop 1440 unless noted.

- [ ] Unselected list sits left of center with the pane's room reserved, and doesn't move when “Renew passport” is selected
- [ ] Drag handles on every draggable row; hover turns one medium grey – light and dark
- [ ] Drag in progress, picked up by the handle
- [ ] Just-dropped row highlighted
- [ ] Delete mid-animation, rows below sliding up
- [ ] Detail pane dates: “Today, Nov 18” (dentist), “Tomorrow, Nov 19” (library books)
- [ ] Inline title edit with the pane following the typed text
- [ ] Handle grip hidden at rest and shown on the hovered row only; shown with keyboard focus – desktop 1440
- [ ] Dragged overlay settling into its new position – desktop 1440
- [ ] Phone board with handle column – phone
- [ ] Task just checked off: struck-through title held in its list (Ready), Completed open below – desktop 1440
- [ ] Same task folding away while it grows into the top of Completed – desktop 1440
- [ ] Un-completing from Completed: title held without its strikethrough, then growing back into Ready – desktop 1440
- [ ] Completed rows: check mark proportionate in the circle – light, dark and phone
- [ ] Task checked off with Completed closed: struck-through title held in Ready, then folding away with nothing growing in below (#40)
- [ ] Task checked off on phone: struck-through title held in Ready – phone (#40)
- [ ] Last task in a section checked off: the section folds away with it (In Progress) (#40)
- [ ] Drag handle with keyboard focus on the first row of a section: the ring fully inside the rounded corner – light and dark
- [ ] Drag grip at rest on a hovered row: the quiet checkbox-ring color, turning medium grey when the handle itself is hovered – light, dark and phone (#40)

## Light and dark

- [ ] Every item in this file in both light and dark, unless the item names one theme
- [ ] Spot-check that dark frames have no light-only colors, such as a white backdrop or an unreadable tooltip

## Hover states

All desktop 1440.

- [ ] Row hover on a Ready task with a due date: Delete, Move to Waiting, then the due date as a button (orange icon and date) – light and dark
- [ ] Row hover on a Ready task with no due date: Delete, Move to Waiting, then the Due icon button
- [ ] Row hover on an In Progress task: Move to Waiting, then the Due icon button
- [ ] Row hover on a Waiting task with no due date: Hide until, Move to In Progress, then the Due icon button (with the “Hide until later” tooltip on the first)
- [ ] Row hover on a Waiting task with a due date: the same, ending in the Due button with its date
- [ ] Row hover on an Upcoming task: Start, then the Due button
- [ ] Due presets: the due date button on “Get car tires rotated”, opened by clicking its date
- [ ] Quick actions sit just left of the dates and flag, with the date button last
- [ ] Due dates on rows: orange icon the size of the quick-action icons, with overdue red, today blue and plain grey labels – light, dark and phone
- [ ] Completed row: due date struck through with the title and a grey icon, no Due button – Completed section, and the held row just checked off

## Editing states

- [ ] Inline title edit on a wide desktop (field visibly live) – desktop 1440
- [ ] Title edit at overlay width: rows only edit in place from 1024px wide, so the row opens the sheet and the title field is live there – overlay 900
- [ ] Tapping a row on phone opens the task instead of editing in place – phone

## Subtasks

Not captured in Figma yet; these are the states to add when Dave asks. The designs are on Figma node 132-2.

- [ ] Task sheet with subtasks: “Draft holiday card list” – the Subtasks card with the “N of M” count, a mix of done and not done – desktop 1440
- [ ] Subtasks card in the overlay and the phone bottom sheet – overlay 900 and phone
- [ ] Adding: tap Add subtask, field live with the hint “Return saves and adds another. Escape finishes.” – desktop 1440
- [ ] Editing a subtask title in place (hint showing) – desktop 1440
- [ ] A task with none yet: only the Add subtask row, no count – desktop 1440
- [ ] Dragging a subtask by its grip: the lifted row and the drop position – desktop 1440
- [ ] Board rows with subtasks show done/total next to the dates – desktop 1440 and phone
- [ ] Hover shows the delete button on a subtask row (fine pointers only) – desktop 1440
- [ ] A task in Trash: subtasks visible but read-only, no Add row – desktop 1440
- [ ] Offline: subtasks read-only – desktop 1440

## Tags

Not captured in Figma yet; these are the states to add when Dave asks. The designs are on Figma node 132-2. Tags are a neutral grey name-only pill with no colors, and phone rows show no tags. The Figma frames have no rename or delete states; those are filled in from the picker and noted below.

- [ ] Board rows with tags: up to two chips, then “+N” for the rest (“Finance quarterly action items” has three) – desktop 1440, light and dark
- [ ] A selected row: its chips blend into the selected row – desktop 1440
- [ ] Phone board: rows show no tag chips – phone
- [ ] Task sheet with tags: the Tags row after Due lists every tag, right-aligned – desktop 1440 and overlay 900
- [ ] Task sheet with no tags: the Tags row reads “None” – desktop 1440
- [ ] Tag picker popover: search field “Search or create tag”, the tags alphabetically with a blue check on the ones the task has, no counts – desktop 1440, light and dark
- [ ] Tag picker with “out” typed: the matching tag, then “Create “out”” in blue – desktop 1440
- [ ] Tag picker bottom sheet: centered “Tags” title, blue Done, same list – phone
- [ ] Phone task sheet with tags in the Tags row – phone
- [ ] A refused name (a comma, or over 30 characters): the reason under the field, no Create row – desktop 1440 (not in Figma)
- [ ] Rename: a row’s ⋯ menu, then the row turns into a field; a duplicate name shows its reason – desktop 1440 (not in Figma)
- [ ] Delete: a row’s ⋯ menu, then the confirmation “Delete “someday”? It comes off N tasks.” with Cancel and Delete tag – desktop 1440 (not in Figma)
- [ ] A task in Trash: tags visible, no picker – desktop 1440
- [ ] Offline: the Tags row is read-only – desktop 1440
- [ ] Search: the Tags chip beside Only flagged and Include completed – desktop 1440, light and dark
- [ ] Search Tags menu open: every tag with its count, a blue check on the selected ones, the note “Shows tasks that have every selected tag.” – desktop 1440, light and dark
- [ ] Search with two tags selected: removable blue-outlined chips, results that have both, with their tag chips – desktop 1440
- [ ] Search on phone with a tag selected: the chips scroll sideways, results show no tag chips – phone

## Repeats

Not captured in Figma yet; these are the states to add when Dave asks. The picker designs are on Figma node 132-2. The field shows the cadence only (“Weekly on Wed”, “Every 2 weeks on Sun”); the menu writes the weekday out (“Weekly on Wednesday”). Choosing a repeat on a task with no due date sets the due date to today, or to the first listed date. “No due date” is hidden while a repeat is set. Clearing the repeat leaves the start and due dates. Skip this occurrence is a button on the sheet for a repeating task, and it stays in the Due menu. History is not on the sheet: the More menu opens it, newest first, with Undo on the latest row while the task is unedited. The Ends choices “On a date” and “After a count” are filled in (a calendar, and a count stepper starting at 1) because the frames only show the closed menu.

- [ ] Task sheet Repeat row reads “None”, and the row has no repeat icon – desktop 1440, light and dark
- [ ] Presets popover: Daily, Weekly on that weekday, Monthly on that date, Yearly, Every weekday, Custom…, No repeat, with the note “Repeats from the due date. Next: …” – desktop 1440, light and dark
- [ ] A chosen preset stays checked, and the field shortens the weekday (“Weekly on Thu”) – desktop 1440, light and dark
- [ ] Custom, By due date: every 2 weeks, Sunday selected, Start early on with Days before due – desktop 1440, light and dark
- [ ] Custom monthly: On day N, On the nth weekday, On the last day – desktop 1440
- [ ] Custom, After completion: no weekday row, the note counts from the day you complete it – desktop 1440
- [ ] Custom, On specific dates: the calendar and the date chips, no Ends row – desktop 1440
- [ ] Ends “On a date” shows the calendar; “After a count” shows the stepper – desktop 1440 (not drawn open in Figma)
- [ ] A repeating row shows the repeat icon before its date – desktop 1440 and phone
- [ ] Phone presets: a bottom sheet, centered “Repeat”, a close button – phone
- [ ] Phone custom: back “Repeat”, centered “Custom”, blue Done – phone
- [ ] A task in Trash or completed, and offline: the Repeat row is read-only – desktop 1440

Skip is the existing “Skip this occurrence” pick inside Due, shown when the task repeats. Completing or skipping advances the due date and leaves the task open, with the same toast and Undo as a normal completion (`Completed “title”`, or `Skipped “title”`). Undo puts that occurrence back. When the repeat ends, the task completes for good and the row strikes through.

- [ ] Complete a repeating Ready task (“Take out garbage”): it leaves Ready for Upcoming, toast “Completed “Take out garbage”” with Undo, no strikethrough – desktop 1440
- [ ] Undo that toast: the task is back in Ready on its previous due date – desktop 1440
- [ ] Due picker on a repeating row, with “Skip this occurrence” – desktop 1440
- [ ] Skip (“Water the plants”): the row stays in Ready on the next due date, toast “Skipped “Water the plants”” with Undo – desktop 1440
- [ ] A dates repeat (“Pay estimated quarterly taxes”, brought into Ready): complete, then undo – desktop 1440
- [ ] The last occurrence: the row strikes through and folds away like any completed task – desktop 1440
- [ ] Phone: complete a repeating row, toast with Undo – phone
- [ ] Repeating task sheet: “Skip this occurrence” above the fields, and the sheet itself has no History list – desktop 1440, light and dark
- [ ] More menu, History, before anything is recorded: “No history.” – desktop 1440
- [ ] History after two skips: newest first, “Skipped” with each occurrence’s date, Undo on the latest – desktop 1440, light and dark
- [ ] History after the task was edited: the latest row has no Undo – desktop 1440
- [ ] A task that does not repeat: More menu still has History, and there is no Skip button – desktop 1440
- [ ] Phone: History from the task sheet’s More menu, then back to the task – phone

## Attachments

From the web attachments phase (PLAN.md Phase 3), ahead of the native apps. Photos and other files are added only on the task sheet, through Supabase Storage. The board row has no paperclip and no count. Thumbnails stay in the sheet. A photo is downscaled before upload. Settings, from the board menu, shows storage used of 1 GB. A file can be removed. Offline and Trash leave the files read-only. Capture does not add files. Quick Look waits for the SwiftUI app.

- [ ] Task sheet Files, empty: "Files" and Add photo, Add file – desktop 1440, light and dark
- [ ] Task sheet with a photo thumbnail and a named file – desktop 1440, light and dark
- [ ] Phone task sheet: Camera, Photo library, and File – phone
- [ ] Board row of a task that has a file: no paperclip, no count, no thumbnail – desktop 1440 and phone
- [ ] Settings: storage used of 1 GB, with the meter – desktop 1440, light and dark
- [ ] Remove a file: the row is gone – desktop 1440
- [ ] A task in Trash: Files shows what was attached, with no add or remove – desktop 1440
- [ ] Offline: Add photo and Add file disabled – desktop 1440
- [ ] Capture has no way to add a file – desktop 1440

## Dialogs, prompts and pickers

All desktop 1440 unless noted.

- [ ] Board ⋯ menu open: Show completed, Completed log, Show deleted (no icon), Settings, Appearance
- [ ] Context menu: right-click a row, Due submenu open
- [ ] Context menu: the right-clicked row stays highlighted while the menu is open, here on a Ready and a Waiting row (#39)
- [ ] Context menu on the selected task: the row looks selected with the menu open and stays selected after it closes (#39)
- [ ] Undo toast after checking off a task, with its X to close – desktop 1440, phone (#40)
- [ ] Context menu on a flagged row: “Remove flag”
- [ ] Waiting row menu
- [ ] Hide until picker from a row (Ready, In Progress)
- [ ] Wait until picker: status changed to Waiting in the task sheet
- [ ] Upcoming drop prompt: dragging a task due today into Upcoming
- [ ] Task detail for an Open, a Waiting and an In Progress task: Start and Due, Hide until and Due, Due only – desktop 1440, light and dark

## Completed log

From Phase 2c. A read-only screen opened from Completed log in the board menu (Show completed still toggles the board section). Grouped by Monday-start week, then by day, newest first. The newest week starts open and older weeks start collapsed; each week remembers whether you left it open. One-off finishes and each recorded completion of a repeating task are listed. Skips are not. Rows have a check mark and a struck-through title, no checkbox, drag handle, menu or swipe. A repeating row shows the repeat icon and that occurrence's due date. Nothing here edits a task.

- [ ] Completed log: This week open (Pick up dry cleaning on Tue Nov 17, Assemble bookshelf on Mon Nov 16), Last week and older weeks collapsed – desktop 1440, light and dark
- [ ] An older week expanded: “Pay November credit card bill” with its due date struck through – desktop 1440
- [ ] A repeating completion on Today (“Water the plants”): repeat icon and due date, title struck through, and the task still open on the board – desktop 1440, phone
- [ ] Empty: “Nothing finished yet.” – desktop 1440
- [ ] Phone: the log under the status bar, week header and rows full width, back returns to the board – phone

## Search

- [ ] Search: query “pa” with results – desktop 1440

## Offline

- [ ] Offline: read-only board with the offline banner – desktop 1440
- [ ] Offline: row hover buttons and checkbox disabled – desktop 1440
- [ ] Offline: right-click menu with every item disabled – desktop 1440
- [ ] Offline: swipe buttons disabled – phone
- [ ] Offline: task sheet with its editing controls disabled – desktop 1440, phone

## Captured so far

| Page | What it covers |
|---|---|
| `2026-11-16 - Plan proposed` | Phase 1a plan |
| `2026-11-17 - Phase 1a review` | Board, task sheet, row actions, prompts and pickers, search, offline, phone |
| `2026-11-18 - Next review: proposals` | Start-decision prompt, current three choices next to the proposed clear-only version, desktop and phone |
| `Open PRs 15–18 — Nov 20, 2026` | Quick actions and Hide until (#15), quick actions layout (#16), inline title edit (#17), section collapse (#18) |
| `2026-11-24: Login, row highlight, completion animation and grip/check polish (#33, #39, #40)` | Everything in this file against current main on local Supabase: 180 frames in nine areas, light and dark, with phone where listed |

The pages above the Nov 24 one predate the naming rule.

## Login

From Phase 1b. Static screens at `/design/login`, `/design/login-error`, `/design/login-forgot`, `/design/login-sent` and `/design/login-new-password`. All are one centered column, so capture desktop 1440 and phone in light and dark.

The real login screen (the signed-out state) shows locally at `/?autosignin=off`, or after Sign out in the board menu. Plain local dev signs in as the dev user on its own, and hosted builds never do, so a hosted visitor lands on the login screen first. The hosted behavior can't be captured against local Supabase; the signed-out frames stand in for it.

- [ ] Login: sign in, empty, with a 32px Sign in button (44px on phone) – desktop 1440, phone
- [ ] Login: sign in, email and password typed – desktop 1440, phone
- [ ] Login: wrong email or password – desktop 1440, phone
- [ ] Login: reset password, opened from Sign in with an email typed (the field already filled) – desktop 1440, phone
- [ ] Login: keyboard focus on the password field, ring inside the rounded list, divider full width – desktop 1440, phone
- [ ] Login: reset email sent – desktop 1440, phone
- [ ] Login: choose a new password – desktop 1440, phone
- [ ] Board menu with the account email and Sign out – desktop 1440
