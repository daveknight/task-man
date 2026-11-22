# Product guidelines

Design guidelines for TaskMan, drawn from Dave's Figma review feedback and sign-offs. Dave approved each of them. Follow them when building features or making design decisions. If a change conflicts with one, ask Dave first.

`PLAN.md` holds the product rules and architecture. These guidelines cover copy, layout, dates and status, and color.

## Copy

1. **Short labels.** Dialog titles name the action, not the task: "Move to Ready", "Start later". Tooltips drop filler like "now".
2. **Sentence case for buttons and titles.** "Add task", not "Add Task".
3. **Name the thing being cleared.** "No due date", "No start date", "Don't hide", not "Clear".
4. **One name everywhere, including the CLI.** "Hide until", "Don't hide", "hidden until later". No "Wait until", "Check back", or "waiting until later".
5. **"Move to In Progress", not "Resume".**

## Layout

6. **Text is optically centered** with icons, checkboxes, and row height. A pixel high is a bug.
7. **Section titles line up with task titles.** A collapsed section is a full-width row you can click anywhere.
8. **At 1024px and up the detail pane slides in beside the board** when a task is selected. It is an overlay from 768 to 1023px, and a bottom sheet on phones.
9. **With no task selected there is no detail pane.** It slides out to the right when you click off the list.

## Dates and status

10. **Only Ready and Upcoming tasks have a start date.** Going into Waiting or In Progress clears it. Hide until is Waiting's own date. It may be after the due date, and it's cleared when a task leaves Waiting.
11. **Changing into Waiting always opens the picker.** Default is "Don't hide". There is no Keep tile.
12. **Due today stays blue.** Presets count from today.
13. **Dropping a task due today or earlier into Upcoming** explains why and offers "Remove due date" or Cancel.

## Color and icons

14. **Use Apple's system colors exactly,** including the documented contrast exemptions.
15. **Quick action icons in a task list row carry no color until you hover them.** On hover they take their action's color (today: Due orange, Move to Waiting blue, Delete red). This applies only to the quick actions; the flag, date icons, chevrons, toolbar and pane icons carry status or are chrome. No extra badges, such as Follow up.

## Rows and motion

16. **The list doesn't move when you select a task.** At 1024px and up, the room for the detail pane (400px) is always reserved, so the unselected list sits left of center and stays put as the pane slides in and out.
17. **Day words replace weekdays.** Yesterday, Today and Tomorrow stand in for the day of the week. Rows show the word alone ("Today"); the detail pane has more room and adds the date ("Today, Nov 21").
18. **A row is dragged by its handle, and only by its handle.** The handle sits in its own small column left of the checkbox, shows a grab cursor, and follows guideline 15 (text color, blue on hover). Pressing anywhere else on the row selects, edits or swipes as usual. Rows that can't be dragged leave the column empty so titles stay lined up.
19. **A dropped row is highlighted for 2 seconds, then the highlight fades out.**
20. **Deleted rows slide away, and what's below slides up.** A section's last row takes the heading with it. Folds, slides and fades all use the same 200ms ease-out and snap with reduced motion.
21. **Typing a title in the list updates the open detail pane as you type.** Escape puts it back in both places.
