# Musical Journey App — Design Decisions

Living document capturing all design decisions for the Musical Journey App. Read this at the start of any session working on this project. Update at the end of any session where decisions are made.

Last updated: April 25, 2026

**What changed in v6 (April 25, 2026):** Comprehensive design review of Practice Sessions + Goals completed. All 10 prior open questions resolved. Three new principles added: "Deduce intent from signals, don't accumulate declarations"; "Show the trade-off, not just the plan"; "Honest about abundance, not just scarcity." Architectural simplification: focus mode and acquisition mode collapsed into goals + spacing state (no separate user-declared modes). Day profiles named (Standard / Light / Deep). Performance ratings named (Flying / Cruising / Crawling). Multi-component goals supported in schema. Centralized prompt orchestration introduced. See `PRACTICE_SESSIONS_DESIGN_3.md` for the full Practice Sessions design.

---

## Project context

A personal PWA for comprehensive music practice — ear training, theory fluency, song repertoire, technical drills, session logging, creative exploration, and production skill development. Built with React + TypeScript + Vite + Tailwind + Dexie (IndexedDB) + Web Audio API synthesis + Supabase (cloud sync). Installable as a PWA on phone and desktop. Deployed to Vercel at `musical-journey-app.vercel.app`.

The app is for a 2.5-year self-taught keyboardist focused on gospel, R&B, soul, jazz, neo-soul, and hip-hop. See `WORKING_WITH_CLAUDE.md` for musical context and `PERSONAL_OS_DESIGN_PRINCIPLES.md` for the cross-app design philosophy.

The app may eventually be shared or sold. Design should work for others, not just the primary user.

---

## Ultimate vision: part of a Personal Operating System

This app is the first instance of a broader **Personal Operating System pattern** — a suite of connected apps that together answer "how is Silas doing across all major life domains?"

**Planned ecosystem:**
- Musical Journey App (in development — this project)
- Fitness app
- Mental health / reflection app
- Finance app (manual entry / CSV first)
- Relationships app
- Professional projects / goals app
- Travel schedule / planning app
- Personal tasks / productivity app

**Eventual meta-dashboard:** a unifying app that reads from all the above and synthesizes a single view of how life is going across domains.

**Architectural implication for this music app:**
Every data structure, schema decision, and aggregation design assumes eventual meta-dashboard integration. All tables include consistent metadata (`user_id`, `created_at`, `updated_at`, `last_engaged_at`) supporting future cross-app queries.

See `PERSONAL_OS_DESIGN_PRINCIPLES.md` for the cross-app design philosophy.

---

## Data-ready design principle (CRITICAL)

Every piece of data captured in this app is built to be sliced, diced, queried, and visualized — both within this app AND across future apps.

- All data is queryable and structured
- Consistent metadata across all records
- Schema is explicit about semantic meaning
- Categorical data uses enumerated types
- Time-series data is first-class
- Aggregations pre-computed where valuable
- Cross-domain reference-ready
- Visualization-ready by design
- Data export/import foundational

---

## Philosophical core

The dashboard is the philosophical center. Every app opens to a dashboard first. The music dashboard shows musicianship health. The dashboard embodies the question "how am I doing?" Everything else is in service of answering that. **Practice Sessions is the action layer of that question** — what to do given how I'm doing.

---

## Navigation architecture

**Overview group (top-level nav):**

1. **Goals** (planned — Phase 1 of Practice Sessions build; see PRACTICE_SESSIONS_DESIGN.md)
2. **Dashboard** (home — with Skills Catalogue sub-item) — warm slate blue `#4a6b8a`
3. **Skills Catalogue**
4. **Practice Sessions** (planned — see PRACTICE_SESSIONS_DESIGN.md) — teal `#4a9088`

**Learning modules (theory → sound → body → song):**

5. **Harmonic Fluency** (brain icon, 12 categories) — deep purple `#7a5aa8`
6. **Ear Training** (ear icon; Intervals, Chord Recognition, Chord Progressions, Scales & Modes) — green `#5a8752`
7. **Shapes & Patterns** (4 activity areas) — warm amber `#d4885a`
8. **Song Repertoire** — deep rose `#a8556b`
9. **Production** (6 paths) — deep indigo `#3a4875`

**Creative Sessions group:** Just Play, Just Produce, Harmonic Diary — muted gold `#c4a05a`

**Global tools (app header):** instrument selector, metronome, Just Play button, Settings.

**Color coding is canonical** (April 2026 principle). The colors above are reused everywhere a module appears: in nav, in Skills Catalogue, in Practice Sessions block visualizations, in Dashboard heat maps, in Goals related-modules indicators. Same green for ear training in every surface.

---

## Build state

