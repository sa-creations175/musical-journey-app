# Musical Journey App — Design Decisions

Living document capturing all design decisions for the Musical Journey App. Read this at the start of any session working on this project. Update at the end of any session where decisions are made.

Last updated: April 23, 2026

---

## Project context

A personal PWA for comprehensive music practice — ear training, theory fluency, song repertoire, technical drills, session logging, creative exploration, and production skill development. Built with React + TypeScript + Vite + Tailwind + Dexie (IndexedDB) + Web Audio API synthesis. Installable as a PWA on phone and desktop.

The app is for a 2.5-year self-taught keyboardist focused on gospel, R&B, soul, jazz, neo-soul, and hip-hop. See `WORKING_WITH_CLAUDE.md` for musical context and `PERSONAL_OS_DESIGN_PRINCIPLES.md` for the cross-app design philosophy.

The app may eventually be shared or sold. Design should work for others, not just the primary user.

---

## Ultimate vision: part of a Personal Operating System

This app is the first instance of a broader **Personal Operating System pattern** — a suite of connected apps that together answer "how is Silas doing across all major life domains?"

**Planned ecosystem:**
- Musical Journey App (in development — this project)
- Fitness app (tracking, visualization, goal progress)
- Mental health / reflection app
- Finance app (manual entry / CSV first, potentially bank-connected later)
- Relationships app
- Professional projects / goals app
- Travel schedule / planning app
- Personal tasks / productivity app

**Eventual meta-dashboard:** a unifying app that reads from all the above and synthesizes a single view of how life is going across all domains. Reveals cross-domain patterns ("your creative output drops in weeks when sleep is poor"), correlations, and imbalances invisible to any single app.

**Architectural implication for this music app:**
Every data structure, schema decision, and aggregation design should assume eventual meta-dashboard integration. The music app is NOT being built in isolation — it's the first node in a connected network.

See `PERSONAL_OS_DESIGN_PRINCIPLES.md` for the cross-app design philosophy.

---

## Data-ready design principle (CRITICAL)

**Every piece of data captured in this app must be built to be sliced, diced, queried, and visualized — both within this app AND across future apps.**

This means:

### All data is queryable and structured
No data exists only as free-form text when structured data would serve. Tags, categories, timestamps, numeric values, enumerations — these are the substrates that enable future visualization and cross-app analysis.

### Consistent metadata across all records
Every table/record has:
- `user_id` (for future multi-user and cross-app correlation)
- `created_at` (when created)
- `updated_at` (when last modified)
- `last_engaged_at` (for freshness tracking — applicable across all tracked items)
- Appropriate foreign keys to related entities

### Schema is explicit about semantic meaning
Column names and structures reflect real conceptual meaning, not just technical convenience. "practice_duration_seconds" not "d". "emotional_tags_array" not "t". Future apps and the meta-dashboard need to understand what each field represents.

### Categorical data uses enumerated types
Mood states, emotion tags, mastery tiers, priority levels — these use consistent enumerated values across all tables. Not free-text. A "melancholy" association should match "melancholy" anywhere it appears across the app.

### Time-series data is first-class
Every significant user action is logged with timestamp. Practice sessions, drill completions, mood check-ins, creative session entries, lesson completions — all stored as time-series events. Enables historical analysis, pattern detection, and longitudinal visualization.

### Aggregations pre-computed where valuable
Daily summaries, weekly totals, streak calculations — compute and store at write-time, not query-time. Faster, enables richer visualization, and supports meta-dashboard queries efficiently.

### Cross-domain reference-ready
When the meta-dashboard exists, it will pull data across apps. This app's data needs to express:
- **Temporal alignment** (when did this happen? what time of day? what day of week?)
- **Intensity/investment** (how much time was spent? how difficult was it perceived?)
- **Qualitative context** (what mood was engaged? what genre was explored?)
- **Outcome/progress** (what was achieved? what tier was reached?)

Every user action should capture enough metadata that a meta-dashboard could later ask: "When musical creative output was high, what else was happening in Silas's life?"

### Visualization-ready by design
Data should be structured to feed compelling visualizations without extensive transformation:
- Numeric values for radar charts
- Time-series for trend charts
- Categorical counts for distribution charts
- Relationships for network/graph views
- Heatmap-ready counts (day × category)

When building any new feature, ask: "How would this data appear in a beautiful visualization?" If the answer requires extensive server-side computation, restructure the storage.

