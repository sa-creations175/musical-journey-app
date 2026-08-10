# Lead Sheet — Lyric/Syllable Layer: Audit + Redesign Plan

Status: **Track 2 CLOSED. Track 1 steps 0-5, 6a, 6b and 7 shipped; 8 and 10 outstanding. Step 9 DROPPED.
The drag-ring displacement bug is PARKED — see the section at the end.**
Scope: the per-bar beat grid's lyric row, the lyric drawer, chord-cell coloring, plus a read-only song-key recon.

Revision history:
- **rev 1** — original audit + plan.
- **rev 2 (2026-08-03)** — **Place = pin** (A2) replaces the separate pinned flag; **marker = places one
  unit** (A1) replaces rigid whole-line translate; **tap-to-place** (A3) replaces send-to-beat; cross-section
  placement allowed (§2.0).
- **rev 6 (2026-08-10)** — **STEP 7 BUILT, smaller than specified.** The drawer builds **no arming UI**: a
  line tap hands off to the anchored prompt, because a placement strip at the bottom of the screen is the
  mistake the cell-anchoring principle exists to prevent. The **per-section trays stay** (collapsed) until
  the drawer is proven. See §B1.
- **rev 5 (2026-08-09)** — **SYLLABLES NEVER CROSS; THEY ONLY STACK IN ORDER.** One ordering concept
  replaces the same-line-allowed / cross-line-refused split rev 4 shipped. Any cell may hold any number of
  syllables from any number of lines, always rendering in song order; placement into an occupied cell
  auto-orders and is never refused; a placement is refused only when it would cross a syllable in a
  **different** cell. **Supersedes rev 4's strict cross-line comparison** and §C/E's "render sorts by
  `order`". `anchor.order` is deleted. **Step 9 (A4 tap-to-number) is dropped.** See §2.0.
- **rev 4 (2026-08-09)** — **LINE ORDER IS POSITIONAL.** Lyric lines run strictly sequential: line N's
  syllables must land after line N-1's and before line N+1's. This **supersedes rev 3's "line identity
  becomes pure text grouping with no positional meaning"** (§2.0) and rev 1's "cross-line stacking is
  explicitly wanted" (§6). See §2.0 for the full rule and the reason.
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

### Step 0 verification — RESULTS (2026-08-03). Diagnosis confirmed, magnitude corrected.

**Confirmed from `node_modules/@dnd-kit/core` source, not inference:**
- `closestCenter` (core.esm.js:325-353) destructures `{ collisionRect, droppableRects, droppableContainers }`
  and computes `centerOfRectangle(collisionRect)`. **It never receives pointer coordinates.**
- `pointerWithin` takes `pointerCoordinates` and `return []` when they're absent — so the
  `pointerWithin → closestCenter` fallback chain is **mandatory**, not stylistic: a KeyboardSensor drag has
  no pointer and would otherwise resolve nothing.

**Confirmed in the browser (instrumented `onDragStart` / `onDragMove`, since reverted):**
- `onDragStart` **fires** on a dead-centre press. The competing "an overlay eats pointer events and the drag
  never begins" hypothesis is **dead**.
- Word-chip drags show a consistent **one-cell lag**: the cursor enters cell N while dnd-kit still reports
  N-1, then it catches up as the drag continues into N. Present on essentially every boundary crossing, in
  the direction of travel.
- The `pending:` line strip — a full-container-width draggable — diverges **enormously**: dnd-kit reported
  `beat:3:1` / `beat:5:2` while the cursor was over `beat:12:2` / `beat:10:3`. Bars apart, every sample a
  mismatch. This is the mechanism at full scale.

**CORRECTION to the original §3 write-up.** I claimed the user must aim "well below" the syllable because a
chip's centre sits `cellHeight/2 − 10px` above its cell's centre. **Measured, that offset is only 2-5px** —
`pointerMinusChipCenter` came back `{3,3}`, `{2,4}`, `{-1,2}`, `{5,-3}`, `{1,2}` across five drags. The
grab-offset argument was overstated. What actually bites for word chips is boundary hysteresis: the target
switches only once the chip's *rect centre* passes the midpoint between two cell centres, so you must push
past the visual boundary before the target updates — and because Bug 1 gives no reliable feedback about where
the target currently is, that reads as "it won't latch."

The fix is unchanged and now rests on measurement rather than on my geometric argument. The pending-strip
result also means step 3's `DragOverlay` matters more than "polish": the strip's own rect is what makes its
collisions meaningless.

**Instrumentation caveat, recorded so it isn't repeated.** The first probe attempt was invalid: it used
`document.elementFromPoint`, which returns the *dragged chip* (it translates along under the cursor), so
`closest()` climbed to the chip's origin cell and reported a frozen mismatch regardless of pointer position.
The corrected probe walks `document.elementsFromPoint` and skips anything inside the dragged node. Marker and
pending-strip drags in the final run still show that artifact — only `WordChip` was tagged — so their
`underCursor` readings are unreliable; their dnd-kit-side readings are not.

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

> **SUPERSEDED IN PART (rev 4).** Cross-**section** stacking is still wanted and unaffected. Cross-**line**
> stacking in a single cell is now **illegal** — the strictly-sequential line rule (§2.0) refuses a
> placement that lands exactly on a neighbouring line's syllable, so a cell may stack syllables from one
> line only. Mechanism 2 below therefore becomes unreachable for *new* placements; it survives only in data
> written before rev 4.

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
it.

### LINE ORDER IS POSITIONAL (rev 4 — SUPERSEDES the clause below)

> ~~**Line identity becomes pure text grouping with no positional meaning.**~~ — rev 3, **superseded**.

