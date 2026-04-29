# Session Summary — April 27, 2026 (Phase 2 Design Session)

A long, deep design session. No code shipped. Comprehensive Phase 2 design work covering Goals home layout, activity tracking framework, session definitions, and yearly anchor flows for all six modules. This is the design foundation for the Phase 2 build.

---

## What got designed

### 1. Goals home layout

**Two views with a segmented pill toggle (Option A — pill style):**
- **By timeframe** — default view, action-oriented. "What am I focused on right now?" Weekly scope open by default, longer ranges collapsed.
- **By module** — intentional view, hierarchy-oriented. "What am I building and how does it connect?" Shows full parent/child goal hierarchy from yearly umbrella down to weekly habit.

The toggle lives just below the "My music goals" header. Page subtitle: "Track what you're working toward across all timeframes."

**By timeframe view structure:**
- Scope header (e.g. "Weekly") with target date on the right (e.g. "by Sunday, May 3")
- Goals grouped by module within each scope layer, using module canonical accent colors
- Module subheaders in nav order (Goals → Dashboard → Skills Catalogue → Practice Sessions → modules in nav order)
- Module subheaders use canonical accent colors (color-coding principle already established)
- Goals listed flat under each module subheader

**By module view structure:**
- Module is the top-level organizer
- Scope lives underneath (yearly umbrella at top, monthly beneath, weekly beneath that)
- This IS the parent/child hierarchy view
- Default state: umbrella goals expanded, children collapsed
- Collapse behavior: tapping umbrella collapses entire subtree; tapping a child level collapses that level and its children independently

**Summary counts:** Two options still open (counts at top vs. counts inline per scope header). Deferred to full mockup review.

**Header:** "My music goals"

---

### 2. Goal row design

**Collapsed state:** Natural language goal description only (same language as review & save page of goal creation flow).

**Expanded state (tap to expand inline):**
- Activity chart (scope-adaptive — see below)
- Progress bar with label
- Edit and Delete actions

**Activity chart by scope:**
- Weekly → 7-day bar chart (M T W T F S S), bars proportional to activity intensity
- Monthly → dot grid (7 columns × weeks of month, calendar-style), future days faded
- Yearly → 12-month bar chart (J F M A M J J A S O N D), future months faded

**Visual enhancements on activity charts:**
- Average line — subtle horizontal reference showing personal average session
- High intensity marker — bar gets a number/time label on top for notably high days (top 20% of personal history)
- Self-scaling — intensity is relative to personal history, not a fixed external standard
- Future days/months always faded out

