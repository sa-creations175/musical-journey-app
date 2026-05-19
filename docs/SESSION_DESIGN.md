# SESSION_DESIGN.md
## Musical Journey App — Session Structure Design
**Last updated:** May 15, 2026
**Status key:** ✅ Built | 🔧 Partially built | ❌ Not yet built

---

## Purpose

Single source of truth for how practice sessions are structured — block order, time proportions, gating rules, and context-specific behavior. When session behavior feels wrong, check here first, then check the constants in `shapesSplit.ts`, `timeAllocation.ts`, `contextWeighting.ts`, `repertoireSplit.ts`, and `sessionGenerator.ts`.

---

## Core principle

Sessions work backwards from goal pace. Time is derived from attempts × time-per-attempt (Phase B). The session structure below defines how that time is divided and ordered — not how much total time each module gets (that comes from `computeModuleWeeklyNeeds`).

---

## Contexts

Four contexts. Each determines which modules appear.

| Context | Keyboard | Modules |
|---|---|---|
| `keys` | Yes | S&P + Repertoire only |
| `laptop` | No | ET + HF + Production + Mental viz |
| `phone` | No | ET + HF + Production (read/watch) + Mental viz |
| `full` | Yes, then no | Keyboard block first → non-keyboard block second |

`mixed` was removed — it was a zombie (never user-facing, identical behavior to `keys`).

**Production on phone:** Lessons surface normally. Hands-on Logic exercises show a "Requires Logic" badge — informational, not blocking.

---

## Keyboard session

### Block order

```
1. Scales warm-up
2. Chord shapes
3. Voice leading
4. [Chord progression quiz — SotM]   ← placeholder, weight=0, not yet built
5. Scale prep (SotM key)
6. Song of the Month practice
7. Scale prep (maintenance key)
8. Maintenance song practice
```

### S&P / Repertoire split — graduated by session length ❌ Not yet built (code uses flat 40/60)

| Session length | S&P | Repertoire |
|---|---|---|
| 15 min | curated mode (see below) | curated mode |
| 30 min | 25% | 75% |
| 45 min | 35% | 65% |
| 60 min | 40% | 60% |
| 90 min | 40% | 60% |

### S&P internal split ❌ Not yet built (code uses 25/50/25 with VL, 30/70 without)

| Submodule | Target % of S&P block |
|---|---|
| Scales warm-up | 15% |
| Chord shapes | 45% |
| Voice leading | 40% |

**Two-way fallback (no VL):** 20% scales / 80% chord shapes
**VL gate:** three-way split only fires when S&P block ≥ 15 min

### Scales warm-up rules ❌ Not yet built (code uses SCALES_SEGMENT_MAX_KEYS=3, no type-pair rule)

- **Keys per session:** 1 key default, 2 keys max
- **Types per key:** 2 types (most-due pair for that key)
  - Major-tonality keys: major + major pentatonic
  - Minor-tonality keys: natural minor + minor pentatonic
- **Total duration:** ~5 min (2 keys × 2 types × ~75s avg)
- **Key selection:** purely spacing-state driven — no song key influence
- **No hard time cap** — key count (max 2) is the natural ceiling
- **`SCALES_SEGMENT_MAX_KEYS`:** should be 2 (currently 3)

### Repertoire internal split ✅ Built

| Block | Proportion | Notes |
|---|---|---|
| Scale prep (SotM key) | 90s fixed | Only when SotM block ≥ 5.5 min. Interactive — opens ScalesDrillModal in-session. |
| Song of the Month | 75% of repertoire | |
| Scale prep (maintenance key) | 90s fixed | Uses expansion key for cross-key songs. Interactive. |
| Maintenance song | 25% of repertoire | |

### 15-minute keyboard sessions — curated mode ❌ Not yet built

15-minute sessions are not a scaled-down full session. They follow a curated mode:
- **Max 2 blocks**
- App suggests the best combination based on pace urgency + spacing demand
- User can swap or adjust before accepting
- No fixed percentage structure

**Valid combinations:**
- Scales + Chord shapes (technique drilling)
- Chord shapes + VL (technique + movement)
- Chord shapes + SotM (technique + song)
- SotM + Maintenance (song-only, split)
- SotM only (deep focus)

Connected to the time picker redesign (not yet designed).

### Concrete durations by session length

| Block | 15 min | 30 min | 45 min | 60 min | 90 min |
|---|---|---|---|---|---|
| Scales warm-up | 1 min | 2 min | 3 min | 4 min | 5 min |
| Chord shapes | 5 min | 6 min | 8 min | 11 min | 16 min |
| Voice leading | — | — | 7 min | 9 min | 14 min |
| Scale prep (SotM) | — | 1.5 min | 1.5 min | 1.5 min | 1.5 min |
| Song of the Month | 7 min | 16 min | 19 min | 26 min | 39 min |
| Scale prep (maint.) | — | — | 1.5 min | 1.5 min | 1.5 min |
| Maintenance song | 2 min | 5 min | 5 min | 7 min | 12 min |
| **Total** | **15** | **30** | **45** | **60** | **90** |