**The rule, as built in step 6b.** Lyric lines run **strictly sequential**. A syllable may not land at or
after the next line's earliest placed syllable, and may not land at or before the previous line's latest
placed syllable. Line order is the order of `Song.lyricLines`, which the fold migration built in **section
order**. So line membership now carries real positional meaning, and §2.0's Option 1 keeps everything else
it decided — anchors carrying `sectionId`, the lifted read model, sections rendering whatever points at
them — but not that one clause.

**Why it changed.** Browser-verifying 6a surfaced the concrete failure: a syllable from one lyric line could
slide freely in front of a syllable from an earlier line, because nothing constrained across lines. That is
wrong for this repertoire — lyrics run strictly sequential, and unconstrained placement quietly produced
charts that read out of order. Overlap cases (call-and-response, a held word running under the next phrase)
are handled by **editing the lines themselves**, not by unconstrained placement.

**Properties, all deliberate:**

- **Both directions, always.** Forwards and backwards constraints apply to every placement.
- **No ordering-of-operations rule.** A later line placed before an earlier one is constrained identically;
  the guard reads positions, never history.
- **Lines with nothing placed are transparent**, header rows included — the nearest line in each direction
  that *has* something placed is the binding one. No special case for empty lines.
- **Within a section and across sections.** `beatAxis` is already one ascending line across every section in
  song order, and `checkPlacementOrder` already resolves anchors to global positions, so the cross-line rule
  extends that guard rather than adding a parallel one.
- ~~**Stricter than the within-line rule, on purpose.** Landing *exactly on* a neighbouring line's syllable
  is refused… a cell may stack syllables from ONE line only.~~ — **SUPERSEDED by rev 5, below.** It was
  refused for one browser-verification round and then reversed: musically the last word of one phrase and
  the first word of the next routinely land on the same beat.
- **`checkPlacementOrder` stays the single authority.** No legality logic is duplicated, and hinted cells are
  never pre-filtered — every cell offers itself and refusal happens on tap. Because `placeSyllable`
  re-checks the guard when handed an axis, **drag inherits the cross-line rule with no separate code path.**
- **Escape hatch is un-placing or moving the blocking syllable.** There is no override or force-place
  affordance. Note that songs placed before rev 4 may already contain cross-line inversions — the guard
  prevents new ones, it does not retroactively repair data.

### SYLLABLES NEVER CROSS; THEY ONLY STACK IN ORDER (rev 5 — the unified rule)

Rev 4 shipped two ordering rules that differed only in strictness: same-line syllables could share a cell,
cross-line ones could not. Browser verification killed both halves of that split in one session. **One rule
replaces it:**

> **Syllables never cross each other. They only ever stack in order.**

- **Any cell may hold any number of syllables**, from any number of lines. Line boundaries do not matter for
  stacking: a line's last syllable and the next line's first may share a cell.
- **A cell's stack always renders in song order** — `(lineIndex, textIndex)`, the same text order the guard
  reasons about. Placed and ghost syllables interleave freely; neither kind sorts above the other.
- **Placement into an occupied cell AUTO-ORDERS.** The syllable takes its correct position in the stack. It
  is never refused on within-cell grounds, and the user does not choose where in the stack it lands — the
  line does.
- **A placement is refused ONLY when it would cross a syllable in a DIFFERENT cell.**

**Why the two rules collapse into one.** Equality on the global beat axis *is* "the same cell" — a global
beat uniquely identifies one cell. So "refuse only across cells" is implemented entirely by making both
cross-line comparisons strict, exactly matching the within-line ones. `checkPlacementOrder` stays the single
authority; no within-cell rule was added, because within-cell order is not a legality question at all.

**Two bugs this fixed, both of which were pinned as intended behaviour in tests:**

1. **`anchor.order` recorded WHEN, not WHERE.** It was an insertion counter (`max in cell + 1`), and the
   render comparator ranked it above song order. Placing "O" into the cell already holding "come," rendered
   it *below* the word it precedes. This is the bug that prompted rev 5.
2. **Placed sorted above ghosts.** `provisionalPlacements` skips only *negative* spans, so two pins in one
   cell emit their in-between ghosts into that same cell — and a line's **last** syllable then rendered
   above its own ghosts (`['A','Z','g1','g2']` instead of `['A','g1','g2','Z']`). Found while auditing rev
   5 and fixed by the same comparator deletion. Recorded here so it is clear this was fixed deliberately,
   not incidentally.

**`anchor.order` is deleted** (rev 5). A stored ordering that nothing reads is a trap: it looks
authoritative, and the next person to touch stacking wires it back in. With it go `setCellOrder` and
`normalizeCellOrders`, both of which existed only to maintain it. Ordering leaves the write path entirely
and lives in the read model, which is also why **drag needs no separate handling** — drag and tap both
write an anchor and nothing else, so neither can produce a stack the other wouldn't.

**Step 9 (A4 tap-to-number) is dropped**, not deferred. See §A4.

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

// NOTE (built in step 1): this is a SEPARATE type, not a widened
// LyricLine. The legacy type's words / start / end fields are REQUIRED
// and still read by the pre-migration render path (BarGridView,
// lyricLine.ts, barGrid.reorderBar), so making them optional in place
// would break every existing caller and their tests. The fold migration
// converts one to the other; nothing writes LyricLine any more.
export interface SongLyricLine {
  id: string;
  /** 'header' rows are drawer-only visual grouping — never placed,
   *  never armable, no syllables. (rev 3) */
  kind: 'lyric' | 'header';
  /** Header label, or the line's source text. Kept alongside
   *  `syllables` so a line can be re-split without losing its wording. */
  text: string;
  syllables?: LyricSyllable[];        // absent on headers
}

