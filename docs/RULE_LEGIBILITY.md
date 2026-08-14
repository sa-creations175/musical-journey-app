# Rule Legibility

**Audit taken:** August 14, 2026
**Against:** commit `af9fccf` (all line references spot-checked at that commit)
**Status:** living document — update the markers as rules get surfaced

> **Line numbers drift.** Every `file.ts:NN` below was accurate on the date above.
> As the codebase moves, treat them as a starting point for a search, not a
> guarantee. The symbol names and constant names are the durable part — grep
> those first if a line lands somewhere unexpected.

---

## What this is for

The app enforces roughly seventy rules that decide what counts, what unlocks,
what's due, and what gets excluded. Almost none of them are explained anywhere
you can see while using it. You learn one when something surprises you and you
go digging.

**Every rule the app enforces should be legible inside the app.**

The reason is that this is being built as something other people might use, not
only as a personal tool. I can remember that a 30-second rep doesn't count
because I decided it. Someone else would just see their practice vanish — and
they'd be right to stop trusting the numbers.

A rule that makes a displayed number mean something other than what it appears
to mean is worse than a rule that gates a feature. That ordering is what the
tiers below encode, and it's what decides the fix order.

This document maps the rules. It is not a to-do list to burn down. It's a
reference to work through deliberately.

---

## Status markers

Each rule carries one tag. They're plain text so they're greppable —
`grep -c "\[INVISIBLE\]" docs/RULE_LEGIBILITY.md` gives you the remaining count.

| Tag | Meaning |
|---|---|
| `[INVISIBLE]` | The rule is enforced and nothing in the UI mentions it |
| `[HALF]` | The *effect* is named somewhere, but not the rule, the threshold, or the full reach |
| `[SURFACED]` | Explained where the user meets it. No work needed |
| `[FIXED]` | Was invisible or half; now surfaced. Note the commit |
| `[DEFECT]` | Not a legibility problem — a bug that surfaced during the audit |

**Current counts at time of writing:** 6 surfaced · ~15 half · ~50 invisible · 2 defects.

---

## The working plan

Three patterns run through the whole map. They are the plan, in order.

### Pattern 1 — Explanations that were built and never rendered ← **start here**

The cheapest set of wins in the entire document. In each of these cases the
honest-disclosure work is **already done** — the function exists, the reason
code is computed, the description string is written. It just isn't wired to a
surface. These are wiring jobs, not design jobs.

| What exists | Where it lives | What's missing |
|---|---|---|
| `readingHintSplit()` | `src/modules/reading/readingProgress.ts:65` | Zero consumers outside its test file |
| `readingMissBreakdown()` | `src/modules/reading/readingProgress.ts:101` | Zero consumers outside its test file |
| `readingSkillAccuracy()` | `src/modules/reading/readingProgress.ts:44` | Zero consumers outside its test file |
| `MaintenanceDisqualifier` reason codes | `src/lib/sessionAlgorithm/scopeMaintenance.ts:209` | `ScopeMaintenanceNotice.tsx` never renders `view.reason` |
| `TIER_DESCRIPTION` | `src/lib/tier.ts:96` | Rendered in 1 of 8 surfaces that show `TIER_LABEL` |

The `readingProgress.ts` case is the sharpest: the file header (`:12`) argues at
length for choosing `attemptFilter` over `excludeFromFluency` *specifically so
the hint-on split would stay readable* — and then no surface reads it. Same for
the maintenance reasons, whose own comment says they are "carried so the three
surfaces in step 3 can explain themselves."

### Pattern 2 — Rules explained at the trigger, not at the number

The fluency-protection notice appears inside the quiz. The numbers it affects
live on the Dashboard, in Goals, and in the Skills catalogue. A rule stated only
where it fires is invisible everywhere it matters.

The fix shape here is different from Pattern 1: it's about carrying a marker
alongside the derived number, not about rendering an existing string.

### Pattern 3 — Three definitions of "a practice day"

Three calendars, three rules, none labelled as partial. This is the one most
likely to make a new user believe the app lost their practice — exactly the
failure mode this document exists to prevent. Probably wants a design decision
before any code.

