# Session Summary — May 19–23, 2026
## Musical Journey App

---

## Session Overview

Extended multi-day session completing Phases 4–6 of the practice session prep
flow, building the defer feature, shipping three new content systems (HF
categories, mental visualization chord library, chord progression drill), and
a comprehensive round of session flow polish.

Test count: 2527 → 2662 passing (+135)

---

## Phase 4 — Countdown + Chimes: COMPLETE

### Count-in system
- All blocks get a count-in (keyboard AND non-keyboard)
- Pattern: kick · kick · kick · GO (all-kicks, universally)
- Non-keyboard blocks: fixed 70 BPM, 4/4, no controls shown
- Keyboard blocks: use set BPM and time signature from prep screen
- Pre-pause: COUNTDOWN_PRE_PAUSE_MS = 1500ms before count-in fires
- Tap anywhere to skip

### Audio architecture
- Audio clock anchoring: all beats scheduled from a single t0 anchor on the
  Web Audio clock — fixes timing jitter and dropped first kick
- Two-sound model: kick (80Hz sine, ~50ms decay) + click (1000Hz, ~40ms decay)
- GO chime: distinct resonant ~880Hz triangle tone
- allKick flag: always true across all block types for consistency

### Time signatures
Supported: 4/4 · 3/4 · 6/8 · 12/8 (removed 2/4, 5/4, 7/8)
- 4/4: one count-in bar (kick · click · kick · GO)  
- 3/4, 6/8, 12/8: two count-in bars — establishing bar + countdown bar
- 6/8 BPM convention: quarter note = BPM (interval = 60000/(BPM×2) per eighth)
  This matches Logic, standard online metronomes. NOT dotted quarter.
- 12/8: dotted quarter convention (interval = 60000/(BPM×3) per eighth)

### Groove system
- Grooves are time-signature-aware — 4/4 grooves never play under 3/4
- Per-meter groove memory: switching meters doesn't overwrite saved groove
- New grooves: Basic 3/4, Waltz, Basic 6/8, Jig, Gospel 6/8, Basic 12/8,
  Blues Shuffle
- blockGrouping.ts is the single source of truth for both drag and delete

### Between-cell count-ins
- InSessionDrillRunner (scales): between-cell prep screen shows scale name +
  time + Ready → count-in → drill
- ChordShapeDrillRunner (chord shapes): same pattern

### Metronome wiring
- Metronome auto-starts on GO for keyboard blocks
- Banner pause: forceStop() (freezes metronome AND drill countdown)
- Session end: forceStop()
- StrictMode double-scheduler fixed twice (post-await playing guard +
  generation counter)
- Modal pause and banner pause now behave identically

---

## Phase 5 — Drill Timer + Chimes: COMPLETE

- Drill countdown prominent in banner for all non-scales blocks
- Warning color at ≤3s remaining
- playWarningChime: two soft ~600Hz ticks
- playEndChime: three descending tones (880→660→440Hz)
- BlockRatingOverlay appears at drill timer = 0 (drill visible underneath)
- Rating requires explicit tap — no auto-advance
- Scales untouched (handle their own timer)

---

## Phase 6 — Level 3 Auto-Navigation: COMPLETE

### Modules with direct GO navigation
- HF flashcards: ?session=1 → auto-start, no setup screen
- Production vocab: ?session=1 → auto-start, timer off, all clusters
- Production lessons: quickLaunchRoute → first lesson by title
- ET sub-modules: deep-link already worked, "press play" stays
- Chord shapes: ChordShapeDrillRunner walks all cells (see below)
- Chord progression warm-up: → chord-progression-quiz filtered to that song

### ChordShapeDrillRunner
Mirrors InSessionDrillRunner (scales). Key details:
- resolveChordShapeRunnerItems: async (itemRef → findOrCreateSkill + DrillType)
- DrillSessionModal gets inSession mode: auto-run, no own startSession, 
  countdown seeded from per-item allocation
- Between-cell interstitial: chord name + drill type + allotted time + Ready
- First cell skips interstitial (block prep screen handled it)
- fromRunner flag gates all in-session changes — standalone matrix taps
  are byte-identical

