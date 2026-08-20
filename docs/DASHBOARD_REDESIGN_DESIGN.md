# Dashboard Redesign — Design Document

Settled 13 August 2026. Supersedes the existing dashboard entirely.

**Revised 20 August 2026.** Eleven corrections applied, from decisions taken
after the original session and from the read-layer audit of the catalogs. Each
one is marked inline in a `> **Corrected 20 Aug**` block that states what the
value used to be, so nothing here is silently overwritten. The full list of
what moved — and a second list of things found stale but deliberately *not*
resolved — is at the end under **Revision log**.

---

## Why

The current dashboard opens with two banners asking you to plan a month and a
week, a radar chart of zeroes, and "last: 82d ago" on every module. It is a
status report on not practising.

What it needs to be: open the app with fifteen minutes — at the keyboard or on
a phone at the gym — see where you are weak, and start. No planning step.

A second purpose surfaced during design and is worth stating: the dashboard is
the only instrument that will show whether the practice session generator is
doing anything useful. There has been no way to check that until now.

---

## Principles

1. **It works entirely without goals.** Everything shown is computed from
   attempts already logged. Nothing is gated behind setting a goal.
2. **It is a sortable, filterable list, not a headline number.** You scan and
   pick.
3. **It is a full drill-down tree.** Module → submodule → skill → item. The
   same numbers appear at every level.
4. **Each module's hierarchy differs.** Six shapes share one display. That is
   the real work, not the data.
5. **Every definition is readable in the app.** Not remembered from a design
   session. This matters increasingly if anyone other than the author ever
   uses it.

---

## The three columns

Three columns on every row: **accuracy**, **coverage**, **recency**. Due is a
filter, not a column.

### Accuracy

Correct answers over total answers across the **last 20 attempts** on that
item.

- Fewer than 20 attempts — use what exists.
- Zero attempts — show `—`, not `0%`.
- Parent rows average their children's accuracy. A parent whose children all
  read `—` reads `—`.

Accuracy carries no age of its own. The recency column beside it supplies
that: "59%, 61d" reads correctly as *that was true two months ago*.

Where answers are self-rated rather than marked right or wrong, the column is
labelled **fluency** and uses the rating scales below. Same column position,
different meaning, stated in the info affordance.

### Coverage

Items with **3 or more attempts**, over items in the catalog.

Below 3 attempts an item is uncovered, however long ago you saw it once. The
threshold exists so the uncovered list stays trustworthy — an item seen once,
guessed wrong, and never revisited should not disappear from it.

At **item level** the column shows the **raw attempt count**, not a
percentage. "5 attempts" tells you more than "covered", and 5 sits differently
from 47.

**Self-assessed starting stages do not count toward coverage.** The chord shape
modal that asks "how well do you know C major?" sets where spacing begins; it
does not claim you covered anything. Coverage measures practice done in the
app.

Catalog per module is defined in the module trees below.

The column carries an info affordance stating the 3-attempt rule.

### Coverage denominators are always the full catalog

> **Added 20 Aug 2026.** A general rule the original doc never stated.

A coverage denominator is the size of the **full catalog** for that row. It is
never the size of the current filter scope.

A denominator that moves with a settings toggle makes the number mean a
different thing on different days — 60% on Tuesday and 20% on Wednesday with
no practice in between. Narrowing to what you are working on is a **filter**:
it changes which rows you look at, not what a row's number is measured
against.

The clearest case is ET chord motion — the catalog is 132 motions and the `42`
on screen today is the diatonic-only scope readout. See the chord motion tree
below.

**This failure is already live, in four rows of the current dashboard.**
*Found 20 Aug 2026 while building the read layer.* `snapshotEarTrainingModules`
derived each module's `total` from the items present in `db.attempts`, so the
denominator **grew as you practised** — drill one new mode and the module's
item count went up by one — and `untouched` was permanently 0.
`snapshotHarmonicFluency` walks the 375-card catalog and reports a true count.
The two halves of the same dashboard have never meant the same thing by
"total". Fixed in read-layer step 3 (`tierCountsForCatalog`), which walks the
catalog and files an unpractised row as `untouched` instead of omitting it.

The same step closes the numerator half: stats are looked up **by catalog ref**,
so stored practice that outlives a catalog entry — the cut chord shapes, a
renamed item — contributes to nothing and cannot push a percentage over 100%.

### Focus-pool attempts — `excludeFromFluency`

> **Added 20 Aug 2026.** A rule already enforced in eight drills that the
> original doc did not mention at all.

An attempt made while a focus pool holds **fewer than 4 items** is written with
`excludeFromFluency: true`.

- **Excluded from accuracy.** A 3-item pool inflates a percentage. A blind
  guess is right one time in three, and short-term recall carries most of the
  rest — you are remembering the last thirty seconds, not the item. The
  percentage would read as skill.
- **Counted toward coverage.** You did practise the item. Coverage asks
  whether you did the thing, and you did.

That split is the whole point of the flag: it protects the number that can lie
without erasing the fact that you sat down and worked.

The rule carries an info affordance. See `docs/RULE_LEGIBILITY.md` §1.2 and
§1.3 — the existing in-app notice names only "fluency tiers", and the flag
reaches six systems.

### Recency

Days since the last attempt on that item.

Parent rows show **most recent / stalest** — "12d / 61d". Both numbers are
sortable: "most recent first" orders on the left, "stalest first" on the
right.

Most-recent alone flatters. Stalest alone freezes — one neglected corner pins
the number and nothing you do moves it. Showing both is honest and costs one
extra number on the row.

### Due (filter only)

Due means items past the next-review date the spacing algorithm assigned. It
is **not** a deadline and has nothing to do with goals — SM-2 writes the date
when a card is answered.

