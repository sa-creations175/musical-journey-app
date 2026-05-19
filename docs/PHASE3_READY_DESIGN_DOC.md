# Phase 3 — Final Design Document
## All decisions needed before Phase 3 build starts

Created: April 29, 2026  
Last updated: April 30, 2026  
Purpose: Single source of truth capturing every design decision made in the April 29–30 sessions. Paste this alongside PRACTICE_SESSIONS_DESIGN_3.md at the start of Phase 3 build. It supersedes the addendum where they conflict.

---

## Status: Phase 2

**COMPLETE. All 7 steps shipped April 28–30. 701/701 tests passing.**

1. ✅ spacingState population (all 8 modules)
2. ✅ Coverage metric vocabulary + GoalCreationFlow wiring
3. ✅ moduleItemCounts helper
4. ✅ Coverage + accuracy progress helpers
5. ✅ YearlyAnchorFlow UI — all substeps 5a–5g complete
6. ✅ Goals home redesign — by-timeframe + by-module views, expanded goal rows, feasibility slots reserved
7. ✅ Goal feasibility checking — getGoalFeasibility() + Goals home feasibility surface

Pre-Phase 3 cleanup also complete: accuracy slider paired text input (YearlyAnchorFlow + GoalCreationFlow).

Practice Sessions home feasibility banner → Phase 3 (not Phase 2).

---

## Part 1: Algorithm spec corrections

### Step 3 — getCandidatesForGoal() translation layer (NEW)

The existing spec says items enter the pool when "goals reference them." Insufficient for coverage goals, which reference modules or sub-areas rather than specific items.

getCandidatesForGoal(goal) is a core primitive called in Step 3. Expands each goal type into a concrete set of itemRefs:

- Coverage goal (overall) — all spacingState rows where itemRef matches the module's itemRef prefix patterns AND acquisition_stage not in COVERED_STAGES (acquired, consolidated, mastered). Items with no spacingState row (never touched) are also valid candidates — implicitly new stage.
- Coverage goal (specific sub-area) — same, filtered to itemRef patterns for declared sub-area only.
- Accuracy goal — all items in the relevant module/group, regardless of stage.
- Consistency goal — all items in the relevant module. Signal is "practice this module more often," not specific items.
- Umbrella goal — delegate to children; weight applied at child record level, not umbrella level.
- Yearly anchor — delegate to dimension children (Breadth/Mastery/Accuracy records). Each dimension child is a real goal record the algorithm handles directly. Note: Consistency dimension no longer generates a child goal record — tracking lives in weekly consistency goals, not the yearly anchor.

### Step 4 — Goal-alignment weighting: per-goal-type mapping (UPDATED)

- Coverage goals — items from getCandidatesForGoal get goal-alignment boost. Boost scales with pace-based urgency (see Part 2).
- Accuracy goals — items in relevant module/group get boosted.
- Consistency goals — every candidate item from relevant module gets mild lift.
- Umbrella goals — weight distributed to children, not applied at umbrella level.
- Yearly anchor dimension children — treated as regular goal records of their metric type. No special casing.

### Step 6 — Within-day spacing: out of scope for Phase 3 (CORRECTION)

Phase 3 skips Step 6 entirely. Items in acquiring stage still surface via acquisition factor boost in Step 4. Within-day reinforcement logic is Phase 6.

Phase 3 algorithm steps: 1, 2, 3, 4, 5, 7, 8, 9. Step 6 is a clearly marked placeholder stub.

---

## Part 2: Pace-based urgency for coverage goals (NEW)

For any coverage goal (weekly, monthly, or yearly):

- Expected coverage = (days elapsed / total days in period) × total items
- Actual coverage = getCoverageCount(metric)
- Pace deficit = expected − actual
- Pace ratio = actual / expected (below 1.0 = behind, above 1.0 = ahead)

Weight mapping: ahead of pace → mild ambient boost. On pace → moderate boost. Behind pace → boost escalates proportionally.

Pace deficit surfaces in the "Why this plan?" reasoning panel only — not on the goal row itself.

---

## Part 3: Goal feasibility — full design (Phase 2 Step 7 + Phase 3)

### Four-tier status model + pill design

Text label only, no icons. Color carries the meaning. No red anywhere.