---

## Tier 1 — The number means something other than what it appears to mean

These are the `excludeFromFluency` shape: you are looking at a figure that has
been quietly filtered, rescoped, or fabricated. **Highest priority.**

### 1.1 Reading accuracy silently blends hint-assisted answers `[INVISIBLE]`

- **Rule:** the "show the accidental count" hint stays on across cards; attempts made with it land in the same accuracy pile as unaided ones.
- **Decides:** the headline Reading accuracy figure.
- **Where:** `src/modules/reading/ReadingDrill.tsx:267` (writes `hintUsed`) · `src/modules/reading/readingProgress.ts:65` (`readingHintSplit`), `:101` (`readingMissBreakdown`), `:44` (`readingSkillAccuracy`).
- **UI:** invisible — **and the separator exists and is wired to nothing.** All three reader functions have zero consumers outside their test file.
- **Note:** worst offender in the codebase. The rule was designed to be honest and the honesty was never rendered. → **Pattern 1**

### 1.2 Focus protection does more than the notice claims `[HALF]`

- **Rule:** in Harmonic Fluency a focus-protected session also skips `recordAttempt` — the spaced-repetition scheduler. Ease factor, interval, and next-review date do not move at all.
- **Decides:** when an HF card comes back.
- **Where:** `src/modules/harmonic-fluency/HarmonicFluencySession.tsx:112` (`if (!focusProtected) await recordAttempt(...)`).
- **UI:** `src/components/FluencyProtectionNotice.tsx:10` says *"focus sessions with fewer than 4 items don't count toward fluency tiers — practice freely without inflating your stats."* True but incomplete: in HF those reps also don't reschedule the card. Drill a flagged card ten times and it's still due tomorrow.

### 1.3 `excludeFromFluency` reaches six systems; the notice names one `[HALF]`

- **Rule:** the flag drops the attempt from *every* downstream tally, not just the tier badge.
- **Decides:** tier badges, tier unlocking, goal accuracy percentages, dashboard counts, Skills-catalogue badges, weak-spot suggestions.
- **Where set:** `ChordRecognitionQuiz.tsx:530` · `IntervalsQuiz.tsx:214` · `ChordProgressionsQuiz.tsx:225` · `ChordMotionTab.tsx:440` · `HearScaleTab.tsx:59` · `SitInsideTab.tsx:63` · `HarmonicFluency.tsx:215` · `VocabularySession.tsx:46` (`FOCUS_PROTECTION_THRESHOLD = 4`).
- **Where consumed:** `chord-recognition/tierUnlock.ts:41` · `chord-progressions/progressionTierUnlock.ts:50` · `scales-modes/scaleModeTierUnlock.ts:63` · `dashboard/aggregation.ts:44` · `goals/progress.ts:327` · `skills/registry.ts:152` · `ChordMotionTab.tsx:1146`.
- **UI:** notice says "fluency tiers." Silent on the other five. A focused session can leave you permanently short of a tier unlock with no indication.
- **Also:** the threshold is `< 4` everywhere but measured differently — items *selected* in ET (`focusKeys.length`), cards *in queue* in HF/Production (`cards.length`). Same notice, two different rules. → **Pattern 2**

### 1.4 "42 motions" — the scope count is the filter's pool `[HALF]`

- **Rule:** the current-scope line shows `activePool.length` after diatonic/direction/distance/listening filters, not the catalog size.
- **Decides:** the motion count you read as "how many motions exist."
- **Where:** `src/modules/ear-training/chord-progressions/ChordMotionTab.tsx:1088`.
- **UI:** the filters are listed in the same sentence, so a careful reader can infer it — but the number is presented as a count of motions, not a count of *these* motions. `ProgressionFluencyTracker.tsx:265` renders `"${motions.length} motions"` per distance group with no filter context at all.

### 1.5 Coverage denominators are spacingState-row counts, not what you can see `[INVISIBLE]`