It is not a column because after a gap everything goes due and stays due, so
the number reads the same on every row and tells you nothing. It remains
available as a filter for when you are caught up enough for it to mean
something.

This also removes the need to show a dash where spacing state does not exist
(S&P, repertoire). The due filter simply returns nothing from those modules
until they are tracked.

---

## Rating scales

Two scales. Both replace what is currently in the app. **Old ratings are
wiped, not migrated** — including their coverage counts. S&P and Song
Repertoire start at zero coverage.

Both scales are info-affordance material. See **Legibility requirement**
below.

### Fluency scale — everywhere a human self-rates practice

> **Corrected 20 Aug 2026 — was scoped to "Shapes & Patterns, Song
> Repertoire".** The values are unchanged; the reach is wider. There is **one**
> four-step fluency scale and it is used everywhere a human self-rates their
> own practice, not only in those two modules. It supersedes the 30 / 70 / 100
> mapping and the Flying / Cruising / Crawling scale wherever either still
> appears — in the app, in the older design docs, or in this document's own
> history.

| Rating | Value |
|---|---|
| Struggled | 25 |
| Working on it | 50 |
| Comfortable | 75 |
| In flow | 100 |

"Breakthrough" is **dropped**, not remapped — a breakthrough is an event, not
a level. You can have one while struggling, which is exactly why it cannot sit
on a scale that also holds "comfortable".

The drill buttons change with the dashboard. Two vocabularies for the same
thing would be worse than either alone.

This scale is provisional. Once MIDI-in grading exists (see Queued work) these
values are superseded by measurement.

### Lesson scale — Production lessons

| Rating | Value |
|---|---|
| Not started | 0 |
| Read it | 25 |
| Deep dive | 50 |
| Tried it | 75 |
| Mastered | 100 |

Five steps, and the bottom rung is 0 rather than 25 — struggling at the
keyboard is effort; not opening a lesson is not. "Deep dive" corresponds to
the existing Deep dive section and reference-tutorial link on the lesson page.
"Tried it" corresponds to the Try now block.

**This is not the fluency scale and does not map onto it.** Lessons are not
practice reps; a lesson has a reading path and a doing path, and the scale
tracks how far down it you got.

**Coverage threshold is "tried it" (75).** Coverage means you did the thing.
Reading a lesson and taking it in are worth recording, but neither is
practice — so "read it" and "deep dive" leave the lesson uncovered.

---

## Module trees

### Harmonic Fluency

`category → card`

**15 categories**, 375 cards. Right/wrong, real accuracy.

> **Corrected 20 Aug 2026 — was "14 categories".** All three lists in
> `src/modules/harmonic-fluency/catalog.ts` agree on 15: the
> `FlashcardCategory` union, `CATEGORY_LABELS`, and `CATEGORY_ORDER`. The card
> data agrees too — 375 cards carry 15 distinct `category` values. The
> 15th is pentatonic scales, alongside tritone pairs and enharmonic
> equivalents. The 375 card count was correct and stands.

Note: the sidebar deep-links only **12** of the 15 — pentatonic scales,
tritone pairs and enharmonic equivalents have no sidebar entry
(`SidebarNav.tsx:95-109`). The chips are what cards are tagged with, so the
chips are what the tree uses. See **Found stale, not resolved** — the original
note on this was wrong in a way that changes what the queued fix is.

### Ear Training

Four submodules.

**Intervals** — `intervals → direction → interval`

Ascending and descending are separate items. They are different sounds and
different skills, and spacing state already stores direction as part of item
identity (`id:direction`).

**Chord recognition** — `chord recognition → chord type → chord`

Four chord types, taken from the drill's existing tab strip: foundational
triads, seventh chords, dominant variations, extensions & colors.

Blocked/broken and ascending/descending playback are **not** part of item
identity. Both buttons are available on every card and the app does not record
which was used, so splitting on them would produce rows built on a guess.
Tracking this is queued.

**Chord progressions** — `chord progressions → sub-drill → item`

