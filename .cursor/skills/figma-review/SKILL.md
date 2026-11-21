---
name: figma-review
description: Capture TaskMan screens as real browser screenshots and place them in Figma for Dave to review and comment on. Use when asked to put screens, states, a phase or PRs in Figma for review.
---

# Figma review

Dave uses Figma as a board for commenting on screenshots. Each review round is a new Figma page of plain PNG screenshots, one labeled image per state. [`test-cases.md`](../../../test-cases.md) lists the states. This skill is how to capture and place them.

Figma file: https://www.figma.com/design/T2uWdMZE3ptRelGfMFCMlN

## Rules

- Place screenshots as **plain images**. Don't use native layers, `generate_figma_design`, or HTML-to-design imports: they misplace text and Dave doesn't need editable layers.
- Make a **new page** named `YYYY-MM-DD: {description of phase or PRs}`, and add the same date as a canvas title on the page. **Never edit existing pages.**
- Put **one image per state**, with a text label directly above it that matches the image name, and group the images by the areas in `test-cases.md`.

## 1. Run the app

```bash
npm run db:start
npm run -s cli -- seed --reset --today 2026-11-18
npm run web        # http://127.0.0.1:5179
```

Open the board at `http://127.0.0.1:5179/?today=2026-11-18`. For PR reviews, check out or merge the PR branches first, and reseed before each run so earlier interactions don't leak into later shots.

## 2. Capture PNGs with Playwright

Write a throwaway Playwright script (Chrome; `apps/web/scripts/screenshots.ts` and `apps/web/e2e/helpers.ts` show the selectors and setup) that captures every state listed in `test-cases.md`:

- Viewports: desktop `1440 × 900`; overlay `900 × 900`; phone with `devices['iPhone 15 Pro']`. Use `deviceScaleFactor: 2`.
- Theme: set `colorScheme: 'light' | 'dark'` on the context and capture each state in the themes it lists.
- Board baselines use `fullPage: true`. Crop menus, sheets and prompts to the visible window.
- Reach hover, editing, menu, picker and prompt states with real interactions: `hover()`, `click({ button: 'right' })`, `dblclick()`, typing, and `dragTo()`. Wait for the element to be visible and for animations to settle before the shot.
- For offline, use `context.setOffline(true)` against `npm run preview:local -w @app/web`. That build has the service worker; the dev server doesn't.
- Name each file after its state title, for example `Search: query “pa” with results – desktop 1440, dark`.

Review the PNGs before uploading. Drop or retake any that show the wrong state.

## 3. Place them in Figma

1. `create_session` with the file key, then use `use_figma` (read the `figma-use` skill first) to create the new page, the date canvas title, and one labeled section per area.
2. `upload_assets` with `currentPageId` set to the new page, POSTing each PNG as `image/png`. Each PNG lands as a frame with an image fill.
3. With `use_figma`, name each image frame after its state, put the label text above it, and lay the frames out in rows inside their area section.
4. Check the page with `get_screenshot`, then share the page link.

## 4. Report

Reply with the page link, the states captured, and every state listed in `test-cases.md` that **couldn't be captured**, with the reason (for example, a native browser tooltip or a feature not built yet). Add any new states the round introduced to `test-cases.md`.