### Completed
1. ✅ Intervals sub-module
2. ✅ Chord Recognition sub-module
3. ✅ Chord Progressions sub-module (Full Progression, Key Detection, Chord Motion)
4. ✅ Harmonic Fluency module
5. ✅ Scales & Modes module
6. ✅ Song Repertoire module
7. ✅ Shapes & Patterns module
8. ✅ Dashboard + Just Play/Just Produce
9. ✅ Skills Catalogue + Harmonic Diary
10. ✅ Production module Phase 1 (Paths 1-3)
11. ✅ Production module Phase 2 (Paths 4-6)
12. ✅ Cloud sync + Supabase auth + Vercel deployment
13. ✅ Song Repertoire delete functionality (cascading delete across 7 related tables; two-step confirm; tested end-to-end)
14. ✅ Seeder sync bug fix (all three seeders defer until SyncContext phase === 'ready'; backfill utility `window.__backfillUnsyncedRows()`)
15. ✅ Harmonic Diary duplicate cleanup (`window.__resetHarmonicDiary()`); diary now contains exactly 98 unique starter entries
16. ✅ Shared note-sequence audio primitive (`src/lib/musicalPlayback.ts`)
17. ✅ Diary playback for multi-chord entries (chord progressions and chord motions wired up; explicit MOTION_DEFS table for 12 motion ids)
18. ✅ Diary three-mode playback UI (asc/blocked/desc buttons in ↑ ▤ ↓ order) for chord, progression, and mode entries
19. ✅ Diary playback tuning (DIARY_BPM = 50, DIARY_OVERLAP = 0.25, DIARY_REGISTER_FLOOR_MIDI = 48 (C3), DIARY_INTERVAL_FLOOR_MIDI = 57 (A3), DIARY_REGISTER_CEILING_MIDI = 72 (C5), MODE_BEATS = 4)
20. ✅ Diary interval playback fix (asc/desc subtype now correctly drives note ordering)
21. ✅ **Practice Sessions + Goals comprehensive design review** (April 25, 2026; all 10 prior open questions resolved; see PRACTICE_SESSIONS_DESIGN_3.md for full design)

### Pending — priority-tagged

**P1 — Active / current work:**
- **Practice Sessions + Goals Phase 1 build** (foundation: data model, sync, single-target Goals + onboarding, day profiles, Practice Sessions placeholder + manual logging, vacation mode, prompt orchestration plumbing — see PRACTICE_SESSIONS_DESIGN_3.md "Phase 1 Build Spec")

**P2 — Real work, not urgent:**
- Production Vocabulary flashcards
- Audio: source-module consistency pass (where pedagogically appropriate)
- Diary playback controls — transposition (per-entry or global key), possibly global tempo/register settings
- Sustained-chord rendering in long-duration blocked progressions (the "blues feels dead" issue requires design conversation)

**P3 — Polish work:**
- Content polish pass (Production lesson formatting)
- Settings UI for backfill utility (currently console-only)
- Mode playback placeholder fix (Ionian/Dorian/etc. all sound like C major)
- Mode entries: include octave on top for ascending, start from octave for descending; applies to all 7-note scale entries (modes AND minor scale variants — harmonic minor, melodic minor, etc.)
- Visual feedback / isPlaying state on diary play buttons
- Diary audio defaults match source module defaults
- Audit starter associations for title convention consistency (prose vs. numeric notation)
- Diary mobile layout: single-column, wider cards on narrow viewports
- Per-progression beat multiplier knob (only if progression arpeggios continue to feel too clipped)
- YouTube video linking and saving across modules
- Memory type override UI (after Phase 2 of Practice Sessions)

**P4 — Watch list, not committed:**
- Destructive-red flow for Want to Learn deletes (inline undo-toast acceptable for now)
- UI re-render timing after auto-pull (untested, only revisit if noticed)
- Session expiration / surprise logout (one-time occurrence, may be non-issue)

---

## Priority framework (working style)

**P1 — Active / current work:** in progress this session
**P2 — Real work, not urgent:** substantive features or fixes worth doing soon
**P3 — Polish work:** improvements to existing functionality, pickable between bigger builds
**P4 — Watch list, not committed:** items to revisit only if real use reveals they matter

Items can sit in P4 forever. Moving up requires a real reason — started bothering me, dependency forcing the issue, or genuine energy for it.

---

## Core design principles (apply across ALL modules)

### Attempts-based daily goals
All goals tracked by attempts, not correct answers.

### Metrics should be honest, not flattering
No reset buttons.

### Mixed-color progress bars reflect accuracy + completion
Green (correct) + amber (wrong) with smooth recalculation.

### Functional vocabulary leads, academic vocabulary follows

### Functional notation (numbers) is canonical for chord functions
User preference sets display. Storage always functional.

### Visual scaffolding with progressive fading

### Three-mode progression for any drill type
Full / Partial / Minimal scaffolding.

### No auto-advance — user controls pace

### Every learning moment is a mini-lesson

### Cross-module reinforcement is offered, never assumed

### Visuals must match the cognitive model
Extends to audio: playback should match the cognitive model the user is building.

### Difficulty control is multidimensional
Scaffolding is one dial. Material scope is another.

### Settings changes apply forward, never retroactively

### Focus mode fluency protection

