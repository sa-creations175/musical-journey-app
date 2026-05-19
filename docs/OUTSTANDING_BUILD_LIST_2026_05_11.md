# Musical Journey App — Outstanding Build List
## As of May 11, 2026 | 1279 tests passing

---

## How to start a new session

### Claude Chat (design + coordination) starter prompt
```
I'm continuing development on my Musical Journey App — a React/TypeScript PWA for music practice. 
Tech stack: React, TypeScript, Dexie (IndexedDB), Supabase sync, Vercel. 
Claude Chat handles design decisions and writes prompts for Claude Code. Claude Code does the actual implementation.

Current state: 1279 tests passing, all Phase 3 + Phase 4 Steps 1-5 complete, Song of the Month feature shipped.
The app is live and I'm starting to use it for daily practice.

Please read SESSION_SUMMARY_2026_05_11.md from my project files to get full context on where we left off, then tell me what's at the top of the outstanding build list and let's decide what to work on today.
```

### Claude Code starter prompt
```
I'm continuing development on the Musical Journey App. React/TypeScript/Dexie/Supabase PWA for music practice. 1279 tests passing at HEAD (main branch). 

Before doing anything, read the full git log (git log --oneline -30) to understand recent work, then read SESSION_SUMMARY_2026_05_11.md from the project knowledge for context on outstanding items.

Key architectural facts:
- db.ts is on schema v21 (Song.learningOrder added)
- Goals use yearly umbrella → monthly children → weekly children hierarchy
- Session algorithm: Keys/Mixed = Shapes + Repertoire only (hard filter); Laptop/Phone = weighted
- Song of the Month: slot 1 = song_whole_at_level, slots 2-3 = song_of_month metric
- Consistency targets: all modules use days_per_cadence except Production (lessons_per_cadence)
- Supabase TODO pending: ALTER TABLE songs ADD COLUMN learning_order INTEGER NOT NULL DEFAULT 0

Wait for instructions before writing any code.
```

---

## Outstanding Items by Priority

---

### 🔴 HIGH — Blockers or near-blockers for daily use

**1. Edit flow — monthly goals open wrong flow**
When you tap edit on a monthly goal, it opens the old `GoalCreationFlow` instead of the new `GoalSuggestionFlow`. This means edits lose all the new UI improvements (inline time estimates, always-visible consistency/accuracy, days-per-week redesign).
- File: Goals.tsx `onEditGoal` handler
- Fix: detect monthly goals and route to GoalSuggestionFlow instead

**2. Session algorithm cold-start for songs**
Songs with no matrix data (all 7 active songs right now) don't surface in session proposals because there are no spacingState rows to rank. The TODO is documented in `candidates.ts`. Now that `Song.learningOrder` exists, this can be built.
- Logic: when a song has no songCellRunThroughs, use learningOrder ASC as priority — surface incomplete cells from lowest-numbered song first
- File: `src/lib/sessionAlgorithm/candidates.ts` (TODO already documented there)

**3. Three-path song progression model**
After a song reaches comfortable in its original key, the app needs to offer three next-step paths:
- Path 1: Deepen in original key → work toward "solid" proficiency
- Path 2: Expand to new keys → take song to other keys
- Path 3: Comfortable maintenance only → spacing system keeps it fresh
Currently the congrats prompt fires but there's no path selection UI or downstream behavior difference. Requires schema (track which path each song is on) + session algorithm changes + a new UI prompt.

**4. Supabase migration — learning_order column**
The `Song.learningOrder` field added in Dexie v21 needs a matching Postgres column before the app can sync song order to Supabase.
```sql
ALTER TABLE songs ADD COLUMN learning_order INTEGER NOT NULL DEFAULT 0;
```
After column exists, add `{ dexie: 'learningOrder', pg: 'learning_order' }` to songs entry in `src/lib/sync/tables.ts` (a TODO is already parked there).

---

### 🟡 MEDIUM — Important UX improvements

**5. Timeframe badge on goal creation modals**
The "New monthly Harmonic Fluency goal" title doesn't make the timeframe visually obvious. Needs a colored "Monthly" badge/pill in the modal header. Same for yearly and weekly goal flows.

**6. Goals timeframe view — "+ Add monthly goal" entry point**
The "+ Add monthly goal" button only works from the by-module view. The by-timeframe view has no entry point for creating a new monthly goal. Users who prefer the timeframe view are stuck.

**7. Dashboard weekly widget (Phase 4 Step 6)**
A weekly summary widget on the Dashboard showing: this week's attempt counts per module vs. targets, days practiced, overall pace status. Feeds off the same weekly goal + attempt data already built.

**8. Production lesson page explainer (Phase 4 Step 7)**
The Production module's lesson pages need button descriptions explaining what each lesson covers and what "complete" means for that lesson. Currently bare.

**9. Chord progression quiz — design + build**
A way to quiz yourself on the chord progressions of songs in your repertoire. Currently a placeholder (weight=0) in the session algorithm. Needs design first:
- Option A: Flashcard style — app surfaces a song, you think through the progression, reveal + self-assess
- Option B: Multiple choice — given a song section, pick the correct progression
Design decision needed before build.

