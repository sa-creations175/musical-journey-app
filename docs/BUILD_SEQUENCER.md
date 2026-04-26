# Build Sequencer — Musical Journey App

Single source of truth for build order, current state, and which docs to reference per phase. Paste this at the start of every Claude Code session alongside WORKING_WITH_CLAUDE.md.

Last updated: April 26, 2026

---

## Current state

**Active:** Practice Sessions Phase 1, sub-phase 3, step 4 — goal creation form + onboarding mini-form.

Steps 1–3 committed. Steps 4–9 in progress. One addendum applies to this phase — see below.

---

## Build order

### Phase 1 — Practice Sessions foundation (IN PROGRESS)

**Reference docs:**
- `PRACTICE_SESSIONS_DESIGN_3.md` — full spec
- `PHASE_1_SONG_GOAL_ADDENDUM.md` — song goal modal update (apply to steps 4–9)

**Sub-phases:**
1. ✅ Schema + sync
2. ✅ Memory type lookup
3. 🔄 Goals module + onboarding (steps 4–9 in progress)
4. ⬜ Practice Sessions home + manual logging
5. ⬜ Prompt orchestration
6. ⬜ Proficiency vocabulary verification

**Critical note for steps 4–9:** The song goal section of the goal creation modal has changed. Apply `PHASE_1_SONG_GOAL_ADDENDUM.md` before building that section. Also apply the `proficiencyDefinitions` seed correction in the addendum if sub-phase 1 seeded the old song vocabulary.

**Done when:** All 6 sub-phases committed and tested. Goals module functional. Practice Sessions home with manual logging works. Prompt orchestration table exists.

---

### Phase 1.5 — Song Progression Redesign (NEXT after Phase 1)

**Reference docs:**
- `SONG_PROGRESSION_DESIGN_3.md` — full spec (schema, UI, migration, all interactions)

**Build steps (in order, each commits independently):**
1. Schema — 6 new tables + sync registration + `proficiencyDefinitions` seed update
2. Migration — seed existing songs from old proficiency states + section setup flow
3. Matrix UI — keys-as-rows view, inline progress strips, song-level state header
4. Cell interaction modal — attempt logging, mode toggle, consecutive logic
5. Whole-song test modal — Comfortable → Solid gate, deliberate initiation from key strip
6. Goal creation modal — update song goal section per Phase 1 addendum (already spec'd)

**Done when:** Existing songs have migrated matrix state. Matrix view renders. Cell modal logs run-throughs. Whole-song test gates Solid. Goal creation modal targets songs at new granularities.

---

### Phase 2 — Practice Sessions spacing state + multi-component goals

**Reference docs:**
- `PRACTICE_SESSIONS_DESIGN_3.md` — Phase 2 section

**Scope:**
- Populate `spacingState` as users engage with items across all modules
- Multi-component (umbrella) goal UI
- Goal progress automation — auto-update `current_value` from spacing state

**Dependency:** Phase 1 complete.

---

### Phase 3 — Practice Sessions algorithm

**Reference docs:**
- `PRACTICE_SESSIONS_DESIGN_3.md` — Phase 3 section
- `SONG_PROGRESSION_DESIGN_3.md` — Practice Sessions integration notes section

**Scope:**
- Session generator: takes goals + spacing state + freshness + context → produces session plan
- Input questionnaire: energy, time, context, session intent
- Block-by-block timer execution
- Performance rating UI: Flying / Cruising / Crawling
- Two-option session proposals
- "Why this plan?" reasoning panel
- "No items due" abundance flow
- Song state read at cell level — block recommendations can target section + key combinations
- Acquisition stage detection at cell level for songs

**Dependency:** Phase 1.5 complete (song model must exist before algorithm reads it).

---

### Phase 4 — Practice Sessions session roles + day coordination

**Reference docs:**
- `PRACTICE_SESSIONS_DESIGN_3.md` — Phase 4 section

**Scope:**
- Opener / middler / closer role detection and differentiation
- Cross-session coordination (morning session informs afternoon recommendation)
- Day-level breadth tracking

**Dependency:** Phase 3 complete.

---

### Phase 5 — Goals: automation + end-of-period reviews

**Reference docs:**
- `PRACTICE_SESSIONS_DESIGN_3.md` — Phase 5 section

**Scope:**
- Goal progress auto-calculation from spacing state
- End-of-period review prompts (weekly / monthly / quarterly / annual)
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
- Freshness heat maps updated to reflect new song model

**Dependency:** Phase 1.5 + Phase 3 complete.

---

### Phase 7 — Polish + settings + history

**Reference docs:**
- `DESIGN_DECISIONS_6.md` — P3 polish list
- `PRACTICE_SESSIONS_DESIGN_3.md` — Phase 7 section

**Scope:**
- Practice History calendar view
- Prompt management Settings UI (queue inspection + category mute toggles)
- Smart parent-goal suggestion at goal creation
- Production Vocabulary flashcards
- Audio consistency pass
- Mode playback fix
- Diary features (transposition, visual feedback)
- P3 polish items from DESIGN_DECISIONS_6.md

**Dependency:** Phases 1–6 complete or substantially stable.

---

## How to use this in Claude Code

**Starting a new session:**
1. Paste `WORKING_WITH_CLAUDE.md`
2. Paste this file (`BUILD_SEQUENCER.md`)
3. Paste the reference doc(s) for the current phase only
4. State which step you're resuming

**You do not need to paste all design docs every session.** The sequencer tells Claude Code what phase is active and which doc to read. Paste only what's needed.

**After completing a phase:**
- Update the checkbox in this file
- Update `DESIGN_DECISIONS_6.md` build state section
- Write a session summary

---

## P2/P3 work (can be picked between phases)

These don't block the main sequence. Pick them when energy is right:

- Production Vocabulary flashcards (P2)
- Audio source-module consistency pass (P2)
- Diary playback controls — transposition (P2)
- Sustained-chord rendering fix (P2, needs design conversation first)
- Mode playback placeholder fix (P3)
- Diary mobile layout (P3)
- Visual feedback on diary play buttons (P3)
- Settings UI for backfill utility (P3)
