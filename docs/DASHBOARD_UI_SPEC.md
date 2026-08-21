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

> **Revised 20 August 2026.** Each entry now carries its **why**, not only its
> what. A rule stated without its reason reads as an arbitrary constraint, and
> the user's first instinct on seeing a number they did not expect is that the
> screen is broken. Telling them the rule is half the job; telling them why the
> rule exists is what stops them distrusting the number.

**What the number means**

| Rule | Why it exists |
|---|---|
| Accuracy is the last **20 eligible attempts** | A lifetime average never moves. Twenty is enough to be stable and short enough that improving actually shows. |
| Coverage is items with **3 or more attempts**, over the full catalog | An item seen once, guessed wrong and never revisited must stay on the uncovered list, or that list stops being trustworthy. |
| The denominator is the **full catalog**, never the current filter | A denominator that moves with a setting makes the percentage mean a different thing on different days. |
| Recency shows **most recent and stalest** | Most-recent alone flatters — touch one item and the whole category looks fresh. Stalest alone freezes — one neglected corner pins it and nothing you do moves it. |
| **A parent's fluency reads as the highest rating it has fully reached** | You reach a threshold, you are not rounded up into it. Three children at *comfortable* and one at *struggled* averages 62.5 and reads **working on it** — the parent still has a way to go. Without this stated, a parent reading lower than most of its children looks like a bug. |
| The two rating scales and their values | Same column position, two different questions. A self-rated 75 is *comfortable*, not "75% correct". |
| **`excludeFromFluency`** — focus pools under 4 items are out of accuracy, in for coverage and recency | A 3-item pool inflates a percentage: a blind guess is right one time in three and short-term recall carries the rest. But you did practise the item, so coverage and recency count it. |
| For chord progressions, how many attempts **predate submission tracking** (`ungroupableCount`) | Those rows cannot be collapsed into one result per submitted answer, so they count one row per chord. Stated rather than silently mixed with collapsed rows. |
| For mental visualisation, the attempt count is a **floor, not a total** | Its only per-item record is `performanceHistory`, which caps at 20 entries. A count that silently stops climbing is worse than one that says it stopped. |

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

### The two affordances, as built

*Settled 20 August 2026. Built in `a400f87` (columns) and `690f55e` (rows).*

Both are **hidden until asked**, and for the same reason: available where the
thing is, out of the way until wanted. An always-visible legend spends vertical
space on every screen — the scarcest thing in the case that matters most, a
phone at the gym — on something read twice and then stopped being seen.

**A `?` on each number column header, plus one on the due filter pill.** Each
opens one panel below the headers, inside the sticky container. Under, not
over: the panel explains the row of labels it sits beneath, and opening it must
not shift them out from under the finger that pressed it.

The score panel carries **both legends side by side**, each headed with its
kind. The accuracy legend is *derived from the band table* rather than typed
beside it — a legend naming a cut-off the code does not use is worse than no
legend, because it is a confident wrong account of a colour the reader can see.

**Due gets the fourth `?` because it is the one rule with no column.** It is
deliberately a filter, so the filter is the only place its rule can be asked
about.

**An `i` after each row label, expanding inline beneath the row.** Not a sixth
column: five is already what fits on a phone, and the affordance belongs beside
the thing it explains. Not the label itself, which would compete with tapping
to drill.

**One panel open at a time**, across the columns, the due pill and every row —
two open panels would push the list they explain off the screen. The open row
is keyed by **node id, not position**: keyed by position, a sort would leave the
panel open on whatever row landed in that slot, which is an explanation
attached to the wrong number.

Neither lives in the URL, for the same reason the comparison does not: reading
what a column means is a momentary question, not a view worth coming back to.

**Scale.** 60 written explanations resolve to all **3,266 rows** — a row takes
its own where it has one, otherwise the nearest one above it, with a badge
naming which row it borrowed from. *(Both numbers read off the code:
`affordances.test.ts` asserts the row total and the table sizes. Writing one
per item would mean 3,266 of them, most saying the same thing; leaving item
rows blank would be the status report again.)*

---

## Mobile

All controls collapse behind one button, with a count badge when filters are
active. Six controls above the list does not fit a phone screen, and the gym
case is the one that matters most.

Columns stay. Nothing hides — three columns is few enough.

---

## Outstanding

*Recorded 20 August 2026, after the first look at the built screen. Kept here
rather than in conversation so nothing gets lost between sessions.*

