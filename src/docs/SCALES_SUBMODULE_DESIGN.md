# Scales — S&P Submodule Design
**Status:** Design complete. Ready to build.
**Date:** May 13, 2026

---

## Overview

Scales is a proper submodule of Shapes & Patterns (S&P), sitting alongside Chord Shapes and Voice Leading. It has its own skill definitions, spacing state, goal flow, and session block type.

S&P module sections:
1. **Scales** (this doc) — warm-up, keyboard-only
2. **Chord Shapes** — triads, 7ths, extensions (existing)
3. **Voice Leading** — ABA/BAB, diatonic cycle, dark tension resolutions (Phase 2)

---

## Skill Definitions

### Scale Types + Cell Count

**Major scale** (maintenance — already known well)
- 1 cell per key = 12 cells
- itemRef format: `scale:major:{keyName}` e.g. `scale:major:C`
- Attempt = one full run up and down (~30s estimate, will calibrate with data)

**Major pentatonic** (3 starting points — each a distinct skill)
- 3 cells per key × 12 keys = 36 cells
- Starting points: 1 (root), 5 (dominant), 6 (relative minor position)
- itemRef format: `scale:major-pentatonic:{startingPoint}:{keyName}`
  - e.g. `scale:major-pentatonic:1:C`, `scale:major-pentatonic:5:C`, `scale:major-pentatonic:6:C`
- Attempt = one full run through that starting point up and down (~30s per starting point)

**Natural minor** (needs work — active coverage)
- 1 cell per key = 12 cells
- itemRef format: `scale:natural-minor:{keyName}` e.g. `scale:natural-minor:C`
- Attempt = one full run up and down (~90s estimate)

**Minor pentatonic** (3 starting points — each a distinct skill)
- 3 cells per key × 12 keys = 36 cells
- Starting points: 1 (root), b3 (blue note entry), b7 (descending gospel riff)
- itemRef format: `scale:minor-pentatonic:{startingPoint}:{keyName}`
  - e.g. `scale:minor-pentatonic:1:C`, `scale:minor-pentatonic:b3:C`, `scale:minor-pentatonic:b7:C`
- Attempt = one full run through that starting point up and down (~30s per starting point)

**Total cells: 96**
- Major: 12
- Major pentatonic: 36 (3 × 12)
- Natural minor: 12
- Minor pentatonic: 36 (3 × 12)

### Relative Major — Not a Separate Cell
"The relative major of C minor is Eb major" maps to the existing `scale:major:Eb` cell. Practicing the relative major of a minor key logs a rep against the corresponding major scale cell. No duplicate cells needed.

---

## Rating System

Same as S&P chord shapes: **Flying / Cruising / Crawling** per attempt.

AcquisitionStage progression: new → acquiring → acquired → comfortable → internalized (same as all other spacing state rows).

---

## Goal Flow

Follows the ET pattern — separate goals per scale sub-area, each tracked independently. Users can set multiple active scale goals simultaneously.

### Goal sub-areas

- **Major scales** — consistency/maintenance goal (already known; low priority in spacing)
- **Major pentatonic** — coverage goal; can scope to specific starting points (all 3, or just starting point 1, just b3, etc.)
- **Natural minor** — coverage goal (12 cells)
- **Minor pentatonic** — coverage goal; can scope to specific starting points

### Granularity within each sub-area

Same as ET chord recognition — when creating a Major Pentatonic coverage goal, user can select:
- All 3 starting points across all 12 keys (full coverage)
- Just starting point 1 across all 12 keys
- Just starting point b3 across all 12 keys
- Just starting point b7 across all 12 keys

This allows staged progression — master root position first, then add b3, then b7.

---

## Session Algorithm

### Context
**Keys and Mixed only** — scales are keyboard skills. Never surfaces in Laptop or Phone sessions.

### Block ordering within a Keys session
1. **Scales** — first block (warm-up)
2. **Chord Shapes** — primary S&P work
3. **Voice Leading** — (Phase 2)
4. **Song Repertoire** — keyboard practice

### Key ordering
Same as chord shapes: circle-of-4ths from least-recently-practiced key with due cells.

**Key priority for scales:**
- First priority: keys of active songs (bridges into Repertoire practice in the same key)
- Second priority: circle-of-4ths from least-recently-practiced key

### Session block structure
Scales get their own dedicated block, independent of chord shapes. Multiple S&P sub-area blocks can appear in the same session (same as multiple ET blocks or multiple Song Repertoire blocks).

### Time allocation
Use the same memory type / time constants as chord shapes (procedural). Time estimates per attempt:
- Major scale: ~30s (maintenance weight — already comfortable)
- Major pentatonic per starting point: ~30s
- Natural minor: ~90s (drill weight — needs work)
- Minor pentatonic per starting point: ~30s

**Weighting:** 
- Major scales get low weight (maintenance) — surfaces infrequently once acquired
- Natural minor + pentatonic get high weight — active coverage, surfaces frequently

### Future: Song-key matching
Once all 96 cells reach comfortable, scales should automatically warm up the key(s) of the songs being practiced in that session. The warm-up becomes contextualized rather than driven by spacing state alone. Build when all cells are comfortable.

---

## Spacing System Integration

itemRef format:
- `scale:major:{keyName}` — e.g. `scale:major:C`
- `scale:major-pentatonic:{startingPoint}:{keyName}` — e.g. `scale:major-pentatonic:b3:C`
- `scale:natural-minor:{keyName}` — e.g. `scale:natural-minor:F`
- `scale:minor-pentatonic:{startingPoint}:{keyName}` — e.g. `scale:minor-pentatonic:b7:Bb`

moduleRef: `shapes-and-patterns` (same module as chord shapes)

Each cell tracked independently. Spacing algorithm surfaces cells that are due (stale or new), weighted by:
- How long since last practiced
- Current acquisition stage
- Goal alignment (active goal items get 3x boost)

---

## UI — Scales Section in S&P Module

The S&P module gets a "Scales" section alongside "Chord Shapes" and (future) "Voice Leading":

- **Overview** — progress across all 96 cells, grouped by scale type
- **Practice** — drill interface (same Flying/Cruising/Crawling rating as chord shapes)
- **Key grid** — shows all 12 keys per scale type, color-coded by acquisition stage

---

## Build Order

**Phase 1 (immediate):**
1. Skill definitions — `scaleSkills.ts` with all 96 cells, itemRef parser/generator
2. Spacing state integration — scales write to db.spacingState with moduleRef: 'shapes-and-patterns'
3. Goal flow — scale sub-areas in GoalSuggestionFlow S&P section; coverage targets per sub-area; granularity picker for starting points
4. Session algorithm — scales block as first S&P block in Keys/Mixed; key prioritization (active song keys first)
5. Practice UI — drill interface with Flying/Cruising/Crawling rating
6. Remove the placeholder scale warm-down from shapesSplit.ts — replace with proper spacing-state-driven scale block

**Phase 2 (future):**
1. Song-key matching — once all cells comfortable, warm up in active song keys automatically
2. Modes — additional scale types (Dorian, Phrygian, Mixolydian etc.) as a natural extension

---

## Notes

- Time estimates (30s/90s) are starting points that will calibrate with real practice data
- Starting point labels (1, 5, 6 for major pent; 1, b3, b7 for minor pent) should display in the UI as musical positions, not just numbers
- The relative major connection (C minor → Eb major) is a session ordering rule, not a separate cell — after drilling natural minor in C, queue up major scale in Eb
