# Build Sequencer — Musical Journey App

Single source of truth for build order, current state, and which docs to reference per phase. Paste this at the start of every Claude Code session alongside WORKING_WITH_CLAUDE.md.

Last updated: April 28, 2026

---

## Current state

**Phase 1 — COMPLETE.** All 6 sub-phases shipped and verified. Pushed to origin/main.

**Phase 1.5 — COMPLETE.** All 7 steps shipped and pushed to origin/main.

**Phase 1.6 — COMPLETE.** All 16 build steps shipped, verified end-to-end, and pushed to origin/main. The new `GoalCreationFlow` is live in production paths (Goals home + onboarding Screen 3); legacy `GoalFormModal` stays mounted alongside for old-vocab edits.

**Phase 2 — IN PROGRESS.** Step 1 (populate spacingState across all 8 modules) and Step 2 (coverage metric vocabulary + GoalCreationFlow wiring across all 5 measurable modules) shipped April 28 and pushed to origin/main. 161/161 tests passing.

**Active next step:** Phase 2 Step 3 — moduleItemCounts helper to replace hardcoded TODO 2/3 denominators with live counts.

---

## Build order

### Phase 1 — Practice Sessions foundation ✅ COMPLETE

All 6 sub-phases shipped and verified. Pushed to origin/main.

---

### Phase 1.5 — Song Progression Redesign ✅ COMPLETE

**Reference docs:**
- `SONG_PROGRESSION_DESIGN_3.md` — full spec

**Steps:**
1. ✅ Schema — 6 new tables + sync registration + proficiencyDefinitions seed update
2. ✅ Migration — seed existing songs from old proficiency states + section setup flow
3. ✅ Matrix UI — steps 3a (read-only matrix), 3b (section setup flow), 3c (cross-key follow-up)
4. ✅ Cell interaction modal — attempt logging, BPM gate (≥ performance tempo − 10), mode toggle deferred
5. ✅ Whole-song test modal — Comfortable → Solid gate, discrete-session, deliberate initiation
6. ✅ Solid decay + retest flow — fading/lapsed badges, retest modal, decay stickiness
7. ✅ Goal creation modal updates — matrix-aware song goal targeting (song-specific branch only)

All 7 steps pushed to origin/main.

**Known deferred items from Phase 1.5:**
- Cell interaction modal per-attempt mode toggle (P3 polish)
- "Clear all session attempts" button (P3 polish)
- "Reset cell historical count" option (P3 polish)
- Section mutations after creation (rename, reorder, split, archive, restore) — later step
- Original key reassignment UI — later step
- songKeyEngagements logging — Phase 3 (Practice Sessions integration)
- Lived-with window computation — Phase 3
- Whole-song test modal per-attempt mode — deferred
- `songCrossKeyProgress` table deprecation/drop — later cleanup step
- Pre-existing SongDetailView.tsx lint warnings (lines 109, 116) — cleanup

---

### Phase 1.6 — Goal Modal Redesign + Shapes & Patterns Proficiency ✅ COMPLETE

**Reference docs:**
- `GOAL_MODAL_REDESIGN.md` — final spec (5-step flow, parent goal step, design questions resolved)
- `SHAPES_PROFICIENCY_DESIGN.md` — Shapes & Patterns proficiency model

**What Phase 1.6 shipped:**
- New `GoalCreationFlow` — guided 5-step conversation in `src/modules/goals/GoalCreationFlow.tsx`
- Step 1: module cards (6 modules in 3×2 grid with canonical accent colors)
- Step 2: module-specific target surfaces — all 6 modules built
- Step 3: scope cards + target date with `initialScope` pre-fill and persistent scope banner
- Step 3.5: parent goal picker (vocabulary-aware suggestions + "No parent goal" + "Create new parent goal" placeholder)
- Step 4: review block with metadata pills + multi-target indicator + save
- Context inference (`contextForModule`) wired into save
- Multi-target encoding: two records sharing `parent_goal_id` per the spec design call
- Edit mode: full decoder set + key-on-mount remount pattern
- Entry-point swap: vocabulary-routed (new vocab → new flow, old vocab → legacy `GoalFormModal`)
- Both modals coexist on Goals home + onboarding Screen 3 until old-vocab goals age out / migrate

