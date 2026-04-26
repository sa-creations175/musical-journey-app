# Practice Sessions — Design Document

Living design doc capturing the architecture, philosophy, algorithmic logic, and UI specifications for the Practice Sessions module. This document is the canonical reference for building this module.

Last updated: April 25, 2026 (full design review completed; all 10 prior open questions resolved; significant architectural simplifications)

**Phase 1 scope refinements (April 25, 2026, post-review):**
- Settings prompt-management UI (queue inspection + category mute toggles) **deferred to Phase 7**. Orchestration logic (queueing, tier prioritization, daily cap, suppression rules) still ships in Phase 1 — verified via dev console / programmatic checks.
- Memory type implemented as a **runtime lookup function (`getMemoryType(moduleRef)`) in Phase 1**, not a stored field on item records. Phase 2 can migrate to a stored field if and when spacing state begins consuming the value.

---

## How to use this document

**For design review:** Read top to bottom. Executive Summary and Risks is the TL;DR. UI Specifications and Phase 1 Build Spec are where build-ready detail lives.

**For Phase 1 build:** Skip directly to "Phase 1 Build Spec" near the bottom. Scope, schema, and deliverables are ready to paste into Claude Code.

**For future phases:** Each phase has its own scope description. Reference relevant section + global Architecture and UI sections.

**Living document:** Update Open Questions as answered. Update phasing as priorities shift.

**What changed in v3 (April 25, 2026):** Modes collapsed (no separate user-declared focus/acquisition state — emergent from goals + spacing state). Multi-component goals supported (umbrellas with sub-targets, schema in Phase 1, UI in Phase 2). Vacation mode simplified (decay continues, only goal target dates affected). Day profiles renamed Standard / Light / Deep. Performance ratings finalized as Flying / Cruising / Crawling. Centralized prompt orchestration introduced (3/day cap, tier-prioritized, suppressed during sessions). All 10 prior open questions answered — see "Resolved questions" section near the end.

---

## Executive summary

Practice Sessions is the **musicianship dispatcher** for the Musical Journey App. Its job: take the multi-dimensional question "what should I practice right now to grow holistically as a musician?" and turn it into a concrete, time-bounded, actionable answer that respects available time, context (keys/laptop/phone), goals, energy, freshness across all dimensions, and the research on how musical skill is acquired and retained.

It is the last unbuilt top-level nav item and the most architecturally significant module in the app. It ties everything else together — Goals, Dashboard, Skills Catalogue, every learning module, and eventually the meta-dashboard.

### Top-line risks

1. **Complexity risk.** The session generator has many inputs and produces variable outputs. Without transparent reasoning, recommendations may feel arbitrary. Mitigation: always show "why this plan."

2. **Scope risk.** Touches every other module. Must be phased, with each phase tested before the next.

3. **Cold-start risk.** Depends on data — spacing state, freshness, declared priorities, goals, learned patterns. None exists at first launch. Phase 1 must work with minimal data.

4. **Algorithmic correctness risk.** Spaced repetition, interleaving logic, time allocation are research-grounded but need calibration. Initial parameters will be wrong. Must be tunable.

5. **User mental-model risk.** If users can't predict recommendations, trust erodes. Reasoning visible AND behavior consistent.

6. **Goals-layer dependency.** Practice Sessions' richest behavior depends on goals being declared. Goals module built first or alongside. (Mitigated by Q7 resolution: Practice Sessions degrades gracefully without goals.)

7. **Data model evolution risk.** Existing modules don't tag items with memory type or acquisition stage. Auto-tagging by module covers most cases; user override deferred.

8. **Practice History view risk.** Full analytics view is a major design surface deferred until real session data exists. Phase 1 ships basic weekly calendar (deferred to Phase 7 actually — see phasing).

9. **Acquisition stage detection risk.** Replacing user-declared acquisition mode with system-inferred acquisition stage (Q8 resolution) requires reliable behavioral signals. If detection fires too aggressively or not aggressively enough, sessions feel off. Tunable thresholds required.

10. **Creative play isn't a skill.** Just Play, Just Produce, Harmonic Diary engagement are expression, not skill acquisition. No correctness, no spacing curve based on performance — but still need regular contact. Treated as a fourth memory type.

11. **First-launch friction risk.** Goals questionnaire could feel like 20-min homework if asked all at once. Mitigation: progressive layering, this-month-first, longer ranges optional and prompted later.

12. **Prompt fatigue risk.** Proactive prompts are central to design philosophy ("nudges, not surprises"). Too many become noise. Mitigation: centralized orchestration with 3/day soft cap (Q10 resolution).

---

## The question Practice Sessions answers

> "Given how I'm doing across all dimensions of musicianship, given the time I have available right now, given my goals, given my energy, and given the research on how musical skill is built — what should I do for the next [N] minutes?"

Meta to all other modules. Dashboard answers "how am I doing?" Practice Sessions answers "what next?"

It is NOT:
- A simple session timer
- A static practice plan
- A streak / gamification system
- A lesson-of-the-day generator

It IS:
- A research-grounded practice scheduler
- A balance protector
- A goal aligner
- A consolidation accelerator
- A musicianship dispatcher

---

## Philosophical foundation

### Inherited principles (from `DESIGN_DECISIONS.md` and `PERSONAL_OS_DESIGN_PRINCIPLES.md`)

- **Honest metrics, not flattering ones.**
- **Time is the honest measure of investment.**
- **Automation serves curation, not replaces it.** System suggests structure; user retains agency.
- **Smart decay respects earned mastery.**
- **User-declared priority per item.** Comfort / Deep / Maintenance-only.
- **Visual scaffolding with progressive fading.** Extends to algorithmic transparency.
- **Bite-size + optional deep dive.**
- **Settings changes apply forward, never retroactively.**
- **Proactive prompts as nudges, not surprises.**
- **Canonical vocabulary across the app.**

### NEW principles surfaced by this design (April 25, 2026)

- **Day as the unit of breadth.** Daily breadth across all dimensions is the goal, achieved through coordinated context-shifting sessions across the day, not one all-encompassing session.
- **Sessions have roles.** Opener, middler, closer.
- **Show the reasoning.** When proposing a plan, explain what was optimized for.
- **Balance is the default; depth is the choice.**
- **Critical-stale surface persists during depth-heavy weeks.**
- **Acquisition is detected, not declared.** (NEW — Q8) System infers acquisition stage from user behavior + spacing state, not from user-declared mode toggles.
- **Show the trade-off, not just the plan.** (NEW — Q1, Q3, Q5) When a user choice has costs (focus on one area, expand a goal, pick option A over B), the app surfaces what gets delayed, deferred, or risked at the moment of choosing — not after.
- **Deduce intent from signals, don't accumulate declarations.** (NEW — Q1, Q8) When the system can infer what the user wants from existing data (goals, behavior, spacing state, recent practice), prefer inference over asking the user to declare it explicitly. User declarations are a last resort, not a default. Reduces friction, keeps state honest, prevents user-declared state from drifting out of sync with reality.
- **Honest about abundance, not just scarcity.** (NEW — Q3) When the user is genuinely caught up, name it as a real strategic moment and offer paths (Get ahead / Drive it home / Expand the goal) rather than auto-filling thinly to disguise it.
- **Honest disclosure + full user agency.** (NEW — meta-pattern across Q1, Q3, Q6, Q7) The app surfaces information, makes choices easy, never gates the user's action, never silently makes choices for them. Sharper application of "automation serves curation."
- **Truth-honoring trumps gentle defaults.** (NEW — Q2) When reality is harder than the gentle default would suggest (e.g., items genuinely went stale during vacation), the app reflects reality. The kindness is in helping the user *navigate* the truth, not in hiding it.
- **Prompt prominence varies by signal availability.** (NEW — Q4) When the user's input is the *only* signal available (subjective rating of song practice), prompt is prominent. When the system already has objective data (ear training accuracy), prompt is light. Don't extract data the system already has; lean in where it doesn't.

---

## Architectural placement

### Navigation

**Overview group, top-level nav order:**

1. **Goals** (NEW — prerequisite)
2. **Dashboard**
3. **Skills Catalogue**
4. **Practice Sessions**

Goals leads because its data feeds everything below it. Dashboard answers current state. Skills Catalogue is the inventory. Practice Sessions is the action layer.

**Goals nav color: foundational slate `#5a5e6e`. Practice Sessions nav color: teal `#4a9088`. Both meta-layers above the learning modules.**