### Time is the honest measure of practice investment

### Countdown timers match physical practice habit

### Bite-size lessons with optional deep dives

### Glossary as core infrastructure, not side feature

### Reference tracks are user-built, pragmatically integrated
App does NOT auto-assign tracks to lessons. User curates per-lesson via "Add from Library" or "Browse Suggestions."

### Two-session arcs for creative application lessons

### Claude cannot reliably verify specific song facts
Content generation stays at the artist/era/style level. Never claims specific tempos, time signatures, or keys for specific songs. Use artist exploration prompts instead.

### Automation serves curation, not replaces it
The app suggests options, the user chooses.

### Multi-artist exploration beats single-artist specific references
3-5 artists per style teaches tradition. User compares across artists.

### Musical playback should respect rhythm, not just pitch (April 2026)
Progressions, motions, and any sequenced harmonic content should support uneven durations because that's how music actually works. Uniform-duration playback is acceptable as a default but should not be a constraint of the engine. Implementation: `ProgressionStep.beats` and `Progression.durationPattern` already support per-step durations end-to-end.

### Diary audio fidelity matches source modules (April 2026)
The Harmonic Diary aggregates associations from multiple modules. Its playback should faithfully reproduce the sonic experience of each entry's source module, not invent a simplified version. This means matching default tempos, register choices, and playback modes (blocked vs. melodic) where pedagogically appropriate.

### Sound matches the diary's purpose: feeling, not drilling (April 2026)
Tempo defaults are slower (50 BPM), register sits in the rich middle of the piano (C3 floor for chords, A3 floor for intervals), notes overlap slightly so they ring into each other. The diary is contemplative, not pedagogical drilling.

### Proactive prompts as nudges, not surprises (April 2026 — promoted to cross-app principle)
The app surfaces what the user might want to know or act on without forcing action. Examples in this app: "This song moved to Comfortable. Add to your goal?" / "You've been on the same 8 songs for a while. Consider these new ones." / "End of your goal period. Here's how you tracked." User can engage or dismiss; either is fine. **Frequency budget required** — too many prompts become noise. Implementation: centralized prompt orchestration layer with 3/day soft cap, tier-prioritized (high / medium / low), zero prompts during active session blocks. See PRACTICE_SESSIONS_DESIGN.md for full architecture.

### Canonical vocabulary across the app (April 2026 — promoted to cross-app principle)
When the app uses defined levels (proficiency, mastery, freshness, priority), the same vocabulary applies everywhere. A "Comfortable" song means the same thing in Song Repertoire, in Goals, on the Dashboard, and in Practice Sessions. UI surfaces that ask users to engage with these concepts (e.g., goal-setting forms) introduce the vocabulary in the same breath as asking the user to use it. The proficiency levels (Learning → Comfortable → Internalized → Cross-key → Maintenance) are the canonical mastery vocabulary; see PRACTICE_SESSIONS_DESIGN.md for the full table.

### Day as the unit of breadth (April 2026 — for Practice Sessions and beyond)
Daily breadth across all dimensions is the goal, achieved through coordinated context-shifting sessions across the day, not one all-encompassing session.

### Sessions have roles (April 2026 — for Practice Sessions)
Opener / middler / closer. Same time + same context produces different sessions depending on the role.

### Show the reasoning (April 2026)
When the system uses an algorithm to recommend something, the algorithm's reasoning is expandable and visible. "Why this plan?" panels in Practice Sessions are the canonical example.

---

### NEW principles — April 25, 2026 design review

### Show the trade-off, not just the plan (NEW — April 25, 2026)
When a user choice has costs — focusing on one area, picking option A over B, expanding a goal, declaring per-session intent — the app surfaces what gets delayed, deferred, or risked **at the moment of choosing**, not after. This is "Show the reasoning" applied to *choices the user is making*, not just choices the algorithm is making. Examples in this app:
- Per-session intent with "lean toward this week's goals" surfaces what gets less time
- Two-option session proposals carry strategic identities ("keeps you on track" vs. "push hard on chord motion") so the trade-off is visible at the choice point
- Goal expansion mid-year surfaces "this raises your target — original commitment preserved as the first sub-goal"
The user keeps full agency; they just don't make the choice blind.

### Deduce intent from signals, don't accumulate declarations (NEW — April 25, 2026)
When the system can infer what the user wants from existing data (goals, behavior, spacing state, recent practice), prefer inference over asking the user to declare it explicitly. User declarations are a last resort, not a default. This reduces friction, keeps state honest, and prevents user-declared state from drifting out of sync with reality. Application examples in this app:
- **No "focus mode" toggle.** Focus emerges from goals — set a weekly goal tied to a dimension, the algorithm naturally weights it.
- **No "acquisition mode" toggle.** The system detects engagement and advances `acquisition_stage` automatically (`new` → `acquiring` → `acquired` → `consolidated` → `mastered`) based on behavioral signals.
- **No "daily goals" entity.** Daily intent is generated by the session algorithm from larger goals + state.
This is a sharper, more specific application of "automation serves curation": not just "let the user curate" but **don't make the user curate things the app can figure out itself.**