/** @deprecated unchanged, section-owned; migration source only. */
export interface LyricLine { /* words, startBar, …, wordOffsets */ }

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

- Tap a syllable chip → **armed**. Placed and unplaced behave **identically** — deliberately. A tap should
  mean one thing regardless of a chip's state; making the affordance conditional would force the user to know
  which state a chip is in before knowing what a tap does.
- Re-tap the armed syllable to disarm. Tap a different one to transfer. Tap outside to disarm. Only one
  syllable armed at a time.
- While armed, **EVERY beat cell shows the hint state.** Legality is deliberately NOT computed up front:
  `checkPlacementOrder` decides on tap and remains the only thing that knows the rule. Pre-filtering to legal
  cells would duplicate that rule in a second place — the exact failure mode this track has hit repeatedly.
- Tap any visible beat cell → placed there. **Cross-section targets are step 6b** (§2.0); 6a is intra-section.
- **Success is silent** — arming clears, nothing else. Matches drag, which also places silently. A
  toast-with-Undo on the shared placement path (so drag AND tap both get one) is queued behind the toast
  investigation; see Future work.
- **Refusal** keeps arming so the next cell can be tried immediately, shakes the cell, and shows
  *"Can't place here — syllables must stay in order."* — **except** for the `off-axis` violation, which means
  the target section isn't on the beat axis. That is a data problem, not a user ordering error, so the shake
  fires without the message.
- **The edit popover no longer opens on plain tap.** The armed syllable grows a **"…" control** that opens it,
  and a **long-press** on any syllable opens the same menu as a shortcut. One implementation, two entry
  points. The "…" appears only on the armed syllable, so an unarmed grid stays clean.
- Placing a **line** from the drawer (tap line → tap start → tap end) is **step 7** scope, not 6a.
- Drag remains, for intra-section local moves.

**Armed state location — LIFTED as of 6b.** The armed syllable lives in `SongDetailView`, above the
per-section `DndContext`s, reaching each section as `armedSyllableId` + `onArmSyllable` + `onSyllablePlaced`.
It got there from `LeadSheetSection`, where 6a parked it because every piece it needed was already local; the
cost was that each section ran its own reducer, so arming in one section was invisible to the next and the
second tap silently did nothing.

**Exactly three things moved**, and the split is worth keeping straight:

| Moved to `SongDetailView` | Why |
|---|---|
| `useReducer(armingReducer, null)` | The point of the lift. |
| The armed-syllable-vanished cleanup effect | Reads the store (already song-level) and dispatches; per-section copies fired N times over one state. |
| The `tap-outside` document listener | One armed state deserves one listener, not one per section. |

