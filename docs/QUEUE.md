# Build queue

Last updated 24 August 2026.

## How to read this

**Every entry is verified against the repo** — the working tree and the git
log — not against a handoff or a memory of a plan.

An entry is one of three things:

- **shipped**, with the commit hash that shipped it
- **unbuilt**, with the named missing piece
- **partial**, with exactly which half exists

**An item with neither a hash nor a named missing piece is unverified and must
be checked before it is acted on.** The previous version of this file listed
five shipped steps as queued work, because it was written from an out-of-date
handoff. A queue that lies about what is built is worse than no queue: it sends
you rebuilding things that already exist, and in this case would have deleted a
retirement that had already happened.

---

## Song page

**Shipped.**

- 3d-6 — the rating step and the six-item activity vocabulary. `93a5324`
  (field + vocabulary + timer pause) and `4a84872` (the step itself).
- 3d-7 — test mode in the cell panel, at the cell grain. `e5e6543`
- 3d-8 — `PracticeLogModal`, "+ log a practice session" and
  `CellInteractionModal` all deleted. `2e0d6d0`. Both files are gone from disk;
  session notes came back as a collapsed line in the rating step.
- 3d-9 — the practice calendar at `/repertoire/calendar?songId=…`. `f00e551`
- 3d-10 — "due" in the songs list, a song-page banner, and an `N due` pill on
  the dashboard's repertoire row. `6e4a08e`

**Unbuilt.**

- **The ⓘ status walkthrough.** `SongDetailView` renders `SectionGuidance` for
  `matrix` and `leadSheet` only, and `songPageGuidance.ts` defines exactly
  three keys — `leadSheet`, `matrix`, `practiceHistory`. There is no ⓘ beside
  the derived status badge and no walkthrough content anywhere. Must derive
  from the same functions the matrix reads — `ladderCriteria`, `KEY_QUADRANTS`,
  `intervalSequence`, `keyDueState` — never a prose copy of the rules.

**Partial.**

- **A due column across every module, sortable most-due first.** The DUE
  FILTER exists and is cross-module: `dueRefsFrom` builds the set in
  `read/load.ts`, and `FilterSpec` has a `due` match that reads it. The SORTABLE
  COLUMN does not — `SortField` is `'natural' | 'accuracy' | 'coverage' |
  'recency'`, with no `due`. So you can filter to due rows today; you cannot
  sort by how overdue they are.
- **A cross-module spacing settings surface.** `SpacingSettingsSection` exists
  and is mounted in `SettingsPanel`, with the live sequence preview. It is
  REPERTOIRE-ONLY — it reads and writes `SongKeySpacingSettings` and the four
  `songKey*` prefs. No other module's intervals are editable or visible.

---

## Harmonic fluency

**Shipped.**

- Generated-card id stability fixture — 199 cards pinned as `id|question`, so a
  mid-list insertion that renumbers is caught. `4e34a8a`
- Pentatonic scales, 7 → 41 cards. Two shapes to twelve keys each plus a new
  major shape; A♭ major pentatonic now exists. `5c2e4ca`
- The Lydian chord footer — maj7♯11 in four quadrants, spelled by interval via
  `reading/pitch.ts`. `22db2e6`
- Keyboard answer mode **Part 1, the component only**. `ba98ac2`
  `AnswerKeyboard.tsx` and `lib/answerKeyboard.ts` exist and are tested.
- Ear theory **anchor editing**. Already built: `AnchorRow` in
  `intervals/FluencyTracker.tsx` edits a custom anchor PER DIRECTION and writes
  `ascAnchorCustom` / `descAnchorCustom` to `db.intervals`. The open question —
  whether a user's own anchor sits above or below the built-in — is a design
  question about an existing feature, not unbuilt work.
- Chord playback on reveal, **in chord recognition only**: `playChordBlocked`
  and `playChordBroken` are wired in `ChordRecognitionQuiz`.

**Unbuilt.**