- **Rule:** the "N" in a coverage goal is derived from itemRef cardinality, which does not match the visible catalog.
- **Decides:** every coverage goal denominator.
- **Where:** `src/lib/moduleItemCounts.ts:21-24` — the comment states it outright: *"The user-facing card count for Ear Training is 134; the coverage denominator is 143."* Intervals are 13 × 2 directions = 26; modes are 9 × 2 tabs = 18.
- **UI:** invisible. `Goals.tsx:1831` renders `"Coverage · 4/26"`. Nothing says the 26 counts each interval twice.

### 1.6 Mental Visualization is excluded from every S&P coverage number `[INVISIBLE]`

- **Rule:** mental-viz drills count toward consistency only, never breadth/depth/mastery. `itemRefForSkill` returns null for them.
- **Decides:** all S&P coverage progress.
- **Where:** `src/lib/moduleItemCounts.ts:158-161` (April 27 design call).
- **UI:** invisible. Drill mental viz for a month and every S&P coverage goal stays flat.

### 1.7 Supplementary two-handed seventh rows don't gate acquisition `[INVISIBLE]`

- **Rule:** `supplementary` inversion states are filtered out of the tier denominator via `gatesAcquisition`.
- **Decides:** S&P tier progress.
- **Where:** `src/lib/moduleItemCounts.ts:146-148` · `src/modules/shapes-and-patterns/spTiers.ts:134`.
- **UI:** invisible. The cell is drillable and looks identical to a gating one.

### 1.8 Skills-catalogue tiers for flashcards are fabricated windows `[INVISIBLE]`

- **Rule:** HF cards have no per-attempt history, so the registry reconstructs a fake 20-attempt window from lifetime accuracy: `windowCorrect = round(lifetimeAccuracy × min(20, totalAttempts))`.
- **Decides:** the tier badge on every HF skill in the catalogue.
- **Where:** `src/modules/skills/registry.ts:167` (`tierForFlashcardState`).
- **UI:** invisible. The badge reads "fluent" identically to a real rolling-window tier. It isn't one — it's a lifetime average wearing a rolling-window label.

### 1.9 The Musician Balance radar's 0–100 scores are invented targets `[HALF]`

- **Rule:** each axis divides weighted activity by a hardcoded target and clamps to 100. Last-7-days activity is weighted 2×.
- **Decides:** all five radar axes.
- **Where:** `src/modules/dashboard/aggregation.ts:475-478` — 400 ear attempts / 10,800 drill seconds / 300 song minutes / 7,200 creative seconds / 14 unique days.
- **UI:** `drivers` strings show the raw weighted inputs ("312 weighted ear-training reps…") but never the denominator or the 2× recency weight. "Physical: 58" reads like a measurement; it's a ratio against a guess.

### 1.10 "untouched" doesn't mean untouched `[HALF]`

- **Rule:** `computeTier` returns `'untouched'` for anything with fewer than 5 attempts in the window.
- **Decides:** tier badges and the Skills grid filter.
- **Where:** `src/lib/tier.ts:61`, description at `:102`.
- **UI:** the description exists but renders in exactly one place (see 1.11). In `SkillsGrid.tsx:210` it's a filter chip labelled "untouched" — filtering by it returns items you've practised four times.

### 1.11 Tier labels render in eight surfaces; the legend renders in one `[HALF]`

- **Rule:** mastered = 20/20 over last 20 · fluent = 80–99% · developing = 50–79% · needsWork = <50% · stale = was fluent/mastered + 30 days idle.
- **Decides:** every tier badge in the app.
- **Where:** `src/lib/tier.ts:49-51`, `TIER_DESCRIPTION` at `:96`.
- **UI:** `TIER_DESCRIPTION` is consumed **only** at `src/modules/ear-training/intervals/FluencyTracker.tsx:257`, behind a "?" popover. `TIER_LABEL` alone renders at: `ChordFluencyTracker.tsx:216` · `scales-modes/FluencyTracker.tsx:138` · `ProgressionFluencyTracker.tsx:100` · `HarmonicFluencyTracker.tsx:99` · `SkillsGrid.tsx:332` · `SkillsCatalogue.tsx:311` · `ModuleGroupedView.tsx:337` · `SkillDetailPanel.tsx:213`. **Seven surfaces show the verdict without the rule.**
- **Compounding:** `src/lib/tier.ts:1-45` documents that this is the *legacy* vocabulary, superseded by a garden vocabulary (planting / sprouting / branching / rooted / seasoned) with **different band breakpoints**. Both ship. Only `GoalFormModal.tsx::LevelSelect` shows the new one. → **Pattern 1**

