# Session Summary — May 11, 2026

## Overview
Massive session covering Phase 4 weekly goal system completion, major Goals page redesign, consistency target redesign, song learning order, and Song of the Month feature. 24 commits, 1279 tests passing at end of session.

---

## Completed Work

### Phase 4 Steps 4-5 — Weekly pace pressure + context-aware session arcs
- `weeklyPace.ts` — per-module weekly pace factor + BehindPaceNotice
- `contextWeighting.ts` — hard filter (Keys/Mixed = Shapes + Repertoire only) + per-context weight table (laptop: Production=1.5, chord-progressions=1.6; phone: HF/ET=1.4)
- Behind-pace banner on proposal screen with "Add to this session?" per module
- `forceIncludeModules` override for context hard filter
- Chord progression quiz placeholder at weight=0 with TODO

### Shapes Layer 2 Triad Quality Picker
- 6 per-quality sub-groups: maj/min/dim/aug/sus2/sus4 (48 items each)
- "Triad inversions (288)" pill = select-all shortcut
- Default pre-selects maj + min only (96 items)
- suggestShapesMonthly updated to default maj+min, end-of-month target date

### Weekly Plan Grouping Redesign
- Module grouping with collapsible sections (chevron toggle, expanded by default)
- ModuleGroupHeader shows module name + combined time + chevron
- TotalRow at bottom
- Sub-rows show subLabelForPlanRow for Shapes (quality name) and ET (sub-area)
- Coverage + consistency rows merged: "~1h 48m/week · across 4 sessions · ~27 min each"
- REPERTOIRE_SESSION_DEFAULT_MINUTES = 45 constant

### Consistency Target Redesign (days/lessons everywhere)
All modules → days per week (not minutes/hours/sessions):
- HF: harmonic_fluency_days_per_cadence, default 5 days/week
- ET: ear_training_days_per_cadence, default 5 days/week
- Shapes: shapes_days_per_cadence, default 6 days/week
- Repertoire: repertoire_days_per_cadence, default 6 days/week
- Production: production_lessons_per_cadence, default 3 lessons/week
- Dynamic per-day time estimate inline in ConsistencyTargetCard
- perDayMinutesOverride={45} for Repertoire
- Legacy metrics remain readable; encoders write new metrics only
- 19 new tests

### Song Learning Order
- Song.learningOrder: number added in db.ts v21 with addedDate-ASC backfill
- assignNextLearningOrder() helper wired to all 4 song insertion sites
- @dnd-kit/sortable drag UI on ActiveRepertoireView
- Vertical list layout when sort mode = 'learning-order' (new default)
- Songs sorted by learningOrder everywhere
- PREF_LEARNING_ORDER_INTRODUCED flag to override stale sort pref
- Supabase TODO: ALTER TABLE songs ADD COLUMN learning_order INTEGER NOT NULL DEFAULT 0

### Repertoire Monthly Goal Redesign
- Hours-based → days-based (repertoire_days_per_cadence)
- Time commitment card with ~45 min/day dynamic estimate
- "Maintaining & advancing" section subtitle updated to plain English
- TBD slots skipped in persist (no empty goal records)
- Maintain section sorted by learningOrder

### Goals By-Module View Redesign
Three labeled sections per module: YEARLY / THIS MONTH / THIS WEEK
- Section labels: neutral-500 uppercase tracking-wide
- Yearly anchor row: subtle background, clickable → opens anchor edit
- Monthly goals: indented with module accent left border, always visible
- Weekly goals: compact WeeklyGoalRow with type label + time + pace pill
- "+ Add goal" button in module header → monthly suggestion flow
- Empty "This month": inline subtle "+ Add monthly goal" link
- New pace classifier (byModulePace.ts): coverage uses paceForCoverageGoal, attempts uses pro-rated weekly attempts, days shows "X of Y days" muted text
- InfoTip "i" icons on time estimates and pace pills with plain English explanations
- useThisWeekActivity hook fetches attempts + days per module
- getDaysWithActivity helper in weeklyAttempts.ts
- 37 new tests

### HF/ET/Shapes Monthly Goal Layout
- Live weekly time estimate inline at bottom of coverage card (hides when no coverage selected)
- Consistency (days/week) always visible directly below coverage
- Accuracy always visible below consistency (self-toggling ToggleCard)
- "Also add" pills removed entirely
- Net 55 lines removed

