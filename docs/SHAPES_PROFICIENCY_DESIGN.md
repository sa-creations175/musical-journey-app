# Shapes & Patterns Proficiency Redesign — Design Document

Living design doc capturing the new proficiency model for Shapes & Patterns. Prerequisite for Phase 1.6 (Goal Modal Redesign Step 2 — Shapes & Patterns).

Last updated: April 26, 2026 (full design session complete)

**Status:** Fully designed. Ready for build as part of Phase 1.6.

---

## Why this redesign exists

The existing Shapes & Patterns module tracks practice via heat grids and drill sessions but has no meaningful proficiency model. The original design assumed the app would objectively measure accuracy — but Shapes & Patterns is actually self-logged practice time at the keyboard. You log "5 minutes of C major 7 inversions at 80 BPM." The app can't grade you; it can only track your investment and hold you to a standard.

This means Shapes & Patterns belongs with the same cognitive structure as Song Repertoire — self-assessed, time-investment-measured, integrated physical skill — not with the accuracy-measured modules like Ear Training and Harmonic Fluency.

The redesign:
- Gives Shapes & Patterns the song vocabulary (Learning → Comfortable → Solid → Internalized)
- Tracks proficiency per shape per key (C major 7 inversion and F major 7 inversion are genuinely different physical skills)
- Uses a time + BPM gate that's honest to how physical keyboard skills are actually consolidated — short frequent sessions over distributed days, not long cram sessions

---

## Scope

This redesign covers three activity areas:

- **Scale Drills**
- **Chord Shape Drills**
- **Voice-Leading Drills**

**Mental Visualization is explicitly excluded.** Mental Visualization (Mental Transposition and Chord Shape Visualization) is a different cognitive activity — declarative/flashcard, not procedural/physical. It needs a separate flashcard-style design: prompt to visualize → reveal on keyboard visual. That design is deferred and will be a separate document.

All three included activity areas are key-specific physical skills. Every shape in these areas has a key dimension.

---

## The model

### Vocabulary

Song vocabulary — same as Song Repertoire:

**Learning** — started logging practice on this shape + key, building familiarity

**Comfortable** — the shape feels comfortable in this key under your fingers. You've put in enough sessions over enough days to have genuine contact with it.

**Solid** — the shape is proven at or near target BPM across enough sessions and days that it's genuinely solid, not just familiar.

**Internalized** — the shape is automatic in this key. Long-term distributed practice has made it second nature.

### Tracking unit

Per shape per key. C major 7 inversion and F major 7 inversion are tracked independently. Each combination has its own proficiency state, session count, and gate progress.

### Target BPM

User-declared per shape when added — same pattern as song performance tempo. If no target BPM is declared, the BPM component of the gate is disabled (time and session count alone gate advancement).

BPM gate is one-sided: sessions count as "at tempo" if BPM ≥ (target BPM − 10). Playing faster than target always counts. Playing more than 10 BPM below target doesn't count toward the at-tempo requirement (still logged honestly, just doesn't advance the at-tempo count).

### Why short frequent sessions matter

Physical keyboard skills consolidate through spaced repetition of motor patterns — not through volume in a single sitting. 3 minutes of C major 7 inversions today, 4 minutes in two days, 2 minutes the day after that is more effective than 20 minutes in one sitting. The gate thresholds reflect this:

- Session count matters more than total minutes
- Day spread is required — sessions must be distributed, not clustered
- A daily session cap prevents single-day cramming from gaming the count

---

## Gate thresholds

All thresholds are tunable parameters — not hardcoded. Calibrated for a 2.5-year learner who already has many shapes partially in their hands and is working toward making them second nature.

| Gate | Min sessions | Min day spread | Min duration per session | Min at-tempo sessions |
|---|---|---|---|---|
| Learning → Comfortable | 3 | 5 days | 2 minutes | 1 |
| Comfortable → Solid | 8 | 14 days | 2 minutes | 3 |
| Solid → Internalized | 20 | 30 days | 2 minutes | 5 |

**Day clustering rule:** Max 3 sessions from any single calendar day count toward the gate. This prevents a single long practice day from inflating the session count.

**Minimum session duration:** 2 minutes flat across all shape types. This was considered at 4 minutes for seventh chords and beyond but kept at 2 minutes for simplicity — a tunable parameter if the 2-minute threshold feels too easy for complex shapes in practice.

