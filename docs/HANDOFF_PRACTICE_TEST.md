# Handoff — the Practice/Test build

Written 27 August 2026, at the end of a long session. You have no memory of that
session. This file is the whole of what you need.

Read `docs/practice-test-prototype_16.html` and `docs/practice-and-test-spec_2.html`
before touching anything. **The prototype is the authority on flow and wording.**
Where it and the spec disagree, the prototype wins and you tell Silas.

---

## The sequence

Five commits. Three have landed.

| | | |
|---|---|---|
| 1 | `40001f5` | The shell, on chord shapes. **Landed.** |
| 2 | `4529f7e` | Test mode, the ratings, the band rule. **Landed.** |
| 3 | `bda5229` | Scales and voice-leading on the same shell. **Landed.** |
| 4 | — | **Songs. BLOCKED — see below.** |
| 5 | — | The cell's practice log. Not started. |

Supporting commits, in order:

- `f41c8a4` retired the arpeggiated style dimension
- `81970cb` stopped deriving drill length from the block budget
- `c7e2d7e` renamed the style values and cleared the residue

### What each landed commit did

**`40001f5` — the shell.** A chord-grid square opens a session, not a drill:
choose → session → setup → drilling. Session clock counts up and **never pauses**.
Test rendered but unwired. Nothing persisted.

**`4529f7e` — ratings and Test.** The rating step in both modes, Test wired end to
end, and the band rule in the shared reader. `DrillSession.feelRating` became
optional. The 30-second floor moved from the session to the run.

**`bda5229` — the other two surfaces.** The shell's contract changed from
"a skill and a drill type" to "an item plus a way to write a rep" —
`DrillSurface` in `practiceTest/surfaces.ts`, one writer per surface in
`makeSurfaces.ts`. Scales and voice-leading wired.

---

## The decisions, and why

These are the things a fresh session could quietly reverse by not knowing the
reasoning. Do not undo any of them without asking.

### The band rule

Four states, in the order they are decided:

- **never tested** — practice reps set the band, **capped at Developing**
- **once tested** — the last three TEST reps set it; practice can neither raise
  it nor drag it down
- **past due** — the same band, marked stale. No decay: a band is never lowered
  by time
- **tested again** — the newer three replace it, up or down

Lives in `lib/spacing/banding.ts`, in the **shared reader**, general to every
self-rated module. Not a shapes-only wrapper — a second banding rule is how two
numbers start disagreeing.

**Why practice is filtered out rather than outranked.** If the two shared a
three-slot window, three practice reps after a passed test would push the test
out of it and demote a Fluent shape for the crime of being practised. Filtering
to test reps means the question of how to weigh one against the other is never
asked.

### Legacy entries are never capped

`PerformanceEntry.fromTest` is `true` for a test rep, `false` for practice, and
**absent for anything written before the modes existed.**

Absent means legacy and is **never capped**. Reading absent as "practice" would
drop every self-rated card in the database — shapes, mental visualisation, the
chord-progression quiz, repertoire — from Fluent or Mastered to Developing on
the day it shipped, with nothing on screen to explain it.

The ceiling therefore asks **"is anything in this window unknowable?"**, not
"is everything here practice". An abandoned test leaves one or two test reps
behind — not enough to set a band, so the reader falls through to the practice
path — and the second phrasing would have lifted the ceiling on them. Two reps
of a test nobody finished would have reached Fluent. A test caught it.

### Staleness counts from the last test

`lastTestAt` in `lib/spacing/row.ts` derives it from the history. Not from the
last engagement.

Otherwise a shape could be practised forever, resetting its schedule each time,
and sit there claiming Fluent while never being re-proved. Practice moves when
the shape comes back around; only a test clears the stale marker.

The stale **marker** is not drawn yet. The date is right from the first write so
nothing needs re-migrating when it is.

### Style is blocked or broken, and only chord shapes have one

The values were `solid` / `arpeggiated`. Neither word appears in the app now.
The **label is Style, not Manner** — the prototype still says Manner in one
place and this deliberately does not follow it.

`DrillSession.style` is **optional**, and absent on every scale, voice-leading
and mental-visualisation row. A scale is a single line — nothing to block,
nothing to break. Those rows were written `solid` because the field was
required, not because it was true of them.

`DrillSessionModal` writes **no style at all**: it never asks how you are
playing, it walks the hands. An absent style says "nobody asked"; a `blocked`
would claim something the reader never said.

The style **describes a drill, not a skill**. It rides onto the session row for
the practice log and forks nothing. One square, one rating, whichever way you
played it.

### The arpeggiated dimension is retired

`style` was part of a spacing row's identity via `[moduleRef+itemRef+hand+style]`.
It is not any more — Dexie **v39** drops the four-part index, **v40** clears the
residue. Practice can be broken or blocked, a test is always blocked, and
proficiency comes only from testing.