| # | Item | Where | Status |
|---|---|---|---|
| 1 | **Sticky column headers** — accuracy / coverage / recency / drill. They must stay visible while scrolling; on a 55-row list the top is off screen most of the time, and position alone does not say which column is which. | step 7 | **done** — 7a |
| 2 | **Capitalisation is inconsistent.** Harmonic fluency's submodules are Title Case (`Scale Degree Math`) because they read `CATEGORY_LABELS`; every other module's are lowercase (`note recognition`). One convention, applied everywhere. | step 7 | **done** — `1ff0d48`, and the decision reversed. See below. |
| 3 | **Item counts on unfilterable rows.** A filterable row reads `drill 34 items`, which doubles as a size. An unfilterable one reads `open module` and says nothing. Make it `open module · 188 items` so both carry the same information in the same place. | step 7 | **done** — 7a |
| 4 | **Key signatures do not read as pairs.** The relative pairs (G♭ major / E♭ minor) are correct but sit as twelve unrelated rows. A rule or spacing between each pair would make the shared signature visible. | step 7 | **done** — 7a |
| 5 | Reading chord-identification question design — **being handled in another tab.** Do not duplicate. | elsewhere | — |
| 6 | **468 rows still label themselves with their stored itemRef.** 96 scale cells read `major:C` and 372 voice-leading cells read `five-one:guide-tones:posA:Eb`. | open | see below |

### On capitalisation — the decision, and the reversal

> **Settled 20 August 2026, against what this section originally recommended.**
> The original text is kept below the line because it was not wrong about the
> cost, only about the outcome.

**Module headers stay all-caps; everything below them is Title Case.** The
header case is structural and the row component already does it in CSS at depth
0, so nothing in the catalog needed to change for it. Below that, `titleCase()`
replaces the blanket lowercase, at the same seam in the dashboard's own catalog
layer.

**Why lowercase-everywhere lost.** It fixed the *mixing* by flattening things
that read better capitalised — song titles worst of all, which sat beside
lowercase categories and made the repertoire branch look like two different
lists.

**The rule is first letter of each word, and nothing else touched.** Lowercasing
the tail is what a naive Title Case does, and it destroys meaning that lives in
the case: `EQ` → `Eq`, `AI era` → `Ai Era`. An apostrophe is not a word break,
or "Ain't Nobody" comes out "Ain'T Nobody".

**A lone `b` or `#` in front of a digit or a capital is left alone, because the
case IS the meaning.** `b3` is a flat third and `B3` is a note two octaves below
middle C; `bVII` is a flat-seven. Chord-motion rows are built from degree
spellings and scale cells carry them mid-label, so an unconditional rule would
have silently transposed 264 rows and re-spelled two harmonic fluency questions
into different chords — and it would have read as a rendering quirk.

**Two exemptions**, both because Title Case makes the label worse rather than
better:

- **Harmonic fluency's leaf label is the card's whole QUESTION.** A sentence in
  Title Case reads as a headline.
- **User-entered strings** — song titles, section names. Re-casing text someone
  typed is a different kind of change from normalising a catalog constant. The
  repertoire catalog needed no edit as a result.

Two labels stopped being raw ids in the same commit: chord recognition's tier
segment (`foundational` → `Foundational Triads`, worded as the drill's own tab
strip does) and chord motion's `asc` → `(Ascending)`.

---

*Original recommendation, superseded:* **Lowercase everywhere is the smaller
change, and it matches the app.** The nav bar, the module labels and every other
catalog already use lowercase; harmonic fluency is the outlier because it reads
`CATEGORY_LABELS`, which is Title Case and shared with the module's own chip
list and sidebar. Applying `.toLowerCase()` in the dashboard's catalog leaves
those surfaces alone — the dashboard is a dense table with its own typography,
and a per-surface convention is defensible. Title Case everywhere would mean
re-casing around thirty literals plus deriving Title Case from chord, mode and
interval names that are not stored that way.

### Item 6 — the labels that are still stored ids

*Recorded 20 August 2026, found while applying the convention above.*

`RULE_LEGIBILITY.md` §1.8b predicted this: *"the dashboard is the first surface
in the app that renders every catalog id, across six modules. Five of those
catalogs have not been audited for this."* Two of the five carry it, and it has
a size.

| Rows | Label today | Where the real label already lives |
|---|---|---|
| 96 scale cells | `major:C` | `SCALE_CELLS[].label` — *"Eb minor pentatonic — from b3"* |
| 372 voice-leading cells | `five-one:guide-tones:posA:Eb` | `voiceLeadingSubCellLabel()` |

**This is a labelling fix, not a capitalisation one.** Title Casing a raw ref
gives `Major:C`, which is a capitalised key rather than a label, so the
convention deliberately does not touch them — and the flat spellings inside
them (`b3`, `posB`) are exactly what the accidental rule protects.

