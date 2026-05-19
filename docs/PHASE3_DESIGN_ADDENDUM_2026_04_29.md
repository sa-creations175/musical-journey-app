# Phase 3 Design Addendum
## Decisions from April 29, 2026 design session

This document captures new and updated design decisions made on April 29, 2026, in preparation for Phase 3 (session generator algorithm). It should be absorbed into `PRACTICE_SESSIONS_DESIGN_3.md` at the start of Phase 3 build, and the relevant section of `BUILD_SEQUENCER_2.md` updated to reflect Phase 2 Step 7.

---

## 1. Algorithm spec updates (corrections to existing Steps 1–9)

### Step 3 — Candidate item pool: `getCandidatesForGoal()` translation layer (NEW)

The existing spec says items enter the pool when "goals reference them." This is insufficient for coverage goals, which reference entire modules or sub-areas rather than specific items.

**Add `getCandidatesForGoal(goal)` as a core primitive called in Step 3.** This helper expands each goal type into a concrete set of itemRefs:

- **Coverage goal (overall)** — pull all spacingState rows where `itemRef` matches the module's itemRef prefix patterns AND `acquisition_stage` is not yet in `COVERED_STAGES` (`acquired`, `consolidated`, `mastered`). Items with no spacingState row yet (never touched) are also valid candidates — they're implicitly `new` stage.
- **Coverage goal (specific sub-area)** — same logic, filtered to the itemRef patterns for the declared sub-area only.
- **Accuracy goal** — all items in the relevant module/group, regardless of stage.
- **Consistency goal** — all items in the relevant module (consistency goals boost the module broadly, not specific items).
- **Umbrella goal** — delegate to children; weight applied at child record level, not umbrella level.
- **Yearly anchor** — delegate to dimension children (Breadth/Mastery/Depth/Consistency records). Each dimension child is a real goal record with a metric type the algorithm handles directly.

### Step 4 — Goal-alignment weighting: per-goal-type mapping (UPDATED)

The existing spec describes goal-alignment weighting without accounting for the richer goal types now in the system. Updated mapping:

- **Coverage goals** — items returned by `getCandidatesForGoal` get a goal-alignment boost. Boost scales with urgency (see pace-based urgency below).
- **Accuracy goals** — items in the relevant module/group get boosted. Same as originally specced.
- **Consistency goals** — every candidate item from the relevant module gets a mild lift. Signal is "practice this module more often," not "practice these specific items."
- **Umbrella goals** — weight distributed to children, not applied at umbrella level directly.
- **Yearly anchor dimension children** — treated as regular goal records of their respective metric type. No special casing required.

### Step 6 — Within-day spacing: explicitly out of scope for Phase 3 (CORRECTION)

The algorithm spec includes Step 6 (within-day spacing for acquiring items) as part of the 9-step flow. The phasing roadmap correctly defers this to Phase 6. **Phase 3 skips Step 6 entirely.** Items in `acquiring` stage still surface regularly via the acquisition factor boost in Step 4. The within-day reinforcement logic (checking if an item was already touched today and ensuring a second touch) is a Phase 6 addition.

Phase 3 algorithm steps: **1, 2, 3, 4, 5, 7, 8, 9.** Step 6 is a clearly marked placeholder stub.

---

## 2. Pace-based urgency for coverage goals (NEW)

### The problem

Urgency weighting is time-pressure-based. Yearly coverage goals have low time pressure in April, so they lose the weighting battle to monthly and weekly goals every session. Without intervention, a yearly coverage goal makes no progress until it becomes urgent — wrong behavior for something requiring sustained breadth work across 12 months.

### Solution: pace score calculation

For any coverage goal (weekly, monthly, or yearly), calculate a pace score alongside target-date proximity:

- **Expected coverage** = (days elapsed in goal period / total days in goal period) × total items
- **Actual coverage** = `getCoverageCount(metric)` — items already at acquired/consolidated/mastered
- **Pace deficit** = expected − actual
- **Pace ratio** = actual / expected (below 1.0 = behind, above 1.0 = ahead)

