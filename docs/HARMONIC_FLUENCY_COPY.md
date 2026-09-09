# Approved copy — Harmonic Fluency

Approved by Silas, 8 Sep 2026. Companion to the rulings in the Tab 1 brief of
the same date.

**These are the words. Do not reword them, and do not write new ones.** Anything
this file does not cover is still unwritten — stop and ask rather than inventing.
What is still unwritten is listed under **Unruled** at the bottom, so the gap is
a list rather than a discovery.

`src/modules/harmonic-fluency/__tests__/approvedCopy.test.ts` reads this file and
asserts the app says these words. Editing a string here without editing the code
fails the suite, and so does the reverse.

---

## The filter row — what each line is called

Ruling 24. Title case. The order below is the order on screen.

| facet | label |
|---|---|
| key | Key |
| note | Note |
| degree | Number |
| fromDegree | Starting Number |
| movement | Distance |
| progression | Progression |
| pentatonic | Pentatonic |
| slashDegrees | Slash Chord |
| keyRelation | Maj/Min Key Relation |
| enharmonicKind | Enharmonic |

**Two facets are not on the row** (ruling 25). `semitones`, because Silas does
not think in half steps and the Number chips already isolate a fifth or a
tritone. `enharmonicGroup`, because Distance covers it. Both are still computed,
so a link that names one still narrows the pool; nothing on screen offers them.

**Cadence and progression are one row** (ruling 26). A 5 1 is a little
progression, none of these is a cadence in the strict sense, and the secondary
dominants never were.

---

## The filter row — the controls

Ruling 28.

| id | string |
|---|---|
| filters | Filters |
| clear | Clear Filters |

Folded is the default. When it is folded and something is on, the toggle reads
`Filters · 2` — the separator is a middot with a space each side, and the number
counts the **rows** that are saying something, not the chips lit across them.

---

## The Progression chips

Ruling 26. The stored value is unchanged and still what a link carries.

| stored | chip |
|---|---|
| ii-V-I | 2 5 1 |
| V/V | 5 of 5 |
| V/vi | 5 of 6 |
| 1-5-6-4 | 1 5 6 4 |

---

## The Distance chips

Ruling 27. Interval words, never half-step counts and never the coordinate.
A perfect interval drops its quality — "down a fifth", not "down a perfect
fifth". Every other quality keeps it.

One row covers both families that have a distance: Number System Math, whose
cards ARE movements, and Interval Identification, whose cards name the same
distance from their two notes.

| stored | chip |
|---|---|
| up:m2 | up a minor second |
| down:m2 | down a minor second |
| up:M2 | up a major second |
| down:M2 | down a major second |
| up:m3 | up a minor third |
| down:m3 | down a minor third |
| up:M3 | up a major third |
| down:M3 | down a major third |
| up:P4 | up a fourth |
| down:P4 | down a fourth |
| up:A4 | up an augmented fourth |
| down:A4 | down an augmented fourth |
| up:d5 | up a diminished fifth |
| down:d5 | down a diminished fifth |
| up:P5 | up a fifth |
| down:P5 | down a fifth |
| up:m6 | up a minor sixth |
| down:m6 | down a minor sixth |
| up:M6 | up a major sixth |
| down:M6 | down a major sixth |
| up:m7 | up a minor seventh |
| down:m7 | down a minor seventh |
| up:M7 | up a major seventh |
| down:M7 | down a major seventh |

---

## The slash chord deck

Ruling 30. Seven shapes. 6/♭7 is out. The card asks in scale degrees, because
that is what a chart says; the reveal adds **one line** underneath with the
chord-tone reading.

| shape | chord-tone reading |
|---|---|
| 1/3 | the 1 in first inversion |
| 5/7 | the 5 in first inversion |
| 1/5 | the 1 in second inversion |
| 4/5 | the dominant sus sound (9sus4) |
| 5/1 | the 5 over its 4th, a suspended sound |
| 1/4 | the 1 over its 4th |
| 2m/1 | the 2 minor over the key's home note |

The line is rendered as a sentence — first letter capitalised, full stop — and
nothing else about it is written. **No shape added later gets a line invented
for it.**

---

## Category names

Ruling 29. "Number", not "Degree".

| category | title |
|---|---|
| scale-degree-math | Number System Math |
| degree-notes | Notes of the Number System |

---

## The four question types in Notes of the Number System

Ruling 29. **These names surface nowhere in the app today.** The four generators
are internal, the family renders as one category, and nothing on screen
distinguishes them. Recorded here so the names exist when a surface needs them;
no code was changed to introduce them.

| generator | name |
|---|---|
| nameItCards | Name the Note |
| placeItCards | Name the Number |
| pressItCards | Press the Number |
| findKeyCards | Name the Key |

---

## Card text

Ruling 29. The `placeItCards` question asks for a **number**.

> In the key of {Key}, {Note} is which number?

---

## Unruled

Still placeholder. Nothing below was written by Silas, and nothing below should
be treated as approved.

- **Filter chips with no ruled wording** — the Pentatonic row (`major`, `minor`,
  `relative`), the Maj/Min Key Relation row (`relative`, `parallel`) and the
  Enharmonic row (`note`, `interval`) print their stored value as-is.
- **Tile labels** on the module home and the category pages.
- **Presets** — the "diatonic" and "chromatic" degree sets the filter can already
  express, still unnamed and still unbuilt.
- **Sort controls** on the category detail stack.
- **"Layout"** — the grid's axis toggle.
- **"Apply to every key"** — the Edit-what-counts follow-up.
- **Category descriptions** for Notes of the Number System, on the dashboard's
  affordance panel. The category now has a ruled name but no description, so
  the panel renders nothing rather than inventing one.