Three sub-drills: key detection, chord motion, full progression. They share
one `moduleId`, so the tree splits them by itemId prefix (`key-detection:`,
`motion:` / `motion-mode:` / `motion-first:`, and everything else — full
progression's ids are bare).

**Chord motion's coverage denominator is 132.**

> **Corrected 20 Aug 2026 — the doc had taken the on-screen 42 at face
> value.** `buildAllMotions()` is 12 chromatic degrees × 11 destinations =
> **132** (`ChordMotionTab.tsx:158-181`). The `42` rendered in the scope line
> at `:1088` is `activePool.length` — the **diatonic-only** filter, 7 × 6.
> Diatonic-only is the default scope, so 42 is what you see on a first visit
> and it looks like the catalog. It is not. This is the worked example of the
> general rule in **Coverage denominators are always the full catalog** above,
> and it is already logged as `docs/RULE_LEGIBILITY.md` §1.4.

Under full progression, each progression has up to three items:

- chord accuracy
- inversion accuracy (slash progressions only — the INV badge)
- pattern recognition (naming the progression after answering)

**One submitted answer is one result, not one row per chord slot.** The drill
currently writes four attempt rows for a four-chord progression, eight for a
slash progression. The read layer must group by submitted answer and collapse
to a single all-or-nothing result: every slot correct, or not.

This is deliberate. The full progression tests holding the whole thing
together — a harder skill than the cadence-level work in chord motion. If that
is still shaky, accuracy should say so.

Pattern recognition stays separate. Naming four chords by ear and recognising
the shape as a I–VI–ii–V are different skills.

Note: key detection and chord motion write no spacing state, so they will
never appear in a due filter until that changes.

**Scales & modes** — `scales & modes → mode → tab`

Nine modes × two tabs = **18 items**.

> **Corrected 20 Aug 2026 — was "nine modes, flat, no grouping level".** The
> two stored tabs are genuinely different skills, not two views of one:
>
> - **hear simple scale** — the scale played as single notes, ascending and
>   descending. Name it.
> - **hear mode in context** — a vamp loops with a chord progression and a
>   melody over it. Which mode is it?
>
> The redundancy in the second label is deliberate. "sit inside the mode"
> names the storage; "hear mode in context" names the skill, and the skill is
> what the row is measuring. The item ids already carry the split (`-tab1` /
> `-tab2`), and `src/lib/moduleItemCounts.ts` already counts modes as 9 × 2 =
> 18 — the tree was the only place treating them as nine.
>
> Note the app's tab strip today reads "hear the scale" / "sit inside the
> mode" (`ScalesModes.tsx:174-175`). Those labels change with the dashboard,
> same reasoning as the rating buttons: two vocabularies for one thing is
> worse than either alone.

### Reading

`skill → item`

Four skills: note recognition (34), notation shapes (7), **key signature
recognition** (78), chord identification (69). 188 items.

Renamed from "key signatures" — the skill is recognising them.

**78 items in the catalog; two rows per key in the tree.** Both statements
are true and neither replaces the other.

> **Corrected 20 Aug 2026 — was "two per key", which under-counted the
> catalog.** 78 = 13 signatures × 2 modes × **3** directions
> (`enumerateSignatureItems()`, `catalog.ts:332`). The three stored directions
> are `name`, `count` and `which`. The doc's 78 was right; its "two per key"
> was describing the tree, not the catalog, without saying so.

The resolution: `count` and `which` are two steps of one skill — you cannot
name the accidentals in written order without knowing how many there are — so
they **merge into a single tree row**. The row aggregates both item refs.

So the tree shows two rows per key:

- **visual recognition** — see the staff, name the key. One item ref
  (`name`).
- **conceptual knowledge** — given the key, how many accidentals and of which
  kind, then tap them in written order. Two item refs (`count`, `which`),
  aggregated.

Coverage and accuracy for the merged row are computed across both underlying
items, so the module denominator stays 78 and the key-signature skill total
stays 78. Only the row count differs: 26 keys × 2 rows = 52 rows over 78
items.

Both rows carry an info affordance explaining what each tests, and the
conceptual row's affordance says it covers two questions.

### Shapes & Patterns

> **Corrected 20 Aug 2026 — was "four submodules".** Three. Mental
> visualisation is **its own module row**, not an S&P submodule: it writes
> spacing rows under the dedicated `mental-viz` moduleRef and is deliberately
> excluded from every S&P coverage number (the April 27 design call,
> `RULE_LEGIBILITY` §1.6). Folding it in would reverse that quietly. Its entry
> is below, after Song Repertoire.

**Three submodules**, each a grid of skill × key; a cell is the item.

**Scales** — `scales → scale type → key`

Scale types: major, major pentatonic (three starting points), natural minor,
minor pentatonic (three starting points). 96 cells.

**Chord shapes** — `chord shapes → quality → inversion → key`

Four inversion rows, not three: root position, 1st inversion, 2nd inversion,
and **all inversions fluid** — which is its own skill (moving root → 1st → 2nd
→ root up and down the keyboard), not a summary of the other three.

The inversion level exists in the app today but is hidden behind a modal
rather than present in the grid.

**Voice-leading** — `voice-leading → pattern → row type → key`

Patterns are the named ones on screen (diatonic cycle, 5→1 movement, major
2-5-1, and the rest). Row types vary per pattern — starting positions for the
diatonic cycle; guide tones / seventh chords / full voicing × Pos A/B for
5→1.

(Mental visualisation used to be listed here as a fourth submodule. It is its
own module row — see below.)

### Mental visualisation

`mental visualisation → family → item`

> **Moved out of Shapes & Patterns, 20 Aug 2026.** Own `mental-viz` moduleRef,
> own coverage number, excluded from S&P's.

**504 items** — 216 triads (6 × 3 inversions × 12 keys) and 288 sevenths
(6 × 4 × 12) — after the extended-dominant cut. See **Catalog cuts**.

Inversion sits above key deliberately: "major 7, second inversion — 54%"
across all keys is a truer weakness than any per-key number. Inversions trip
people, not keys.

### Song Repertoire

`song → section`

Coverage denominator is sections in the song. A section is covered at 3+
logged practice sessions.

**Keys live below section and never enter the song's coverage number.** There
is no intention to learn every song in every key, so counting keys in the
denominator would make songs incomparable — one at 25% because it counts four
keys, another at 55% because it doesn't.

**Which sections table — resolved.**

> **Added 20 Aug 2026.** The original doc said "section" without saying which
> of the two tables it meant, and there are two.

`songSections` — the lead sheet's own sections — is **authoritative**.
`songMatrixSections` is a **derived mirror**, kept in sync by a write hook
(`src/modules/repertoire/matrix/matrixSectionsSync.ts`). The two names exist
only because `songSections` was already taken when the matrix landed
(`db.ts:1959-1963`); `songMatrixSections.sourceSectionId` is the FK back.

The tree reads **matrix sections**, which track the lead sheet automatically.
Edit a section on the lead sheet and the dashboard follows without a
migration. Nothing here needs reconciling — it is one source with a mirror,
not two sources.

**Practice and test are different events.**

> **Added 20 Aug 2026.** Settled after the original doc. Not yet built — the
> build is in flight in another tab. Recorded here as settled design because
> the dashboard reads both.

- **Practice** is **song-level**. It records a duration, an activity
  multi-select, and optional section tags. There is no pass/fail. You sat down
  with the song and worked on it; what you worked on is a tag, not a grade.
- **Test** is **per section per key**. It records run-throughs at tempo and
  whether each was clean. This is the one that can fail.

The dashboard reads both, and they answer different columns. Practice is the
honest source for recency and for time spent. Test is the honest source for
whether a section in a key actually holds up. Rolling them together would let
an hour of noodling read as a clean run-through.

Section-level coverage — 3+ logged practice sessions, above — counts
**practice**, tagged or song-level. Test results are what the fluency column
reads.

### Production

Two subtrees.

**Lessons** — `lessons → path → lesson`

Six paths, 56 lessons. Self-rated on the lesson scale.

Lessons stay in the dashboard despite not being a drill. Seeing how far behind
production is, is the point.

**Vocabulary** — `vocabulary → category → card`

**17 categories**, 199 cards, SM-2, right/wrong. Same shape as Harmonic
Fluency.

> **Corrected 20 Aug 2026 — was "16 categories".** All three lists in
> `src/modules/production/vocabularyFlashcards.ts` agree on 17: the
> `VocabClusterId` union, `VOCAB_CLUSTER_LABELS`, and `VOCAB_CLUSTER_ORDER`.
> The 199 card count was correct and stands.

"Clusters" in the current UI is renamed to **categories**, matching Harmonic
Fluency. Same word for the same idea in both modules — the storage type stays
`VocabClusterId`, only the UI vocabulary changes.

---

## Layout and interaction

### Default view

Opens at **submodule level** — modules expanded one level down, every time. No
remembered depth.

Roughly 22 rows on load. More scrolling than six module rows, but "key
signatures 59%" is visible without tapping anything, and the module-level
average would hide exactly the thing worth drilling into.

### Sorting

One sort field control (accuracy / coverage / recency) and one direction
control (worst first / best first).

One **grouping toggle**:

- **Grouping on** (default) — module rows reorder, and submodules sort inside
  their module. Ear training's block moves as a block.
- **Grouping off** — one flat list of submodules across all modules, module
  name trailing each row.

Both levels sort on the same field. Sorting by recency with grouping on uses
whichever half of the two-number recency cell the direction control selects.

### Filtering

Five filters:

- accuracy below [X]
- coverage below [X]
- not practised in [N] days
- has due items
- module is [X]

Plus one switch: **match all** / **match any**.

"Not covered AND below 70%" and "not covered OR below 70%" are the same five
filters with the switch flipped.

**No nesting.** Grouped queries like "(low accuracy AND stale) OR (module is
reading AND uncovered)" are out of scope — that requires a group builder UI
for a query that will rarely if ever be wanted. The *any* switch gives a wider
list to eyeball instead. If the same nested query gets wanted twice, revisit.