### 1.12 Three tier computations that can disagree `[DEFECT]`

- `dashboard/aggregation.ts:44-52` — excludes, then slices top 20.
- `skills/registry.ts:152` — filters then slices 20, but computes `daysSince` from `sorted[0]`, which **includes** excluded attempts.
- `ChordRecognitionQuiz.tsx:203` — additionally normalizes legacy itemIds (`maj` → `maj:0`) before bucketing.
- **Consequence:** the Dashboard, the Skills catalogue, and the in-quiz tracker can show **different tiers for the same item**.
- **This is a correctness bug, not a legibility gap.** Logged here because the audit found it; should be fixed as a bug regardless of what happens to the rest of this document.

---

## Tier 2 — An action you took was deliberately not recorded

### 2.1 Drill, creative, and song practice don't touch the daily goal, streak, or calendar `[INVISIBLE]`

- **Rule:** `computeDayStreak` and `updateDailySummary` read `db.attempts` only, and are **scoped per module**.
- **Decides:** the daily goal bar, the day streak, and every calendar cell.
- **Where:** `src/lib/dailyGoal.ts:35` · `src/lib/dailySummaries.ts:16` · `src/lib/dayClassification.ts:24` · `src/components/DailyGoalBar.tsx:46`.
- **UI:** invisible. A 45-minute chord-shape drill day renders as `'empty'` on every Ear Training calendar and breaks the streak.
- **Three unreconciled calendars:** S&P has its own (`ShapesAndPatternsCalendar.tsx`) with minutes-based intensity bands (`:49` — 10 / 25 / 45 min, no legend) and no goal at all. Repertoire has a third (`SongHeatmap.tsx`). None labelled as partial. → **Pattern 3**

### 2.2 Chord Motion practice reps write nothing `[HALF]`

- **Rule:** replaying a motion as a practice rep skips the DB entirely — no attempt, no daily summary, no streak, no fluency.
- **Where:** `src/modules/ear-training/chord-progressions/ChordMotionTab.tsx:583` (`if (round.isPracticeRep) return;`).
- **UI:** `:885` renders `"practice rep — not tracked"`. Says it isn't tracked; doesn't say the reps also don't count toward your daily goal or streak.

### 2.3 Drill reps under 30 seconds log nothing `[SURFACED]`

- **Rule:** `MIN_REP_SECONDS = 30`; below it, save is refused.
- **Where:** `src/modules/shapes-and-patterns/drillModel.ts:26`; enforced at `DrillSessionModal.tsx:360`.
- **UI:** the only rule in the app explained at all three moments — pre-emptively (`DrillSessionModal.tsx:614`, `ScalesDrillModal.tsx:545`, `VoiceLeadingDrillModal.tsx:507`), on the rating screen (`DrillAssessment.tsx:126`), and on refused save (toast at `:362`).
- **This is the model for everything else in this document.**

### 2.4 First engagement bypasses Dev Mode `[DEFECT]`

- **Rule as intended:** Dev Mode suppresses all practice-data writes.
- **Actual:** `putSpacingState` is Dev-Mode gated (`src/lib/practiceWrites.ts:53`), but `recordEngagement` creates the row on first touch via `db.spacingState.add()` directly at `src/lib/spacingState.ts:336` — **not gated**.
- **Consequence:** a Dev Mode test session still creates first-touch spacingState rows. The header badge promises suppression it doesn't fully deliver.
- **UI:** Dev Mode itself is well surfaced (`Layout.tsx:189` badge + `SettingsPanel.tsx:107` toggle) — that's not the problem.
- **This is a defect, not a design call.** Fix independently of this document.

### 2.5 Stored and never read `[INVISIBLE]`