### Data export/import foundational
Users always own their data. JSON export/import works for everything in the app. This principle serves:
- User data ownership
- Cross-device sync
- Future meta-dashboard federation
- Resilience (if any single service fails, data isn't locked)

---

## Philosophical core (this app specifically)

This app is not just a practice tool. It's an instance of the personal-OS pattern.

**The dashboard is the philosophical center.** Every app opens to a dashboard first. The music dashboard shows musicianship health. The dashboard embodies the question "how am I doing?" Everything else is in service of answering that.

Starting with the dashboard as "home" reinforces the user's actual question every time they open the app.

---

## The scaling problem and how the app solves it

With hundreds of skills across modules, no user can maintain manual awareness of all of them. The app has to make choices for the user.

**How this resolves:**
- **Dashboard** surfaces what genuinely needs attention given user priorities
- **Practice Sessions** composes practice sessions from that prioritization, matched to available time
- **User's role:** state priorities and maintenance goals per skill/item
- **App's role:** translate priorities into concrete daily practice suggestions

Dashboard + Practice Sessions are the integration layer that turns individual skill tracking into a coherent practice life.

---

## Navigation architecture

Top-level navigation order (reflecting pedagogical progression: theory → sound → body → song):

1. **Dashboard** (home — the health check)
   - Skills Catalogue (sub-item)
2. **Harmonic Fluency** (flashcards — theoretical framework; brain icon)
3. **Ear Training** (ear icon; includes Intervals, Chord Recognition, Chord Progressions, Scales & Modes)
4. **Shapes & Patterns** (physical command; includes Scale Drills, Chord Shape Drills, Voice-Leading Drills, Mental Visualization Drills)
5. **Song Repertoire** (integration — where everything converges; rose color)
6. **Practice Sessions** (unified forward-looking guidance + backward-looking session log; teal color when built)
7. **Production & Logic Pro** (six paths; deep indigo when fully built)

**Creative Sessions group:**
- Just Play
- Just Produce
- Harmonic Diary

**Global tools (app header):**
- Instrument selector (Piano, Rhodes, Strings, Voice, Organ)
- Metronome (tempo, groove options, time signatures)
- Just Play / Just Produce

Modal Interchange is NOT a separate module. Filterable tag across modules.

---

## Module color palette

Each module has a distinct color with lighter and darker variants:

- Dashboard: warm slate blue `#4a6b8a`
- Harmonic Fluency: deep purple `#7a5aa8`
- Ear Training: green `#5a8752`
- Shapes & Patterns: warm amber `#d4885a`
- Song Repertoire: deep rose `#a8556b`
- Practice Sessions (when built): teal `#4a9088`
- Production & Logic Pro: deep indigo `#3a4875`
- Creative Sessions group: muted gold `#c4a05a`

Applied consistently across: sidebar nav, Dashboard Modules at a Glance, Skills Catalogue, module pages, Harmonic Diary module tags.

---

## Build order (current state)

1. ✅ Intervals sub-module
2. ✅ Chord Recognition sub-module
3. ✅ Chord Progressions sub-module (Full Progression, Key Detection, Chord Motion)
4. ✅ Harmonic Fluency module
5. ✅ Scales & Modes module
6. ✅ Song Repertoire module (functional notation + beat-based chords + arrangements + syllable splitting)
7. ✅ Shapes & Patterns module (4 activity areas + global metronome + full skill population)
8. ✅ Dashboard + Just Play/Just Produce
9. ✅ Skills Catalogue + Harmonic Diary (including pre-populated starter associations)
10. 🟡 Production & Logic Pro Phase 1 (building now — Paths 1, 2, 3)
11. Production & Logic Pro Phase 2 (Paths 4, 5, 6)
12. Cloud sync + authentication (enables cross-device use)
13. Practice Sessions (built last, on unified data foundation)

---

## Core design principles (apply across ALL modules in this app)

### Attempts-based daily goals
All goals tracked by attempts, not correct answers.

### Daily goals are achievable floors, not aspirational ceilings
Defaults: Intervals 10, Chord Recognition 10, Chord Progressions 8, Harmonic Fluency 10, Scales & Modes 5. Time-based modules (Song Repertoire, Shapes & Patterns) don't use daily attempt goals.

### Metrics should be honest, not flattering
No reset buttons. Counts reset at midnight naturally.

### Mixed-color progress bar reflects accuracy + completion
Green (correct) + amber (wrong) with smooth recalculation.

### Functional vocabulary leads, academic vocabulary follows
Practical language primary. Academic terminology secondary.

### Functional notation (numbers) is canonical for chord functions
User preference sets display (numbers default / Roman numerals / stacked / concrete). Storage always functional. App-wide preference.

### Visual scaffolding with progressive fading
Start full support, fade as fluency grows.

### Three-mode progression for any drill type
Full / Partial / Minimal scaffolding.

### No auto-advance — user controls pace
Manual Next. Previous navigation. Keyboard shortcuts.

### Every learning moment is a mini-lesson
Answer reveals explain what, why, where in real music.

### Cross-module reinforcement is offered, never assumed
Playing notes isn't the same as understanding patterns. App invites connections; users complete them explicitly.

### Definitions reinforce passively everywhere
Tooltips and inline definitions for technical terms.

### Claude's starter associations matter
"My associations" features pre-populate with evocative starters tuned to user's taste. User edits. Claude starters stay as reference.

### Visuals must match the cognitive model of the skill
Linear strip for sequential, circular compass for relational, radar for balance.

### Spatial-directional notation matches physical keyboard
In motion feedback, destination on left for descending, right for ascending.

### Chord qualities are essential pedagogical context
In motion drills, chord qualities (not just degrees) always shown.

### Difficulty control is multidimensional
Scaffolding is one dial. Material scope is another.

### Settings changes apply forward, never retroactively
Current state never disturbed by setting changes.

### Focus mode fluency protection
Pool < 4 items → attempts don't update fluency tiers.

### Visual feedback for all user actions
Every meaningful action gets visible confirmation.

### Complexity should be visible but organized
Group visually rather than hiding behind "advanced" menus.

### Theory before ear
Symbolic frameworks fluent before or alongside ear training.

### Time is the honest measure of practice investment
For physical practice modules, time spent is primary measure. Heat grids color on time.

### Countdown timers match physical practice habit
Countdown from target to 0:00.

### Bite-size lessons with optional deep dives
Surface (3-5 min) + expandable deep dive (15-30 min).

### Glossary as core infrastructure, not side feature
Every technical term linked throughout. "Got it" tracking keeps users honest.

### Reference tracks are user-built, pragmatically integrated
Reference Track Library user-curated with Claude starters. App doesn't attempt algorithmic analysis.

### Two-session arcs for creative application lessons
Session 1 = guided build, Session 2 = user's own creation. Respects session energy management.

---

## Modal Interchange as a tag (not a module)

Filterable tag across Chord Progressions, Song Repertoire sections, Harmonic Fluency Category 12, and eventually Skills Catalogue.

---

## Harmonic Diary concept

Every "My associations" field across the app feeds a personal harmonic vocabulary. Users search by feeling/keyword for songwriting. Lives in Creative Sessions nav group (also dual-homed under Harmonic Fluency).

Data structure: `{moduleId, itemId, userText, claudeStarterText, emotionalTags, genreTags, isStarterEdited, createdAt, lastEdited}`.

Pre-populated with 100-150 starter associations tuned to user's aesthetic.

Visual aesthetic: soft earthy olive-green with tan undertones (current v1 state). Dynamic emotion-based color theming planned for v2 but deferred for now.

---

## Shared freshness tracking system

Both Song Repertoire and Shapes & Patterns (and eventually all time-based modules) use shared freshness system.

**V1 uniform decay:**
- 0-3 days: fresh (full saturation)
- 4-10 days: getting stale (90%)
- 11-20 days: stale (70% + attention indicator)
- 21+ days: very stale (50% + clearer indicator)

**Roadmap:** smart decay weighted by investment, user-declared legacy mastery, self-assessment recalibration check-ins.

Dashboard surfaces cross-module staleness for unified "what needs attention" view.

---

## Mastery goals per item

Users declare per-item mastery goals: Comfort / Deep / Maintenance-only. App respects these rather than forcing universal depth.

---

## Data architecture (designed for future meta-dashboard integration)

### Database: Dexie (IndexedDB) currently, Supabase eventually

**Core tables (current):**
- `attempts` — every drill attempt with timestamps
- `dailySummaries` — pre-aggregated daily stats per module
- `songPracticeLog` — song practice sessions
- `drillSessions` — Shapes & Patterns drill completions
- `creativeSessions` — Just Play / Just Produce logs
- `skillRegistry` — unified registry across modules
- `harmonicDiaryEntries` — emotional associations
- `productionLessons` — Production module lesson state
- `glossaryTerms` — Production module glossary with "Got it" state
- `referenceTrackLibrary` — reference tracks user-curated

**Shared schema requirements:**
Every table includes:
- `user_id` (for future multi-user)
- `created_at` timestamp
- `updated_at` timestamp
- `last_engaged_at` (for freshness)

**Cross-module aggregates:**
Pre-compute and store daily/weekly/monthly aggregates. Enables Dashboard performance and future meta-dashboard queries.

---

## Song Repertoire module design

**Route:** `/repertoire`

**Three views:** Active Repertoire, Song Detail, Want to Learn.

**Architecture:**
- Functional notation as canonical storage
- Beat-based chord placement (words + blanks)
- Syllable-level beat splitting
- Multiple chord arrangements per phrase line with compare mode

**Stage framework:** Learning → Comfortable → Internalized → Cross-key → Maintenance

**Practice session logging:** Hybrid (timer + manual form).

**Pre-populated songs:** O Come All Ye Faithful, Alpha & Omega, Mirror (Madison Ryann Ward), Hold On (H.E.R.), A Couple Minutes (Olivia Dean), Can You Feel the Love Tonight (Elton John/Lion King), No Weapon (Fred Hammond).

---

## Shapes & Patterns module design

**Route:** `/shapes-and-patterns`

**Four activity areas** (pedagogical order):
1. Scale Drills (12 major + 12 natural minor = 24 scales with drill types)
2. Chord Shape Drills (29 qualities × 12 keys with populated drills per cell)
3. Voice-Leading Drills (ABA 251, BAB 251, 1-7-3-6-2-5-1 × 12 keys = 36 skills)
4. Mental Visualization Drills (flashcard format — Mental Transposition + Chord Shape Visualization, 50+ prompts each)

Global Metronome in app header.

**Drill flow:** countdown timer, metronome auto-starts, self-assessment, logs rep + duration + feel.

**Heat grid visualization:** three dimensions — base color (time), saturation (freshness), corner indicator (completeness/balance).

---

## Dashboard module design

**Route:** `/dashboard` (default landing)

**Top bar greeting:** "Hi Silas — how can I help you improve your musicianship today?" with rotating musical quotes from artists user admires.

**Sections:**
1. Warm opening (greeting, quote, today's summary)
2. Musician Balance radar — 5 dimensions (Theoretical Fluency, Physical Command, Musical Application, Creative Genius, Consistency)
3. Today's practice (daily goals per module, streak, weekly rhythm)
4. Recent wins
5. What's Calling Your Attention
6. Creative Genius (Just Play / Just Produce + prompts + Harmonic Diary link)
7. Modules at a Glance (compact preview, links to Skills Catalogue detail)
8. Quick actions

---

## Skills Catalogue design

**Philosophy:** informative, motivating to improve proficiency. Organized, data-forward. Dashboard's detailed cousin.

**Primary access:** Dashboard dropdown sub-item (accessed via Dashboard expand).

**Structure:**
- Top section: total skills, proficiency distribution, callouts
- Middle: What Needs Attention, Strong Spots
- Modules at a Glance cards (with consistent module colors/icons)
- View all skills (hierarchical, collapsible)

**Hierarchical sub-categorization per module:**
- Intervals: Ascending / Descending
- Chord Recognition: Foundational triads / Seventh chords / Dominant variants / Extensions & colors
- Chord Progressions: Key Detection / Chord Motion / Full Progression
- Scales & Modes: Modes / Minor Scale Variants
- Harmonic Fluency: 12 flashcard categories
- Shapes & Patterns: 4 activity areas
- Song Repertoire: flat list for now (possible grouping by stage in v2)
- Production: 6 paths (when built)

**Skill detail view:**
- Claude's starter description (editable)
- My association (editable, separate field)
- Pencil icon inline/adjacent to text
- Tag dropdown with type-ahead + suggested tags + create-new option

---

## Production & Logic Pro design

**Route:** `/production`

**Philosophy:** Six-path production education serving workflow fluency, audio engineering literacy, and genre-specific production, plus career/business context.

**Six paths:**
1. Workflow Foundations (12-15 lessons)
2. The Language of Production (10-12 concepts)
3. Vocal Production (10-12 skills)
4. Genre Productions (15-20+ two-session arcs)
5. Arrangement & Song Structure (10-12 lessons)
6. The Business of Music (15-20 lessons including AI era)

### V1 scope: 56 lessons across 6 paths

**Phase 1 build (in progress):** Paths 1, 2, 3 + glossary infrastructure (80+ terms) + Reference Track Library foundation

**Phase 2 build:** Paths 4, 5, 6 + expanded reference tracks + full glossary (150-200 terms)

**Lesson architecture (every lesson):**
- Title + one-sentence goal
- Surface layer (3-6 min) with Try Now exercise
- Deep dive layer (expandable, 15-30 min)
- YouTube link
- Glossary terms inline-linked
- "Got it" / "Need more" tracking
- Practice history

**Genre Productions reference track categories:**
- 6/8 Church Beat / Gospel Freestyle
- 90s/00 Gospel Choir (Kirk Franklin / Fred Hammond)
- 90s R&B Ballad (Babyface / Jermaine Dupri)
- 2000s R&B (Usher era)
- Lo-fi / Atmospheric Indie Style
- Modern R&B (minimal — Frank Ocean, H.E.R.)
- 80s Pop Ballad
- Modern Hip-Hop (thoughtful — J. Cole, Kendrick, Drake)
- Classic Dance R&B (Beyoncé territory) — v2
- 70s Soul/Funk Groove — v2
- Neo-Soul (D'Angelo, Erykah Badu) — v2

**Reference tracks are user-editable.** Claude pre-populates; user adds/removes/refines.

**Two-session arc for Genre Productions:** Session 1 = guided build, Session 2 = user's own creation. Respects session energy management. Sessions can be days/weeks apart.

---

## Just Play / Just Produce

**Global header feature** for creative time tracking with smart prompts.

**Two modes:** Just Play (keyboard exploration) / Just Produce (production work).

**Smart prompts** pull from:
- Recent Chord Motion practice
- Recent Chord Progressions
- Recent Scales & Modes
- Recent Song Repertoire activity
- Harmonic Diary emotional associations
- Completed Production lessons (when Production module exists)
- User's musical taste

**Prompt quality principle:** Data source curation matters. Excluded: Mental Visualization drills (wrong mode), most flashcard categories (too theoretical). Prompts should feel like a knowledgeable friend's suggestion.

**Logging:** countdown timer (default 10 min, adjustable), mode, prompt used, notes, timestamp. Minimum 2 min for real creative session log.

---

## Pedagogical insights (cumulative)

### Degree-relationship fluency gap (not key-dependency)
User's foundational gap. Chord Motion tab drills this.

### Modal recognition requires immersion
Brief chord vamps don't establish modal feel. Duration, melodic content, bass grounding needed.

### Mode knowledge is a network, not isolated
Five distinct mode-related skills in different modules.

### Chord motion feedback needs spatial, quality, emotional info
Four pieces together.

### Practice reps vs assessment
"Challenge yourself" mode for reinforcement without assessment count.

### Songs are the integration layer
Everything converges in real songs.

### Physical practice builds mental models, not just muscle memory
"Mind's eye" visualization drills train cognitive layer.

### Time is the most honest practice metric
Rep counts can inflate. Time is real.

### Not all skills need equal mastery depth
User declares per-item goals.

### Production requires three layers simultaneously
Workflow fluency + audio literacy + genre-specific skill.

### Glossary infrastructure prevents learning gaps
Users can't absorb advanced content while missing foundational terms.

### Session energy management matters
Two-session arcs respect focused attention limits.

### Creative time is practice, structured differently
Just Play / Just Produce honors unstructured creative exploration as first-class practice.

---

## Cross-module integration principles

- `detectProgressions()` connects Song Repertoire to Chord Progressions (functional matching)
- Skills Catalogue = single source of truth, feeds Dashboard
- All modules write to `attempts` and `dailySummaries`
- Song Repertoire → `songPracticeLog`
- Shapes & Patterns drills → `drillSessions`
- Creative time → `creativeSessions`
- Production lessons → `productionLessons`
- Export/import captures everything in one JSON
- Modal Interchange tag threads across modules
- Cross-module references offered, not assumed
- Harmonic Diary data structure: `{moduleId, itemId, userText, claudeStarterText, emotionalTags, lastEdited}`
- Shared freshness system across time-based modules
- Global metronome integrates with any timer-based drill
- Reference Track Library feeds Production lessons AND Just Produce prompts
- **All data designed for eventual meta-dashboard visualization and cross-app queries**

---

## Cloud sync and multi-device (upcoming)

**Status:** Planned for after Production module completes.

**Approach:** Supabase backend (shared across future personal-OS apps for single identity + cross-app queries).

**Requirements:**
- User authentication (sign up, login from any device)
- All Dexie tables mirrored in Postgres
- Offline-first behavior (app works without internet, syncs when reconnected)
- Conflict resolution for multi-device edits
- Row Level Security for future multi-user support

**Cost for personal use:** $0/month on Supabase free tier.

**Why now (before Practice Sessions):** Practice Sessions module depends on unified data. Building it on fragmented per-device data would mean refactoring later.

---

## Still pending / known issues

- Production Phase 1 build in progress (Paths 1, 2, 3)
- Production Phase 2 to follow (Paths 4, 5, 6)
- Cloud sync and multi-device (after Production completes)
- Practice Sessions module (last to build, on unified data foundation)
- Harmonic Diary dynamic emotion-based color theming (deferred to v2)
- Smart freshness decay (v2)
- User-declared legacy mastery (v2)
- Intervals module: Claude's anchor song starter suggestions still needed
- Chord Recognition: Claude's starter sound descriptions still needed

---

## Roadmap ideas (captured for future)

### Meta-dashboard integration (future)
- Read-only queries across all personal-OS apps
- Cross-domain correlations (music creative output vs sleep vs financial confidence)
- Unified radar view across domains
- Weekly narrative summaries

### Production module (v2+)
- Additional workflow foundation skills
- Remaining Path 2 concepts
- Extended genre library (Afrobeat, dancehall, electronic crossovers)
- Mixing and mastering deep paths
- Professional delivery (stems, DDP, metadata)
- Collaboration workflows
- Industry contract deep dives
- Publishing administration deep dives

### Shapes & Patterns future enhancements
- User-declared legacy mastery
- Smart freshness decay
- Self-assessment recalibration check-ins
- Additional scales (harmonic minor, melodic minor, modes, pentatonics, bebop, diminished)
- Fingering overlays (beginner-focused, toggleable)
- Cross-module integration with Song Repertoire
- Cross-module integration with Harmonic Fluency
- Extended chord voicings (rootless, spread, quartal)
- Practice streaks specific to this module

### Harmonic Fluency
- Cross-category weakness challenges
- Streak-based difficulty scaling
- User-created flashcards
- Audio-enabled cards
- Confidence check (guessed / unsure / solid)

### Chord Progressions
- Modulation challenges
- Common cadences scope for Chord Motion
- Diatonic-only scope variations
- Chord quality scope filter
- Inversion-only drill mode

### Scales & Modes
- Keyboard construction mode
- Melody identification
- Modal improvisation
- Play-along vamps

### Song Repertoire (v2+)
- Chord-level semantic connections
- Back-references from other modules
- Multi-voicing tracking per chord
- Audio recording of practice sessions
- Tempo progression tracking
- Integration with Practice Sessions
- Cross-song progression library
- Mode tagging per section

### Harmonic Diary
- Dynamic emotion-based color theming (design refinement needed first)
- Moodboard view vs list view distinction
- Richer visual atmospheric treatment

### Cross-module
- Spotify OAuth for personalized song examples
- Embedded audio players
- Real-song transcription mode
- Per-item history views
- Year-at-a-glance practice heatmap
- Radar chart historical comparisons
- End-of-session summaries

### Dashboard and Practice Sessions
- Weekly / monthly / yearly goals
- Mood pattern insights
- Practice time-of-day patterns
- Streak visualization on calendars
- Achievement badges
- Check-in questions rotation

### Just Play / Just Produce
- Smarter prompts with more data sources
- Voice memo integration
- Quick-export of creative session notes

---

## How to use this document

**Starting a session:** paste this file + `WORKING_WITH_CLAUDE.md` + `PERSONAL_OS_DESIGN_PRINCIPLES.md` at start of any new Claude conversation.

**Ending a session:** ask Claude to summarize decisions made, ready to paste into this file.

**When Claude Code builds:** reference this document to ensure builds match designs.

**Cross-device continuity:** save to email/iCloud/Google Drive. Paste at start of any session on any device.

**When considering a new feature:** cross-check against principles here AND `PERSONAL_OS_DESIGN_PRINCIPLES.md`. Ensure new data structures are meta-dashboard-ready.
