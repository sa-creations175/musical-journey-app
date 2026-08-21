# Build Queue

**Source of truth for what is next.** Created 20 August 2026.

Mirrored in Notion for when I am away from the terminal. **This file wins.**
The Notion copy will drift, and that is expected rather than confusing — it is
a reading copy, not a second queue.

**The order is deliberate.** Practice vs test is foundational to how repertoire
gets recorded at all, and the drill entries are what make the dashboard
actionable rather than informational. Do not reorder without a reason worth
writing down here.

Each entry says what it is, why it matters, and where its design lives. Where
there is a design doc, this file links to it rather than restating it — a
second copy of a decision is a decision that can disagree with itself.

---

## Next up

### 1. Repertoire practice vs test — step 3

**What.** The two-mode surface: a practice mode and a test mode. A persistent
timer that survives navigation, an activity multi-select, and section tags that
stay optional.

**Why.** Practice and test are different events and the app currently cannot
tell them apart. Practice is song-level and has no pass or fail — "40 minutes,
couldn't tell you which sections" is a complete record. Test is per section per
key and is the one that can fail. Until both exist, an hour of noodling and a
clean run-through are the same row.

**State.** Designed and audited. Steps 1–2 shipped. **Paused mid-flight for a
drawer bug and never resumed** — so the first job is finding where it stopped,
not starting.

**Design.** `DASHBOARD_REDESIGN_DESIGN.md` → *Module trees → Song Repertoire →
Practice and test are different events*. The dashboard already reads both:
coverage counts practice, the score counts clean test run-throughs.

---

### 2. Dashboard drill entries

**What.** Tap a row, land in the drill with that row's items already selected.
Chord recognition, chord motion and scales & modes share one mechanism and are
nearly free — the earlier audit put all three on the same hook. Repertoire is a
different shape and comes after: opening the matrix **at a section** rather than
filtering a pool.

**Why.** This is what makes the dashboard actionable rather than informational.
Right now a row can tell you where you are weak and then hand you the whole
module. Intervals and Reading already carry `focus` in the URL and nothing
reads it, so the dashboard side is done and the drill side is not.

**Design.** `DASHBOARD_UI_SPEC.md` → *Tap to drill* · `DASHBOARD_REDESIGN_DESIGN.md`
→ *Layout and interaction → Tap to drill*. Note the load-bearing negative case:
`drillTargetSummary` reports `filtered: false` so a row can never imply it
narrowed a drill it could not narrow.

---

## Queued

### 3. Per-song enharmonic spelling

**What.** Spelling chosen per song rather than globally, so a chart in G♭ reads
in flats and one in F♯ reads in sharps.

**Why.** **Currently blocking lead sheet work.** No design doc yet.

---

### 4. Song detail page — collapse the three progress cards into one

**What.** One progress card in place of three overlapping ones.

**Why.** "Learning status" and "Cross-key mastery" already have unclear
separation, and a third card compounds it. Adjacent to the matrix rebuild
rather than part of it.

**Design.** `DASHBOARD_REDESIGN_DESIGN.md` → *Queued after this build →
Repertoire matrix rebuild* names the overlap. No design for the collapse yet.

---

### 5. Per-node regrouping and custom module order

**What.** Two halves of one want: pin the modules being focused on to the top
regardless of sort, and offer an alternate grouping of one row's children — key
signatures by relative pair or by major/minor, intervals by size or by
direction, chord shapes by inversion or by key.

**Why.** The list currently has one shape. Priorities change by season and nav
order is a good default, not a permanent one.

**Design.** `DASHBOARD_UI_SPEC.md` → *Let me control the arrangement*, which
lists the open questions: which nodes offer it, whether the choice persists,
how it composes with sorting, and whether a pin survives a reset.

---

### 6. Chord progression catalog rebuild

**What.** Pare down to common basic progressions and derive the rest from Song
Repertoire.

**Why.** The current catalog and its names were generated rather than chosen,
and do not resonate. Compounded by there being no reference audio to learn what
they sound like. Larger than, and containing, the naming audit.

**Design.** `DASHBOARD_REDESIGN_DESIGN.md` → *Design items — need their own
design pass*, items 3 and 4.

---

### 7. Repertoire chord flashcards

**What.** Memorising a section's changes away from the keyboard.

**Why.** The one repertoire skill that does not need an instrument, and so the
one that fits the gym case the dashboard was designed around. No design doc
yet.

---

### 8. Personal voicing library

**What.** Add a voicing you like — from a tutorial, a song, anywhere — and have
it become drillable in mental visualisation.

**Why.** The pieces exist and do not know about each other: the lead sheet
already stores voicings, and mental visualisation already drills shapes. This
is where rootless right-hand voicings, drop-2s, octave doublings and
song-specific voicings would live.

