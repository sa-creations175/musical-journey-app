# Phase B — Goal-Pace-Driven Session Planning
**Status:** Design complete. Needs Claude Code review for implementation gaps.
**Date:** May 13, 2026

---

## Problem

The current session planner uses hardcoded `MEMORY_TYPE_DURATIONS` constants (e.g. "S&P gets 10-15 min, Repertoire gets 15-60 min") that have no connection to the user's actual coverage goals, weekly targets, or monthly pace. The weekly plan correctly computes "you need 325 HF attempts this week" but the session planner ignores this entirely and allocates fixed time slices.

Result: the weekly plan and session proposals are disconnected systems that contradict each other.

---

## Core Principle

**Attempts are canonical.** Goals are expressed as coverage targets (attempt counts). Time is derived from attempts × time-per-attempt. The session planner works backwards from goal-pace to compute time needed, not forward from fixed time constants.

---

## The Formula

For each module with an active coverage goal:

```
// Step 1: How many attempts remain this week?
attempts_remaining = weekly_target - attempts_so_far_this_week

// Step 2: How many sessions have been meaningfully completed?
fractional_days_completed = attempts_so_far_this_week ÷ daily_target
  where daily_target = weekly_target ÷ consistency_target_days

// Step 3: How many sessions are left?
potential_sessions_left = max(consistency_target - fractional_days_completed, 1)
// Also cap by calendar days remaining in week (can't have more sessions than days left)
potential_sessions_left = min(potential_sessions_left, calendar_days_remaining_in_week)

// Step 4: How many attempts does today's session need?
attempts_today = attempts_remaining ÷ potential_sessions_left

// Step 5: How much time does that require?
time_needed = attempts_today × time_per_attempt_seconds
```

---

## Time Per Attempt Seeds

Conservative defaults. Replace with rolling averages from actual practice data after ≥20 sessions worth of data per activity type.

### Declarative modules (HF, ET)
| Activity | Seed |
|---|---|
| HF flashcard | 30s |
| ET interval | 30s |
| ET chord recognition | 30s |

### S&P submodules (procedural)
| Activity | Seed |
|---|---|
| Chord shape — root/inv1/inv2/inv3 | 90s |
| Chord shape — fluid run | 120s |
| Scale — major | 30s |
| Scale — major pentatonic (per starting point) | 60s |
| Scale — natural minor | 90s |
| Scale — minor pentatonic (per starting point) | 60s |
| Voice leading — 2-5-1, dark tensions | 90s |
| Voice leading — diatonic cycle (8 chords) | 180s |

### Song Repertoire (integration)
| Mode | Trigger | Seed |
|---|---|---|
| Exploration | New section, no Cruising/Flying yet | 15 min per section |
| Drill | Section has reached Cruising/Flying | 2 min per section run-through |
| Whole-song | All sections comfortable in original key | 5 min per full run |

**Exploration → Drill transition:** First time a section is rated Cruising or Flying within a session, it immediately transitions to drill mode. The app offers to move to the next section.

**Within-session adaptivity:** If a section reaches drill mode faster than expected, the session can cover additional sections within the remaining time.

### Production
| Activity | Seed |
|---|---|
| Lesson session (surface + try now in Logic + optional YouTube) | 45 min |

---

## Dynamic Calibration

After ≥20 sessions worth of data per activity type, replace seeds with rolling averages:

```
avg_time_per_attempt(moduleRef, activityType, windowDays=14) {
  // Query db.drillSessions / db.attempts for recent history
  // Return average durationSeconds per attempt
  // Filter to last windowDays or last N sessions, whichever is more recent
}
```

**Data being captured (as of May 13 2026):**
- `db.drillSessions.durationSeconds` — actual elapsed drill time per cell
- `db.drillSessions.targetSeconds` — user's chosen countdown (newly added)
- `db.attempts` — ET/HF attempt timestamps
- Block-level `blockStartedAt` + `blockCompletedAt` — total wall-clock time including overhead (newly added)

**Overhead tracking:**
```
overhead_per_block = blockCompletedAt - blockStartedAt - sum(durationSeconds per cell)
```
This captures transition time, screen reading, rating UI — the "administrative" cost of a block. Feeds into more accurate session time estimates over time.

---

## Monthly Pace — Dynamic Weekly Target

Weekly targets are NOT fixed divisions of monthly target ÷ weeks. They recalculate dynamically based on remaining coverage and remaining time:

```
weekly_target = (monthly_target - covered_so_far_this_month) ÷ weeks_remaining_in_month
```

**No cap on weekly target** — honesty over comfort. If the math says 800 attempts, surface it with context:
> "To hit your monthly HF goal, you need 800 attempts this week (~80 min/day). Consider adjusting your monthly goal."

---

## Timeframe Hierarchy

### Yearly anchor
- Defines the ceiling ("cover everything in this module by year end")
- Informs monthly goal suggestions:
  ```
  suggested_monthly = (yearly_total - covered_so_far) ÷ months_remaining_in_year
  ```
- Shows time context: "That's ~X min of HF per day across your 5 practice days"
- Shows consequence: "At this pace you'll cover X% of your yearly anchor by December"
- Proactively suggests monthly goal adjustments when yearly pace is off track

### Monthly goal
- Primary coverage target
- Weekly target recalculates dynamically from monthly remaining
- When hit early (mid-month): over-practice mode (60/30/10 mix — see below)

### Weekly plan
- Derived from monthly pace, not fixed
- Feeds directly into session planner via Phase B formula

### Session
- Computed from weekly plan via Phase B formula
- GoalsNeedTodayScreen and session planner use same formula — one source of truth

---

## When Attempts Remaining ≤ 0 (Over-Practice / Monthly Goal Hit)

When `attempts_remaining ≤ 0` for a module (weekly or monthly target already met):

**Over-practice mode mix:**
- 60% — review items rated Crawling/Cruising (need more work)
- 30% — reinforce items rated Flying (shorter interval, cement retention)
- 10% — introduce new items from next coverage group (staged, 2-3 at a time)

This applies both when:
- Weekly target hit mid-week (over-practice for the week)
- Monthly target hit mid-month (over-practice for the month)

---

## Cross-Month Continuity

When a new month starts with uncovered items from the previous month:

1. **Spacing system handles it automatically** — uncovered items are still `acquiring` stage and surface at high weight regardless of monthly goal reset
2. **Soft prompt at month start** — "You covered 95/130 HF cards last month. Want to carry the 35 remaining into this month's goal?" User decides — not forced
3. **If accepted** — June goal = remaining 35 + new monthly target
4. **If declined** — fresh start, spacing system still surfaces uncovered items naturally

---

## Practice Consistency — Special Case

Practice Consistency is the **global denominator** in the Phase B formula. It defines `consistency_target_days` (e.g. 5 days/week) used in `potential_sessions_left`.

