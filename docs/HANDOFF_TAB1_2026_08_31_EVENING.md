# Handoff — Tab 1, evening of 31 Aug 2026

**This continues `docs/HANDOFF_TAB1_2026_08_31.md`, written this
morning by my predecessor.** Read that one first: it covers the panel
becoming a strip, the four ratings becoming one `RatingChips`, a run
being ended before it is rated, the testing session finally logging,
and the five invisible bugs it fixed. None of that is repeated here.

You know the repo. You know nothing about today after that handoff.

---

## 1. The commits

In order. `0635e0c` sits among them and is **Tab 2's**, not mine — it
made the shapes card and the grid read one enumeration.

**`298e934` — a run records its tempo and its sitting**
A drill row now carries what the metronome was sounding at when the run
ended, and which sitting it belonged to. The scales log line reads
`Clean · 1m · 96 bpm · today · session 3m`. A silent run shows no
tempo — not a zero, not the target.

**`08a2ff3` — one press starts a practice drill**
Pressing **Start A Practice Drill** opened a second screen carrying the
metronome and the drill length, which you scrolled to reach a button
also called **Start Drill**. The settings are on the session screen now
and Start starts a run.

**`926ff4b` — the in-session drill pop-up is retired**
The three old drill modals are deleted. A drill started from a session
block, from the in-session runner, or from the chord grid's drill list
opens the same session panel as one started from a grid — so it can be
a **test**, which the pop-ups could not express at all.

**`505c369`, `c650935`** — my predecessor's, listed in the morning
handoff. `505c369` rebuilt the scales page; `c650935` put `fromTest` on
the drill row.

**`2405aa7` — one counting unit**
Totals count the things you sit down and drill, not squares. Scales
288, chord shapes 1944, voice leading 408. Goals, the session
generator's scope, the card and the grid all read the same number.

**`a6f8719` — the card says how long, and when, on two lines**
The per-hand bars are gone. In their place: **Total time 7m — 5m
practice, 2m testing** over **Last practiced 4d ago**.

**`e8823db` — one palette, one source, one fill**
Mastered is a royal blue instead of a second green. Every grid fills
solid; the pale 15% wash is gone. `bands.ts` no longer carries colours.

**`acd6371` — the song ladder shifts, freshness becomes a length**
Learning is amber, Comfortable is the Fluent green, Cross-key is the
same green plus four marks, Internalized is the royal blue. Red leaves
the song ladder. The freshness dot on a song card is a six-sixths bar
in one neutral.

**`ea9caa7` — the chord grid names a status**
A chord cell says one of the six words with a count under it; clicking
it fills Progress Details below rather than opening a modal. **Edit
what counts** takes a target out of the score.

**`a7cdd17` — voice leading gets the same face**
Its cells fill Progress Details too. No roll-up control and no Edit
what counts, because a cell holds one target.

**`f810efc` — Edit what counts can apply to every key**
Taking left-hand second inversion out offers doing the same in all
twelve keys of that quality.

**`64a1267` — one gutter width, and a guard on the palette's tokens**
Every grid reserves the same left column, so the three pages line up.

**`5e01b1c` — five things found by using the grids**
Key names left-justified; the layout control on all three grids
defaulting to keys down the left; no status word hyphenates; clicking a
cell puts Progress Details at the top of the screen; a target row looks
pressable and an untouched one prints nothing instead of em dashes.

---

## 2. The bugs that were invisible from the outside

None of these would be found by looking at the screen and none by
reading the diff that introduced them.

**The Furthest toggle silently resolved to Lowest, on every grid.**
`rollUpTargets` in `lib/spacing/rollup.ts` is Lowest and says so in its
header. Each grid wrote `if (rule === 'furthest') return
verdictForTargets(...)` — the shared reader, i.e. Lowest — and then
hand-rolled a *second* Lowest with a local `rank` table for the other
branch. **Both branches returned the same word.** Nobody had a
`rollUpVerdictsFurthest` to call, so nobody noticed there wasn't one.
Fixed in `ea9caa7`: both rules live in `rollup.ts` and
`verdictForTargets(targets, byRefHand, rule)` takes the rule.

**A run's tempo and sitting were never recorded.** Both values were in
the room — the panel holds the metronome and mints the session id — and
neither reached the row. So Progress Details could show a rating and a
length and nothing that places a run. The temptation was to read the
tempo off the metronome's *current* setting and match the sitting by
timestamp; both are a guess wearing a join, wrong the moment two runs
land in the same second. Fixed in `298e934`, captured at the moment the
run ENDS, not at write time — the dial can move while you are rating.

**The two-step drill screen existed in two places and was reached by
four entry points.** The brief named `SessionBlock`. The same shape was
also in `PracticeTestPanel`'s own practice mode (a `setup` step that
only practice ever saw — a test's settings were already above the
circles), and the old pop-ups were reached by `SessionBlock`, by the
three in-session runners in `ActiveSessionScreen`, and by
`DrillListModal` from the chord grid. Fixed across `08a2ff3` and
`926ff4b`.

