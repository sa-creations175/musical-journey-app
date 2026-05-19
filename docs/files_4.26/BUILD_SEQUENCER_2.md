# Build Sequencer — Musical Journey App

Single source of truth for build order, current state, and which docs to reference per phase. Paste this at the start of every Claude Code session alongside WORKING_WITH_CLAUDE.md.

Last updated: April 26, 2026

---

## Current state

**Phase 1 — COMPLETE.** All 6 sub-phases shipped and verified. Pushed to origin/main.

**Phase 1.5 — IN PROGRESS.** Steps 1–7 committed. Step 7 (goal modal song-specific branch) committed but the broader goal modal is being redesigned in Phase 1.6. Phase 1.5 is otherwise complete — push to main and move to Phase 1.6.

**Active next step:** Push Phase 1.5 remaining commits to main, then start Phase 1.6.

---

## Build order

### Phase 1 — Practice Sessions foundation ✅ COMPLETE

All 6 sub-phases shipped and verified. Pushed to origin/main.

---

### Phase 1.5 — Song Progression Redesign (NEAR COMPLETE — push to main)

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

**Action:** Push all Phase 1.5 commits to origin/main before starting Phase 1.6.

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

### Phase 1.6 — Goal Modal Redesign + Shapes & Patterns Proficiency (NEXT)

**Reference docs:**
- `GOAL_MODAL_REDESIGN.md` — full spec for the new guided 4-step goal creation flow
- Shapes & Patterns Proficiency Design session needed FIRST (see below)

**Prerequisites before build starts:**
1. Phase 1.5 pushed to main
2. Shapes & Patterns Proficiency dedicated design session complete — covers gate definitions (time + BPM thresholds), schema for logging practice blocks per shape per key, UI for logging, and migration of existing data

**What Phase 1.6 ships:**
- New `GoalCreationFlow` — 4-step guided conversation replacing the current `GoalFormModal`
- Step 1: module cards (6 modules)
- Step 2: module-specific target surfaces (Song Repertoire, Ear Training, Harmonic Fluency, Shapes & Patterns, Production, Practice consistency)
- Step 3: scope cards + target date
- Step 4: review block + optional note + save
- Context inference from module (no separate context question)
- Replaces all `GoalFormModal` entry points

**What Phase 1.6 does NOT touch:**
- The underlying goal schema (unchanged)
- `songTarget.ts` encoding logic (reused, not replaced)
- Goals home, onboarding, layered display (unchanged)

**Build steps (in order, each commits independently):**
1. `GoalCreationFlow` shell — 4-step navigation, dot indicator, back/next
2. Step 1 — module cards
3. Step 2 — Song Repertoire (reuses existing SongTargetSection logic)
4. Step 2 — Ear Training
5. Step 2 — Harmonic Fluency
6. Step 2 — Shapes & Patterns (requires Shapes design session prerequisite)
7. Step 2 — Production
8. Step 2 — Practice consistency
9. Step 3 — scope cards + target date
10. Step 4 — review + optional note + save
11. Wire context inference
12. Replace GoalFormModal entry points
13. Verify edit mode for all existing goal types

---

### Phase 2 — Practice Sessions spacing state + multi-component goals

**Reference docs:**
- `PRACTICE_SESSIONS_DESIGN_3.md` — Phase 2 section

**Scope:**
- Populate `spacingState` as users engage with items across all modules
- Multi-component (umbrella) goal UI
- Goal progress automation — auto-update `current_value` from spacing state

**Dependency:** Phase 1.6 complete.

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
- P3 polish items

**Dependency:** Phases 1–6 complete or substantially stable.

---

## How to use this in Claude Code

**Starting a new session:**
1. Paste `WORKING_WITH_CLAUDE.md`
2. Paste this file (`BUILD_SEQUENCER.md`)
3. Paste the reference doc(s) for the current phase only
4. State which step you're resuming

**You do not need to paste all design docs every session.**

**After completing a phase:**
- Update the checkbox/status in this file
- Update `DESIGN_DECISIONS_6.md` build state section
- Write a session summary

---

## Deferred design sessions needed (not yet scheduled)

**Shapes & Patterns Proficiency Redesign** — prerequisite for Phase 1.6 Step 2 (Shapes & Patterns). Decisions locked April 26: song vocabulary, per-shape-per-key tracking, time + BPM gate. Full design session needed for: gate thresholds, schema, logging UI, migration.

**Section mutations** — rename, reorder, split, archive, restore for song matrix sections. Deferred from Phase 1.5. Add as a Phase 1.5 cleanup step before Phase 2.

**Original key reassignment UI** — user can change which key is designated as original. Schema supports it; UI not built. Add as a Phase 1.5 cleanup step.

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
