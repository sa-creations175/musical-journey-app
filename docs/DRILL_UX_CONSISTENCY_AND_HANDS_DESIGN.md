# Drill UX Consistency + Left/Right/Both Hands + Arpeggiated Skills — Design Document

**Created:** June 14, 2026  
**Updated:** June 15, 2026  
**Status:** Parts 1–3 shipped (commit 819413a, 7113ae3). Part 4 (arpeggiated) ready to build.  
**Scope:** Scales and Chord Shapes drill flows only. Voice leading and other S&P areas unchanged.

---

## Part 1: Unified Drill UX — SHIPPED

### Per-item rating modal (scales, chord shapes, and voice leading)

- Header: `DRILLED FOR` + elapsed time
- Section label: `HOW DID IT FEEL?`
- Format: full-width tall cards
- Labels: Struggled / Working on it / Clean / In flow
- More time: contextual — `MORE TIME ON THIS SCALE?` / `MORE TIME ON THIS SHAPE?` / `MORE TIME ON THIS PATTERN?`
- More time buttons: +30s · +1 min · +2 min · +5 min
- Notes field: `NOTES (OPTIONAL)` — present on all three modules
- CTA: `Save rating` — disabled until a rating is selected
- Supporting buttons: Previous · Next · Redo

### Block wrap-up rating — SHIPPED

4 cards, collapse to 3-value PerformanceRating: Struggled / Working on it / Clean / In flow. Flying/Cruising/Crawling removed everywhere.

---

## Part 2: Left / Right / Both Hands — SHIPPED (commit 7113ae3)

### Real schema (not design-doc tables)

Implemented against `spacingState` and `drillSessions` (Dexie v31). A `hand: 'left' | 'right' | 'both'` field was added to both tables. New index `[moduleRef+itemRef+hand]` on spacingState. Voice leading rows untouched.

### Scales skill set — 3 skills per (scale × key)

- Left hand
- Right hand
- Both hands

Drill order: LH → RH → Both

Time: ~1 min per hand. Total per item: ~3 min.

### Chord shapes skill set — 3 skills per (shape × key) [CURRENT, superseded by Part 4]

- Left hand
- Right hand  
- Both hands

Drill order: LH → RH → Both

### Session generator

All hands always grouped together — never schedule a partial hand set. Time budget = 3× per-hand duration for scales items.

### Matrix display

Three vertical bands per cell: Left band = LH, middle = RH, right = Both. Empty cells (no hands drilled) remain plain white. Bands appear once any hand has been drilled.

---

## Part 3: Additional UX fixes — SHIPPED (commit 819413a)

- Circle of fourths key ordering standardized across all matrices
- Voice leading navigation bug fixed — routes to first item's drill modal after countdown
- Post-block matrix snapshot — shows drilled skill rows × 12 keys after block wrap-up rating
- All rating modals unified

---

## Part 4: Arpeggiated Skills for Chord Shapes — READY TO BUILD

### Rationale

Each chord shape has melodic value — being able to break it into its individual notes is essential for improvisation and fills. Arpeggiated is a distinct drill mode from playing the chord solid.

Scales are excluded — a scale is inherently a single-note melodic line, so arpeggiated as a distinct mode doesn't add anything.

### Chord shapes skill set — 6 skills per (shape × key)

| Order | Skill |
|---|---|
| 1 | Left hand — solid |
| 2 | Left hand — arpeggiated |
| 3 | Right hand — solid |
| 4 | Right hand — arpeggiated |
| 5 | Both hands — solid |
| 6 | Both hands — arpeggiated |

**Drill order:** Hand-first. LH solid → LH arpeggio → RH solid → RH arpeggio → Both solid → Both arpeggio.

Rationale: staying in one hand position before switching feels more natural at the keyboard.

**Always grouped:** All 6 skills always appear together in a session. Never schedule a partial set.

**Time:** ~1 min per skill. Total per chord shape item: ~6 min.

### Schema changes

Add `style: 'solid' | 'arpeggiated'` field to `spacingState` and `drillSessions` for chord shapes rows. Scales rows default to `style: 'solid'` (or null — scales don't use this dimension).

The unique key for a chord shape spacing row becomes: `(moduleRef, itemRef, hand, style)`.

**Migration:** Clean start — wipe existing chord shape rows in spacingState and drillSessions. Scales rows untouched. Voice leading rows untouched.

### Session generator changes

- Chord shape items now cost 6× per-hand time in the block budget
- All 6 skills always grouped per item
- Drill flow walks all 6 in order before UP NEXT

### Drill modal changes

Modal subtitle shows active hand + style:

```
Bb (major) — Root position
Left hand · solid · ~60s in this session
```

```
Bb (major) — Root position
Left hand · arpeggiated · ~60s in this session
```

Between solid and arpeggiated within the same hand: lightweight in-modal transition (same as between hands currently).

### Matrix display

Three-band cells already shipped. Each band is split horizontally — top half = solid, bottom half = arpeggiated. No aggregation needed; each of the 6 skills has its own color slot. This gives the most information at a glance and makes it immediately visible when solid is ahead of arpeggiated (which is the typical progression).

Layout per cell:
- 3 vertical bands (LH / RH / Both)
- Each band split into top (solid) and bottom (arpeggiated)
- 6 color slots total per cell

### Prep screen

Item list shows combined time for all 6 skills:

```
Bb (major) — Root position      6:00
Bb (major) — 1st inversion      6:00
```

---

## Part 5: Changes summary for next CC prompt

### Schema
1. Add `style: 'solid' | 'arpeggiated'` to `spacingState` and `drillSessions`
2. Update unique index on spacingState to include style for chord shape rows
3. Wipe existing chord shape rows in spacingState and drillSessions — clean start
4. Scales rows: default style to 'solid' (or leave null — scales don't use this dimension)
5. Voice leading rows: untouched

### Session generator
1. Chord shape items cost 6× per-hand time in block budget
2. All 6 skills (3 hands × 2 styles) always grouped per item
3. Drill flow walks LH solid → LH arpeggio → RH solid → RH arpeggio → Both solid → Both arpeggio

### Drill modal
1. Subtitle shows active hand + style: "Left hand · solid · ~60s" etc.
2. Lightweight in-modal transition between solid and arpeggiated within same hand
3. Full UP NEXT interstitial only after Both hands arpeggiated rating

### Matrix
1. Three-band cells already in place
2. Each band color = aggregate of solid + arpeggiated for that hand (worse of the two, or a combined metric — resolve at build time)

### Not changing
- Scales skill set (LH / RH / Both only — no arpeggiated)
- Voice leading
- Prep screen layout
- Countdown animation
- Rating modal design