Consequences already applied: `InversionBreakdownPanel` stopped taking the lower
of two rows; `HeatGrid` and `MatrixSnapshot` draw three bands not six;
`acquisition.ts` reads a hand from its one row; `ThreeBandCell`'s split mode was
deleted; the time budget came down from six passes to three in all five places
via `STYLES_PER_CHORD_SHAPE_ITEM`, kept as a named `1` so the change is visible
at every call site.

### A drill is as long as it is set to be

`lib/spacing/drillSettings.ts` is the one place: 60-second default, 30-second
floor, and the offered lengths. Both belong in the spacing settings tree per
skill and are not there yet. **Do not reintroduce a derived length.**

Nobody chose 120 seconds — it fell out of dividing a block's budget by the pass
count, so a drill's length was a side effect of the arithmetic above it.

**Known and deliberate:** the block's budget and the drill length now disagree.
`shapesSplit` and `prepItemBreakdown` book 3 × 90 s per chord cell while its
drills run 60 s each, so a block finishes about a third early. They agreed
before only *because* the length was derived. Reconciling them belongs to the
parked remodel.

### The shell contract

A surface is **an item plus a way to write a rep**. `DrillSurface` carries the
labels, the rate and a `write`; the panel knows nothing else.

**What a surface may differ on is that interface and nothing else.** The absence
of a field is the check — anything a surface wants that is not on it is drift.

Scales invert the rate arithmetic: `bpm × per` (notes per beat, bigger is
faster, target 240) against `bpm ÷ per` everywhere else. The sum lives on the
surface because it is a different sum, not the same one backwards.

Scales are **one hand per session**: a hand is a skill with its own band, so
All Three opens three sessions in turn.

### The hints

Every label in the prototype carries a hint except `Pick A Skill`, whose hint
was deleted for being a fragment.

**Build the hints the prototype carries. Invent none.** If a screen needs one to
make sense, say so and let Silas write it.

### The song answers (decided, not yet built)

1. A song section is rated on the same four words, the same lowest-of-three,
   through the **same shared reader**. Not a parallel scale.
2. The old per-cell states **retire outright**, not converted. They held their
   own values, two of which were "learning" and "comfortable" — the same words
   saying one thing about a section and something else about a song.
3. `wasClean` is **derived**, `feel >= 3`. No separate Clean-or-Not-Clean
   question, nothing stored twice.
4. **Ladder input:** a section counts as comfortable for the song ladder when
   its rating is **Fluent or better**. The old gate was three clean runs at
   tempo, which is a test, and Fluent is what a test produces.
5. The song's own ladder — Learning, Comfortable, Cross-key, Internalized — is
   **untouched**. It describes a whole song, it is a claim rather than a
   proficiency rating, and a section being Mastered still does not make the song
   Comfortable. **Do not fold the two together.**
6. `Mark Comfortable` disappears with the state it wrote. Three rated test runs
   produce a band on their own. The whole-song test keeps its own **Mark Solid**,
   untouched.
7. The passed whole-song test's timestamp is **left alone**. If wiping the cell
   states makes the key recompute downward, that is expected — but nothing goes
   out of its way to erase that record.
8. Nothing seeded above Developing. No legacy bands, no synthetic reps.

---

## COMMIT 4 IS BLOCKED. Read this before doing anything with songs.

**The seeding count has been wrong three times. Do not write the migration.**

The seeding rule: a section starts at **Developing** when the lead sheet has
that section built out **and** it is the song's original key. **Not Started**
everywhere else — every other key, and any section not on the sheet.

Silas builds lead sheets in the number system, so a sheet covers a song in every
key on paper, but his hands have only played the original key. Developing is the
honest ceiling for work that happened without a test, and it belongs only where
the playing happened.

### Where the chord data actually is

- Chords live in `songSections[].phrases[].chordsByArrangement`, which is
  `Record<arrangementId, Record<beatId, ChordFunction>>`.
- **`songChords` has 0 rows in the entire database. That table is not in use.**
  It is dropped as a definition — do not count it.
- `Phrase.chords` is a deprecated pre-beat whole-line chord **string**, migrated
  into `chordsByArrangement.basic` *at render time*, so it may never have been
  persisted. It is not an array.

### The three failed counts, so nobody repeats them

1. Tested `p.chords` as an array and `p.tokens[].chord`. **Neither exists
   anywhere in the library** — so two "definitions" agreed at zero by failing
   identically.
2. Counted `songChords` rows. Zero rows, so it could never have found anything.
3. Read `chordsByArrangement` off the type and counted inner beat keys. Found
   **two** songs with chords when there are **five**.

Each time the count was narrowed on what the schema said instead of what the
data does.

### What is unaccounted for

Five songs have chords in their lead sheets. The last count sees two —
**I Want You Around** and **No Weapon**. It cannot see:

- **O Come All Ye Faithful**
- **Can We Talk**
- **Blessed**

Their sections are built on screen and the count reports zero chords placed.

### What was asked for next, and not yet delivered

A **wide, read-only dump of every object store** — row counts for all of them,
and for those three songs by name, enough of every row that mentions them,
across every store, to show where their chord data actually lives. Anything that
looks like a chord, a function number, a quality or a Roman numeral, with the
store it came from.