### Honest about abundance, not just scarcity (NEW — April 25, 2026)
When the user is genuinely caught up — no items strictly due, recent practice covered everything — the app names the moment honestly and offers strategic paths rather than auto-filling thinly to disguise the moment. In Practice Sessions, this is the "no items due" surface with three multi-select paths: Get ahead / Drive it home / Expand the goal. The user isn't shown a thin maintenance session pretending things are normal; they're shown an honest status and given strategic agency over the surplus.

### Truth-honoring trumps gentle defaults (NEW — April 25, 2026)
When reality is harder than the gentle default would suggest, the app reflects reality. Gentle is in the *navigation*, not the *hiding*. Canonical example from Practice Sessions: spacing decay continues during vacation. Items genuinely went stale; pretending otherwise is an ambient lie. The kindness is in the welcome-back surface that helps the user *meet* the truth (per-goal target-date adjustments, eased re-entry options), not in suppressing the decay clocks.

### Honest disclosure + full user agency (NEW — meta-pattern, April 25, 2026)
The app surfaces information, makes choices easy, never gates the user's action, never silently makes choices for them. This is a meta-pattern that surfaced repeatedly across the Practice Sessions design review:
- Q1 (focus trade-offs surfaced): user chooses, app discloses cost
- Q3 (abundance paths): app names the moment, user picks strategy
- Q6 (goal hierarchy): user opts into rollup, app suggests when sensible
- Q7 (no goals set): app degrades gracefully and discloses, never blocks
This is "automation serves curation" applied repeatedly and consistently.

### Prompt prominence varies by signal availability (NEW — April 25, 2026)
When the user's input is the *only* signal available (subjective rating of song practice, drill quality), the prompt is prominent. When the system already has objective data (ear training accuracy, flashcard correctness), the prompt is light or auto-collapsed. The app doesn't extract from users data it already has; it leans in where it doesn't.

---

## Harmonic Diary

Every "My associations" field across the app feeds a personal harmonic vocabulary.

**Data structure:** `{moduleId, itemId, userText, claudeStarterText, emotionalTags, genreTags, isStarterEdited, createdAt, lastEdited}`.

**Pre-populated with 98 starter associations** tuned to user's aesthetic. (Was 294 due to triple-seeding from sync bugs; cleaned up in April 2026.)

**Visual aesthetic:** soft earthy olive-green with tan undertones. Dynamic emotion-based color theming deferred to v2.

### Playback architecture (April 2026)

The diary uses a dedicated dispatcher (`src/modules/harmonic-diary/audio.ts`) that routes by skillId to module-specific playback:

- **Chord Recognition entries** → `playChord()` with diary defaults
- **Intervals** → `playNoteSequence` with asc/desc/harmonic order
- **Modes/scales** → `playChord()` for blocked, `playNoteSequence` for asc/desc (placeholder bug: all modes currently sound like C major — separate fix)
- **Chord Progressions (item subtype)** → `playProgressionById()` from `diaryPlayback.ts`
- **Chord Motions (motion subtype)** → `playMotionById()` from `diaryPlayback.ts` (uses explicit MOTION_DEFS table)
- **Shapes & Patterns chord shapes** → `playChord()` with diary defaults

