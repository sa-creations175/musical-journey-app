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

### 1. Repertoire practice vs test — the song page redesign

**What.** The two-mode surface: a practice mode and a test mode, both entered
from a matrix cell. A timer that survives navigation, an activity multi-select,
and section tags that stay optional.

**Why.** Practice and test are different events and the app could not tell them
apart. Practice is song-level and has no pass or fail — "40 minutes, couldn't
tell you which sections" is a complete record. Test is per section per key and
is the one that can fail. Until both exist, an hour of noodling and a clean
run-through are the same row.

**Design.** `claude/SONG_PAGE_REDESIGN_SPEC.md`, which is **in the Claude
Project and not in this repo** — a terminal session cannot read it and must ask
for the relevant section rather than working from the code alone. It is current
and it wins over anything under `docs/`. `DASHBOARD_REDESIGN_DESIGN.md` →
*Module trees → Song Repertoire → Practice and test are different events* still
holds for why the split exists.

**State, 23 Aug 2026. The test half shipped as step 3a; the practice half is
roughly two-thirds built.** The previous version of this entry said the
practice half was unstarted. That was true on 21 August and was overtaken the
same week — the first thing to do here is read the table below, not go looking
for a stopped build.

**Landed 21–23 August 2026**, in ship order. **Step numbers are plan order, not
ship order.**

| Landed | Step | What |
|---|---|---|
| 21 Aug | 3d-0a | Four states for a key that needs re-proving — held, due soon, due, overdue |
| 21 Aug | 3d-0c | A demotion that says so, and survives being fixed |
| 21 Aug | 3d-0b | A key comes due on an SM-2 curve, not a flat 30 days, with four settings and a live sequence preview |
| 23 Aug | 3d-1 | The stage is derived, never stored — `songs.stage` becomes a watermark of the last observed derivation, so a drop has something to compare against |
| 23 Aug | 3d-2 | Phantom key rows cleared — five songs had an original-key row seeded to `learning` by the old migration, stamped with the song's added date |
| 23 Aug | 3d-1b | The hold rule stated before it acts, and the drop after |
| 23 Aug | 3d-3 | Cross-Key Mastery card deleted and `songCrossKeyProgress` writes stopped, in two parts |
| 23 Aug | 3d-4 | The page restructured — metadata absorbs why-this-song, the links and my associations; the matrix card carries the status |
| 23 Aug | 3d-5 | The cell panel — Practice / Test chooser, timer on entry, metronome, section ticks with select-all, Open lead sheet, collapse to a top bar |
| 23 Aug | 3d-6 | **The rating step.** Done pauses and Log it writes; sections confirmed, six activities as a multi-select, how it went on the existing four-step scale, and the un-attributed-time question given a surface at last. Nothing in it is required. |
| 23 Aug | 3d-7 | **The cell test.** Three clean runs at tempo make a section comfortable in a key. The two whole-song claims — "Test song" and "run at tempo" — stay on `KeyRow`, because a cell cannot honestly speak for a song and the two run tables exist to keep those claims apart. A test is timed and not rated. |
| 23 Aug | — | The layout pass: the matrix rebuilt on the shared `HeatCell` primitive and capped at 56px, two-column metadata, both cards reordered, the lead sheet drawers, and the criteria panel accumulating by rung with a moment when one is earned |

**The layout pass found one bug worth carrying.** `HeatCell` is
`aspect-square w-full` and the cells had no width ceiling, so a three-section
song gave each cell ~230px square and twelve rows came to ~2,760px — **a song
with fewer sections got a taller matrix.** Capping at 56px bought ~2,080px of
the ~2,400px the pass removed; everything else combined bought ~340px.

**What is left.**

| Step | What |
|---|---|
| 3d-8 | Retire `PracticeLogModal` and "+ log a practice session". `CellInteractionModal` retires alongside it — the panel now covers both its practice and its test halves, and it is still reachable wherever the matrix mounts without an `onCellSelected` handler. Its retirement is the trigger for item 3's cross-key decision — check that entry before starting, not after. |
| 3d-9 | The practice calendar, matching `ShapesAndPatternsCalendar`, replacing the practice history card. |
| 3d-10 | "Due" surfaced in the songs list and highlighted on the dashboard. |
| — | The ⓘ status walkthrough — designed, in the spec, never built. |