### Dependencies

Practice Sessions reads from:
- Every learning module's data (skill records, freshness, last-engaged timestamps)
- Goals layer (yearly / monthly / weekly / daily — note: daily goals do NOT exist as entities, see Q1)
- User preferences (priority declarations, mastery levels, day profiles)
- Practice history
- Spacing state per item (including auto-detected acquisition stage)

Practice Sessions writes to:
- `practiceSessions` table
- `practiceBlocks` table
- Per-item engagement records back to source modules
- Spacing state updates (advances acquisition stage on engagement signal)

---

## Data model

```
practiceSessions
  id, user_id
  started_at, ended_at, planned_duration_min, actual_duration_min
  context: 'keys' | 'laptop' | 'phone' | 'mixed'
  time_of_day: 'morning' | 'midday' | 'evening' | 'late_night'
    -- Time-of-day windows (April 2026):
    --   late_night: 12am – 4am  (rolls up to previous calendar day's metrics)
    --   morning:    4am – 12pm
    --   midday:     12pm – 6pm
    --   evening:    6pm – 12am
    -- Day profiles only let users plan for morning / midday /
    -- evening. Late-night sessions are logged when they happen,
    -- labeled correctly by the auto-labeler, and roll up under
    -- the previous calendar day's totals.
  session_role: 'opener' | 'middler' | 'closer' | 'only'
  session_intent: text | null  -- per-session intent (e.g., 'balanced', 'lean_to_goals', 'recover', 'push_on_X', or one of the abundance paths from Q3)
  hard_blocks: boolean
  energy_focus: integer (1-5)
  energy_motivation: integer (1-5)
  energy_inspiration: integer (1-5)
  day_profile_used: 'standard' | 'light' | 'deep' | 'custom' | null
  reasoning_snapshot: jsonb  -- "why this plan" data captured at generation time
  notes: text
  created_at, updated_at, last_engaged_at

  NOTE: No 'mode' field. Modes (focus / acquisition) collapsed in Q8 — emergent from goals + spacing state, not user-declared. session_intent captures lighter per-session intent only.

practiceBlocks
  id, session_id
  order_index
  module_ref: text
  sub_module_ref: text
  item_refs: text[]
  planned_minutes, actual_minutes
  completion_status: 'completed' | 'partial' | 'skipped' | 'extended'
  performance_rating: 'flying' | 'cruising' | 'crawling' | null
  block_color: text
  notes: text
  created_at, updated_at

spacingState
  id, user_id
  item_ref: text
  module_ref: text
  memory_type: 'declarative' | 'procedural' | 'integration' | 'expression'
  acquisition_stage: 'new' | 'acquiring' | 'acquired' | 'consolidated' | 'mastered'
    -- auto-detected from engagement behavior; see "Acquisition stage detection" section
  current_interval_days: number
  last_engaged_at: timestamp
  next_due_at: timestamp
  performance_history: jsonb
  created_at, updated_at

goals
  id, user_id
  scope: 'lifetime' | 'two_to_three_year' | 'yearly' | 'quarterly' | 'monthly' | 'weekly'
    -- NOTE: no 'daily' scope. Daily intent emerges from algorithm, not stored. (Q1)
  description: text
  target_metric: text | null  -- e.g., 'items_at_level', 'hours_on_modules'
  target_value: number | null
  target_unit: text | null    -- e.g., 'cross-key' (when target_metric is 'items_at_level')
  current_value: number
  context_tag: 'keys' | 'laptop' | 'phone' | 'mixed' | null
  related_modules: text[]
  related_items: text[]
  start_date, target_date
  status: 'active' | 'paused' | 'completed' | 'abandoned'
  parent_goal_id: text | null  -- relationship link (Q6)
  contributes_numerically_to_parent: boolean (default false)  -- rollup toggle (Q6)
  is_umbrella: boolean (default false)  -- umbrella goals have sub-goals as children; their own metric may be null (Q6 multi-component refinement)
  created_at, updated_at, last_engaged_at

-- 2-3 year replaces 3-5 year as the longest finite-horizon goal scope
-- (April 2026). 3-5 years was too distant to plan honestly; the
-- lifetime layer absorbs longer-range aspiration as text-only vision.
--
-- Measurable fields (target_metric, target_value, target_unit,
-- target_date) are populated for horizons ≤ 1 year only (weekly
-- through yearly). For 2-3 year and lifetime scopes, these fields
-- are null; the goal is captured as text via description and
-- optional related_modules / related_items only. See "Measurable
-- horizons ≤ 1 year" principle.

dayProfiles
  id, user_id
  name: 'standard' | 'light' | 'deep' | 'custom'
  expected_sessions: jsonb  -- shape: {morning: {minutes, context, skip}, midday: {...}, evening: {...}}
  is_default: boolean
  created_at, updated_at

vacationPeriods
  id, user_id
  start_date, end_date
  reason: text | null
  created_at, updated_at
  -- NOTE: no spacing_paused field (Q2 resolution — decay continues during vacation, vacation only affects goal target dates).

proficiencyDefinitions  -- read-only reference, seeded
  id
  level: text
    -- skill scope:      'planting' | 'sprouting' | 'branching' | 'rooted' | 'seasoned' | 'maintenance'
    -- song scope:       'learning' | 'comfortable' | 'cross-key' | 'internalized' | 'maintenance'
    -- production scope: 'learning' | 'comfortable' | 'cross-context' | 'internalized' | 'maintenance'
  scope: 'song' | 'skill' | 'production'
  short_label: text
  description: text
  example: text
  display_order: integer

-- Seeded with 16 rows total: 5 song + 5 production + 6 skill (skill
-- scope includes Maintenance as a separate row at display_order 6).

prompts  -- centralized orchestration (Q10)
  id, user_id
  prompt_type: text  -- e.g. 'song_proficiency_milestone', 'goal_period_review', 'vacation_return', 'set_goals_nudge'
  tier: 'high' | 'medium' | 'low'
  payload: jsonb  -- prompt-type-specific data (which song, which goal, etc.)
  surface: 'banner' | 'session_end' | 'home_screen' | 'modal'  -- where this prompt should appear
  status: 'queued' | 'shown' | 'dismissed' | 'engaged' | 'expired'
  created_at, shown_at, dismissed_at, expires_at, engaged_at
  user_dismissal_count: integer (default 0)  -- for cadence rules (e.g., 3-day re-prompt — Q7)
```

All tables follow standard `user_id`, `created_at`, `updated_at`, `last_engaged_at` pattern for cross-app meta-dashboard compatibility. All synced via existing Supabase sync layer with RLS policies per table.

---

## Memory type strategy

Four memory types, each with different spacing logic:

### 1. Declarative
**What:** Conceptual, fact-based knowledge.
**Examples:** Glossary terms, ear training categories (interval names, chord qualities), theory concepts, harmonic fluency cards.
**Spacing:** Pure spaced repetition with expanding intervals. Anki-style.
**Performance:** correct / incorrect (objectively measurable).
**Context:** Phone or laptop.

### 2. Procedural
**What:** Physical skill, muscle memory.
**Examples:** Chord shapes, scale patterns, voice-leading drills, fingering.
**Spacing:** Spaced repetition WITH minimum acquisition density. Cannot space too aggressively early.
**Performance:** subjective rating + completeness (no objective accuracy signal).
**Context:** Keyboard required.

### 3. Integration
**What:** Multi-skill synthesis under real-world conditions.
**Examples:** Songs (repertoire), full progressions in real keys, applied performance, **Production lessons** (concepts + applied production work).
**Spacing:** Spaced repetition with longer minimum block durations.
**Performance:** subjective rating, stage progression.
**Context:** Mostly keyboard. Some away-from-keyboard support.

### 4. Expression
**What:** Creative output. NOT a skill in the trackable-with-correctness sense.
**Examples:** Just Play, Just Produce, Harmonic Diary engagement, freeform composition.
**Spacing:** Recency-driven. Surface when stale.
**Performance:** Flying / Cruising / Crawling. No correctness.
**Context:** Just Play / Produce are keyboard. Harmonic Diary is multi-context.

### Tagging strategy: system-infers-by-module

Default memory type auto-assigned based on the module the item lives in. **No user override UI in v1.** Override capability filed as future build item.

**Module → memory type defaults:**