---

### 🟢 POLISH — Visible rough edges

**10. Weekly plan — Repertoire guidance row**
The guidance note "~30 min new-song learning + ~15 min maintenance rotation" should now reflect the Song of the Month model more explicitly. Currently hardcoded to mention 7 active songs — should be dynamic or at least reference the song of the month concept.

**11. Goals by-module view — yearly anchor visual clarity**
The yearly anchor row is styled subtly but could be more visually distinct as the "north star" for the module. Consider a slightly bolder treatment or a star/anchor icon.

**12. Repertoire maintain section language**
Verify the updated plain-English subtitle is showing: "These songs are already in your repertoire. Keep practicing them to stay fresh — the app will remind you when a song is going stale and needs attention."

**13. Weekly plan total time accuracy**
The total time in the weekly plan currently double-counts or misses some modules depending on goal structure. Needs an audit once real goals are running for a week.

---

### 🔵 FUTURE — Designed but not scheduled

**14. Song progression paths — deepen / expand keys / maintenance**
Full build of the three-path model. Requires:
- Schema: `Song.progressionPath: 'deepen' | 'expand-keys' | 'maintenance'`
- UI: path selection prompt when song reaches comfortable in original key
- Session algorithm: different practice surfaced per path (solid drills vs. key expansion vs. light maintenance)
- Goal system: deepening and key expansion as optional monthly goal targets

**15. Chord progression practice in sessions**
Chord progressions of songs as a quizzable/studyable item, surfaced in Phone/Laptop sessions. Currently placeholder at weight=0. Connected to item #9 above.

**16. Dashboard weekly widget full build**
Beyond the basic widget (#7), a richer weekly view showing: streak data, module balance, time distribution, comparison to previous weeks.

**17. Practice History calendar view**
A calendar showing practice days, session counts, and module coverage over time. Useful for seeing streaks and patterns.

**18. Prompt management Settings UI**
A settings screen where the user can see and manage all active prompts (congrats, nudges, milestones). Currently prompts fire and can be dismissed but there's no way to review past prompts.

**19. Goal progress auto-calculation**
Currently `goal.currentValue` is updated manually at certain points. A background job that recalculates all active goal progress nightly from spacingState data would keep the Goals view accurate without manual intervention.

**20. End-of-period goal reviews**
When a monthly goal period ends, surface a review: what did you accomplish, what carried over, what should next month's goal be? Requires the goal progress auto-calc (#19) to be reliable first.

**21. Section mutations for songs**
Rename, reorder, split, archive, restore for song matrix sections. Currently sections are fixed once created.

**22. Original key reassignment UI**
User can change which key is designated as original for a song. Schema supports it; UI not built.

**23. Production Vocabulary flashcards**
A dedicated flashcard deck for production terminology, concepts, and techniques. Currently only the lesson path exists.

**24. Session roles — opener / middler / closer**
Detect whether a session is the first, middle, or last of the day and adjust proposals accordingly (opener = more breadth, closer = consolidation). Designed in Phase 4 but deferred.

---

## Key Architecture Facts for New Sessions

### Tech stack
React + TypeScript + Vite + Dexie (IndexedDB) + Supabase + Vercel. PWA.

### Schema version
Dexie v21. Songs have `learningOrder: number`.

### Goal hierarchy
Yearly umbrella → monthly children → weekly children (derived from monthly via WeeklyPlan modal).

### Session algorithm context
- Keys/Mixed: hard filter — Shapes & Patterns + Repertoire only
- Laptop: weighted — Production dominant (1.5), chord-progressions high (1.6), HF/ET moderate (1.2)
- Phone: weighted — HF/ET high (1.4), Production lower (1.0)

### Song of the Month schema
- Slot 1 specific: `targetMetric: 'song_whole_at_level'`, `relatedItems: [songId]`
- Slot 1 TBD / Slots 2-3: `targetMetric: 'song_of_month'`, `targetValue: slotIndex`, `targetUnit: 'song'|'wtl'|'tbd'`

### Consistency metrics
- HF: `harmonic_fluency_days_per_cadence`
- ET: `ear_training_days_per_cadence`
- Shapes: `shapes_days_per_cadence`
- Repertoire: `repertoire_days_per_cadence`
- Production: `production_lessons_per_cadence`

### Repertoire session split
45 min → 30 min song of the month + 15 min maintenance (lowest-numbered active song not yet comfortable in original key, excluding spotlight). Proportional scaling, 15 min minimum for spotlight.

### Dev helpers available in browser console
- `await __deleteShortHorizonGoals()` — wipe all monthly + weekly goals
- `await __wipeChordShapeCatalog()` — wipe chord shape drill data
- `await __wipeAllActivityInRange(start, end)` — wipe all practice activity
- `await __inspectLastWeekActivity()` — show per-module attempt counts
- `await __diagnoseWeeklyPlan()` — diagnose weekly plan issues