**Progress bar:** uses module accent color, shows fraction or percentage toward goal target. "Not started" when current_value = 0. Bar only appears when current_value > 0 (flat empty bar deferred — don't show nothing as something).

---

### 3. Activity tracking framework — units and session floors

**Core principle:** Activity is the leading indicator; goal completion is the lagging indicator. Both matter and are shown separately.

**Activity units per module:**
- Ear Training — cards reviewed
- Harmonic Fluency — cards reviewed
- Song Repertoire — time spent (practice block start/end)
- Shapes & Patterns — time spent (practice block start/end)
- Production — time spent (practice block start/end)
- Harmonic Diary — excluded from activity tracking and Practice Sessions for now

**Session floors (minimum to count as a real session for consistency goals):**
- Card modules (Ear Training, Harmonic Fluency) — 10 cards reviewed
- Time modules (Song Repertoire, Shapes & Patterns, Production) — 10 minutes
- 10 cards / 10 minutes — easy to remember, consistent across the app
- Anything above zero still shows on the activity chart (honest about all activity)
- High intensity days get a label (card count or time) on top of the bar

**Consistency goal defaults:**
- Per week default across all modules
- Per month toggle available on all modules
- Production specifically may lean monthly but per week is still default

---

### 4. Verified card/item counts (Claude Code audit)

- Ear Training — 134 cards ✓ (26 intervals + 30 chord recognition + 69 chord progressions + 9 scales & modes)
- Harmonic Fluency — 302 cards across 12 categories
- Shapes & Patterns — 408 shape × key combinations (29 chord shapes × 12 keys = 348; 2 scales × 12 = 24; 3 voice-leading × 12 = 36)
- Production — 56 lessons across 6 paths (lessons.ts header comment "24 Phase-1 lessons" is stale — fix next time in that file)
- Song Repertoire — 7 seed songs (live count unknown until fresh export)

**Global design principle established:** Yearly anchor breadth questions always display live item counts pulled from the data, never hardcoded numbers. Content will grow (mode shapes, pentatonic scales coming to Shapes & Patterns).

---

### 5. Yearly anchor flow — four dimensions per module

**Framework:** Every module's yearly anchor walks the user through four dimensions in this order:
1. **Breadth** — what do you want to cover?
2. **Depth** — how well do you want to know it?
3. **Mastery** — what do you want to truly own?
4. **Consistency** — how often will you show up?

**Coverage goal — new goal type established:**
Breadth goals target `acquired` stage for all items in a module. "Acquired" is the minimum bar for genuine coverage — not just seen once, but stable recall. The algorithm ensures no item stays in `new` or `acquiring` indefinitely.

**North star principle captured:**
"Hit everything and really know most things well by the end of the year." The app's job is to make that achievable in a structured way — goals set the destination, spacing state tracks where everything is, Practice Sessions algorithm plots the route.

---

### 6. Yearly anchor flows — module by module

#### Ear Training
1. **Breadth** — "Do you want to work through all 134 ear training cards this year?" → Yes / No → if No: which of the 4 groups? (Intervals, Chord Recognition, Chord Progressions, Scales & Modes)
2. **Mastery** — "Are there specific groups you want to truly master?" → multi-select from 4 groups, pre-filtered to breadth selection
3. **Depth** — "What overall accuracy level do you want to reach across all of Ear Training by year end?" → accuracy % slider 50–95%
4. **Consistency** — "How many times per week do you want to practice Ear Training?" → per week default, per month toggle

#### Harmonic Fluency
1. **Breadth** — "Do you want to work through all 302 harmonic fluency cards this year?" → Yes / No → if No: which of the 4 groups? With descriptions:
   - Foundational / Math — "The building blocks — scale degrees, note names across keys, and key relationships. The grammar of music theory."
   - Chord Knowledge — "How chords are built, named, and used — from diatonic qualities to slash chords and inversions."
   - Functional / Applied — "How harmony moves — chord function, key pivots, and the vocabulary of chord progressions."
   - Ear & Recognition — "Connecting what you hear to what you know — modes, intervals, and bridging ear training with theory."
2. **Mastery** — "Are there specific areas you want to truly master?" → multi-select from 4 groups, pre-filtered to breadth selection
3. **Depth** — "What overall accuracy level do you want to reach across all of Harmonic Fluency by year end?" → accuracy % slider 50–95%
4. **Consistency** — per week default, per month toggle

Note: Harmonic Fluency 4-group structure exists in goal creation flow but not yet in the module UI or nav. UI consistency gap — add to design backlog (Phase 7 polish unless pulled earlier).

#### Song Repertoire
Dimensions map to proficiency levels, escalating in depth of ownership:
1. **Breadth (Comfortable)** — "How many songs do you want to know how to play by year end? You know how to play them."
2. **Depth (Solid)** — "How many songs do you want to be performance-ready? Impress your friends, family, and loved ones."
3. **Mastery (Internalized)** — "How many songs do you want to own so deeply you could make someone cry, yourself included? You know them with your eyes closed."
4. **Consistency** — "How often do you want to cultivate your Song Repertoire?" → per week default, per month toggle

**Validation:** Internalized ≤ Solid ≤ Comfortable. Levels are cumulative — Internalized implies Solid which implies Comfortable. Gentle non-blocking nudge if numbers violate this.

#### Shapes & Patterns
Mental Visualization note: does not introduce new shapes — it's a different cognitive mode for internalizing existing shapes. Excluded from breadth/depth/mastery counts but included as valid activity toward consistency goals.

1. **Breadth** — "Do you want to work toward Comfortable across all [X] shapes this year?" (X = live count from Chord Shape Drills + Scale Drills + Voice-Leading only) → Yes / No → if No: which areas? (Chord Shape Drills / Scale Drills / Voice-Leading with short descriptions)
2. **Depth** — "Which areas do you want to reach Solid in across all 12 keys?" → multi-select from activity areas, pre-filtered to breadth selection
3. **Mastery** — "Are there specific shapes you want to truly own — Solid in all 12 keys, no hesitation?" → item-level picker within selected areas
4. **Consistency** — "How many minutes a week do you want to practice Shapes & Patterns?" → per week default, per month toggle

#### Production (3 questions — depth/mastery distinction deferred until more firsthand experience with material)
1. **Breadth** — "Do you want to work through all 56 production lessons this year?" → Yes / No → if No: which paths?
2. **Depth** — "Which paths do you want to go deepest on?" → multi-select from paths within breadth selection
3. **Consistency** — "How many hours a week do you want to spend on production?" → per week default, per month toggle

#### Practice consistency (meta-habit — 3 questions)
1. **Weekly floor** — "What's the minimum number of days per week you want to practice?" → default suggestion: 4
2. **Monthly floor** — "What's the minimum days per month you want to practice?" → default suggestion: 18 (4 weeks × 4 days + buffer)
3. **Aspiration** — "What's your ideal?" → 5–7 per week

Floor feeds consistency goal and algorithm's behind-schedule detection. Aspiration feeds session recommendation ambition. Monthly floor is the safety net for bad weeks and vacations.

---

### 7. Yearly anchor nudge design

**Trigger:** When a user creates a goal for a module and no yearly umbrella exists for that module yet, the flow nudges them to set one first. One-time per module — once a yearly umbrella exists, nudge never appears again.

**Backstop:** In the by-module view, a soft "set a yearly anchor for [Module]" prompt appears where the umbrella would live if none exists.

**Nudge language:** Each nudge includes a module-specific example written in that module's canonical vocabulary, pitched at the broadest level:
- Ear Training: "I want to reach 85% accuracy across all 4 ear training groups by the end of this year."
- Harmonic Fluency: "I want to reach 80% accuracy across all 12 harmonic fluency categories by the end of this year."
- Song Repertoire: "I want to reach Comfortable proficiency with 25 songs by the end of this year."
- Shapes & Patterns: "I want to reach Comfortable proficiency on major and minor chord shapes across all 12 keys by the end of this year."
- Production: "I want to complete 2 full production paths by the end of this year."
- Practice consistency: one question only, no example needed

**Structure:** Yearly anchor is not one goal — it's a small goal cluster (up to 4 child goals) all feeding one yearly umbrella, together expressing the complete intention for a module.

---

### 8. UI design notes

- **Card count visibility** — every module that has discrete countable items should display a visible total count in the UI. Global principle across Ear Training categories, Harmonic Fluency, Song Repertoire, Shapes & Patterns, Production lessons.
- **Harmonic Fluency category count** — 69 chord progressions in Ear Training is a lot; note to review and possibly trim or reorganize. Design note: add a UI surface that shows total card count per category so auditing is easy.
- **lessons.ts stale comment** — header says "24 Phase-1 lessons" — fix next time in that file.

---

## What still needs design before Phase 2 build

- **Umbrella goal UI** — hierarchy sketched, creation flow not fully spec'd
- **By-module view full mockup** — described but not drawn
- **Mid-year expansion flow** — converting single goals into umbrella goals
- **Coverage goal schema implications** — does current schema support `acquired` stage targeting for all items in a module?
- **Accuracy tracking** — does Ear Training currently track correct vs. incorrect per attempt? Needs Claude Code check.

---

## Deferred items

- Summary counts placement (top vs. inline) — deferred to full mockup review
- Harmonic Fluency 4-group structure propagation to module UI and nav (Phase 7 polish)
- Production depth/mastery distinction — deferred until firsthand experience with material
- Mental Visualization note: excluded from shape counts but counts toward consistency — may apply to other modules in future, not yet a global principle

---

## What's next

1. Write this session summary ✅
2. Next design session — finish umbrella UI and by-module view full mockup
3. Claude Code audit — schema implications for coverage goals and accuracy tracking in Ear Training
4. Then build Phase 2 with full design locked

---

## Files to update

- **SESSION_SUMMARY_2026_04_27_PHASE2_DESIGN.md** — NEW (this file)
- **DESIGN_DECISIONS_6.md** — add activity tracking framework, session floors, yearly anchor structure, coverage goal type, north star principle
- **PRACTICE_SESSIONS_DESIGN_3.md** — add yearly anchor flow specs per module
- **BUILD_SEQUENCER_2.md** — Phase 2 scope expanded; note design session partially complete, umbrella UI still needed
