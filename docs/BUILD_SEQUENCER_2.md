# Build Sequencer — Musical Journey App

Single source of truth for build order, current state, and which docs to reference per phase. Paste this at the start of every Claude Code session alongside WORKING_WITH_CLAUDE.md.

Last updated: May 2, 2026

---

## Current state

**Phase 1 — COMPLETE.**
**Phase 1.5 — COMPLETE.**
**Phase 1.6 — COMPLETE.**
**Phase 2 — COMPLETE.** 701/701 tests passing.
**Phase 3 — COMPLETE.** 986/986 tests passing. Full Practice Sessions generator shipped and verified end-to-end in browser. Vercel green. Last commit: 24c64d8.

**Active next step:** Polish sprint (items pulled forward from Phase 7) — Session 1: sessionGenerator full weighting + block description fix + scales drill consolidation.

---

## Revised build order

The original phase order (3 → 4 → 5 → 6 → 7) has been revised. Phase 3 is now in daily use. Phases 4 and 5 require real usage data before they can be properly calibrated. High-impact polish items are pulled forward so the app feels complete for daily practice before tackling the architectural middle phases.

### Why phases 4 and 5 are deferred

**Phase 4** (day coordination / opener-middler-closer) only adds value when you're regularly doing multiple sessions per day. If you're doing one session a day, it adds complexity without value. Build it when multi-session days are actually part of your practice routine.

**Phase 5** (goal automation) auto-calculates goal progress from spacing state and triggers end-of-period reviews. The spacing curve constants and acquisition thresholds were set with reasonable defaults in Phase 3 — but they need 20–30 real sessions of data before calibration makes sense. Building goal automation before that means potentially automating against bad numbers and having to recalibrate everything.

**Recommended milestone:** use the app daily for 3–4 weeks after the polish sprint, then revisit Phases 4 and 5.

---

## Next: Polish sprint (pulled forward from Phase 7)

### Polish session 1 — Practice Sessions polish

**1. sessionGenerator full weighting**
Wire the Step 2 algorithm helpers (pace urgency, freshness, acquisition weighting, multi-goal compounding) into `sessionGenerator.ts`. Currently the generator is minimum-viable — equal time to everything. This is the highest-impact item: the algorithm is fully built in Step 2 but not connected to the generator. Reference: `src/lib/sessionAlgorithm/` — all pure functions ready to consume.

**2. Block description redundancy fix**
Proposal card blocks show "HARMONIC FLUENCY / harmonic fluency · 3 min" — module name repeated twice. The lower line should be a meaningful activity description (e.g. "practice flashcards · 3 min"), not a repeat of the module name.

**3. Scales drill consolidation**
User preference: ascending and descending as separate drills plus a "both" option is redundant. The only drill type used is "both (up and down)". Consolidate to one drill type per scale.

### Polish session 2 — Mobile nav + Settings

**4. Mobile bottom tab nav**
On mobile, replace the horizontal icon strip with a proper bottom tab bar — four tabs: Goals, Dashboard, Practice, Modules. "Modules" opens a bottom sheet showing all module options. Desktop sidebar stays as-is (no change). Bottom sheet (not a screen) for the Modules picker. Skills Catalogue placement TBD at build time.

**5. Hard-block toggle in Settings**
Setting: "Block timer behavior" — "Auto-advance when time is up" (hard) vs "Prompt and wait" (soft). Default: hard. Plumbing built in Phase 3 (`hardBlock` on session state), needs a Settings UI surface.

**6. Practice History calendar view**
Show completed sessions on a calendar with module color dots, session duration, and block count. Becomes motivating once real sessions are accumulating.

### Polish session 3 — Investigate + fix

**7. HF minimum items banner investigation**
"Focus sessions with fewer than 4 items don't count toward fluency tiers" surfaced during Phase 3 walkthrough. Investigate whether this conflicts with how the session generator sizes HF blocks. May require a minimum item threshold check before scheduling HF blocks.

**8. Production vocab YouTube link**
On card answer reveal, show a small "Watch: [lesson title] ↗" link if the term has a relatedLesson with a youtubeLink. Opens in new tab. Data chain already exists: glossaryTerms[].relatedLessons[] → lessons[].youtubeLink.

---

## Already shipped as part of polish (May 2, 2026)

**Mode playback fix ✅**
All modes now play from their correct root note in Harmonic Diary. Scales & Modes module was already correct. Commit: 9475311.

**Production Vocabulary flashcards ✅**
199 cards generated programmatically from glossary.ts with 17 semantic clusters for decoy selection. Generic `FlashcardSession` component lifted from HF (HF wires through same shell). SM-2 persistence via shared db.flashcardStates. Daily goal bar at 10 cards. Full session UI matches HF pattern. Commits: 3e44369 → 24c64d8.

**Collapsible sidebar nav ✅**
Sidebar collapses to icon-only at md widths, horizontal icon strip on mobile with hamburger toggle. User preference persists. Commits: bde3ef8, 5ff0725.

