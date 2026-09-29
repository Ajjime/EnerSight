---
name: enersight-frontend-page
description: Plan, implement, or review a UI change to an EnerSight React page or component (Dashboard, BuildingMap, MetersPage, UploadOCR, auth pages, etc.)
---

1. Read `knowledge.md` for the frontend architecture map, then open the target file(s) under `enersight-frontend/src/pages/` or `src/components/`.
2. Identify the existing pattern before adding a new one:
   - Layout shell: pages that need a full-page frame use `AuthShell` (auth pages) or `PageHeader` (app pages) — don't invent a new page chrome.
   - Icons: `lucide-react`, passed as `icon: Icon` props and rendered `<Icon .../>` — this project's ESLint config has no `eslint-plugin-react`, so it will falsely flag these as unused; do not delete an `Icon` destructure just because lint says so without confirming it isn't rendered in JSX.
   - Animations: reuse existing keyframes in `src/index.css` (`energyFadeIn`, `energyFadeUp`, `energyImageIn`, `energyPop`, `energyScan`) instead of writing new ones, unless the effect genuinely doesn't fit any of them.
   - Styling: Tailwind utility classes inline, no CSS modules or styled-components.
3. Keep the change presentational/scoped to the touched file(s). Do not alter:
   - `apiFetch` calls, request payloads, or endpoint paths (that's a contract change — see `enersight-backend-route` skill instead).
   - `localStorage` keys used for auth (`token`, `user`, `role`, `fullName`).
4. Preserve existing behavior while changing appearance: keyboard interactions (Enter/Shift+Enter where relevant), loading/disabled states, error message rendering, and responsive breakpoints (`sm:`/`md:`/`lg:`) must keep working.
5. Verify before calling it done:
   - `npm run lint` and `npm run build` in `enersight-frontend/`.
   - Run `npm run dev` and manually check the page in a browser: the original interaction still works, and the new visual/behavioral change is visible.
   - Note any pre-existing lint findings you did NOT touch (see `knowledge.md` baseline) so they aren't confused with regressions from this change.
