# Lead Sheet — Lyric/Syllable Layer: Audit + Redesign Plan

Status: **Track 2 approved and in progress. Track 1 sequence awaiting sign-off.**
Scope: the per-bar beat grid's lyric row, the lyric drawer, chord-cell coloring, plus a read-only song-key recon.

Revision history:
- **rev 1** — original audit + plan.
- **rev 2 (2026-08-03)** — **Place = pin** (A2) replaces the separate pinned flag; **marker = places one
  unit** (A1) replaces rigid whole-line translate; **tap-to-place** (A3) replaces send-to-beat; cross-section
  placement allowed (§2.0).
- **rev 3 (2026-08-03)** — decisions in. Option 1 confirmed. **ONE LYRIC STORE**: lyric lines move from
  section-owned to **song-owned**, the drawer holds exactly one thing, and "pending" ceases to exist as a
  separate bucket (pending = unplaced). This supersedes rev 2's three-part drawer and re-sequences steps 1
  and 7. Chord color scoped to chord cells only; hex+inline-style approved.

---

# PART 1 — AUDIT (unchanged, still current)

## 1. Data model

| Thing | Location |
|---|---|
| `LyricLine` interface | `src/lib/db.ts:489-504` |
| Field on the section | `SongSection.lyricLines?: LyricLine[]` — `src/lib/db.ts:349` |
| Storage | Dexie table `songSections`, **unindexed field inside the record blob** |
| Sync | `src/lib/sync/tables.ts:61` — only `song_id` is a top-level column; **everything else rides in a `data` JSONB blob** |
| Pure helpers | `src/modules/repertoire/lyricLine.ts` |
| Render | `BarGridView.tsx` (`LyricBarSegment`, `BeatDropSlot`, `WordChip`) |
| Mutations | `LeadSheetSection.tsx` |

```ts
interface LyricLine {
  id: string;
  words: string[];          // each entry IS a syllable after splitting
  startBar/startBeat/endBar/endBeat: number;
  wordOffsets?: number[];   // per-word beat delta, parallel to `words`
}
```

### The critical finding: a syllable has no stored position

Position is **derived at render** by `distributedWordPositions` (`lyricLine.ts:63-80`):

```
position[i] = startGlobalBeat + (i * (endGlobalBeat - startGlobalBeat)) / (n - 1) + (wordOffsets[i] ?? 0)
```

A syllable's cell is a function of **four things it does not own** — line start, line end, total syllable
count, and its own index — plus one term it does (`wordOffsets[i]`). Every ripple in §5 traces to this.

`BarGridView.tsx:1186-1199` converts the float to a cell (`Math.floor` for bar, `Math.round` for beat, clamped).

### Ordering within a beat cell

**Implicit, no stored order.** `slots[beatPos]` is built by pushing in: `placedLines` array order → per line,
`startMarker` → `endMarker` → words in ascending index. Rendered in push order into a `flex flex-col`.
Accidentally stable today (every mutation uses `.map()`); not stable by design.

### Splitting

`splitWord` (`lyricLine.ts:196-249`), `joinWords` (`:258`), `setWordText` (`:295`). All pure; handlers at
`LeadSheetSection.tsx:557-587`. Splitting changes `n`, which re-bases every syllable in the line — see §5.

## 2. Drag logic (@dnd-kit)

`@dnd-kit/core ^6.3.1`, `sortable ^10.0.0`, `utilities ^3.2.2`. **One `DndContext` per section**
(`LeadSheetSection.tsx:1045-1087`) wrapping `BarGridView` + `LyricStagingArea`.

| Aspect | Current | Location |
|---|---|---|
| Sensors | `PointerSensor { distance: 5 }`, `KeyboardSensor` | `:673-676` |
| Collision | prefix-filter droppables → **`closestCenter`** | `:685-712` |
| `measuring` | **absent** → defaults to `WhileDragging` (measured once, at drag start) | `:1045` |
| `DragOverlay` | **absent** — draggables translate in place | — |
| `onDragStart` / `onDragOver` | **absent** — only `onDragEnd` | `:1048` |
| Ancestor transforms | **none.** No `zoom`/`scale` anywhere, incl. `src/index.css` | — |

Ids (`BarGridView.tsx:60-74`): `chord:` `bar:` `emptybeat:B:P` `beat:B:P` `pending:` `lineStart:` `lineEnd:` `word:`.
Lyric hooks: `BeatDropSlot` droppable `:1284`; `WordChip` draggable `:1565`; `LineMarker` `:1340`;
`PendingLineStrip` `:839` (a **full-width** draggable).

## 3. BUG 2 — hit-zone offset. Root cause.

**Collision resolves against the dragged element's translated bounding rect, not the pointer.**

`closestCenter` picks the droppable whose rect center is nearest to `collisionRect`'s center, where
`collisionRect = active.rect.current.translated` — the draggable's own rect moved by the drag delta.
Pointer coordinates are never consulted.

The geometry that turns this into the reported symptom:

- Beat cells are `flex-1 min-h-[28px]`; `LyricBarSegment` is a flex row and the lyric row is a stretch grid,
  so **every cell in a row grows to the tallest cell's height**. One cell with several stacked syllables
  makes the whole row tall.