- `elapsedMs` — `db.ts:1297`, written at `ReadingDrill.tsx:265`. Deliberate per the comment ("recognition speed cannot be backfilled"), documented at the field. Acceptable, but it's recorded practice you can't see.
- `noteMiss` (letter / octave / both) — written; reader exists at `readingProgress.ts:101`; **no UI**.
- The whole S&P tier system: `getSPUnlockedTier` (`spTiers.ts:201`) is consumed only by `sessionGenerator.ts:1062`. **No S&P surface shows your tier or what unlocks the next one.**

### 2.6 Explicitly opt-in non-logging `[SURFACED]`

"cancel — don't log" at `DrillSessionModal.tsx:462` · `ScalesDrillModal.tsx:393` · `VoiceLeadingDrillModal.tsx:340` · `CreativeTimeModal.tsx:319`/`:339` · `InSessionDrillRunner.tsx:163`. Fine as-is — you chose them.

---

## Tier 3 — The app decides something about you from a rule you can't see

### 3.1 Acquisition stage — the rule under every coverage number `[INVISIBLE]`

- **Rule:** `acquiring → acquired` when either **(declarative)** ≥5 attempts in the last 10 *and* ≥80% correct, or **(procedural / integration)** the **last 3 ratings are all flying or cruising** — a single "crawling" blocks it. Never demotes.
- **Where:** `src/lib/spacingState.ts:40, 43, 48, 52` · `COVERED_STAGES` at `goals/progress.ts:58`.
- **UI:** invisible.
- **The single most load-bearing invisible rule in the app.** It decides every coverage numerator, every maintenance qualification, and every S&P tier unlock. Nothing anywhere says what "covered" means.

### 3.2 Scope-level maintenance — the bar is never stated `[HALF]`

- **Rule:** enter when *every* catalog item is acquired **and** each holds ≥90% over its last 20 attempts spanning ≥4 distinct days. Release when any item drops below 85% (a deliberate 5-point hysteresis band).
- **Where:** `src/lib/sessionAlgorithm/scopeMaintenance.ts:83, 88, 95, 100, 113`.
- **UI:** `ScopeMaintenanceNotice.tsx:88` says *"learned and holding steady"* / *"slipped below the maintenance bar."* The `MaintenanceDisqualifier` type at `:209` carries five reason codes with the comment *"Carried so the three surfaces in step 3 can explain themselves instead of showing or hiding a suggestion with no account of why"* — **the component never renders `view.reason`.** → **Pattern 1**

### 3.3 Spaced-repetition scheduling — fully invisible `[INVISIBLE]`

Two SR systems run in parallel and neither shows anything.

- **Flashcards (SM-2):** ease starts 2.5, ±0.2 / +0.1, clamped 1.3–2.8; intervals 1 → 6 → `interval × ease`, capped 180 days. `src/lib/flashcards/spacedRepetition.ts:19-23, 69-72`.
- **spacingState curve:** ×2 on success, ×0.5 on failure, floor 1 day, ceiling by memory type (declarative 60 / procedural 30 / integration 30 / expression 14). `src/lib/spacingState.ts:164-183`.
- **UI:** no due date, no interval, no ease is shown anywhere. Cards appear and disappear from queues with no account.

### 3.4 Decay bands

- **Song keys** `[HALF]` — solid <14d, fading 14–29d, lapsed 30+d; **lapsed is sticky — only a passed retest clears it, engagement alone never does.** `src/modules/repertoire/matrix/solidDecay.ts:36-37, 55`. The KeyStrip badge shows "Fading 18d"; the stickiness rule (the surprising half) is not stated.
- **Algorithm's lived-with bands** `[INVISIBLE]` — identical 14/30 thresholds, `src/lib/sessionAlgorithm/livedWith.ts:28-30`.
- **S&P heat-grid dimming** `[HALF]` — fresh ≤3d, recent ≤10d, aging ≤20d, stale beyond. `src/modules/shapes-and-patterns/drillModel.ts:790`. `ChordShapeDrills.tsx:53` says *"cells darken with time invested and fade as they go stale"*; the day counts aren't given. `TodayAndAttention.tsx:15` additionally gates "going stale" on ≥5 min invested — invisible.
- **Tier staleness** `[HALF]` — fluent/mastered + 30 idle days → `stale`. `src/lib/tier.ts:51`. Invisible outside the intervals popover.

