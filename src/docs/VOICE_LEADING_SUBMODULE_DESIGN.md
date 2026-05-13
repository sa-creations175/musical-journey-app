# Voice Leading — S&P Submodule Design
**Status:** Design complete. Ready to build.
**Date:** May 13, 2026

---

## Overview

Voice Leading (VL) is the third submodule of Shapes & Patterns (S&P), sitting after Chord Shapes in the session block order. It covers named progression patterns practiced in all 12 keys — the bridge between knowing individual chord shapes and using them in actual music.

S&P module session block order:
1. **Scales** — warm-up
2. **Chord Shapes** — individual chord drilling
3. **Voice Leading** — connecting chords through progressions
4. **Song Repertoire** — playing actual songs

VL also reinforces ET (ear training) and HF (harmonic fluency) — the theoretical understanding of these patterns lives in HF flashcards, the ear recognition lives in ET, and the physical execution lives here in S&P VL.

---

## Core Concepts

### A Position vs B Position
Each chord in a VL pattern can be voiced in one of two positions:
- **A position** — root voicing in the right hand (e.g. Dm7 right hand: F A C E)
- **B position** — a specific inversion/drop voicing in the right hand

Bass (left hand) always plays the root of each chord.

### ABA / BAB
Refers to the position sequence across the chords in the pattern:
- **ABA** — first chord A position, second chord B position, third chord A position
- **BAB** — first chord B position, second chord A position, third chord B position

Smooth voice leading happens because adjacent notes move by step or stay as common tones between chords.

### Complexity Levels
Some patterns have multiple complexity levels — simpler voicings before fuller ones. Levels are practiced as separate cells so the spacing system can surface the right level.

---

## Pattern Definitions

### Pattern 1: ABA/BAB 2-5-1

The foundational jazz/gospel voice leading pattern. In C major: Dm → G → Cmaj

**Resolution rule:** Dominant chord resolves a 5th down (circle of 4ths motion).

**Three complexity levels (practiced as separate cells):**
- **Level 1 (guide tones only)** — just the 3rds and 7ths
  - Dm: D + F + C (root + b3 + b7)
  - G7: G + F + B (root + b7 + 3rd)
  - Cmaj7: C + E + B (root + 3rd + maj7)
- **Level 2 (full 7th chords)** — Dm7 → G9 → Cmaj7
- **Level 3 (full color)** — Dm9 → G9(13) → Cmaj9

**Two starting positions per level:**
- ABA: Dm in A position → G in B position → Cmaj in A position
- BAB: Dm in B position → G in A position → Cmaj in B position

**Total cells per key:** 6 (3 levels × 2 positions)
**Total cells across all 12 keys:** 72

**itemRef format:** `vl:aba-251:level{1|2|3}:{A|B}:{keyName}`
- e.g. `vl:aba-251:level2:A:C`, `vl:aba-251:level3:B:F`

---

### Pattern 2: 1-4-7-3-6-2-5-1 Diatonic Cycle

Full diatonic cycle in 7th chords. In C major:
**Cmaj7 → Fmaj7 → Bm7b5 → Em7 → Am7 → Dm7 → G7 → Cmaj7**

**Resolution rule:** Dominant chord resolves a 5th down throughout.

**Three starting inversion points for the 1 chord:**
- Position 1: Cmaj7 in root position
- Position 2: Cmaj7 in 1st inversion
- Position 3: Cmaj7 in 2nd inversion

Each starting position creates different voice leading across the full cycle.

**Total cells per key:** 3 (one per starting position)
**Total cells across all 12 keys:** 36

**itemRef format:** `vl:diatonic-cycle:pos{1|2|3}:{keyName}`
- e.g. `vl:diatonic-cycle:pos1:C`, `vl:diatonic-cycle:pos2:G`

---

### Pattern 3a: dom7#9#5 → Minor Resolution (Dark Tension — Altered Dominant)

**Resolution rule:** Dominant resolves a 5th down. Primary resolution target is min9.

Example in C: G7#9#5 → Cm9

**Two starting positions:**
- A position: G7#9#5 in A position → Cm9 in A position
- B position: G7#9#5 in B position → Cm9 in B position

**Three resolution targets per position:**
- → min7
- → min9 (primary)
- → min11

**Total cells per key:** 6 (2 positions × 3 resolution targets)
**Total cells across all 12 keys:** 72

**itemRef format:** `vl:dom-sharp9sharp5:{A|B}:min{7|9|11}:{keyName}`
- e.g. `vl:dom-sharp9sharp5:A:min9:C`

---

### Pattern 3b: dom7b9 → Minor Resolution (Dark Tension — Right hand = dim7)

**Resolution rule:** Dominant resolves a 5th down. Right hand voicing is a dim7 chord (e.g. Bdim7 over G bass = G7b9).

Example in C: G7b9 → Cm9

Same structure as 3a — two positions, three resolution targets.

**Total cells per key:** 6
**Total cells across all 12 keys:** 72