### Song of the Month Feature (8 commits, 75 new tests)
**Schema:** Ordered queue of up to 3 slots under Repertoire monthly umbrella
- Slot 1 specific: song_whole_at_level (unchanged from today's shape)
- Slot 1 TBD / Slots 2-3: song_of_month sentinel metric with targetValue=slotIndex, targetUnit='song'|'wtl'|'tbd'

**Comfortable detection:**
- isSongComfortableInOriginalKey(songId): all cells in original key at comfortable
- comfortableCellRatioInOriginalKey(songId): fraction comfortable

**Queue advancement:**
- Slot 1 completion → congrats prompt → advance queue
- Slot 2 WTL promoted to active, slot 3 → slot 2
- TBD spotlight: shows "Song of the month: TBD — Add a song in Goals" in proposal

**Session split (splitRepertoireAllocation):**
- ≥15 min: 2:1 split, spotlight gets max(15min, total×2/3)
- <15 min: single block, whichever more urgent
- 45 min → 30/15, 30 min → 20/10, 60 min → 40/20

**Prompts:**
- SONG_OF_MONTH_CONGRATS: fires when spotlight song reaches comfortable in original key
- SONG_OF_MONTH_TBD_NUDGE: fires daily when next slot is TBD + current song ≥50% comfortable

**Goal body:** RepertoireSpotlightQueueSection — up to 3 slots, picker for WTL/active/TBD. Slot 1 WTL promoted eagerly on save; slots 2-3 stay in WTL.

---

## Key Decisions Made

### Consistency unit = days per week (not sessions)
Multiple sessions in one day is a bonus, not a goal. Spreading practice across days matters for spaced repetition.

### Repertoire sessions = 30/15 split
~30 min new song (song of the month) + ~15 min maintenance rotation. 7 active songs, 6 sessions/week = 6 of 7 covered per week, spacing system surfaces the most stale as skip candidate.

### Song of the month completion threshold = comfortable in original key
Not all keys, not all sections across all keys. Just the original key, all sections at comfortable. Then it enters maintenance rotation and the next song in the queue takes the spotlight.

### Three-path progression model (DEFERRED)
After a song reaches comfortable in original key, the app will offer three paths: deepen in original key → solid, expand to new keys, or comfortable maintenance only. Not built yet — schema and design needed.

### Shapes and Repertoire are paired (6 days/week each)
Both keyboard-dependent, both happen in Keys sessions together.

---

## Pending Items (carry into next session)

### High priority
1. **Edit flow** — editing a monthly goal opens old GoalCreationFlow, should open GoalSuggestionFlow
2. **Three-path song progression** — after comfortable in original key: deepen / expand keys / maintenance
3. **Session algorithm cold-start** — use learningOrder to surface songs with no matrix data (TODO in candidates.ts, schema now exists)
4. **Supabase migration** — ALTER TABLE songs ADD COLUMN learning_order INTEGER NOT NULL DEFAULT 0

### Medium priority
5. **Timeframe badge** — "New monthly [module] goal" title needs colored "Monthly" badge/pill
6. **Goals timeframe view** — "+ Add monthly goal" entry point not wired from timeframe view
7. **Dashboard weekly widget** (Phase 4 Step 6)
8. **Production lesson page explainer** (Phase 4 Step 7)
9. **Chord progression quiz** — deferred design + build

### Polish
10. Yearly goal label in module view needs clearer visual distinction
11. Repertoire maintain section language (verify committed text is showing)
12. Weekly plan Repertoire guidance row (committed, verify showing)

---

## Working With Claude Notes (additions for next session)

### Go through decisions one at a time in plain English
Don't breeze through multiple decisions at once. Take each one separately, explain it clearly, and wait for confirmation before moving to the next. This is especially important for architectural decisions that affect schema or behavior.

### The app's purpose is low friction + high productivity
Every design decision should be evaluated against: "does this remove friction and increase productivity for the user during actual practice?" If a feature requires real-time thinking during practice, it's not working hard enough.

### Song learning model
- Learning order is the canonical study sequence
- Song of the month = spotlight song, one at a time until comfortable in original key
- Maintenance = lowest-numbered active song not yet comfortable in original key
- Three-path progression after original key comfort: deepen / expand keys / maintenance only
- Matrix (songCells) is source of truth for song progress

### Consistency = days per week, not sessions
Established May 11. Multiple sessions per day is bonus. The goal is showing up on different days for spaced repetition benefit.

### Time estimate philosophy
Use actual per-activity constants (HF/ET 20s/attempt, Shapes 1.5min/rep, Repertoire 45min/day, Production 30-90min/lesson). Always show the "i" info icon explaining assumptions. These will refine with real data over time.