- Syllables are pinned to the **top** of their cell (`justify-start`); a chip is ~14px.
- So a chip's center sits ~`cellHeight/2 − 10px` **above** its cell's center, and that gap grows with row height.
- The pointer→rect offset is fixed at grab time. To make the chip's rect center nearest the *target* cell's
  center, the pointer must move down to roughly the cell's vertical midline — **well below the syllables
  you're looking at.**

Corroboration: `PendingLineStrip` is full-container-width, so its rect center is at the horizontal middle of
the whole grid, arbitrarily far from the pointer. Same cause, larger magnitude.

**This is also why A5's tall stacked cells make the drag feel worse** — the taller the cell, the bigger the offset.

Secondary, same fix: **no `measuring` config.** Rects are measured once at drag start, but removing a chip
from a tall cell reflows the row mid-drag, so the cached rects go stale during exactly the drags that matter.

Ruled out by inspection: ancestor transforms (none exist); overlapping element eating pointer events (the
lyric row is a later DOM sibling with `position: relative`, so it hit-tests above the bar row; the only
overlays are conditional popovers that render *below* their anchor); padding/margin mismatch (`WordChip`'s
node is the visible chip; `px-1` is inside the rect).

**Verification before building — step 0.** The diagnosis explains "the drop won't latch onto the cell I want
until I go lower." If the true symptom is that the drag *never starts* when pressing a chip dead-center, the
cause is different. 10-min check: add `onDragStart={e => console.log(e.active.id, e.active.rect.current.initial)}`
and press a chip dead-center. Fires → confirmed, proceed. Doesn't fire → stop and re-diagnose.

## 4. BUG 1 — no drop feedback

**`isOver` styling exists** — `BarGridView.tsx:1290-1294`: `isOver ? 'border-fluent bg-fluent/10' : 'border-dashed …'`.

It reads as absent for two reasons:
1. **It highlights the wrong cell.** `closestCenter` always returns a winner when the candidate list is
   non-empty, however far away — so a cell is always lit, just not the one under the cursor (§3).
2. **It is genuinely faint** — a 1px border color change plus a 10%-alpha tint on an already-bordered 28px cell.

Also not gated on drag kind. Attach point for the fix: `BeatDropSlot`, `:1284-1295`.

## 5. Move semantics today

| Operation | Behaviour |
|---|---|
| **Drag one syllable** | `applyWordNudge` writes `wordOffsets[i]` only — neighbours don't shift ✅ — but **clamps into `[startGlobal, endGlobal]`** (`lyricLine.ts:159-160`), so a syllable can never leave its line's marker range. Drop past the end marker → silently snaps back. |
| **Drag start/end marker** | `applyStartMarkerDrag`/`applyEndMarkerDrag` set `wordOffsets: undefined` — **every hand-placed syllable in the line is discarded and re-spread.** The most destructive op in the system. |
| **Split / join** | `words.length` changes → the base position of *every* syllable changes → carried-over offsets are deltas on a base that moved. Split one word and the whole line shifts. |
| **Bar reorder** | `reorderBar` remaps `startBar`/`endBar` (`barGrid.ts:807-811`). Spanning lines distort and re-spread. |
| **Bar delete** | `handleDeleteBar` (`LeadSheetSection.tsx:611-644`) **deletes outright** every line touching the bar behind a `window.confirm`. |
| **Paste** | `handleSubmitLyricLines` (`:455-465`) appends fresh lines at `(0,0)`. **Does not move placed syllables** ✅ |

### All readers of syllable-position data (complete)

| Reader | Reads | Affected? |
|---|---|---|
| `BarGridView.tsx` | words, offsets, start/end | rewritten |
| `LeadSheetSection.tsx` | all, all mutations | rewritten |
| `barGrid.ts:807` `reorderBar` | `startBar`/`endBar` | **yes** — must remap anchors |
| `LeadSheetSection.handleDeleteBar` | `startBar`/`endBar` | **yes** — must consider anchors |
| `db.ts` | type only | no |
| `lyricLine.test.ts`, `barGrid.test.ts` | pure helpers | stay green |

Nothing else in the app reads lyric lines — no practice module, play mode, export, or sync special-casing.

## 6. A5 — two lines' syllables in one beat cell

**Confirmed: allowed, and it renders as a single vertical stack.** `LyricBarSegment` receives `placedLines`
= *every* placed line in the section (`BarGridView.tsx:522`) and pushes all of their words into the same
`slots[beatPos]` array (`:1179-1200`). `BeatDropSlot` renders that array into one `flex flex-col`. There is no
per-line lane, no grouping, and no cap.

**What produces a 6-unit stack like bar 13.** Two distinct mechanisms, both reachable today:

1. **Collapsed range (most likely for "O / come, / let / us / adore / Him", which is one line).** When
   `endGlobal == startGlobal`, `totalBeats = 0`, so `distributedWordPositions` returns the *same* position for
   every word — all six land in one cell. Reachable via the marker drags, which explicitly permit
   `start == end` (`lyricLine.ts:96, 120`).
2. **Genuine multi-line overlap.** Two different lines with anchors resolving to the same cell simply stack,
   ordered by `lyricLines` array order.