**Progress Details had never been able to show chord-shape time, and
could not have.** `handProgress` matched `s.skillId === target.itemRef`.
That is right for scales and voice leading, which stand their itemRef in
for the skill id, and finds **nothing** for a chord shape, whose
`skillId` is a `DrillSkill` row id. Meanwhile the module card summed the
same rows by itemRef *prefix* — two walks, agreeing by luck, and a row
naming a scale outside the catalog landed on the card and in no cell.
Fixed in `a6f8719`: `sessionsByTarget` is one walk keyed by
`${itemRef} ${hand}`, with the chord-shape join done once.

**A shapes coverage goal could read over 100%.** The numerator
(`countCoveredSpacingRows`) counts spacingState **rows**, and a row is
`(itemRef, hand)`. The denominator (`shapesCounts`) multiplied quality ×
key × inversion state and stopped — **no hand axis**. Drill every triad
in every key on all three hands and the numerator was 864 against a
denominator of 288. `tierTotalCells` in `spTiers.ts` had the identical
mismatch, so a tier could unlock on a third of the work. Both fixed in
`2405aa7`.

**The Started fill resolved to nothing, and the code was innocent.**
Reported as a bare cell. The verdict is `{kind:'started'}` from both
roll-up rules, `statusKeyForVerdict` returns `started`, and the rendered
`className` is `bg-started text-neutral-800` — I dumped it from a real
render. The cause was one step further out: **`bg-started` was the one
palette class that did not exist before `e8823db`**, and
`vite.config.ts` sets the PWA to `registerType: 'prompt'`, so the old
service worker kept serving the previous stylesheet. Needs Work rendered
solid because `bg-needswork` had existed for months; Not Started
rendered dashed for the same reason; only the new class was missing.
Clearing the worker fixed it. **Nothing was changed in the render.**

---

## 3. The two near-misses of the same shape

**A Tailwind token named as a string fails no build, no type check and
no test. It resolves to nothing and the element paints bare.**

It happened twice today and the second one I caught before committing:

1. `statusColour.ts` names tokens as strings — `bg-started`,
   `border-started`. Rename or drop one in `tailwind.config.js` and
   every surface reading it paints bare, silently.
2. I wrote the grid cell's width floor as
   `` `min-w-[${GRID_CELL_MIN}]` `` with `GRID_CELL_MIN = '4.75rem'`.
   **Tailwind scans source as text.** That is never the class it looks
   like, the rule is never emitted, and the floor silently does not
   exist. Caught before commit.

Two guards, both in
`src/modules/shapes-and-patterns/__tests__/gridCellPaint.test.tsx`:

- **the config guard** — reads `tailwind.config.js` as raw text and
  asserts every token `statusColour` names is declared there, and that
  the palette names none the config has not got.
- **`GRID_CELL_MIN` is asserted to be the whole class**
  `'min-w-[4.75rem]'`, in
  `__tests__/gridPolish.test.tsx`, so the day someone "tidies" it back
  into a length the test fails instead of the layout.

Rule for whoever is next: **a Tailwind class must appear in source as a
complete literal.** Never interpolate one, and never build one from
parts.

---

## 4. What is built, and what it replaced

**All three S&P grids wear the song matrix's face, with one Progress
Details behind them.** A cell names one of the six status words instead
of being a square shaded by time invested. Clicking one fills the
standing **Progress Details** section under the grid — in the app's dark
green band, scrolled to the top of the screen — instead of opening a
modal. `CellProgressDetails` is that section for all three; what a
surface may differ on is a list of four things (how many targets, a
roll-up or not, Edit what counts or not, a closing note) and nothing
else. `InversionBreakdownPanel`, `HeatGrid` and `DrillListModal` are
deleted.

**One palette, one fill.** `lib/spacing/statusColour.ts` owns the colour
and the named treatments for all six statuses; Tailwind keeps the base
hexes and nothing else names one. Mastered is `#2B4FA8` royal blue —
it and Fluent were mid green and dark green, the hardest pair on a grid.
Started is `#C7DDF5`. Every grid fills **solid**; the 15% wash with
coloured text is gone. The four ratings stay aligned to the statuses on
purpose, so In flow followed Mastered to the blue.

**The song ladder sits one rung above the cell ladder.** Learning is the
Developing amber, Comfortable the Fluent green — because Comfortable in
a key is the same bar a cell clears to read Fluent — Cross-key is the
same green plus **four marks, one per quadrant**, and Internalized is
the royal blue. Red is out of the song ladder entirely.

**Freshness is a length, not a colour.** The song card's dot is a
six-sixths bar in one neutral, off `FRESHNESS_LADDER`.