It does NOT get its own time slice. It's the framework that holds all other modules together.

Surface as a daily nudge in GoalsNeedTodayScreen when the user hasn't practiced today.

---

## Fallback — No Active Goal

When a module has no active coverage goal, fall back to `MEMORY_TYPE_DURATIONS` tier constants (existing behavior). Phase B only activates for modules with active goals.

---

## GoalsNeedTodayScreen Integration

GoalsNeedTodayScreen ("What your goals need today") must use the Phase B formula, not `dailyGoalNeed.ts`'s simpler calculation. One source of truth. Both the pre-session screen and the session planner compute from the same function.

---

## Implementation Notes for Claude Code

### New helper needed: `computeSessionNeedByModule(userId, now)`
Returns per-module `{ attemptsToday, timeNeededSeconds, isOverPractice }` using Phase B formula.

Inputs needed per module:
- `weekly_target` — from existing weeklyDerivation.ts
- `attempts_so_far_this_week` — query db.attempts / db.spacingState by week start
- `consistency_target_days` — from active consistency goal
- `calendar_days_remaining_in_week` — derived from now
- `time_per_attempt_seconds` — from seeds table (or rolling average when available)

### Replace in timeAllocation.ts
`distributeTime()` should accept per-module time needs from `computeSessionNeedByModule` instead of (or alongside) `MEMORY_TYPE_DURATIONS`. When Phase B data is available for a module, use it. When not, fall back to tier constants.

### Update weeklyDerivation.ts
Dynamic weekly target recalculation:
```
weekly_target = (monthly_target - covered_so_far) ÷ weeks_remaining_in_month
```
Replace fixed weekly target with this formula.

### Update GoalsNeedTodayScreen
Replace `dailyGoalNeed.ts` calculation with `computeSessionNeedByModule`.

---

## Resolved Design Decisions

### Decision 1: Weekly override behavior
When Phase B recomputes a different number than the user's manual weekly override, show a prompt with time translation:
> "Your monthly pace needs 325 HF attempts this week (~33 min/day). You planned 200 (~20 min/day). Update to stay on track?"

User sees consequence in real minutes and makes an informed choice. If they keep the override, show consequence: "You'll cover ~87% of your monthly goal." No guilt, just honesty.

Phase B respects the override if kept. Uses live recompute if updated.

### Decision 2: Repertoire exploration vs drill mode
- Add `rating: 'flying' | 'cruising' | 'crawling'` to `SongCellRunThrough`
- Exploration mode trigger: no Cruising/Flying rating yet on this section
- Drill mode trigger: first Cruising/Flying rating on a section
- Drill mode seed: **5 min** per section run-through (not 2 min)
- Within-session adaptivity: first Cruising/Flying during a session → immediate offer to move to next section

### Decision 3: ET sub-activity granularity
Split attempt counting by sub-activity from day one:
- ET: intervals, chord recognition, chord progressions (future) — separate buckets
- S&P: chord shapes, scales, voice leading — separate buckets
- HF: sub-categories if/when they diverge

Every sub-activity with a different time seed gets its own attempt bucket.

### Decision 4: Production lesson attempts
Self-reported Flying/Cruising/Crawling rating at end of each lesson session. Attempt counts when rating is submitted. Also capture timestamps (lessonStartedAt, lessonEndedAt, durationSeconds) for future calibration. Consistent with rest of app.

Add rating prompt when leaving a Production lesson.

### Decision 5: S&P sub-module attempt counting
All S&P submodules write DrillSession rows:
- Chord shapes ✅ already does this
- Scales — fix ScalesDrillModal to write DrillSession rows (currently only writes to spacingState)
- Voice Leading — write DrillSession rows from day one when built

getWeeklyAttempts works consistently across all three S&P submodules.

### Decision 6: Canonical seeds module (FIRST BUILD STEP)
Create `src/lib/sessionAlgorithm/timePerAttempt.ts` as the single source of truth for all time-per-attempt seeds. All other files import from it. Consolidates constants currently scattered across:
- weeklyAttempts.ts
- dailyGoalNeed.ts  
- timeAllocation.ts
- shapesSplit.ts
- sessionGenerator.ts

This is the first commit of Phase B — without it, Phase B becomes the fifth source of truth.

---

## Sub-Module Split — Phase B Drives All The Way Down

Phase B drives time allocation at the sub-module level, not just module level. Each S&P sub-module has its own attempt target from goals and gets its own time slice.

### S&P sub-module allocation
```
scales_time = scales_attempts_today × time_per_scale_attempt
chord_shapes_time = chord_shape_attempts_today × time_per_chord_attempt
vl_time = vl_attempts_today × time_per_vl_attempt (Phase 2)
S&P_total = scales_time + chord_shapes_time + vl_time
```

### Sub-module fallback ratios (when no active goal for a sub-module)
- Without VL: Scales 30% / Chord Shapes 70%
- With VL: Scales 25% / Chord Shapes 50% / Voice Leading 25%

### Repertoire sub-module allocation
```
sotm_time = sotm_attempts_today × time_per_sotm_attempt
maintenance_time = maintenance_attempts_today × time_per_maintenance_attempt
Repertoire_total = sotm_time + maintenance_time
```

Fallback ratio: SotM 75% / Maintenance 25% (existing 3:1 split)

### Conflict resolution (total exceeds available time)
Scale proportionally — each sub-module gets its fair share of what's available, preserving relative ratios of what Phase B computed.

---

## Standard Fallback Ratios (no active goals)

Used when Phase B has no goal data for a module or sub-module.

### Keys/Mixed sessions
- S&P total: 33% of session
- Repertoire total: 67% of session
- Within S&P (no VL): Scales 30% / Chord Shapes 70%
- Within S&P (with VL): Scales 25% / Chord Shapes 50% / VL 25%
- Within Repertoire: SotM 75% / Maintenance 25%

**Example 60-min Keys session:**
- S&P: 20 min (Scales 6 min / Chord Shapes 14 min)
- Repertoire: 40 min (SotM 30 min / Maintenance 10 min)

### Away sessions (laptop or phone)
- Production lessons: 45%
- ET: 30%
- HF: 20%
- Production Vocab: 5%

### Phone-optimized away sessions
- ET: 35%
- Production lessons (read + YouTube): 25%
- HF: 25%
- Production Vocab: 15%

---

## Context Model — Binary (replaces three-way Keys/Laptop/Phone)

**At keyboard (Keys/Mixed):** Full access to all modules including keyboard skills
**Away from keyboard:** Everything EXCEPT physical keyboard skills

Physical keyboard skills (Keys only):
- Matrix practice (song sections)
- Chord shape drills
- Scale drills
- Voice leading drills
- Whole-song run-throughs

Everything else (any context):
- HF flashcards
- ET ear training
- Production lessons (try now requires laptop specifically)
- Production vocab
- Lead sheet setup
- Mental visualization/practice
- Chord progression quiz
- Goal setting/review