I can confirm both mechanisms from the code; I can't tell which one bar 13 hit without the data. One-line
console check: `(await db.songSections.get('<sectionId>')).lyricLines` — if one line shows
`startBar===endBar && startBeat===endBeat`, it's mechanism 1.

**Minimal mitigation, consistent with A2/A3: none needed beyond the redesign.** Stacking stays allowed and is
correct — cross-line and cross-section stacking is explicitly wanted (A3). The redesign fixes it structurally:

- Mechanism 1 **cannot occur** under A2. There is no derived even-spread across a line range; unplaced
  syllables spread between *placed endpoints*, and a run with no distinct endpoints doesn't render in the grid
  at all (it stays in the drawer). A zero-width range is not representable.
- Mechanism 2 stays, now with an explicit `order` (E) so the stack is stable and user-settable (A4).
- The ghost/placed styling (A2) makes a mixed stack legible — you can see which of the six are anchored.
- Bug 2's fix removes the "tall cell ⇒ worse drag" coupling, so a deep stack stops degrading the drag.

---

# PART 2 — REVISED PLAN

## 2.0 Consequence of A3 that needs a decision

> "Cross-section targets are ALLOWED — a line's syllables may live in cells of different sections. Line
> ownership/grouping is irrelevant to rendering; only syllable anchors matter."

This is the single highest-impact item in the revision and it breaks three current containment assumptions:

1. **Bar indices are section-local.** `barIndex: 3` is meaningless without knowing which section. An anchor
   must therefore carry `sectionId`.
2. **Each section renders only its own `section.lyricLines`.** If a syllable owned by section A can be
   anchored into section B's bar, section B must resolve syllables **by anchor across all sections**, not from
   its own record.
3. **Each section has its own `DndContext`** (`LeadSheetSection.tsx:1045`). A drag physically cannot cross
   sections without hoisting the context to the song level.

Your own wording resolves (3) cleanly: **"Drag remains for local moves."** So:

- **Drag = intra-section**, unchanged one-context-per-section. No hoisting.
- **Tap-to-place = anywhere**, including cross-section — it needs no drag context, only a shared "armed"
  state above the sections.

**Option 1 — CONFIRMED (rev 3).** Anchor carries `{ sectionId, barIndex, beatPos, order }`; the armed state
and the anchor→cell read model lift above `LeadSheetSection`; each section renders whatever anchors point at
it. **Line identity becomes pure text grouping with no positional meaning.**

Rejected (Option 2): keep syllables section-local and *move the data* to the target section on a cross-section
place. Cheaper, but it contradicts "only syllable anchors matter", creates cross-record writes, and makes
un-placing ambiguous about where the syllable returns to.

**Cost of Option 1:** every section's lyric row needs the whole song's syllable set in scope. Today
`LeadSheetSection` is handed one section. This is a prop/context change through the lead-sheet tree, plus a
`useMemo` index of `anchor → syllables` built once per song. Cross-section placement is sequenced as its own
step (6b), after intra-section tap-to-place works.

**rev 3 makes this cheaper, not harder.** Because lyric lines are now *song*-owned (§2.0b), the read model
already lives at song level — there is no per-section store to reconcile. Option 1's "lift the index above
the sections" becomes the natural shape rather than an addition.

## 2.0b ONE LYRIC STORE (rev 3 — supersedes B1's three-part drawer)

**Lyric lines move from `SongSection.lyricLines` to `Song.lyricLines`.** One store per song. Consequences:

- **"Pending" ceases to exist as a concept.** Pending = unplaced = a syllable with no anchor. The pending
  tray (`BarGridView.tsx:459`) and the pending/placed partition (`:277-290`) are deleted, not ported.
- **No per-section paste box.** `LyricStagingArea` is absorbed into the drawer.
- **The drawer holds exactly one thing:** the song's full lyrics as lines. It *is* the full-lyrics reference,
  the paste target, and the unplaced pool, simultaneously — because those were always the same list viewed
  three ways.
- Anchors still carry `sectionId`; bar indices remain section-local. Nothing about line ownership implies
  anything about where its syllables sit (A3).

### Header rows

`LyricLine` gains `kind: 'lyric' | 'header'`. Header rows are **pure visual grouping of the drawer**:
not placeable, not armable, no ghost state, no syllables, never rendered in the bar grid.

**Parsing** — a pure `parseLyricSheet(text)` recognises a header on its own line, case-insensitive, bracketed
(`[Refrain]`, `(Chorus)`) or bare, with an optional trailing number/letter (`Verse 2`, `Chorus 1`):

`Verse · Refrain · Chorus · Pre-Chorus` (also `Prechorus`, `Pre Chorus`) `· Bridge · Intro · Outro · Tag · Vamp`

**NO AUTO-LINKING — deliberate.** Drawer headers do not match, link to, or auto-place into lead sheet
sections. No name matching, no auto-placement. A header named "Chorus" and a section named "Chorus" are
unrelated by design.

**Header correction** — tap any drawer row → a single toggle appears (`make header` / `make lyric line`),
visible only on tap. Fixes parser misses in one tap. Flipping a lyric row to a header discards its syllables
only if none are placed; if any are placed the toggle is refused with a one-line reason (converting would
silently unplace real work).