**Day spread definition:** Calendar days between first qualifying session and most recent qualifying session on this shape + key. A "qualifying session" meets the minimum duration threshold.

---

## Schema

### Table 1: `shapeKeys`

One row per (shape × key) combination. Tracks proficiency state and gate progress.

```
shapeKeys
  id                        text (uuid)
  user_id                   text
  shape_id                  text (FK → existing shapes table)
  activity_area             text — 'scale_drills' | 'chord_shape_drills' | 'voice_leading'
  key_name                  text — one of 12 major keys
  target_bpm                integer | null — user-declared, same pattern as song performance tempo
  key_state                 text — 'not_started' | 'learning' | 'comfortable' | 'solid' | 'internalized'
  total_session_count       integer — all qualifying sessions (≥ 2 min)
  total_minutes_logged      integer — sum across all sessions
  first_session_at          timestamp
  last_session_at           timestamp
  at_tempo_session_count    integer — sessions at or above target BPM − 10
  days_spread               integer — calendar days between first and last qualifying session
  state_updated_at          timestamp
  created_at                timestamp
  updated_at                timestamp
  last_engaged_at           timestamp
```

Notes:
- `key_state` is derived from gate thresholds against the aggregate fields. Re-evaluated after each `shapePracticeLogs` insert.
- `days_spread` is recomputed on each log insert: `(last_session_at date) - (first_session_at date)` in calendar days.
- Day clustering rule enforced at log time: count sessions per calendar day before incrementing `total_session_count`. If a day already has 3 qualifying sessions logged, additional sessions that day don't increment the count (still stored in `shapePracticeLogs` for honest history, just don't gate-advance).

---

### Table 2: `shapePracticeLogs`

One row per logged practice session on a shape + key.

```
shapePracticeLogs
  id                    text (uuid)
  user_id               text
  shape_key_id          text (FK → shapeKeys.id)
  shape_id              text (FK → existing shapes table)
  activity_area         text
  key_name              text
  duration_minutes      integer — actual duration logged (manual or timer-captured)
  bpm                   integer | null — BPM practiced at
  is_qualifying         boolean — true if duration_minutes ≥ 2 (the minimum threshold)
  is_at_tempo           boolean — true if bpm ≥ (target_bpm - 10), or true if no target_bpm set
  counts_toward_gate    boolean — true if qualifying AND not blocked by day clustering rule
  notes                 text | null
  practice_session_id   text | null — FK → practiceSessions.id if logged via Practice Sessions
  logged_at             timestamp
  created_at            timestamp
```

Notes:
- `is_qualifying`, `is_at_tempo`, `counts_toward_gate` are computed at insert time and stored — avoids recomputing on every read.
- `practice_session_id` nullable — can be logged from the shape drill view directly, not just from Practice Sessions.
- All sessions stored regardless of qualifying status — honest history, even for short or below-tempo sessions.

---

### Rollup logic

**After each `shapePracticeLogs` insert:**

1. Recompute `is_qualifying`: `duration_minutes >= 2`
2. Recompute `is_at_tempo`: `bpm >= (target_bpm - 10)` if target_bpm set, else `true`
3. Check day clustering: count existing qualifying logs for this `shape_key_id` on the same calendar day. If count < 3, `counts_toward_gate = true`. Else `counts_toward_gate = false`.
4. Update `shapeKeys` aggregate fields: increment `total_session_count` if `counts_toward_gate`, add `duration_minutes` to `total_minutes_logged`, update `last_session_at`, update `at_tempo_session_count` if `is_at_tempo && counts_toward_gate`, recompute `days_spread`.
5. Re-evaluate `key_state` against thresholds. If gate met, advance state and log `state_updated_at`.

---

## Logging UI

### Entry points

- **From the shape drill view** — inline "Log practice" button on each shape + key combination
- **From Practice Sessions (Phase 3)** — when the session generator surfaces a shapes block, logging happens inline in the session flow

### Modal design

**Header:** Shape name · Key · Activity area

**Target BPM reminder:** Small line showing declared target BPM (if set). Tap to edit — same confirm-prompt pattern as song cell modal tempo edit.

**Duration:**
- Timer option: set a countdown duration, start, practice, timer stops automatically and pre-fills duration
- Manual entry: type duration in minutes after practicing
- Both available — user chooses per session

**BPM input:** What BPM did you practice at? Pre-filled with last logged BPM for this shape + key.