**Totals count drillable targets.** Scales 288 (96 cells × 3 hands),
chord shapes 1944 (864 triads + 1080 sevenths — `supplementary` left the
score on Silas's ruling), voice leading 408, mental viz 504. `shapesCounts`,
every coverage denominator, `catalogTotalForGoal`, the card and the grid
all come off `sectionTargets` in `cellTargets.ts`.

**Edit what counts, and apply to every key.** A target out of the score
is struck through, labelled **not counted**, leaves the roll-up and the
count (7/12 → 7/9) and is never deleted. Toggling one offers spreading
the same change to that target in every key of its row — a **bulk
action**, twelve exclusions written at once, not a rule.

**`KeyedGrid`** is the one layout control and the one grid renderer, on
all three pages, defaulting to **keys down the left**.

---

## 5. What is not built, and is next

Silas has a prompt ready to paste for all three. Enough here to pick it
up cold:

**The left nav's collapse-all.** `src/components/SidebarNav.tsx` — the
sidebar has expandable module groups and no way to close them all at
once. There are source-scanning tests over that file already
(`components/__tests__/sidebarStructure.test.ts`, `sidebarBox`,
`sidebarLabels`) which read it with `import.meta.glob(..., '?raw')` and
assert on slices between markers; expect to update them. No copy exists
for the control — it will need a label, and that is Silas's to write.

**The Song Repertoire nav item does not reach the module home from a
song detail page.** From inside a song (`SongDetailView`), the sidebar's
Repertoire entry does not navigate back to the repertoire module home.
Start at the nav item's route in `moduleMeta.ts` / `SidebarNav` and at
how `SongDetailView` is routed — the likely shape is that the detail
page is a nested route the nav link resolves to rather than escaping.

**Sorting the cards on a module home by status and by last practiced.**
`components/moduleHome/CategoryCardGrid.tsx` renders the cards;
`CategoryCardModel` (in `moduleHome/model.ts`) carries `fluentPlus`,
`itemCount`, `timeInvested` and `lastPracticedDaysAgo`, so both sorts
are derivable today with no new data. The shapes adapter is
`shapes-and-patterns/homeCards.ts`. **The control needs labels and none
are approved** — list them for Silas rather than inventing them.

---

## 6. The rules that governed today

- **Prototypes are binding**, and a signed-off prototype is the answer
  rather than a prompt to re-ask. **But the BUILT scales page outranks
  `docs/shapes-grid-face-prototype_5.html` on colour, fill and session
  flow**, because it carries later rulings the prototype predates.
  Where they disagree on anything else, stop and ask. Never edit a
  prototype.
- **No user-facing string exists unless it is in
  `docs/WHOLE_SONG_TEST_COPY.md` or `docs/TEMPO_SOURCE_SPEC.md` §10.**
  If one is needed and is in neither, stop and list it.
- **Six status words**: Not Started, Started, Needs Work, Developing,
  Fluent, Mastered. **Fluent+** is the only permitted shorthand.
  Acquired and In Progress are retired.
- **The app's word is cell, never square** — UI, reports, commit
  messages.
- **Two tabs, one working tree, one git index.** Only one builds at a
  time. Stage explicit paths, never the whole tree.
- **`npm run build` before every commit**, not just the tests — `tsc -b`
  catches strict errors the test run does not.
- **Standing permission**: a field may be added to the drill-run row
  **without asking** when the value already exists in the code at the
  point the row is written and no rule changes. Anything that changes a
  RULE still stops and asks.

---

## 7. Still owed by Silas

**Two unapproved labels.**
- **"Apply to every key"** — shipped in `f810efc`, drafted from Silas's
  own words asked as a question, never signed off.
- **The module-home sort control's labels** — not written at all;
  needed before section 5's third job can ship.

**§6b of `WHOLE_SONG_TEST_SPEC.md` — whether a key row reads Started and
Learning.** Listed in `WHOLE_SONG_TEST_COPY.md` under "Still not
approved — do not build these".

**The unnamed chord-stacking module.** When `supplementary` left the
score, the thing it was standing in for lost its home: *the same shape
under a different root is a different chord — a Cmaj7 shape over C is a
Cmaj7, over A it is an Am9.* Worth practising, no module, no name, no
design. **Do not improvise a home for it.**

**Two colours that still carry a second meaning.**
- **The voice-leading heat shading** is already gone with `HeatGrid`,
  so this one is settled — but the **module container tints**
  (`goals/moduleSectionPalette.ts`, including Shapes & Patterns' amber)
  still reuse the status palette by design. Silas ruled they stay: a
  pale wash behind a labelled section is not competing with a filled
  cell, and every other hue is taken. Left alone deliberately.
- **The freshness dots** — `FRESHNESS_DOT_CLASS` is deleted and the song
  card uses the bar. Nothing named in the module still paints recency in
  a status colour. If one turns up, it is the same ruling.

**One more, from `2405aa7` and unchanged since: "out of the score" is
not persisted.** `notCounted` is page-local `useState`. Every counting
surface *takes* the set — `shapesCounts(outOfScore)`,
`shapesCoverageDenominator(id, outOfScore)`,
`catalogTotalForGoal(goal, outOfScore)`, `shapesCards(..., outOfScore)`
— so wiring a stored set in is a short follow-on. Storing it is a
stored-shape decision and Silas's rule is that those are raised before
they are made. The light option is one `userPrefs` key holding the
`targetKey` strings behind a small subscribable singleton: no new Dexie
table, no migration, rides the existing sync.

---

## One loose end, not mine

A test named `opens unfocused with no param` failed once mid-afternoon
and has passed every run since, including the final full suite (450
files, 7267 tests). It is not in anything I touched. Flagging it as
flaky rather than letting the next reader think it was caused here.