A draft exists at `/tmp/cc7-find-the-chords.js` (a scratch file, not in the
repo, and it may be gone). **Do not re-derive the shape from types. Go and look
at the data.**

### Other numbers already established for songs

From an earlier read-only check: 12 sections at Comfortable, 3 at Learning, 15
carrying a clean streak, 12 clean runs all at a tempo, one key at Solid, one
whole-song test passed, and **zero repertoire spacing rows**.

Silas's call was to **wipe rather than convert** — twelve run-through rows
cannot defend twelve Comfortable sections, and carrying a number the reader
cannot reproduce is worse than re-earning it.

### The collision commit 4 must handle

`cellState === 'comfortable'` is read in nine places. Three are the ladder
itself and take Fluent-or-better as comfortable: `computeKeyStateFromCells`,
`songLevelState`, `songComfortable`. The other six are display: `sectionChips`,
`cellHeat`, `KeyRow`, `songProgression`, `seededKeyRows`, `keyDiagnostics`.

A song test writes three `recordEngagement` calls at Save under a new itemRef
namespace for a section in a key (`songCell:<cellId>` is the obvious one —
repertoire today writes only the bare `songId` and `songKey:<id>`).
`repertoire` is `integration` memory and accepts rating signals, so no
memory-type change is needed.

---

## Parked, deliberately

### The practice-session remodel

How a generated session chooses what to give you inside a cell — whether a
C major block walks all twelve inversion-and-hand combinations or a subset, and
what style it uses. The practice-session model predates Practice/Test and the
two now overlap. **Do not touch it.** The block-budget mismatch above resolves
here.

### The unscoped retirement commit

Live and unretired, each still reachable from the in-session runners even though
their grids no longer open them:

1. `DrillSessionModal` — three callers: `DrillListModal`, `ChordShapeDrillRunner`,
   `SessionBlock`
2. `ScalesDrillModal` and `VoiceLeadingDrillModal` — same situation
3. `DrillAssessment` — the four rating words now have **two** implementations in
   Shapes, which is a live "one shell, not many" violation
4. `MIN_REP_SECONDS` — one number, two behaviours: a disabled button in the old
   modals, a per-run message in the new panel
5. The `Shapes Practice` global session-timer block — `DrillSessionModal` starts
   one, `PracticeTestPanel` does not, so one appears in the banner and one does
   not
6. `DrillListModal` and the `drillTypes` table — the only route to user-created
   drill types, and `shapesTimeInvested` joins through it for time attribution

Nothing here is decided. It grows every commit and is worth doing after songs.

### Also open

- The **voice-leading description boxes** — another session was building them at
  the time of writing. Two fields under the chord row: a Pattern Description
  scoped to the row across every key, and an `In <Key>` scoped to the one cell.
  The gate answer was: store overrides in a `userPrefs` row, keep defaults in the
  catalog so Reset deletes the override rather than restoring a copy. Note the
  app has almost no defaults to reset to — only `full-voicing` and
  `aba-structure` have a `hint`, and no per-key note exists in `src` at all.
- The **target rate** is a constant per surface in `practiceTest/surfaces.ts`
  (`TARGET_RATES`), headed for the settings tree.
- `catalog.ts:1832` — one prose reference to a deleted file, left alone
  deliberately.

---

## How Silas works

**Never make him copy from the terminal.** Terminal output wraps to his window
width and box-drawing tables mangle on paste.

- Write any report, findings, list or investigation to **`/tmp/cc1.md`** and
  **tell him the `pbcopy` line**. Do not run `pbcopy` yourself unless he asks.
- Plain markdown in the file. No box-drawing characters, no ASCII tables — short
  bulleted lines instead. Do not hard-wrap; his chat client wraps correctly.
- Short answers — a hash, a yes, a one-line status — stay in the terminal.

**Console snippets** go in a file too, and must be **Safari-safe**: wrap every
block in `(async () => { … })();`. Safari rejects top-level `await` in a pasted
statement. Verify with `node --check <file>` before handing it over.

**Numbers before any migration runs.** Every data change tonight was preceded by
a read-only count, and three of them changed the plan. He has said this every
time; do not skip it.

**Do not assume what his data contains.** The arpeggiated check came back empty
and made a migration a code-only change. The song-cell check contradicted his own
belief that no test had ever happened. The chord count has been wrong three
times by trusting the schema over the database.

**Ask before schema changes.** Any change to a stored shape — a table, a field's
type, a field becoming optional — gets raised *before* it is made, not reported
after. Being right is not the point; the decision is his.

**Do not invent UI copy.** Build the labels and hints the prototype carries. If a
screen needs an explanation it does not have, say so and let him write it.

**Walk it before you build it.** No user-facing flow gets built until he has
clicked through a prototype and signed off. See `CLAUDE.md` at the repo root.

**Two sessions share one working tree.** Git has one index per tree, so a commit
from either takes whatever is staged — `6119014` swallowed seventeen files this
way, and `fcae84c` is the empty commit recording it. **Commit with explicit
paths, never `git add -A`.** If you need a file another session might be in, stop
and ask.