**itemRef format:** `vl:dom7b9:{A|B}:min{7|9|11}:{keyName}`

---

### Pattern 3c: dim7 → Minor Resolution (Pure Diminished Passing Chord)

**Resolution rule:** dim7 resolves a half step up OR down (not a 5th). No dominant bass.

Example: Bdim7 → Cm (half step up) OR Bdim7 → Bbm (half step down)

**Two resolution directions:**
- Half step up
- Half step down

**Three resolution targets per direction:**
- → min (triad)
- → min7
- → min9

**Total cells per key:** 6 (2 directions × 3 resolution targets)
**Total cells across all 12 keys:** 72

**itemRef format:** `vl:dim7:{up|down}:min{triad|7|9}:{keyName}`
- e.g. `vl:dim7:up:min9:C`

---

## Summary: Total Cell Count

| Pattern | Cells per Key | Total (× 12) |
|---|---|---|
| ABA/BAB 2-5-1 | 6 | 72 |
| 1-4-7-3-6-2-5-1 diatonic cycle | 3 | 36 |
| dom7#9#5 → minor | 6 | 72 |
| dom7b9 → minor | 6 | 72 |
| dim7 → minor | 6 | 72 |
| **Total** | **27** | **324** |

---

## Conceptual Framework: Passing Chords

All patterns in this submodule are **passing chord options** — different colors of the same harmonic function: tension seeking resolution.

| Pattern | Tension Type | Resolution Rule | Sound |
|---|---|---|---|
| ABA/BAB 2-5-1 | Bright dominant | 5th down | Bright, inside |
| Diatonic cycle | Diatonic movement | 5th down throughout | Smooth, inside |
| dom7#9#5 → minor | Dark altered dominant | 5th down | Dark, outside |
| dom7b9 → minor | Dark altered dominant | 5th down | Dark, outside |
| dim7 → minor | Diminished passing | Half step up or down | Ambiguous, chromatic |

---

## Rating System

**Flying / Cruising / Crawling** — same as all other S&P submodules.

AcquisitionStage: new → acquiring → acquired → comfortable → internalized

---

## Attempt Definition

One attempt = one timed drill run (~60-90s). Player runs through the progression repeatedly for the duration, then rates Flying/Cruising/Crawling. Same model as scales and chord shapes. Time estimates will calibrate with real practice data.

Note: Pattern 2 (diatonic cycle) is 8 chords — may need a longer attempt duration (~2-3 min). Calibrate with real data.

---

## Session Algorithm

### Context
**Keys and Mixed only** — VL is a keyboard skill. Never surfaces in Laptop or Phone sessions.

### Session block position
After Chord Shapes, before Song Repertoire:
1. Scales (warm-up)
2. Chord Shapes
3. **Voice Leading** ← here
4. Song Repertoire

### Key ordering
Circle-of-4ths from least-recently-practiced key with due cells. Same as scales and chord shapes.

### Goal alignment
Active VL goals get 3x weight boost (same as other S&P specific-coverage goals).

---

## Goal Flow

Follows the ET/Scales pattern — separate goals per VL pattern, each tracked independently.

Goal sub-areas:
- ABA/BAB 2-5-1 (granularity: specific level, specific position)
- Diatonic cycle (granularity: specific starting position)
- dom7#9#5 → minor (granularity: position, resolution target)
- dom7b9 → minor
- dim7 → minor

Users can set coverage goals for any pattern across all 12 keys, or scope to specific levels/positions for staged progression.

---

## Cross-Module Reinforcement

VL patterns reinforce ET and HF simultaneously:
- **HF flashcards** — theoretical understanding (guide tone relationships, why dom7b9 creates a dim7 in the right hand, tritone substitution)
- **ET** — ear recognition (hearing 2-5-1 in context, recognizing dark vs bright tension)
- **S&P VL** — physical execution (hands playing the actual voicings)

---

## UI — Voice Leading Section in S&P Module

The S&P module's VL section:
- **Pattern library** — list of all patterns with progress per pattern
- **Practice** — drill interface; shows the progression, player executes, rates Flying/Cruising/Crawling
- **Key grid** — all 12 keys per pattern, color-coded by acquisition stage

---

## Build Order

**Phase 1 (build after Scales submodule):**
1. Pattern definitions — `vlPatterns.ts` with all 5 patterns, itemRef parser/generator, 324 cell definitions
2. Spacing state integration — VL cells write to db.spacingState with moduleRef: `shapes-and-patterns`
3. Goal flow — VL sub-areas in GoalSuggestionFlow S&P section
4. Session algorithm — VL block as third S&P block type in Keys/Mixed; key prioritization
5. Practice UI — drill interface showing progression notation, Flying/Cruising/Crawling rating

**Phase 2 (future):**
1. VL pattern library expansion — user can add custom patterns from song repertoire
2. Advanced harmonic learning integration — tritone substitution, hybrid chords
3. ET integration — hear VL patterns in context