Item 10's due column and cross-module spacing settings queue behind all of it.

---

### 2. Dashboard drill entries

**What.** Tap a row, land in the drill with that row's items already selected.
Chord recognition, chord motion and scales & modes share one mechanism and are
nearly free — the earlier audit put all three on the same hook. Repertoire is a
different shape and comes after: opening the matrix **at a section** rather than
filtering a pool.

**Why.** This is what makes the dashboard actionable rather than informational.
Right now a row can tell you where you are weak and then hand you the whole
module.

**State, 21 Aug 2026. The pool half is done; the repertoire half is not.**
Five modules filter — intervals, reading, chord recognition, chord motion,
scales & modes — each end to end, from the tapped row to the drill's own pool.

**Tap-to-drill had never worked before that.** `drillTargetFor` resolves a row
against its CATALOG, and the screen was handing it the MODULE id, which for all
four ear-training catalogs is `ear-training`. Every one of those rows, intervals
included, fell through to "nothing to drill" with route `/` — the dashboard the
tap started on. Reading worked only because its two ids are the same string. A
node now carries its own `sourceId`, so the caller no longer passes one.

**Filterability turned out to be a property of a ROW, not a module.** Chord
progressions is one catalog holding four sub-drills, only one of which any focus
mechanism reads. A row is filterable only when every one of its refs maps.

**What remains: repertoire.** Opening the matrix at a section rather than
filtering a pool — a different shape, as this entry always said.

**Design.** `DASHBOARD_UI_SPEC.md` → *Tap to drill* · `DASHBOARD_REDESIGN_DESIGN.md`
→ *Layout and interaction → Tap to drill*. Note the load-bearing negative case:
`drillTargetSummary` reports `filtered: false` so a row can never imply it
narrowed a drill it could not narrow.

**Also landed here: the under-4 prompt.** Tapping a row whose pool is too small
to count says so and offers the nearest ancestor whose drill would count, with
both ways out available. The rule is one sentence in `lib/fluencyPool`, rendered
by the legibility panel, the in-drill notice and the prompt — it had been worded
three different ways, and three phrasings of one rule read as three rules.

---

## Queued

### 3. Song detail page — collapse the three progress cards into one

**What.** One progress card in place of three overlapping ones.

**Why.** "Learning status" and "Cross-key mastery" already have unclear
separation, and a third card compounds it. Adjacent to the matrix rebuild
rather than part of it.

**Design.** `DASHBOARD_REDESIGN_DESIGN.md` → *Queued after this build →
Repertoire matrix rebuild* names the overlap. No design for the collapse yet.

**Carried in from the practice-vs-test audit (20 Aug 2026).** Retiring
`PracticeLogModal` in item 1 removes one of the two writers to
`songCrossKeyProgress`. `CrossKeyGrid.tsx` is the other and stays live, so the
table does not go dark — but the two advancement rules that read it,
`internalized → cross-key` and `cross-key → maintenance`, will only ever fire
off a **manual grid tap**, never off a logged session. That is a real change in
when those suggestions appear, and it is deliberately not fixed in item 1: the
honest fix is to source cross-key coverage from `songKeys` / `songCells`, which
is the same retirement of the deprecated table this card collapse already
implies. Decide it here rather than twice.

---

### 4. Per-node regrouping and custom module order

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

### 5. Chord progression catalog rebuild

**What.** Pare down to common basic progressions and derive the rest from Song
Repertoire.

**Why.** The current catalog and its names were generated rather than chosen,
and do not resonate. Compounded by there being no reference audio to learn what
they sound like. Larger than, and containing, the naming audit.

**Design.** `DASHBOARD_REDESIGN_DESIGN.md` → *Design items — need their own
design pass*, items 3 and 4.

---

### 6. Repertoire chord flashcards

**What.** Memorising a section's changes away from the keyboard.

**Why.** The one repertoire skill that does not need an instrument, and so the
one that fits the gym case the dashboard was designed around. No design doc
yet.