| Status | Label | Background | Text |
|--------|-------|-----------|------|
| on_track | On track | #EAF3DE | #3B6D11 (green) |
| at_risk | Pick up pace | #FAEEDA | #854F0B (yellow/amber) |
| critical | Act now | #FAECE7 | #993C1D (orange) |
| unrecoverable | Unrecoverable | #F1EFE8 | #5F5E5A (gray) |
| aspirational | Progressing | #E1F5EE | #0F6E56 (teal) |
| unknown | dashed em-dash | (inert) | — |

### Status thresholds (all tunable constants)

Coverage goals: projection ≥ 100% → on_track; ≥ 85% (AT_RISK_RATIO) → at_risk; < 85% → critical; deadline passed → unrecoverable.

Accuracy goals: current ≥ target → on_track; gap ≤ 5pp and outside critical window → at_risk; gap > 5pp AND in last 20% of period (ACCURACY_CRITICAL_WINDOW_PCT = 0.20) → critical; deadline passed → unrecoverable.

Consistency goals: current ≥ target OR pace ratio ≥ 1 → on_track; ratio ≥ 0.85 → at_risk; ratio < 0.85 AND sessionsNeeded ≤ daysRemaining → critical; sessionsNeeded > daysRemaining → unrecoverable; deadline passed → unrecoverable.

Weekly consistency goals use current Mon–Sun window only, not cumulative year-to-date. daysRemaining counts today.

### Default day profile mix

3 Standard + 1 Deep + 1 Light per week. Hardcoded constant, user-editable in Phase 7 settings.

### Items per session (tunable)

| Module | Standard | Deep | Light |
|--------|----------|------|-------|
| Ear Training | 30 cards | 50 | 10 |
| Harmonic Fluency | 25 cards | 45 | 8 |
| Shapes & Patterns | 20 min | 35 | 8 |
| Song Repertoire | 25 min | 45 | 10 |
| Production | 30 min | 60 | 15 |

Phase 3 algorithm note: keyboard-time modules (Songs, Shapes & Patterns) should be weighted higher in session time distribution than card modules (ET, HF).

### Coverage unit per module

| Module | Coverage unit | Activity unit |
|--------|--------------|---------------|
| ET / HF | cards | cards |
| Shapes & Patterns | shapes | minutes |
| Song Repertoire | songs at [Stage] | minutes |
| Production | lessons | minutes |

Song coverage strings inject target stage dynamically (Comfortable / Solid / Internalized).

### Recommendation strings — principles

Always calculated and specific — derived from actual numbers, not templates. Natural language, module-specific units. Examples:

- "On pace — projected to cover all 143 cards by Dec 31."
- "At current pace, projected to cover 900 of 1000 cards by Jun 11."
- "Need about 15 cards per week to hit 200 by Jun 25."
- "Even at full pace, projected to cover 20 of 500 cards by May 7."
- "Deadline passed — reached 47 of 100 cards."
- "Need about 2 songs to reach Comfortable per week to hit 25 by Dec 31."
- "Need 3 more sessions this week."
- "Need 1 more session today to stay on track."
- "0 of 4 sessions with 2 days left — you'd need 2 sessions per day to reach your target."
- "5 days left to close a 10-point gap. Keep practicing to close the gap before May 5."

### Unrecoverable message (unified)

"Didn't hit this one. Adjust the goal to match where you are now — and keep going."

Applies to: unrecoverable child in mixed umbrella, standalone unrecoverable goal, all-unrecoverable umbrella. When all children are unrecoverable: per-child messages disappear, only umbrella-level message shows. Children still render with dimension label + progress bar.

### Aspirational placeholder pool (5 phrases, seeded by goal ID)

1. "Your daily wins compound into the greatness outlined here."
2. "Every session moves you closer to this vision."
3. "This is where you're headed. Show up and trust the process."
4. "The trajectory starts today. Keep going."
5. "Your daily wins compound and set the trajectory for this vision."

### Umbrella worst-case rollup

Worst-case computed across actionable children only — excludes unrecoverable. Breakdown still counts unrecoverable. All-unrecoverable → status null → show unified message.

### Yearly anchor consistency dimension

Does NOT generate a child goal record. No child row, no subtitle label. Tracking lives in weekly consistency goals. Future (Phase 5+): retrospective view showing weekly hit rate ("28 of 52 weeks").