### 3.5 Day classification bands `[SURFACED]`

- **Rule:** <5 attempts = belowThreshold · <50% of goal = light · 50–99% = solid · 100% = goalMet · 150%+ = goalCrushed. `src/lib/dayClassification.ts:6, 30-33`.
- **UI:** `PracticeCalendar.tsx:254` renders a full legend with the numbers baked into the labels ("below threshold (1–4 attempts)"). **Good model.**

### 3.6 Goal feasibility verdicts `[HALF]`

- **Rules:** `AT_RISK_RATIO = 0.85` (`goals/progress.ts:578`) · accuracy at-risk at a 5-point gap (`:999`) · critical in the last 20% of the goal period (`:1006`) · song goals project at a flat **0.25 songs/week** default (`:890`).
- **UI:** recommendation strings render the *outputs* ("projected to cover 8 of 12 songs by Mar 3") but never the assumption. The 0.25/week figure is a hardcoded placeholder driving a projection presented as a forecast.

### 3.7 Repertoire stage advancement `[HALF]`

- **Rules:** learning→comfortable = 5 logs at target tempo with feel ≥3 · comfortable→internalized = 3+ distinct weeks in the last 21 days, last-5 avg feel ≥4, ≥5 logs · internalized→cross-key = 2 non-original keys · cross-key→maintenance = 6 keys across 3 sections. `src/modules/repertoire/stage.ts:100-105, 126ff`.
- **UI:** asymmetric. When met, `reason` renders ("5 sessions at target tempo — consider advancing"). When *not* met, nothing shows — you can't see how close you are or what's missing.

### 3.8 Cell / key gates `[SURFACED]`

- **Rule:** 3 consecutive clean run-throughs at ≥ (performance tempo − 10) BPM. `cellRollup.ts:74, 90, 183`.
- **UI:** stated on the button tooltip (`CellInteractionModal.tsx:200`), the progress dots' aria-label (`:320`), the per-attempt "below tempo" tag with explanatory title (`:408`), a banner when changing tempo (`:658`), and the whole-song modal (`WholeSongTestModal.tsx:236, 254`).
- **The best-surfaced rule in the app.** This is the standard everything else should meet.

### 3.9 Session-timer drift `[HALF]`

- **Rule:** soft warning below 60% active/wall after 2 min; hard "Still practicing?" prompt after 15 min paused. `src/lib/sessionTimer/drift.ts:22, 29, 32`.
- **UI:** the banner shows "X min active of Y min elapsed" — consequence visible, trigger threshold not. The design comment at `:13` says a mostly-paused session "should not count as a full practice session in history"; nothing in the UI says that.

### 3.10 Prompt suppression `[INVISIBLE]`

- **Rule:** max 3 user-facing prompts per local day; all prompts suppressed for 2 hours after a session start. Scope-maintenance dismissal quiets for 7 days (`scopeMaintenanceState.ts:52`). `src/lib/prompts/types.ts:61, 73`.
- **UI:** invisible. Prompts you'd expect simply don't appear.

### 3.11 Abundance / "nothing urgent" `[INVISIBLE]`

- **Rule:** fires when the pool is empty, or every goal is at pace ratio ≥1.0, or the pool is ≤3 items with top weight <1.5 **and** you've already practised today. `src/lib/sessionAlgorithm/abundance.ts:38, 42`.
- **UI:** the three-path screen appears; the trigger is invisible.

---

## Tier 4 — Gates that only limit or hide a feature

Lower stakes: nothing you're looking at is wrong, you just can't get somewhere
and don't know why.

