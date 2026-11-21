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

10. **Check-back is the start date.** Waiting may start after its due date. Other statuses may not.
11. **Changing into Waiting always opens the picker.** Default is "Don't hide", with a tile to keep the current date.
12. **Due today stays blue.** Presets count from today.
13. **Dropping a task due today or earlier into Upcoming** explains why and offers "Remove due date" or Cancel.

## Color and icons

14. **Use Apple's system colors exactly,** including the documented contrast exemptions.
15. **Row icons use the text color, and turn blue on hover.** No extra badges, such as Follow up.