### Paste = staging step

The drawer's paste area is **editable text until committed**. Parser guesses render **live during staging** —
detected headers appear as divider rows in the preview — so mistakes are visible *before* commit. `add lines`
commits; until then nothing is written. This replaces today's fire-and-forget
`handleSubmitLyricLines` (`LeadSheetSection.tsx:455`).

### Line status in the drawer

| State | Definition | Render |
|---|---|---|
| unplaced | no syllable has an anchor | plain |
| partially placed | some syllables anchored | plain + count (`3/6`) |
| placed | every syllable anchored | subtle check + dimmed text |

Lines always render **in song order regardless of status**, so the drawer doubles as the readable full lyric
sheet. Placed lines are dimmed, never hidden.

## 2.1 Schema

```ts
/** Explicit placement. Presence of `anchor` IS the placed/pinned state (A2). */
export interface LyricSyllableAnchor {
  sectionId: string;   // anchors may point outside the owning line's section (A3)
  barIndex: number;
  beatPos: number;
  order: number;       // stack order within the cell; 0-based, compacted
}

export interface LyricSyllable {
  id: string;
  text: string;
  /** undefined = UNPLACED (ghost, provisionally spread).
   *  defined   = PLACED (immune to all app-driven movement). */
  anchor?: LyricSyllableAnchor;
}

export interface LyricLine {
  id: string;
  /** 'header' rows are drawer-only visual grouping — never placed,
   *  never armable, no syllables. (rev 3) */
  kind: 'lyric' | 'header';
  /** Header label, or the line's source text. */
  text: string;
  syllables?: LyricSyllable[];        // absent on headers

  // --- legacy, section-owned records only; never written again ---
  words?: string[];
  startBar?/startBeat?/endBar?/endBeat?: number;
  wordOffsets?: number[];
}

// NEW home (rev 3) — one store per song:
interface Song {
  lyricLines?: LyricLine[];
}
// SongSection.lyricLines stays declared as the migration source, marked @deprecated.
```

Anchor-as-one-optional-object (rather than three nullable fields) makes "placed" a single check, makes
un-placing a single `delete`, and makes a half-set anchor unrepresentable.

**Dexie version: stays at v32.** Latest declared is `this.version(32)` (`db.ts:3117`); there is no v33. **No
bump needed** — `.stores()` declares indexes only, and `lyricLines` is an unindexed field. This holds for the
new home too: the `songs` table's sync mapping declares only `addedDate` / `learningOrder` as top-level
columns, so a new field rides in the `data` JSONB blob (`sync/tables.ts:44-60`). Precedent for exactly this:
`Song.sectionOrder` (`db.ts:94-101`) and `ChordPlacement.voicing` (`:427`), both added with explicit
"no schema-version bump" notes.

**No Supabase migration** for either table.

**Migration is now a fold, not just a materialize** (rev 3), in one pass:

1. Walk the song's sections **in section order**.
2. For each section's legacy `lyricLines`, convert every word to a `LyricSyllable`, **placed** (anchor set)
   at the cell today's renderer puts it in — same floor/round/clamp, ordered by current visual stacking, with
   `anchor.sectionId` = that section's id.
3. Append the resulting lines to `song.lyricLines` in section order, so the drawer reads top-to-bottom in
   song order on day one.
4. Leave `section.lyricLines` in place untouched (read-only legacy); the song-level store wins once present.

Idempotent and lazy on first lyric op, mirroring `materializeChordPlacements` (`barGrid.ts:526`).
Existing positions import as **PLACED**, not ghosts — today's positions are the user's real work.
**Acceptance test for step 2: pixel-identical first render.**

## A1 — Marker semantics (revised)

Markers place **one unit each**, nothing else moves.

- Drag ▶ → sets the anchor of the line's **first** unit to the drop cell. That unit becomes placed.
- Drag ◀ → sets the anchor of the line's **last** unit.
- No wipe, no redistribute, no translate. `wordOffsets: undefined` is never written again.
- "Unit" = current syllable entry: an unsplit word moves whole; after a split the marker governs the first/last
  *piece*.
- Markers are rendered from the first/last unit's current position (derived), not stored.

Consequence: `applyStartMarkerDrag` / `applyEndMarkerDrag` are retired from the live path (kept for the legacy
read path and their existing tests).

## A2 — Place = pin

Two states, no separate flag:

| State | Data | Render | Movable by app? |
|---|---|---|---|
| **UNPLACED** | no `anchor` | ghosted: secondary color, ~65% opacity, italic | yes — provisionally spread |
| **PLACED** | `anchor` set | full strength + 2px accent underline bar in the cell | **never** |

- Any user placement action — drag, tap-to-place, marker drag, paste-position edit — sets the anchor.
- Placed syllables are immune to **all** app-driven movement: marker drags, re-spreads, paste, split/join
  rebasing, edits elsewhere.
- Re-placing just overwrites the anchor. Always allowed.
- **Un-place**: small `×` on hover / long-press clears the anchor → returns to the ghost pool.