---

### 7. Personal voicing library

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

### 8. Spacing state for section ratings and S&P

**What.** Wire self-assessments and section ratings into SM-2.

**Why.** A section self-assessment is exactly the kind of event SM-2 consumes:
rate it hard, it comes back soon. Until this lands, the due filter returns
nothing from repertoire or S&P.

**Design.** `DASHBOARD_REDESIGN_DESIGN.md` → *Design items*, item 1. Needs
decisions on what each rating maps to in SM-2 terms and what happens to
existing `drillSessions` rows.

**Also carries the maintenance half of the stage rules (added 20 Aug 2026).**
Maintenance stops being a fifth rung and becomes a mode on internalized:
*entered* by reaching internalized, *held* by periodic checks where the app
picks a key and asks for a run. Entry ships with the rule rewrite; the holding
half lands here, because a maintenance check is an SM-2 review and not a
bespoke timer. What exists already is per-key decay (`solidDecay.ts`, 14-day
fading / 30-day lapsed) driven by engagement timestamps — which is a different
thing from a check the user passes or fails.

---

### 9. Collapse the two song-progress ladders

**What.** Two things describe how far a song has come and neither knows about
the other. `songs.stage` is stored and hand-advanced (learning → comfortable →
cross-key → internalized). `computeSongLevelState` derives learning /
comfortable / solid / cross_key / internalized from `songKeys` + `songCells` at
read time, and is what the matrix and the goals module read.

**Why.** They can disagree on one screen while both are correct — the matrix can
read `cross_key` while the stage badge reads Learning. Same shape as the three
disagreeing tier computations in `RULE_LEGIBILITY.md` §1.12.

**Deliberately not fixed with the stage-rule rewrite.** The two Internalizeds
are different claims — the derived one is "3+ keys solid with the lived-with
gate", the stage one is "the four quadrant keys held plus one clean at-tempo run
in each of the remaining eight" — and routing either through the other would
force one definition to bend. What they now share is the vocabulary underneath:
`matrix/keyProgress.ts` holds quadrant membership, `isComfortableOrBetter` and
`isHeld`, and both sides read it. The collapse is deciding which ladder is the
real one, which is a design question, not a refactor.

---

### 10. A due column, and a spacing settings surface

**What.** Two halves of one finding.

A **due column on the dashboard**, across every module, sortable most-due
first — so "what should I do now" is answerable from the screen that already
answers "how am I doing".

A **spacing settings surface**: every module's interval rule stated in plain
language — what the algorithm does to the interval on a good answer and a bad
one, what its ceiling is, and the ceiling editable per module.

**Why. This is the same finding as the dashboard itself.** `RULE_LEGIBILITY.md`
tracks roughly seventy rules the app enforces without ever showing, and the
spacing caps are exactly that class: `MAX_INTERVAL_BY_MEMORY_TYPE` decides how
often every item in every module comes back, and nobody has ever seen it.
Nobody noticed it was wrong or right because it never surfaced — which is the
definition of the problem, not evidence there is no problem.

The repertoire cap (30 days, `integration`) is the first one to get a control,
in the song-page redesign. That is a single module getting an exception; this
entry is the general version, and it should replace the exception rather than
sit beside it.

**Design.** No doc yet. Needs decisions on where the settings surface lives
(`SettingsPanel` exists as of the spelling work), whether the caps stay
per-memory-type or become per-module, and what a due column shows for modules
whose items are recency-driven rather than due-dated.

---