### Practice Sessions home banner (Phase 3)

Persistent banner when any goal is behind pace. Most urgent goal leads. Primary row always visible; other goals collapsible ("3 more goals behind pace ↓"). Disappears when nothing behind pace.

Language scales with urgency: weekly → "You need 3 ET sessions before Sunday." → [Deep day]; monthly → moderate framing; yearly → softer framing.

Tapping banner or [Deep day] pre-selects Deep in the input questionnaire.

---

## Part 4: Block visualization (FULLY DESIGNED)

### Single block — default state

- Full block background in module accent color
- Module name (top, small, uppercase)
- Activity description adapts per module type:
  - Declarative (ET, HF): activity name + attempt count
  - Procedural (Shapes): activity name + duration
  - Integration (Songs): song name + section + keys
  - Production: path name + duration
- Duration (right-aligned, prominent)
- Warm-up badge on first block when applicable

### Single block — expanded state

- Why snippet (concise reason this block is in the session)
- Quick-launch button "↗ Open [Module Name]"
- Songs: specific section + key targets in why snippet

### Session stack

Blocks stacked vertically, height proportional to time. 2px gap between blocks.

### Two proposal cards

Always breadth vs. depth:
- Card 1: balanced, 4–5 blocks — "Stay on track overall"
- Card 2: focused, 1–2 blocks — "Go deep on [Module] today"

Phone: swipe between cards. Desktop: side by side.

### "Why this plan?" panel

Collapsed by default. Tap to reveal. Color-coded dot per block, concise reason per module.

### Personal affirmation on proposal screen

Randomly selected from user's personal pool of past session affirmations. Shown above or below the session stack. Nothing shown if no affirmations exist yet.

### Time adjustment on proposal screen

Tapping time → inline time picker, instant regeneration. "Try different inputs" → full sheet.

### "+ Add block" picker

Three options at bottom of stack:
1. Go deeper on existing block
2. Next priority (algorithm suggestion) — one-tap add
3. Pick your own — browse by module

---

## Part 5: Input questionnaire UX (FULLY DESIGNED)

Bottom sheet, compact, all five questions visible without scrolling. No typing. Generate button always visible.

Question order: Time → Context → Day plan → Intent → Energy

Questions:
- Q1: Time (presets: 15 / 30 / 45 / 60 / 90 min + custom)
- Q2: Context (keys / laptop / phone)
- Q3: Day plan (Just this session / First of multiple / Continuing today)
- Q4: Intent (Balanced / Lean to goals / Recover / Push on specific item → inline item picker)
- Q5: Energy check-in — Focus / Motivation / Inspiration, 1–5 tap rows, all skippable

Pre-fills: Context and Day plan remember last session. Time, Intent, Energy always blank.

Time on proposal screen → time-only picker. "Try different inputs" → full sheet.

---

## Part 6: Cold-start experience (FULLY DESIGNED)

### Behavior

Goal-driven module selection, time distributed proportionally. Blocks look identical to normal proposals. "Why" snippet: "You haven't practiced this yet — starting fresh." One-time banner above first proposal: "This is your first generated session — recommendations will get smarter as you practice." Disappears after first session.

### Cold-start item selection per module

All selection is goal-driven first. Ordering rules as tiebreaker:

- Ear Training — follow defined learning order (intervals → chords → progressions)
- Shapes & Patterns — follow defined learning order (shapes build on each other)
- Production — follow defined learning order (explicitly sequential)
- Song Repertoire — user-specified via goals; algorithm defers to declared songs
- Harmonic Fluency — concept-focused until traction. Start with one concept group, surface those cards until basic acquisition, then expand to the next group. Not random, not fully sequential.

---

## Part 7: Abundance flow (FULLY DESIGNED)

Trigger: user is ahead of pace, has cleared the queue for the day, or the algorithm finds nothing urgently due.

Framing: "You're ahead of pace — nice work. What do you want to focus on today?"

Three-path choice screen — full-width stacked cards:
1. Get ahead — "Work on what's coming up next. Bank progress before it's due."
2. Drive home — "Revisit what you know. Make it second nature."
3. Expand — "Start something new from your goals. Break new ground."

Tapping a card → instant proposal generation.

On the proposal screen: Back button returns to three-path screen. Regenerate stays on current path with fresh item selection.