**Provisional spread rule for unplaced runs.** For a maximal run of consecutive unplaced syllables *between*
two placed anchors, spread evenly across the beats between them on the global axis
(section order → barIndex → beatPos). Runs anchored at only one end, or at neither, **do not render in the
grid** — they stay in the drawer. This is what makes the degenerate zero-width case (§6, mechanism 1)
unrepresentable, and it keeps the grid honest about what has actually been placed.

## A3 — Tap-to-place (replaces send-to-beat)

- Tap a syllable chip (placed or unplaced) → **armed** (highlight + hint bar).
- Tap any visible beat cell → placed there. Cross-section targets allowed (§2.0).
- Placing a **line** from the drawer: tap line → *"tap the beat where this line starts"* → tap cell (places
  first unit) → *"tap where it ends"* → tap cell (places last unit) → middle units auto-spread as ghosts.
- Escape / tap-elsewhere cancels arming.
- Drag remains, for intra-section local moves.

Armed state lives above the sections (§2.0) so a cross-section tap can complete.

## A4 — In-cell reorder by tap-to-number

Drag-based intra-cell reordering is **permanently deferred**. Instead: tap a multi-syllable cell → its chips
show order badges (1, 2, 3…) → tap syllables in the order you want → done. Writes `anchor.order`, compacted.
Lowest priority, sequenced last.

## C / E — No-ripple + stable order (unchanged intent, new mechanism)

New pure module `lyricSyllables.ts`:

