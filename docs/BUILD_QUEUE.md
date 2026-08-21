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

### 3. Chord recognition — the progression permanently caps at tier 3

**What.** Nine of the seventeen tier-3 items can never be attempted, so tier
3 can never be cleared, so tiers 4 and 5 never unlock. A third of the ladder
is unreachable for anyone who gets that far, silently.

**Why it matters.** This is not a rough edge. `computeUnlockedTier` walks
tier by tier and stops at the first incomplete one, so a player who clears
the triads and the sevenths sits at tier 3 forever — and nothing tells them,
because the ladder has no surface of its own. `sessionGenerator.ts` reads
that capped tier, so generated sessions stop introducing new material too.

**Two different causes, and only one of them is a bug.**

- **`aug:1` and `aug:2` are correctly refused.** An augmented triad is a
  symmetric stack of major thirds, so every inversion is the same chord at a
  different root and sounds identical. `INVERSION_EXCLUDED_CHORD_IDS` is
  right to exclude it and the quiz is right not to serve it. **The tier
  table is what is wrong** — it lists two items the app deliberately refuses
  to play. Fix by removing them from `TIER_3_ITEMS`.

- **The nine seventh inversions are a genuine defect.** `maj7:1..3`,
  `min7:1..3` and `dom7:1..3` are all in tier 3, and `stepTwoEligible` in
  `ChordRecognitionQuiz.buildCandidates` reads `c.tier === 'foundational'`,
  so the quiz only ever plays inversions of triads. One condition, and it
  silently voids three quarters of a tier. Fixing it needs a decision about
  what the inversion settings mean for four-note chords — the drawer offers
  positions 0–2 and a seventh has four — rather than just widening the test.

**Found 21 Aug 2026**, working out what the progression suggestion could
honestly point at. It is why that suggestion goes quiet past tier 2: naming
tier 3 would recommend work that cannot be done.

**Where it lives.** `progressionSuggestion.ts` header ·
`chordRecognitionTiers.ts` → `TIER_3_ITEMS` · `ChordRecognitionQuiz.tsx` →
`stepTwoEligible`

---

### 4. Per-song enharmonic spelling

**What.** Spelling chosen per song rather than globally, so a chart in G♭ reads
in flats and one in F♯ reads in sharps.

**Why.** **Currently blocking lead sheet work.** No design doc yet.

**Blocked something twice on 20 Aug 2026** — lead sheet work, and then the
stage-rule quadrants, where the design was written in G♭ and the stored data
says F#. The cost is not only rules: every key name on screen is somebody
else's spelling. Likely the next thing to start after the practice-vs-test
workstream.

**Same root, found 20 Aug 2026: the app has two circle-of-fourths modules that
disagree.** `matrix/keys.ts` spells the sixth key **F#** and that is what
`songKeys.keyName` stores; `repertoire/circleOfFourths.ts` spells it **Gb**,
and its `canonicaliseKey` maps 'F#' → 'Gb' — i.e. *into* the vocabulary the
matrix does not use. Anything written against the wrong one matches zero rows
and fails silently. The stage-quadrant table dodged it by deriving from
`CIRCLE_OF_FOURTHS_KEYS` rather than being written out, but the split itself is
still there for the next writer to walk into. Per-song spelling has to decide
which module is canonical anyway, so the reconciliation belongs here.

---

### 5. Song detail page — collapse the three progress cards into one

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

### 6. Per-node regrouping and custom module order

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

### 7. Chord progression catalog rebuild

**What.** Pare down to common basic progressions and derive the rest from Song
Repertoire.

**Why.** The current catalog and its names were generated rather than chosen,
and do not resonate. Compounded by there being no reference audio to learn what
they sound like. Larger than, and containing, the naming audit.

**Design.** `DASHBOARD_REDESIGN_DESIGN.md` → *Design items — need their own
design pass*, items 3 and 4.

---

### 8. Repertoire chord flashcards

**What.** Memorising a section's changes away from the keyboard.

**Why.** The one repertoire skill that does not need an instrument, and so the
one that fits the gym case the dashboard was designed around. No design doc
yet.

---

### 9. Personal voicing library

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

### 10. Spacing state for section ratings and S&P

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

### 11. Collapse the two song-progress ladders

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

### 12. MIDI-in accuracy grading

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
| **Chord motion first-chord rows cannot be drilled** | The 132 `motion-first:` refs are the same motions as the 132 `motion:` ones, and the pool filter would take them — but an attempt only lands under `motion-first:` in the **minimal** scaffold, so a filtered drill arriving in full scaffold never touches the row's item. Those rows deliberately say "open module". Delivering them means sending `scaffold=minimal` alongside the pool, which overrides a persisted user setting: a decision, not plumbing. | `drillTarget.ts` → `FOCUS_KEY_FORMAT`, which states the refusal and why |
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