---

## Part 8: End-of-session summary (FULLY DESIGNED)

One screen, three zones:

Top zone:
- "Session complete"
- Total active time + block count
- One-tap session rating: "Locked in" / "Solid" / "Going through it"

Middle zone — block list:
- Left: module color accent (3px) + block name + duration/unit summary
- Right: milestone if triggered ("Mirror hit Comfortable ✓") OR quiet delta ("ET coverage +2") OR nothing

Bottom zone — affirmation field:
- "Optional — a note to your future self"
- Placeholder: "I am... or I can..."
- Free text, optional, auto-saves on Done
- Shown on proposal screen in future sessions, randomly selected from personal pool

Done button → Practice Sessions home.

---

## Part 9: Global session timer (replaces "Song Practice Timer")

One global session timer, app-level. Owns active session state, current block, elapsed time per block, total session time. Every module reports into it. Must be built before Phase 3 touches any individual module timers.

Auto-pause/resume: pauses on navigation away from active module, resumes on return. Universal across all modules.

Global banner: current block/song, active elapsed time, paused/running state. Sits above nav bar. Tapping returns to active module.

Drift detection: tracks wall-clock time and active time.
- Soft warning: active time < 60% of wall-clock → banner shows drift
- Hard prompt: 15+ min continuous pause → "Still practicing?" modal → [Resume] [End session]

Both thresholds tunable.

Consumers: Song Practice Timer, Shapes & Patterns drills, Phase 3 block timer.

PracticeLogModal stays as stopgap. Deprecate Phase 7.

---

## Part 10: Goals home — visual design decisions (Phase 2 reference)

### Module section colors (by-module view + inside timeframe layers)

| Module | Tint | Border |
|--------|------|--------|
| Ear Training | #EAF3DE | #3B6D11 |
| Harmonic Fluency | #EEEDFE | #534AB7 |
| Shapes & Patterns | #FAEEDA | #854F0B |
| Song Repertoire | #FBEAF0 | #8B3A52 |
| Production | #E6F1FB | #1F3A6E |
| Practice consistency | #F1EFE8 | #5F5E5A |

### By-timeframe view — nested visual hierarchy

Scope layer container: dark neutral left border (#2C2C2A), near-white tint (#FAFAF9).
Module groups inside: colored tint + border per table above.
Goal cards: white background, standard border.

### Child goal typographic treatment

Dimension children render with bold + italic description text.

### Yearly anchor vision statement titles (auto-generated, editable)

- Ear Training → "Make music speak to me — intervals, chords, progressions, all of it."
- Harmonic Fluency → "Master the language of harmony."
- Shapes & Patterns → "Lock the shapes in. See them, hear them, flow between them — every key."
- Song Repertoire → "Own my songs. Play them freely, shape them intentionally, make them mine."
- Production → "Make the studio feel like home. Master the tools, play, and create freely."
- Practice consistency → "Show up every day. Make music practice as natural as breathing."

Title renders in full module accent color. No year suffix.

### Dimension display labels

| Internal | ET / HF | Songs / Shapes / Production |
|----------|---------|---------------------------|
| Breadth | Breadth | Breadth |
| Mastery | Mastery | Mastery |
| Depth | Accuracy | Proficiency |
| Consistency | (no child record) | (no child record) |

---

## Part 11: Design questions — final status

| Question | Status |
|----------|--------|
| Block visualization | ✅ Complete — Part 4 |
| Input questionnaire UX | ✅ Complete — Part 5 |
| Cold-start experience | ✅ Complete — Part 6 |
| Cold-start block selection | ✅ Complete — Part 6 |
| Song Practice Timer | ✅ Resolved — Part 9 |
| Abundance flow | ✅ Complete — Part 7 |
| End-of-session summary | ✅ Complete — Part 8 |

**All Phase 3 design questions are resolved. Phase 3 build is fully unblocked.**

---

## Phase 5+ items (logged, not designed)

- Item-count goal feasibility (1 song/month default for song_whole_at_level, configurable)
- Weekly consistency hit rate retrospective view ("28 of 52 weeks")
- Accuracy threshold + day profile mix user-editable settings UI
- Inline title edit on umbrella goals (Phase 7 polish)
- PracticeLogModal deprecation (Phase 7)