**Build steps (all shipped, in order):**
1. ✅ `GoalCreationFlow` shell — 5-step navigation, dot indicator, back/next
2. ✅ Step 1 — module cards (with accent colors)
3. ✅ Step 2 — Song Repertoire (extracted SongTargetSection, want-to-learn promote)
4. ✅ Step 2 — Ear Training
5. ✅ Step 2 — Harmonic Fluency (with 4-group accent palette)
6. ✅ Step 2 — Shapes & Patterns
7. ✅ Step 2 — Production
8. ✅ Step 2 — Practice consistency
9. ✅ Step 3 — scope cards + target date (extracted scopeMeta)
10. ✅ Step 3.5 — parent goal picker
11+12+13. ✅ Step 4 review + save logic + multi-target encoding + context inference (combined commit)
14. ✅ Edit mode — decoders + key-on-mount remount
15. ✅ Entry-point swap — vocabulary routing + persistent scope banner + "+ Reflect" → "+ Aspire"
16. ✅ Final verification — all new-vocab metrics decode correctly in edit mode

**Known deferred items from Phase 1.6 (captured in user-memory notes for after Phase 1.6 ships):**
- Song section multi-select (multiple sections in one pass, save as siblings)
- Cross-key % slider tied to the song's actual keys × sections (not generic 0–100%)
- "+ Add" / "+ Aspire" link should sit at top of each layer instead of bottom
- Vision-scope goals (Lifetime, 2–3 years) should swap structured target picker for freeform text per module
- End-of-period goal warning (e.g., monthly goal created on April 27 with only 3 days left)
- Onboarding Screen3 vision-scope creates still walk through the new flow's structured pickers — may want to special-case back to legacy text-only modal
- Legacy `GoalFormModal` stays mounted alongside the new flow until all old-vocab goals are aged out / migrated

---

### Phase 2 — Practice Sessions spacing state + multi-component goals + coverage goals (IN PROGRESS)

**Reference docs:**
- `PRACTICE_SESSIONS_DESIGN_3.md` — Phase 2 section + new "Yearly Anchor Flows" + "Activity tracking framework" sections
- `DESIGN_DECISIONS_6.md` — coverage goals, activity units, session floors, yearly anchor design
- `SESSION_SUMMARY_2026_04_27_PHASE2_DESIGN.md` + `SESSION_SUMMARY_2026_04_28.md` — design + build context

**Scope:**
- Populate `spacingState` as users engage with items across all 8 modules ✅
- Coverage metric vocabulary + GoalCreationFlow wiring (multi-pick group/area/path goals) ✅
- Live denominators (replace hardcoded TODO 2/3 markers)
- Coverage / accuracy progress helpers (auto-update `current_value` from spacing state)
- YearlyAnchorFlow — dedicated two-screen flow for yearly umbrellas (separate from GoalCreationFlow)
- Goals home redesign — by-timeframe + by-module views, activity charts, expanded goal rows

**Build steps:**

1. ✅ **Populate spacingState across all modules** (8 substeps, all shipped)
   - 1a — Foundational helpers (`src/lib/spacingState.ts`, 215 lines, `recordEngagement` + `getSpacingState`)
   - 1b — Intervals wired (itemRef = `M3:asc` / `M3:desc`, focus-protected attempts only)
   - 1c — Chord Recognition + Scales & Modes + Chord Progressions wired (Ear Training denominator = 143, not 134, after 18 mode×tab rows)
   - 1d — Harmonic Fluency wired (rides alongside SM-2 `flashcardStates`, independent updates)
   - 1e — Shapes & Patterns wired (procedural rating-based, Mental Visualization excluded via `itemRefForSkill` returning null)
   - 1f — Song Repertoire wired to PracticeLogModal (stopgap; Song Practice Timer replaces this in Phase 7)
   - 1g — Production wired via new `assertSpacingStage` API (state-declaration, not signal-based)
   - 1h — One-time backfill from existing user history (pref-gated `PREF_SPACING_STATE_BACKFILL_V1`, 68 rows after backfill)
2. ✅ **Coverage metric vocabulary + GoalCreationFlow wiring** (5 substeps, all shipped, 161/161 tests passing)
   - 2a — Coverage metric vocabulary (`src/modules/goals/coverageMetrics.ts`, 8 metric IDs, type guards)
   - 2b — Ear Training coverage goal wired (multi-pick group pills; pre-existing multi-target umbrella bug fixed; Step 3.5 hardened to default `kind: 'none'`; dev "Clear all goals" button added)
   - 2c — Harmonic Fluency coverage goal wired (per-group accent pills via `selectedStyle: 'fluent' | 'accent'`)
   - 2d — Shapes & Patterns coverage goal wired (3 sub-areas: 348+24+36=408; Mental Visualization excluded)
   - 2e — Production coverage goal wired (6 paths; `targetUnit: 'lessons'`; back-applied slice fix for non-coverage children)
