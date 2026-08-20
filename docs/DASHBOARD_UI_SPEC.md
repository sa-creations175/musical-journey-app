# Dashboard UI — Specification

Settled 20 August 2026. Sits on top of the completed read layer
(`src/modules/dashboard/read/`). This document covers the screen only — every
number it displays is already computed and tested.

Companion to `DASHBOARD_REDESIGN_DESIGN.md`, which owns the data model,
the module trees and the definitions.

---

## What this screen is for

Open the app with fifteen minutes — at the keyboard or on a phone at the gym —
see where you are weak, and start. No planning step.

Second purpose, which emerged during design: this is the only instrument that
shows whether the practice session generator is doing anything useful.

---

## Visual direction

A dense table. Maximum rows per screen, numbers aligned for vertical scanning.

Two alternatives were considered and rejected:

- **Cards with progress bars** — more legible per row, but only three modules
  fit on screen, and sorting 22+ rows is the point.
- **Typographic prose** — names the weakest thing for you rather than making
  you find it, but sorting and filtering don't apply to sentences.

The one idea worth keeping from the prose direction — surfacing the weakest
item rather than making the user hunt — is handled by the compare control
below.

---

## The row

Four cells: **name**, **accuracy**, **coverage**, **recency**. Fixed column
widths; numbers right-aligned.

### Accuracy

`61%`, or `—` when there is no eligible signal.

Where the source is self-rated rather than measured, the column header for
that block reads **fluency**. The read layer carries `AccuracyKind` for
exactly this — a self-rated 75 must never render as "75% correct".

A dash is not a zero. An ungraded row has no signal; it has not failed.

### Colour bands

> **Revised 20 August 2026.** Was three bands (red below 65, amber 65–79,
> green 80+), designed for measured percentages. The four-step fluency scale
> only ever produces 25 / 50 / 75 / 100, which lands awkwardly in three bands.
> Both columns now use **four bands sharing one colour language**, so the
> colours mean the same thing in both places even though the numbers do not.

**Fluency** — self-rated, four possible values:

| Rating | Value | Band |
|---|---|---|
| struggled | 25 | red |
| working on it | 50 | amber |
| comfortable | 75 | yellow-green |
| in flow | 100 | green |

**Accuracy** — measured, cut-offs chosen to mean roughly what their fluency
counterparts mean:

| Accuracy | Band |
|---|---|
| below 50 | red |
| 50–69 | amber |
| 70–84 | yellow-green |
| 85 and above | green |

Below 50 is getting half of them wrong and should read as failing. Early
practice will look like a wall of red, and that is honest — the same principle
as the screen opening nearly empty.

85 rather than 100 for green because demanding perfect accuracy makes the top
band unreachable. 85+ is the practical equivalent of "this holds up".

**Each column carries its own legend.** Same four colours, different meanings —
accuracy shows the percentage bands, fluency shows the four ratings by name.
Not one combined legend: the whole point is that they mean different things.

### Coverage

At **parent rows**: the percentage plus a total attempt count.

```
44% · 63 attempts
0%  · 24 attempts
0%  · no attempts
```

The attempt count exists because the percentage alone cannot distinguish
"worked on, nothing consolidated yet" from "never opened" — both read 0%. That
gap would make real practice look like neglect, which is the failure this
screen exists to correct.

At **item rows**: the raw attempt count only, no percentage. `5 attempts`
tells you more than "covered", and 5 sits differently from 47.

### Recency

`12d` on an item row. `12d / 61d` on a parent — most recent, then stalest.

A never-touched descendant does not get a fabricated stalest. "Never" is not a
number of days, and rendering it as 0 would claim you practised today.

---

## The tree

Opens at **submodule level** every time. No remembered depth.

> **Row count corrected 20 August 2026.** The original figure of "roughly 22
> rows on load" predates mental visualisation becoming its own module row and
> the catalog work. The real depth-1 count is **44 rows across 10 static
> modules**, plus one row per live repertoire section. Harmonic fluency (15
> categories) and production vocabulary (17) account for most of it.
>
> Still scannable, but it is twice what the figure claimed, and it is why
> sorting and filtering carry more weight here than a shorter list would need.

Depth is uneven by design — Reading is two levels, chord shapes is four
(quality → inversion → key), chord progressions varies within itself. The read
layer handles this by construction; the UI must not assume a fixed maximum.

Indentation plus a background shade distinguishes depth. Chevrons on anything
expandable.

---

## The compare control

Each parent row carries a small control. Pressing it highlights the **weakest
and strongest among that row's immediate children** — a green tint and a light
red tint on the row backgrounds.

**One comparison active at a time.** Pressing another moves it.

