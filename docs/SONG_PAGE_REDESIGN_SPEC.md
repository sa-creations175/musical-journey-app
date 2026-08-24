# Song Page Redesign — Spec

Settled 21 August 2026, ~5:00 PM PT. Absorbs build-queue items 3c, 3d and 3e.
Quadrant-grid, status-walkthrough and post-3d-5 revisions added 23 August 2026.
The principle corrected 23 August evening — see below.

---

## The principle

The matrix is the song's dashboard — the same role the app dashboard plays for
everything else. Status by section, by key.

**The matrix is the single entrance. Cells for section work; rows for claims
about the whole song in a key.**

*(Corrected 23 August. This section originally read "every practice and every
test starts from a cell", which was written before we knew "test" meant three
different things at two different grains.)*

There are three:

| Surface | Grain | Gate | Moves the retest clock |
|---|---|---|---|
| Cell test | section × key | 3 consecutive clean, streak carries across opens | no |
| Whole-song test | key | 3 consecutive clean, resets to 0/3 every open | **yes — the only writer** |
| Single run | key | none, one pass | no |

**The grains cannot be collapsed.** A whole-song test is a claim about the
whole song; offering it from a Chorus cell would invite logging a whole-song
run as though it were a section. That is a data problem, not a layout
preference. The cell test opens from a cell; the whole-song test and the
single run stay on the row.

## Stage is derived, never stored

`songs.stage` stops being a written value. Stage is computed from
`stageCriteria`, which already exists as of 3a-6a.

No change-stage dropdown. No "advance to Comfortable" button. No override.

> Play it. Prove it. Three times.

The ladder is unchanged: **learning → comfortable → cross-key →
internalized**, with maintenance as a mode flag rather than a fifth rung.

## Page structure, top to bottom

1. **Metadata** — title, artist, original key, tempo, time signature, why this
   song, the reference links, and my associations. Links are clickable
   anchors.
2. **Matrix** — derived stage and *what would advance this song* in its
   header, a link to the practice calendar, then the grid.
3. **Lead sheet**
4. **Danger zone**

**The status must be visible without scrolling.** The whole point of the
matrix being the song's dashboard is defeated if the status sits below the
fold. Everything above it earns its height or loses it.

## The cell panel

Tap a cell → chooser: `Practice` / `Test`.

### Practice

The timer starts immediately on entering practice mode. No second tap.

The panel shows:

- elapsed time, pause
- metronome + BPM, **with the same rhythm and style options the global
  metronome offers** — a reduced metronome is the wrong metronome for a ballad
- section ticks, labelled *"Select the sections you're working on in this
  practice session"*, the tapped cell pre-ticked, plus *select all*
- **a prominent `Open lead sheet` button** — full-width, primary weight, never
  hidden behind a menu, and not green (green is already doing work elsewhere
  on the page)
- `Done`

Tapping `Open lead sheet` collapses the panel to a bar pinned at the top of
the screen and opens the lead sheet beneath it. The bar keeps elapsed, pause,
metronome, BPM and Done. Tapping the bar restores the full panel.

**The timer never leaves the screen.**

`Cancel` means *I didn't mean to start this* — it stops the timer and logs
nothing, but only a timer it started. One adopted from elsewhere keeps
running.

`Done` pauses the clock. `Log it` writes. Backing out of the rating step
resumes rather than discarding.

### Test — the cell test

Three clean at tempo, in a row, makes that section comfortable in that key.
The streak carries across opens rather than restarting, because ordinary work
accumulates while a graduation is assembled in one sitting.

Timed, not rated. The rating step does not appear after a test: "what kind of
work was it" has one answer, and the test's own outcome records how it went.

## The rating step

Opens on `Done`. Sections confirmed, kind of work, how it went — and the
away-time question when there is an unresolved gap.

Nothing in it is required. Duration is the record; everything else is
optional, and an unanswered field is omitted rather than written empty.

**The feel scale is the existing one**, extracted to a shared component so a
second scale cannot appear beside the first.

## Activity vocabulary

- building the lead sheet
- watching a tutorial
- getting it under the fingers
- practising in time — *hint: to a click*
- just playing — *hint: not working on it*
- something else (free text)

Stored as stable slugs, not labels, so rewording never rewrites history.

**"Practising in time" is not inferable from the metronome running.** The
metronome being available doesn't mean it was used, and deliberately
practising to a click is a distinct kind of work — one worth being able to see
the frequency of, precisely because it's the one that gets skipped. It is
never pre-ticked and never derived.

**"Just playing" is distinct from working on a song.** It's a real share of
time at the keyboard, and a song that keeps getting just-played is alive in a
way the matrix won't otherwise show. It is not a lesser kind of practice — it
lands in the same field as the rest.

Rejected: *test prep*. It records a state of mind rather than an activity —
the work itself is still getting it under the fingers.

The list records **what you did**, not why you did it or how ready you felt.

## A run records section × key

Not just the song. This is what has been missing — practice work has had
nowhere to land except a total.

## RUN is hidden until it counts

A clean run advances nothing at Learning or Comfortable — it only feeds
internalized's breadth criterion. So the button appears only from Cross-key
onward, and only on keys where a pass contributes. It also stays hidden when
no performance tempo is set, since "clean at tempo" is undefined without one.

**There is no honest label for a button that does nothing.**