**Proposal card overflow fix ✅**
w-full min-w-0 overflow-hidden at ProposalCard, SessionStack, and SessionBlock level. Commit: 88c2ad8.

---

## Phase 4 — Practice Sessions session roles + day coordination (DEFERRED)

**Reference docs:** `PRACTICE_SESSIONS_DESIGN_3.md` — Phase 4 section

**Scope:**
- Opener / middler / closer role detection
- Cross-session coordination within a day
- Day-level breadth tracking

**Dependency:** Phase 3 complete ✅. Needs real usage data before build is meaningful.

---

## Phase 5 — Goals: automation + end-of-period reviews (DEFERRED)

**Reference docs:** `PRACTICE_SESSIONS_DESIGN_3.md` — Phase 5 section

**Scope:**
- Goal progress auto-calculation from spacing state
- End-of-period review prompts
- Vacation return welcome-back surface
- Goal feasibility nudges at midpoints

**Dependency:** Phase 2 + Phase 3 complete ✅. Needs real usage data before calibration makes sense.

---

## Phase 6 — Within-day spacing (stub)

**Scope:** Within-day spacing for acquiring items (algorithm Step 6 stub from Phase 3 Step 2e).

**Dependency:** Phase 4 data structures.

---

## Phase 7 — Remaining polish + cleanup

Items not yet addressed:

- Song-detail page consumer of global timer + PracticeLogModal deprecation (Phase 7 cleanup)
- Smart parent-goal suggestion at goal creation
- End-of-period goal warning (goal created near period end)
- Vision-scope freeform text in GoalCreationFlow (Lifetime / 2–3 year goals)
- Section mutations (rename, reorder, split, archive, restore)
- Original key reassignment UI
- Diary features (transposition, mobile layout, visual feedback on play buttons)
- Audio source-module consistency pass
- songCrossKeyProgress table deprecation/drop
- SongDetailView.tsx pre-existing lint warnings
- Settings UI for backfill utility
- Cell interaction modal polish (mode toggle, clear all, reset count)
- "Just play" chord progression + beat loop surface (zero-goals fallback is currently Harmonic Diary placeholder)
- Legacy GoalFormModal deprecation (when all old-vocab goals aged out / migrated)
- **Block description tier 2 (production)** — wire a lesson-name resolver from `production/content/lessons.ts` so the proposal-card lower line surfaces specific lesson titles ("Workflow Foundations 1") instead of the tier-1 generic count. Small, self-contained.
- **Block description tier 2 (repertoire)** — join the song progression matrix into block descriptions so the lower line can surface song titles + sections + keys ("Mirror — Verse — C, G") per the original design doc Part 4. Larger lift; matrix data is in separate tables.

---

## Phase 8 — Learning + calibration

- Typical-week baseline
- Self-correcting day profiles
- Performance-based interval adjustment refinement

---

## Phase 3 detail — for reference

**986/986 tests passing. All 8 steps + 59 substeps shipped.**

Step 1 — Global session timer (1a–1e)
Step 2 — Algorithm pure logic (2a–2j, 116 tests)
Step 3 — Input questionnaire bottom sheet (3a–3h)
Step 4 — Two-card proposal screen (4a–4j)
Step 5 — Active session execution (5a–5d)
Step 6 — End-of-session summary + spacing writes (6a–6k, Dexie v20)
Step 7 — Practice Sessions home + feasibility banner (7a–7e)
Step 8 — Abundance flow (8a–8f)

**Key architectural decisions:**
- Session timer starts on first module arrival, not proposal accept
- activeModuleRef model (b): 'practice-sessions' on session screen, updates to block.moduleRef on quick-launch, resets on return
- Block expiry modal appears globally via Layout mount (not just on active session screen)
- Hard-block default: on for generated sessions; Settings toggle planned
- Two rating systems coexist: per-block Flying/Cruising/Crawling (skill signal) + per-session Locked in/Solid/Going through it (experience signal)
- sessionGenerator is minimum-viable — full Step 2 weighting not yet wired (first item in polish sprint)
- runEndOfSessionPipeline: single orchestration path used by both Done button and "End & start new" abandon path

---

## How to use this in Claude Code

**Starting a new session:**
1. Paste `WORKING_WITH_CLAUDE.md`
2. Paste this file (`BUILD_SEQUENCER_2.md`)
3. Paste the reference doc(s) for the current phase only
4. State which step you're resuming

**You do not need to paste all design docs every session.**

**After completing a phase or sprint:**
- Update the status in this file
- Update `DESIGN_DECISIONS_6.md` build state section
- Write a session summary

---

## Known deferred items (not yet scheduled)

**Section mutations** — rename, reorder, split, archive, restore for song matrix sections. Deferred from Phase 1.5.

**Original key reassignment UI** — user can change which key is designated as original. Schema supports it; UI not built.

**Vision-scope freeform text** — Lifetime / 2–3 year goals should swap structured target picker for open-text field per module.