**Weight mapping:**
- Ahead of pace (ratio > 1.0) → mild ambient boost
- On pace (ratio ~1.0) → moderate boost, steady momentum
- Behind pace (ratio < 1.0) → boost escalates proportionally; can reach monthly-goal-level urgency when significantly behind

### Applies to all scopes

- **Weekly goals** — pace is near real-time. If it's Thursday and you've done 1 of 4 planned sessions, the deficit is immediate and the signal is strong and specific.
- **Monthly goals** — same pace logic, compressed window. Mid-month deficit generates a moderate-urgency signal.
- **Yearly goals** — pace ratio drives a steady ambient pull toward uncovered items throughout the year, ensuring coverage goals make meaningful progress rather than being ignored until October.

### User-facing surface

Pace deficit surfaces in the **"Why this plan?" reasoning panel only** — not on the goal row itself. Goal row shows raw progress (43/143). Reasoning panel explains why today's session looks the way it does.

Example reasoning panel language:
- "You're 12 items behind pace on your Ear Training yearly coverage goal — pulling in some uncovered intervals and chord shapes."
- "You need 3 ET sessions before Sunday to stay on pace with your weekly goal."

---

## 3. Goal feasibility checking (NEW — Phase 2 Step 7)

### The problem

Pace-based urgency ensures items are pulled into sessions appropriately, but doesn't answer: "Do I have enough total practice time in my week to actually hit all my goals?" A user starting May 1 with ambitious yearly coverage goals across all modules needs to know whether their declared day profile mix gives them enough time — proactively, not when it's too late.

### `getGoalFeasibility()` helper

New helper in `src/modules/goals/progress.ts` alongside existing helpers.

**Inputs:**
- All active goals across all scopes
- Current coverage counts (`getCoverageCount`)
- Days remaining in each goal period
- User's declared weekly day profile mix (e.g. 3 Standard + 1 Deep + 1 Light)
- Average items coverable per session type (tunable parameters, initial estimates at build time)

**Output:** Per-goal feasibility status:
- `on_track` — projected outcome meets or exceeds target
- `at_risk` — projected outcome is close but requires consistency
- `infeasible` — at current day profile mix, target is not reachable by deadline
- Projected outcome value (e.g. "projected 280/408 Shapes items by Dec 31")

**Applies to:** all active goals across all scopes (weekly, monthly, yearly).

### Urgency hierarchy for feasibility signals

Feasibility signals are urgency-tiered, same as pace signals:
- **Weekly behind pace** → critical urgency, days-remaining framing, very direct language
- **Monthly behind pace** → moderate urgency, weeks-remaining framing
- **Yearly behind pace** → ambient signal, pace ratio framing, softer language

### Goals home surface — diagnostic view

Per-goal feasibility displayed on the yearly anchor row and monthly/weekly goal rows. Shows projected vs. target. Flags which goals need more practice time.

Examples:
> Ear Training 2026 — on pace ✓  
> Shapes & Patterns 2026 — at current mix, projected Dec coverage: 280/408. Consider more Deep days.  
> Chord Progressions (this month) — behind pace. Need 2 more sessions this week.

### Practice Sessions home surface — action signal banner

A persistent banner on Practice Sessions home when any goal is behind pace. **Not just one goal — all behind-pace goals are represented, with the most urgent leading.**

**Banner structure:**
- **Primary row** (always visible) — most urgent behind-pace goal with direct action language + [Deep day] shortcut button
- **Collapsed section** (revealed on tap) — all other behind-pace goals listed with scope and urgency level
- Expand/collapse chevron: "3 more goals behind pace ↓"

**When nothing is behind pace** — banner disappears entirely. No noise when on track.

**Language scales with urgency:**
- Weekly: "You need 3 ET sessions before Sunday." → [Deep day]
- Monthly: "You're behind pace on Shapes & Patterns this month. Consider a Deep session."
- Yearly: "Two yearly goals are behind pace. Today's a good day to go deep."

**Tapping the banner** (or the [Deep day] button) pre-selects Deep as the suggested day profile when the input questionnaire opens.

### Phasing

- `getGoalFeasibility()` helper + Goals home surface → **Phase 2, Step 7** (new step, builds on top of Goals home redesign in Step 6)
- Practice Sessions home banner → **Phase 3** (when Practice Sessions home gets real content anyway)

