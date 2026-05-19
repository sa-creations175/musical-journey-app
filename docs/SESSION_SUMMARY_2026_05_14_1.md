# Session Summary — May 14, 2026

**Phase B (goal-pace-driven session planning) is fully complete.**

Started: continuing app build. Phase B Step 1 was the first task.
Ended: Phase B Steps 1–9 all shipped.

Tests: 1767 baseline → 1937+ (Step 9c added more, exact final count not tracked).

---

## What shipped (commits in order)

| Step | Description | Commit |
|------|-------------|--------|
| 1 | `timePerAttempt.ts` — single source of truth for time-per-attempt seeds | `aa353ea` |
| 2 | ScalesDrillModal writes DrillSession rows | `bfc78b7` |
| 3 | SongCellRunThrough rating + Production "Done — rate this session" flow | `dbff537` |
| 4 | ET sub-activity attempt counting (already solved by `db.attempts.moduleId`) | `7bb8699` |
| 5 | `computeModuleWeeklyNeeds` keystone + `getWeeklyRatedProductionAttempts` | _hash unrecorded_ |
| 6 | Wire keystone into `timeAllocation.ts`; delete `OVERFLOW_MEMORY_BIAS`; pace-aware overflow | `d2821b3` |
| 7 | `GoalsNeedTodayScreen` migrated; `dailyGoalNeed.ts` deleted | `c1a3367` |
| 7b | Today's-slice math via `computeModuleSessionNeed` pure formula | `95b2d2a` |
| 8 | Dynamic weekly target recomputed from monthly remaining; override prompt with time translation | `e913651` |
| 9a Parts A+C | Over-practice detection + 50%/25% time reduction | `388d570` |
| 9a Part B | Spacing floor expansion (`algoSpacingDemand.ts`) | `5ba0b94` |
| 9b Commit 1 | Carryover detection helpers + backlog candidate-pool lift | `09303a2` |
| 9b Commit 2 | Goals-home banner + per-module Accept/Decline review modal | `3580b9d` |
| 9b follow-up #1 | Strict uncovered (include untouched-in-scope) + Accept extends monthly scope | `05b9634` |
| 9b follow-up #2 | `getEffectiveCoverageCount` honors `relatedItems`; ET candidate filter unified | _hash unrecorded_ |
| 9c (data) | All 11 progression definitions + suggestion logic + yearly pace math | _hash unrecorded_ |
| 9c (UI) | Inline panel in GoalCreationFlow Step 2; one-tap Accept via `pendingRelatedItems`/`pendingTargetBump` | _hash unrecorded_ |

---

## Major design decisions made this session

All captured in `PHASE_B_SESSION_PLANNING_DESIGN.md` "Resolved During Build" section.

- **Keystone naming**: `computeModuleWeeklyNeeds` / `ModuleWeeklyNeed` (avoided collision with prototype)
- **Two layers, two responsibilities**: keystone returns weekly remaining for allocator; pure formula `computeModuleSessionNeed` returns today's slice for the screen
- **`pace` as discriminated string** (`'ahead' | 'on-pace' | 'behind'`), not three booleans
- **Pace tolerance inclusive** at both ±0.15 boundaries
- **`OVERFLOW_MEMORY_BIAS` deleted**, replaced with pace-aware overflow (real semantic shift in steady-state weighting)
- **Sub-module splits stay downstream** in `shapesSplit` / `repertoireSplit`, not at the allocator level
- **`factorByModule = 1.0` neutralization** only at the 2 Phase-B entry points
- **Weekly Goal record = implicit override** (current-week wins over recompute; past/future are display-only)
- **Override prompt threshold**: `max(5 abs, ceil(10% × dynamicTarget))`, inclusive at boundary
- **Over-practice mode simplified**: dropped all mix percentages (60/30/10, 70/30, 35/15/50 all rejected). Only thing genuinely new is the time reduction. Algo + candidate pool + pace urgency handle everything inside the slice.
- **Spacing floor for over-practice**: target is a target, not a cap. Slice expands when algo demand exceeds target, capped at tier.
- **Cross-month continuity decisions**: persistent banner on Goals home (not modal), explicit Accept/Decline per module, carryover backlog mechanic for items not in current scope
- **"Uncovered" includes untouched-in-scope items** (not just engaged-but-not-acquired) — banner overload handled at render layer, not data layer
- **Accept extends monthly goal scope** via `relatedItems` field; target adjusts naturally. Same downstream wiring for both carry-over Accept (9b) and progression Accept (9c).
- **All 11 module progressions defined** as source of truth for 9c suggestions:
  - S&P Chord Shapes (Layer 1: 6 triads + inversions, Layer 2: 5 sevenths + inversions, Layer 3: 7 depth stages)
  - S&P Scales (4 stages, pentatonic starting points bundled per key)
  - S&P Voice Leading (TBD, stub for now)
  - ET Intervals (1 stage)
  - ET Chord Recognition (T1, T2, T3a, T3b, T4, T5)
  - ET Chord Progressions (3 stages: Key Detection → Chord Motion → Full Progression)
  - ET Scales/Modes (Stage 1: 7 modes brightness-to-darkness; Stage 2: Harmonic + Melodic minor variants)
  - HF (4 stages by group)
  - Songs (uses `learningOrder` field)
  - Production Lessons (6 paths in order)
  - Production Vocabulary (6 stages mirroring lesson paths)
