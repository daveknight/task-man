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

## Lists and motion

From the list polish PR. All desktop 1440 unless noted.

- [ ] Unselected list sits left of center with the pane's room reserved, and doesn't move when “Renew passport” is selected
- [ ] Drag handles on every draggable row; hover turns one blue
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
- [ ] Drag grip at rest on a hovered row: the quiet checkbox-ring color, turning blue when the handle itself is hovered – light, dark and phone (#40)

## Light and dark

- [ ] Every item in this file in both light and dark, unless the item names one theme
- [ ] Spot-check that dark frames have no light-only colors, such as a white backdrop or an unreadable tooltip

## Hover states

All desktop 1440.

- [ ] Row hover on a Ready task: Due, Move to Waiting and Delete quick actions
- [ ] Row hover on an In Progress task: Move to Waiting
- [ ] Row hover on a Waiting task: closed-eye button with the “Hide until later” tooltip
- [ ] Due presets: Due button on “Get car tires rotated”
- [ ] Quick actions sit just left of the dates and flag

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

## Dialogs, prompts and pickers

All desktop 1440 unless noted.

- [ ] Board ⋯ menu open: Show completed, Trash, Appearance
- [ ] Context menu: right-click a row, Due submenu open
- [ ] Context menu: the right-clicked row stays highlighted while the menu is open, here on a Ready and a Waiting row (#39)
- [ ] Context menu on the selected task: the row looks selected with the menu open and stays selected after it closes (#39)
- [ ] Undo toast after checking off a task – desktop 1440, phone (#40)
- [ ] Waiting row menu
- [ ] Hide until picker from a row (Ready, In Progress)
- [ ] Wait until picker: status changed to Waiting in the task sheet
- [ ] Upcoming drop prompt: dragging a task due today into Upcoming
- [ ] Task detail for an Open, a Waiting and an In Progress task: Start and Due, Hide until and Due, Due only – desktop 1440, light and dark

## Search

- [ ] Search: query “pa” with results – desktop 1440

## Offline

- [ ] Offline: read-only board with the offline banner – desktop 1440

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

- [ ] Login: sign in, empty – desktop 1440, phone
- [ ] Login: sign in, email and password typed – desktop 1440, phone
- [ ] Login: wrong email or password – desktop 1440, phone
- [ ] Login: reset password – desktop 1440, phone
- [ ] Login: reset email sent – desktop 1440, phone
- [ ] Login: choose a new password – desktop 1440, phone
- [ ] Board menu with the account email and Sign out – desktop 1440