**Everything keyed to a CELL rather than to the armed syllable stayed put** — `tryPlaceSyllable`,
`refusePlacement`, and the `rejectedCell` shake. The reason is structural: a beat-cell tap always fires on
the section that *owns* the cell (`BeatDropSlot` → that section's `onBeatCellTap` → stamps `section.id`), so
refusal feedback is already delivered to the right grid by construction.
**Cross-section-ness lives entirely in which syllable is armed, never in which section receives the tap.**
`tryPlaceSyllable` also has three drag callers that all stamp `section.id`, and drag stays intra-section
until step 10, so lifting it would have stranded them.

Arming self-heals on song navigation: a different song replaces the store, the armed id is no longer found,
and the cleanup effect clears it. No separate reset is needed.

**Implementation notes worth keeping.** The arming state machine is a pure reducer
(`syllableArming.ts`) so it is unit-testable without a DOM — the repo has no component-testing stack, and
adding one inside a feature step was explicitly rejected as smuggling an infrastructure decision into
unrelated work. Two DOM-bound behaviours ("…" opens the menu, long-press opens the menu) are therefore
browser-verified rather than unit-tested.

`SyllableChip` carries dnd-kit's pointerdown, an onClick, and `useLongPress`'s handlers on one element. Two
collisions are real and are handled explicitly rather than by luck:
  · Spreading `{...listeners}` then `{...longPress}` would silently OVERWRITE dnd-kit's `onPointerDown` and
    kill drag activation — both attach to the same event. They are composed by hand, dnd-kit first.
  · dnd-kit activates at 5px while the hook cancels a long-press at 15px, so a 5-15px movement held past the
    threshold would fire BOTH. The long-press callback no-ops while dragging, rather than tightening the
    hook's tolerance to 4px — which would fight the 3-5px finger drift the hook's own comment measures.

## PRINCIPLE — feedback about a cell anchors to that cell
<a id="principle--feedback-about-a-cell-anchors-to-that-cell"></a>

**Recorded 2026-08-09, after making the same mistake twice.**

> **Feedback about a specific cell anchors to that cell. The bottom of the screen is reserved for things
> that are genuinely about the whole screen — the lyric drawer, for instance.**

The user is looking at the cell they just acted on. A message at the bottom of the viewport is nowhere near
their eyes, and the symptom is not "hard to see" — it is **"there is no feedback at all"**, which is a much
more expensive failure because it sends you looking for a bug that isn't there.

**The evidence, both instances:**

| # | What | Symptom | Fix |
|---|---|---|---|
| 1 | **Refusal message as a bottom toast.** A placement refusal rendered through the app's toast stack, fixed at the bottom of the viewport, while the refused cell shook up in the grid. | Read as *no feedback*. It cost a **wrong diagnosis that survived several sessions** — the plan doc carried a "toast health investigation" backlog item asserting the toast component was broken or hidden. It was neither. It was correctly rendering, in the wrong place. | Floats over the refused cell. |
| 2 | **Line-end prompt as a bottom bar.** Beat two of line placement asked "tap the beat where this line ends" from a slim fixed bar at the bottom — modelled on §B1's drawer pattern. | Same symptom: barely noticed, while the user watched the cell the line's head had just landed in. | Anchors to the head's cell. |

**Instance 2 is the instructive one**, because the bottom bar was not careless — it was a deliberate reuse of
a pattern this very document specifies (§B1's slim hint bar). **That reuse was wrong, and the reason is the
rule above:** §B1's bar is about the *drawer*, which lives at the bottom, so a bottom bar is where the
drawer's own state belongs. The line-end prompt is about *one cell*. Copying the form without checking what
it was anchored to reproduced the exact failure the refusal fix had just closed.

**Consequences for anything built later:**

- A per-cell message uses `leadSheetOverlay.ts` — `anchoredOverlayPosition` and its shared box constants —
  rather than a new positioning rule. Two copies of "above by default, flip below, clamp" drift.
- If such a message can **outlive a scroll**, it must stick to the nearest edge when its anchor leaves the
  viewport rather than disappearing with it. Anything carrying the only cancel control especially: a
  vanished prompt strands the gesture.
- **Never truncate a message; wrap it.** Half an instruction is not an instruction. Box width is a maximum,
  height is a two-line budget, and the max is small enough to fit the narrowest supported viewport with
  padding — asserted in `leadSheetOverlay.test.ts`, since wrapping only saves a box that had somewhere to
  wrap to.
- The bottom of the screen stays available for genuinely screen-level state — the step-7 lyric drawer being
  the case it is reserved for, and the one thing built there since.
- **Third instance, caught before it shipped (rev 6).** §B1 specified a slim bottom strip for tracking an
  in-progress line placement. It was cut at build time *because this principle was already written down* —
  which is the whole point of having written it. Reusing a pattern is not a reason; check what the pattern
  is anchored TO.

## A4 — In-cell reorder by tap-to-number — ❌ DROPPED (rev 5)

> ~~Tap a multi-syllable cell → its chips show order badges (1, 2, 3…) → tap syllables in the order you want
> → done. Writes `anchor.order`, compacted.~~

**Dropped from the sequence entirely, not deferred.** A4 let the user choose a cell's stack order. Rev 5's
rule says the *line* decides: a cell reads in song order, always. The two are direct contradictions, and
with `anchor.order` deleted there is no field for A4 to write and nothing left for the feature to do.

Recorded so it isn't resurrected: if in-cell order ever appears wrong, the fix is in the **text** — split,
join, or reorder the line — never a per-cell override. Re-adding a manual stack order would reintroduce
exactly the WHEN-not-WHERE drift rev 5 removed.

Drag-based intra-cell reordering remains permanently deferred, as it was.

## C / E — No-ripple + stable order (unchanged intent, new mechanism)

New pure module `lyricSyllables.ts`:

- `placeSyllable(syllables, syllableId, anchor)` — writes that one syllable's anchor, and nothing else.
  **No-ripple is now literally true** (rev 5): it used to also call `normalizeCellOrders`, which rewrote
  *other* syllables' `order` in the cell being vacated, so "no other syllable object is touched" was very
  nearly but not quite the case. With `anchor.order` deleted, exactly one syllable object changes.
- `unplaceSyllable`, `remapAnchorBars`. ~~`setOrderWithinCell` / `setCellOrder`, `normalizeCellOrders`~~ —
  **deleted in rev 5** along with the field they maintained.
- `splitSyllable(line, id, splitAt)` — **piece 1 inherits the anchor; pieces 2+ get no anchor** (A1). This
  removes the split-rebasing ripple entirely rather than compensating for it.
- `joinSyllables` — merged unit keeps the *first* piece's anchor.
- ~~Render sorts by `order`, tie-broken by `id`.~~ **Both halves superseded.** The `id` tie-break went first
  (a `randomUUID` stacked ghosts arbitrarily); `order` went in rev 5. **Render sorts by song order —
  `(lineIndex, textIndex)` — and by nothing else.** That is the whole of "stable order": it derives from
  the text, so it is identical on every device without anything being stored or synced to keep it so.

Paste already satisfies no-ripple (§5) and stays append-only; the plan adds a regression test asserting it.

## B1 — Lyric drawer — ✅ BUILT (step 7, rev 6 · 2026-08-10)

One store per song, one list. The drawer shows **the song's full lyrics as lines**, and that same list is the
paste target, the unplaced pool, and the reference sheet.

**Two things changed between sign-off and build, and both shrank the scope.**

### rev 6 change 1 — the drawer builds NO arming UI

> ~~**Arming collapses the drawer** to a slim hint bar (~40px, fixed bottom) reading *"tap the beat where
> this line starts — tap here to cancel"*, leaving the grid fully tappable.~~ — **CUT.**

Tapping a line arms it, the drawer collapses, and the **existing anchored prompt** takes over. Step 7 builds
no placement UI of its own.

**Why:** the [cell-anchoring principle](#principle--feedback-about-a-cell-anchors-to-that-cell). A strip at
the bottom tracking an in-progress placement is exactly the mistake corrected twice on 2026-08-09 — the
refusal toast, then the placement prompt. A third instance was specified right here and would have been
built if the principle hadn't been written down first. A test asserts the drawer renders no cancel control
and no "tap the beat" copy, so it cannot creep back.

### rev 6 change 2 — the per-section trays STAY

> ~~The bar grid stops hosting the paste box and the pending tray entirely.~~ — **superseded.**

Trays remain, collapsed by default. Drag has known problems (see PARKED) and the tray is the fallback path
onto the grid; removing it before the drawer is proven is the wrong order. **7b must not delete them on
schedule** — that is its own decision, after the drawer has been in real use.

### What was built

- **Slim strip docked at the bottom** of the song page — not rev 3's right-edge vertical tab. **This one
  belongs at the bottom**: it is whole-screen chrome about the SONG, like a nav bar, which is precisely the
  distinction the anchoring principle draws.
- **Tap → ~50vh list** of every line in song order, headers as divider rows, fully placed lines **dimmed
  rather than hidden** — the drawer doubles as the readable lyric sheet.
- **Tap a line → arms beat one**, drawer collapses, anchored prompt asks for the end.
  **No auto-scroll and no section awareness**: you scroll where you want and tap, and the monotonic guard
  refuses anything out of order.
- **Paste behind "+ add lyrics"** — editable staging text with the parser's guesses rendered **live**, so a
  misread header is visible before commit. `add lines` commits; nothing is written until then. Raw text is
  passed and **parsed once**; the old `string[][]` round-trip (text → words → text → parse) is gone.
- **Header↔lyric correction via a visible "…" control**, long-press as a shortcut — the same call as the
  syllable popover, for the same reason: an invisible affordance is not an affordance. Converting a line
  with placed words is **explained, not offered-and-refused**.

### Two numbers, two jobs

| Where | Shows |
|---|---|
| Collapsed strip | one overall **line** count — "4 of 9 lines placed" |
| Each row | its own **word** count — "2/7 placed" |

**Vocabulary: the drawer says WORDS, not syllables.** A word only becomes syllables once split, which
normally happens after placement — so "syllables" belongs to the grid, where splitting has actually
happened. No per-section counts: the drawer is deliberately song-level and per-section numbers would muddy
that.

### Chrome

The drawer marks itself `data-app-chrome="bottom"`, so the cell-anchored overlays inset past it — including
the full ~50vh when it is open, which is correct: the prompt belongs in the part of the grid still visible.
Because the safe area is **measured**, slim and open need no special-casing.

**The circularity, handled explicitly:** the drawer is bottom chrome AND needs to know how much bottom
chrome to dock above (`MobileBottomNav`, below `md`, whose height moves with `env(safe-area-inset-bottom)`).
`measureSafeArea({ exclude: '[data-lyric-drawer]' })` skips itself — without that it measures its own height
and pushes itself up by it, every frame.

`z-40`: above the grid, alongside the nav, **below the overlays at 180/190** so the prompt is never behind
the drawer.

### Still open

Whether the drawer stays open across navigation, and whether the line list should be selectable-for-copy.
~~Tap = arm vs long-press = header toggle~~ — resolved by the "…" control.

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
- Intra-cell drag reordering — permanently deferred, and as of rev 5 there is nothing to defer *to*: A4 was
  dropped and a cell's stack order is derived from song order, not set by the user.
- Normalizing `Song.key` to a canonical name at write time (see Part 3, items 2-3).
- **~~Toast health investigation~~ — RESOLVED 2026-08-09. The toast component was never broken.** It was
  badly placed for *grid-adjacent* feedback: a bottom-of-screen toast is nowhere near the cell the user is
  looking at, so refusals read as no feedback at all. Toasts fire correctly and are the right vehicle for
  page-level messages (e.g. "Line un-placed — back in the tray."). The refusal message now floats over the
  refused cell instead; see `SongDetailView`'s refusal-notice block. **Still open:** toast-with-Undo on the
  shared placement path, so drag AND tap gain an Undo drag currently lacks. Placement stays silent on
  success until then. The lesson worth keeping: *proximity, not reliability,* is what a feedback message
  anchored to a grid cell needs.
- **Component-testing stack** (`@testing-library/react` + a jsdom test environment). Deliberately not added
  inside step 6a. Until then, DOM-bound behaviour is browser-verified.
- **Multi-digit degree parsing in `parseChordFunction` — see §B4 below.**
- **Does the Progression Patterns block earn its space? — DESIGN CONVERSATION FIRST, not a build.**
  Recorded 2026-08-09, when the block was made collapsible and defaulted to **collapsed**. That default is
  itself the honest signal: a section defaulted to hidden is a section under suspicion. The question to
  settle before building anything else here is whether the sequence strip and the within-song pattern list
  are worth their vertical space at all, or whether the block should shrink, move, or go. Answer that
  before adding to it.
- **The sequence strip as an EDITABLE VIEW — design pass needed before any build.** Recorded 2026-08-09.
  Two manual edits wanted, both about reading the strip in musical chunks rather than as one continuous run:
  **insert phrase breaks** at chosen points, and **hide tokens** that carry no information (a repeated
  `1maj` at the head of a section, say). **Manual, not automatic** — the whole value is choosing where the
  breaks fall; an algorithm guessing phrase boundaries is a different and much worse feature.

  **The constraint that makes this tractable, and it is load-bearing: hiding affects the STRIP ONLY. The
  chord stays in the grid.** The grid remains the source of truth; the strip becomes a view over it that
  can be annotated. Nothing here may become a way to delete or move a chord — a hidden token is a display
  decision, never a data one.

  Open questions for the design pass: where the annotations live (a per-section field? per arrangement?
  song level?); whether they survive bar reorder, bar delete and chord edits, and how they re-anchor if so;
  whether a hidden token leaves any trace so the strip can't silently lie about what the grid contains;
  and how this interacts with the two items below — if the block's purpose shifts cross-song, per-song
  strip annotations may belong somewhere else entirely.
- **Cross-song pattern detection — the actual point of the block.** Also recorded 2026-08-09. Today
  `detectPatterns` runs per section and answers "what patterns are in THIS song". The intended purpose is
  the opposite direction: **build a vocabulary of the progressions I actually use, across the whole
  repertoire** — which patterns recur, in which songs, how often, and which ones are already in ET
  practice. That reframes the block from a per-song readout into a view onto a song-spanning index, and it
  is a design conversation before it is a build: it needs decisions about where the vocabulary lives (a
  derived index? a stored table?), what counts as "the same" progression across keys and qualities, and
  what the per-section block should show once the cross-song view exists — if anything. Note the two items
  interact: the answer to "does it earn its space" may be "not in this form, but yes in that one."

## B4 — Multi-digit degrees are parsed as single digits (found during T2.3)

`parseNumberNotation` (`chordFunction.ts:100`) matches `/^([b#]*[1-7])(.*)$/`, consuming exactly one
digit. So a chord entered as **`b13` is stored as `{ function: 'b1', quality: '3' }`**. The display
concatenates the two fields back into "b13", so it *looks* correct — which is why this survived until the
colour rule made it visible (b13 rendered dark red: the b1 → 7-family colour).

**Fixed in the colour path (T2.3b)** by re-joining the two fields when the quality is exactly the digits
completing a 9/11/13 degree. Narrow on purpose: `113` (degree 1 with a 13th) and `57` (degree 5 dominant 7)
stay split, so no existing chord changes colour as a side effect.

**Everything else still reads `function: 'b1'`.** Confirmed downstream consequences, none fixed here:

| Consumer | Effect on a `b13` chord |
|---|---|
| `chordRootNote` → `SEMI_BY_DEGREE` (`chordFunction.ts:26`) | **No `b1` key** → returns `''` → the voicing editor can't resolve a root, so no keyboard/voicing for this chord |
| Concrete-notation display (`chordFunction.ts:272`) | `SEMI_BY_DEGREE` miss → falls back to rendering numbers, so letter-name mode shows "b13" instead of the note |
| `toRomanToken` → numerals strip | Renders from degree `b1`, not `b6` — wrong numeral |
| `detectPatterns` (`LeadSheetSection.tsx:885`) | Sees degree `b1`; progression detection misreads the chord |
| `autoHarmonicTag` | Falls to the `startsWith('b')` → `borrowed` branch — plausible by coincidence, not by reasoning |

**Two cases the colour-path repair cannot reach**, because the information is destroyed at parse time:
- Bare `9` / `b9` / `#9` roots — the regex rejects them outright, so the chord is `unparsed` (neutral fill +
  warning icon), not mis-coloured.
- Slash basses like `1/b13` — `parseNumberFunction` (`:88`) returns `b1` and **discards the trailing `3`**;
  nothing in the stored record can recover it.

**Proposed fix (own step, own verification):** widen both parsers to `^([b#]*)(9|11|13)(?![0-9])(.*)$`
before falling through to the single-digit branch. The negative lookahead is what keeps it safe — `113`
fails to match as `11`+`3` and falls through unchanged, as does `57`. Then extend `SEMI_BY_DEGREE` with the
extension degrees so roots, numerals, and voicings resolve too. Not bundled into the colour track because it
touches chord entry, display, voicing, and pattern detection, and each wants its own browser check.

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
| **6a** | **A3** tap-to-place, **intra-section**. ✅ SHIPPED. Tap arms (placed and unplaced alike), every cell offers itself, `checkPlacementOrder` is the sole legality authority, "…" and long-press open the edit menu. Line → start/end is step 7, not this. | tap placement works |
| **6b** | **A3** cross-section placement. ✅ SHIPPED. Armed state lifted to `SongDetailView` above the per-section `DndContext`s; **cross-line monotonic guard** folded in, making lyric lines strictly sequential (§2.0 rev 4). The anchor index was already song-level from step 2, so only arming needed lifting. | syllables span sections |
| **7** | **B1 lyric drawer.** ✅ SHIPPED (rev 6). Shared line row; arming union generalised to carry an `edge`; drawer shell + tap-to-arm handing off to the anchored prompt; paste with live parse preview; header↔lyric correction via a "…" control. **The per-section trays were NOT deleted** — that is its own decision once the drawer is proven. | one drawer, one store |
| **8** | Paste + bar-op safety: regression tests that commit-paste, reorder, add/delete-bar never move a placed syllable; bar-delete guard for placed syllables | |
| ~~**9**~~ | ~~**A4** tap-to-number in-cell reorder~~ — **DROPPED (rev 5).** Stack order is decided by song order, so there is nothing for the user to set. See §A4. | — |
| **10** | **Cross-section drag — free-reign drag anywhere.** Unify dragging across sections, either by hoisting to a single song-level drag context or by a handoff bridge between per-section contexts. **Sequenced after 6b and 7 by decision**, not by dependency: tap-to-place covers cross-section placement first, so drag unification builds on a stable placement model rather than inventing one. | drag a syllable into any section |

### Cross-section drag (step 10) — interim behaviour

Until step 10 ships, **dragging over another section's grid yields no target** — no ring, and releasing does nothing. That is deliberate: each `LeadSheetSection` owns its own `DndContext`, so a drag started in one cannot be received by another, and the honest response to "the cursor is over a cell this context doesn't own" is to decline.

Getting there took two attempts worth recording, because both failure modes are easy to reintroduce:

1. `closestCenter` as the fallback would **snap back** to the nearest cell in the *origin* section — a confident misplacement, since it always returns a winner however far away the pointer is.
2. Resolving the hit-tested cell by its **droppable id string** silently **aliased** it: beat ids are `beat:<bar>:<beat>` and every section numbers its bars from zero, so `beat:13:0` exists in all of them. A cursor over another section's cell lit the same-named cell in the origin section, a viewport away, with the gap growing as scroll moved the cursor across more sections.

The fix for (2) — matching droppables by **node identity**, never by id — is what makes "another section = no target" actually true. Step 10 should keep that property: whatever unifies the contexts must resolve a cell to *the* droppable whose node was hit, not to one that merely shares its name. If a single song-level context is chosen, beat ids stop being unique across the page and the identity match becomes load-bearing rather than defensive.

### Note on the step 2 → step 7 gap

The store moves to song level at **step 2**, but the drawer that owns its UI doesn't land until **step 7**.
In between, the existing per-section `LyricStagingArea` keeps working — repointed to write song-level lines
rather than section-level ones. So there is no window where pasting lyrics is impossible; the old UI drives
the new store until the drawer replaces it. `LyricStagingArea` is deleted in **7b**, not earlier.

### Per-section trays: collapsed, not deleted (2026-08-09)

The per-section unplaced-lyrics trays are now **collapsible, defaulting to collapsed** (global pref,
`leadSheetPrefs.ts`, separate key from the patterns block). They are **hidden rather than removed, and that
is a deliberate hold**:

- Step 7's song-level drawer is expected to replace them, and they will *probably* go entirely then.
- But **drag has known problems** — see the parked drag-ring section — and the tray is the fallback path for
  getting a line onto the grid. Deleting the fallback before the replacement is proven in real use is the
  wrong order.
- So: collapsed by default, one tap away, decision deferred until the drawer has been in use a while.
  **7b should not delete the trays on schedule** — revisit it as its own call, with the drawer already
  working, rather than treating removal as a foregone conclusion.

The collapsed header keeps an unplaced-line count, so the tray stays honest about pending work without
being opened.

## Sign-off status

| Item | Status |
|---|---|
| §2.0 Option 1 | ✅ confirmed (rev 3) |
| §2.0b one lyric store | ✅ confirmed (rev 3) |
| §B2 scope — chord cells only | ✅ confirmed (rev 3) |
| §B2 hex + inline style | ✅ approved as its own T2.2 commit (rev 3) |
| Track order — Track 2 then Track 1 | ✅ approved (rev 3) |
| Cross-section drag is in scope, sequenced after 6b + 7 (step 10) | ✅ decided 2026-08-08 |
| **§B1 drawer interaction spec** | ⏳ **still needed, before step 7** |
| **Track 1 revised sequence above** | ⏳ **presented for sign-off before step 0** |

---

# PARKED: drag-ring displacement

**Status: PARKED as of 2026-08-08. Do not reopen without an explicit request.**

Six commits shipped against this and it is not closed. Everything below is written so
the investigation can resume cold, without re-deriving what has already been excluded.
Tap-to-place (6a) is deliberately independent of it: it places syllables without any
drag targeting at all, so the track is not blocked by this.

## 1. Symptom

During a lyric drag, after cycles of scrolling the app's **inner** scroll container, the
drop-target ring strands **bars away** from the cursor.

Precise characteristics, all observed live:

- **`window.scrollY` stays 0 throughout.** The app scrolls an inner container, not the
  window — proved by a capture where `scrollY: 0` while the section's `getBoundingClientRect().top`
  moved through −399 → −401. Any diagnosis or fix keyed on `window.scrollY`, or on
  window scroll events, is reasoning about the wrong thing.
- **Direction-variable.** One frame stranded the ring several bars *above* the cursor;
  another, after further cycles, several bars *below*.
- **Accumulates** over repeated down/up scroll cycles rather than tracking net scroll
  offset. Amount grows with scroll *travel*.
- **Cursor and dragged pill are correct** and stay locked together — `snapCenterToCursor`
  works. Only the ring separates.
- Dragging **down** was repeatedly reported as accurate; dragging **up** reproduced the
  displacement. That asymmetry was never explained.

## 2. What shipped, and what each fix ruled out

| Commit | Change | Outcome |
|---|---|---|
| `fdeb43c` | **Pointer-nearest fallback.** `closestCenter` measures from the *dragged element's* rect; for the container-width tray strip that centre sits mid-grid, and it always returns a winner however far away. Replaced with nearest-to-pointer within 48px, else no target. | **Fixed tray drags.** Ruled out: stale measurement (measured rect was provably identical to the live DOM rect), `DragOverlay` involvement, and `MeasuringStrategy.Always` failing to apply. |
| `368231c` | **`snapCenterToCursor` on the DragOverlay** (inlined, not the package). dnd-kit positions the overlay at the *activator element's* rect + delta, not under the pointer, so the pill floated by however far off-centre the grab was. Also made the insertion caret absolutely positioned — as a flow child it grew the hovered cell, and since cells stretch to the tallest in a row, highlighting resized the row it was measuring. | **Fixed pill alignment permanently.** Cursor + pill have been correct ever since. Corrected an earlier wrong claim that `fdeb43c` covered syllable drags: it couldn't have, because *offset rather than absent* means `pointerWithin` was hitting. |
| `a79a58b` | **Live DOM hit-test.** Replaced rect bookkeeping with `elementsFromPoint` at a pointer read straight off native `pointermove`. Removed `pointerWithin` entirely rather than keeping it as a fast path. | **Did not fix it.** Later proved (`7c25f15`) to have never once succeeded. Ruled out on the way: dnd-kit's `Rect` self-corrects for scroll via getters on all four edges, and `pointerCoordinates = activationCoordinates + translate`. |
| `88b807d` | **Node-identity matching.** Beat ids are `beat:<bar>:<beat>` and every section numbers bars from zero, so `beat:13:0` exists in every section; matching by id string aliased a cell in one section onto the same-named cell in another. | **Fixed a real aliasing bug** that produced viewport-scale displacement — but the symptom persisted afterwards in a **single-section** song, so aliasing was not the whole cause. Ruled out: the ring has no coordinate frame at all — `isOver` is `over?.id === id`, a pure identity check, and the highlight is a CSS class on the real cell element. |
| `58af298` | **Recompute on scroll.** Collisions are computed inline in `DndContext`'s render body, so they refresh on any re-render — but with the pointer stationary during scroll nothing re-renders and the target freezes. Added a capture-phase scroll listener bumping a tick. | **Did not fix it.** Correctly identified that a frozen `over` also explains the ring failing to clear off-grid — one cause, both symptoms. |
| `7c25f15` | **Single collision path + rect-watch recompute.** Deleted the dead hit-test (instrumentation showed `hitCell` was *never* non-null across ~1600 collision calls — the cursor sits reliably *near* a cell, not inside one). Replaced the scroll listener with a rAF loop watching the section's own bounding rect, since listeners have to guess which element scrolls. | **Did not fix it.** Explicitly did not claim to — the failing case had never been captured. |
| `0259d44` | **Band extension.** Each lyric cell's target band extends 76px upward over its own chord row, so bands tile vertically and the inter-row dead zone disappears. Motivated by a capture showing a cursor mid-travel with its four nearest cells all 41–43px away, near-tied across two rows. | **Did not fix it.** Closed a real geometry hole (near-tie flipping during vertical travel) but not the stranding. |

## 3. The key observation

**In every capture, the system agreed with itself end to end.** The collision result,
dnd-kit's `over`, and the DOM element carrying the ring class were all the same cell;
`withNodes` equalled `candidates` (60/60, no unmount skips); nearest-wins selected
correctly; and the ranked distances were sane. Nothing ever disagreed with anything.

That is the central puzzle: a self-consistent pipeline whose rendered output is
nonetheless wrong in live use.

## 4. Why the captures were inconclusive

**The logging was throttled to fire only when the result changed, or just after a rect
move.** A *frozen* target changes nothing and moves nothing — so the broken interval
produced **no log lines at all**, and every sample necessarily landed on a healthy
moment. Movement was implied by the logging condition rather than observed.

Three separate captures were requested and all three returned essentially the same
zero-scroll, working sample. The conclusion drawn from them — "the system agrees with
itself" — is true but was never tested against the failing interval.

Second-order lesson: several fixes were shipped on hypotheses formed between captures.
At least two commit messages assert behaviour that the code did not actually have
(`a79a58b` calling the hit-test authoritative when it never fired; `a79a58b` claiming
cross-section cells resolved to no target when id aliasing silently mapped them).

## 5. Next diagnostic when resumed

Two changes to method, both mattering more than the probe itself:

**(a) Continuous, unthrottled logging, read by Claude Code directly** — not captured and
pasted by hand. Every previous round lost fidelity at the paste boundary and cost a
full turn per sample. Drive the app with the `/run` skill or equivalent so the log is
read straight from the browser console, and so the failing interval is *in* the log
rather than around it.

**(b) A paint-time check of the actual `isOver` DOM node**, so the `over` → rendered-ring
mapping is measured rather than assumed.

### The probe that was armed (rebuildable from this description)

Uncommitted at park time in `LeadSheetSection.tsx` and `BarGridView.tsx`; reverted
without ever being run:

- `BarGridView.SyllableDropSlot` — re-add `data-beat-cell={DRAG_ID.beat(barIndex, beatPos)}`
  purely so the probe can query cells. (Product code must not match on this value; it is
  not unique across sections. See `88b807d`.)
- `LeadSheetSection` — two refs, `dbgColl` and `dbgOver`.
- In `collisionDetection`, after computing the result: `dbgColl.current = result[0]?.id ?? null`.
- On `DndContext`, an `onDragOver` handler whose only job is
  `dbgOver.current = e.over?.id ?? null`.
- Inside the existing rAF rect-watch loop, log **one line per frame, unconditionally**,
  for the whole drag:

  ```
  [f412 6.8s] MOVED top=-401 ptr=835,860 coll=beat:12:3 over=beat:12:3 ring=beat:12:3(top=808)
  ```

  where `ring` is found by scanning `document.querySelectorAll('[data-beat-cell]')` for
  the element whose `className` contains `ring-2`, reporting its beat id and rect top.
  Colour the line red when `coll`, `over` and `ring` are not all equal. `MOVED` marks
  frames where the rect-watch tick fired.

### Reading it

| Pattern | Meaning |
|---|---|
| `coll` and `over` correct, `ring` **different** | the `over` → element mapping is broken |
| all three **equal but wrong**, no `MOVED` for many frames | recompute frozen; the rect-watch is not detecting inner-container movement |
| all three equal and correct while the ring visibly isn't | the ring is painted somewhere not being queried |

A long run of identical lines *without* `MOVED` is the frozen interval, and is the single
most likely thing to find — it is the one state every previous probe was structurally
incapable of recording.

### Unexplained and worth attacking first

The **down-accurate / up-displaced asymmetry**. Nothing in the collision path is
direction-dependent: the geometry is symmetric, `withNodes` was full in both directions,
and nearest-wins has no bias. Whatever explains that asymmetry probably explains the
whole bug.