### State persistence

Filter, sort and expansion state live in the **URL**, so a refresh does not
wipe them. A **reset button** returns to the submodule-level default.

Same pattern as the deferred Reading step 5 URL state work.

### Tap to drill

Tapping a row starts a drill **filtered to that row**, where the module
supports it:

- Tapping "minor 7th descending" drills that interval in that direction
- Tapping "descending" drills all descending intervals
- Tapping "intervals" drills all intervals

This will land unevenly, and that is accepted:

- **ET intervals** — the mechanism already exists. Focus mode's `onStart`
  restricts `buildCandidates` to caller-supplied `id|direction` keys. It is
  wired to a modal rather than a prop or URL param.
- **Reading** — `ReadingDrill` needs a prop that bypasses `pickCard(skill)`.
  `optionsForItem(itemRef)` already exists for this purpose. Audited as nearly
  free.
- **Modules with no filter mechanism** — plain navigation to the module. No
  worse than today.

Cross-module mixed drilling — filter to "below 70%" across four modules and
drill exactly that set — is **stage two**, not this build. See below.

### Mobile

Controls collapse behind a button, with a count badge when filters are active.
Six controls above the list does not fit a phone screen, and the gym case is
the one that matters most.

No column hiding. Three columns is few enough.

---

## Legibility requirement

> **Added 20 Aug 2026.** Principle 5 already said "every definition is
> readable in the app". This section makes it a shipping requirement with a
> named list, and ties it to the audit that catalogues the rest.

Cross-reference: **`docs/RULE_LEGIBILITY.md`**.

That document maps roughly seventy rules the app enforces and tags each
`[INVISIBLE]` / `[HALF]` / `[SURFACED]`. Its thesis is the one this dashboard
depends on: *a rule that makes a displayed number mean something other than
what it appears to mean is worse than a rule that gates a feature.* Every
number on this dashboard is exactly that kind of number.

**Every rule the dashboard depends on must be explained in the UI, at the
number it affects.** This is not a nice-to-have and it is not a follow-up
pass. A dashboard whose numbers cannot be interrogated is the status report on
not practising that this design exists to replace.

The list, all of which ship with the dashboard:

| Rule | Where it must appear |
|---|---|
| The **20-attempt** accuracy window | accuracy column affordance |
| The **3-attempt** coverage threshold | coverage column affordance |
| The **two recency numbers** — most recent / stalest | recency column affordance |
| The **fluency scale** — struggled / working on it / comfortable / in flow | fluency column affordance, and the drill rating buttons |
| The **lesson scale** — and that "tried it" is the coverage threshold | Production lesson rows and the lesson page |
| **`excludeFromFluency`** — excluded from accuracy, counted toward coverage | wherever a focus-protected attempt can move a number, and in the focus-mode notice |
| **Coverage denominators are the full catalog, not the filter scope** | coverage column affordance |
| Self-assessed starting stages don't count toward coverage | coverage column affordance |
| Due means past SM-2's next-review date, not a deadline | the due filter |