- **9c surfaces in GoalCreationFlow Step 2** (target picker), not Step 4 (review). Informs the decision, doesn't second-guess after.
- **9c Accept via generic `Draft.pendingRelatedItems` + `pendingTargetBump`** — one mutation surface, reuses 9b's downstream wiring.

---

## Known landmines / outstanding from session

- **HF/ET seed reconciliation**: `TIME_PER_ATTEMPT_MINUTES` says 20s, `TIME_PER_ATTEMPT_SECONDS` says 30s. Both preserved; reconciliation deferred.
- **Production seed**: 60 min midpoint of `PRODUCTION_TIME_RANGE_MINUTES` vs 45 min in original design doc. Both preserved; reconciliation deferred.
- **Context model**: still three-way (`keys` / `laptop` / `phone` / `mixed`). Phase B design doc called for binary refactor (`isAtKeyboard` / `isAwayFromKeyboard`); not yet done.
- **Cross-sub-area carry-over progress display**: fixed in 9b follow-up #2 — `getEffectiveCoverageCount` now honors `relatedItems`.
- **Banner overload for very large uncovered counts**: data layer is honest, banner copy renders the count as-is. UX framing tweak ("300+ items" abbreviation) is a render-layer follow-up if needed.
- **9c half-done two-choice UX**: implemented; real-use feedback will tell whether the choice between "complete current sub-area" vs "move to next progression" lands cleanly.
- **Steady-state weighting shift from `OVERFLOW_MEMORY_BIAS` removal**: pace-aware overflow replaces it. The pre-Phase-B "integration +1.5× Repertoire overflow bias" is gone. Worth feeling out in real use.

---

## Genuinely outstanding (next session candidates)

**Designed and ready to build:**
- Voice Leading submodule build (designed, display-only UI exists, no drill modal or DrillSession integration yet). Biggest single value-add — unblocks full S&P sub-module split (25/50/25 with VL active).
- Advanced Harmonic Learning design doc (tritone substitution, hybrid chords, slash chord ET expansion) — needs design first before any build.

**Polish:**
- Mobile audio panel ribbon (partial — toggles but doesn't collapse to ribbon).
- Banner overload UX framing for very large uncovered counts.

**Refactor:**
- Context model binary refactor (three-way → binary).

**Deferred (need real usage data first):**
- Phase 4+ day coordination.
- Phase 5 goal automation.
- Chord progression quiz (placeholder at weight=0).

---

## Workflow learnings captured this session

Captured in `WORKING_WITH_CLAUDE_CHAT.md` (created mid-session):

- Always hand off Claude Code prompts via the message compose tool (copier)
- One question or test at a time
- Update design docs at every decision point, not in batches
- Review Claude Code reports directly; don't outsource verification to Silas
- No rider commentary after handing off prompts
- Connect the dots before proposing — re-check prior decisions and downstream implications
- Contradicting prior decisions is allowed but must be explicitly named
- When uncertain, ask one specific question instead of dumping options