Both label sources exist and neither is read, which makes this a Pattern 1
wiring job in `RULE_LEGIBILITY`'s terms rather than a design one. The count is
pinned in `catalogs.test.ts` so it cannot grow quietly, and so closing it fails
the test and asks for the number to be removed rather than passing silently.

---

## Every row says what SKILL it is building

*Added 20 August 2026. Folds into step 7's affordances rather than sitting
beside them.*

The trigger: twenty minutes spent unable to work out what chord identification
tests, or how it differs from notation shapes — on a module built the week
before. If the author cannot reconstruct it, the row has to say it.

An affordance already owes two things per row: what the number means, and what
would advance it. This is a third, and it comes first: **what am I practising.**

For Reading, the answers that took working out:

| Row | The skill |
|---|---|
| **notation shapes** | The fast silhouette pre-read. Seven items: is this stack a triad or a seventh, and which inversion — read off the SHAPE, before any note is named. |
| **chord identification** | The full conjunctive answer: inversion, quality and clef together, on a chord whose root changes every card. |

And the relationship, which is what makes the pair legible:

> **Shapes subsumes into chords the same way accidental-counting subsumes into
> key-naming.** You can answer the smaller question on its own, and you cannot
> answer the larger one without it. That is why notation shapes sits ABOVE
> chord identification in the tree.

The general form for every module: a row explains the skill in terms of what it
asks you to do, and names the row it depends on when it has one. A skill
described only by its own name is a label, not an explanation.

---

## Design item recorded, not scheduled

### The key-signature overlay tier for chord cards

`reading/catalog.ts` defines `OVERLAY_MIX`, and `renderCard` passes
`keySignature: null` for every chord card. A harder tier was designed and never
wired: chords read **in the context of a key signature**, with the accidentals
implied by the key rather than written on every note — which is how chords
actually appear in music.

**This is a design question, not a feature to schedule.** The sterile version
isolates accidentals deliberately, and that was the original intent. The
question is whether the isolation teaches chord reading or delays it:

- Does reading a chord with every accidental spelled out build the skill, or
  build a skill that does not transfer to a real score?
- Is context a later TIER, or the thing that should have been there from the
  start with the sterile version as scaffolding?
- If it is a tier, what unlocks it — and does the sterile version stay in the
  catalog afterwards, or does it subsume the way notation shapes does?

Answering it decides whether `OVERLAY_MIX` gets wired, retired, or redesigned.

### Let me control the arrangement

*Expanded 20 August 2026 to cover both halves of the same want.*

The underlying ask is one thing: **let me decide how this list is arranged
rather than inheriting one shape.** It has two parts, and they will share
whatever mechanism gets built.

**Custom module order.** Pin what is being focused on to the top, regardless of
sort. Priorities change by season and the nav order is only a default — a good
one, and still just a default. Note that the nav order now genuinely IS the
default (see `natural` sort), so this is about overriding it deliberately
rather than about fixing it.

**Per-node regrouping.** A control on a parent row offering an ALTERNATE
grouping of its children:

- Key signatures by relative pair, or by major / minor
- Intervals by size, or by direction
- Chord shapes by inversion, or by key

The second is a second axis alongside the whole-screen grouping toggle.
Per-node regrouping acts on one branch, which is what makes it worth having and
also what makes it its own design pass. Open questions, which apply to both
halves:

- **Which nodes offer it.** Not every parent has a second sensible axis, and a
  control that appears on rows where it does nothing is the inert-chevron
  failure again.
- **Whether the choice persists.** Expansion and sort live in the URL;
  comparison deliberately does not. Regrouping could be either — it is closer
  to a view configuration than to a gesture, which argues for the URL, but it
  is per-node and the URL would need a compact encoding like expansion's.
- **How it interacts with sorting.** Sorting orders siblings; regrouping
  changes what the siblings ARE. The two compose, but the order they apply in
  decides whether "worst first" means worst group or worst item.
- **What it does to the catalog.** A regrouped branch has different `path`
  values, so either the catalog carries both axes or the tree is rebuilt per
  choice.
- **How a pinned module interacts with a sort.** "Worst first" and "these two
  first" are both orderings, and one has to win. Pinned-then-sorted is probably
  right — the pin says which rows to look at, the sort says in what order
  within that — but it needs stating rather than falling out of
  implementation order.
- **Whether a pin survives a reset.** Reset returns to the default view. A pin
  is arguably part of the default once set, which would make it the first
  piece of view state that reset does not clear.

---

## Day one

The screen will open nearly empty. 46 attempts exist in total; most rows will
read `—` for accuracy and single-digit coverage.

That is correct and should not be softened. An empty dashboard that fills up is
the point; a flattering one is what the old home screen was.