### Every row says what would advance it

> **Added 20 Aug 2026.** Not a separate requirement — the second half of
> this one.

Explaining what a number *means* is not enough. Every row must also say
**what would move it**.

A row reading "3 of 6 covered" that cannot tell you what makes it 4 of 6 is a
status report again — the exact thing this redesign exists to replace. The
definitions above answer *what am I looking at*; this answers *what do I do
about it*, which is the question you actually opened the app with.

| Row | What advances it |
|---|---|
| Any drill item, uncovered | a third attempt — the coverage threshold |
| Any drill item, covered | answers inside the 20-attempt accuracy window |
| A repertoire section × key cell | **three consecutive clean run-throughs at ≥ (performance tempo − 10) BPM** |
| A repertoire section, uncovered | a third logged practice session touching it |
| A production lesson | reaching "tried it" — reading it is not practice |
| An S&P cell | a rated drill rep; the rating is the signal, not the minutes |

The cell gate is worth calling out. `docs/RULE_LEGIBILITY.md` §3.8 names it
**the best-surfaced rule in the app** — stated on the button tooltip, the
progress dots' aria-label, the per-attempt below-tempo tag, a banner on tempo
change, and the whole-song modal. But every one of those is *at the drill*, and
the dashboard is where the number gets looked at. The rule has to be legible in
both places, because that is where the question gets asked.

Three of these are already open items in the audit: §1.2 and §1.3 on
`excludeFromFluency` reaching more than its notice claims, and §1.4 on the
scope count reading as a catalog count. Shipping the affordances here closes
them for the dashboard's surfaces. It does not close them for the drills —
that stays the audit's job.

`docs/RULE_LEGIBILITY.md` §2.3 (the 30-second minimum rep) is the pattern to
copy: the rule is stated pre-emptively, at the moment of action, and again on
refusal. It is the only rule in the app explained at all three moments.

---

## Scope

### In this build

- Read layer computing accuracy, coverage and recency across all six modules
- The tree, sorting, filtering, URL state, reset
- Tap-to-drill filtered to the tapped row where the module supports it
- Rating scale change everywhere a human self-rates practice, including the
  drill buttons, plus the separate lesson scale in Production
- Wipe of existing S&P and Repertoire ratings and coverage
- Info affordances embedding every definition in the UI — the full list is in
  **Legibility requirement** above, and it is a shipping requirement
- Reading both repertoire practice and repertoire test (built elsewhere)

### Stage two

**Mixed-module drilling.** Filter across modules, hit start, and the drill
serves exactly those items back to back — a Reading key-signature card, then
an ET interval, then another Reading card.

CC's audit found no screen renders cards from more than one module in one run.
It needs a `MixedDrillRunner` keyed on `{moduleRef, itemRef}` pairs dispatching
through an adapter registry, plus one adapter per module. Reading is nearly
free; ET intervals means untangling a 520-line component where the card, the
13-button answer grid, the feedback panel and the stats modal are all one
thing. Post-answer surfaces differ enormously between modules — Reading draws
a mnemonic staff and an 88-key diagram, intervals draws a 3-octave keyboard —
which CC flagged as real design work, not plumbing.

Deferred because the list is useful without it. Tapping a row and drilling
that module is a minute of friction, not a wall.

### Queued after this build

**Repertoire matrix rebuild** — next build after the dashboard. The matrix
under the lead sheet is broken: cells are not clickable, the learning key
shows D on a song only ever played in A♭, and "Learning status" and
"Cross-key mastery" are two overlapping cards with unclear separation.
Should follow the Shapes & Patterns grid pattern so the two measure similar
things in a similar format.

### Design items — need their own design pass

1. **Spacing state for section ratings and S&P.** A section self-assessment is
   exactly the kind of event SM-2 consumes. Rate it hard, it comes back soon.
   Never wired. Until it is, the due filter returns nothing from repertoire
   and S&P. Needs decisions on what each rating maps to in SM-2 terms and what
   happens to existing `drillSessions` rows.

2. **Track playback variation on chord recognition attempts.** Blocked vs
   broken and ascending vs descending are different skills but currently
   honour-system — both buttons available, neither recorded. Tracking them
   would let them become item identity.

3. **Chord progression naming audit.** Tier names and progression labels
   ("The Mariah R&B turnaround", "The bossa nova standard") were generated,
   not chosen, and do not resonate. Compounded by there being no reference
   audio to learn what they sound like.

4. **Rebuild the chord progression catalog.** Pare down to common basic
   progressions and derive the rest from Song Repertoire. Related to but
   larger than the naming audit.

5. **Harmonic Fluency category review.** *Restated 20 Aug 2026 — the original
   framing was wrong.* There is no 12-vs-14 disagreement to reconcile: the
   catalog has **15** categories and the sidebar simply deep-links 12 of them,
   missing pentatonic scales, tritone pairs and enharmonic equivalents.
   "Harmonic diary" in that sidebar block is not a category at all — it is a
   dual-homed link to the separate `/harmonic-diary` module
   (`SidebarNav.tsx:107-110`). So the work is (a) add three missing links, and
   (b) the real question, whether all 15 categories earn their place.

6. **MIDI-in accuracy grading.** S&P and Song Repertoire are keyboard modules
   practised at a plugged-in keyboard, so MIDI is the path rather than audio —
   exact note numbers, exact timestamps, no pitch detection or overtone
   problems. Needs decisions on note matching against expected shapes, timing
   tolerance, and what counts as a clean rep. Would supersede the self-rated
   fluency scale with measurement.

