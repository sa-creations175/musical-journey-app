# Session Summary — April 28, 2026

A full day session split across two halves: (1) completing the Phase 2 design session started April 27, and (2) building through Phase 2 Steps 1 and 2 with Claude Code. Significant progress on both fronts.

---

## Part 1 — Design session completion

### YearlyAnchorFlow — fully designed

A dedicated two-screen flow separate from GoalCreationFlow. Triggered when a user creates a goal for a module and no yearly anchor exists yet, or from the by-module view backstop prompt.

**Data structure:**
- One **umbrella record** — the named container (e.g. "Ear Training 2026"), auto-generated name editable inline
- Multiple **dimension records** underneath — one row per Breadth / Depth / Mastery / Consistency answer
- Weekly/monthly **child goals** link to whichever dimension row they feed

**Screen 1 — Set your intention:**
- Brief explanation at top ("A yearly anchor sets your full intention for [Module]...")
- All four dimension questions on one scrollable screen
- Breadth → Mastery → Depth → Consistency order
- Breadth: Yes/No → if No, group/area selector reveals inline (same cards, no dropdown)
- Mastery: multi-select group cards, pre-filtered to breadth selection
- Depth: accuracy % slider (card modules) or proficiency level (others)
- Consistency: number input, per week default, per month toggle available on all modules
- Step indicator (dot 1 of 2) at bottom

**Screen 2 — Review:**
- Auto-generated name editable inline at top
- Four dimension rows with individual Edit links
- Natural language summary at bottom with left accent border
- Back + Save anchor buttons

**Nudge design:**
- Triggers on first goal creation per module if no yearly anchor exists
- Backstop: soft dashed prompt in by-module view where anchor would live
- Each nudge includes module-specific example in canonical vocabulary

**GoalCreationFlow relationship:**
- GoalCreationFlow coverage goals serve non-yearly scopes (monthly, quarterly) — standalone use case
- YearlyAnchorFlow handles yearly coverage with its own multi-question surface, bypasses Step 3.5 entirely
- Step 3.5 stays for regular standalone goals that genuinely need a parent picker

---

### By-module view — finalized

**Current period + 7-day lookahead rule:**
- Shows current active periods only (current week, current month, current year anchor)
- Plus anything starting within the next 7 days
- 7-day lookahead is a tunable parameter — revisit after real use
- No upcoming beyond 7 days, no past (past is Practice History — Phase 7)

**Collapse behavior confirmed:**
- Tapping umbrella collapses entire subtree
- Tapping child level collapses that level and its children independently
- Default: umbrella goals expanded, children collapsed

**Backstop prompt:**
- Dashed border prompt "Set a yearly anchor for [Module]" where umbrella would live if none exists

---

### Song Practice Timer — new design item

Identified during 1f verification: PracticeLogModal exists but isn't part of the regular workflow. The matrix IS the practice log for songs. Needs a dedicated design session before build.

**Proposed flow:**
1. User opens song detail page
2. Taps "Start practice session" — timer starts
3. Works through matrix normally (cells, attempts, BPM)
4. Taps "End session" — timer stops, feel rating prompt appears (1-5)
5. That feel rating + duration + cells touched = one complete session, writes spacingState row

**PracticeLogModal** — marked for deprecation when timer ships (Phase 7 cleanup)

**Estimates:**
- Bare minimum (in-memory only): ~4-6 hours, ~200 lines
- Production quality (crash recovery + global banner): ~8-12 hours, ~400-500 lines

Needs its own design doc (SONG_PRACTICE_TIMER_DESIGN.md) before build — state persistence, global banner, crash recovery, one-session-at-a-time vs per-song decisions all open.

---

### Mid-year expansion — deferred indefinitely

No legacy goals exist. Anyone using the app going forward will use YearlyAnchorFlow. No meaningful legacy scenario to handle. Revisit only if a real use case emerges.

---

## Part 2 — Phase 2 Build Progress

### Step 1 — Populate spacingState ✅ COMPLETE

All substeps committed and pushed to origin/main.

**1a** — Foundational helpers (`src/lib/spacingState.ts`, 215 lines). Public API: `recordEngagement`, `getSpacingState`. Pure stage-transition helpers. 44 tests, 71 total passing.

**1b** — Intervals wired. itemRef format: `M3:asc` / `M3:desc`. Focus-protected attempts call `recordEngagement` (genuine engagement). Browser verified: acquiring → acquired promotion working correctly.

**1c** — Chord Recognition, Scales & Modes, Chord Progressions wired.
- Scales & Modes: 18 items (mode × tab, not 9) — Hear Scale and Sit Inside are separate skills
- Chord Progressions: only catalog progressions wired, KeyDetectionTab and ChordMotionTab intentionally not wired
- Coverage denominator for Ear Training: 143 spacingState rows (26 + 30 + 69 + 18), not 134

**1d** — Harmonic Fluency wired. Single call site in `HarmonicFluencySession.handleAnswer`. Rides alongside `flashcardStates` (SM-2) — independent updates, no shared logic.

**1e** — Shapes & Patterns wired (procedural, rating-based). Feel mapping: 1-2 → crawling, 3 → cruising, 4 → flying. Single call site in `drillModel.logSession`. Mental Visualization excluded by `itemRefForSkill` returning null — sessions still log to drillSessions but produce no spacingState rows. recordEngagement call runs after existing transaction.