- **Keyboard answer mode Part 2 — the wiring.** The component has no consumer:
  nothing in `src/` imports `AnswerKeyboard` except its own tests. Two things
  are missing. `renderFooter` is `(card, { answered }) => ReactNode` with no
  submit path, and `handleAnswer` is private to `FlashcardSession`. And the
  answer comparison at `FlashcardSession.tsx:253` is `choice === card.correctAnswer`
  — raw string identity — so a pressed key must be converted to the card's
  spelling before it can be judged.
- **Ear theory unison merge.** `seed.ts:9` still carries
  `descAnchorDefault: 'Same note, step down'`, and `IntervalsQuiz` still loops
  `allDirs = ['asc', 'desc']` for every interval including P1. Option (a) —
  merge the 4 descending attempts into the single record — was chosen 24 Aug
  and is not applied.
- **The starved direction selector.** `buildCandidates` sets
  `baseWeight: TIER_WEIGHT[tier]` and nothing else. There is no term preferring
  the direction with fewer attempts.
- **Tritone flat subjects, ttb-1..ttb-5.** Zero `ttb-` ids in the catalog. The
  twelve `tt-*` cards are unchanged and every note in the deck — subject,
  answer and decoy — is sharp or natural.
- **The two key-signature explanation strings.** `ks-21` and `ks-22` still
  carry their original text. `ks-21` already has the "Father Charles" mnemonic
  and the first-four/first-two rule; `ks-22` has neither a mnemonic nor the
  BEAD shortcut, and says only "exactly the reverse of sharps".
- **The 10 hand-written C-only cards.** Verified by measurement, not memory:
  functional harmony's ii-V-I family is C only, modes' "mode of C major
  starting on X" is C only, slash chords' degree notation is C only.
- **Chord playback wherever else a chord appears** — harmonic fluency's reveal
  has none. Playback must derive from structured pitches, never from parsing
  the answer string.

- **Category strip at the top of the drill.** Today the current category is
  faint text ("PROGRESSION VOCABULARY") and there is no way to see what else
  exists without leaving the session. Show all categories compactly at the top,
  highlight the one you are in, and allow jumping to another.
  Constraints: ~15 categories, so it must be compact and it must WRAP rather
  than scroll sideways — sideways scrolling was already rejected for the answer
  keyboard. The current category needs to read as distinctly current, not just
  as a label.
  Related to the dashboard-legibility item: seeing what a category holds
  without drilling it to find out.

**Partial coverage, measured 24 August.**

| Shape | Keys present |
|---|---|
| reverse key pivots (answer key) | 9/12 — missing D♭, F♯, B |
| intervals (start note) | 7/12 — A B♭ C D E F G |
| progressions (key) | 6/12 — A B♭ C D F G |
| key signatures, parallel-minor shape | 4/12 — B♭ D F G |

**Undecided, not unbuilt.**

- Manual log (`+correct` / `+attempt`) — keep or cut. It exists:
  `bumpManual` in `intervals/FluencyTracker.tsx`, five references. This is a
  decision about removing a working feature.

---

## Bugs

- **An explicit toggle must outrank an inferred state.** Confirmed in source.
  `FlashcardSession.tsx:419` reads
  `!!renderVisualAid && !isFaded && (visualMode ?? 'text') !== 'text'`, so
  choosing `keyboard` explicitly is still overridden by the category streak
  fade. The control says one thing and the app does another. Not fixed — this
  was a bookkeeping pass.
- **`chordRecognitionRoute.test.tsx`** — "opens on the whole catalog with no
  param", `expected +0 to be 30`. Flaked 23 Aug and again 24 Aug, same test and
  same assertion, both times passing in isolation and on the next full run.
  Second sighting, not noise. The standing hypothesis is shared module-level
  state with a neighbouring test rather than timing.

---

## Recently shipped — 24 August

Generated-card id stability fixture · pentatonic scales 7 → 41 cards · Lydian
chord footer · shared progress bar component (`24ac919`) · five tracker
migrations across thirteen call sites (`445d967` `766982d` `5301f5b` `ff60a8e`
`2fedec6`).