---

## Sequencing note

The five module-level problems above surfaced *because* of this design
session — they were invisible from outside. The temptation is to fix them
first.

Do not. The dashboard reads whatever exists; broken modules show up as honest
numbers, which is what makes them visible. Which of the five actually matters
is currently ranked by how annoying each was to discover, not by cost. Two
weeks of using the dashboard will rank them properly.

The stated goal is more time playing and less time building. Five module
rebuilds before any dashboard is the opposite of that.

---

## Catalog cuts — settled 20 August 2026

Two catalogs were audited against the code and cut. Both cuts follow the same
principle as the chord progression catalog rebuild: **keep what was chosen,
remove what was generated to fill a grid, and let it grow back when a specific
item is wanted.** Adding one back is a one-line edit, not a migration.

### Why the audit happened

Coverage denominators are moving to full catalog counts. That makes catalog
size load-bearing — 852 stops being trivia and becomes the number a percentage
is divided by. A denominator padded with shapes that will never be drilled is
misleading before the dashboard is even built.

### Chord shapes — 852 → 648

**The catalog keeps triads and sevenths only.**

| Group | Qualities | Rows each | Cells | Gating |
|---|---|---|---|---|
| Triads | 6 | 4 (root · 1st · 2nd · fluid) | 288 | 288 |
| Sevenths | 6 | 6 (root · 1st · 2nd · 3rd · fluid · supplementary) | 432 | 360 |
| ~~Extensions~~ | ~~14~~ | ~~1~~ | ~~168~~ | **cut** |
| ~~Special / sixth~~ | ~~3~~ | ~~1~~ | ~~36~~ | **cut** |

```
triads    6 × 4 × 12 = 288      288 gating
sevenths  6 × 6 × 12 = 432      360 gating  (−72 supplementary)
                       ───      ───
                       720      648
```

**Why the extensions went.** Two independently authored catalogs exclude
exactly the same six of them — the S&P tier ladder (`SP_TIERS`) leaves
`dom9`, `maj11`, `dom11`, `min13`, `maj7s11` and `dom7b13` untiered, and ET's
separately curated chord-recognition seed list omits the same six, spelling the
real territory as the voicing actually played (`dom7sus4` for `dom11`,
`dom9_13` for `dom9`, `dom7#9#5` for `dom7b13`). Nine of the fourteen were a
`{maj,min,dom} × {9,11,13}` grid filled completely; `maj11` and `dom11` put a
natural 11 a semitone above the major 3rd, the textbook avoid note, which is
why `maj7#11` exists separately.

**Why all fourteen went, not just the six.** Extensions have a voicing axis
that coverage cannot see. `defaultDrillTypesForQuality('extension')` seeds five
sub-skills — root voicing, skip-a-note, rootless 3-7/7-3, two-handed, flowing
between voicings — but they share **one** cell, one spacing row, one unit of
coverage. A triad's four sub-skills each get their own cell. So `Cmaj13`
silently held five times the practice of `Cmaj` root position and counted for a
quarter as much. Rather than build the voicing axis for shapes not yet chosen,
the shapes come out until specific ones are wanted.

**Why the sixth chords went.** `maj6`, `min6` and `6/9` are stylistic choices
played several ways, not shapes drilled the way triads and sevenths are.

### Mental visualisation — 600 → 504

Triads (216) and sevenths (288) with their inversions. The **96 extended
dominant voicings** are cut — the same generated-to-fill-a-grid pattern, and
they carry no inversion axis, so `quality → inversion → key` never had a shelf
for them.

`EXTENDED_DOM_VOICINGS` itself stays in `mentalVizVoicing.ts`. It is voicing-
engine data that the lead-sheet carousel also reads; only the enumeration into
`MENTAL_VIZ_ITEMS` is removed.

**Card design change — recorded, not yet built.** The card should show a
specific set of notes and ask *which chord is this*, rather than naming a chord
and asking the player to picture it. Naming a chord has ten valid voicings;
showing C–E–G–A has one right answer — and that answer might be C6 rather than
Cmaj13, which is exactly the discrimination worth training.

This makes mental visualisation the same skill as Reading's chord
identification and ET's chord recognition, tested through a third sense. It
also turns `MentalVizItem.prompt` into the *answer* rather than the question,
so it needs a distractor model like ET's.

Note the interaction with the cut: the **answer set should stay the full 29
qualities** even though the drill catalog is 12. `QUALITY_INTERVALS` is a
separate map holding every chord formula and is untouched by the cut. Keeping
what the app *knows* richer than what the player *drills* is what makes the
C6-vs-Cmaj13 distractor possible at all.

### The denominator, stated

> **648 = quality × key × inversion-state, supplementary rows excluded.**
>
> It does **not** multiply by hand (left / right / both) or by style (solid /
> arpeggiated), even though `spacingState` is keyed
> `[moduleRef+itemRef+hand+style]` and each combination carries its own
> independent SM-2 row. Drilling C major root position right-hand-solid and
> again left-hand-arpeggiated is two spacing rows and **one** covered cell.
>
> The cell is the shape in the key. Hands and articulation are ways of
> practising it, not separate things to know — and collapsing them keeps the
> number comparable with every other module, none of which have a hand axis.

`moduleItemCounts.shapesCounts()` and `spTiers.tierTotalCells()` already
collapsed this way. What changed is that it is now stated, here and in the UI
affordance, instead of inherited.

**The 72 supplementary rows stay excluded**, and now get surfaced. They are the
two-handed LH-root + RH-triad drills — practice tools, not shapes to own.
Folding them in would put them in the same number as knowing Cmaj7 in second
inversion. At 72 of 720 materialisable rows they are 10% of the catalog, too
large to stay `[INVISIBLE]` (see `docs/RULE_LEGIBILITY.md` §1.7).

