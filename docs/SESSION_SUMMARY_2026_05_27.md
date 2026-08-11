# Session Summary — May 27, 2026
## Musical Journey App

---

## Session Overview

Long session covering weekly plan available days override, mobile Safari fixes,
lead sheet play mode, bar grid layout, design system pass follow-ups, new app
icon, Vercel infrastructure fixes, and several content/UX improvements.

Test count: 2722 → 2728 passing

---

## Weekly Plan — Available Days Override

### Feature
User can now adjust available practice days for the current week directly in
the weekly plan, without affecting the global consistency goal.

### Architecture
- New Dexie v28 table `weeklyOverrides` — one row per week keyed by
  `String(weekStart)`. Fields: `id`, `weekStart`, `availableDays`, `updatedAt`.
- New Supabase table `week_overrides` (migration 006). Syncs via existing hooks.
- Helpers: `loadWeeklyAvailableDays`, `saveWeeklyAvailableDays`,
  `clearWeeklyAvailableDays` in `weeklyPlanData.ts`. Clamp 1–7.
- `loadConsistencyTargetDays` in `goalsNeedToday.ts` checks override first —
  single injection point into `potential_sessions_left`.
- `effectiveAvailableDays = availableDaysOverride ?? consistencyTargetDays`
  feeds `computeOverrideDivergence` and all module time calculations.

### UI
- Practice Consistency row in weekly plan is the control — native `<select>`
  dropdown (1–7), iOS wheel picker, no keyboard/zoom issues.
- Heavier divider line above Practice Consistency row signals it's the master
  control. Caption: "sets the daily pace for all modules".
- Reset link appears when override differs from goal default.
- "Across N days" text updates reactively across all module rows.
- TOTAL THIS WEEK row now shows two lines:
  - `~Xh Ym/week` (existing)
  - `~Xh Ym per day` (new — total ÷ availableDays, updates with override)

### Key architectural note
`daysPerWeekForModule` takes `effectiveOverride` as a third arg — when set,
short-circuits and returns the override for every module. This is the "master
rhythm" model: changing available days affects all module per-day estimates
simultaneously.

---

## Mobile Safari Fixes

- `html, body { overflow-x: hidden }` — global safety net for horizontal
  overflow. Sub-regions with legitimate horizontal scroll keep their own
  `overflow-x-auto`.
- `@media (max-width: 640px) { input, textarea, select { font-size: 16px } }` —
  prevents iOS Safari auto-zoom on input focus. Desktop density (text-sm/xs)
  preserved via the media query scope.
- All numeric inputs in weekly plan switched to `type="text" inputMode="numeric"
  pattern="[0-9]*"` with `select()` on focus — fixes iOS input replacement
  behavior.
- Last Week review table: TIME/ATTEMPTS/TARGET columns hidden on mobile
  (`hidden sm:table-cell`), replaced by a sub-line under the module name showing
  `{time} · {attempts}/{target}`. No horizontal scroll at 390px.
- Modal footer: `calc(0.75rem + env(safe-area-inset-bottom, 0px) + 0.5rem)`
  padding — clears Safari toolbar and home indicator on all modals app-wide.

---

## Pinned Green App Header (HARMONY branding)

- New sticky header in `Layout.tsx`: `#0f3d2e` background, white text,
  `sticky top-0 z-40`.
- Left: "HARMONY" in small uppercase (`tracking-[0.18em]`) over the current
  page title.
- Right: SyncIndicator + just-play + settings, restyled for green background
  (`border-white/30`, `hover:bg-white/10`).
- Safe-area: `calc(0.75rem + env(safe-area-inset-top, 0px))`.
- `pageTitle.ts`: exact-match pathname → title map for all 23 routes, fallback
  "Musical Journey".
- Dashboard hero band: removed redundant `paddingTop` inline style — now sits
  naturally below the sticky header.
- PageHeader returns a single `<header>` (not a Fragment) — fixes sticky
  containment issue where sticky was constrained to a small wrapper div.

---

## Lead Sheet Play Mode — COMPLETE

### Step 1 — Reorder mode
- Removed inner dnd-kit drag-and-drop for musical sections.
- Added reorder/done toggle in lead sheet header (≥2 sections).
- ↑↓ buttons gated behind reorder mode. 44px touch targets.
- `planSectionMove()` pure helper + 6 unit tests.

### Step 2 — Play mode
- Edit/Play segmented toggle in lead sheet header (same pattern as Goals
  by-timeframe/by-module).
- Play mode hides: stage picker/badge, arrangement controls, ↑↓/hide/delete,
  BAR GRID header, numerals, patterns, section notes, + bar, + Add lyrics.
- Empty beat slots: completely invisible in play mode.
- Section name: small muted label above each grid.
- Voicing popover accessible in play mode.
- Play/reorder mutually exclusive. Not persisted.