- `placeSyllable(syllables, syllableId, anchor)` — writes that one syllable's anchor. `order = max(order in
  target cell) + 1` → appends, displaces nothing. No other syllable object is touched.
- `unplaceSyllable`, `setOrderWithinCell`, `normalizeCellOrders` (compact to `0..n-1`), `remapAnchorBars`.
- `splitSyllable(line, id, splitAt)` — **piece 1 inherits the anchor; pieces 2+ get no anchor** (A1). This
  removes the split-rebasing ripple entirely rather than compensating for it.
- `joinSyllables` — merged unit keeps the *first* piece's anchor.
- Render sorts by `order`, tie-broken by `id`, replacing the current push-order accident.

Paste already satisfies no-ripple (§5) and stays append-only; the plan adds a regression test asserting it.

## B1 — Lyric drawer (rev 3: ONE store — still needs its own sign-off before step 7)

Per §2.0b the drawer no longer unifies three buckets — there is only one list. It shows **the song's full
lyrics as lines**, and that same list is the paste target, the unplaced pool, and the reference sheet. The
bar grid stops hosting the paste box and the pending tray entirely.

**Proposed interaction, mobile-first:**

- **Edge tab** — a slim vertical tab pinned to the right edge, `position: fixed`, vertically centred, visible
  at any scroll position while a lead sheet is in edit mode. Label: `♪ lyrics` + a count badge of unplaced
  syllables. ~32px wide, thumb-reachable one-handed.
- **Tap → slide-up sheet** (mobile) / **slide-in panel** (≥768px). Mobile sheet is `fixed inset-x-0 bottom-0`,
  default height ~55vh, drag-handle at top to expand to ~90vh or dismiss — the same bottom-sheet pattern
  `ChordEditorPopover` already uses (`BarGridView.tsx:2190`), so it is a known-good shape on this device.
- **Contents, top to bottom:** staging paste area (collapsed to a `+ paste lyrics` link once the song has
  lines) → **the one line list**, headers as divider rows, lyric lines beneath them. A commit renders in
  place with **no scroll jump** — the new lines appear exactly where the list already was.
- **Staging preview** — while text sits in the paste area, the list below shows the *parsed* result live:
  detected headers as dividers, lyric lines as rows. `add lines` commits; `clear` discards. Nothing is
  written until commit.
- **Row tap → header toggle** — one control (`make header` / `make lyric line`), visible only on tap.
- **Arming collapses the drawer** to a slim hint bar (~40px, fixed bottom) reading *"tap the beat where this
  line starts — tap here to cancel"*, leaving the grid fully tappable. Completing or cancelling restores the
  sheet to its prior height.
- **Un-placed syllables return here**, so the drawer is also the ghost pool.

Open sub-questions for the step-7 sign-off: edge tab on the right edge or bottom-right corner; does the
drawer stay open across section navigation; is the line list selectable-for-copy or tap-only (tap is
overloaded by both arming and the header toggle — likely needs tap = arm, long-press = header toggle).

## B2 — Chord color: flattened degrees

### What the audit found

`colorForFunction` (`BarGridView.tsx:2520-2531`):

```ts
const source = chord.bass && chord.bass !== '' ? chord.bass : chord.function;
const digit = source.replace(/^[b#]/, '');       // ← accidental STRIPPED
return DEGREE_PALETTES[digit] ?? NEUTRAL_PALETTE;
```

- **The accidental is discarded.** `b3` and `3` render identically today — your premise confirmed.
- **Sharps are discarded too**, so `#4` currently reads as 4-family. B2 wants `#4 → b5 → dark-5-family`. That
  is a *remap*, not just a shade, and it is a visible change to existing charts.
- `DEGREE_PALETTES` (`:2463-2511`) has **only** 1–7: green, pink, teal, purple, amber, blue, red. Five new
  dark variants are needed (b2, b3, b5, b6, b7).

### Two blockers — both now decided (rev 3)

**1. The extension clause has no target on this surface.** `chord.function` is constrained by
`/^([b#]*)([1-7])/` (`chordFunction.ts:88`) — degrees are 1–7 with optional accidentals. **9/11/13 can never
appear in `chord.function`**; extensions live in `chord.quality`, which never reaches the color function. So
"9→2, 11→4, 13→6" is a no-op for chord-cell coloring.

Where extensions *are* colored is a **different system**: `src/lib/voicingColors.ts` `INTERVAL_COLOR` — a
semitone-indexed hex palette used by `PianoKeyboard` and the progression quiz. Its header comment already
states the exact principle you're describing: *"normalized to 0–11, so octave/enharmonic equivalents share a
color (b2≡b9, #4≡b5, #5≡b6, #9≡m3, 4≡11, 6≡13)."* It already does this — with a palette unrelated to
`DEGREE_PALETTES`.

So there are **two independent color systems**, and B2 as written conflates them.

**DECIDED (rev 3): chord cells only.** `voicingColors.INTERVAL_COLOR` is not touched in this build. Instead,
T2.3 adds a **cross-reference comment in both files** — *"the enharmonic color principle lives here and in
`<other file>` — change them together"* — so the next person to touch either one finds the other.
**Backlog item recorded (§Future work): unify chord-cell + voicing color systems into one source of truth.**

**2. "ONE tunable darken constant" is not achievable with Tailwind class strings.** `DEGREE_PALETTES` holds
class names (`'bg-green-50 dark:bg-green-950/40'`), not colors. You cannot darken a class name by a numeric
constant, and Tailwind's JIT only emits classes it finds as complete static strings in source — there is no
`safelist` in `tailwind.config.js`, so runtime-built class names would produce **no CSS at all**.

**DECIDED (rev 3): APPROVED.** Move `DEGREE_PALETTES` to hex + inline styles, matching two existing
precedents — `intervalColor` (hex constants) and the practice calendar's `--cal-*` CSS variables
(`index.css:47-70`). A single exported `DARK_STEP` constant then genuinely derives every dark twin
programmatically, retunable in one place while looking at the browser. Cost: `ChordCellBox` and its callers
switch from `className` to `style` for these four tokens.

Sequenced as **its own no-visual-change commit (T2.2)**, verified before T2.3 introduces any recoloring — so
if something shifts, we know which commit did it.

**Accepted and understood:** T2.3's enharmonic remap **will visibly recolor existing charts** — e.g. `#4`
moves from 4-family purple to b5 dark amber. That is the rule working, not a regression.

Fallback per instruction: if darkening alone can't separate `6min7` from `b6min7` at the darkest acceptable
step, add desaturation to the same derivation — **only after** in-browser verification says so.

Dashed border for out-of-key chords is untouched and independent, as specified.

## B3 — Slash chord rendering

**Confirmed current behaviour.** Fill follows the bass: `colorForFunction` returns the *bass* degree's palette
when `chord.bass` is set (`:2527`). And the numerator is greyed at `chordGlyph.tsx:101`:

```jsx
<span className="text-[85%] text-neutral-400 dark:text-neutral-500 …">
  <ChordPart text={numerator} />
</span>
```

That one class is the whole change: the numerator's color becomes the **root's** family text color, keeping
the existing `text-[85%]` size hierarchy. `'1maj/5'` → amber fill, `1maj` in 1-family green, `/5` in the
amber family's text color.

**One constraint:** `ChordGlyph` takes only a `text` string — it has no access to the parsed `ChordFunction`,
so it can't currently look up the root's family. Two options: pass the resolved root color in as a prop from
`ChordCellBox` (recommended — the caller already has the parsed chord), or re-derive from
`splitRootSuffix(numerator).root`. The latter fails in Roman/concrete notation modes, where there is no
leading 1–7 digit (`chordGlyph.tsx:47-51`) — those must keep the current grey fallback either way.

## Files touched

| File | Change |
|---|---|
| `src/lib/db.ts` | + `LyricSyllable`, `LyricSyllableAnchor`, `LyricLine.kind`, **`Song.lyricLines`**; `SongSection.lyricLines` marked `@deprecated`. **No version bump.** |
| `src/modules/repertoire/lyricSyllables.ts` | **NEW** — pure model (place/unplace/split/join/order/spread/remap) |
| `src/modules/repertoire/lyricSheetParse.ts` | **NEW** — `parseLyricSheet` header/lyric row parser (rev 3) |
| `src/modules/repertoire/BarGridView.tsx` | lyric row reads anchors; ghost vs placed styling; `BeatDropSlot` highlight + caret; `SyllableChip`; derived markers; `DragOverlay`; **pending tray deleted** |
| `src/modules/repertoire/LeadSheetSection.tsx` | collision detection, `measuring`, `onDragStart`, handlers on the new model, armed-state wiring; **`LyricStagingArea` removed** |
| `src/modules/repertoire/SongDetailView.tsx` | hosts the song-level lyric store, armed state, and the anchor→cell index |
| `src/modules/repertoire/barGrid.ts` | `reorderBar` remaps anchors |
| `src/modules/repertoire/LyricDrawer.tsx` | **NEW** (B1) — the one store's UI |
| `src/modules/repertoire/LyricStagingArea.tsx` | **DELETED** — absorbed by the drawer |
| `src/modules/repertoire/FullLyricsSection.tsx` | folded into the drawer (or reduced to a read-only view) |
| `src/modules/repertoire/chordGlyph.tsx` | B3 numerator color |
| `src/modules/repertoire/BarGridView.tsx` (palettes) | B2 — `DEGREE_PALETTES` → hex + `DARK_STEP` + cross-ref comment |
| `src/lib/voicingColors.ts` | B2 — cross-reference comment only, no behaviour change |
| `src/modules/repertoire/__tests__/lyricSyllables.test.ts` | **NEW** |
| `src/modules/repertoire/__tests__/lyricSheetParse.test.ts` | **NEW** (rev 3) |
| `src/modules/repertoire/__tests__/chordColor.test.ts` | **NEW** (B2 degree→family mapping) |

`lyricLine.ts` unmodified — legacy read path stays intact, existing tests stay green.

## Future work (backlog, not this build)

- **Unify chord-cell + voicing color systems into one source of truth.** `DEGREE_PALETTES` (degree-indexed,
  "what degree is this chord") and `voicingColors.INTERVAL_COLOR` (semitone-indexed, "what interval is this
  tone") independently encode the same enharmonic principle. Cross-referenced in comments as of T2.3;
  unification would touch the lead sheet, PianoKeyboard, mental-viz, and the progression quiz.
- Intra-cell drag reordering (permanently deferred in favour of A4's tap-to-number).
- Normalizing `Song.key` to a canonical name at write time (see Part 3, items 2-3).

---

# PART 3 — C1 SONG KEY FLOW (read-only recon)

## There are two key stores, and only one bridge between them

**Source A — `Song.key`** (`db.ts:69`), free text on the `songs` table. Written **only** by
`SongDetailView.saveMeta` (`:389`) and `AddSongModal` (`:111`). The lead sheet **reads** it
(`BarGridView.tsx:475 sectionKey={song.key}`) but never writes it — so "set in the lead sheet" means the song
page's meta editor.

**Source B — `songKeys` row with `isOriginalKey: true`.** Schema contract (`db.ts:1703`): *"Exactly one row
per song has isOriginalKey=true at any time."*

**The bridge** is `SongDetailView.saveMeta:409-426` — a single transaction over both tables calling
`reassignOriginalKey`, then `ensureSongHasOriginalKey`. This path is correct, commented, and covered by
`ensureSongHasOriginalKey.test.ts`. It was written in response to a prior production bug on "No Weapon"
(`reassignOriginalKey.ts:48`).

## Where each consumer reads from

| Consumer | Source | Path |
|---|---|---|
| Lead sheet numerals / glyphs / voicing roots | **A** `Song.key` | `BarGridView.tsx:475` → `chordToDisplay`, `keyPrefersFlats`, `chordRootNote` |
| Matrix original/home key column | **B** `isOriginalKey` | `SongMatrixView.tsx:134` → `keysOrderedFromOriginal` (`matrix/keys.ts:46`) |
| Practice scale-prep block | **A** | `repertoireSplit.ts:406, 415, 662` → `parseSongKeyForPrep` |
| Proposal swap | **A** | `proposalSwap.ts:622` |
| Session generation — post-comfortable scheduling | **B** | `repertoireSplit.ts:148` `originalKeyEngagedAt` |
| Song readiness / `isSongPostComfortable` | **B** | `songComfortable.ts:131, 156` |
| Goals — target resolution + copy | **both** | `songTarget.ts:108-151` (B), `:335` (A) |
| `expandKeysOrder` (circle-of-4ths walk) | **A** | `Song.key` → `generateCircleOfFourthsSequence` |

**For your Ab song specifically: `'Ab'` is canonical** — it is in `CIRCLE_OF_FOURTHS_KEYS`
(`matrix/keys.ts:21`), so the matrix rotates correctly and no default fires. The chain is intact.

## Places a default or a stale field can win — flagged

1. **`song.key ?? 'C'`** — `matrixMigration.ts:111`. The documented C default. Fires only when a song has no
   key at first matrix seed. **Residue:** once it fires, a `songkey-<id>-C` row exists permanently; setting the
   real key later demotes it correctly but leaves the C row as a non-original key column in the matrix forever.
2. **Clearing the key does not demote.** `keyChanged = newKey !== undefined && newKey !== song.key`
   (`SongDetailView.tsx:356`). Clear the field → `Song.key` becomes `undefined`, `songKeys` keeps the old
   `isOriginalKey: true` row. A and B then disagree with nothing to reconcile them. **Real bug, small fix.**
3. **`Song.key` is unvalidated free text** — `keyDraft.trim() || undefined`, placeholder `"e.g. G or Db"`. It
   feeds `keysOrderedFromOriginal`, which does an **exact string match** against 12 canonical names. `'Gb'` is
   *not* canonical (the cycle uses `'F#'`), nor are `'ab'`, `'Ab '`, `'Ab major'`, `'Fm'`. All fall into the
   defensive branch (`matrix/keys.ts:51-53`) that prepends the unknown key and renders **13 columns**.
   Meanwhile `parseSongKeyForPrep` applies its own, different normalizer for the practice path — so the same
   typo can be understood by practice prep and misunderstood by the matrix. **Highest-value fix here: normalize
   `Song.key` to a canonical name at write time in `saveMeta`, or offer a picker instead of free text.**
4. **Nothing enforces "exactly one `isOriginalKey`" except `reassignOriginalKey`.** Sync is last-write-wins
   per row, so two devices editing the key concurrently can leave two rows flagged. Consumers silently take the
   first (`.find(...)`). The dev inspector warns about this case explicitly (`devInspectSongKeys.ts:49`).
5. **No `songKeys` row on song create.** `AddSongModal` writes `Song.key` only. The row appears on the next
   Repertoire mount via `migrateSongsToMatrixIfNeeded` (gap-based, not one-shot — `matrixMigration.ts:71`), so
   it self-heals with the correct key. Not a bug today, but the two-step means a song can briefly exist with A
   set and B absent.

**Verdict: the Ab flow is working.** Items 2 and 3 are the real fragilities, and both live at the same spot —
the free-text key field in `saveMeta`. Neither is in scope for the lyric work; recommend a small separate fix.

---

# REVISED STEP SEQUENCE (for approval)

Every step: individually committable, gated on `npm run build` + `npx vitest run`, **commit and push after
each**, one in-browser verification at a time.

## Track 2 — chord color (independent, small, recommended first)

Zero coupling to the lyric refactor, and both need your eyes in-browser, which is the slow part.

| # | Step | Verify in browser |
|---|---|---|
| **T2.1** | **B3** slash-chord numerator color. Pass root palette from `ChordCellBox` → `ChordGlyph`; keep grey fallback where no palette is passed. | `1maj/5` — both parts readable |
| **T2.2** | **B2a** `DEGREE_PALETTES` → hex + inline styles, **no visual change** (pure refactor, proves the swap is safe) | charts look identical |
| **T2.3** | **B2b** accidental-aware mapping + `DARK_STEP` derivation; `#`→flat-twin remap; cross-ref comments in both color systems | `6min7` vs `b6min7` side by side; tune `DARK_STEP`, add desaturation only if needed |

## Track 1 — lyric layer (sequential; re-sequenced for the one-store revision)

| # | Step | Ships |
|---|---|---|
| **0** | **Verify Bug 2** — instrument `onDragStart`, confirm the geometry diagnosis | nothing (no commit) |
| **1** | Schema + `lyricSyllables.ts` + **`lyricSheetParse.ts`** + unit tests. Song-owned `LyricLine` with `kind`, anchors carrying `sectionId`, header parser. No UI wired. | nothing user-visible |
| **2** | **Store move + migration + read path.** Fold every section's `lyricLines` into `Song.lyricLines` in section order; existing positions import as **PLACED**; grid renders from anchors; ghost vs placed styling (A2). **Acceptance: pixel-identical first render.** | ghost/placed distinction |
| **3** | **Bug 2 + Bug 1** — `pointerWithin`→`closestCenter` fallback, `MeasuringStrategy.Always`, `DragOverlay`, high-contrast target + insertion caret | drag lands where you point, visibly |
| **4** | Place-on-drag writes an anchor; no-ripple; stable `order` (C, E) | moving a syllable moves only it |
| **5** | **A1** marker semantics + split/join anchor inheritance + un-place `×` | markers place one unit; split stops shifting the line |
| **6a** | **A3** tap-to-place, **intra-section** (chip → cell, and line → start/end) | tap placement works |
| **6b** | **A3** cross-section placement — lift armed state + anchor index above sections (§2.0) | syllables span sections |
| **7** | **B1 lyric drawer — needs its own sign-off on §B1 first.** 7a: drawer shell + staging paste with live parse preview + header dividers + header toggle. 7b: delete the per-section paste box and the pending tray. 7c: placed/partial/unplaced row status. | one drawer, one store |
| **8** | Paste + bar-op safety: regression tests that commit-paste, reorder, add/delete-bar never move a placed syllable; bar-delete guard for placed syllables | |
| **9** | **A4** tap-to-number in-cell reorder | |

### Note on the step 2 → step 7 gap

The store moves to song level at **step 2**, but the drawer that owns its UI doesn't land until **step 7**.
In between, the existing per-section `LyricStagingArea` keeps working — repointed to write song-level lines
rather than section-level ones. So there is no window where pasting lyrics is impossible; the old UI drives
the new store until the drawer replaces it. `LyricStagingArea` is deleted in **7b**, not earlier.

## Sign-off status

| Item | Status |
|---|---|
| §2.0 Option 1 | ✅ confirmed (rev 3) |
| §2.0b one lyric store | ✅ confirmed (rev 3) |
| §B2 scope — chord cells only | ✅ confirmed (rev 3) |
| §B2 hex + inline style | ✅ approved as its own T2.2 commit (rev 3) |
| Track order — Track 2 then Track 1 | ✅ approved (rev 3) |
| **§B1 drawer interaction spec** | ⏳ **still needed, before step 7** |
| **Track 1 revised sequence above** | ⏳ **presented for sign-off before step 0** |
