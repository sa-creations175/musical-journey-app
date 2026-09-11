# Rule Legibility

**Audit taken:** August 14, 2026
**Against:** commit `af9fccf` (all line references spot-checked at that commit)
**Status:** living document — update the markers as rules get surfaced

> **Line numbers drift.** Every `<file>:NN` below was accurate on the date above.
> As the codebase moves, treat them as a starting point for a search, not a
> guarantee. The symbol names and constant names are the durable part — grep
> those first if a line lands somewhere unexpected.

---

## What this is for

The app enforces roughly seventy rules that decide what counts, what unlocks,
what's due, and what gets excluded. Almost none of them are explained anywhere
you can see while using it. You learn one when something surprises you and you
go digging.

**Every rule the app enforces should be legible inside the app.**

The reason is that this is being built as something other people might use, not
only as a personal tool. I can remember that a 30-second rep doesn't count
because I decided it. Someone else would just see their practice vanish — and
they'd be right to stop trusting the numbers.

A rule that makes a displayed number mean something other than what it appears
to mean is worse than a rule that gates a feature. That ordering is what the
tiers below encode, and it's what decides the fix order.

This document maps the rules. It is not a to-do list to burn down. It's a
reference to work through deliberately.

---

## Status markers

Each rule carries one tag. They're plain text so they're greppable —
`grep -c "\[INVISIBLE\]" docs/RULE_LEGIBILITY.md` gives you the remaining count.

| Tag | Meaning |
|---|---|
| `[INVISIBLE]` | The rule is enforced and nothing in the UI mentions it |
| `[HALF]` | The *effect* is named somewhere, but not the rule, the threshold, or the full reach |
| `[SURFACED]` | Explained where the user meets it. No work needed |
| `[FIXED]` | Was invisible or half; now surfaced. Note the commit |
| `[DEFECT]` | Not a legibility problem — a bug that surfaced during the audit |
| `[CLOSED]` | The rule was removed rather than explained. Nothing left to surface |

**Counts, read off this file rather than estimated.** Recounted from the
entries **whenever an entry changes** — the date beside each count says when it
was last read, and a count with an old date is a count to re-read before
trusting.

| Tag | Entries | `grep -c` returns | Counted |
|---|---|---|---|
| Invisible | 20 | 21 | 10 Sep 2026 |
| Half | 19 | 20 | 10 Sep 2026 |
| Surfaced | 6 | 7 | 10 Sep 2026 |
| Fixed | 4 | 5 | 10 Sep 2026 |
| Defect | 3 | 4 | 10 Sep 2026 |
| Closed | 3 | 4 | 10 Sep 2026 |
| **All entries** | **55** | | 10 Sep 2026 |

The grep is always **one higher**, because each tag also appears in its own row
of the marker table above. Nothing else in this file writes a tag in prose —
that is deliberate, so the greps stay countable. **55 is the total the 20 Aug
count also came to** (24 + 21 + 6 + 3 + 1): entries have moved between tags,
none has been added or lost.

The four *fixed* entries are the Tier 4 unlock rows. They were written with a
VISIBLE tag on 10 Sep, which this table never defined; the *fixed* tag is the
one it has for exactly that, so they were renamed and their commits noted.
(Written here without brackets, so the greps above stay true.)

*The original audit line read "6 surfaced · ~15 half · ~50 invisible · 2
defects". The tildes were estimates and two of the three were wrong.*

---

## The working plan

Three patterns run through the whole map. They are the plan, in order.

### Pattern 1 — Explanations that were built and never rendered ← **start here**

The cheapest set of wins in the entire document. In each of these cases the
honest-disclosure work is **already done** — the function exists, the reason
code is computed, the description string is written. It just isn't wired to a
surface. These are wiring jobs, not design jobs.

| What exists | Where it lives | What's missing |
|---|---|---|
| `readingHintSplit()` | `src/modules/reading/readingProgress.ts:65` | Zero consumers outside its test file |
| `readingMissBreakdown()` | `src/modules/reading/readingProgress.ts:101` | Zero consumers outside its test file |
| `readingSkillAccuracy()` | `src/modules/reading/readingProgress.ts:44` | Zero consumers outside its test file |
| `MaintenanceDisqualifier` reason codes | `src/lib/sessionAlgorithm/scopeMaintenance.ts:209` | `ScopeMaintenanceNotice.tsx` never renders `view.reason` |
| `TIER_DESCRIPTION` | `src/lib/tier.ts:96` | Rendered in 1 of 8 surfaces that show `TIER_LABEL` |

The `readingProgress.ts` case is the sharpest: the file header (`:12`) argues at
length for choosing `attemptFilter` over `excludeFromFluency` *specifically so
the hint-on split would stay readable* — and then no surface reads it. Same for
the maintenance reasons, whose own comment says they are "carried so the three
surfaces in step 3 can explain themselves."

### Pattern 2 — Rules explained at the trigger, not at the number

The fluency-protection notice appears inside the quiz. The numbers it affects
live on the Dashboard, in Goals, and in the Skills catalogue. A rule stated only
where it fires is invisible everywhere it matters.

The fix shape here is different from Pattern 1: it's about carrying a marker
alongside the derived number, not about rendering an existing string.

### Pattern 3 — Three definitions of "a practice day"

Three calendars, three rules, none labelled as partial. This is the one most
likely to make a new user believe the app lost their practice — exactly the
failure mode this document exists to prevent. Probably wants a design decision
before any code.

---

## Tier 1 — The number means something other than what it appears to mean

These are the `excludeFromFluency` shape: you are looking at a figure that has
been quietly filtered, rescoped, or fabricated. **Highest priority.**

### 1.1 Reading accuracy silently blends hint-assisted answers `[INVISIBLE]`

