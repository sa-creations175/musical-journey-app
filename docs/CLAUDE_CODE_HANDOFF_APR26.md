# Claude Code Session Handoff — April 26, 2026

Paste this alongside WORKING_WITH_CLAUDE.md and BUILD_SEQUENCER_2.md at the start of the next Claude Code session.

---

## Where things stand

Phase 1.5 is complete but not fully pushed. All steps 1–7 are committed locally. Before starting anything new, push to origin/main:

```
git push origin main
```

Vercel will auto-deploy.

---

## What was built in Phase 1.5 (all committed, not yet pushed)

1. Schema — 6 new tables (songMatrixSections, songKeys, songCells, songCellRunThroughs, songKeyRunThroughs, songKeyEngagements) + sync registration + proficiencyDefinitions seed update
2. Migration — matrixMigration.ts seeds songKeys from existing songs' proficiency states; section setup banner + flow on first matrix open
3. Matrix UI — keys-as-rows view, circle-of-fourths ordering, inline progress strips, song-level state header, section setup modal with chip + free-text + drag-to-reorder, cross-key follow-up modal
4. Cell interaction modal — attempt logging, BPM gate (≥ performance tempo − 10 BPM), consecutive clean count, Mark comfortable gate
5. Whole-song test modal — Comfortable → Solid gate, discrete-session (resets to 0/3 on each open), deliberate initiation from key strip
6. Solid decay + retest flow — fading (14 days) / lapsed (30 days) badges, retest modal, decay stickiness (engagement alone doesn't clear lapsed — only a passed retest does)
7. Goal modal song branch — matrix-aware song goal targeting (song-specific branch only; broader goal modal being redesigned in Phase 1.6)

---

## Known deferred items from Phase 1.5 (don't build these now)

- Cell interaction modal per-attempt mode toggle — P3 polish
- "Clear all session attempts" button — P3 polish
- "Reset cell historical count" — P3 polish
- Section mutations (rename, reorder, archive, restore, split) — later step
- Original key reassignment UI — later step
- songKeyEngagements logging — Phase 3
- songCrossKeyProgress table deprecation/drop — later cleanup
- Pre-existing SongDetailView.tsx lint warnings (lines 109, 116) — cleanup

---

## What's next — Phase 1.6

Do NOT start Phase 1.6 yet. It requires:
1. Phase 1.5 pushed to main (do this first)
2. A design session for Shapes & Patterns Proficiency (not yet done)

When ready to start Phase 1.6, paste:
- WORKING_WITH_CLAUDE.md
- BUILD_SEQUENCER_2.md
- GOAL_MODAL_REDESIGN.md
- SONG_PROGRESSION_DESIGN_3.md (for Song Repertoire Step 2 reference)

---

## Important design decisions made today (not yet in codebase)

### BPM gate for cell interaction modal
- One-sided: attempts count toward the 3-consecutive gate if BPM ≥ (performance tempo − 10)
- No upper cap — playing faster than target is fine and counts
- Already built in Phase 1.5 step 4

### Whole-song test — discrete session
- 3-consecutive gate resets to 0 on each modal open
- Each test session is a fresh demonstration
- Already built in Phase 1.5 step 5

### Solid decay model
- Decay signals drive Practice Sessions recommendations, not automatic demotion
- Key only reverts from Solid on failed retest or manual reset — not by time alone
- Already built in Phase 1.5 step 6

### Goal modal redesign (Phase 1.6 — NOT YET BUILT)
- Full redesign of GoalFormModal into a guided 4-step conversation
- Step 1: module cards (6 modules)
- Step 2: module-specific target surfaces
- Step 3: timeframe (scope cards)
- Step 4: review + optional note + save
- Current modal stays in place until Phase 1.6 ships
- Full spec in GOAL_MODAL_REDESIGN.md

### Shapes & Patterns proficiency vocabulary change (Phase 1.6 — NOT YET BUILT)
- Moves from garden vocabulary (Planting → Sprouting → etc.) to song vocabulary (Learning → Comfortable → Solid → Internalized)
- Reason: Shapes & Patterns is self-logged practice time, not accuracy-measured — same cognitive structure as Song Repertoire
- Tracking unit: per shape per key
- Proficiency gate: time logged + BPM achieved (thresholds TBD in design session)
- Requires dedicated design session before Phase 1.6 build starts

---

## Files to add to the project docs folder

These new docs were created today and should be saved to ~/Documents/musical-journey-app/docs/:
- BUILD_SEQUENCER_2.md (replaces BUILD_SEQUENCER.md)
- GOAL_MODAL_REDESIGN.md (new)
- SONG_PROGRESSION_DESIGN_3.md (already added in Phase 1.5 step 1)