The session context picker becomes:
- "I'm at my keyboard" → Keys session
- "I'm away from my keyboard" → Away session

---

## Legacy Systems to Deprecate/Replace

### 1. MEMORY_TYPE_DURATIONS + MODULE_DURATION_OVERRIDES
**Action:** Keep but gate. Only used when Phase B returns null for a module (no active goal).
**Gate:** `if (phaseB.hasGoal(moduleRef)) use phaseB else use tierConstant`

### 2. OVERFLOW_MEMORY_BIAS
**Action:** DELETE. Replace with: overflow distributed proportionally to behind-pace modules first, then equal split for on-track modules.

### 3. factorByModule double-counting urgency
**Action:** When Phase B is active for a module, set factorByModule = 1.0 (neutral) for that module. Phase B handles urgency through time allocation — weight boosting on top is double-counting.

### 4. Frozen weekly Goal records
**Action:** Display-only. Frozen weekly records shown in WeeklyPlan modal as reference but never fed into session planning. Phase B always live-recomputes from monthly remaining.

### 5. dailyGoalNeed.ts
**Action:** DELETE after Phase B ships. GoalsNeedTodayScreen uses computeSessionNeedByModule instead.

### 6. Context filter (Keys/Laptop/Phone three-way)
**Action:** Replace with binary isAtKeyboard / isAwayFromKeyboard. Update contextWeighting.ts and session generator to use new binary model.

### 7. Chord quiz warm-up fixed 3 min
**Action:** Leave as-is for now. Not goal-driven. Revisit when chord progression quiz (Phase B feature) is built.

### 8. forceIncludeModules behind-pace banner
**Action:** REMOVE. Phase B handles urgency through time allocation. Binary context model means Away sessions already include HF/ET — no forcing needed.

---

## Build Sequencing

**Step 1 (first):** `timePerAttempt.ts` — canonical seeds module. Consolidate all scattered constants. No behavior change yet, just consolidation.

**Step 2:** Fix scale drill attempt counting — ScalesDrillModal writes DrillSession rows.

**Step 3:** Add `rating` to SongCellRunThrough. Add Production lesson rating prompt + timestamps.

**Step 4:** Split ET attempt counting by sub-activity (intervals vs chord recognition).

**Step 5:** `computeSessionNeedByModule()` — the keystone function. Pure, fixture-driven tests. HF/ET first (cleanest data), then S&P, then Production, then Repertoire.

**Step 6:** Wire into `timeAllocation.ts` — Phase B time budgets replace tier constants for modules with active goals. Tier constants remain as fallback.

**Step 7:** Update `GoalsNeedTodayScreen` to use `computeSessionNeedByModule`.

**Step 8:** Dynamic weekly target — update `weeklyDerivation.ts` to recompute from monthly remaining. Add weekly override prompt with time translation.

**Step 9:** Over-practice mode, cross-month continuity, yearly anchor suggestions (Phase B.2 — safe to defer).

---

## Resolved During Build (Steps 1–7, May 14 2026)

This section captures decisions made while building Phase B that diverge from, refine, or add to the spec above. The original spec is intentionally preserved — these are the deltas.