Notes:
- VL appears at 45 min+ (S&P block ≥ 15 min gate)
- Scale prep (SotM) appears at 30 min+ (song block ≥ 5.5 min)
- Scale prep (maintenance) appears at 45 min+ (maintenance block ≥ 5.5 min)
- 15-min session: curated mode, durations above are approximate only

---

## Non-keyboard session (laptop / phone)

### Block order — design intent ❌ Not enforced in code (currently weight-based only)

```
1. Mental visualization
2. ET — Intervals
3. ET — Chord recognition
4. ET — Chord progressions  ┐ parallel tracks — both surface once chord
5. ET — Scales & modes      ┘ recognition has a foundation; neither blocks the other
6. HF flashcards
7. Production — Vocabulary
8. Production — Lessons
```

**ET progression rationale:**
- Intervals: most foundational — hear individual pitch relationships first
- Chord recognition: builds directly on interval recognition
- Chord progressions + Scales/modes: parallel — different dimensions of ear training with no strong dependency on each other. Chord progressions is harmonic/functional; scales/modes is tonal color/melodic. Both require a trained ear (hence after intervals + chord recognition) but don't require each other.

### Current behavior vs. intent

| Module | Current behavior | Design intent |
|---|---|---|
| Mental visualization | Zero session presence — not surfaced at all | Surfaced in laptop (secondary) and phone (primary) sessions as a time-allocated block, no SpacingState |
| ET ordering | Weight-based. Chord progressions 1.6× on laptop, all ET 1.4× on phone. No enforced sequence | Intervals → chord recognition → chord progressions → scales/modes in iteration order, with eventual tier-based progression gating |
| ET tier system | Does not exist — flat array only (`ET_MODULE_REFS`) | T1-T5 tiered progression designed in docs, never built |
| HF | Surfaces via weight (1.2× laptop, 1.4× phone) | After ET in session order |
| Production vocabulary | Already prepended before lessons ✅ | Vocab before lessons ✅ |
| Production lessons | Surfaces via weight (1.5× laptop, 1.0× phone) | After vocabulary |
| Module sequencing | Purely weight-based, no enforced order | Explicit: mental viz → ET → HF → Production |

### Non-keyboard proportions — TBD

Not yet designed. To be determined after real usage data from laptop/phone sessions. The current weight-based system surfaces these by pace urgency — explicit proportions come later.

---

## Full session (keyboard + non-keyboard)

### Block order

```
[Keyboard block — same as 90-min keyboard session above]
  1. Scales warm-up
  2. Chord shapes
  3. Voice leading
  4. Scale prep + SotM practice
  5. Scale prep + Maintenance practice

[Non-keyboard block]
  6. Mental visualization
  7. ET (intervals → chord recognition → chord progressions → scales/modes)
  8. HF flashcards
  9. Production (vocabulary → lessons)
```

### Time split — TBD

The keyboard/non-keyboard time split for a full session is not yet designed. To be determined from real usage. Keyboard block defaults to 90-min session structure.

---

## Key constants — where they live

| Constant | File | Current value | Design intent |
|---|---|---|---|
| `SCALES_SEGMENT_MAX_KEYS` | `shapesSplit.ts` | 3 | 2 |
| S&P three-way split ratios | `shapesSplit.ts` | 25/50/25 | 15/45/40 |
| S&P two-way split ratios | `shapesSplit.ts` | 30/70 | 20/80 |
| `SCALE_PREP_SECONDS` | `repertoireSplit.ts` | 90s | 90s ✅ |
| `SCALE_PREP_MIN_SONG_SECONDS` | `repertoireSplit.ts` | 240s | 240s ✅ |
| VL block floor (three-way gate) | `shapesSplit.ts` | 15 min | 15 min ✅ |
| ET chord progressions weight (laptop) | `contextWeighting.ts` | 1.6× | 1.6× ✅ |
| ET weight (phone) | `contextWeighting.ts` | 1.4× (flat) | TBD |

---

## Outstanding build items from this design

In priority order:

1. **S&P split constants** — update three-way to 15/45/40, two-way to 20/80, `SCALES_SEGMENT_MAX_KEYS` to 2, scales warm-up type-pair rule
2. **Graduated S&P/Repertoire split** — 25/75 at 30 min, 35/65 at 45 min, 40/60 at 60-90 min
3. **Mental viz session surfacing** — add to laptop (secondary weight) and phone (primary weight) candidate pool as a time-allocated block without SpacingState
4. **Non-keyboard module sequencing** — enforce mental viz → ET → HF → Production order
5. **15-min curated session mode** — 2-block max, pace-driven suggestions, user-adjustable (connected to time picker redesign)
6. **ET tier system (T1-T5)** — larger design effort, deferred pending real usage data
7. **Full session time split** — keyboard vs. non-keyboard proportion, deferred pending real usage

---

## Deferred / watching

- Chord progression quiz (SotM) — placeholder at weight=0
- ET tier system — designed, never built, deferred pending usage data
- Non-keyboard proportions — weight-based for now, explicit proportions after real usage
- Full session keyboard/non-keyboard time split — after real usage
- Time picker redesign (informs 15-min curated mode) — not yet designed
