# Build queue

Last updated 24 August 2026.

## Active
- **Song page 3d-6** — the rating step and the six-item activity vocabulary.
  In progress.

## Song page, queued behind 3d-6
- 3d-7 — test mode in the cell panel. Test is currently greyed out.
- 3d-8 — retire PracticeLogModal and "+ log a practice session".
- 3d-9 — the practice calendar, matching ShapesAndPatternsCalendar.
- 3d-10 — "due" surfaced in the songs list and on the dashboard.
- The ⓘ status walkthrough. Designed, in the spec, never built. Must derive
  from the same functions the matrix reads — never a prose copy of the rules.
- A due column on the dashboard across every module, sortable most-due first.
- A cross-module spacing settings surface.

## Harmonic fluency
- Ear theory: unison merge (option a, chosen 24 Aug) and the starved direction
  selector. Prompt written, never sent.
- Keyboard answer mode Part 1 — build status unknown, needs confirming.
- Tritone flat subjects, ttb-1..ttb-5 (G♭ D♭ A♭ E♭ B♭). Waiting on the keyboard.
- The 10 hand-written C-only cards: functional harmony's ii-V-I family, modes'
  "mode of C major starting on X", slash chords' degree notation.
- Partial coverage: reverse key pivots 9/12, intervals 7/12 start notes,
  progressions 6/12, key signatures' parallel-minor shape 4/12.
- Ear theory anchor editing — user-addable song references, per direction.
  Open question: does a user's own anchor sit above or below the built-in?
- Chord playback on reveal, blocked and broken, wherever a chord appears.
  Audit prompt written, not sent. Playback must derive from structured pitches,
  never from parsing the answer string.
- Key-signature explanation strings.
- Manual log (+correct / +attempt) — keep or cut. Undecided.

## Bugs
- An explicit toggle must outrank an inferred state. With the keyboard toggle
  on, the streak fade still hides the visuals. The control says one thing and
  the app does another.
- chordRecognitionRoute.test.tsx — "opens on the whole catalog with no param",
  expected +0 to be 30. Flaked 23 Aug and again 24 Aug. Same test, same
  assertion. Second sighting, not noise.

## Recently shipped — 24 August
Generated-card id stability fixture · pentatonic scales 7 → 41 cards · Lydian
chord footer · shared progress bar component · five tracker migrations across
thirteen call sites.