### 11. MIDI-in accuracy grading

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
| **An intermittent test failure, logged before it becomes a habit** | `chord-recognition/__tests__/chordRecognitionRoute.test.tsx` → "opens on the whole catalog with no param" failed once with `expected +0 to be 30`, then **passed in isolation and passed on the next full-suite run**. Seen 23 Aug 2026 during a full run while another session's commits were landing. **Worth a row rather than a shrug**: a test that fails intermittently is a test we will start re-running until it goes green, and that habit is exactly how a real failure hides behind a flake. **Likely cause, so whoever picks it up does not start from scratch** — a test that passes alone and fails under parallelism is usually sharing state with a neighbour rather than being timing-sensitive on its own. The catalog count reading 0 rather than 30 points at a module-level pool or cache another test has emptied or replaced. Not chased at the time, deliberately. | `chordRecognitionRoute.test.tsx` |
| **A session block cannot say which song sent it** | `sessionGenerator` sets a scale-prep block's `itemRefs` to the scale refs and drops `songId` — every other block falls back to `[songId]`, but the warm-up spends that slot on its cells. Nothing downstream keeps it: `PracticeBlock` has no `songId`, so `SessionBlock` and `InSessionDrillRunner` cannot tell `ScalesDrillModal` which song it is warming up for. Found while wiring per-song enharmonic spelling — the block LABEL can read the song's spelling because it is composed where the song is known, but the drill it opens cannot. **This is a block-model change to persisted, synced data, not a spelling one**, and it wants its own decision: adding a field to `PracticeBlock` changes what a session records, and the same gap will block anything else that needs the song inside a warm-up drill. | `sessionGenerator.ts` → `toProposalBlocks`, the `itemRefs:` ternary · `db.ts` → `PracticeBlock` |
| **Chord motion first-chord rows cannot be drilled** | The 132 `motion-first:` refs are the same motions as the 132 `motion:` ones, and the pool filter would take them — but an attempt only lands under `motion-first:` in the **minimal** scaffold, so a filtered drill arriving in full scaffold never touches the row's item. Those rows deliberately say "open module". Delivering them means sending `scaffold=minimal` alongside the pool, which overrides a persisted user setting: a decision, not plumbing. | `drillTarget.ts` → `FOCUS_KEY_FORMAT`, which states the refusal and why |
| **The progression suggestion stops at tier 2** | Tier 3 is inversions, which are not a tab — they live under Foundational Triads and Seventh Chords with the gear on. The fire rule asks whether the current tab is ahead of what the ladder wants, and a step with no tab has no position in that comparison; skipping it to reach tiers 4 and 5 would recommend extensions while the ladder wants inversions. Extending it needs a suggestion that points at a SETTING rather than a tab. Not a defect — the ladder itself runs to 5 again. | `progressionSuggestion.ts` header, which states the reason and what changing it would cost |
| **468 raw-itemRef labels** | 96 scale cells read `major:C` and 372 voice-leading cells read `five-one:guide-tones:posA:Eb`. Both real label sources exist and neither is read — a wiring job, not a design one. The count is pinned in `catalogs.test.ts` so it cannot grow quietly. | `DASHBOARD_UI_SPEC.md` → Outstanding item 6 · `RULE_LEGIBILITY.md` §1.8b |
| **`SHAPES_DEFAULT_TIME_PER_REP_MINUTES`** | Derives 1.66 from `852` and `1272`, pre-cut totals stale since the catalog went to 648 and now doubly so at 720. Nothing breaks; the comment no longer supports the number above it. | `DASHBOARD_REDESIGN_DESIGN.md` → *Found stale, not resolved*, item 0 |
| **Mental visualisation rating scale** | Still on flying / cruising / crawling. The read layer projects the three onto the four-step fluency scale via `MENTAL_VIZ_RATING_PROJECTION` — the one number in the read layer not read off stored data. Migrating the drill makes removing the projection a single edit. | `DASHBOARD_REDESIGN_DESIGN.md` → *Design items*, item 6 |
| **Reading key-signature overlay tier** | `OVERLAY_MIX` is defined and `renderCard` passes `keySignature: null` for every chord card. A harder tier — chords read in the context of a key — was designed and never wired. **A design question, not a feature to schedule**: does the sterile version teach chord reading or delay it? | `DASHBOARD_UI_SPEC.md` → *The key-signature overlay tier for chord cards* |
| **Two four-step rating scales, and one of them is the one you see** | `lib/fluencyScale.ts` defines struggled / working on it / **comfortable** / in flow and owns `SongPracticeLog.feelRating`, `DrillSession.feelRating` and the dashboard's fluency projection. `lib/sessionTimer/blockRatingOptions.ts` holds its own 1–4 with the same shape and the same SM-2 mapping, but labels step 3 **Clean** — and that is the one rendered at the end of every session block, so it is the scale seen most often. **Not a bug and not urgent**: they agree on membership, order and what each step means to the engine, so nothing computes differently. What they cost is one word — the same self-assessment is asked for under two names on two screens. `fluencyScale.ts`'s header already books the merge as dashboard work, because unifying them restyles the session-block rating screen across S&P and Production. Found 23 Aug 2026 while auditing 3d-6, which reused `fluencyScale` rather than adding a third — and extracted the picker to `components/SessionFeelPicker` so the repertoire side now has exactly one drawing of it. | `lib/fluencyScale.ts` header · `lib/sessionTimer/blockRatingOptions.ts` |
| **Two meanings of "covered"** | `acquisitionStage` reaching `acquired` gates goals and session selection; the dashboard covers an item at 3 attempts. Two rules, both called coverage, and two surfaces can disagree about the same item while both are correct. Same shape as the three disagreeing tier computations. | `RULE_LEGIBILITY.md` §3.1 · §1.12 for the parallel |