- **Rule:** the "show the accidental count" hint stays on across cards; attempts made with it land in the same accuracy pile as unaided ones.
- **Decides:** the headline Reading accuracy figure.
- **Where:** `src/modules/reading/ReadingDrill.tsx:267` (writes `hintUsed`) · `src/modules/reading/readingProgress.ts:65` (`readingHintSplit`), `:101` (`readingMissBreakdown`), `:44` (`readingSkillAccuracy`).
- **UI:** invisible — **and the separator exists and is wired to nothing.** All three reader functions have zero consumers outside their test file.
- **Note:** worst offender in the codebase. The rule was designed to be honest and the honesty was never rendered. → **Pattern 1**

### 1.2 Focus protection does more than the notice claims `[HALF]`

- **Rule:** in Harmonic Fluency a focus-protected session also skips `recordAttempt` — the spaced-repetition scheduler. Ease factor, interval, and next-review date do not move at all.
- **Decides:** when an HF card comes back.
- **Where:** `src/modules/harmonic-fluency/HarmonicFluencySession.tsx:112` (`if (!focusProtected) await recordAttempt(...)`).
- **UI:** `src/components/FluencyProtectionNotice.tsx:10` says *"focus sessions with fewer than 4 items don't count toward fluency tiers — practice freely without inflating your stats."* True but incomplete: in HF those reps also don't reschedule the card. Drill a flagged card ten times and it's still due tomorrow.

### 1.3 `excludeFromFluency` reaches six systems; the notice names one `[HALF]`