**1f** — Song Repertoire wired to PracticeLogModal (stopgap). itemRef = songId (whole-song level). 5-point feel mapping: 1-2 → crawling, 3-4 → cruising, 5 → flying. PracticeLogModal marked for deprecation when Song Practice Timer ships. Cell-level itemRef deferred to Phase 3.

**1g** — Production wired via new `assertSpacingStage` API (not `recordEngagement` — Production uses direct state declaration, not signal-based). Stage mapping: not-started → null (delete row), in-progress → acquiring, completed → acquired, mastered → mastered. `recordLessonOpen` intentionally not wired — opens are recency events. 10 new tests for `assertSpacingStage`. 81 total passing.

**1h** — One-time backfill of spacingState from existing user history. Pref-gated (`PREF_SPACING_STATE_BACKFILL_V1`), runs exactly once. Derives starting stage from per-module tables. Option A (empty `performanceHistory`) — stage is the truth, rolling window resets. Backfill fills gaps, doesn't overwrite live-wired rows. 32 new tests, 113 total passing. Result: 68 spacingState rows across all 8 modules after backfill (up from 40 from live wiring).

---

### Step 2 — Coverage metric vocabulary + GoalCreationFlow wiring ✅ COMPLETE

All substeps committed and pushed to origin/main.

**2a** — Coverage metric vocabulary (`src/modules/goals/coverageMetrics.ts`). 8 metric IDs: `{ear_training,harmonic_fluency,shapes,production}_coverage_at_acquired{,_specific}`. Type guards: `isCoverageMetric`, `isCoverageOverallMetric`, `isCoverageSpecificMetric`. 48 tests, 161 total passing. `goalVocabulary.ts` unchanged — existing prefix matchers route new metrics correctly.

**2b** — Ear Training coverage goal wired end-to-end.
- Multi-pick group pills (CategoryPillButton with selectedStyle="accent")
- Selecting 2+ groups auto-creates umbrella + N children via handleSave fix
- Pre-existing multi-target umbrella bug fixed (handleSave now auto-creates umbrella when records.length > 1 and no parent picked)
- Step 3.5 hardened: defaults to `kind: 'none'` (standalone), "No parent goal" card shows "DEFAULT · STANDALONE" subtitle with divider
- Dev "Clear all goals" button added (gated behind import.meta.env.DEV), fixed to clear both local and Supabase
- Denominators hardcoded with TODO 2/3 markers for step 3 swap

**2c** — Harmonic Fluency coverage goal wired. Per-group accent colors on pills (slate-blue / deep-rose / teal / forest-green) matching existing HF accuracy-specific picker. `CategoryPillButton` extended with `selectedStyle: 'fluent' | 'accent'` prop. `HARMONIC_FLUENCY_COVERAGE_GROUPS` kept separate from `HARMONIC_FLUENCY_GROUPS`.

**2d** — Shapes & Patterns coverage goal wired. 3 sub-areas (chord_shape_drills 348 + scale_drills 24 + voice_leading 36 = 408). Mental Visualization excluded from denominator. Single S&P module accent for all 3 pills.

**2e** — Production coverage goal wired. 6 paths as coverage groups. targetUnit: 'lessons' for overall (Production-specific). Single Production accent. Existing `production_path_completion` preserved for backward compat. Back-applied slice fix: each per-record clone now disables `coverageEnabled` so non-coverage children don't inherit coverage preview text.

---

## Steps remaining in Phase 2

- **Step 3** — moduleItemCounts helper (replaces all TODO 2/3 hardcoded denominators with live counts)
- **Step 4** — Coverage and accuracy progress helpers (`getCoverageCount`, `getEarTrainingAccuracy` etc.)
- **Step 5** — YearlyAnchorFlow UI (new dedicated component, two screens)
- **Step 6** — Goals home redesign (by timeframe + by module views, activity charts, expanded goal rows)

---

## Known issues / deferred items captured this session

- **SyncProvider re-rendering excessively** — pre-existing, monitor as Phase 2 adds more writes
- **lessons.ts stale header comment** — says "24 Phase-1 lessons", fix next time in that file
- **Harmonic Fluency module UI** — 4-group structure needs to propagate from goal creation into actual module UI and nav (Phase 7 polish)
- **Song Practice Timer** — needs dedicated design doc before build
- **PracticeLogModal deprecation** — Phase 7 cleanup when timer ships
- **Edit-mode for coverage children** — needs "add to existing umbrella" flow rather than generic Step 3.5 picker (Phase 7 UX polish, YearlyAnchorFlow handles this for yearly anchors)
- **Dev Clear button** — remove when step 2 is fully done (Phase 7 cleanup)

---

## Test counts

- End of Step 1: 113/113 passing
- End of Step 2: 161/161 passing

---

## Files to update next session

- `BUILD_SEQUENCER_2.md` — mark Steps 1 and 2 complete, update remaining steps
- `DESIGN_DECISIONS_6.md` — add activity tracking framework, yearly anchor flows, coverage goal type, YearlyAnchorFlow design
- `PRACTICE_SESSIONS_DESIGN_3.md` — add yearly anchor flow specs per module
