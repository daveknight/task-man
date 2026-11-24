# Test vectors

Language-neutral JSON cases for the shared rules. The TypeScript `core` runs them with Vitest (`packages/core/test/vectors.test.ts`); the Swift port should load the same files and must pass every case unchanged.

| File | Functions |
|---|---|
| `sections.json` | `sectionFor`, `waitingStateFor` |
| `board-order.json` | `buildBoard` (grouping and order) |
| `dates.json` | `resolveDate`, `weekdayOf`, `nextWeekdayOnOrAfter` |
| `sort-keys.json` | `keyBetween`, `isValidSortKey` |
| `actions.json` | `actionsFor` (swipe, right-click and hover actions with their presets) |
| `positions.json` | `positionEffect`, `planDrop` (drag-and-drop), `planUpcomingDrop` (dropping into Upcoming), `shouldPurge` |
| `transitions.json` | `setDueDate`, `waitUntil`, `changeStatus` / `resume` (under the default policy; status changes never ask) |
| `validate.json` | `validateTask` |
| `subtasks.json` | `sortSubtasks`, `subtaskCount`, `normalizeSubtaskTitle`, `planAddSubtask`, `planEditSubtask`, `planMoveSubtask`, `planRemoveSubtask`, `resetSubtasks` (keys come from `keyBetween`, so every platform writes the same `sortKey`) |
| `tags.json` | `normalizeTagName`, `checkTagName`, `sortTags`, `tagsMatching`, `orderTaskTags`, `tagChips`, `filterByTags` (AND), `tagCounts`, `planCreateTag`, `planRenameTag`, `planDeleteTag`, `applyTagChange`, `applyTaskTagChange`, `parseTagList`, `planTaskTags` |
| `repeat.json` | `validateRepeat`, `nextDueDate`, `planOccurrence`, `planUndoOccurrence`, `localDate` (time zones and DST) |

Conventions:

- Dates are `YYYY-MM-DD` calendar days; timestamps are ISO 8601 UTC.
- Task fields use the camelCase names from `src/types.ts`. Omitted fields are null; `status` defaults to `open`.
- `expectError: true` means the call must fail.
- Sort keys compare byte-wise (Swift: compare UTF-8 bytes, not `localizedCompare`).
