# Figma review test cases

The screens and states to capture for each Figma review round. This file is the list of states. For how to capture them and place them in Figma, follow the [`figma-review`](.cursor/skills/figma-review/SKILL.md) skill.

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

## Light and dark

- [ ] Every item in this file in both light and dark, unless the item names one theme
- [ ] Spot-check that dark frames have no light-only colors, such as a white backdrop or an unreadable tooltip

## Hover states

All desktop 1440.

- [ ] Row hover on a Ready task: Due, Move to Waiting and Delete quick actions
- [ ] Row hover on an In Progress task: Move to Waiting
- [ ] Row hover on a Waiting task: closed-eye button with the “Hide until a later date” tooltip
- [ ] Due presets: Due button on “Get car tires rotated”
- [ ] Quick actions sit just left of the dates and flag

## Editing states

- [ ] Inline title edit on a wide desktop (field visibly live) – desktop 1440
- [ ] Inline title edit at overlay width – overlay 900
- [ ] Tapping a row on phone opens the task instead of editing in place – phone

## Dialogs, prompts and pickers

All desktop 1440 unless noted.

- [ ] Board ⋯ menu open: Show completed, Trash, Appearance
- [ ] Context menu: right-click a row, Due submenu open
- [ ] Waiting row menu
- [ ] Hide until picker from a row (Ready, In Progress)
- [ ] Wait until picker: status changed to Waiting in the task sheet
- [ ] Upcoming drop prompt: dragging a task due today into Upcoming
- [ ] Start-decision prompt: Move to In Progress on a waiting task whose check-back is after its due date – desktop 1440, phone

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

These pages predate the naming rule above.