**Design.** `DASHBOARD_REDESIGN_DESIGN.md` → *Design items recorded, not
scheduled → Personal voicing library*. **Suggest and confirm, never automatic** —
silently moving a denominator is the failure the whole redesign exists to
prevent.

---

### 9. Spacing state for section ratings and S&P

**What.** Wire self-assessments and section ratings into SM-2.

**Why.** A section self-assessment is exactly the kind of event SM-2 consumes:
rate it hard, it comes back soon. Until this lands, the due filter returns
nothing from repertoire or S&P.

**Design.** `DASHBOARD_REDESIGN_DESIGN.md` → *Design items*, item 1. Needs
decisions on what each rating maps to in SM-2 terms and what happens to
existing `drillSessions` rows.

---

### 10. MIDI-in accuracy grading

**What.** Grade S&P and Song Repertoire from a plugged-in keyboard — exact note
numbers, exact timestamps, no pitch detection.

**Why.** **Would supersede the self-rated fluency scale with measurement**,
which is why it sits last: everything above it is cheaper and none of it is
wasted by this landing. Its own design job, not a build task.

**Design.** `DASHBOARD_REDESIGN_DESIGN.md` → *Design items*, item 7. Needs
decisions on note matching against expected shapes, timing tolerance, and what
counts as a clean rep.

---

## Also carried

Smaller open items already logged where they were found. Listed here so the
queue is the only place you have to look, not so the detail moves.

| Item | What is open | Where it lives |
|---|---|---|
| **468 raw-itemRef labels** | 96 scale cells read `major:C` and 372 voice-leading cells read `five-one:guide-tones:posA:Eb`. Both real label sources exist and neither is read — a wiring job, not a design one. The count is pinned in `catalogs.test.ts` so it cannot grow quietly. | `DASHBOARD_UI_SPEC.md` → Outstanding item 6 · `RULE_LEGIBILITY.md` §1.8b |
| **`SHAPES_DEFAULT_TIME_PER_REP_MINUTES`** | Derives 1.66 from `852` and `1272`, pre-cut totals stale since the catalog went to 648 and now doubly so at 720. Nothing breaks; the comment no longer supports the number above it. | `DASHBOARD_REDESIGN_DESIGN.md` → *Found stale, not resolved*, item 0 |
| **Mental visualisation rating scale** | Still on flying / cruising / crawling. The read layer projects the three onto the four-step fluency scale via `MENTAL_VIZ_RATING_PROJECTION` — the one number in the read layer not read off stored data. Migrating the drill makes removing the projection a single edit. | `DASHBOARD_REDESIGN_DESIGN.md` → *Design items*, item 6 |
| **Reading key-signature overlay tier** | `OVERLAY_MIX` is defined and `renderCard` passes `keySignature: null` for every chord card. A harder tier — chords read in the context of a key — was designed and never wired. **A design question, not a feature to schedule**: does the sterile version teach chord reading or delay it? | `DASHBOARD_UI_SPEC.md` → *The key-signature overlay tier for chord cards* |
| **Two meanings of "covered"** | `acquisitionStage` reaching `acquired` gates goals and session selection; the dashboard covers an item at 3 attempts. Two rules, both called coverage, and two surfaces can disagree about the same item while both are correct. Same shape as the three disagreeing tier computations. | `RULE_LEGIBILITY.md` §3.1 · §1.12 for the parallel |

---

## Recently landed

Kept short and pruned as it ages — enough to see what the queue just came out
of, not a changelog.

| Date | What |
|---|---|
| 20 Aug 2026 | **Dashboard step 8 — the route swap.** `/` is the new screen. Old one at `/dashboard-old` for a few days' comparison; `/dashboard-next` redirects to `/` keeping its query string. **Deletion is a separate commit** — `Dashboard.tsx` and `aggregation.ts`'s snapshot functions are still live. |
| 20 Aug 2026 | **Dashboard steps 1–7b.** Read layer, screen, row, controls, sticky headers, tap-to-drill targeting, and the legibility layer: both column legends, four `?` panels, and a per-row `i` giving what a row trains, what would advance it, and what is odd about its numbers. |
| 20 Aug 2026 | **Supplementary rows count** — chord shapes 648 → 720. Found by writing the legend that explained the exclusion. `RULE_LEGIBILITY.md` §1.7 closed by removing the rule rather than surfacing it. |

---

## How to use this file

**Update it as items land**, in the same commit as the work where that is
natural. An entry moves to *Recently landed* with a date; a new one goes in at
the position its reasoning earns, with that reasoning written down.

**Add to *Also carried* rather than *Queued* when the item is small and already
documented elsewhere.** The queue is for things that need a build slot; the
table is for things that need to not be forgotten.
