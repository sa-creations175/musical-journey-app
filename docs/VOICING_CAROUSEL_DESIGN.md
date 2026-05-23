# Voicing Carousel — Design

Musical Journey App · Repertoire / lead sheet · authored 2026-05-23

> Status: **Steps 1–3 COMPLETE & committed — awaiting go for Step 4 (sync polish).**
> O1 resolved: no data rewrite (§5). O2 resolved: "save as pattern" is global
> per quality. Step 3 added a position counter ("N of M" over the full
> candidate set) and a synthetic "Custom" slide for hand-edited voicings. Authored by Claude Code from the locked decisions
> Silas supplied plus a read-only audit of the current voicing storage, chord
> editor, `PianoKeyboard`, `voicingColors`, and the mental-viz library. Build
> runs in the 4-step sequence in §8; `npm run build` before every commit.

---

## 1. Problem & goal

Tapping a chord in the lead-sheet bar grid shows exactly **one** voicing — the
single voicing stored on that `ChordPlacement` (or an empty keyboard with an
"+ Add voicing" prompt). There's no way to browse alternative
voicings/inversions for the chord without leaving the lead sheet and rebuilding
them by hand. That's a real practice-friction point: while charting a song you
want to audition fingerings quickly.

**Goal:** a swipeable **carousel of candidate voicings** in the chord-editor
popover. Each slide is a reusable *voicing pattern* (an inversion / shape for
the chord's quality) rendered on the existing `PianoKeyboard`. The user swipes,
picks one to apply to that placement, can **pin** favorites for that placement,
and can **save** a hand-built voicing as a new reusable pattern.

Non-goal (deferred, locked): feeding these patterns into the mental-viz drill
pool. See §9.

---

## 2. Locked decisions (from Silas)

1. **Absolute semitones above root is the canonical voicing convention** (the
   one the mental-viz library already uses). The editor keyboard moves to
   `absoluteOffsets`.
2. **Legacy `ChordPlacement.voicing` entries need a one-time migration** to the
   canonical convention. Conversion logic in §5. *(See §5 for an audit finding
   that changes what "migration" means here — flagged for sign-off.)*
3. **`isSystem: true` rows are seeded from code and never synced** to Supabase.
4. **`isSystem: false` (user-saved) rows sync** to the `voicing_patterns`
   Supabase table.
5. **`pinnedVoicingIds` is per `ChordPlacement`** — not per song, not per
   quality globally.
6. **Mental-viz drill-pool integration is deferred.**

---

## 3. Data model

### 3.1 New table: `voicingPatterns` (Dexie) / `voicing_patterns` (Postgres)

A reusable voicing shape for one chord quality, in the canonical convention.

```ts
export interface VoicingPattern {
  /** System: 'vp:sys:<qualityId>:<tag>' (deterministic, stable across
   *  devices). User: crypto.randomUUID(). */
  id: string;
  /** Catalog quality id — a key of QUALITY_INTERVALS ('maj','min7',
   *  'dom9',…). NOT the user-typed suffix. See §4. */
  qualityId: string;
  /** Carousel label, e.g. 'Root position', '1st inversion',
   *  'dom9(13) — A'. */
  label: string;
  /** Voicing tones as ABSOLUTE semitones above the root, with hand —
   *  the canonical convention, identical in shape to mental-viz items. */
  offsets: VoicingEntry[];
  /** true = code-seeded; never enqueued to the cloud (decision 3). */
  isSystem: boolean;
  /** Carousel order within a quality (system rows first by this; user
   *  rows appended). */
  sortOrder: number;
  /** Provenance: 'triad-inv' | 'seventh-inv' | 'extended-dom' | 'user'. */
  source: string;
  createdAt: number;
  updatedAt: number;
}
```

Dexie store line (schema **v27**, additive — Dexie inherits all prior tables):

```
voicingPatterns: 'id, qualityId, isSystem, [qualityId+isSystem], [qualityId+sortOrder]'
```

Postgres (`voicing_patterns`, migration **005**) follows the existing
user-scoped pattern from migrations 003/004: `(user_id, id)` composite PK,
`quality_id` as the one indexed top-level column, everything else in `data`
JSONB, RLS + 4 policies + `updated_at` trigger via `install_user_scoped_table`.
**Because system rows never sync, this table only ever holds user rows** — but
the column shape matches a full pattern so a user row round-trips cleanly.

### 3.2 `ChordPlacement` — two additive fields

```ts
// added to ChordPlacement (src/lib/db.ts), both optional/JSONB:
voicingPatternId?: string;   // which VoicingPattern the current `voicing`
                             // came from (provenance + carousel highlight).
                             // Cleared when the user hand-edits `voicing`.
pinnedVoicingIds?: string[]; // pattern ids the user pinned FOR THIS placement
                             // (decision 5). Surfaced first in the carousel.
```

`voicing` (the existing field) **stays the rendered source of truth.** Selecting
a carousel slide copies that pattern's `offsets` into `voicing` and stamps
`voicingPatternId`. Hand-editing the keyboard mutates `voicing` and clears
`voicingPatternId` (it's now a detached custom voicing); the user may then "save
as pattern" to mint a user `VoicingPattern`. This keeps the existing render +
persist path (`commit({ chordPlacements })`) untouched — see §6.

---

## 4. Quality mapping (audit #1 resolution)

**There is a real mismatch, and we map it explicitly — never silently drop.**

- `ChordFunction.quality` (what `chordPlacements` store) is the **user-typed
  suffix**, lightly normalized by `chordFunction.ts` — e.g. `''`, `'m'`,
  `'maj7'`, `'m7'`, `'7'`, `'m7b5'`, `'dim'`, `'aug'`, `'sus4'`, `'add9'`,
  `'9'`, `'13'`. It is free-text-ish and not guaranteed to equal any catalog
  string.
- `QUALITY_INTERVALS` / `chordShapeOffsets` (catalog.ts) are keyed by catalog
  **id** — `'maj'`, `'min'`, `'dom7'`, `'min7'`, `'m7b5'`, `'dom9'`, … (all 29
  qualities present).
- `CHORD_QUALITIES` carries **both** `id` and `suffix`, so the canonical
  suffix→id table is derivable from it directly.

New pure module `voicingQualityMap.ts` (Step 1 deliverable):

```ts
qualityIdFromSuffix(suffix: string): { id: string; exact: boolean }
```

1. Normalize: trim; fold common alternates the parser can emit or a user can
   type — `'°'→'dim'`, `'°7'→'dim7'`, `'+'→'aug'`, `'M7'|'Δ'|'ma7'→'maj7'`,
   `'-'→'m'`, `'min…'→'m…'`, `'(maj7)'` handling, etc.
2. Direct lookup in the `suffix→id` table built from `CHORD_QUALITIES`.
3. **Fallback (never drop):** unrecognized suffix → infer the triad/seventh
   base from markers (`m`/`-` → minor, `°`/`dim` → dim, `+`/`aug` → aug, a `7`
   token → dominant-or-minor-7, else major), return `{ id, exact: false }`.
   The carousel still shows that base's patterns and (Step 3) a small "closest
   match" note so the user sees we approximated rather than silently showing
   nothing.

Unit tests assert every `CHORD_QUALITIES.suffix` maps to its own `id`, the
alternates fold correctly, and the fallback never throws / never returns an id
absent from `QUALITY_INTERVALS`.

---

## 5. Convention & migration ✅ (resolved: no data rewrite)

**Audit finding that changes the premise of decision 2.**

I traced the exact numeric meaning of both conventions in `PianoKeyboard`:

- **Stored offset (both conventions):** `offset = (interval-from-root mod 12) +
  12·octaveBand`, always ≥ 0. The editor writes this via
  `fullOffset = offsetOf(pc) + 12·octaveIndex`.
- **Legacy render (`absoluteOffsets` off):** places the tone C-anchored, so a
  tone whose pitch class falls *below* the root wraps to the **left** of the
  root within the C-octave.
- **Absolute render (`absoluteOffsets` on):** places the tone at semitone
  `rootPc + offset`, i.e. strictly **ascending from the root**.

For a given stored number the **pitch class is identical** under both modes; the
**only** difference is that below-root tones render an octave higher (to the
right) under absolute. Worked example, root E (pc 4), stored offset 8:
- legacy → C in octave 0 (left of root), absolute → C in octave 1 (right of
  root). Same pitch class, same interval-from-root (b6); different register.

**Implication:** absolute mode **cannot** represent a below-root tone (offsets
are non-negative semitones *above* root), so a migration that preserves the
exact legacy C-anchored register is **impossible** — and unnecessary, because
the stored numbers already encode interval + octave-band, which absolute renders
correctly as an ascending stack.

**DECISION (Silas, 2026-05-23):** treat existing `ChordPlacement.voicing`
offsets as already-canonical and **flip the editor keyboard to `absoluteOffsets`
with no data rewrite.** The only visible change is that any below-root tone now
renders ascending (an improvement, and rare in editor-authored voicings since
the user taps ascending). Step 2 ships (as built):
- a pure **idempotent sanitize** (`sanitizeVoicing`, `lib/voicingColors.ts`):
  normalize legacy numbers, drop exact (offset+hand) duplicates, sort
  ascending — *not* a register-changing rewrite. Applied at **write-time**
  (the editor's Save), NOT as a bulk DB migration: existing offsets are
  already canonical, so a bulk pass would only churn sync for zero change.
- **below-root tones are allowed.** In absolute *editable* mode a tap below
  the root emits a signed (negative) offset that `voicingKeyPosition` renders
  correctly to the left of the root — a legitimate voicing choice (a tone
  under the chord root), so negatives are kept, not dropped. The toggle emits
  the true semitones-from-root so taps round-trip and removal works.
- a **round-trip test** proving the pitch-class set is preserved for every
  existing voicing shape (legacy-render pc == absolute-render pc for any ≥0
  offset, all 12 roots).

**Rejected alternative (exact-register preservation):** would require *widening
the canonical model to allow below-root tones* (signed offsets) rather than
"migrate" — a bigger change that contradicts decision 1.

---

## 6. Persist & sync path (audit #2 + #3)

### Write path — already in place, no new plumbing

```
PianoKeyboard onToggle / carousel select
  → ChordEditorPopover builds VoicingEntry[]
  → onVoicingChange(cell, voicing)                     BarGridView.tsx:383
  → onChordVoicingChange(placementId, voicing)         BarGridView → LeadSheetSection
  → handleChordVoicingChange                           LeadSheetSection.tsx:373
  → updateChordPlacement(placements, id, patch)        barGrid.ts:610  (pure spread)
  → commit({ chordPlacements: next })                  LeadSheetSection.tsx:171
  → onChange(patch) → updateSection                    SongDetailView.tsx:507
  → db.songSections.update(id, { chordPlacements })
```

`commit` writes the **whole `chordPlacements` array** on the section row.
`updateChordPlacement` is a pure `{...p, ...patch}` spread. **So
`voicingPatternId` and `pinnedVoicingIds` ride the existing path for free** —
Step 2/3 just widen the `patch` object passed to `updateChordPlacement` (and the
`onChordVoicingChange` signature) to carry them. The section row syncs as JSONB
via the existing `songSections → song_sections` mapping, so the new placement
fields sync automatically. (Clearing a field uses the existing `onReplace`/`put`
route in `commit` that already handles `undefined`-stripping.)

### `voicingPatterns` sync — register once, skip system rows

Sync is driven by Dexie write-hooks (`installSyncHooks`) and initial
`backfill`, both of which funnel through `enqueue` (engine.ts). To honor
decisions 3+4, add **one guard at the `enqueue` boundary**: skip `upsert` ops
whose row has `isSystem === true`. This single, well-commented line covers both
the live-write and backfill paths and is a no-op for every other table (none
else carries `isSystem`). Then register the table normally in `SYNC_TABLES`:

```ts
{ dexie: 'voicingPatterns', pg: 'voicing_patterns', idField: 'id',
  topLevel: [{ dexie: 'qualityId', pg: 'quality_id' }] }
```

### Seeder — confirmed side-effect-free (audit #3)

`chordShapeOffsets(qualityId, inversion)` and `extendedDomOffsets(v)` in
`mentalVizVoicing.ts` are **pure**: they read the `QUALITY_INTERVALS` /
`INTERVAL_PC` consts and do arithmetic; the only import is `catalog.ts`, which
is pure const data + functions (its sole import is a *type* from db.ts, erased
at build). So the seeder can call them at init with no side effects. The seeder
imports from `mentalVizVoicing.ts` directly (not `mentalVizLibrary.ts`, which
would also build the 600-item array — harmless but wasteful).

Seeder shape mirrors `seedProficiencyDefinitionsIfNeeded` (goals/data.ts):
in-flight guard, `whenSyncReady()`, compute the system rows, delete obsolete
system ids, `bulkPut`. **It only ever touches `isSystem: true` rows** — user
rows are never deleted or overwritten by the seeder. Invoked lazily (decision:
from the repertoire entry component, e.g. `Repertoire.tsx`, alongside
`seedRepertoireIfNeeded`).

---

## 7. System pattern catalog (what the seeder generates)

Derived from the existing mental-viz voicing engine so the carousel and the
mental-viz reveal stay visually identical:

- **Triads** (`maj min dim aug sus2 sus4`): root + inv1 + inv2 via
  `chordShapeOffsets(id, inv)`. → 6 × 3 = 18 patterns.
- **Sevenths** (`maj7 min7 dom7 m7b5 dim7 mmaj7`): root + inv1 + inv2 + inv3 via
  `chordShapeOffsets(id, inv)`. → 6 × 4 = 24 patterns.
- **Extended dominants** (`dom7b9`, `dom9`-family etc.): the 8
  `EXTENDED_DOM_VOICINGS` via `extendedDomOffsets(v)`, mapped to their catalog
  qualities. → 8 patterns.
- **Other extensions/special** (`maj9 min9 maj11 … 6/9`): root-position stacks
  via `chordShapeOffsets(id, 0)` (the full stack `QUALITY_INTERVALS` already
  defines). → one each.

Patterns are **key-agnostic** (offsets from root) — the carousel applies them at
the placement's resolved `rootPc`, exactly like the editor does today. Counts
finalize in Step 1; the seeder is the source of truth, asserted by tests.

---

## 8. Build sequence (4 steps)

> **Step 1 only, then stop and report** (per Silas). Each step ends with
> `npm run build` + tests green before commit.

**Step 1 — Data layer: `voicingPatterns` table + seeder + quality map.**
- `VoicingPattern` type + Dexie v27 store line (db.ts).
- `voicingQualityMap.ts` (§4) + tests.
- System-pattern seeder (§6/§7) deriving offsets from `mentalVizVoicing.ts` +
  tests (counts, determinism, ids stable, offsets non-negative & ascending).
- `SYNC_TABLES` entry + `isSystem` skip guard in `enqueue` + test that a
  system-row write does **not** enqueue and a user-row write does.
- Supabase migration `005_voicing_patterns.sql`.
- **No UI.** Report back, wait.

**Step 2 — `ChordPlacement` fields + convention switch + normalization.**
- Add `voicingPatternId?`, `pinnedVoicingIds?` (db.ts; additive, schema-doc
  bump). Widen `updateChordPlacement` patch + `onChordVoicingChange` signature.
- Flip the editor `PianoKeyboard` to `absoluteOffsets` (§5).
- One-time idempotent voicing normalization pass + round-trip tests (§5).

**Step 3 — Carousel UI in `ChordEditorPopover`.**
- Replace the single keyboard with a swipeable carousel of candidate patterns
  for the chord's quality (via `voicingQualityMap` → system + user patterns).
- Select → set `voicingPatternId` + copy offsets into `voicing` → commit.
- Pin/unpin → `pinnedVoicingIds`. "Save current as pattern" → user
  `VoicingPattern` (isSystem:false).
- Reuses `PianoKeyboard` (absolute, read-only per slide; editable on the
  "custom" slide).

**Step 4 — User-pattern sync + ordering polish + edges.**
- Carousel order: pinned → user → system (by `sortOrder`).
- Confirm user patterns sync via `voicing_patterns`; empty/unknown-quality
  states; lead-sheet read view reflects the selected voicing.
- Final tests + build.

---

## 9. Deferred / out of scope

- **Mental-viz drill-pool integration** (decision 6): user-saved patterns do not
  (yet) become mental-viz drill items.
- Cross-song "voicing library" browser as a standalone screen (this feature is
  the in-editor carousel; a global browser can read the same table later).
- Voice-leading suggestions between adjacent chords.

---

## 10. Open questions

- **O1 — RESOLVED (2026-05-23):** no data rewrite; flip to `absoluteOffsets` +
  an idempotent sanitize pass at Step 2 (§5).
- **O2:** Should "save as pattern" be global (any chart) or scoped — current
  design: global user patterns, surfaced for the matching `qualityId`
  everywhere. Confirm.
```