Three-mode UI (asc/blocked/desc) applies to chord, progression, and mode entries. Intervals keep single play button (direction is part of entry's identity). Order is `↑ ▤ ↓` (asc on left).

Constants (in `src/lib/audio.ts`):
- `DIARY_BPM = 50` — matches user's tuned source-module pace
- `DIARY_OVERLAP = 0.25` — notes ring into each other (anti-robotic)
- `DIARY_REGISTER_FLOOR_MIDI = 48` (C3) — chord lowest note floor
- `DIARY_REGISTER_CEILING_MIDI = 72` (C5) — chord highest tone target
- `DIARY_INTERVAL_FLOOR_MIDI = 57` (A3) — interval lowest note floor (separate from chords)
- `SINGLE_CHORD_BEATS = 2` — chord arpeggio time budget
- `MODE_BEATS = 4` — mode arpeggio time budget (more notes need more time)

Empty catch block in dispatcher replaced with `console.warn('[diary-audio] playback failed', err)` — no more silent failures.

---

## Audio architecture (April 2026)

The app's audio playback layer is structured in three tiers:

**Tier 1: `src/lib/audio.ts`** — low-level primitives. `playNote`, `playChordBlocked`, `playChordBroken`, `playSeqChords`. Knows about MIDI, oscillators, scheduling, instruments. Doesn't know about music theory.

**Tier 2: `src/lib/musicalPlayback.ts`** (NEW) — shared note-sequence primitive. `playNoteSequence(rootMidi, notes, bpm, opts)` for any single-line note sequence with per-note durations and configurable overlap. `playBlocked(rootMidi, intervals, durationBeats, bpm, opts)` as sibling for harmonic stacks. Used by intervals, chord arpeggios, and modes.

**Tier 3: Theory-rich engines.** `progressionTheory.ts` (`playProgression` for full multi-voice progressions with voicings), `modeAudio.ts` (`playModalVamp` for specialized score rendering — left untouched as a leaf, not generalized).

**Diary-specific layer:** `src/modules/harmonic-diary/audio.ts` (dispatcher), `src/modules/ear-training/chord-progressions/diaryPlayback.ts` (progression and motion playback for diary).

**Pedagogically-locked modules** (don't force consistency — these hardcode mode/voicing for skill-isolation reasons):
- Key Detection (bass-chords + seventh hardcoded)
- Chord Motion (direction is the meaning of each motion)
- HearScale (asc-then-desc is canonical scale shape)
- Intervals (direction lives on each item, not as a global toggle)

---

## Freshness tracking system

**V1 uniform decay:**
- 0-3 days: fresh (full saturation)
- 4-10 days: getting stale (90%)
- 11-20 days: stale (70% + attention indicator)
- 21+ days: very stale (50% + clearer indicator)

**Roadmap:** smart decay weighted by investment, user-declared legacy mastery.

**Vacation mode behavior (April 25, 2026):** Decay continues during vacation. Vacation does NOT pause spacing clocks. Items genuinely went stale; the welcome-back surface helps the user navigate that honest state via per-goal target-date adjustments (Extend / Keep / Skip / Edit), not via hiding the decay. See PRACTICE_SESSIONS_DESIGN.md for full vacation mode spec.

---

## Practice Sessions + Goals (DESIGNED — Phase 1 in build)

**Full design lives in `PRACTICE_SESSIONS_DESIGN_3.md`.** This section is the cross-cutting summary.

### Status

Comprehensive design review completed April 25, 2026. All 10 prior open questions resolved. Design ready for Phase 1 build.

### New top-level nav: Overview group
1. Goals (NEW)
2. Dashboard
3. Skills Catalogue
4. Practice Sessions (NEW)

### Goals module
- Layered goals (lifetime → 3-5 year → yearly → quarterly → monthly → weekly)
- **No daily goal entity** — daily intent generated by algorithm (Q1)
- Progressive onboarding questionnaire (this-month-first, longer ranges optional)
- Day profiles (Standard / Light / Deep) with default pre-fills
- Goal hierarchy: hybrid (linked when user opts in via `parent_goal_id`); separate fields for relationship and numerical rollup
- Multi-component (umbrella) goals supported in schema (Phase 1); UI ships in Phase 2
- Original commitments preserved on goal expansion (never replaced)
- Proficiency vocabulary canonical across all goal-setting

### Practice Sessions module
- Input questionnaire (time, context, day plan, energy/mood, **per-session intent**)
- Session generator algorithm with goal-alignment + acquisition-stage weighting (no user-declared "modes")
- Vertical stacked rectangle visualization for proposed sessions (color-coded blocks proportional to time)
- One or two proposal options; each carries strategic identity ("keeps you on track" vs "push on X")
- Phone two-option presentation: swipe-between-cards
- "Why this plan?" reasoning panel (honest about goals absence when applicable)
- "No items strictly due" abundance flow with three multi-select paths (Get ahead / Drive home / Expand the goal)
- Time-blocked execution (hard/soft toggle)
- Performance ratings: **Flying / Cruising / Crawling** (vertically stacked, distinct colors, optional, prompt prominence varies by block type)
- Auto-logging on block completion
- Vacation mode (decay continues during vacation; only goal target dates affected)

### Acquisition stage detection
Replaces user-declared "acquisition mode." System infers `acquisition_stage` from behavioral signals:
- `new` → `acquiring` → `acquired` → `consolidated` → `mastered`
- Acquisition-density spacing (within-day touches preferred; consecutive-day fallback)
- Auto-advancement based on engagement frequency, performance signals, mastery threshold

### Centralized prompt orchestration
- All proactive prompts route through `prompts` table
- 3/day soft cap, tier-prioritized (high / medium / low)
- Zero prompts during active session blocks
- Settings transparency with category-level mute toggles
- Phase 1 plumbs the layer; Phase 7 fires most prompt types

### Phasing
8 phases. **Phase 1 (foundation) is the next build:** data model + sync + single-target Goals + onboarding + day profiles + Practice Sessions placeholder + manual logging + vacation mode + prompt orchestration plumbing. See PRACTICE_SESSIONS_DESIGN_3.md "Phase 1 Build Spec" for paste-ready details.

---

## Data architecture

### Local: Dexie (IndexedDB)
- Database name: `musical-journey`
- 32 tables covering all app state (will grow with Practice Sessions/Goals tables — adds `practiceSessions`, `practiceBlocks`, `goals`, `dayProfiles`, `vacationPeriods`, `proficiencyDefinitions`, `spacingState`, `prompts`)
- Offline-first

### Cloud: Supabase (Postgres)
- Project URL: `https://imdhowdewidghcgdpdep.supabase.co`
- All Dexie tables mirror to Postgres with Row Level Security
- Auth via email + password (email confirmation disabled)
- Every table has `user_id`, `created_at`, `updated_at`, often `last_engaged_at`

### Sync layer
- Writes push to cloud on every local mutation (via syncedWrite wrapper)
- Manual "refresh from cloud" button in Settings → Account
- Automatic pull on tab focus (replace-mode: cloud is source of truth)
- Offline queue, drains on reconnect
- Conflict resolution: last-write-wins via `updated_at` timestamp
- Phase A scope: syncs everything except high-velocity counter tables
- Seeders defer until SyncContext phase === 'ready' (April 2026 fix)
- Console-callable `window.__backfillUnsyncedRows()` for recovery

### Deployment
- Code hosted on GitHub: `sa-creations175/musical-journey-app`
- Auto-deploy via Vercel on push to `main`
- Env vars in Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Production URL: `musical-journey-app.vercel.app`

### Key implementation learnings
- Dexie 4 patches Promise scheduling — use `setTimeout(fn, 0)` in sync hooks, NOT `queueMicrotask()`
- Tab-focus listeners must attach unconditionally on SyncProvider mount, NOT gated behind phase checks
- Pull lock uses reference counter (not boolean) for concurrent pulls
- Row Level Security must be enabled with explicit policies per table
- **Seeders must defer until sync is ready** — otherwise they write to local Dexie before sync registration, leaving cloud empty (April 2026 lesson)
- **Direct .clear() on Dexie skips deleting hooks** — use bulkDelete([ids]) for sync-aware deletion
- **Audit before fixing UI layout regressions** — tuning passes can reveal that the math was always wrong, not that the new code introduced a bug
- **Empty catch blocks in audio dispatchers make bugs invisible** — always log on catch (April 2026)

---

## Song Repertoire

**Route:** `/repertoire`

**Three views:** Active Repertoire, Song Detail, Want to Learn.

**Architecture:**
- Functional notation canonical
- Beat-based chord placement
- Syllable-level beat splitting
- Multiple chord arrangements per phrase line
- "My associations" field with "Save to Harmonic Diary" link

**Stage framework:** Learning → Comfortable → Internalized → Cross-key → Maintenance

This vocabulary is **canonical across the app** (April 2026 principle). Goals, Dashboard, Skills Catalogue, and Practice Sessions all use the same proficiency levels with the same definitions. See `proficiencyDefinitions` table in PRACTICE_SESSIONS_DESIGN.md.

**Pre-populated songs:** O Come All Ye Faithful, Alpha & Omega, Mirror, Hold On, A Couple Minutes, Can You Feel the Love Tonight, No Weapon.

**Delete functionality (April 2026):** "Danger zone" at bottom of song detail view; two-step confirmation modal; cascading delete across songs, songSections, songChords, songPracticeLog, songCrossKeyProgress, skillAnnotations (for the song's skillId), and harmonicDiaryEntries (for the song's skillId). Want-to-Learn entries use a separate inline undo-toast delete pattern (acceptable for v1).

---

## Shapes & Patterns

**Route:** `/shapes-and-patterns`

**Four activity areas:**
1. Scale Drills (12 major + 12 minor × ascending/descending/both)
2. Chord Shape Drills (29 qualities × 12 keys, fully populated)
3. Voice-Leading Drills (ABA 251, BAB 251, 1-7-3-6-2-5-1 × 12 keys = 36 skills)
4. Mental Visualization Drills (50+ prompts each for Mental Transposition and Chord Shape Visualization)

Global Metronome in app header.

**Heat grid:** base color (time), saturation (freshness), corner indicator (completeness).

---

## Dashboard

**Route:** `/dashboard` (default landing)

**Sections:**
1. Warm opening (greeting, quote, today's summary)
2. Musician Balance radar (5 dimensions)
3. Today's practice
4. Recent wins
5. What's Calling Your Attention
6. Creative Genius (Just Play / Just Produce + Harmonic Diary link)
7. Modules at a Glance
8. Quick actions

Future addition (Practice Sessions Phase 7+): active goals widget, today's day plan status.

---

## Skills Catalogue

**Primary access:** Dashboard dropdown sub-item.

**Hierarchical sub-categorization per module:**
- Intervals: Ascending / Descending
- Chord Recognition: Foundational triads / Seventh chords / Dominant variants / Extensions & colors
- Chord Progressions: Key Detection / Chord Motion / Full Progression
- Scales & Modes: Modes / Minor Scale Variants
- Harmonic Fluency: 12 flashcard categories
- Shapes & Patterns: 4 activity areas
- Song Repertoire: flat list
- Production: 6 paths (lessons tracked as skills; glossary terms are NOT individual skills)

**Skill detail view:**
- Claude's starter description (editable)
- My association (separate editable field)
- Pencil icon inline with text
- Tag dropdown with type-ahead + suggested tags + create-new

Future (Practice Sessions Phase 2): per-item due dates surfaced via spacing state and acquisition stage badge.

---

## Production module

**Route:** `/production`

**Module name:** "Production" (renamed from "Production & Logic Pro" for nav space)

**Module description:** "Production is the craft of making music you feel — beats that hit, arrangements that breathe, vocals that connect, and sonic experiences that pull people in."

### Six paths (all built)

**Path 1: Workflow Foundations** (8 lessons)
**Path 2: The Language of Production** (8 lessons)
**Path 3: Vocal Production** (8 lessons)
**Path 4: Genre Productions** (22 lessons = 11 two-session arcs):
1. 6/8 Church Beat / Gospel Freestyle
2. 90s/00s Gospel Choir
3. 90s R&B Ballad
4. 2000s R&B
5. Lo-fi / Atmospheric Indie Style
6. Modern Minimal R&B
7. 80s Pop Ballads
8. Modern Thoughtful Hip-Hop
9. Classic Dance R&B
10. 70s Soul/Funk Grooves
11. Neo-Soul

**Path 5: Arrangement & Song Structure** (5 lessons)
**Path 6: The Business of Music** (5 lessons, including AI era)

**Memory type tagging:** Production lessons are tagged as **integration** (not declarative) — they combine concepts with applied production work.

### Lesson architecture
- Title + one-sentence goal
- Surface layer (3-6 min) with Try Now exercise
- Deep dive layer (expandable, 15-30 min)
- YouTube link
- Glossary terms linked inline
- "Got it" / "Need more" tracking
- Practice history

### Glossary infrastructure
- 150-200 terms
- Plain-language definition + example + why-it-matters + "Got it" state
- Individual terms are NOT individual skills in Skills Catalogue
- Future: convert to "Production Vocabulary" flashcard deck

### Reference Track Library
- User-curated per user
- Two entry modes: "+ Add Track" (manual) and "+ Browse Track Suggestions" (genre-pool curator flow)
- Browse Suggestions provides 15-25 artist-level exploration prompts per genre
- No auto-assignment of tracks to lessons
- Each track: title, artist, producer, genre tag, "what to listen for" notes, Spotify search link, YouTube "how to produce like [artist]" search link, tags
- Claude-generated content uses guided listening voice, never fake technical analysis
- Future: "Producers Worth Exploring" view

---

## Just Play / Just Produce

**Global header feature** for creative time tracking with smart prompts.

**Two modes:** Just Play / Just Produce.

**Smart prompts pull from:** recent Chord Motion, Chord Progressions, Scales & Modes, Song Repertoire activity, Harmonic Diary associations, completed Production lessons, user's taste.

**Excluded sources:** Mental Visualization drills, most flashcard categories.

**Logging:** countdown timer (default 10 min), mode, prompt used, notes, timestamp. Minimum 2 min for real session.

**Memory type tagging:** Just Play and Just Produce are tagged as **expression** — recency-driven, no correctness, surface when stale.

---

## Cloud sync status (COMPLETE)

**Working:**
- Writes push to Supabase reliably
- Manual "refresh from cloud" pulls latest
- Automatic pull on tab focus (replace-mode)
- Multi-device verified: computer ↔ phone sync confirmed
- Row Level Security on all tables
- Offline queue with replace-mode pull on reconnect
- Seeders defer until sync ready (April 2026 fix — was a real bug, all 3 seeders patched)
- Backfill utility available via console for recovery

**Known polish items (not blocking):**
- Session expiration causes surprise logouts — should silently refresh token (P4)
- UI re-render timing after auto-pull (P4)
- Settings UI for backfill utility instead of console (P3)

**Build sequence learning (captured for future apps):**
- Phased cloud sync builds are safer than single-shot architectural builds
- When touching entire data model, break into phases with testing between
- Seeders that pre-existed the sync layer need explicit retrofits when sync is added — not just code-runs-in-the-right-order, but lifecycle-aware-of-sync-readiness

---

## Cross-module integration

- Skills Catalogue = single source of truth, feeds Dashboard
- All modules write to `attempts` and `dailySummaries`
- Song Repertoire → `songPracticeLog`
- Shapes & Patterns drills → `drillSessions`
- Creative time → `creativeSessions`
- Production lessons → `productionLessons`
- Export/import captures everything in one JSON
- Modal Interchange tag threads across modules
- Cross-module references offered, not assumed
- Harmonic Diary feeds from any module's associations
- Shared freshness system across time-based modules
- Reference Track Library feeds Production lessons AND Just Produce prompts
- All data designed for eventual meta-dashboard queries
- Shared audio primitive (`musicalPlayback.ts`) used by diary, intervals, chord arpeggios, and modes (April 2026 architecture)
- **Practice Sessions Phase 1+:** Goals reference items across all modules; Practice Sessions writes back per-item engagement; spacing state tracks every item across modules; centralized `prompts` table orchestrates all proactive nudges

---

## Pedagogical insights (cumulative)

- Degree-relationship fluency gap (not key-dependency) — user's foundational gap
- Modal recognition requires immersion
- Mode knowledge is a network, not isolated
- Chord motion feedback needs spatial, quality, emotional info
- Practice reps vs assessment — "Challenge yourself" mode
- Songs are the integration layer
- Physical practice builds mental models, not just muscle memory
- Time is the most honest practice metric
- Not all skills need equal mastery depth
- Production requires three layers: workflow, audio literacy, genre-specific skill
- Glossary infrastructure prevents learning gaps
- Session energy management matters (two-session arcs)
- Creative time is practice, structured differently
- Reference tracks are listening material, not production blueprints
- **Diary playback is contemplative, not pedagogical** (April 2026) — the diary captures *feeling*, so its audio defaults differ from drill modules: slower tempo, warmer register, notes ringing into each other, controllable direction
- **Multi-chord audio entries need explicit dispatcher branches** (April 2026) — silent fall-through with empty catch blocks made bugs invisible for a long time
- **Memory types matter for spacing** (April 2026) — different kinds of musical knowledge consolidate differently. Declarative items can be spaced quickly with expanding intervals; procedural items need acquisition density before spacing kicks in; integration items (songs) need longer minimum block durations; expression (creative play) is recency-driven, not performance-driven.
- **Acquisition stage matters more than user declaration** (NEW — April 25, 2026) — the system can detect when an item is in active acquisition based on engagement signals. User declarations of "I'm acquiring this" are unnecessary friction. The behavior IS the signal.
- **Modes (focus/acquisition) are redundant with well-designed goals + spacing state** (NEW — April 25, 2026) — early Practice Sessions designs included user-declared multi-week modes. The design review revealed that goals (with target dates and tied items) plus spacing state (with auto-detected acquisition stage) cover the same ground without duplicate user-declared state.

---

## Roadmap ideas (future)

### Practice Sessions + Goals layer (Phase 1 next)
See PRACTICE_SESSIONS_DESIGN_3.md for full architecture and Phase 1 build spec.

### Meta-dashboard integration
- Read-only queries across all personal-OS apps
- Cross-domain correlations
- Unified radar view across domains
- Weekly narrative summaries

### Audio architecture v2
- Source-module consistency pass (where pedagogically appropriate)
- Diary playback controls — transposition (per-entry or global), global tempo/register settings
- Sustained-chord rendering in long-duration blocked progressions (the "blues feels dead" issue)
- Stylistic arpeggiation patterns (deferred — genre-specific would require app to make stylistic choices)
- Real per-mode playback (currently all modes sound like C major)
- Visual feedback / isPlaying state on diary play buttons

### Production module v2+
- Production Vocabulary flashcard deck (next build)
- Bidirectional notes: flashcard notes ↔ glossary user notes
- Producers Worth Exploring view
- Extended genre library
- Mixing and mastering deep paths
- Professional delivery (stems, DDP, metadata)
- Collaboration workflows

### Shapes & Patterns enhancements
- User-declared legacy mastery
- Smart freshness decay
- Additional scales
- Fingering overlays
- Extended chord voicings

### Harmonic Fluency
- Cross-category weakness challenges
- User-created flashcards
- Audio-enabled cards

### Chord Progressions
- Modulation challenges
- Inversion-only drill mode

### Scales & Modes
- Keyboard construction mode
- Modal improvisation
- Play-along vamps

### Song Repertoire v2+
- Chord-level semantic connections
- Multi-voicing tracking per chord
- Audio recording of practice sessions
- Destructive-red flow for Want to Learn deletes (currently inline undo-toast)

### Harmonic Diary
- Dynamic emotion-based color theming
- Moodboard view vs list view distinction
- Mobile single-column wider-card layout
- Octave-on-top for ascending mode/scale playback
- Title convention audit (numeric notation, not prose)
- Add harmonic interval entries as deliberate learning surface (currently future-proofed but no entries seeded)

### Cross-module
- Spotify OAuth for personalized examples
- Embedded audio players
- Year-at-a-glance practice heatmap
- YouTube video linking and saving across modules

### Just Play / Just Produce
- Voice memo integration
- Quick-export of creative session notes

### Cloud sync polish
- Silent session refresh
- Auto-pull UI re-render
- Multi-tab conflict handling
- Settings UI for backfill utility

---

## How to use this document

**Starting a session:** paste this + `WORKING_WITH_CLAUDE.md` + `PERSONAL_OS_DESIGN_PRINCIPLES.md` at start of any new Claude conversation. For Practice Sessions / Goals work, also paste `PRACTICE_SESSIONS_DESIGN.md`.

**Ending a session:** ask Claude to summarize decisions made, ready to paste into this file.

**When Claude Code builds:** reference this to ensure builds match designs.

**Cross-device continuity:** save to iCloud/Google Drive. Paste at start of any session on any device.

**When considering a new feature:** cross-check against principles here AND `PERSONAL_OS_DESIGN_PRINCIPLES.md`. Ensure new data structures are meta-dashboard-ready.