This is deliberately on-demand rather than automatic. With everything
expanded, automatic highlighting would mark the extremes of every branch at
once — twenty tinted rows, which tells you nothing. Pressing it on one row asks
one question and answers it.

---

## Controls

### Sort

Two controls: **field** (accuracy / coverage / recency) and **direction**
(worst first / best first).

Sorting by recency uses the left number under "most recent first" and the right
number under "stalest first". A node touched 2 days ago holding a 40-day-old
item ranks on the 40 in one direction and the 2 in the other.

**Absent values sort last** in both directions on accuracy and coverage. "Worst
accuracy first" is a question about items you have data on; filling the top of
that list with ungraded rows would bury the ones actually going badly.
Never-practised rows are found through coverage, which is the column that asks
that question.

Recency is the one exception, and only for stalest-first: a never-touched item
genuinely is staler than any date.

### Grouping toggle

**On by default.** Module rows reorder and submodules sort within them — ear
training's block moves as a block.

**Off** gives one flat list of submodules across all modules, with the module
name trailing each row.

In the grouped view, filters apply at **submodule level, not module level**. A
module row summarises what is under it; hiding it because its average misses a
threshold would hide the submodules that match — which is exactly what you are
scanning for.

Filtering never prunes the tree under a surviving row. An expanded row must
not disagree with the number on the row above it.

### Filters

Five, plus a **match all / match any** switch:

- accuracy below [X]
- coverage below [X]
- not practised in [N] days
- has due items
- module is [X]

**All** means a row must satisfy every active filter. **Any** means one is
enough. "Not covered AND below 70%" and "not covered OR below 70%" are the
same five filters with the switch flipped.

**No nesting.** Grouped conditions like *(weak AND stale) OR (Reading AND
uncovered)* are out of scope — that needs a group builder UI for a query that
will rarely be wanted. The *any* switch gives a wider list to eyeball instead.
If the same nested query gets wanted twice, revisit.

### Due

Due is a **filter only, never a column**. After a gap everything goes due and
stays due, so the number reads the same on every row and tells you nothing.

This also means no dash is needed where spacing state doesn't exist — the due
filter simply returns nothing from those modules.

---

## State and reset

Filter, sort and expansion state live in the **URL**. A refresh keeps them.

A **reset button** returns to the submodule-level default.

Same pattern as the deferred Reading step 5 URL state work.

---

## Tap to drill

Tapping a row starts a drill **filtered to that row**, where the module
supports it:

- "minor 7th descending" → that interval in that direction
- "descending" → all descending intervals
- "intervals" → all intervals

This lands unevenly and that is accepted. Two modules can be told which items
to serve; the rest can only be opened.

**The negative case is load-bearing.** A row that silently opened a whole
module while implying it had filtered would be worse than one that says it is
taking you to the module. `drillTargetSummary` reports `filtered: false` so a
row cannot overclaim — the UI must surface that, not swallow it.

A merged Reading row hands over both stored refs: drilling conceptual knowledge
serves `count` and `which`.

Cross-module mixed drilling — filter to "below 70%" across four modules and
drill exactly that set — remains stage two and is not in this build.

---

## Legibility

Every rule this screen depends on must be readable **in the app**. Not
remembered from a design session, and not surfaced only at the drill.

Two halves:

**What the number means**
- accuracy is the last 20 eligible attempts
- coverage is items with 3 or more attempts, over the full catalog
- recency shows most recent and stalest
- the two rating scales and their values
- `excludeFromFluency`: focus pools under 4 items don't count toward accuracy,
  but do count toward coverage and recency
- for chord progressions, how many attempts predate submission tracking and
  therefore cannot be collapsed (`ungroupableCount`)

**What would advance it**

Each row explains what would move it, not only what it currently says. A row
reading "3 of 6 covered" that cannot tell you what moves it is a status report
again.

- repertoire cell → three consecutive clean run-throughs at or above
  (performance tempo − 10) BPM
- most others → the 3-attempt coverage threshold, or the 20-attempt accuracy
  window

`RULE_LEGIBILITY.md` §3.8 notes the cell gate is the best-surfaced rule in the
app — stated on the button tooltip, the progress dots' aria-label, the
below-tempo tag, the tempo-change banner and the whole-song modal. Five places,
all of them at the drill. The one place it is not surfaced is where the number
is read.

---

## Mobile

All controls collapse behind one button, with a count badge when filters are
active. Six controls above the list does not fit a phone screen, and the gym
case is the one that matters most.

Columns stay. Nothing hides — three columns is few enough.

---

## Day one

The screen will open nearly empty. 46 attempts exist in total; most rows will
read `—` for accuracy and single-digit coverage.

That is correct and should not be softened. An empty dashboard that fills up is
the point; a flattering one is what the old home screen was.