### Step 3 — Mobile voicing popover → bottom sheet
- Mobile (<768px): full-width, fixed to viewport bottom, `max-h-[85vh]`.
- Removed `backdrop-blur` from section cards (was creating CSS containing block
  preventing `position: fixed` from anchoring to viewport).
- Desktop: unchanged (28rem, `max-h-70vh`).

---

## Bar Grid 6/8 Layout

- Mobile: 1 bar per row via `useBarsPerRow` hook.
- Desktop: 2 bars per row (unchanged).
- Removed `overflow-x-auto` and per-slot `min-width` entirely — slots flex to
  fill bar equally, never overflow or scroll.
- All 6 slots in a 6/8 bar visible and tappable at 390px.

---

## Lyric Syllable Editing

- Tapping a syllable in the lead sheet → actions popover → "Edit" → inline
  input pre-filled with current text → Save/Enter commits, Cancel discards.
- `setWordText()` pure helper in `lyricLine.ts` — trims, no-ops on
  unchanged/empty, preserves `wordOffsets`.
- `onWordChange` optional throughout — backward compatible.

---

## Plan Week Prompt Fix

- Removed Sunday day-gate — shows any day when current week has no confirmed
  plan.
- Removed manual × dismissal and localStorage flag.
- Only dismisses on completing the WeeklyPlan flow.
- Reactive via `useLiveQuery`.

---

## PWA Icon (Harmony)

- Deep green (#0f3d2e) rounded square, faint SA watermark (5% opacity),
  bold white treble clef.
- Exported: icon-192.png, icon-512.png, icon-1024.png → public/
- Manifest and apple-touch-icon updated.

---

## Vercel Infrastructure

- Root cause of deployment failures: Vercel account (sah175) and repo owner
  (sa-creations175) are different GitHub accounts. Pro plan upgrade resolved
  "collaborator" blocking.
- Repo made public during debugging — kept public.
- Lesson learned: CC must commit and push after each build, not just run
  `npm run build`. Several sessions of fixes weren't deployed because changes
  sat uncommitted.
- GitHub SSH not set up on dev machine — HTTPS only. One-commit-at-a-time
  workaround for batch push failures.

---

## Outstanding / Next Session

### Top priority — Mid-month goal reset feature
Silas is behind on May goals due to life/other priorities. The app should offer
a "reset to realistic" flow for mid-month recovery:
- App detects significant behind-pace status across modules
- Surfaces: "You're behind on 5/6 modules. Want to adjust May goals to
  what's actually achievable given the time left?"
- Calculates realistic adjusted targets based on: days remaining, available
  days/week, what's already been done
- Shows trade-off: "If you do X this week, you'll need Y/day for remaining
  weeks to hit adjusted goal"
- Needs design doc before building — touches monthly goal records, pace
  calculations, and review UI

### Also deferred
- Phase 7: voice prompts design
- Advanced Harmonic Learning design doc
- Multiple YouTube/reference video links per song
- Harmonic tag auto-detection
- Time picker redesign (pre-session "what your goals need today")
- Two GitHub account consolidation (sah175 / sa-creations175)
- App icon suite (Harmony + Steward + Body Health) — considering Midjourney
- Steward app icon — sprout on #0f3d2e, SA watermark (generated but not used)

### devWipe.ts + Goals.tsx import
Still uncommitted — local dev tools only, must never commit.

---

## Starter Prompts

### Claude Chat — next session
```
Continue Musical Journey App. Read SESSION_SUMMARY_2026_05_27.md.

2728 tests passing. Session covered: weekly plan available days
override (native select, per-day time estimate), mobile Safari
fixes (no zoom, no horizontal overflow), pinned HARMONY header,
lead sheet play mode complete, bar grid 6/8 layout, lyric editing.

TOP PRIORITY next session: mid-month goal reset feature.
Silas is behind on May goals. Need a design doc for a
"reset to realistic" flow — app detects behind-pace status,
offers adjusted monthly targets based on time remaining and
actual progress. Needs design doc before building.

Key architectural decisions:
- availableDays override: weeklyOverrides table, per week only,
  does not affect global consistency goal
- Practice Consistency row = master control for all module
  per-day estimates
- Play mode: not persisted, voicing popover accessible
- HARMONY header: sticky top-0, pageTitle.ts maps all 23 routes
- CC must commit AND push after every build — learned the hard way
```

### Claude Code — next session
```
Continue Musical Journey App. Read SESSION_SUMMARY_2026_05_27.md.

2728 tests passing. devWipe.ts + Goals.tsx import uncommitted
(keep out).

Recent work: weekly plan available days override (weeklyOverrides
Dexie v28 table, native select on Practice Consistency row,
per-day time estimate in total row), mobile Safari fixes
(font-size 16px, overflow-x hidden), pinned HARMONY header in
Layout.tsx, lead sheet play mode (3 steps complete).

IMPORTANT: always git commit AND git push after npm run build
passes. Several sessions of fixes weren't deployed because
changes sat uncommitted. Build + commit + push every time.

npm run build before every commit.
```