---

## 4. Block visualization design (NEW — April 29, 2026)

### Single block — default state

Each block in the session stack shows:
- **Full block background** in the module's color (not just a left accent bar — the entire block is colored)
- **Module name** (top, small, uppercase)
- **Activity description** — adapts per module type:
  - Declarative (ET, HF): activity name + attempt count ("Chord Function cards — 10 attempts")
  - Procedural (Shapes): activity name + duration ("Chord shape drills — 12 min")
  - Integration (Songs): song names + section + keys ("Mirror, Alpha & Omega · Verse · C, G")
  - Production: path name + duration ("Workflow Foundations · 12 min")
- **Duration** (right-aligned, prominent)
- **Warm-up badge** on the first block when applicable

No memory type labels shown — the display adapts per module without naming the type.

### Single block — expanded state (tap to reveal)

Tapping a block reveals:
- **Why snippet** — concise reason this block is in the session ("4 overdue cards · chord function goal due in 9 days · last practiced 5 days ago")
- **Quick-launch button** — "↗ Open [Module Name]" — jumps directly into the relevant module
- **Songs only:** specific section + key combination targets shown in the why snippet

### Session stack

- Blocks stacked vertically, proportional height to time allocation
- 2px gap between blocks, slight padding and rounding on the stack container
- Typical session: 4–5 blocks for balanced option, 1–2 blocks for focused option

### Two proposal cards — primary tension

The two options always represent **breadth vs. depth**:
- **Card 1 (default):** balanced, 4–5 blocks, broad module coverage — "Stay on track overall"
- **Card 2:** focused, 1–2 blocks, depth on the highest-priority item — "Go deep on [Module] today"

Strategic identity titles name the difference clearly. This is the primary driver of the two-option proposal — not situational. Always breadth vs. depth.

Phone: swipe between cards with paginator dots. Desktop: side by side.

### "Why this plan?" panel

- Collapsed by default, always
- Tap "Why this plan? ↓" to reveal
- Color-coded dot per block, one concise reason per module
- Surfaces pace deficit language when relevant (see Section 2)

### Feasibility banner

Sits **above the session stack** on the proposal screen when any goal is behind pace. Same design as Practice Sessions home banner (see Section 3) — most urgent goal leads, rest collapsible.

### Time adjustment — tappable on proposal screen

The time allocation ("45 min") shown in the proposal header is **directly tappable**. Tapping opens an inline time picker (same presets as input Question 1: 15 / 30 / 45 / 60 / 90 / custom). Changing the time regenerates the proposal instantly — no re-entering the input flow.

### "+ Add block" picker

At the bottom of the session stack, a subtle "+ Add block" affordance. Tapping opens a three-option picker:

**1. Go deeper on something already in this session**
- Existing session blocks shown as selectable cards
- User taps one, declares how much more time
- Adds a second block for that module/item ("Practice Mirror for another 30 min")

**2. Next priority (algorithm suggestion)**
- Single recommended item: "Based on your goals, the next best use of your time is —"
- One-tap add

**3. Pick your own**
- Browse by module
- Algorithm surfaces next-priority suggestions within each module
- User can override completely — full agency

Covers three real scenarios: in-flow and want to stay there (option 1), want to stay optimal (option 2), know exactly what you want (option 3).

---

## 5. Input questionnaire UX (NEW — April 29, 2026)

**Format:** Bottom sheet, slides up from Practice Sessions home. Compact — all five questions visible without scrolling. No typing anywhere — all tap-based (presets, pill buttons, 1–5 tap rows, toggles).

**Question order:** Time → Context → Day plan → Intent → Energy

Energy is last — most skippable, doesn't block the fast path. Intent moves up because it directly shapes the proposal and users set it consciously each session.

**Pre-fill behavior:**
- Context → remembers last session ✅
- Day plan → remembers last session ✅
- Time → always blank, declare fresh ✗
- Intent → always blank, declare fresh ✗
- Energy → always blank, real-time only ✗

**Intent — "push on specific item"** expands the sheet inline to show an item picker. No other question requires extra space.