3. ⏭️ **moduleItemCounts helper** — replaces all TODO 2/3 hardcoded denominators with live counts pulled from data. Per Apr 27 principle: yearly anchor breadth questions always display live item counts, never hardcoded numbers.
4. ⏭️ **Coverage and accuracy progress helpers** — `getCoverageCount`, `getEarTrainingAccuracy`, etc. Auto-update goal `current_value` from spacing state.
5. ⏭️ **YearlyAnchorFlow UI** — new dedicated component, two screens (Set Intention + Review). Separate from GoalCreationFlow. One umbrella record + N dimension records (Breadth/Depth/Mastery/Consistency). Triggered when user creates a goal for a module with no yearly anchor yet, or from by-module backstop prompt.
6. ⏭️ **Goals home redesign** — segmented pill toggle (by timeframe / by module). By-timeframe = action view, weekly default open. By-module = hierarchy view, umbrella + children, current period + 7-day lookahead rule. Goal rows: collapsed = natural-language description; expanded = scope-adaptive activity chart (7-day bars / dot grid / 12-month bars) + progress bar + edit/delete.

**Deferred items captured during Phase 2 design + Steps 1–2 build:**
- SyncProvider re-rendering excessively — pre-existing, monitor as Phase 2 adds more writes
- `lessons.ts` stale header comment ("24 Phase-1 lessons") — fix next time in that file
- Harmonic Fluency 4-group structure UI propagation into module nav (Phase 7 polish)
- Song Practice Timer — needs dedicated `SONG_PRACTICE_TIMER_DESIGN.md` before build (see Deferred design sessions)
- PracticeLogModal deprecation — Phase 7 cleanup when timer ships
- Edit-mode for coverage children — needs "add to existing umbrella" flow (Phase 7 UX polish; YearlyAnchorFlow handles yearly case)
- Dev "Clear all goals" button — remove when Phase 2 fully done (Phase 7 cleanup)
- Mid-year umbrella expansion — deferred indefinitely; no legacy goals exist, all new users use YearlyAnchorFlow

**Pre-Phase 3 cleanup items (must land before Phase 3 build):**
- **Accuracy slider needs a paired text input.** Surfaced during Step 6f review (Apr 29). YearlyAnchorFlow's Depth dimension uses an accuracy % slider for ET / HF; users want to type an exact percentage rather than dragging. Same fix likely needed in GoalCreationFlow's accuracy step. Add a small numeric input next to the slider, two-way bound, with sensible min/max clamping.

**Dependency:** Phase 1.6 complete ✅. Step 3 unblocks Step 4 (helpers need live counts). Steps 5 + 6 share UI work and can be sequenced together.

---

### Phase 3 — Practice Sessions algorithm

**Reference docs:**
- `PRACTICE_SESSIONS_DESIGN_3.md` — Phase 3 section
- `SONG_PROGRESSION_DESIGN_3.md` — Practice Sessions integration notes section

**Scope:**
- Session generator: goals + spacing state + freshness + context → session plan
- Input questionnaire: energy, time, context, session intent
- Block-by-block timer execution
- Performance rating: Flying / Cruising / Crawling
- Two-option session proposals
- "Why this plan?" reasoning panel
- "No items due" abundance flow
- Song state read at cell level — block recommendations target section + key combinations
- Acquisition stage detection at cell level for songs
- songKeyEngagements logging (deferred from Phase 1.5)
- Lived-with window computation

**Dependency:** Phase 1.5 complete (song model must exist before algorithm reads it).

---

### Phase 4 — Practice Sessions session roles + day coordination

**Reference docs:**
- `PRACTICE_SESSIONS_DESIGN_3.md` — Phase 4 section

**Scope:**
- Opener / middler / closer role detection
- Cross-session coordination
- Day-level breadth tracking

**Dependency:** Phase 3 complete.

---

### Phase 5 — Goals: automation + end-of-period reviews

**Reference docs:**
- `PRACTICE_SESSIONS_DESIGN_3.md` — Phase 5 section

**Scope:**
- Goal progress auto-calculation from spacing state
- End-of-period review prompts
- Vacation return welcome-back surface
- Goal feasibility nudges at midpoints