### Naming divergence
The spec calls the keystone `computeSessionNeedByModule`. The build collided with an existing prototype of that name in `sessionNeed.ts`. Decision: coexist. The new pure keystone is `computeModuleWeeklyNeeds` / `ModuleWeeklyNeed` / `loadModuleWeeklyNeeds` in `src/lib/sessionAlgorithm/moduleWeeklyNeed.ts`. The prototype's async loader was deleted in Step 7; the prototype's pure formula `computeModuleSessionNeed` was kept (still used by GoalsNeedTodayScreen for the today's-slice math — see Step 7b below).

### Two layers, two responsibilities
- **`computeModuleWeeklyNeeds` (keystone)** returns `estimatedMinutesNeeded = remainingAttempts × time_per_attempt_seed` — the **whole week's remaining work**. This feeds the allocator (`timeAllocation.ts`).
- **`computeModuleSessionNeed` (pure formula)** returns today's slice using the full design-doc formula (fractional_days_completed, potential_sessions_left, attempts_today, time_needed). This feeds `GoalsNeedTodayScreen`.

Both layers coexist deliberately. The allocator needs weekly remaining for proportional scaling; the screen needs today's slice for the user-facing "what do I do right now" number.

### Pace shape
`pace` is a single discriminated string (`'ahead' | 'on-pace' | 'behind'`), not three booleans. The three states are mutually exclusive — same modeling convention as `SongCellState`, `keyState`.

### Pace tolerance boundaries
Inclusive at both ±0.15 boundaries. An actual fraction exactly at expected ± 0.15 reads as on-pace. Strict inequality elsewhere.

### Pace pill colors (UI)
- `behind` → amber (matches existing BehindPaceBanner)
- `ahead` → fluent (app's positive cue)
- `on-pace` → neutral

### ET sub-activity attempt counting — already solved
`db.attempts.moduleId` already distinguishes intervals vs chord recognition (and chord-progressions, scales-modes) by design. No schema change needed. New helper `getEarTrainingAttemptsBySubActivity` returns `{ intervals, chordRecognition, total }` — purely additive over the existing `getWeeklyAttempts('ear-training', …)` query.

### ET sub-entries on `ModuleWeeklyNeed`
Carry completed-counts only, not full-shape needs. The current goal model targets `'ear-training'` as a whole; there are no per-sub-activity weekly targets. Sub-targets would be a goal-model feature change, not a keystone change. Step 6's allocator uses the completed split to divide ET time proportionally between sub-activities.

### Production attempts diverge from `getWeeklyAttempts('production')`
Phase B counts **rated `ProductionLessonSession` rows** for the week (from Step 3), not the legacy `spacingState.performanceHistory` walk. New helper: `getWeeklyRatedProductionAttempts(weekStart, weekEnd)`. Both helpers preserved at their distinct call sites.

### Production seed value — known landmine
The spec says lesson session = 45 min. `timePerAttempt.ts` only has `PRODUCTION_TIME_RANGE_MINUTES = {min: 30, max: 90}` (midpoint 60). The build uses the midpoint (60) because that's what's in the canonical seeds module and what the prototype `dailyGoalNeed.ts` was already using. Adding a third value (45) was explicitly avoided under the "no third HF/ET value" / "single source of truth" rule. **Reconcile decision deferred.**

### HF/ET time-per-attempt — known landmine
`TIME_PER_ATTEMPT_MINUTES` (legacy) says 20s; `TIME_PER_ATTEMPT_SECONDS` (Phase B) says 30s. Both preserved as-is during consolidation. **Reconcile decision deferred.** Documented in `timePerAttempt.ts`.

### `expected fraction = day index / 7` is clamped
Day index clamped to [0, 6] inclusive. Maximum expected fraction is 6/7 ≈ 0.857. You're never expected to be at 100% until the week is fully over. Consistent with `calendarDaysRemainingInWeek` semantics (Sat = 1 day left, not 0).

### `today` clamped into `[weekStart, weekEnd]`
A `today` outside the week (e.g. Monday-morning click on data fetched Sunday night) can't push the day index negative or past 6. Both ends tested.

### Overflow distribution replaces `OVERFLOW_MEMORY_BIAS`
`OVERFLOW_MEMORY_BIAS` deleted (it was localized — ~30 lines, one call site). Replaced with pace-aware overflow:
- If any block is behind pace → all overflow goes to behind-pace blocks, proportional to `block.weight`. On-pace blocks stay at typical-high.
- If no block is behind → equal split across every block.

`paceByBlock` threaded through `allocateBlockTime → distribute → distributeOverflow` and through `proposal.ts` (`generateProposals → buildBalancedProposal`). Legacy callers without pace data get the equal-split default.

### Steady-state weighting shift (real semantic change)
The pre-Phase-B "integration +1.5×" Repertoire overflow bias is gone. A 60-min Keys session where Repertoire is behind pace still claims the overflow; where it's on pace, time splits equally with Shapes. More honest, more goal-driven — but a real change from prior behavior. Worth verifying in real-world use over the next few sessions.

### `factorByModule` neutralization scope
Set to 1.0 **only** at the two Phase-B entry points in `sessionGenerator.ts` (via `neutralizePhaseBPaceFactors`). Path-filtered and fallback aggregations don't use Phase B time allocation, so the weight boost there isn't double-counting — the spec's rationale doesn't apply.

### Focused proposal — `paceByBlock` accepted but unused
`buildFocusedProposal` accepts `paceByBlock` for surface symmetry but treats it as a no-op. The focused allocator has no typical-high overflow branch (its design is "let the chosen block stretch past typical-high"), so pace-aware overflow doesn't apply. Param renamed `_paceByBlock` with inline comment.

### Sub-module splits stay downstream
S&P (Scales/Chord Shapes/VL) and Repertoire (SotM/Maintenance) sub-splits are **NOT re-implemented in the allocator**. The allocator sees each as one `AlgorithmBlock` with a `plannedSeconds` total; the sub-split happens downstream in `shapesSplit` / `repertoireSplit`, which already implements the fallback ratios from the spec. Phase B's job at the allocator level is just to set `plannedSeconds` correctly. Sub-splits operate on the new total.

### Context model NOT changed in Phase B build
The three-way Keys/Laptop/Phone → binary `isAtKeyboard` / `isAwayFromKeyboard` refactor is separable from Phase B wiring and was not done in Steps 1–7. Phase B wiring lives at the time-budget layer; the context filter / weight-multiplier layer (`contextWeighting.ts`) is untouched. The binary refactor is a follow-up step.

### Schema bump: Dexie v21 → v22
Added optional fields:
- `SongCellRunThrough.rating?` — `'flying' | 'cruising' | 'crawling'`
- `ProductionLessonSession.rating?` — same union
- `ProductionLessonSession.startedAt?` — lesson page-enter timestamp

All non-indexed; ride the data blob; no `.upgrade()` migration needed. Existing rows have no rating (absence = pre-rating data).

### Production rating flow — explicit done, not navigate-away
Chose an explicit "Done — rate this session" button + modal over navigate-away interception. The lesson page has too many exit paths (router back, browser back, sidebar nav, query-param routing). Navigate-away interception would be fragile; the explicit flow is clean — the rating modal is the only path to `recordLessonRating`, so leaving by any other route writes no rated row.

### Production rating row shape
Stored as a separate activity row (`ProductionLessonSession`), not on the lesson record itself. Matches existing pattern: `ProductionLessonSession` is already the per-visit activity log. The rated row is distinct from passive `recordLessonOpen` rows. `timestamp` doubles as `lessonEndedAt`; only `startedAt` is genuinely new. `openedDeepDive: false` on rated rows (deep-dive engagement captured separately).

### `SongCellRunThrough.rating` is optional
Notes-only saves on cell modal don't require a rating. The schema field is optional; the picker is prominent but skippable. Forcing a rating on every quick correction would be more disruptive than warranted. **Implication for Step 5+:** repertoire logic must treat `rating === undefined` as "unrated attempt," not skip the row.

### `DrillSession` schema has no `subModule` field
`getWeeklyAttempts('shapes-and-patterns', …)` filters by **timestamp window only** — every row in the window counts as one S&P attempt. Scale rows and chord shape rows both count; differentiation comes from `skillId` pattern, not a schema field. Scale `DrillSession.skillId` preserves pentatonic starting point (e.g. `scale:major-pentatonic:5:Eb`) — critical for `spacingState` consistency.

### Scale rating mapping is lossy
Scale modal uses 3-point feel scale (Flying/Cruising/Crawling); `DrillSession.feelRating` is 4-point. `crawling → feelRating 1` ("Struggled" — matches the modal's "struggle, breakdowns" copy). Documented at `RATING_TO_FEEL`.

### `dailyGoalNeed.ts` deleted in Step 7
Single production consumer was `GoalsNeedTodayScreen`. Migrated to new `loadGoalsNeedToday` (in `src/modules/practice/goalsNeedToday.ts`). The async `computeSessionNeedByModule` loader from `sessionNeed.ts` also deleted. The pure formula `computeModuleSessionNeed` kept (see Two layers, two responsibilities above).

### Practice Consistency nudge copy
"Today's session hasn't started yet — keeping the streak alive." Friendly, non-shaming, distinct from a per-module row. Shown when no `db.practiceSessions.startedAt` row exists for today.

### "Practiced today?" signal
`db.practiceSessions.where('startedAt').above(dayStart - 1).count()` — not `lastEngagedAt`. The practiceSessions row is the canonical "session happened" record.

### Testing convention
No React DOM testing in this codebase. View-model logic extracted into pure helpers (`summarizeGoalsNeedToday`) and tested as fixtures. Adding `@testing-library/react` would be scope creep for a single screen.

### Step 7b (this session, prompt out): today's-slice math on GoalsNeedTodayScreen
Step 7 inadvertently surfaced weekly remaining instead of today's slice in the per-module minutes value. Fix: `summarizeGoalsNeedToday` calls the pure `computeModuleSessionNeed` formula per module to get today's slice. The keystone stays unchanged (continues serving weekly remaining to the allocator). One extra cheap call per module on the screen path.

### UX regression flagged: consistency-only users
The keystone surfaces only modules with active weekly coverage goals (`targetUnit: 'attempts'`). Users with only consistency goals (e.g. `shapes_days_per_cadence`) see an empty screen and fall through to the questionnaire. This matches the spec ("Phase B only activates for modules with active goals"), but it's a real regression for that user shape. Practice Consistency module is covered by the daily nudge; other consistency-only modules are not.


### Step 7b — today's-slice math shipped
- `summarizeGoalsNeedToday` signature changed from positional `(needs, practicedToday)` to object input: `SummarizeGoalsNeedTodayInput { needs, practicedToday, consistencyTargetDays, calendarDaysRemainingInWeek }`. The two new fields are global cadence inputs (not per-module), so they live on the summarizer input, not on `ModuleWeeklyNeed`.
- `GoalsNeedTodayEntry.remainingAttempts` renamed to `attemptsToday`. Keystone's `ModuleWeeklyNeed.remainingAttempts` is unchanged and still means weekly remaining. Two different concepts, two different field names.
- `timePerAttemptSeconds` derived from the keystone's existing fields: `(estimatedMinutesNeeded × 60) ÷ remainingAttempts` recovers the seed exactly because that's how the keystone constructs the value. Over-practice (`remainingAttempts = 0`) short-circuits before the seed multiplies, so the 0/0 case is harmless. No new cross-module imports needed.
- `loadGoalsNeedToday` does three parallel Dexie reads: keystone, practice-session count, consistency goal. Two `db.goals.toArray()` calls per page load (one inside keystone, one in `loadConsistencyTargetDays`) — small inefficiency, documented inline. Consolidating would require changing `loadModuleWeeklyNeeds`'s signature, which was out of scope.
- `SummarizeGoalsNeedTodayInput` exported as a type for test fixture readability.

### Step 8 — dynamic weekly target + override prompt shipped

**Weekly Goal record = implicit override (Legacy #4 + Decision 1 reconciled)**
Apparent tension between Legacy #4 ("frozen weekly Goal records become display-only") and Decision 1 ("Phase B respects the override if kept") resolves under this interpretation:
- A **current-week** weekly Goal record IS the user's confirmed plan — the explicit override created when they confirmed the WeeklyPlan modal. It wins over the live recompute.
- **Past or future** weekly Goal records are frozen / display-only — shown in WeeklyPlan modal as reference but never fed into session planning.
- The existing `loadModuleWeeklyNeeds` date-range filter (`g.startDate > today || g.targetDate < today` are dropped) already does this work. No schema flag, no Dexie bump, no `isUserOverride` migration needed.

**Live recompute fallback**
`recomputeWeeklyTargetForMonthlyGoal` fires only when no current-week weekly Goal record exists for the module. With a confirmed weekly record, the recorded target wins (the implicit override path). This preserves stickiness — the recompute does not silently overwrite a confirmed plan.

**Override prompt placement**
WeeklyPlan modal — `OverrideDivergencePrompt`. The modal is already where the user reviews their weekly plan, already loads goals + consistency + divergence math. No second surface (Goals home, GoalsNeedTodayScreen) added.

**Override prompt scoping — HF/ET only**
The prompt currently fires only for HF/ET. S&P / Repertoire / Production need the seed reconciliation work flagged earlier (45 vs 60 Production seed, 20s vs 30s HF/ET seed). Extending the prompt to those modules is deferred until that reconciliation happens.

**Meaningful-disagreement threshold**
`overridePromptThreshold(dynamicTarget) = max(5 absolute, ceil(10% × dynamicTarget))`. Inclusive at the boundary (diff exactly equal to threshold prompts). Rationale:
- 1-attempt drift is noise (often a `Math.ceil` rounding boundary) — explicitly excluded.
- 5 absolute floor catches the low-target case (a 10-attempt week shouldn't prompt over a 1–2 attempt difference).
- 10% relative scales for big targets: 325 → ≥ 33 diff prompts; 800 → ≥ 80 diff prompts.

**No cap on weekly target**
The recompute never clamps. If math says 800, the keystone surfaces 800 and the override prompt explains the time consequence. The user can accept (live recompute), keep their lower plan (consequence: covers X% of monthly), or adjust the monthly goal itself.

**Cross-month boundary — explicit non-scope (still)**
When `monthly.targetDate <= now`, `recomputeWeeklyTargetForMonthlyGoal` returns null → module produces no entry. Phase B.2's carry-over prompt remains the future enhancement.


### Step 9a — Over-practice mode (REVISED — significant contradiction with original spec)

**This contradicts the original "Over-Practice / Monthly Goal Hit" section.** The original 60/30/10 mix (60% Crawling/Cruising review, 30% Flying reinforcement, 10% new material) and the "same mix applies to weekly and monthly" rule are replaced by a much simpler model that respects the existing foundational systems.

**Why the contradiction:**
The original mix percentages override the spacing algorithm by constraining WHICH items get surfaced. But the spacing algorithm is the foundation of the whole app. The Flying/Cruising/Crawling ratings are signals the algorithm uses to compute review intervals — they are not categories for time allocation. Imposing percentage mixes on top of the algorithm forces dumb percentages to override the algorithm's smart per-item decisions.

The app already has all the infrastructure needed for over-practice behavior:
- `getCandidatesForGoal()` already pulls uncovered items (items not yet in `acquired/consolidated/mastered` stages, plus items with no spacingState row) into the candidate pool for coverage goals.
- Pace-based urgency already escalates boosts for items behind pace at weekly, monthly, AND yearly horizons. When weekly is hit but monthly/yearly are not, pace-urgency at the higher horizons naturally pulls uncovered items toward the surface.
- Acquisition stage is auto-detected from engagement signals — no user declaration or mode toggle needed.
- The spacing algorithm itself handles when Crawling/Cruising/Flying items are due for review.

So when weekly pace classifies as "ahead" (over-practice), the algorithm is already doing the right thing — surfacing items due per their spacing schedule, naturally weighted by pace-based urgency at the higher horizons that are NOT yet hit.

The only thing genuinely new in over-practice mode is the **time reduction**.

**Final over-practice mode spec:**

- **Weekly over-practice (monthly not yet hit):** target time = 50% of tier constant.
- **Monthly over-practice (monthly hit):** target time = 25% of tier constant.
- **Spacing floor:** target is a target, not a cap. If the spacing algorithm flags more items as due than the target time accommodates, the slice expands to meet algo demand. Cap at the tier constant (never larger than normal).
- **Time saved** (target minus actual after spacing-floor expansion) flows to behind-pace modules per Step 6's pace-aware overflow logic.
- **What gets practiced inside the slice:** whatever the existing algorithm + candidate pool + pace-based urgency surfaces. No mix percentages, no empty-bucket rule, no new-material N. The existing systems handle everything else.

**Concrete example, monthly over-practice (HF, normal tier = 15 min):**

*Light spacing day:*
- Target: 25% of 15 min = 3.75 min
- Algo says 3 items due ≈ 1.5 min
- Slice = max(3.75, 1.5) = 3.75 min
- Inside the slice: algo surfaces the 3 due items + 4-5 more candidates with pace-urgency boost (uncovered items toward the monthly/yearly horizons)
- Saved time: ~11.25 min flows to behind-pace modules

*Heavy spacing day:*
- Target: 3.75 min
- Algo says 12 items due ≈ 6 min
- Slice = max(3.75, 6) = 6 min (target overridden by algo demand)
- Inside the slice: algo surfaces the 12 due items
- Saved time: ~9 min flows to behind-pace modules

**Discarded along the way (do not revisit without strong reason):**
- 60/30/10 mix from original spec — overrides algorithm
- 70/30 empty-bucket rule — overrides algorithm
- 35/15/50 mix proposal — overrides algorithm
- Explicit "new material N per session" parameter — redundant with existing candidate pool + pace urgency


### Step 9b — Cross-month continuity (designed, not yet built)

**Trigger: persistent banner on Goals home.**
Surfaces when last month had uncovered items from its monthly goal target AND this month's monthly goal either hasn't been set or was set without carrying over. Banner copy lists per-module leftover counts (e.g., "Last month: 30 HF, 12 ET, 45 S&P items uncovered"). Tapping opens a carry-over review flow with per-module accept/decline.

Does NOT interrupt practice. No modal at session start.

**Carry-over model: extends monthly goal SCOPE.**
- Accept: leftover items get added to this month's monthly goal scope. Target count adjusts naturally (matches how coverage goals already work).
- Decline: leftover items still exist in yearly anchor pool — they surface via yearly-anchor pace urgency, but with less priority than items in this month's monthly target.
- All-or-nothing per module. Can carry over HF leftovers but skip S&P leftovers.

**Definition of "uncovered last month":**
Items that were in last month's monthly goal target list but didn't reach `acquired/consolidated/mastered` by month end. Explicitly excludes:
- Items that weren't in last month's monthly goal at all
- Items that already reached acquired/consolidated/mastered during the month

**Mid-month goal change edge case:**
Only the LAST configured target counts. If you abandoned augmented triads on May 15 and switched to minor 7ths, augmented leftovers don't carry over — they're unfinished from an earlier plan, not "leftover" from end-of-month.

**Dismiss behavior:**
Banner persists until user takes one of two explicit actions:
1. Opens the carry-over flow and accepts/declines per module (also sets this month's monthly goal)
2. Taps X to dismiss "skip this month" — banner hidden for the rest of this month

No auto-dismiss based on time. No silent disappearance.

**No-existing-goal-yet handling:**
If user hasn't set this month's monthly goal when they open the carry-over flow, the flow routes through GoalCreationFlow pre-populated with leftover items as the starting scope. User can add more on top.

**Alignment with 9c:**
Decisions here may need revisiting once 9c yearly anchor suggestions is designed. Both fire at month boundary, both touch monthly goal setup. Flagged for cross-check.


### Step 9b refinement — Carryover backlog mechanic

When user X-dismisses the carry-over banner OR sets a monthly goal without carrying over, the uncovered items don't vanish — they enter a **carryover backlog**: a running list of uncovered items from previous months that's always part of suggestion logic until those items are covered.

This gives the system three priority layers for surfacing items:
1. Items in this month's monthly goal scope (highest priority)
2. Items in carryover backlog (medium — surfaced in 9c suggestions)
3. Items just in yearly anchor pool with pace urgency (lowest)

The backlog never blocks user agency. It just ensures items the user once committed to don't fall out of consideration entirely.

---

### Step 9c — Yearly anchor suggestions (designed, not yet built)

**Trigger: inline within GoalCreationFlow / monthly goal review.**
Yearly anchor suggestions surface as informational anchors WHEN the user is creating or reviewing a monthly goal. Not a separate prompt, not a banner — visible context inside the existing goal flow.

**What's displayed inline:**
- Yearly pace recommendation: `(yearly_total − covered_so_far) ÷ months_remaining_in_year`
- Current scope target (including any 9b carry-over already applied)
- Time context: estimated min/day across practice days
- Consequence: "At this pace you'll cover X% of your yearly anchor by Dec 31"

**Level of guidance: Option B (actionable progression suggestion) with Option A fallback.**
When the natural progression order has a clear "next thing" given current scope, surface a specific actionable suggestion:
> "Add minor triads in 12 keys to your scope (+12 toward yearly pace target of 143)"
One-tap accept extends the scope with the suggested progression item.

When ambiguous (partial sub-area coverage, multiple equally valid next steps), fall back to Option A: show info only, no specific suggestion, user picks manually via GoalCreationFlow.

**Important framing:** the suggestion delivers a concrete progression step TOWARD yearly pace, not a claim to hit it. Honest gap shown alongside the suggestion. User can accept multiple suggestions to close the gap further.

**Half-done sub-area UX:**
When user's scope partially covers a stage (e.g., "augmented triads in 5 of 12 keys"), 9c surfaces TWO clear options:
> "You have 5 of 12 augmented triad keys covered. Options:
> - Complete augmented triads in remaining 7 keys (+7)
> - Move to next: minor triads in 12 keys (+12)"

User picks. Both options are honest. This is a distinct UX from the standard "next progression item" suggestion.

**Edge cases:**
- **No yearly anchor exists for the module:** Hide 9c entirely. The existing "set yearly anchor" backstop prompt in by-module view handles that case.
- **Current target ≥ yearly pace:** Affirm rather than push. Show "On track for yearly pace this month" or similar; no progression suggestion needed.

**9b ↔ 9c layering:**
They layer cleanly. 9b modifies scope first (adds leftover items via carry-over). 9c then evaluates the resulting target vs yearly pace and suggests progression only if still under. The carryover backlog (9b refinement above) feeds into 9c's suggestion candidate pool as the medium-priority layer.

---

### Module-by-module progression source-of-truth (for 9c suggestions)

Per-module ordered list of progression stages. Each stage has a name, an item set (defined by itemRef pattern), and an item count. The 9c suggestion logic walks the progression in order, identifies the next stage with items not in current scope, and surfaces it as the suggestion.

#### S&P Chord Shapes

**Layer 1: Triads (48 items per stage = 12 keys × 4 positions)**
1. maj triad + all inversions
2. min triad + all inversions
3. dim triad + all inversions
4. aug triad + all inversions
5. sus2 triad + all inversions
6. sus4 triad + all inversions

**Layer 2: 7ths (48 items per stage)**
7. maj7 + all inversions
8. min7 + all inversions
9. dom7 + all inversions
10. min7b5 + all inversions
11. dim7 + all inversions

**Layer 3: Depth by quality (item counts vary)**
12. Major extensions (9, 13)
13. Minor extensions (9, 11)
14. Various dominant chords (including 7sus4, sus4 dominants)
15. Altered chords / bright + dark tensions (cross-reference VL design doc)
16. Slash chords
17. add9 / add11
18. min(maj7), augmaj7

#### S&P Scales

Pentatonic starting points bundled per key. "Covered" requires all starting points in that key at acquired/consolidated/mastered.

1. Major scale (12 keys)
2. Major pentatonic (12 keys, bundled starting points)
3. Natural minor (12 keys)
4. Minor pentatonic (12 keys, bundled starting points)

#### S&P Voice Leading (TBD when VL is built)

5 patterns designed: ABA/BAB, diatonic cycle, dark tensions, dim7, + one more. Natural foundational-to-complex order to be defined in the VL design doc when built. Includes 7sus4 motion patterns (7sus4 → V7 → I and 7sus4 → I) — see VL design doc.

#### ET Intervals

Single stage: all intervals (ascending + descending + both combined). Bundled because user already has competency here.

#### ET Chord Recognition (T3 revised to 3a/3b split)

1. T1: Core triads, root position
2. T2: Essential 7ths, root position
3. T3a: Slash chords
4. T3b: Inversions of T1 and T2
5. T4: Extended maj/min color
6. T5: Altered dominants + complex

#### ET Chord Progressions

Sequential — each builds on the previous.

1. Key Detection
2. Chord Motion
3. Full Progression

#### ET Scales/Modes

**Stage 1: Modes (brightness → darkness order)**
- Lydian
- Ionian
- Mixolydian
- Dorian
- Aeolian (= Natural minor)
- Phrygian
- Locrian

**Stage 2: Minor Variants (each adds an alteration to natural minor)**
- Harmonic minor (raised 7)
- Melodic minor (raised 6 and 7 ascending)

Note: Natural minor is covered as Aeolian in Stage 1; Stage 2 builds variants on top.

#### HF (Harmonic Fluency)

4 stages by group, in pedagogical-build order. Within each stage, the 3 categories are treated as parallel peer skills (not strictly sequential).

1. **Foundational / Math** — Scale Degree Math, Named Notes Across Keys, Key Signatures & Relationships
2. **Chord Knowledge** — Diatonic Chord Qualities, Chord Construction, Slash Chords & Inversions
3. **Functional / Applied** — Functional Harmony, Reverse Key Pivots, Progression Vocabulary
4. **Ear & Recognition** — Mode Identification, Interval Identification, Ear-Theory Crossover

Note: card content inside these groups may need a future audit; the structural progression doesn't depend on that.

#### Songs (Repertoire)

Existing `Song.learningOrder` field is the progression source. Songs come up in `learningOrder` ASC.

#### Production Lessons

6 paths in existing order:

1. Workflow Foundations (8 lessons)
2. The Language of Production (8 lessons)
3. Vocal Production (8 lessons)
4. Genre Productions (22 lessons)
5. Arrangement & Song Structure (5 lessons)
6. The Business of Music (5 lessons)

Within each path, lessons in their defined order.

#### Production Vocabulary

Mirror Production Lessons progression — 6 stages, one per path. Within each stage, terms ordered by their related lesson's position in the path. Data link already exists via `glossaryTerms[].relatedLessons[]`.

Edge cases:
- Terms with multiple related lessons → use earliest one for ordering
- Terms with no related lessons → either a 7th "Unbucketed" stage or excluded from progression (decide at build time)


### Step 9b — what shipped (across commits 09303a2, 3580b9d, 05b9634)

**Three commits to fully ship 9b correctly:**

- **Commit 1 (09303a2):** Parts A + D — detection helpers + backlog candidate-pool lift. `getUncoveredItemsFromLastMonth`, `getCarryoverBacklog`, `PACE_FACTOR_CARRYOVER_BACKLOG = 1.15`, `WeightContext.isCarryoverBacklog` composed via MAX with active-goal pace.
- **Commit 2 (3580b9d):** Parts B + C — Goals-home banner + per-module Accept/Decline review modal. localStorage state persistence keyed by YYYY-MM month.
- **Commit 3 (05b9634):** Two correctness follow-ups — strict uncovered (include untouched-in-scope) + Accept actually extends monthly goal scope.

**Scope enumeration via catalog walk (`scopeEnumeration.ts`).**
`getCandidatesForGoal` and `resolveCandidates` only walk `db.spacingState` — items the user never touched (no spacingState row) get silently excluded. To honor the strict "items in last month's monthly target that didn't reach acquired/consolidated/mastered, touched or not" definition, scope enumeration walks source-of-truth catalogs directly:
- HF: `FLASHCARDS` + `HF_GROUP_CATEGORIES` filter
- S&P: `CHORD_QUALITIES × KEYS × INVERSION_STATES_FOR_CHORD_SHAPE_KIND` (excluding supplementary) + `SCALE_CELLS` + `VOICE_LEADING_PATTERNS × KEYS`
- ET: `INTERVAL_SEEDS`, `CHORD_SEEDS`, `PROGRESSIONS`, `MODES × {tab1, tab2}`
- Production: `lessonsByPath(subArea)`

Plus `effectiveScopeForGoal(goal)` returns `metricScope ∪ goal.relatedItems` (deduped). This is what carryover detection consumes so Accept's explicit additions are recognized.

**Accept mechanic: `relatedItems` reused for scope extension.**
- Existing current-month monthly → `relatedItems` gets the leftover refs appended (deduped); `targetValue` bumps by the count of refs that were genuinely new. Example: `targetValue: 20` goal accepting 3 leftover items becomes `targetValue: 23` with those 3 in `relatedItems`.
- No current-month monthly → stub monthly created directly (not routed through GoalCreationFlow). Stub carries the source goal's `targetMetric / targetUnit / relatedModules`, leftover items as both `relatedItems` and initial `targetValue`. `startDate = now`, `targetDate = end of current month`. User can edit via regular Goals UI.

**Candidate-pool wiring: `extendWithRelatedItems` composer.**
In `candidates.ts`, the three coverage-specific branches (HF, Shapes, Production) wrap their `itemRefFilter` with an OR against `relatedItems.has(itemRef)`. Accepted items now get full monthly-scope weighting, not just the 1.15 backlog factor.

**Banner natural-hide via re-detection.**
`getUncoveredItemsFromLastMonth` now filters out items in this month's effective scope (via `currentMonthScopeItems` helper). After Accept modifies the goal record, the next detection run finds no uncovered items for that module — banner re-runs detection on `handleReviewSubmit` and stops showing the module without needing localStorage as sole source of truth.

`localStorage` decisions remain only for Decline + X-dismiss (Decline doesn't mutate the goal record, so without the marker, the banner would keep surfacing declined items).

**Known edge cases (not blockers for ship):**

1. **Cross-sub-area carry-over progress-display inconsistency.** `getCoverageCount` wasn't updated to honor `relatedItems`. For typical same-sub-area carry-over, items match the metric predicate naturally and count toward coverage. Cross-sub-area carry-over (rare) shows target going up without covered going up. Documented for follow-up.
2. **ET-specific cross-submodule scope extension limitation.** ET-specific has no `itemRefFilter` (just `moduleRefs: [subArea]`); `extendWithRelatedItems` doesn't help because module-set check drops out-of-moduleRef rows. Accept of intervals leftover into a chord-recognition goal won't surface intervals items as monthly-scope — they'd get the 1.15 backlog factor only. Same-sub-area carry-over (most common case) works.
3. **Banner-overload framing deferred to render layer.** Big-scope goals (e.g., HF overall) will surface large uncovered counts. Banner copy renders honestly; UX tweaks for very large counts ("300+ items" abbreviation) are render-layer follow-up.


### Step 9b follow-up #2 — honor `relatedItems` in progress + ET candidate filter (shipped)

Two surgical fixes closing the gaps flagged in commit 05b9634:

**Fix 1: `getEffectiveCoverageCount` honors `relatedItems`.**
New helper in `progress.ts` that consumes `effectiveScopeForGoal(goal)` (metric scope ∪ `relatedItems`, deduped). `getGoalProgress` reroutes the coverage branch through it.

`getCoverageCount(metric, subArea)` is kept exported and unchanged — `YearlyAnchorFlow` calls it without a Goal handle, so the Goal-aware effective-scope path is a NEW helper, not a replacement. Two entry points by design: one for "what's the global coverage state for this metric/subArea," one for "what's THIS specific goal's progress."

**Fix 2: ET-specific candidate filter honors `relatedItems`.**
Added optional `relatedItems?: ReadonlySet<string>` to coverage `CandidateSpec` and a one-line bypass in `resolveCandidates` (`inModule || inAccepted`). Uniform across all 7 coverage branches. For HF/Shapes/Production with existing `itemRefFilter`, the bypass is functionally redundant with `extendWithRelatedItems` — but unified shape simplifies reasoning. For ET-specific (no `itemRefFilter`), this is the only mechanism that surfaces cross-submodule accepted items.

**Real-world significance flagged during this fix:** Accept is most useful precisely when carrying over items from a DIFFERENT sub-area than this month's active goal. If the sub-area is the same, leftover items are already in scope and Accept is a no-op. So "cross-sub-area Accept" isn't an edge case — it's the primary use case where Accept actually does something. The earlier judgment-call framing of "rare edge case" was wrong.

Tests added: 10 covering counts-only-in-relatedItems, dedup, ET cross-submodule path, regression for same-sub-module behavior, COVERED_STAGES filter on bypass rows.


### Step 9a Part B — spacing floor expansion (shipped, commit 5ba0b94)

The over-practice slice now honors the spacing floor: `slice = min(max(target, spacing_demand), tier_cap)`. Without this, the 50%/25% time reductions could push items past their review date repeatedly, accumulating spacing debt. With it, the algo always gets the time it needs to clear due items, capped at tier.

**Per-module spacing demand:**
- **HF**: count spacingState rows where `moduleRef='harmonic-fluency'` AND `nextDueAt !== null && nextDueAt <= asOf`, × 20s seed
- **ET**: same shape, `moduleRef ∈ ET_MODULE_REFS` (intervals / chord-recognition / chord-progressions / scales-modes), × 30s
- **S&P**: per-row seed via `parseShapesItemRef` — chord-shape → 90s (120s for fluid inversion), scale → `SCALE_KIND_SECONDS[kind]` (30/30/30/90), voice-leading → 180s
- **Repertoire**: returns 0. SongCell uses `'empty'|'learning'|'comfortable'` state, no `nextDueAt`. "Due today" isn't a meaningful concept under the current model.
- **Production**: returns 0. Lessons progress through a mastery enum, no due-date scheduling. The Production-vocab block has its own SR layer (`db.flashcardStates`) but it's a separately allocated carve-out outside this slice math.
- **practice-consistency**: returns 0 (defensive; not a coverage module).

**Semantic note flagged during implementation:**
`null nextDueAt → NOT due` in `algoSpacingDemand.ts`, contrasting with `shapesSplit.ts:279` which treats null as due for UI display. The semantics are genuinely different:
- `shapesSplit` reasons about catalog cells including unengaged ones (UI surfaces "what's there to practice")
- `algoSpacingDemand` reasons about what the SR algorithm has actually scheduled (null = no review queued yet, e.g., from Production `assertSpacingStage` writes or backfill seeds)

**Synchronous + pure helper, not async with its own DB read.** Both call sites already had `spacingRows` loaded. The helper accepts pre-fetched rows + `asOf`. Mirrors the keystone pattern (`computeModuleWeeklyNeeds` pure / `loadModuleWeeklyNeeds` Dexie wrapper).


### Step 9c — Yearly anchor suggestions (shipped, two-commit split)

Shipped per the design with one significant build decision: two-commit split (data layer + UI integration) per the prompt's explicit permission.

**Commit 1: data layer**
- All 11 module progression definitions encoded in `progressionStages.ts`
- `computeNextProgressionSuggestion(moduleId, currentScopeItemRefs)` — returns clear-next-thing, half-done two-choice surface, or null (ambiguous fallback)
- Yearly pace + consequence + time-per-day math helpers
- Uses derived time-per-attempt seeds (Step 7b pattern) — no third source of seed truth
- Fixture-driven tests covering progression encoding, suggestion logic, math

**Commit 2: UI integration into GoalCreationFlow**
- Panel mounted in **Step 2 (target picker)** — informs the target decision at the moment it's made, not after
- One-tap "Accept suggestion" via **generic `Draft.pendingRelatedItems` + `pendingTargetBump`** — reuses the same `relatedItems` + `targetBump` mechanism from carry-over Accept (commit 05b9634)
- Mutation surface: ONE entry point (the save path consumes the pending fields uniformly across all 5 modules). Same downstream wiring — accepted progression items get full monthly-scope weighting via `extendWithRelatedItems` for HF/Shapes/Production and `relatedItems` field on coverage spec for ET (Step 9b follow-up #2)
- `dedupeItems` exported — single source of truth for both the in-UI merge (panel → onUpdate) and the save-path dedupe

**Judgment calls flagged in the report:**
- Accept disabled for multi-record drafts (where there's no single record to bump) rather than auto-picking one. Honest, doesn't silently bias the bump.
- Panel-component (React) tests deferred — `react-testing-library` isn't a current dependency. Data-layer tests + `loadYearlyPaceContext` integration tests with `fake-indexeddb` cover every persisted-state correctness path. Panel is presentation that builds + typechecks clean.
- Synthesized draft-as-Goal pattern inside the panel reuses `getEffectiveCoverageCount` + `effectiveScopeForGoal` instead of writing a parallel scope counter. Single source of truth for "what does the current draft's scope look like."