---

## Recently landed

Kept short and pruned as it ages — enough to see what the queue just came out
of, not a changelog.

| Date | What |
|---|---|
| 23 Aug 2026 | **3d-6 — the timer records what the work WAS, not just how long.** Six activities, multi-select, none required; "practising in time" never derived from whether the metronome ran, because the number worth seeing is how often the click was chosen and a derived value would count how often a control was on screen. **It also gave the away-time mechanism its first surface** — `withActivity` had banked long silences since 3b-4 and nothing ever asked, so the amber signal led nowhere. Done now banks an open silence before pausing and the rating step asks, 100/75/50/25/0, with the minutes each answer keeps shown beside it. |
| 23 Aug 2026 | **The song page redesign, 3d-0a through 3d-5, plus a layout pass that took ~2,400px off the page.** Derived stage, SM-2 retest scheduling with four states, the stored demotion record, phantom key rows cleared, the Cross-Key card deleted, the page restructured, and the cell panel that starts every practice. See item 1 — the entry carries the full table and what is left. |
| 23 Aug 2026 | **Per-song enharmonic spelling — complete, all five steps.** Was queue item 3. One seam for what a pitch is called; a global flats/sharps setting; G♭ retired as an identity and demoted to a spelling; the lead sheet, session labels and drill grids reading one spelling; the matrix keeping its identities while reading a spelling; and a per-song override. **It closed the two-circles split it was queued behind** — `circleOfFourths.ts` now derives from `matrix/keys.ts` rather than holding a second twelve, so `canonicaliseKey` can no longer return a name the matrix does not store. The near-miss worth remembering: rendering ♭ before fixing the parser would have made `D♭maj7` parse as **D**, the ♭ falling past the accidental capture group into the quality string — no error, a cell that looks perfect and means degree 2 instead of ♭2. |
| 21 Aug 2026 | **Chord recognition tier 3 unblocked — the ladder reaches 5 again.** Nine of seventeen tier-3 items were unattainable, so tier 3 could never clear and tiers 4–5 never opened. Two causes, one bug: `stepTwoEligible` was `tier === 'foundational'`, so seventh inversions were never generated; and the table listed `aug:1`/`aug:2`, which the quiz correctly refuses. Inversion training now covers triads and sevenths, the drawer offers the fourth position, and `dim7` joins the exclusions on the same symmetry argument as `aug`. A new composition test asserts every tier item is one the quiz will actually serve — the check that was missing. |
| 21 Aug 2026 | **Chord recognition was serving three of thirty chords.** Free practice ran its pool through the staged-introduction gate, so Seventh Chords, Dominant Variations and Extensions & Colors each produced an empty pool, an enabled play button and no sound — since 13 May. The gate now stays where it was built for, generated sessions; free practice is ungated with a dismissible suggestion in its place. |
| 21 Aug 2026 | **Dashboard drill entries — the pool half.** Five modules filter end to end. Tap-to-drill had never worked: rows resolved against the module id where the tables are keyed on the catalog, so every ear-training row went to `/`. Repertoire remains. |
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