**Dependency:** Phase 2 + Phase 3 complete.

---

### Phase 6 — Dashboard integration

**Reference docs:**
- `DESIGN_DECISIONS_6.md` — Dashboard section

**Scope:**
- Goals widget on Dashboard
- Song Progression matrix summary on Dashboard
- Practice Sessions recent history on Dashboard
- Freshness heat maps updated for new song model

**Dependency:** Phase 1.5 + Phase 3 complete.

---

### Phase 7 — Polish + settings + history

**Reference docs:**
- `DESIGN_DECISIONS_6.md` — P3 polish list
- `PRACTICE_SESSIONS_DESIGN_3.md` — Phase 7 section

**Scope:**
- Practice History calendar view
- Prompt management Settings UI
- Smart parent-goal suggestion at goal creation
- Production Vocabulary flashcards
- Audio consistency pass
- Mode playback fix
- Diary features
- **Deprecate PracticeLogModal + remove "+ log a practice session" button** — once the Song Practice Timer ships (see deferred design sessions), the timer's end-session handler becomes the canonical session boundary for Song Repertoire. PracticeLogModal is currently wired to spacingState as a stopgap (Phase 2 1f); when the timer flow ships, move the recordEngagement call to the timer's end-session handler and remove the modal + its trigger button on `SongDetailView`.
- P3 polish items

**Dependency:** Phases 1–6 complete or substantially stable.

---

## How to use this in Claude Code

**Starting a new session:**
1. Paste `WORKING_WITH_CLAUDE.md`
2. Paste this file (`BUILD_SEQUENCER_2.md`)
3. Paste the reference doc(s) for the current phase only
4. State which step you're resuming

**You do not need to paste all design docs every session.**

**After completing a phase:**
- Update the checkbox/status in this file
- Update `DESIGN_DECISIONS_6.md` build state section
- Write a session summary

---

## Deferred design sessions needed (not yet scheduled)

**Section mutations** — rename, reorder, split, archive, restore for song matrix sections. Deferred from Phase 1.5. Add as a Phase 1.5 cleanup step before Phase 2.

**Original key reassignment UI** — user can change which key is designated as original. Schema supports it; UI not built. Add as a Phase 1.5 cleanup step.

**Vision-scope freeform text in new flow** — Lifetime / 2–3 year goals should swap the structured target picker for an open-text field per module (legacy `GoalFormModal` had a vision-mode variant; new flow currently doesn't). Captured as a Phase 1.6 deferred item.

**Song Practice Timer** — replace the "+ log a practice session" button on `SongDetailView` with a Start/End session timer that wraps matrix work. Timer becomes the canonical session boundary for Song Repertoire: matrix interactions during the active window are the practice; the end-session handler prompts for feel rating (1–5) and writes both `songPracticeLog` + `recordEngagement` for spacingState. **Surfaced during Phase 2 1f verification (Apr 28):** PracticeLogModal exists but isn't part of the regular workflow — the matrix IS the practice log for songs. Estimates: bare-minimum (in-memory only) ~4–6 hours / ~200 lines; production-quality (crash recovery + global banner) ~8–12 hours / ~400–500 lines. Needs `SONG_PRACTICE_TIMER_DESIGN.md` before build. Decisions to lock down:
- State persistence (in-memory only vs. Dexie/userPrefs for crash recovery)
- Global session banner placement (where it lives when the user navigates away from the song page)
- One-active-session-at-a-time vs. per-song concurrent
- Reload behavior — "you had a session running yesterday, save or discard?"
- How sections/keys touched are derived from matrix activity in the session window
Deprecates PracticeLogModal once shipped (see Phase 7 cleanup item).

---

## P2/P3 work (can be picked between phases)

- Production Vocabulary flashcards (P2)
- Audio source-module consistency pass (P2)
- Diary playback controls — transposition (P2)
- Sustained-chord rendering fix (P2, needs design conversation first)
- Mode playback placeholder fix (P3)
- Diary mobile layout (P3)
- Visual feedback on diary play buttons (P3)
- Settings UI for backfill utility (P3)
- Cell interaction modal — per-attempt mode toggle (P3)
- Cell interaction modal — "Clear all" button (P3)
- Cell interaction modal — "Reset cell historical count" (P3)
- songCrossKeyProgress table deprecation/drop (P3 cleanup)
- SongDetailView.tsx pre-existing lint warnings (P3 cleanup)