**Gate progress strip:** Inline below the form fields. Shows current gate progress toward next level:
- Session count: "3 of 8 sessions"
- Day spread: "5 of 14 days"
- At-tempo sessions: "1 of 3 at-tempo sessions"
- Same visual pattern as song matrix key strip

**Notes field:** Optional, below gate strip.

**Save button:** Disabled if duration is 0. Enabled once duration > 0.

**Below-minimum note:** If duration entered is < 2 minutes, show a soft amber note: "Sessions under 2 minutes don't count toward the gate — still logged for your records."

**Below-tempo note:** If BPM entered is more than 10 below target, show a soft amber note: "Below target tempo — still logged, won't count toward at-tempo requirement."

---

## Migration

**None needed.** No meaningful existing Shapes & Patterns practice data exists in the app. The `shapeKeys` and `shapePracticeLogs` tables start empty. The first time a user opens a shape's drill view under the new model, there is no pre-populated state. The UI shows "Not started" honestly and invites the user to begin logging.

---

## Goal creation modal integration

When the user selects Shapes & Patterns in the goal creation flow (Phase 1.6):

**Proficiency target:**
- Activity area picker: Scale Drills / Chord Shape Drills / Voice-Leading
- Specific shape within area (list from existing shapes catalog)
- Key picker: specific key OR "all 12 keys"
- Target level: Learning → Comfortable → Solid → Internalized
- OR: Overall proficiency across all shapes in an activity area

**Consistency target:**
- X minutes per week or per month
- X sessions per week or per month

**Goal preview examples:**
- "Reach Comfortable proficiency level on major 7th inversions in 6 keys"
- "Reach Solid proficiency level on the 1-7-3-6-2-5-1 voice-leading pattern in C"
- "Practice shapes & patterns at least 20 minutes a week"
- "Improve my overall Chord Shape Drills proficiency to Comfortable across all keys"

---

## Mental Visualization — design note (deferred)

Mental Visualization is a different cognitive activity from the three at-keyboard areas. It belongs with the declarative/flashcard modules. The interaction should be:

1. App surfaces a prompt: "Visualize a C major 7 chord — where are the notes on the keyboard?"
2. User thinks through it
3. User taps "Reveal"
4. App shows the chord highlighted on a visual keyboard

This is a flashcard-style interaction, not a timed practice block. It should use the garden vocabulary (Planting → Sprouting → Branching → Rooted → Seasoned) since it's accuracy/recognition-based, not physical skill. Full design deferred to a dedicated session.

---

## Design principles captured

**Short frequent contact beats long infrequent sessions for physical skills.** The gate enforces session count and day spread, not just total time. A 2-minute session every day for a week is more valuable than a 14-minute session once.

**Vocabulary should earn its words at the level where the achievement happens.** "Comfortable" means the shape is comfortable under your fingers in this key — same honest standard as Song Repertoire.

**Thresholds reflect current consolidation depth.** Calibrated for a 2.5-year learner who already has many shapes partially in hand. As consolidation deepens, thresholds should be revisited — schema supports this without structural changes.

**Cognitive structure determines vocabulary.** Shapes & Patterns is self-assessed integrated physical skill — same structure as Song Repertoire, not the same as accuracy-measured Ear Training. The vocabulary follows the cognitive structure, not the module category.

---

## Sync registration

Both new tables follow the existing `syncedWrite` pattern with mirrored Supabase tables and RLS policies scoped to `user_id`:
- `shapeKeys`
- `shapePracticeLogs`

---

## Tunable parameters

| Parameter | Default | Notes |
|---|---|---|
| Min session duration (all gates) | 2 minutes | Consider raising for complex shapes after real usage |
| Learning → Comfortable: sessions | 3 | |
| Learning → Comfortable: day spread | 5 days | |
| Learning → Comfortable: at-tempo sessions | 1 | |
| Comfortable → Solid: sessions | 8 | |
| Comfortable → Solid: day spread | 14 days | |
| Comfortable → Solid: at-tempo sessions | 3 | |
| Solid → Internalized: sessions | 20 | |
| Solid → Internalized: day spread | 30 days | |
| Solid → Internalized: at-tempo sessions | 5 | |
| Day clustering cap | 3 sessions/day | Max sessions from one day that count toward gate |
| BPM floor tolerance | 10 BPM below target | Same one-sided gate as Song Repertoire |