### KEY ARCHITECTURAL DECISION
Level 3 nav for chord shapes uses the runner-over-screen pattern (mounts
over ActiveSessionScreen) — NOT quickLaunchRoute + ?session=1. Same as scales.
This was deliberate to avoid DrillSessionModal timer conflict.

---

## Defer Feature: COMPLETE

- "Defer this block" on prep screen (hidden for warm-ups)
- Banner defer button with ConfirmDialog ("Defer [block]? You can pick it up
  at the end of the session.")
- deferredBlocks: SessionBlock[] on session state
- DeferredReviewPrompt at session end (only if deferredBlocks non-empty):
  "Before you finish — you deferred these:" → Do it now / Skip per block
- "Do it now": launches with full prep screen + count-in, same session record
- Time budget reclaimed when deferred
- Session timer keeps ticking during deferred review
- Skipped deferred blocks recorded as 'skipped' in session record
- Reducer: defer-block, resume-deferred-block, skip-deferred-block, 
  end-deferred-review

---

## Session Flow Polish

### Proposal persistence
All session creation screens survive refresh:
- goals-need → questionnaire → abundance → proposal
- Parallel proposalDraft Dexie table (separate from activeSessionDraft)
- Active session draft takes precedence on restore
- Proposal draft cleared on accept

### Block grouping (blockGrouping.ts — single source of truth)
- ET family: intervals + chord-recognition + chord-progressions + scales-modes
- Viz/memo pair: chord-quiz warm-up + mental-viz (when chord-quiz is orphaned)
- Production family: vocab + lessons (same moduleRef, grouped together)
- Rep warm-up → song chain: unchanged
- Orphan fallback REMOVED (was grabbing unrelated adjacent blocks)
- blockGrouping.ts used by both SessionStack (drag) AND proposalRedistribute
  (delete) — kills the drift that caused the grouping bug

### Label cleanup
- Chord recognition: "4 chord types" (not "4 cards"), no per-type time split
- Intervals: "N intervals"
- HF: "N concepts"
- Production lessons: "Up next: [lesson title] · N more lessons queued"
- ET scales-modes: "scales & modes (ear training)" to distinguish from S&P scales
- Resume modal: shows module + specific content (e.g. "shapes & patterns ·
  C (major) — Root position")

### Other polish
- isKeyboardRequired forwarded through ProposalStartArmedBlock (was dropped,
  causing time sig + metronome to show on non-keyboard blocks)
- Metronome section wrapped in {isKeyboardBlock && …} — now correctly hidden
  for non-keyboard prep screens
- Balanced auto-selected in custom session builder
- 2s → 1.5s pre-pause (COUNTDOWN_PRE_PAUSE_MS)
- "Finish" label on last scale in runner (was disabled)
- Production lessons quickLaunchRoute → /production?lesson=<itemRefs[0]>
- Safe-area padding: max(env(safe-area-inset-top), 3rem) scoped to standalone
  PWA mode — needs physical device re-verification

---

## New Content Systems

### HF — Two New Categories (bd3c74e → 2e4aef9)
Foundational / Math group grows from 12 to 14 categories. HF: 327 → 374 cards.

**Tritone Pairs** (12 items, drilled both directions = 24 SM-2 rows)
6 pairs: C-F#/Gb · C#/Db-G · D-Ab · Eb-A · E-Bb · F-B
Front: "Tritone of X?" → partner + "Aug 4th / dim 5th — 6 semitones"

**Enharmonic Equivalents** (35 items)
Note name pairs (9 pairs, both directions = 18 rows):
Ab=G# · Bb=A# · Db=C# · Eb=D# · Gb=F# · B#=C · Cb=B · E#=F · Fb=E

Interval equivalents (7 groups, with three-way equivalences):
2=9 · b2=b9 · #2=b3=#9 · 4=11 · #4=b5=#11 · 6=13 · b6=#5=b13
Three-way groups show all spellings + context note on reveal.
(##5=6 and bb7=6 deliberately excluded — too theoretical)

### Mental Visualization — 600-Item Chord Library (91c6b24 → 7a0a5b2)
Moved from random generation to per-item SM-2 (procedural/rating).
Distinct moduleRef: 'mental-viz' (doesn't inflate S&P coverage).

**Shared PianoKeyboard component** extracted to src/components (from repertoire).
voicingColors.ts holds interval color map. Used by both lead sheet and mental viz.

**Library:**
- Triads: 6 qualities × 3 inversions × 12 keys = 216 items
- Seventh chords: 6 qualities × 4 inversions × 12 keys = 288 items
- Extended dominants: 96 items
  - dom9(13) A: 1 / 3·13·b7·9 and B: 1 / b7·9·3·13
  - dom7#9#5 (=dom7#9b13) A: 1 / 3·#5·b7·#9 and B: 1 / b7·#9·3·#5
  - dom7b9 four inversions (root in left, dim7 cycling right):
    From 3rd: 1/3·5·b7·b9 | From 5th: 1/5·b7·b9·3 |
    From b7: 1/b7·b9·3·5 | From b9: 1/b9·3·5·b7

Reveal: PianoKeyboard with chord-tone interval coloring (same as lead sheet).
Keyboard wrapping fix: voicingKeyPosition() uses true semitones above root,
not mod-12 — all voicings display ascending left-to-right for any root.
Extended dominants: 4-octave keyboard (octaves prop).
Swipeable voicing carousel: DEFERRED (needs voicing save/library feature first).

### Chord Progression Drill (f9cc646 → e990eb0)
Module: chord-progression-quiz (pre-existing placeholder, weight flipped 0→1.0)
Memory type: procedural (rating)
Data source: lead sheet bar grid (chordPlacements, functionally stored)
Key/bar count derived from song — no new data model needed.
Renderers reused: renderRoman(), renderConcrete() already existed.

**Question types:**
- Type 1 (Pure Recall): show song+section → user recalls → reveal Nashville
  numbers primary + Roman numerals smaller beneath. NO concrete letter names
  (key-agnostic by design). Bar grid colored by scale degree using voicingColors.
  Rate F/C/C.
- Type 2 (Multiple Choice): 4 options as chord numbers. Distractors from OTHER
  songs in repertoire (never plausible variations of the same song).
  Correct/incorrect pre-fills rating (correct→Flying, incorrect→Crawling) with
  user override.
- Type 4 (Bar Count): only for sections with chord data entered.
  Correct/incorrect pre-fills rating with user override.
- Type 5a (Scaffolded Transposition): show song+section+target key, numbers
  shown as context → user recalls concrete chords in that key → reveal letter
  names. Target key rotates through PRACTICE_KEYS (C F G Bb D Eb A) minus
  song's original key.
- Type 5b (Full Transposition, harder): show song+section+target key only, no
  hints → user recalls BOTH numbers AND concrete chords → reveal everything.
- Type 3 (Song Structure): DEFERRED

**SM-2 architecture**: each (section × question type) is an independent spacing
row (itemRef: cpq:<songId>:<sectionId>:<type>). Easier types surface before
harder ones naturally. MC only surfaced when ≥3 distinct distractor lines exist.

**Arrangement selection**: uses mostCompleteArrangementId — the arrangement with
the most charted chords, tie-broken to earliest-created. This prevents the quiz
from pulling from a less-complete arrangement when multiple exist.

**KEY DESIGN PRINCIPLE — Arrangements vs Voicings:**
Arrangements = genuinely different chord choices (reharmonizations, substitutions).
Voicings = different fingerings of the same chord.
The voicing carousel (deferred) eliminates the need to create new arrangements
just to explore different fingerings. Do not create new arrangements for voicing
exploration — wait for the carousel feature.

**Session integration:**
- Standalone (sidebar): all due items, SM-2 order
- Song-filtered (warm-up context): launched with ?session=1&songId=X →
  shows only that song's sections. Distractors still pull from full library.
- The chord-quiz warm-up block (kind:'chord-quiz', isWarmup:true) now sets
  quickLaunchRoute = /ear-training/chord-progression-quiz?session=1&songId=X
- isKeyboardRequired: false on chord-quiz warm-up (it's mental, not keyboard)
- Item label shows song name (not raw songId) on prep screen

---

## Key Architectural Decisions (locked)

1. **blockGrouping.ts as single source of truth** — both drag and delete derive
   from the same groupBlocks function. Never hand-mirror again.

2. **countIn is one-shot** — never owns the continuous metronome. Drill modal
   keeps owning start('drill'). Prevents double-stacking.

3. **ChordShapeDrillRunner uses runner-over-screen pattern** (not quickLaunchRoute)
   because DrillSessionModal owns its own timer and can't safely be deep-linked
   without the runner managing the lifecycle.

4. **mental-viz uses moduleRef 'mental-viz'** (not 'shapes-and-patterns') so SM-2
   rows never count toward keyboard S&P coverage or block generation.

5. **6/8 BPM = quarter note convention** (matches Logic/DAW standard).
   12/8 still uses dotted quarter convention.

6. **StrictMode safety pattern**: any "torn-down" ref guard in a mount effect must
   reset at setup-top, or StrictMode poisons it. Any async "arm the singleton"
   method must re-check the running flag after every await.

---

## Outstanding / Next Session

### Needs physical device verification
- Safe-area padding: CC fixed (3rem floor in standalone PWA mode) but not
  confirmed working on device. Try removing PWA from home screen and re-adding.

### In progress (CC building)
- Chord-quiz warm-up: keyboard controls showing (isKeyboardRequired fix) and
  raw songId label (show song name instead)

### Deferred / Next
- **Voicing carousel in lead sheet chord editor**: when tapping a chord in the
  lead sheet, the piano voicing display should be swipeable — showing different
  voicing options and inversions for that chord. Currently shows one voicing only.
  This is a practice friction point: while working on a song you want to quickly
  browse voicing options without leaving the lead sheet.
- **Voicing save/library feature**: needed for mental viz carousel. Per-chord
  cross-song voicing index. Separate from existing per-ChordPlacement storage.
  Also feeds the lead sheet voicing carousel above.
- **Phase 7**: Voice prompts (toggleable, scripted for block intro/rating)
- **Phase 8**: Session end timing summary (three-timer breakdown)
- **Phase 9**: Matrix progress review after session
- **Advanced Harmonic Learning design doc**: tritone substitution, hybrid chords,
  inversion ear training in context. Multi-module, needs its own doc.
- **End-of-period goal reviews design doc**
- **Chord Progression Type 3** (song structure recall): deferred by design
- **Multiple YouTube/reference video links per song**: queued build item

### devWipe.ts + Goals.tsx import
Still uncommitted — local dev tools only, must never commit.

---

## Design Docs Produced This Session
- CHORD_PROGRESSION_DRILL_DESIGN.md
- MENTAL_VISUALIZATION_CHORD_LIBRARY_DESIGN.md
- HF_NEW_CATEGORIES_DESIGN.md

---

## Starter Prompts

### Claude Chat — next session
```
Continue Musical Journey App. Read SESSION_SUMMARY_2026_05_19_23.md.

2662 tests passing. Phases 4–6 complete. New content: HF Tritone/Enharmonic
categories, 600-item mental viz chord library, chord progression drill.

Key outstanding items:
1. Safe-area padding: needs physical device re-test (remove/re-add PWA)
2. Voicing save/library feature: needed for mental viz carousel
3. Phase 7 voice prompts design
4. Advanced Harmonic Learning design doc

Key architectural decisions to remember:
- blockGrouping.ts is single source of truth for drag + delete grouping
- countIn is one-shot (never owns continuous metronome)
- ChordShapeDrillRunner uses runner-over-screen (not quickLaunchRoute)
- mental-viz moduleRef is 'mental-viz' not 'shapes-and-patterns'
- 6/8 BPM = quarter note convention (not dotted quarter)
- StrictMode: torn-down ref guards must reset at setup-top
```

### Claude Code — next session
```
Continue Musical Journey App. Read SESSION_SUMMARY_2026_05_19_23.md.

2674 tests passing. devWipe.ts + Goals.tsx import uncommitted (keep out).

Most recent work: chord progression quiz fully built with 5 question types
(Types 1, 2, 4, 5a, 5b). See SESSION_SUMMARY for architecture.

npm run build before every commit.
```