**Generate button** always visible without scrolling — never buried below the fold.

**Time adjustment on proposal screen** → time-only inline picker, not the full sheet. "Try different inputs" re-opens the full sheet for everything else.

---

## 6. Cold-start experience (NEW — April 29, 2026)

**Behavior:**
- Algorithm falls back to goal-driven module selection — picks items from each goal-linked module, distributes time proportionally across them
- Blocks look identical to normal proposals — same visual design, no degraded or special-case UI
- "Why" snippet is honest: "You haven't practiced this yet — starting fresh"
- **One-time note** above the first generated proposal: "This is your first generated session — recommendations will get smarter as you practice."
- Disappears permanently after the first session. Never surfaces again.

Adjust thresholds and fallback behavior from real use if needed.

---

## 7. Global session timer (NEW — April 29, 2026)

### Architecture

**One global session timer, app-level.** Not owned by any individual module. Built early in Phase 3 before the block timer UI — it is foundational infrastructure that everything else depends on.

The timer owns:
- Active session state (running / paused / ended)
- Current block identity
- Elapsed time per block
- Total active session time
- Wall-clock time since session started

Every module activity reports into it — modules run *within* the timer, they don't own it.

### Auto-pause / auto-resume

- **Pauses automatically** when user navigates away from the active module
- **Resumes automatically** when user returns to the active module
- No manual pause/resume required — the app infers context from navigation
- Applies universally across all timed module activities: Song Repertoire, Shapes & Patterns, Phase 3 block timer, and any future module with timed practice

### Global banner

Follows the user app-wide whenever a session is active (running or paused).

**Banner shows:**
- Current block / song name
- Active elapsed time
- Paused / running state indicator
- "End session" tap target

Sits above the nav bar, unobtrusive. Tapping anywhere on the banner (except "End session") returns the user to the active module.

### Drift detection

The timer simultaneously tracks:
- **Wall-clock time** — total time since session started
- **Active time** — unpaused time only (actual practice time)

**Soft warning** — when active time drops below ~60% of wall-clock time, the banner shows drift: "12 min active of 28 min elapsed."

**Hard prompt** — after 15+ minutes of continuous pause, a modal surfaces: "Still practicing? Your session has been paused for 15 minutes." → [Resume] [End session]

The hard prompt protects data quality — a session that is mostly paused should not count as a full practice session in history.

**All thresholds are tunable** — calibrate from real use.

### Relationship to Song Practice Timer

Song Practice Timer is not a separate system. It is the global session timer applied to a song-only session (outside of a full generated practice session). No separate design doc needed. `PracticeLogModal` remains the stopgap until the global timer ships; deprecate in Phase 7 cleanup.

### Shapes & Patterns

Auto-pause/resume applies to Shapes & Patterns drill sessions exactly as it does to song sessions. Same global timer primitive, same banner behavior.

### Phasing

Global session timer ships **early in Phase 3**, before the block timer UI. Everything else in Phase 3 depends on it.

---

## 8. Phase 2 updated step list

Phase 2 now has 7 steps (was 6):

1. ✅ spacingState population (all 8 modules)
2. ✅ Coverage metric vocabulary + GoalCreationFlow wiring
3. ✅ moduleItemCounts helper
4. ✅ Coverage + accuracy progress helpers
5. ✅ YearlyAnchorFlow UI (414/414 tests passing)
6. Goals home redesign (by-timeframe + by-module views, expanded goal rows, YearlyAnchorFlow integration)
7. Goal feasibility checking — `getGoalFeasibility()` helper + Goals home feasibility surface (NEW)

Practice Sessions home feasibility banner deferred to Phase 3.

---

## 9. Items NOT yet designed (still needed before Phase 3 build)

1. ~~**Block visualization**~~ ✅ Complete — see Section 4
2. ~~**Input questionnaire UX**~~ ✅ Complete — see Section 5
3. ~~**Cold-start experience**~~ ✅ Complete — see Section 6
4. ~~**Song Practice Timer**~~ ✅ Resolved — subsumed into global session timer, see Section 7

**All Phase 3 design items are complete.** Phase 3 build can begin after Phase 2 Steps 6 and 7 ship.