### Structural consequence — two catalogs, not one

`CHORD_QUALITIES` was doing two unrelated jobs: naming what the player drills,
and naming what the app can voice. Cutting the first silently broke the second
— the lead-sheet voicing carousel derives 17 system voicings from it and
auto-prunes rows that fall out of the desired set, and
`voicingQualityMap.qualityIdFromSuffix` builds its suffix table from it, so a
`C6/9` on a chart resolved to a dominant-7 voicing.

`QUALITY_INTERVALS` is the seam. It holds all 29 chord formulas and is
independent of the drill catalog. The carousel and the suffix map are
re-sourced from it plus an explicit suffix table, so **what I practise** and
**what the app can voice** move independently from here on.

### Two-tier system

`SP_TIERS` tier 3 (8 qualities) and tier 4 (3 qualities) were entirely
extension and special — both become empty under the cut. Rather than leave
empty buckets, `SPTier` narrows to `1 | 2`.

Leaving tiers 3 and 4 in place "for later" would reproduce the fill-the-grid
habit the cut exists to end. When a quality is added back it gets a tier
containing the shapes that were chosen.

---

## Design items recorded, not scheduled

### Personal voicing library

A player should be able to add a voicing they like — from a tutorial, from a
song they are learning, from anywhere — and have it become drillable in mental
visualisation.

The pieces already exist and do not know about each other: the lead sheet
already stores voicings (`db.voicingPatterns`, user rows with
`isSystem: false`), and mental visualisation already drills shapes. Nothing
connects them.

**The model:** a **core catalog** — triads, sevenths, inversions, the 504 —
plus a **personal library that grows**. When a new voicing is added, the app
asks *at drill time* whether to include it in coverage. **Suggest and confirm,
never automatic** — silently moving someone's denominator is the failure this
whole redesign exists to prevent.

This is where the voicings that were cut or never built would live:

- Rootless right-hand voicings over a root — e.g. C in the left hand,
  E–A–B♭–D in the right (a C13). A specific voicing system worth adding
  deliberately, not a subtraction from an existing catalog.
- Drop-2 voicings.
- Octave-doubled voicings.
- Song-specific voicings learned from a particular recording.

Needs its own design pass: how a personal item enters spacing state, whether it
joins the same coverage denominator or a parallel one, and what happens to
coverage history when the library grows.

---

## Revision log

### 20 August 2026

Eleven corrections, from decisions taken after the 13 August session and from
the read-layer audit of the catalogs. Each is marked inline at the place it
applies; this is the index.

| # | What moved | From → to | Where |
|---|---|---|---|
| 1 | Harmonic Fluency categories | 14 → **15** | Module trees → Harmonic Fluency |
| 2 | Production vocabulary categories | 16 → **17** | Module trees → Production |
| 2b | "Clusters" → "categories" | UI rename confirmed | Module trees → Production |
| 3 | Reading key signatures | "two per key" → **78 items over three directions, 2 tree rows per key** | Module trees → Reading |
| 4 | ET chord motion denominator | 42 → **132** | Module trees → ET chord progressions |
| 4b | Denominator rule stated generally | *new* — full catalog, never filter scope | The three columns → Coverage |
| 5 | ET scales & modes | 9 flat → **9 modes × 2 tabs = 18** | Module trees → ET scales & modes |
| 6 | Repertoire sections | ambiguous → **`songSections` authoritative, matrix is a synced mirror** | Module trees → Song Repertoire |
| 7 | Fluency scale reach | S&P + Repertoire → **everywhere a human self-rates practice** | Rating scales |
| 8 | Lesson scale | *added* — coverage threshold is "tried it" | Rating scales |
| 9 | `excludeFromFluency` | *new section* | The three columns |
| 10 | Repertoire practice vs test | *new* — settled design, build in flight | Module trees → Song Repertoire |
| 11 | Legibility requirement | *new section* | Legibility requirement |

**Numbers checked and left alone**, because they were already right: 375 HF
cards · 199 vocabulary cards · 56 lessons over 6 paths · Reading 34 / 7 / 78 /
69 = 188 items · 9 modes · 4 ET chord-recognition types · 96 S&P scale cells.

### 20 August 2026 — later the same day

Chord shapes cut 852 → 648 and mental visualisation 600 → 504, after a
full catalog audit. See **Catalog cuts**. This resolves items 1, 2 and 3 of
**Found stale, not resolved** below and adds the two-catalog split
(`QUALITY_INTERVALS` as the seam between what is drilled and what can be
voiced). The **Personal voicing library** is recorded under **Design items
recorded, not scheduled**.

**Text left alone** everywhere the correction did not reach it. This was an
edit, not a rewrite.

---

## Found stale, not resolved

Turned up while applying the above. **Flagged, not decided** — each needs a
call that was not in the corrections.

**1. Mental visualisation is not "the same catalog as chord shapes".**
*RESOLVED 20 Aug — the 96 extended dominant voicings are cut (see **Catalog
cuts**), and mental viz is **its own module row**, not part of the Shapes &
Patterns tree. It writes spacing rows under the dedicated `mental-viz`
moduleRef and is deliberately excluded from every S&P coverage number (an
April 27 design call, `RULE_LEGIBILITY` §1.6); folding it into S&P would
reverse that quietly. The **Shapes & Patterns** tree section below still
describes it as a fourth submodule — that text is stale, and the module trees
should read S&P as three submodules with mental visualisation alongside them.* The doc said so; `mentalVizLibrary.ts` says 600 = 216 triads (6 × 3 inversions × 12
keys) + 288 sevenths (6 × 4 × 12) + **96 extended dominant voicings** (8 × 12).
The extended voicings have no inversion axis at all — their ids look like
`mv:dom9_13:A:G` — so the proposed `quality → inversion → key` tree has no
shelf for a sixth of the module. Worse, `RULE_LEGIBILITY` §1.6: mental-viz uses
its own `mental-viz` moduleRef and is **excluded from every S&P coverage number
today**, deliberately, as an April 27 design call. The doc puts it inside the
S&P tree with its own coverage. Needs a call: own module row, or fold into
S&P and reverse that decision.