Note: there are no non-quadrant keys. All twelve sit in a quadrant, four
quadrants of three. Internalized needs a clean run in every key not already
held, so the denominator is dynamic.

## Language conventions

Applied everywhere statuses and keys are named:

- **Rung names always carry "status"** — "Cross-key status", "Comfortable
  status". Without it they read as jargon rather than levels.
- **Key names always carry "key" or "keys"** — "the key of A", "keys A, D or
  G". A bare letter at the start of a sentence reads as a word.
- **State rules precisely.** Cross-key status requires *one key at Comfortable
  status or above from each of the four quadrants* — not four specific keys.
- **Buttons name actions.** "Open lead sheet", not "Lead sheet". Chips that
  label what happened are not buttons and stay lowercase.
- **Counts count the work and name the unit** — `0 of 1 test`,
  `1 of 4 quadrants`, `0 of 8 keys run clean`. Never a count of criteria
  satisfied. The unit comes from the criterion, never written beside it.

## The quadrant grid

The clearest statement of the cross-key criterion, so it appears wherever that
criterion appears — not only in the aftermath of a demotion.

```
C ✓   F ✓   B♭        covered
E♭    A♭ ✓  D♭        covered
G♭    B     E         —
A     D     G         —
```

- Row order is fixed, so the position of each key becomes learnable.
- Every covered key is marked in place, not a single named holder.
- The right-hand column answers the only question the rule asks.
- A lapsed key carries its state inline: `A ⚠   D     G     overdue 9d`

## The criteria panel

Collapsed by default to one line — heading plus the current rung's count.
Open state remembered between visits.

Expanded, it accumulates: grouped by the rung each criterion earns, earned
rungs ticked and visible, the current rung expanded, unreached rungs collapsed
to a heading and a count.

**A tick is not permanent.** A ticked group un-ticks when the key behind it
lapses. This is a live reading, not an achievement log, and the copy says so.

## The moment a status is earned

The panel expands. The tick lands where you are already looking. The group
closes as the next opens. The badge changes last and says why.

**No modal.** You are at the piano with your hands on the keys, and a dialog
is a worse reward than a page that visibly changed.

`stageEarnedAt` is stored and cleared when the next practice is logged — the
thing that supersedes it retires it, rather than an arbitrary clock.

**Within-rung progress gets no moment.** Meeting one criterion without
changing rung moves the count on the collapsed header, which is the right size
of feedback for that size of event. If every criterion got the full treatment,
the one that matters would stop feeling different.

## The status walkthrough

An ⓘ button beside the derived status in the matrix header, matching the
existing pattern (MATRIX ⓘ, LEAD SHEET ⓘ, PRACTICE HISTORY ⓘ).

It opens the whole ladder, cold-readable rather than only legible when
something has just happened:

- the four statuses in order, and what each requires
- the quadrant grid
- how re-testing works — the interval stretching, the four due states
- what causes a demotion, and what brings a status back

Distinct from the cross-module spacing settings surface, which answers a
different question: what the interval rules are across every module, and how
to change them.

## Decay and retest

Nothing is permanently solid. A song's rung is a claim, and the claim needs
re-proving.

**The schedule is SM-2, not a flat window.** The same spacing engine the
drills use. Intervals stretch with each pass. This is the "held by periodic
checks" half of maintenance that was queued and never built, and it replaces
the flat 30-day `isHeld` lapse.

**Four states:**

- **Held** — proven recently enough that the claim stands
- **Due soon** — 7 days before due
- **Due** — time to prove it again
- **Overdue past 7 days' grace** — the rung drops

Four spacing settings, all adjustable, with a live sequence preview: first
interval (2 days), longest interval (30), due soon (7), grace (7).

**Demotion lands on the rung whose criteria still hold** — not straight to the
bottom.

**Demotion is never silent.** The song page states that it happened, the date,
and which criterion stopped being met. It persists until something changes it
— not a toast. Quadrant holders are snapshotted at the moment of the drop, not
read live.

**The rule is visible before it acts, not only after.**

**Where "due" appears:** the songs list, a banner on the song detail page, and
highlighted on the dashboard.

## Deleted

- **Cross-Key Mastery card** and `songCrossKeyProgress`
- The change-stage dropdown and the advance button
- `PracticeLogModal`, "+ log a practice session", and `CellInteractionModal`
- The bottom timer strip — it lives in the panel now
- "Why this song" and "My associations" as separate cards — folded into
  metadata
- **"Practice history" as a separate card** — becomes a calendar view reached
  from a link at the top of the matrix card

**Replace before deleting.** A working surface stays until its replacement
exists.

## Stale data cleaned

Original-key rows seeded to `learning` by the old matrix migration
(`matrixMigration.ts:106`), timestamped with the song's added date rather than
any practice. Five songs carried one. Cleared from Settings.

## Why the page was incoherent

Recorded so the reasoning survives:

- "Learning" appeared eight times on one page from three independent sources —
  `songs.stage` (stored), `computeSongLevelState` (derived), and
  `songCells.cellState`. The stored badge and the derived pill could disagree
  indefinitely and both be correct.
- Matrix and Cross-Key Mastery were the same twelve keys by the same sections,
  transposed, over two completely disjoint tables.
- The timer was buried at the bottom of the page, under Danger Zone, inside
  Practice History.
- The matrix cells stretched to fill the card, so a song with **fewer**
  sections got a **taller** matrix. That one bug was ~2,080px of the ~2,400px
  the layout pass recovered.