- **Rule:** the flag drops the attempt from *every* downstream tally, not just the tier badge.
- **Decides:** tier badges, tier unlocking, goal accuracy percentages, dashboard counts, Skills-catalogue badges, weak-spot suggestions.
- **Where set:** `ChordRecognitionQuiz.tsx:530` · `IntervalsQuiz.tsx:214` · `ChordMotionTab.tsx:440` · `HearScaleTab.tsx:59` · `SitInsideTab.tsx:63` · `HarmonicFluency.tsx:215` · `VocabularySession.tsx:46` (`FOCUS_PROTECTION_THRESHOLD = 4`); the shared rule is `FLUENCY_POOL_MINIMUM` in `src/lib/fluencyPool.ts`. `FullProgressionCard.tsx` — which replaced the old progressions quiz and set no flag at first — sets it again since 10 Sep 2026 when its What is in play filter leaves fewer than 4 progressions; and `ChordMotionTab.tsx` now sets it for a filtered pool under 4, not only a focused one.
- **Where consumed:** `chord-recognition/tierUnlock.ts:41` · `scales-modes/scaleModeTierUnlock.ts:63` · `dashboard/read/itemStats.ts` (`engagementFromAttempt`, `itemStatsFromEngagements`) · `goals/progress.ts:327` · `skills/registry.ts:152` · `ChordMotionTab.tsx:1146`. *(The progressions ladder that also read it was deleted 10 Sep 2026; the old dashboard's aggregation module was replaced by the read layer on 27 Aug.)*
- **UI:** notice says "fluency tiers." Silent on the other five. A focused session can leave you permanently short of a tier unlock with no indication.
- **Also:** the threshold is `< 4` everywhere but measured differently — items *selected* in ET (`focusKeys.length`), cards *in queue* in HF/Production (`cards.length`). Same notice, two different rules. → **Pattern 2**
- **Dashboard surfaces closed, 20 Aug 2026** (`a400f87`, `690f55e`). The score column's `?` states the split — out of accuracy, in for coverage and recency — with its reason, and a row whose own attempts were focus-protected says how many and which way each one counted. **Stays half-surfaced:** the in-quiz notice is unchanged, and tier unlocking, goal accuracy and the Skills catalogue still say nothing. One of six consumers now explains itself.

### 1.4 Chord Motion's scope count is the filter's pool, not the catalog `[HALF]`

- **Rule:** the current-scope line shows `activePool.length` after the note-context, direction and distance filters, not the catalog size. *(This entry named the number on screen until 10 Sep 2026; the pool has grown three times since, so it now names what the number is rather than what it was.)*
- **Decides:** the motion count you read as "how many motions exist."
- **Where:** `src/modules/ear-training/chord-progressions/ChordMotionTab.tsx:1088`.
- **UI:** the filters are listed in the same sentence, so a careful reader can infer it — but the number is presented as a count of motions, not a count of *these* motions. `ProgressionFluencyTracker.tsx:265` renders `"${motions.length} motions"` per distance group with no filter context at all.

### 1.5 Coverage denominators are spacingState-row counts, not what you can see `[HALF]`

- **Rule:** the "N" in a coverage goal is derived from itemRef cardinality, which does not match the visible catalog.
- **Decides:** every coverage goal denominator.
- **Where:** `src/lib/moduleItemCounts.ts:21-24` — the comment states it outright: *"The user-facing card count for Ear Training is 134; the coverage denominator is 143."* Intervals are 13 × 2 directions = 26; modes are 9 × 2 tabs = 18.
- **UI:** `Goals.tsx:1831` renders `"Coverage · 4/26"`. Nothing there says the 26 counts each interval twice.
- **Moved invisible → half, 20 Aug 2026** (`a400f87`). The dashboard does not use `moduleItemCounts` at all — its denominators are catalog counts by construction (`read/catalogs.ts`) — and the coverage column's `?` now states the general rule and its reason: *the denominator is the full catalog for that row, never the current filter*, because one that moves with a setting makes the percentage mean a different thing on different days.
- **What that leaves.** The rule is stated where most coverage numbers are now read and silent where the divergent ones still are. Goals is the remaining surface, and it is the one whose denominators actually disagree with the visible catalog. Closing it means either labelling the composition or moving Goals onto the catalog counts.

### 1.6 Mental Visualization is excluded from every S&P coverage number `[HALF]`

- **Rule:** mental-viz drills count toward consistency only, never breadth/depth/mastery. `itemRefForSkill` returns null for them.
- **Decides:** all S&P coverage progress.
- **Where:** `src/lib/moduleItemCounts.ts:158-161` (April 27 design call) · `dashboard/read/catalogs.ts` carries the same decision as `countsTowardModuleTotals: false`.
- **UI in Goals:** still invisible. Drill mental viz for a month and every S&P coverage goal stays flat.
- **Moved invisible → half, 20 Aug 2026** (`690f55e`). The mental visualisation row and everything under it now state it, with the reason and — the half that was missing from the rule as written here — **what still does roll up**: recency does, because practising it is practising. A note saying only "excluded" would overstate the exclusion.
- **Second-order rule, surfaced at the same time.** Mental viz's only per-item record is `performanceHistory`, which caps at 20 entries, so its attempt count is a **floor, not a total**. The row says so. Coverage needs three, so the threshold itself is unaffected.

### 1.7 Supplementary two-handed seventh rows don't gate acquisition `[CLOSED]`

- **Rule:** `supplementary` inversion states were filtered out of every coverage denominator via `gatesAcquisition`. **The rule no longer exists.**
- **Closed 20 August 2026 by reversing the decision**, not by explaining it. Supplementary rows now gate acquisition like every other inversion state, `gatesAcquisition()` is deleted, and the chord-shape catalog is 720 rather than 648.
- **Why the reversal.** The row seeds four two-handed drills — LH root with RH triad in root position, 1st and 2nd, plus the fluid drill between them — which is how a seventh chord actually gets played. Calling that a practice tool rather than a shape to own was the error; it is the most realistic voicing of the six.
- **How it was found.** Reading the coverage legend written for §1.7 in the first place. Explaining the rule plainly made it obvious the rule was wrong — which is an argument for this whole document that the document could not have made for itself.
- **What it cost:** a seventh quality needs six rows covered rather than five, so its coverage percentages drop; `tierTotalCells(2)` goes 360 → 432, moving the tier-2 unlock bar from 180 comfortable cells to 216. Both accepted.
- **The near-miss.** `moduleItemCounts.shapesCounts()` multiplied by a **literal 5** for sevenths rather than reading the catalog. Deleting the exclusion would have left it returning 648 with nothing failing anywhere — the denominator and its own catalog disagreeing in silence. It now derives the multiplier, and a reversal test pins it.
- **The other half.** Three goals-side matchers and two enumerators also excluded supplementary. Left alone they would have capped seventh coverage below 100% forever: a denominator grown by 72 that the numerator cannot reach.
- **See** `DASHBOARD_REDESIGN_DESIGN.md` → *Supplementary rows count*.

### 1.8 Skills-catalogue tiers for flashcards are fabricated windows `[INVISIBLE]`

- **Rule:** HF cards have no per-attempt history, so the registry reconstructs a fake 20-attempt window from lifetime accuracy: `windowCorrect = round(lifetimeAccuracy × min(20, totalAttempts))`.
- **Decides:** the tier badge on every HF skill in the catalogue.
- **Where:** `src/modules/skills/registry.ts:167` (`tierForFlashcardState`).
- **UI:** invisible. The badge reads "fluent" identically to a real rolling-window tier. It isn't one — it's a lifetime average wearing a rolling-window label.

### 1.8b A catalog `id` rendered as a user-facing label `[DEFECT]`

- **Rule:** none — this is a mistake, not a rule. `dashboard/read/catalogs.ts` built Reading row labels by interpolating `q.id`, so the screen showed `maj root (treble)`, `r5oct root` and `treble -4`. Fixed 20 Aug 2026 by reading `q.label` and deriving the rest.
- **Why it belongs here:** an id is a key, chosen for uniqueness and brevity. A label is an answer, chosen to be read. The moment an id reaches a surface it becomes a claim about what the thing is called — and `r5oct` claims nothing while `maj` claims something *shorter* than the answer the picker wants back.
- **Why it will recur:** the dashboard is the first surface in the app that renders **every catalog id**, across six modules. Five of those catalogs have not been audited for this. `chord-shape:maj7:C:inv1` and `mv:triad:maj:root:C` are one interpolation away from the same defect.
- **Two labels were also wrong at the source**, which the dashboard only exposed: `root–seventh` for `[0, 10]` and `root–tenth` for `[0, 16]`. Each named a degree without its quality, so each described two different shapes. Now `root + ♭7` and `root + major 10th`.
- **The guard:** `catalogs.test.ts` asserts no row label contains a quality's `id` unless the id *is* the label. Worth extending to the other five catalogs.

**The recurrence happened, and it has a size — 468 rows.** *Found 20 Aug 2026
while applying the Title Case convention (`1ff0d48`).* Two of the five
un-audited catalogs label their rows with the stored itemRef:

| Rows | Label today | Where the real label already lives |
|---|---|---|
| 96 scale cells | `major:C`, `minor-pentatonic:Eb:b3` | `SCALE_CELLS[].label` — *"Eb minor pentatonic — from b3"* |
| 372 voice-leading cells | `five-one:guide-tones:posA:Eb` | `voiceLeadingSubCellLabel()` (`shapes-and-patterns/catalog.ts:707`) |

Both label sources exist and neither is read. **This is a labelling fix, not a
capitalisation one** — Title Casing a raw ref gives `Major:C`, which is a
capitalised key rather than a label, so the convention deliberately does not
touch them. `catalogs.test.ts` pins the count at 468 so it cannot grow
quietly, and so closing it fails the test and asks for the number to be
removed rather than passing silently.

**A third id was fixed while there** (`1ff0d48`): ear training's chord-tier
segment rendered `foundational` / `seventh` / `dominant` / `extensions`. It now
reads the drill's own tab-strip wording. The strings are component-local in
`ChordFluencyTracker.tsx` and the read layer cannot import a component, so they
are copied with the source named — a seam, and the alternative was leaving an
id on screen.

**The near-miss worth recording.** The Title Case rule capitalises the first
letter of each word, and a lone `b` or `#` before a digit or a capital is
skipped, because **the case is the meaning**: `b3` is a flat third and `B3` is a
note; `bVII` is a flat-seven. Without that skip the 264 chord-motion rows built
from degree spellings would have been silently transposed, and two harmonic
fluency questions would have been re-spelled into different chords. It would
have read as a rendering quirk. Same family as this entry — a string whose
*form* carries meaning, passed through a transform that only understood its
letters.

### 1.9 The Musician Balance radar's 0–100 scores are invented targets `[CLOSED]`

- **Closed 27 Aug 2026, by removal:** the radar was deleted with the old dashboard (`1ca4b31`), and nothing in `src` carries its targets now. The entry is kept as it was found:
- **Rule:** each axis divided weighted activity by a hardcoded target and clamped to 100. Last-7-days activity was weighted 2×.
- **Decides:** all five radar axes.
- **Where:** the old dashboard's aggregation module — 400 ear attempts / 10,800 drill seconds / 300 song minutes / 7,200 creative seconds / 14 unique days.
- **UI:** `drivers` strings show the raw weighted inputs ("312 weighted ear-training reps…") but never the denominator or the 2× recency weight. "Physical: 58" reads like a measurement; it's a ratio against a guess.

### 1.10 "untouched" doesn't mean untouched `[HALF]`

- **Rule:** `computeTier` returns `'untouched'` for anything with fewer than 5 attempts in the window.
- **Decides:** tier badges and the Skills grid filter.
- **Where:** `src/lib/tier.ts:61`, description at `:102`.
- **UI:** the description exists but renders in exactly one place (see 1.11). In `SkillsGrid.tsx:210` it's a filter chip labelled "untouched" — filtering by it returns items you've practised four times.

### 1.11 Tier labels render in eight surfaces; the legend renders in one `[HALF]`

- **Rule:** mastered = 20/20 over last 20 · fluent = 80–99% · developing = 50–79% · needsWork = <50% · stale = was fluent/mastered + 30 days idle.
- **Decides:** every tier badge in the app.
- **Where:** `src/lib/tier.ts:49-51`, `TIER_DESCRIPTION` at `:96`.
- **UI:** `TIER_DESCRIPTION` is consumed **only** at `src/modules/ear-training/intervals/FluencyTracker.tsx:257`, behind a "?" popover. `TIER_LABEL` alone renders at: `ChordFluencyTracker.tsx:216` · `scales-modes/FluencyTracker.tsx:138` · `ProgressionFluencyTracker.tsx:100` · `moduleHome/CategoryCard.tsx` (the harmonic fluency tier badge, since the category cards replaced its tracker) · `SkillsGrid.tsx:332` · `SkillsCatalogue.tsx:311` · `ModuleGroupedView.tsx:337` · `SkillDetailPanel.tsx:213`. **Seven surfaces show the verdict without the rule.**
- **Compounding:** `src/lib/tier.ts:1-45` documents that this is the *legacy* vocabulary, superseded by a garden vocabulary (planting / sprouting / branching / rooted / seasoned) with **different band breakpoints**. Both ship. Only `GoalFormModal.tsx::LevelSelect` shows the new one. → **Pattern 1**

### 1.12 Three tier computations that can disagree `[DEFECT]`

- `dashboard/read/itemStats.ts` (`itemStatsFromEngagements`) — drops focus-pool attempts, then takes the 20-answer window; recency deliberately counts them. *(Replaced the old dashboard's aggregation module, 27 Aug 2026.)*
- `skills/registry.ts:152` — filters then slices 20, but computes `daysSince` from `sorted[0]`, which **includes** excluded attempts.
- `ChordRecognitionQuiz.tsx:203` — additionally normalizes legacy itemIds (`maj` → `maj:0`) before bucketing.
- **Consequence:** the Dashboard, the Skills catalogue, and the in-quiz tracker can show **different tiers for the same item**.
- **This is a correctness bug, not a legibility gap.** Logged here because the audit found it; should be fixed as a bug regardless of what happens to the rest of this document.

---

## Tier 2 — An action you took was deliberately not recorded

### 2.1 Drill, creative, and song practice don't touch the daily goal, streak, or calendar `[INVISIBLE]`

- **Rule:** `computeDayStreak` and `updateDailySummary` read `db.attempts` only, and are **scoped per module**.
- **Decides:** the daily goal bar, the day streak, and every calendar cell.
- **Where:** `src/lib/dailyGoal.ts:35` · `src/lib/dailySummaries.ts:16` · `src/lib/dayClassification.ts:24` · `src/components/DailyGoalBar.tsx:46`.
- **UI:** invisible. A 45-minute chord-shape drill day renders as `'empty'` on every Ear Training calendar and breaks the streak.
- **Three unreconciled calendars:** S&P has its own (`ShapesAndPatternsCalendar.tsx`) with minutes-based intensity bands (`:49` — 10 / 25 / 45 min, no legend) and no goal at all. Repertoire has a third (`SongHeatmap.tsx`). None labelled as partial. → **Pattern 3**

### 2.2 Chord Motion practice reps write nothing `[HALF]`

- **Rule:** replaying a motion as a practice rep skips the DB entirely — no attempt, no daily summary, no streak, no fluency.
- **Where:** `src/modules/ear-training/chord-progressions/ChordMotionTab.tsx:583` (`if (round.isPracticeRep) return;`).
- **UI:** `:885` renders `"practice rep — not tracked"`. Says it isn't tracked; doesn't say the reps also don't count toward your daily goal or streak.

### 2.3 Drill reps under 30 seconds log nothing `[SURFACED]`

- **Rule:** `DRILL_FLOOR_SECONDS = 30` (`src/lib/spacing/drillSettings.ts`, re-exported as `MIN_REP_SECONDS` from `drillModel.ts`); a run under it is not saved.
- **Where:** enforced in `shapes-and-patterns/practiceTest/PracticeTestPanel.tsx` — `completed()` marks the run too short, and `finishPracticeDrill` / `finishTestDrill` write nothing for it. Every drill surface goes through that panel since the in-session pop-ups retired (31 Aug 2026).
- **UI:** explained where the run lands — the rating box ("That run was {n}s. A run has to reach 30 seconds to have been real…") and the run list ("Under 30 seconds, so this run was too short to count and nothing was saved for it."). *It used to be explained at three moments, before the run and on a refused save as well; the pop-ups that did that are gone, and the panel says it only afterwards.*
- **Still the model for everything else in this document** — the rule is stated, with its number, where the reader meets it.

### 2.4 First engagement bypasses Dev Mode `[DEFECT]`

- **Rule as intended:** Dev Mode suppresses all practice-data writes.
- **Actual:** `putSpacingState` is Dev-Mode gated (`src/lib/practiceWrites.ts:53`), but `recordEngagement` creates the row on first touch via `db.spacingState.add()` directly at `src/lib/spacingState.ts:336` — **not gated**.
- **Consequence:** a Dev Mode test session still creates first-touch spacingState rows. The header badge promises suppression it doesn't fully deliver.
- **UI:** Dev Mode itself is well surfaced (`Layout.tsx:189` badge + `SettingsPanel.tsx:107` toggle) — that's not the problem.
- **This is a defect, not a design call.** Fix independently of this document.

### 2.5 Stored and never read `[INVISIBLE]`

- `elapsedMs` — `db.ts:1297`, written at `ReadingDrill.tsx:265`. Deliberate per the comment ("recognition speed cannot be backfilled"), documented at the field. Acceptable, but it's recorded practice you can't see.
- `noteMiss` (letter / octave / both) — written; reader exists at `readingProgress.ts:101`; **no UI**.
- The whole S&P tier system: `getSPUnlockedTier` (`spTiers.ts:201`) is consumed only by `sessionGenerator.ts:1062`. **No S&P surface shows your tier or what unlocks the next one.**

### 2.6 Explicitly opt-in non-logging `[SURFACED]`

`CreativeTimeModal.tsx:319`/`:339` · `InSessionDrillRunner.tsx:163` · and on the drill panel (`practiceTest/PracticeTestPanel.tsx`) "Cancel Session", which asks first and writes nothing further (runs already rated stay saved), and, in a test only, "I didn't finish it — discard this run". Fine as-is — you chose them. *(The drill pop-ups' "cancel — don't log" retired with them, 31 Aug 2026.)*

---

## Tier 3 — The app decides something about you from a rule you can't see

### 3.1 Acquisition stage — the rule under every coverage number `[INVISIBLE]`

- **Rule:** `acquiring → acquired` when either **(declarative)** ≥5 attempts in the last 10 *and* ≥80% correct, or **(procedural / integration)** the **last 3 ratings are all flying or cruising** — a single "crawling" blocks it. Never demotes.
- **Where:** `src/lib/spacingState.ts:40, 43, 48, 52` · `COVERED_STAGES` at `goals/progress.ts:58`.
- **UI:** invisible.
- **The single most load-bearing invisible rule in the app.** It decides every coverage numerator and every maintenance qualification. Nothing anywhere says what "covered" means. *(It also decided the S&P tier unlock until 10 Sep 2026, when that gate moved to the Fluent rating the grid shows — see its row in Tier 4.)*
- **NOT surfaced by the dashboard, and it is worth saying why.** *Checked 20 Aug 2026.* The dashboard now explains its own coverage rule at length — but that is **a different rule**. `dashboard/read/itemStats.ts` covers an item at `engagementCount >= COVERAGE_MIN_ENGAGEMENTS` (3 attempts); this entry is about `acquisitionStage` reaching `acquired`, which is what `COVERED_STAGES` gates in `sessionAlgorithm/` and `goals/progress.ts`. Two rules, both called coverage, in the same app.
- **That collision is now itself a legibility problem**, and a sharper one than either rule alone: two surfaces can show different "covered" counts for the same item and both be correct. It has the same shape as §1.12's three tier computations. Deciding whether they should reconcile is a design call, not a wiring job.

### 3.2 Scope-level maintenance — the bar is never stated `[HALF]`

- **Rule:** enter when *every* catalog item is acquired **and** each holds ≥90% over its last 20 attempts spanning ≥4 distinct days. Release when any item drops below 85% (a deliberate 5-point hysteresis band).
- **Where:** `src/lib/sessionAlgorithm/scopeMaintenance.ts:83, 88, 95, 100, 113`.
- **UI:** `ScopeMaintenanceNotice.tsx:88` says *"learned and holding steady"* / *"slipped below the maintenance bar."* The `MaintenanceDisqualifier` type at `:209` carries five reason codes with the comment *"Carried so the three surfaces in step 3 can explain themselves instead of showing or hiding a suggestion with no account of why"* — **the component never renders `view.reason`.** → **Pattern 1**

### 3.3 Spaced-repetition scheduling — fully invisible `[INVISIBLE]`

Two SR systems run in parallel and neither shows anything.

- **Flashcards:** *no longer SM-2.* The SM-2 scheduler was retired (`e6e80a9`); flashcards now read the shared spacing engine through `src/lib/flashcards/cardSpacing.ts` — `src/lib/spacing/engine.ts` (`answer`), its numbers in `DEFAULT_SPACING_SETTINGS` (`src/lib/spacing/settings.ts`).
- **spacingState curve:** ×2 on success, ×0.5 on failure, floor 1 day, ceiling by memory type (declarative 60 / procedural 30 / integration 30 / expression 14). `src/lib/spacingState.ts:164-183`.
- **UI:** no due date, no interval, no ease is shown anywhere. Cards appear and disappear from queues with no account.

### 3.4 Decay bands

- **Song keys** `[HALF]` — four states on a spacing curve, `held` / `due-soon` / `due` / `overdue`, and only `overdue` loses the rung. `src/modules/repertoire/matrix/keySpacing.ts` (`keyDueState`, `stateHoldsRung`); badge words in `songRetestState.ts`. *Replaced the 14/30-day decay bands (21 Aug 2026). The old "lapsed is sticky until a passed retest" rule did not survive: any rated run moves the due date.*
- **Algorithm's lived-with bands** `[INVISIBLE]` — identical 14/30 thresholds, `src/lib/sessionAlgorithm/livedWith.ts:28-30`.
- **S&P heat-grid dimming** `[HALF]` — fresh ≤3d, recent ≤10d, aging ≤20d, stale beyond. `src/modules/shapes-and-patterns/drillModel.ts:790`. `ChordShapeDrills.tsx:53` says *"cells darken with time invested and fade as they go stale"*; the day counts aren't given. `TodayAndAttention.tsx:15` additionally gates "going stale" on ≥5 min invested — invisible.
- **Tier staleness** `[HALF]` — fluent/mastered + 30 idle days → `stale`. `src/lib/tier.ts:51`. Invisible outside the intervals popover.

### 3.5 Day classification bands `[SURFACED]`

- **Rule:** <5 attempts = belowThreshold · <50% of goal = light · 50–99% = solid · 100% = goalMet · 150%+ = goalCrushed. `src/lib/dayClassification.ts:6, 30-33`.
- **UI:** `PracticeCalendar.tsx:254` renders a full legend with the numbers baked into the labels ("below threshold (1–4 attempts)"). **Good model.**

### 3.6 Goal feasibility verdicts `[HALF]`

- **Rules:** `AT_RISK_RATIO = 0.85` (`goals/progress.ts:578`) · accuracy at-risk at a 5-point gap (`:999`) · critical in the last 20% of the goal period (`:1006`) · song goals project at a flat **0.25 songs/week** default (`:890`).
- **UI:** recommendation strings render the *outputs* ("projected to cover 8 of 12 songs by Mar 3") but never the assumption. The 0.25/week figure is a hardcoded placeholder driving a projection presented as a forecast.

### 3.7 Repertoire stage advancement `[HALF]`

- **Rules:** learning→comfortable = 5 logs at target tempo with feel ≥3 · comfortable→internalized = 3+ distinct weeks in the last 21 days, last-5 avg feel ≥4, ≥5 logs · internalized→cross-key = 2 non-original keys · cross-key→maintenance = 6 keys across 3 sections. `src/modules/repertoire/stage.ts:100-105, 126ff`.
- **UI:** asymmetric. When met, `reason` renders ("5 sessions at target tempo — consider advancing"). When *not* met, nothing shows — you can't see how close you are or what's missing.

### 3.8 Cell / key gates `[SURFACED]`

- **Rule:** 3 consecutive clean run-throughs at ≥ (performance tempo − 10) BPM. `cellRollup.ts:74, 90, 183` · `src/lib/spacing/testStreak.ts` (`TEST_REPS`) · `src/modules/repertoire/tempoGate.ts` (`testFloorBpm`).
- **UI:** `TEST_RULE_SENTENCE` in `testRule.ts`, on the key row's test button tooltip (`KeyRow.tsx`) and the due and whole-song banners; the floor in `tempoGate.ts`, shown by `SongMetronomeBox.tsx`; "Below ♩ …, the floor for this song" in `SingleRunModal.tsx`; the ladder dots' aria-label in `practiceTest/TestLadderBand.tsx`; the BELOW tag on a run in `PracticeTestPanel.tsx`. *Repointed 10 Sep 2026: the cell modal and the whole-song modal it cited retired on 23 and 30 Aug, and the rule moved onto the shared panel. The banner on changing tempo has no successor.*
- **The best-surfaced rule in the app.** This is the standard everything else should meet.
- **The sixth place, added 20 Aug 2026** (`690f55e`). All five above are *at the drill*; the one place the rule was not stated was where the number gets read. A repertoire section row on the dashboard now gives the gate as what would advance it, and distinguishes it from coverage in the same breath — coverage counts logged practice, the score counts clean run-throughs, and rolling them together would let an hour of noodling read as a pass.

### 3.9 Session-timer drift `[HALF]`

- **Rule:** soft warning below 60% active/wall after 2 min; hard "Still practicing?" prompt after 15 min paused. `src/lib/sessionTimer/drift.ts:22, 29, 32`.
- **UI:** the banner shows "X min active of Y min elapsed" — consequence visible, trigger threshold not. The design comment at `:13` says a mostly-paused session "should not count as a full practice session in history"; nothing in the UI says that.

### 3.10 Prompt suppression `[INVISIBLE]`

- **Rule:** max 3 user-facing prompts per local day; all prompts suppressed for 2 hours after a session start. Scope-maintenance dismissal quiets for 7 days (`scopeMaintenanceState.ts:52`). `src/lib/prompts/types.ts:61, 73`.
- **UI:** invisible. Prompts you'd expect simply don't appear.

### 3.11 Abundance / "nothing urgent" `[INVISIBLE]`

- **Rule:** fires when the pool is empty, or every goal is at pace ratio ≥1.0, or the pool is ≤3 items with top weight <1.5 **and** you've already practised today. `src/lib/sessionAlgorithm/abundance.ts:38, 42`.
- **UI:** the three-path screen appears; the trigger is invisible.

---

## Tier 4 — Gates that only limit or hide a feature

Lower stakes: nothing you're looking at is wrong, you just can't get somewhere
and don't know why.

| Rule | Where | Status | UI |
|---|---|---|---|
| CR tier N+1: 80% of tier-N items need ≥10 attempts **and** ≥80% passed (read live from `ratingRules`) | `chord-recognition/tierUnlock.ts` | `[FIXED]` | Settings §3 states the rule and the two numbers are editable there (`68ac832`); the unlock toast names the material and links to it (`useTierUnlockNotice.ts`, `db79ecb`) |
| Only 3 new items introduced per tier per session | `chord-recognition/tierUnlock.ts:24` | `[INVISIBLE]` | — |
| ~~Progressions stage unlock~~ — **rule deleted 10 Sep 2026**; the Full Progression card has no Tiers and a session draws the whole shared list narrowed by the card's filter | `fullProgressionPool.ts` | `[CLOSED]` | Settings §3 names Progressions among the modules with no Tiers |
| Scales-modes tier unlock — same rule as chord recognition | `scaleModeTierUnlock.ts` | `[FIXED]` | Settings §3 states it (`68ac832`); the unlock toast names the modes and links to it (`db79ecb`) |
| Cross-submodule ET gate — Scales & Modes opens once CR Tier 1 clears (the progressions half was deleted 10 Sep 2026) | `etStageGate.ts` | `[FIXED]` | Settings §3 says it in a sentence (`68ac832`) |
| S&P tier N+1 at 50% of tier-N cells reading **Fluent** or better | `spTiers.ts` (`computeSPUnlockedTier`, `spTierUnlockThreshold`) | `[FIXED]` | Settings §3 has its own block, and the 50 is editable there (`be25c41`). Counted the acquisition stage (`acquired`+) until 10 Sep 2026, while the page said **Fluent**; it now reads the rating, per drill, the way the grid's progress line does (`1066a47`) |
| Earlier-tier items you never touched stay hidden after unlock | `chord-recognition/tierUnlock.ts:135-143` | `[INVISIBLE]` | — |
| Weak spots: <60% accuracy with ≥4 attempts, padded to 8 with untouched items | `ChordMotionTab.tsx` (`suggestWeakMotions`) | `[INVISIBLE]` | Untouched items presented as "weak spots" |
| Prep breakdown hidden above 12 items | `prepItemBreakdown.ts:39` | `[INVISIBLE]` | Silently shows total only |
| Swap picker caps: 20 same-submodule, top 3 different-submodule | `proposalSwap.ts:101, 104` | `[INVISIBLE]` | — |
| Max 20 items per block | `sessionDesign.ts:443` | `[INVISIBLE]` | — |
| Adaptive selection: 1.3× weight for items outside the last 10 | `adaptiveSelection.ts:7-9` | `[HALF]` | Window size shown at `FluencyTracker.tsx:290`; multiplier not |
| Backup nudge after 7 days, snoozes 3 | `BackupReminderBanner.tsx:8-9` | `[HALF]` | Effect visible, cadence not |
| Song-of-Month TBD nudge at 50% comfortable | `songOfMonthPrompts.ts:42` | `[INVISIBLE]` | — |
| Behind-pace notice: <50% of weekly target with >2 days left | `weeklyPace.ts:52-53` | `[INVISIBLE]` | — |
| Weekly override prompt: gap ≥5 attempts or ≥10% | `weeklyDerivation.ts:505-506` | `[INVISIBLE]` | — |
| Weekly targets assume 10 attempts/item declarative, 3/item procedural | `weeklyDerivation.ts:60, 65` | `[INVISIBLE]` | Silently sets every weekly number |
| Creative session <2 min → `quickExploration` | `creative/engine.ts:677` | `[SURFACED]` | Live at `CreativeTimeModal.tsx:648`: *"under 2 min → quick exploration"* |
| Drill timer floor 30s, ceiling 2× planned | `sessionTimer/reducer.ts:22, 202` | `[HALF]` | Buttons stop responding, no message |
| Visual aids fade after 5 correct in a row per category | `FlashcardSession.tsx:140` | `[INVISIBLE]` | The aid just vanishes |
| Session-shape fractions, pace factors, freshness weights (~40 constants) | `sessionDesign.ts` · `weighting.ts:44-90` · `pace.ts:35-56` | `[HALF]` | "Why this plan?" (`ProposalCard.tsx:485`) renders prose reasons. Best-in-class for algorithm internals |

---

## The dashboard's own rules — surfaced on arrival `[SURFACED]`

*Added 20 August 2026.* These were never in the audit, because the surface that
enforces them did not exist when it was taken. They are listed so the next
audit does not have to rediscover them, and because they are the worked example
of what the rest of this document is asking for: **every rule the screen
depends on, readable at the number it affects, with its reason.**

Sixteen rules across four `?` panels — one on each number column header, plus
one on the due filter pill, which is the only rule with no column to sit on.
A test asserts every rule carries a `why`, rather than trusting it:

- **accuracy / fluency** — the 20-attempt window · the parent round-DOWN rule ·
  `excludeFromFluency` · the dash that is not a zero · the mixed-kind dash
- **coverage** — the 3-attempt threshold · full-catalog denominators · the
  percent-plus-attempt-count readout · the lesson threshold ("tried it") ·
  self-assessed starting stages · one row is one shape however many ways you
  practise it
- **recency** — both numbers and why either alone lies · "never" is not an age ·
  why recency counts what accuracy drops · which half each sort direction reads
- **due** — past SM-2's date, not a deadline · why it is a filter and never a
  column · why some modules return nothing from it

Plus, per row: **what skill it trains**, **what would advance it**, and the
rules that make that particular row's numbers odd. 60 written explanations
resolve to all 3,266 rows, each inheriting the nearest one above it and naming
which row it borrowed from. *(Both figures read off the code, not counted by
hand: `affordances.test.ts` asserts the row total and the table sizes.)*

**The two legends are the load-bearing part.** The score column carries two
scales sharing four colours, and a self-rated 75 is *comfortable*, not "75%
correct". They render side by side, headed by kind, and the accuracy legend is
*derived from the band table* rather than typed beside it — a legend naming a
cut-off the code does not use is worse than no legend.

---

## Scoreboard

*Every count here is the tag count from **Status markers** above, recounted
from the entries whenever one changes, with the date it was last read.*

**Fully explained — 10** *(counted 10 Sep 2026; 6 surfaced + 4 fixed)*:
min rep seconds (2.3) · opt-in non-logging (2.6) · day-class calendar legend
(3.5) · tempo floor + 3-consecutive gate (3.8, now surfaced at the number as
well as at the drill) · quick-exploration threshold (Tier 4) · the dashboard's
own sixteen rules, listed above — and, fixed on 10 Sep, the chord recognition
and scales & modes Tier rules, the cross-submodule gate, and the Shapes &
Patterns gate (all four in Tier 4). *Also explained, but not entries of their
own: the Dev Mode toggle and badge (see 2.4, which is a defect), and the tier
legend on intervals (1.11, which stays half — it renders on one surface of
eight). The 20 Aug version of this list counted those two and not 2.6, which
is how it said 6 while the greps said something else.*

**Half-surfaced — 19** *(counted 10 Sep 2026)*: the effect is named, the rule
isn't — or it's stated in one module and silent in the others that use it. Two
moved here from invisible on 20 Aug (§1.5, §1.6), each because the dashboard
now states it and the older surface still does not. §1.7 also moved here and
then straight out again — see below. Two left on 10 Sep: the chord recognition
Tier rule, now fixed, and §1.9, closed.

**Closed by removing the rule — 3** *(counted 10 Sep 2026)*: §1.7, the
supplementary-row exclusion; the progressions stage unlock (Tier 4), deleted
10 Sep 2026 because it gated a catalog no card drew from; and §1.9, the
Musician Balance radar's invented targets, deleted with the old dashboard on
27 Aug and only noticed here on 10 Sep. Writing the
legend for §1.7 is what showed the rule was wrong. That is the strongest case
this document has made for itself: an invisible rule survives because nobody
has to defend it in plain words, and the moment one did, it did not survive.

**Completely invisible — 20** *(counted 10 Sep 2026)*: including acquisition
stage, both SR schedulers, the maintenance bar, and the fact that drill days
don't count as practice days. The four tier/stage unlock systems were here
until 10 Sep 2026: three are fixed and one was closed.

**Defects (not legibility) — 3** *(counted 10 Sep 2026)*: §1.8b a catalog id
rendered as a label (468 rows still open) · §1.12 three disagreeing tier
computations · §2.4 first engagement bypassing Dev Mode.

**Found while fixing, not yet tagged:** §3.1's note — *two different rules are
both called coverage*, the acquisition stage and the dashboard's 3-attempt
threshold. Same shape as §1.12, and a design call rather than a wiring job.

---

## Changelog

| Date | Change |
|---|---|
| 2026-08-14 | Initial audit against `af9fccf`. No fixes applied. |
| 2026-08-20 | Dashboard legibility step. §1.5, §1.6, §1.7 invisible → half; §1.3 and §3.8 gained their dashboard surfaces; §1.8b's predicted recurrence found and sized at 468 rows. §3.1 checked and deliberately **not** flipped — the dashboard's coverage is a different rule from the acquisition stage. Counts re-read rather than estimated. Commits `1ff0d48`, `a400f87`, `690f55e`. |
| 2026-08-20 | §1.7 **closed by reversing the rule**, hours after being half-surfaced. Supplementary rows now gate acquisition; `gatesAcquisition()` deleted; chord shapes 648 → 720. New *closed* marker added for a rule removed rather than explained. |
| 2026-09-10 | **The four tier/stage unlock systems stopped being invisible.** Settings gained *Unlocking Tiers of Difficulty*, which states the rule, names what is in each Tier, and makes the attempts-to-clear, the Tier share and the Shapes & Patterns cell share editable — read live from `ratingRules`, so a change re-grades on the next read. The unlock message on both Ear Training ladders now names the material it opened and links back to that section. The **progressions ladder was deleted rather than explained**, the second use of the *closed* marker: it gated the old eight-entry catalog and no card drew from it. The acquisition stage's own 0.8 now reads the Fluent floor, so the app has one 80. |
| 2026-09-10 | **Counts made live.** Every summary count is now recounted from the entries whenever an entry changes, with the date it was read beside it: 20 invisible · 20 half · 6 surfaced · 4 fixed · 3 defects · 2 closed, 55 entries (the 20 Aug total too). The four Tier 4 unlock rows were renamed from an undefined VISIBLE tag to the *fixed* marker this file defines for that, with their commits. The S&P gate's row and §3.1 now say it reads the **Fluent** rating rather than the acquisition stage (`1066a47`). The scoreboard's "fully explained" list is rebuilt from the tags: it had counted Dev Mode and the intervals tier legend, which are not surfaced entries, and missed §2.6. |
| 2026-09-10 | **No entry cites a deleted file.** Twelve citations pointed at files that no longer exist; each was repointed at what replaced it or, where nothing did, said so: §1.3 (the old progressions quiz and ladder, the old dashboard), §1.9 (**closed** — the radar went with the old dashboard), §1.11 (the harmonic fluency tracker, now the category card), §1.12 (the read layer), §2.3 and §2.6 (the drill pop-ups, now the shared drill panel — §2.3 is explained after a run only now, not before it), §3.3 (the SM-2 flashcard scheduler, retired for the shared spacing engine), §3.4 (the decay bands, now four due states; the "sticky" rule did not survive), §3.8 (the cell and whole-song modals, now the shared panel). §1.4 no longer names a number. `src/lib/__tests__/ruleLegibilityPaths.test.ts` fails on any cited path the source tree does not have. Counts: 20 invisible · 19 half · 6 surfaced · 4 fixed · 3 defects · 3 closed, still 55. |