| Module | Default memory type |
|---|---|
| Harmonic Fluency | declarative |
| Glossary terms | declarative |
| Ear Training: Intervals | declarative |
| Ear Training: Chord Recognition | declarative |
| Ear Training: Chord Progressions | declarative |
| Ear Training: Scales & Modes | declarative |
| Shapes & Patterns: Scale Drills | procedural |
| Shapes & Patterns: Chord Shape Drills | procedural |
| Shapes & Patterns: Voice-Leading | procedural |
| Shapes & Patterns: Mental Visualization | procedural |
| Song Repertoire | integration |
| Production lessons | integration |
| Just Play | expression |
| Just Produce | expression |
| Harmonic Diary | expression |

### Implementation: runtime lookup function

Memory type is a runtime lookup function `getMemoryType(moduleRef): MemoryType`, **not** a stored field on existing module item records. Lives in `src/lib/memoryType.ts`. Throws on unknown module refs (fail-fast). 12 canonical module refs covered, mapping to the four memory types per the table above. Mapping is frozen at runtime.

Phase 2 (spacing state population) may migrate this to a stored field on `spacingState.memory_type` if the algorithm needs it cached per row. For Phase 1 / Phase 3 read paths, the runtime lookup is sufficient and avoids touching every module's existing data.

---

## Acquisition stage detection (NEW — replaces "Acquisition mode" from prior drafts)

**Q8 resolution.** Acquisition mode is no longer a user-declared toggle. The system infers acquisition stage from user behavior + spacing state.

### How it works

Each item in `spacingState` has an `acquisition_stage` field with five values:

- **`new`** — item exists but user has not engaged. (Default state for items the user hasn't touched.)
- **`acquiring`** — user has begun engaging. Item gets acquisition-density spacing treatment.
- **`acquired`** — user has demonstrated initial competency. Spacing intervals start expanding.
- **`consolidated`** — long-term retention demonstrated across multiple spaced reviews.
- **`mastered`** — internalized at the level the user declared as mastery goal. Maintenance-only.

### Detection signals

The system advances `acquisition_stage` based on observable signals:

- **`new` → `acquiring`**: First meaningful engagement (e.g., item touched in 2+ sessions within a week, OR user explicitly added item to a goal, OR item flagged as priority).
- **`acquiring` → `acquired`**: Initial competency demonstrated. For declarative: ~80% accuracy across recent attempts. For procedural / integration / expression: subjective rating consistently "Cruising" or "Flying" across 3+ engagements.
- **`acquired` → `consolidated`**: Item successfully refreshed across multiple expanding intervals without backsliding.
- **`consolidated` → `mastered`**: Threshold defined by the user's declared mastery goal for the item (e.g., a song reaching the user's declared "Internalized" target).

### Spacing implications by stage

- **`acquiring` items** get **acquisition-density spacing** — preferred ideal is multiple touches within a single day across context shifts (e.g., morning keys + afternoon phone + evening keys); fallback is consecutive-day touches when within-day isn't feasible. (Q8 confirmation: density matters more than within-day-vs-across-days.)
- **`acquired` items** start standard expanding-interval spacing.
- **`consolidated` items** get longer intervals.
- **`mastered` items** get maintenance-only review.

### What this replaces

Prior drafts had a user-declared "Acquisition mode" toggle. That's gone. The user doesn't say "I'm acquiring Mirror." The user just *practices* Mirror, and the system marks it as acquiring. When the user demonstrates competency, the system advances the stage automatically.

This implements the **"Deduce intent from signals, don't accumulate declarations"** principle.

---

## Focus, formerly a mode (Q8 resolution)

Prior drafts had "Focus mode" — a user-declared dimension-level override saying "I'm focusing on chord motion for 2 weeks." That's gone too.

**What replaces it:** When the user wants to focus on a dimension, they set a **weekly goal** (or monthly goal with weekly milestones) tied to that dimension. The algorithm naturally weights items linked to active near-term goals heavily. No separate mode toggle needed.

**Why this is better:**
- One mechanism (goals) instead of two (goals + modes)
- User intent is captured with target dates and metrics, not vague "focus periods"
- Trade-off disclosure happens at goal creation (Q1) — same surface, same principle
- Goals already roll up, persist, get reviewed; modes had a parallel lifecycle that was duplicative

**Per-session intent** (lightweight) still exists. At session start, user can declare what *this session* is for: balanced (default), lean toward this week's goals, recover / lighter touch, push on a specific item. This is captured in `practiceSessions.session_intent`. It's a today-question, not a multi-week declaration.

---

## Session role and time-of-day

Three roles a session can play in a day:

**Opener.** First (or only morning) session. Cognitively fresh attention. Sleep-based consolidation will lock in what's worked on. Suitable for acquisition work and harder cognitive demand.

**Middler.** Daytime session, often phone or short. Lower stakes. Reactive — fills gaps, addresses critically stale, or maintains lighter contact.

**Closer.** Evening session. Day's last chance for breadth. Should consolidate what's been hit and address what's missed. **If closer is the only session of the day, carries full breadth burden — even if short.**

### Determination

- User declares day plan at session start, OR
- User has pre-declared day profile, OR
- System infers from time of day + practice log

If user says "just this session, no plans for more today" → treated as closer regardless of clock time.

---

## Day profiles (Q9 resolution)

Three day profiles user defines during Goals onboarding:

- **Standard** — typical practice day
- **Light** — bare-minimum maintenance day (busy day, traveling, low energy)
- **Deep** — extended practice day where user has time to sink in

### Default pre-fills

| Slot | Standard | Light | Deep |
|---|---|---|---|
| Morning | 20 min keys | skip | 30 min keys |
| Afternoon | 20 min phone | 15 min phone | 30 min phone/laptop |
| Evening | 45 min keys | skip | 60 min keys |

These ship as a single generic default set. Fully editable per slot. No pre-question to tier defaults — users who don't fit will edit. Single set at ~85min / ~15min / ~120min daily totals lands within the research-supported "1-2 hours of focused work" zone for Standard and Deep.

### Behavioral rules

1. Pre-filled at onboarding with the defaults above. Fully editable per slot. Each slot has time, context, and a "skip this slot" toggle.
2. Day profiles are **informational signals**, not prescriptive commitments. Sessions extend, contract, or shift freely; the system logs reality, not intent.
3. Used as a **quick-pick at session start** — user declares "today is a Standard / Light / Deep day" as shorthand for the day's structure. The system uses the profile to plan distribution across the day's sessions.
4. **Self-correcting over time.** As actual behavior data accumulates (Phase 8), the system notices when reality diverges from declared profiles and prompts to update them honestly. ("Your Standard days are averaging 50 min of keys lately, but your profile says 65. Update the profile, or keep as-is?")
5. **Time-of-day variance is handled at session-role-calculation, not in profiles.** Day profiles structure the day; sessions adapt within it via opener/middler/closer logic.

---

## Pre-declared day profiles in onboarding

User defines all three (Standard / Light / Deep) during Goals onboarding Screen 2. User can override mid-day if reality changes. System uses profile to plan day's distribution before any individual session is generated.

System also **learns** typical patterns over time, enabling feasibility checks ("Your songs goal needs more keyboard time than your average week provides — consider extending or revising"). This is Phase 8 work.

---

## The session generation algorithm

Plain-language description of what runs when user opens Practice Sessions and finishes input questions.

### Step 1: Read context inputs
- Time available (user input)
- Context (keys/laptop/phone — user input or stored from previous)
- Time of day (system clock)
- Day plan (user input or pre-declared profile)
- Energy/mood — three brief questions (focus, motivation, inspiration)
- Session intent (per-session, lightweight — see below)

### Step 2: Calculate session role
- "Just this session" or "no more today" → closer (full breadth burden)
- Morning + planned-day-ahead → opener
- Midday + earlier session logged → middler
- Evening + earlier sessions logged → closer
- Default: opener

### Step 3: Pull candidate items
For each module, query items that are:
- Due for spaced review (next_due_at <= today), AND
- Compatible with current context, AND
- Not in user's current declared exclusion

Cold-start handling: items with no spacing state yet are treated as **fresh** (seeds in the ground). They appear in candidate pool only when their module is being engaged or when goals reference them.

### Step 4: Apply weighting based on goals and acquisition state (NEW — replaces "mode weighting")