| Rule | Where | Status | UI |
|---|---|---|---|
| CR tier N+1: every tier-N item needs ≥10 attempts **and** ≥75% lifetime | `chord-recognition/tierUnlock.ts:15, 19` | `[HALF]` | Toast on unlock only (`ChordRecognitionQuiz.tsx:282`). Current tier, requirements, progress all invisible |
| Only 3 new items introduced per tier per session | `chord-recognition/tierUnlock.ts:24` | `[INVISIBLE]` | — |
| Progressions stage unlock — same 10 / 75% / 3 rule | `progressionTierUnlock.ts:33-35` | `[INVISIBLE]` | Nothing. Not even a toast |
| Scales-modes stage unlock — same rule | `scaleModeTierUnlock.ts:38-40` | `[INVISIBLE]` | Nothing |
| Cross-submodule ET stage gate (CR T1 unlocks progressions S1, etc.) | `etStageGate.ts:54-62` | `[INVISIBLE]` | Nothing. Whole submodules stay empty with no explanation |
| S&P tier N+1 at 50% of tier-N cells acquired+ | `spTiers.ts:53` | `[INVISIBLE]` | Nothing |
| Earlier-tier items you never touched stay hidden after unlock | `chord-recognition/tierUnlock.ts:135-143` | `[INVISIBLE]` | — |
| Weak spots: <60% accuracy with ≥4 attempts, padded to 8 with untouched items | `ChordMotionTab.tsx:1155-1163` | `[INVISIBLE]` | Untouched items presented as "weak spots" |
| Prep breakdown hidden above 12 items | `prepItemBreakdown.ts:39` | `[INVISIBLE]` | Silently shows total only |
| Swap picker caps: 20 same-submodule, top 3 different-submodule | `proposalSwap.ts:101, 104` | `[INVISIBLE]` | — |
| Max 20 items per block | `sessionDesign.ts:443` | `[INVISIBLE]` | — |
| Adaptive selection: 1.3× weight for items outside the last 10 | `adaptiveSelection.ts:7-9` | `[HALF]` | Window size shown at `FluencyTracker.tsx:290`; multiplier not |
| Backup nudge after 7 days, snoozes 3 | `BackupReminderBanner.tsx:8-9` | `[HALF]` | Effect visible, cadence not |
| Song-of-Month TBD nudge at 50% comfortable | `songOfMonthPrompts.ts:42` | `[INVISIBLE]` | — |
| Behind-pace notice: <50% of weekly target with >2 days left | `weeklyPace.ts:52-53` | `[INVISIBLE]` | — |
| Weekly override prompt: gap ≥5 attempts or ≥10% | `weeklyDerivation.ts:505-506` | `[INVISIBLE]` | — |
| Weekly targets assume 10 attempts/item declarative, 3/item procedural | `weeklyDerivation.ts:60, 65` | `[INVISIBLE]` | Silently sets every weekly number |
| Creative session <2 min → `quickExploration` | `creative/engine.ts:677` | `[SURFACED]` | Live at `CreativeTimeModal.tsx:648`: *"under 2 min → quick exploration"* |
| Drill timer floor 30s, ceiling 2× planned | `sessionTimer/reducer.ts:22, 202` | `[HALF]` | Buttons stop responding, no message |
| Visual aids fade after 5 correct in a row per category | `FlashcardSession.tsx:140` | `[INVISIBLE]` | The aid just vanishes |
| Session-shape fractions, pace factors, freshness weights (~40 constants) | `sessionDesign.ts` · `weighting.ts:44-90` · `pace.ts:35-56` | `[HALF]` | "Why this plan?" (`ProposalCard.tsx:485`) renders prose reasons. Best-in-class for algorithm internals |

---

## Scoreboard

**Fully explained — 6:**
min rep seconds (2.3) · tempo floor + 3-consecutive gate (3.8) · day-class calendar legend (3.5) · quick-exploration threshold (Tier 4) · Dev Mode toggle + badge · tier legend (intervals only, 1.11).

**Half-surfaced — ~15:** the effect is named, the rule isn't — or it's stated in one module and silent in the seven others that use it.

**Completely invisible — ~50:** including acquisition stage, all four tier/stage unlock systems, both SR schedulers, the maintenance bar, every coverage denominator's composition, and the fact that drill days don't count as practice days.

**Defects (not legibility) — 2:** §1.12 three disagreeing tier computations · §2.4 first engagement bypassing Dev Mode.

---

## Changelog

| Date | Change |
|---|---|
| 2026-08-14 | Initial audit against `af9fccf`. No fixes applied. |