**2. Chord shapes is not four inversion rows.** *RESOLVED 20 Aug — extensions
and special are cut, so the catalog is now triads (4 rows) and sevenths (6),
and the doc says so.* The doc said four (root / 1st /
2nd / fluid). `INVERSION_STATES_FOR_CHORD_SHAPE_KIND` says it depends on the
quality's kind — triads 4, sevenths **6** (adding 3rd inversion and
`supplementary`), extensions and special/sixth **1** with no inversion suffix at
all. There are 29 qualities, not one shape. The doc's "four, not three" is
right for triads and wrong for everything else.

**3. That same code already breaks the new denominator rule — and may be
right to.** *RESOLVED 20 Aug — the exception is kept and stated. See the
denominator statement under **Catalog cuts**.* `gatesAcquisition()` filters `supplementary` rows out of coverage
denominators (`RULE_LEGIBILITY` §1.7): they are two-handed practice tools, not
things to acquire. That is an existing, deliberate exception to "the
denominator is always the full catalog". Either the rule needs an "excluding
rows that are practice tools rather than acquisition targets" clause, or the
supplementary rows need to start counting. Both are defensible; neither is
what the doc currently says.

**4. Coverage denominators today are not catalog counts at all.**
`RULE_LEGIBILITY` §1.5: they are spacingState-row cardinality.
`src/lib/moduleItemCounts.ts` states it outright — *"the user-facing card count
for Ear Training is 134; the coverage denominator is 143."* So correction 4's
rule contradicts the **implementation**, not just the old doc, and the read
layer has to change to honour it. Compounding this: S&P skill rows are
**materialised lazily when you open a cell**, so a row-count denominator grows
as you browse. Browsing is not practice and must not move a denominator.

**5. `excludeFromFluency`'s "fewer than 4" is two different rules.**
`RULE_LEGIBILITY` §1.3: the threshold is `< 4` in all eight call sites, but ET
measures items *selected* (`focusKeys.length`) while HF and Production measure
cards *in queue* (`cards.length`). Same flag, same notice, different question.
And §1.2: in Harmonic Fluency a focus-protected rep **also skips
`recordAttempt`**, so it moves no SM-2 state — meaning the flag does not only
leave accuracy alone, it leaves the **due filter** alone too. Drill a flagged
card ten times and it is still due tomorrow. Correction 9's two-line rule
("excluded from accuracy, counted toward coverage") is true but not complete.

**6a. `read/shapesScope.ts` duplicates `goals/scopeEnumeration`.**
*Accepted 20 Aug 2026, logged as a seam.* Both walk the same S&P catalog
constants to produce the same ref list. The read layer cannot import the goals
version — its enumerators are private, and pointing the read layer into goals
is the wrong dependency direction — and a goals refactor mid-workstream is not
worth it. If the two ever drift, this is where.

**6. There is already a dashboard read layer.**
`src/modules/dashboard/aggregation.ts` computes accuracy with its own
20-attempt slice and its own `excludeFromFluency` filter (`:44-52`), and
`RULE_LEGIBILITY` §1.12 flags it as one of **three tier computations that can
disagree** — the dashboard, the skills catalogue and the in-quiz tracker can
show different tiers for the same item. The doc reads as greenfield. Extend or
replace is a real decision, and if it is replace, the other two consumers are
in scope for reconciliation.

**7. Chord motion practice reps write nothing.** `ChordMotionTab.tsx:583` —
`if (round.isPracticeRep) return;`, no attempt row at all
(`RULE_LEGIBILITY` §2.2). Against a denominator of 132 this will read as badly
under-covered relative to actual practice. The doc's sequencing note says
broken modules showing up as honest numbers is the point — but this one is a
number that is honest about the *database* and dishonest about the *practice*,
which is a different thing.

**8. Old rating vocabulary still lives in the backfill path.**
`src/lib/spacingStateBackfill.ts:200,282-292` maps a 1–5 "feel" to
flying / cruising / crawling, with a comment noting "breakthrough" was already
dropped and that it deliberately does **not** retroactively downgrade old
breakthrough sessions. The scope says old ratings are wiped, not migrated. What
happens to this backfill path is unstated — it either goes away with the wipe
or it keeps generating the vocabulary the wipe is supposed to end.

**9. Scales & modes tab labels have to change in two places.** The corrected
labels — "hear simple scale" / "hear mode in context" — replace the app's
current "hear the scale" / "sit inside the mode" (`ScalesModes.tsx:174-175`).
Noted in the tree section, repeated here because it is a drill-side edit
sitting inside a dashboard build, same as the rating buttons.

**10. Two documentation roots.** Design docs live in both `docs/` and
`src/docs/`. `src/docs/SCALES_SUBMODULE_DESIGN.md` and
`src/docs/VOICE_LEADING_SUBMODULE_DESIGN.md` both still specify
Flying / Cruising / Crawling as the rating scale. Correction 7 supersedes them,
but nothing in those files says so, and they are the ones a future session is
likely to open when building an S&P submodule.