- **Goal-alignment factor:** Items linked to active goals get weighted by goal urgency (target date proximity) and priority. Items linked to *near-term goals* (weekly, end-of-month with imminent target dates) get heavier weighting. This is what replaces the old "focus mode" — focus is emergent from goals.
- **Acquisition factor:** Items in `acquiring` stage get acquisition-density treatment. Within-day repeat if feasible, otherwise consecutive-day priority. This replaces the old "acquisition mode."
- **Freshness factor:** Stale items pulled forward.
- **Priority factor:** User-declared priority (Comfort / Deep / Maintenance-only) applied.
- **No user-declared mode applied** (modes don't exist).

### Step 5: Apply session role
- **Opener:** lean toward acquisition / fresh-attention items. Heavy theory ok.
- **Middler:** lean toward review and maintenance. Lighter cognitive load.
- **Closer:** if no earlier sessions today, full breadth distribution; if earlier sessions logged, prioritize what was missed.

### Step 6: Apply within-day spacing (acquisition items)
For items in `acquiring` stage: check if item touched earlier today. If not, ensure it appears. If yes, decide whether same-day reinforcement makes sense (research: 2-3 within-day touches optimal for acquisition). Fall back to consecutive-day density when within-day isn't feasible.

### Step 7: Allocate time per block
- Procedural items: minimum 5 min, typical 10-15
- Integration items (songs, production lessons): minimum 10 min, typical 15-20
- Declarative items (flashcards): minimum 3 min, typical 5-10
- Expression items: minimum 5 min, typical 10-20

If total exceeds available time, reduce blocks proportionally OR drop lowest-priority. Never go below minimums.

### Step 8: Sequence the blocks
- Warm-up first (low cognitive load)
- Acquisition / hard cognitive work next (fresh attention)
- Review and maintenance middle
- Creative / expression at end (consolidation through application)

### Step 9: Generate one OR two proposal cards

**One option** when:
- User's energy + time + context + active goals point to a clearly best-shaped session
- No genuine tension between options

**Two options** when:
- User is behind on a goal that needs more time (heavy-on-goal alternative is meaningfully different from balanced)
- Energy/mood reading is ambiguous (offering "lower-intensity balance" vs. "push through" makes sense)
- Genuine tension between what's stale and what would feel best today

**Default leans toward balance as primary recommendation.** Heavy-on-goal is the alternative when warranted.

Each option carries a **strategic identity** — not just "Plan A" / "Plan B" but a named purpose:
- "Stay on track overall" vs. "Push hard on chord motion"
- "Balanced session" vs. "Recovery / lighter touch"

The user picks between *strategies*, not just *content arrangements*. (Q5 resolution.)

### Step 9b: Handle the "no items strictly due" case (NEW — Q3 resolution)

If candidate pool is empty (no items strictly due, or only items linked to active goals/priority are available), the system does NOT auto-fill a thin maintenance session. Instead, it surfaces the moment honestly with three multi-select strategic paths:

- **🌱 Get ahead** — pull from items coming due in the next few days
- **🔥 Drive it home** — take an item near mastery and push it deeper
- **📈 Expand the goal** — surface that user is tracking ahead and prompt goal expansion

User can multi-select (1, 2, or 3 paths). System combines selections smartly, allocates time across them, shows reasoning. ("20 min ahead-work on approaching-due items, 25 min depth-push on Mirror, ordered with depth-push first while attention is fresh.")

If user has zero goals, zero priorities, and everything's been touched in the last 24 hours, the system can suggest creative time or rest as alternative paths.

### Step 10: Render the proposal as vertical stacked rectangle(s)

- **Desktop:** one rectangle full-width centered, OR two rectangles side-by-side
- **Phone:** one rectangle full-width, OR (if two options) **swipe between cards** (Q5)
  - Header above cards names two options explicitly: "Two plans for today. Pick one."
  - Each card carries strategic-identity title
  - Paginator dots at bottom indicate "1 of 2" / "2 of 2"
- Each rectangle:
  - Top: short title naming strategic identity
  - Body: vertical stacked blocks, each with module color, item description, time allocation, height proportional to time
  - Bottom: total time, expandable "Why this plan?" panel

**"Why this plan?" reasoning panel:**

Expandable. Lists:
- Active inputs (time, context, role, energy, intent)
- Top 3-5 reasons specific items selected ("Mirror chosen because: in `acquiring` stage, last touched 2 days ago, weekly goal in progress")
- What was NOT included and why ("Chord progressions skipped because: hit them this morning, fresh enough until tomorrow")
- **If goals are absent:** explicit honest note — "Goals not set — plan based on freshness and priority only. [Set goals]" (Q7)

User taps rectangle to confirm and proceed. Or "Try different inputs" to revise questionnaire.

### Step 11: User confirms and starts

User taps preferred rectangle (or only one if single option). Sees full block detail with each item to be practiced. Taps "Start Practice Session."

### Step 12: Time-blocked execution

For each block:
- Countdown timer starts (length = block's planned_minutes)
- Block content shows what to practice (with quick-launch into relevant module)
- **Soft-block mode:** timer dings, user can extend (+2 / +5 / +10 min) or move on
- **Hard-block mode:** timer dings, system advances after brief grace period (5 seconds) so user can quick-tap rating before auto-advance
- User taps "End this activity" when done OR system auto-advances on hard-block mode
- On end: block logged with actual_minutes, completion_status, **performance rating prompt**

### Step 13: Performance rating prompt (Q4 resolution)

Inline at block end. Three vertically stacked buttons with distinct colors:

- **Flying** (top — warm energizing color)
- **Cruising** (middle — neutral color)
- **Crawling** (bottom — cooler distinct color, not red)

Tonally playful, in motion-metaphor family.

**Behavioral rules:**

- Always **optional** — user can skip the rating and tap "Next" without selecting
- **Prompt prominence varies by block type:**
  - Objectively-measurable blocks (ear training, flashcards): rating shown small/secondary, optional with system already having accuracy data
  - Subjectively-rated-only blocks (songs, drills, voice-leading, expression): rating shown prominently, with note that this is the primary signal for these activities
- **Hard mode:** quick-tap option available (5-second grace), missed ratings batch at session end
- **Session-end batching:** any blocks rated inline don't appear; any unrated blocks show in a compact list at session end where user can rate them all at once before closing

### Step 14: Block transition

- "Ready for next?" confirmation between blocks
- Shows what's next (preview)
- User taps "Start" to begin next
- Or user can end session early ("Done for now")

### Step 15: Session ends

- Full session logged automatically (no separate logging step)
- Brief end-of-session summary: what practiced, total time, blocks completed/skipped/extended
- **Any unrated blocks surface for batch rating** (Q4)
- Optional notes field
- Goal progress updates if any milestones hit
- Returns to Practice Sessions home

### Step 16: Update spacing state

For each item touched, update:
- `last_engaged_at`
- Performance history
- Recalculate `next_due_at` based on memory type curve and performance
- **Advance `acquisition_stage` if signals warrant** (e.g., first meaningful engagement → `new` to `acquiring`; consistent competency → `acquiring` to `acquired`)

### Step 17: Update goal progress

Items linked to goals contribute to progress. If item triggers a goal milestone (song reaching Comfortable when goal is "25 songs at Comfortable+"), proactive prompt is queued: "This song just hit Comfortable! That's [X] of [Y] toward your songs goal." (Prompt fires per orchestration rules — see Q10.)

---

## UI Specifications

### Practice Sessions home screen

**Mobile-first, thumb-reachable affordances.**

When user opens module:
- Primary "Start a session" CTA
- Recent sessions list (last 3-5, scrollable)
- Active goals progress widget (small, glanceable)
- Day plan status if active ("Today: Standard day. Morning keys done. Daytime away pending. Evening keys planned.")
- Vacation mode toggle (if relevant)
- **Inline goals nudge if no goals set** (Q7) — banner: "You haven't set any goals yet. Practice Sessions works better with goals declared. [Set up goals →] [Maybe later]" — re-surfaces 3 days after dismissal

### The input questionnaire

Sequential mini-screens, one question per screen on phone, all visible on desktop. Brief, low-friction.

**Question 1: Time available.**
"How much time do you have?" — quick presets (15 / 30 / 45 / 60 / 90 min) plus custom.

**Question 2: Context.**
"Where are you?" — three icons: keys / laptop / phone.

**Question 3: Day plan.**
"What's your plan?" — three options:
- "Just this session"
- "First of multiple today" (then: "Which day profile? Standard / Light / Deep / Custom")
- "Continuing today's plan" (only if earlier sessions logged today)

**Question 4: Energy check-in (max 3 mini-questions, all skippable).**
- Focus / mental clarity: 1-5 scale
- Motivation: 1-5 scale
- Inspiration: 1-5 scale (skippable)

All multi-choice / scale-based. **No typing.**

**Question 5: Session intent (lightweight — replaces old "mode" question).**
"What's this session for?"
- "Stay balanced (default)"
- "Lean toward this week's goals"
- "Recover / lighter touch"
- "Push on a specific item" (then pick from active acquiring/goal-linked items)

This is the per-session intent that replaces the multi-week mode declaration.

### The session proposal screen

**Vertical stacked rectangle visualization.**

- One option: single rectangle, full-width on phone, centered with margins on desktop
- Two options: swipe-between cards on phone (Q5), side-by-side on desktop

Each rectangle:
- Top: short title naming strategic identity ("Stay on track overall" / "Push on chord motion this week")
- Body: vertical stacked blocks (color, module, item, time, proportional height)
- Bottom: total time, "Why this plan?" expandable panel

**Two-option phone presentation specifics:**
- Header above cards: "Two plans for today. Pick one."
- Each card has strategic-identity title and a one-line purpose statement
- Paginator dots clearly visible
- Optional: a small peek of the second card's edge to signal swipe affordance

User taps rectangle to confirm. Or "Try different inputs" to revise.

### The active session screen

**One block at a time, full-screen focus.**

- Top: small progress indicator (block 2 of 5)
- Center: current block content
  - Module color background or accent
  - Item to practice ("Chord Recognition: Foundational triads — 8 attempts")
  - Quick-launch button into the relevant module
  - Countdown timer (large, prominent)
- Bottom:
  - "End this activity" button (always available)
  - "Extend (+2 / +5 / +10)" buttons (soft-block mode) when timer approaching zero or at zero
  - On hard-block mode: timer ding triggers brief grace period for rating quick-tap, then auto-advance

**Between blocks: "Ready for next?" screen with rating prompt above.**

- Rating prompt at top: three vertically stacked buttons (Flying / Cruising / Crawling) — Q4
- Below: brief celebration of what just completed
- Below: preview of next block
- Bottom: "Start next" button
- "End session early" link (small, secondary)

### The session-end screen

- Summary: total time practiced, blocks completed, what practiced (color-coded mini-version of original proposal rectangle, with completed/extended/skipped indicators)
- **Unrated blocks list** (Q4): any blocks the user didn't rate inline appear in a compact list with the three rating buttons inline; user can rate them or skip
- Optional notes field
- Goal progress updates if any milestones hit
- "Done" returns to Practice Sessions home

### The "no strictly-due items" surface (Q3)

When session generator finds the candidate pool is genuinely empty, instead of normal proposal screen:

> "You're caught up. Nice. What kind of session today?"
>
> [🌱 Get ahead] — Pull from items coming due in the next few days
> [🔥 Drive it home] — Push something near mastery deeper
> [📈 Expand the goal] — You're tracking ahead. Want to raise this period's target?

Multi-select chips (user can pick 1, 2, or 3). Generate button at bottom. System combines selections, allocates time, shows reasoning.

If user has zero goals + everything touched recently, alternative paths surface ("Take a creative session — Just Play / Just Produce / Harmonic Diary browse" or "Rest day — you've earned it").

### Practice History view (deferred)

**Phase 1 does NOT ship a Practice History view.** Recent sessions list (last 3-5) on Practice Sessions home is sufficient for foundation. Full Practice History (weekly calendar, filters by module/skill, session detail expansion) ships in Phase 7.

---

## Goals UI Specifications

### Goals home screen

**Layered display showing active goals across scopes.**

Top → bottom (action-up, April 2026):

1. **This week** (Weekly)
2. **This month** (Monthly)
3. **This quarter** (Quarterly)
4. **This year** (Yearly)
5. **2 — 3 years**
6. **Lifetime vision**

Reasoning: most-frequently-checked layers get prime visual real estate. Long-horizon vision is grounding background, not daily check-in.

Empty layers always remain visible with a placeholder line ("No quarterly goals yet" + "+ Add" link) and are individually collapsible. First-visit default: empty layers collapsed, populated layers expanded. Collapse state persists per-user. A separate "Customize layers" panel lets users fully hide layers they don't use.

**No "daily" layer** — daily intent is generated by the session algorithm, not stored as a goal entity. (Q1)

CTA: "+ Set a goal" (top button, opens form with no scope pre-set) or per-layer "+ Add" / "+ Reflect" (opens form with scope pre-filled).

### The Goals questionnaire (onboarding flow)

**Progressive, not linear. This-month-first.**

The questionnaire fires whenever the user has zero active goals (not just on the first ever visit). Reasoning: goals are load-bearing for Practice Sessions; re-prompting goal-less users serves the app's function rather than being friction.

Progress is tracked via userPref flag `goals.onboarding.lastCompletedScreen` (integer, 0–3). On return mid-flow, onboarding restarts at Screen 1 with any previously-created goals pre-filled as editable items. Each goal added via mini-form persists to the database immediately, so the accumulating list is the user's working set, fully editable as the user navigates.

**Bidirectional navigation:**

| Screen | Back | Next | Done | Skip the rest |
|---|---|---|---|---|
| 1 (this-month focus)         | —    | yes  | —    | yes |
| 2 (day profiles)             | yes  | yes  | —    | yes |
| 3 (longer-range, optional)   | yes  | —    | yes  | yes |

Going back from Screen 2 returns to Screen 1 with all accumulated goals visible and editable. Same for Screen 3 → 2 → 1. "Skip the rest" exits onboarding entirely; user lands on Goals home with whatever they've created so far.

**Screen 1:** "Welcome. Let's start small. What do you want to focus on **this month**?"

User picks from prompts (each card expands inline into a mini-form scoped to that prompt's fields; the "Custom" card opens the full goal-creation modal as an escape hatch):
- "Learn new songs" → "How many?" → "Which proficiency level should they reach? [Comfortable / Cross-key / Internalized — with definitions visible]"
- "Deepen existing songs" → which ones, to what level
- "Improve a specific area" → multi-select dropdown of modules (max 2) + monthly hour target (required) + optional improvement-text field; goal record uses `target_metric: 'hours_on_modules'`
- "Spend X hours on Production lessons"
- Custom (free text → opens full modal)

**Screen 2:** "Now let's plan when you'll practice. What does your **typical** day look like?"

Three sub-prompts (build the three day profiles):
- "Your **Standard** day:" — Morning / Midday / Evening (time + context per slot, with skip toggle)
- "Your **Light** day:" — same three slots
- "Your **Deep** day:" — same three slots

Pre-filled with sensible defaults user can edit (per Q9 defaults table). Slot keys are `morning` / `midday` / `evening`; UI labels may display "Afternoon" if it reads better, but the underlying data key is `midday`.

**Screen 3:** "Done — your monthly goals and day profiles are set."

Optional CTA: "Want to set bigger-picture goals? We can capture your vision for this year, the next 2-3 years, and your lifetime musicianship dream. Skippable, comes back later if you want."

If user opts in (longer-range prompts):
- **Yearly:** "By December 31, [current year], what do you want to be able to do, know, or have internalized?"
- **2-3 year:** "Over the next 2-3 years, who do you want to become as a musician?"
- **Lifetime:** "What's your overall vision for musicianship in your life?"
- **Quarterly:** "What needs to happen this quarter to be on track?"

### Goal creation form (any scope, single-target — Phase 1)

#### Form modes by scope

The goal creation form has two modes based on the picked scope:

**Measurable mode** (scopes ≤ 1 year — weekly, monthly, quarterly, yearly): all fields shown, including target metric, target value, target unit, target date, context tag.

**Vision mode** (scopes > 1 year — 2-3 year, lifetime): only description (required), related modules (optional), related items (optional), target date (optional, defaults to end-of-scope). Measurable fields hidden.

Scope is editable. Changing scope from measurable to vision triggers a confirmation: *"Changing to this scope will clear the target metric, value, and unit. Continue?"* Reverse direction (vision → measurable) is fine — no warning needed; user fills measurable fields if desired.

#### Target metric implementation

The form uses a two-field representation for level-based goals: `target_metric: 'items_at_level'` + `target_unit: <level>`. The level dropdown's options are scope-derived from the `relatedItems` selections (mapping moduleId → scope: repertoire→song, production→production, everything else→skill). When `relatedItems` is empty, all three scopes show under `<optgroup>` headers. Mixed-scope goals show both scopes' levels under separate optgroups; the goal's level applies per-item-type.

Other metrics (e.g., `hours_on_modules`) are flat numeric targets without level dropdowns. Future metrics plug into `metricCatalog.ts` without restructuring.

#### Related Items search

Single unified search input. Substring match against `SkillRecord.name` from `buildSkillRegistry()`. Results grouped by `moduleId` with module-color tag (12px square + module label) + item name + inline current proficiency level as a small badge to the right (or "Not yet started" if no state exists). Multi-select via checkboxes; selected items show as chips above the search input. Capped at 20 visible results; "Refine search to see more" hint when more match.

Glossary terms are excluded from search (per existing convention; not Skills Catalogue items). The future Production Vocabulary flashcard deck will reify glossary terms as goal-targetable when it ships.

#### Field reference

Fields (varying based on scope):

- **Description (open text)** — qualitative aspiration (required)
- **Scope** (weekly / monthly / quarterly / yearly / 2-3 year / lifetime) — pre-set when opened from a layer button, editable when opened from "+ Set a goal"
- **Target metric** (dropdown — `items_at_level` / `hours_on_modules` / `count_completed` / `custom`) — measurable mode only
- **Target value** (numeric) — measurable mode only
- **Target unit** — measurable mode only; for `items_at_level` holds the picked level identifier; for `hours_on_modules` is `'hours'`; for `custom` is user-defined
- **Target date** (auto-set to end of scope period; editable; optional in vision mode)
- **Context tag** (keys / laptop / phone / mixed) — measurable mode only
- **Related modules** (multi-select)
- **Related items** (search across all skills/songs/lessons; multi-select; can leave empty)
- **Parent goal** (optional — links to higher-scope goal — Q6; only shown when at least one candidate exists)
- **Numerical rollup toggle** (optional — only appears when parent goal is selected — Q6) — "Roll up progress to parent goal? [Yes] [No]"

**Smart suggestion at creation (Q6):** When user creates a goal and an existing parent goal could match (matching metric + matching proficiency level), system auto-suggests: "Roll up monthly progress to your yearly goal '25 songs at Comfortable+'? [Yes] [No]" with explanation: "Each song you complete toward this monthly goal will also count toward the yearly goal."

When metrics don't match: "These goals are related but track different metrics. Progress won't auto-link." (Relationship preserved without numerical rollup.)

### Goal creation form — multi-component (umbrella) goals (Phase 2)

**Phase 1 ships single-target only.** Multi-component UI ships in Phase 2 because:
- Schema fully supports it now (`is_umbrella`, same-scope parent linking)
- UI is non-trivial (umbrella creation, sub-goal management, mid-year expansion flow)
- Most users won't expand goals in their first month
- Phase 2 ships before the typical mid-year expansion scenario hits

When Phase 2 lands, multi-component goal creation will:
- Add "Single target / Multi-component" picker at goal creation
- Multi-component path: user names umbrella ("Songs by year-end"), then adds child targets one by one
- Mid-year expansion: user can convert single-target goals into multi-component umbrellas by adding a new sibling target — original target preserved as first child (Q6 resolution: preservation always)

### Goal progress updates

**Hybrid auto + prompted, never silent.**

- New items in tracked modules: auto-prompted on creation ("Add to your songs goal?")
- Existing items at goal-creation time: ask user during creation ("These 3 songs are in progress. Count them toward your goal, or only new ones?")
- Proficiency stage transitions: proactive prompt ("This song moved to Comfortable. Should we add or update its tracking against your songs goal?")
- End-of-period: proactive prompt ("End of your monthly goal period. Here's how you tracked: [X] of [Y] songs reached target proficiency. Reflect / set next month's goals.")

All prompts route through the centralized prompt orchestration layer (Q10).

### Proficiency vocabulary (canonical)

Anywhere proficiency appears, same vocabulary applies:

| Level | Short label | Description | Example |
|---|---|---|---|
| Learning | Just starting | Working through basics, requires constant reference | Reading the chord chart for "Mirror" while playing |
| Comfortable | Can play it through | Plays without stumbling in original key, no reference needed | Playing "Mirror" cleanly start to finish in C |
| Internalized | Memorized and felt | Plays from memory, expressively, in native key | Playing "Mirror" by heart with feeling |
| Cross-key | Transposable | Can play in multiple keys without re-learning | Playing "Mirror" in F, G, and A on demand |
| Maintenance | Solid, just refresh occasionally | Internalized + Cross-key; revisit periodically | "Mirror" in active repertoire indefinitely |

This table seeds the `proficiencyDefinitions` table. Goal-setting UI shows the table (or relevant rows) when asking user to pick a target level.

---

## Vacation mode (Q2 resolution — simplified)

UI:
- Toggle in Settings or Practice Sessions home
- "Mark days off" — pick start/end dates from calendar
- Optional reason (text)

**Behavior:**

1. **Spacing decay continues during vacation.** Items genuinely went stale; the app reflects reality. (No `spacing_paused` field.)
2. **Goal target dates are the only thing vacation affects.** On return from vacation, system surfaces a per-goal prompt:

   > "Welcome back. You took 14 days off — here's what's true now:
   > - 23 items have moved to stale or very stale (that's normal after time away)
   > - Your active goals are ready for review:
   >   - Monthly: 25 songs at Comfortable (8/25 done) → [Extend by 14 days] [Keep target] [Edit] [Skip this period]
   >   - Weekly: 3 hours on chord motion (1.2/3 hrs) → [Skip this week] [Extend] [Keep]
   >   - Yearly: ... → [Keep target] [Edit]
   > 
   > Want to ease back in with a focused refresh session, or jump into a normal balanced session?"

3. Sensible defaults pre-selected per goal (extend monthlies, skip weeklies, keep yearlies). User adjusts as needed.
4. **Practice History view** (Phase 7) shows vacation periods as gray-shaded days — acknowledged, not "missed."
5. **No spacing pause.** Items return with honest decay state. The gentle move isn't hiding the truth — it's helping the user *navigate* the truth via the welcome-back surface.

This is the **truth-honoring trumps gentle defaults** principle in action.

---

## Goal review cadence

Proactive prompts at each scope's end:

- **End of week (Sunday evening or user-configured):** "Here's how this week tracked. Adjust next week's plan?"
- **End of month:** "Monthly goals review. [X] of [Y] hit. Reflect, plan next month."
- **End of quarter:** "Quarterly check-in. Here's your trajectory toward the year."
- **End of year:** "Annual review. What did you accomplish? Set next year's vision."

All are *prompts*, not blockers. User can dismiss without setting next goals. All route through centralized prompt orchestration (Q10).

---

## Proactive prompt orchestration (Q10 — NEW centralized layer)

All proactive prompts route through a centralized orchestration layer rather than being fired ad-hoc by individual features.

### Layer 1: Context-aware (when prompts can fire)

- **Inside an active session block: zero prompts.** Practice flow is sacred. Never interrupt a block.
- **At session end / between sessions: prompts allowed.** User is in a "what's next?" mindset.
- **On home screens (Dashboard, Goals home, Practice Sessions home): prompts visible as banners**, not modal interruptions.
- **End-of-day or end-of-period (weekly/monthly review): scheduled moments**, not random firings.

### Layer 2: Tiered importance

- **High** (always fires when applicable): vacation return prompts, end-of-period goal reviews, parent-goal-relationship suggestions when creating a new goal.
- **Medium** (fires if no high-tier prompt is active): "song hit Comfortable, add to goal?", "you're tracking ahead, expand the goal?", "set up goals" nudges.
- **Low** (fires only when nothing else is queued): "you've been on the same items for a while, consider these new ones", learning-based profile-update suggestions.

### Layer 3: Soft daily cap

**Max 3 prompts per day visible to the user**, across all sources, tier-prioritized:
- 1st slot: highest-tier available
- 2nd slot: next-highest distinct prompt
- 3rd slot: next after that
- Beyond 3: queued for next day, OR dropped if they go stale

User dismissal of a prompt ends it for the dismissal cadence (3-day re-prompt for "set goals" nudge per Q7; per-prompt-type cadence rules for others).

### Layer 4: Settings transparency

In Settings, user can see:
- Currently queued prompts
- Prompts fired in the last 7 days
- Category-level mute toggles (organized by prompt type, not by tier — users think in terms of "what is this prompt about")

This implements **"Show the reasoning"** at the prompt-system level — users can audit what the app is choosing to surface.

**Phase 1 scope note:** the user-facing Settings UI for prompt management is **deferred to Phase 7** when more prompt types are firing and the surface is genuinely useful. Phase 1 verifies orchestration logic via dev console / programmatic checks.

### Architectural implication for Phase 1

The `prompts` table exists from Phase 1. Even though Phase 1 only fires 2-3 prompt types (vacation return, set-goals nudge, end-of-month review), the orchestration infrastructure is in place. Phase 7 adds many more prompt types; the infrastructure scales without rework.

---

## Phase 1 Build Spec

**Scope: Foundation — data model, sync, basic Goals module, basic Practice Sessions home, prompt orchestration plumbing.**

Phase 1 is intentionally light. Plumbing that everything else builds on. No session generator yet, no algorithm, no full spacing state population. Just: tables exist, sync works, user can declare single-target goals and see them, day profiles are set up, vacation mode works, manual session logging works, and the prompt orchestration layer is in place.

### Sub-phase enumeration

Phase 1 has 6 sub-phases:

1. **Schema + sync** — Dexie + Supabase tables for `goals`, `dayProfiles`, `vacationPeriods`, `proficiencyDefinitions`, `practiceSessions`, `practiceBlocks`, `spacingState`, and prompt orchestration plumbing.
2. **Memory type lookup** — `getMemoryType(moduleRef)` pure function with tests.
3. **Goals module + onboarding** — Goals nav, layered home with collapse + Customize panel, goal creation modal with proficiency-aware metric dropdown, onboarding questionnaire with bidirectional navigation.
4. **Practice Sessions home + manual logging** — Placeholder home, manual session logging form, vacation mode toggle.
5. **Prompt orchestration** — Plumbing only, no Settings UI (deferred to Phase 7).
6. **Proficiency vocabulary verification** — Audit existing surfaces (Song Repertoire, Skills Catalogue) and ensure they reference the canonical `proficiencyDefinitions` data.

All sub-phases ship in order. Each commits independently. Sub-phase 3 is the largest and most user-visible.

### What ships in Phase 1

#### 1. Data model tables

Create following Dexie tables AND mirrored Supabase tables with RLS:

- `practiceSessions` (with `session_intent` field; **no `mode` field**)
- `practiceBlocks`
- `goals` (with `parent_goal_id`, `contributes_numerically_to_parent`, `is_umbrella` — schema fully supports multi-component)
- `dayProfiles` (with `name` enum: 'standard' | 'light' | 'deep' | 'custom')
- `vacationPeriods` (**no `spacing_paused` field**)
- `proficiencyDefinitions` (read-only, seeded)
- `spacingState` (table exists; populated as users engage with items; `acquisition_stage` field used for inference)
- `prompts` (centralized orchestration table)

All follow existing sync pattern (`syncedWrite`, RLS policies per table, `user_id` + standard timestamps).

Seed the `proficiencyDefinitions` table with the 5 canonical levels from proficiency vocabulary table above.

#### 2. Memory type lookup function (runtime, not stored)

Implement `getMemoryType(moduleRef): 'declarative' | 'procedural' | 'integration' | 'expression'` lookup function that derives memory type from the module the item belongs to, using the module → memory type defaults table above.

**No stored field on existing module item records in Phase 1.** Phase 1 doesn't actually consume the value (spacing state populates in Phase 2; algorithm runs in Phase 3), so a runtime lookup is sufficient and avoids touching every module's existing data. Phase 2 can migrate to a stored field if needed when spacing state actually starts using it.

**No user override UI in Phase 1.**

#### 3. Goals module

New top-level nav item: **Goals**, positioned first in Overview group.

**Goals home screen:**
- Layered display of active goals (lifetime → weekly), collapsible per layer
- "Set a goal" CTA
- Goals at each layer can be added, edited, deleted

**Goal creation form (Phase 1: single-target only):**
- Open text description
- Scope picker (no daily option)
- Target metric dropdown (with "Custom" option)
- Target value (numeric)
- Target date (defaulted by scope, editable)
- Context tag picker
- Related modules multi-select
- Related items search + multi-select
- Parent goal link (optional)
- Numerical rollup toggle (only appears when parent goal selected; Phase 1 includes the toggle but smart auto-suggestion fires in Phase 7)

**Goals questionnaire (onboarding flow on first visit to Goals module):**
- Screen 1: this-month focus (single-target goals only — Phase 1)
- Screen 2: build the 3 day profiles (Standard / Light / Deep) with the Q9 default pre-fills
- Screen 3: optional opt-in for longer-range goals (yearly, 3-5 year, lifetime)

**Phase 1 does NOT include:**
- Multi-component (umbrella) goal UI — schema supports it, UI ships Phase 2
- Goal progress automation — manual `current_value` updates only
- End-of-period review prompts (queued in `prompts` table but not auto-firing yet)
- Smart parent-goal suggestion at creation (Phase 7)
- Goals widget on Dashboard

#### 4. Practice Sessions home (placeholder + manual logging)

New top-level nav item: **Practice Sessions**, positioned fourth in Overview group.

**Practice Sessions home:**
- Static placeholder: "Coming soon — session generator and timer."
- **Manual session logging form** (basic): user can declare session ad-hoc (date, duration, modules touched, notes)
- Recent sessions list (last 5)
- Vacation mode toggle (with start/end date picker, reason optional)
- **Inline goals nudge** if no goals set (Q7): banner with [Set up goals →] [Maybe later] — re-surfaces 3 days after dismissal
- **Active vacation banner** if user is currently in vacation period

**Phase 1 does NOT include:**
- Session generator algorithm
- Input questionnaire (energy, time, context, intent)
- Block-by-block timer execution
- Performance rating UI (Flying / Cruising / Crawling)
- Two-option proposals
- "Why this plan?" reasoning panel
- "No items strictly due" abundance flow
- Practice History calendar view

#### 5. Vacation mode (Q2)

- Vacation mode toggle in Practice Sessions home
- Date range picker, optional reason
- **No spacing pause** — decay continues honestly
- Welcome-back surface on return (queues prompt in `prompts` table; surface UI ships in Phase 7 but the data and behavior land in Phase 1 — this means Phase 1 logs a vacation return event, but the rich welcome-back UI surfaces in Phase 7)

#### 6. Prompt orchestration layer (Q10)

The `prompts` table exists. Basic orchestration logic:
- Tier-aware queueing
- 3/day soft cap enforcement
- Suppression during active sessions (no active sessions in Phase 1, but the rule is encoded)

Phase 1 fires only:
- "Set up goals" nudge (medium tier) — fires on Practice Sessions home if no goals set, with 3-day re-prompt cadence
- Vacation return event logged (welcome-back UI fires in Phase 7)
- End-of-month event logged (review UI fires in Phase 7)

**Verify orchestration logic via dev console / programmatic checks** in Phase 1. User-facing Settings UI for prompt management (queue inspection + category mute toggles) is **deferred to Phase 7** when more prompt types are firing.

#### 7. Proficiency vocabulary surfaced

Anywhere proficiency levels appear (notably Song Repertoire's stage framework), update labels to match canonical vocabulary in `proficiencyDefinitions` table. Goal creation forms reference same definitions.

If existing Song Repertoire stage framework already matches (Learning → Comfortable → Internalized → Cross-key → Maintenance), this step is a no-op.

### Testing checklist for Phase 1

1. Goals module reachable from nav.
2. First-visit onboarding questionnaire fires for new users; can be completed end-to-end.
3. After onboarding, monthly goals (single-target) and 3 day profiles (Standard/Light/Deep) exist in database.
4. Goal creation form works for all scopes; data persists locally and syncs to cloud.
5. Goals home displays goals correctly at each scope, including parent-goal relationships.
6. Practice Sessions module reachable; placeholder visible.
7. Manual session logging form works; sessions persist and sync.
8. Vacation mode toggle creates `vacationPeriods` entries with correct dates; no `spacing_paused` field exists.
9. `spacingState` table exists in both Dexie and Supabase; `acquisition_stage` field exists on each row.
10. `prompts` table exists and is functional; "set goals" nudge appears for users without goals; dismissal triggers 3-day re-prompt cadence; daily cap of 3 enforced. (Verified via dev console / programmatic checks; Settings UI deferred to Phase 7.)
11. Proficiency vocabulary consistent across Song Repertoire and Goals.
12. All new tables have proper RLS policies in Supabase.
13. All writes go through `syncedWrite` (no bypass writes).
14. Cloud sync verified: changes on one device appear on another.
15. Day profile editing post-onboarding works (user can update Standard/Light/Deep slots).
16. Inline goals nudge in Practice Sessions home appears when no goals set; disappears when goals exist; re-appears 3 days after dismissal.

### Out of scope for Phase 1 (filed for later phases)

- Session generator algorithm (Phase 3)
- Multi-component goal UI (Phase 2)
- Spacing state population at scale + acquisition stage detection logic (Phase 2)
- Day planning + multi-session-day support (Phase 4)
- Per-session intent UI in input questionnaire (Phase 3)
- Within-day spacing for acquiring items (Phase 6)
- Goal progress automation, end-of-period reviews, vacation return UI, smart parent-goal suggestion (Phase 7)
- User-facing Settings UI for prompt management — queue inspection + category mute toggles (Phase 7 when more prompt types fire)
- Practice History calendar view (Phase 7)
- Self-correcting day profiles + typical-week baseline learning (Phase 8)
- YouTube video integration (separate roadmap item)
- Memory type override UI (after Phase 2 if needed)
- Memory type stored field migration on existing module item records (Phase 2 if spacing state begins consuming the value)

---

## Resolved questions (April 25, 2026 design review)

All 10 prior open questions resolved in a thorough design review. Recording resolutions here for traceability.

**Q1. Daily goals.** No daily goal entity exists. Daily intent is generated by the algorithm from larger goals + state. Override option for daily focus is provided via per-session intent ("Push on a specific item") — not as a separate goal scope. Trade-off disclosure surfaced when a user choice has costs.

**Q2. Vacation mode and goal target dates.** Decay continues during vacation (truth-honoring). Vacation only affects goal target dates, with per-goal choice on return (Extend / Keep / Skip / Edit) and sensible defaults pre-selected. No `spacing_paused` field. Welcome-back surface helps user navigate honest decay state.

**Q3. What happens when no items are due.** The system does NOT auto-fill thinly. It surfaces the moment honestly with three multi-select strategic paths: Get ahead / Drive it home / Expand the goal. User can pick 1-3; system combines intelligently and shows reasoning. New principle: "Honest about abundance, not just scarcity."

**Q4. Performance rating UI on phone.** Inline at block end, three vertically stacked buttons with distinct colors: **Flying / Cruising / Crawling**. Always optional. Hard mode: quick-tap with 5-second grace; missed ratings batch at session end. Prompt prominence varies by block type — light for objectively-measurable activities, prominent for subjectively-rated-only ones.

**Q5. Two-option presentation on phone.** Swipe between cards. Header explicitly names the two options as strategic identities ("keeps you on track overall" / "serves [purpose]"). Each card carries strategic-identity title.

**Q6. Goal hierarchy enforcement.** Hybrid (linked when user opts in). Two separate fields: `parent_goal_id` (relationship) + `contributes_numerically_to_parent` (rollup). Smart proactive suggestion at goal creation (Phase 7 firing) when metrics match. Multi-component (umbrella) goals supported: schema in Phase 1, UI in Phase 2. Original commitments preserved on expansion.

**Q7. What if user never opens Goals.** Inline nudge, never blocking (Option C). Practice Sessions works in degraded mode (freshness × priority, no goal-alignment). Re-prompt cadence: 3 days after dismissal. "Why this plan?" panel honest about goals absence.

**Q8. Mode declarations UI.** Collapsed entirely. Focus emerges from goals (especially weekly with near-term target dates). Acquisition emerges from spacing state (system detects engagement and advances `acquisition_stage`). Per-session intent (lightweight) replaces multi-week mode declarations. New principle: "Deduce intent from signals, don't accumulate declarations."

**Q9. Goals onboarding day-profile defaults.** Three profiles renamed Standard / Light / Deep. Specific default pre-fills locked (see Day profiles section). Single generic default set; users edit as needed. Self-correcting over time via Phase 8 learning.

**Q10. Proactive prompt frequency cap.** Centralized orchestration layer. 3/day soft cap, tier-prioritized (high / medium / low). Zero prompts during active session blocks. Settings transparency with category-level mute toggles. Orchestration logic lands in Phase 1; firing logic for most prompt types and the user-facing Settings management UI lands in Phase 7.

---

## Phasing roadmap

### Phase 1: Foundation (next build)
Data model, sync, single-target Goals module + onboarding, day profiles, Practice Sessions placeholder + manual logging, vacation mode (decay-honoring), prompt orchestration plumbing, proficiency vocabulary canonical. Spec'd above.

### Phase 2: Multi-component goals + spacing state expansion
- Multi-component (umbrella) goal UI
- Mid-year goal expansion flow
- Spacing state populated for all existing items
- Acquisition stage detection logic activated (signal-based advancement of `acquisition_stage`)
- Per-item due dates surface in Skills Catalogue

### Phase 3: Basic session generator
- Algorithm steps 1-9 with goal-alignment + acquisition-state weighting
- Input questionnaire (time, context, energy, **session intent**)
- Single proposal screen with reasoning panel
- No within-day spacing yet, no abundance flow yet

### Phase 4: Day planning + execution
- Day profiles in active use
- Multi-session-day support
- Session role calculation (opener/middler/closer)
- "Plan my day" path vs. "just this session" path
- Block-by-block timer execution (hard/soft toggle)
- Performance rating UI (Flying / Cruising / Crawling)
- Auto-logging on block completion

### Phase 5: Two-option proposals + abundance flow
- Two-option proposal logic + swipe-between-cards on phone
- Strategic-identity titles for options
- "No items strictly due" abundance flow (Get ahead / Drive home / Expand goal multi-select)
- Critical-stale surface

### Phase 6: Within-day spacing
- Multi-touch within-day for items in `acquiring` stage
- Cross-context angle distribution
- Consecutive-day fallback density when within-day infeasible

### Phase 7: Proactive prompts firing + reviews + Practice History
- All prompt-firing logic activated through orchestration layer
- End-of-period goal reviews
- Proficiency-transition prompts
- Smart parent-goal suggestions at creation
- Welcome-back-from-vacation surface
- "You've been on the same X for a while" nudges
- Settings UI for prompt management (queue + recent + category mute toggles)
- Practice History weekly calendar view
- Goals widget on Dashboard

### Phase 8: Learning, calibration, polish
- Typical-week baseline learning
- Self-correcting day profiles (system notices reality vs. declared, prompts to update)
- Goal feasibility checks
- Performance-based interval adjustment refinement
- Richer Practice History views (filters by module / skill / group)
- YouTube integration
- Memory type override UI (if needed)

Each phase tested in real use before next begins.

---

## Connection to other principles in the suite

This module embodies and tests several Personal OS Design Principles:

- **Dashboard is the philosophical center** → Practice Sessions IS the action layer of "how am I doing?"
- **Honest metrics** → spacing state, freshness, goal feasibility never lie
- **Time as honest measure** → core unit
- **Smart decay** → memory-type-aware spacing
- **User-declared priority** → comfort/deep/maintenance + per-session intent
- **Cross-module reinforcement offered** → algorithm proposes; user selects
- **Day as unit of breadth** → cross-app principle
- **Sessions have roles** → cross-app principle
- **Proactive prompts as nudges, not surprises** → cross-app principle, with centralized orchestration
- **Show the reasoning** → "Why this plan?" panel
- **Show the trade-off, not just the plan** → focus framing, two-option cards, goal expansion (NEW)
- **Deduce intent from signals, don't accumulate declarations** → mode collapse, daily-goals collapse (NEW)
- **Honest about abundance, not just scarcity** → no-items-due flow (NEW)
- **Truth-honoring trumps gentle defaults** → vacation decay continues (NEW)
- **Honest disclosure + full user agency** → meta-pattern (NEW)
- **Canonical vocabulary** → proficiency definitions consistent across app

If these principles work here, they generalize to Fitness, Mental Health, Finance — every domain faces the same problem: balancing daily distribution against long-term goals against energy and time.
