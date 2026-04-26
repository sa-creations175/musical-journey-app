# Song Progression Redesign — Design Document

Living design doc capturing the redesigned proficiency model for Song Repertoire. Supersedes all prior versions including SONG_PROGRESSION_DESIGN_2.md.

Last updated: April 26, 2026 (all design sessions complete — schema, matrix UI, cell modal, migration, section mutations, validation test UX, goal creation modal)

**Status:** Fully designed. All decisions locked. Ready for build as Phase 1.5 (after Practice Sessions Phase 1 completes). Build sequencing in BUILD_SEQUENCER.md.

---

## Why this redesign exists

The original song proficiency model was a flat 5-level ladder per song: Learning → Comfortable → Cross-key → Internalized → Maintenance. That model had several honest problems:

1. **It hid the work.** A song marked "Comfortable" said nothing about whether all sections were actually solid, or whether one section was carrying the weight while another wobbled.
2. **Cross-key was binary.** Either "cross-key" or not, with no honest signal about how far along.
3. **Internalized conflated breadth with depth.** "Memorized in one key" got the same label as "owned across many keys."
4. **The model didn't fit how the user actually learns.** Playing by ear, learning chord-function-first, makes "play from memory" the baseline — not the achievement marker.
5. **Goals against the old model were vibes-based.** Without per-cell measurability, "5 songs at Cross-key" had no honest definition underneath.

This redesign rebuilds the model from cell up, with measurable validation tests and honest rollups at each tier.

---

## The model

### Key-level states (inside the matrix rows)

Three states per key row. No Internalized at the key level — Internalized is a song-level achievement only.

**Learning** — the key has been started. Some sections are Comfortable, others still being worked.

**Comfortable** — every section in this key is Comfortable individually. Sections are under the fingers. The whole song hasn't been proven end-to-end yet.

**Solid** — every section Comfortable AND the whole song proven end-to-end: 3 consecutive clean run-throughs of the complete song in this key, at performance tempo, with all transitions intact, in a single sitting.

### Song-level states (header above the matrix)

Five states, derived from the matrix — not stored as a field.

**Learning** — original key not yet Comfortable. % shown = cells Comfortable in original / total sections.

**Comfortable** — original key is Comfortable. Every section under your fingers in the original key.

**Solid** — original key is Solid. The whole song proven end-to-end at tempo in the original key.

**Cross-key** — at least one non-original key has cells being worked, regardless of original key state. % shown = cells Comfortable across all non-original keys / (11 remaining keys × total sections). Cross-key % can accrue even while original key is still at Learning.

**Internalized** — 3 or more keys are Solid AND the lived-with gate is satisfied across those keys. The song plays from somewhere deeper than memory.

**Important:** These states are not strictly sequential. A user can be Cross-key while still working toward Solid in the original key. Two legitimate learning paths exist:
- **Path A (depth-first):** Get original key Solid, then extend cross-key
- **Path B (breadth-first):** Work sections across multiple keys simultaneously

Both paths are valid. The model supports both. Goal creation reflects both.

### Internalized gate

Three requirements, all must be true:
1. 3 or more keys are at Solid
2. Lived-with gate satisfied per key: each of those keys engaged across a rolling 14-day window with at least 5 sessions touching it
3. Decay has not lapsed any of those keys back below Solid

### Internalized decay

Decay signals drive practice recommendations, not automatic state demotion. The app prompts re-engagement; the user's performance determines the outcome.

- **Fading (14 days without engagement)** — surfaces in Practice Sessions recommendations as a "keep it alive" prompt. Key stays at Solid.
- **Lapsed (30 days without engagement)** — explicit retest recommended. Key only reverts from Solid if the user fails a prompted retest or manually resets a cell.
- Time thresholds calibrated for a 2.5-year learner. Extend as consolidation depth grows — schema supports this without structural changes.

### Maintenance

Maintenance is a **user-declared intent**, not a proficiency level. The user declares a song "Maintenance-only" when they've decided to stop actively developing it. The song keeps its current matrix state. Practice Sessions treats it accordingly. The decay algorithm handles recommendations — no separate goal needed. Declared via a toggle on Song Detail, not through the goal creation modal.

### Harmonic Mastery

Retired as a separate concept. Internalized already requires 3+ keys at Solid — that threshold captures the same musical achievement without a redundant label.

---

## Vocabulary and proficiencyDefinitions seed rows

### `scope: 'song'` — 5 rows

| display_order | level | short_label | description |
|---|---|---|---|
| 1 | learning | Just getting started | Working through sections in the original key — not yet comfortable with all of them |
| 2 | comfortable | Sections under your fingers | Every section of the original key feels comfortable individually |
| 3 | solid | Proven end-to-end | Played the whole song through cleanly, multiple times, at tempo, in the original key |
| 4 | cross_key | Taking it further | Extending the song into new keys beyond the original |
| 5 | internalized | Truly yours | Solid across multiple keys, and lived with long enough that it plays from somewhere deeper than memory |

**No Maintenance row** — Maintenance is intent, not a proficiency level.

### `scope: 'song_key'` — 3 rows

| display_order | level | short_label | description |
|---|---|---|---|
| 1 | learning | Working on it | Some sections are comfortable, others still being built |
| 2 | comfortable | Sections done | Every section in this key is comfortable individually |
| 3 | solid | Whole song proven | Played the full song through cleanly, 3 times in a row, at tempo, in this key |

These 8 rows join the existing skill-scope rows in the `proficiencyDefinitions` seed. They also update the existing song-scope rows — the old vocabulary (Learning / Comfortable / Cross-key / Internalized / Maintenance) is replaced by the new vocabulary above.

---

## Schema

### Table 1: `songSections`

```
songSections
  id                    text (uuid)
  user_id               text
  song_id               text (FK → songs.id)
  name                  text
  display_order         integer
  is_archived           boolean     -- default false; archived sections hidden from matrix but history preserved
  split_from_section_id text | null  -- FK → songSections.id; set when section created via split
  created_at            timestamp
  updated_at            timestamp
```

Notes:
- No canonical section names — user defines per song
- Suggested list offered as tappable chips on creation: Intro / Verse / Pre-chorus / Chorus / Bridge / Outro / Coda
- Custom names allowed alongside suggested list
- A song must have at least 1 section before the matrix is usable
- `display_order` updated on drag-to-reorder (supported at any time)
- `is_archived` replaces hard delete — history preserved, state rollup excludes archived sections
- Archived sections restorable — `is_archived = false` reattaches all history; key states recalculate honestly

---

### Table 2: `songKeys`

```
songKeys
  id                            text (uuid)
  user_id                       text
  song_id                       text (FK → songs.id)
  key_name                      text        -- "C", "F#", "Bb", etc. (12 major keys only)
  is_original_key               boolean     -- one per song at a time; reassignable
  key_state                     text        -- 'not_started' | 'learning' | 'comfortable' | 'solid'
  solid_at                      timestamp
  solid_decay_state             text        -- 'solid' | 'fading' | 'lapsed' | null
  last_decay_check_at           timestamp
  lived_with_session_count      integer
  lived_with_first_session_at   timestamp
  lived_with_window_start_at    timestamp
  lived_with_sessions_in_window integer
  whole_song_test_passed_at     timestamp
  is_retest_recommended         boolean     -- set true by decay algo when retest is due
  created_at                    timestamp
  updated_at                    timestamp
  last_engaged_at               timestamp
```

Notes:
- `key_state` has four values: `not_started | learning | comfortable | solid`. Internalized does not exist at the key level.
- `solid_decay_state` values: `solid` (recently touched) / `fading` (past 14-day warning) / `lapsed` (past 30-day threshold, retest recommended) / `null` (not yet Solid)
- When `solid_decay_state` hits `lapsed`, key stays at `solid` — demotion only happens on failed retest or manual reset. `is_retest_recommended` set to true.
- `is_original_key` reassignable — matrix intact, designation changes only. One row per song can be true at any time.
- Lived-with window is rolling, re-anchored on each new engagement.

---

### Table 3: `songCells`

```
songCells
  id                        text (uuid)
  user_id                   text
  song_id                   text (FK → songs.id)
  section_id                text (FK → songSections.id)
  song_key_id               text (FK → songKeys.id)
  cell_state                text        -- 'empty' | 'learning' | 'comfortable'
  comfortable_at            timestamp
  consecutive_clean_count   integer     -- current streak toward 3-run test (0–3)
  last_run_at               timestamp
  last_run_was_clean        boolean
  notes                     text
  created_at                timestamp
  updated_at                timestamp
  last_engaged_at           timestamp
```

Notes:
- `cell_state` starts `empty`, transitions to `learning` on first engagement, to `comfortable` when 3-consecutive-clean passes
- `consecutive_clean_count` resets to 0 on any failed run-through
- Failed run-through does not move cell backward from `learning` to `empty`

---

### Table 4: `songCellRunThroughs`

```
songCellRunThroughs
  id              text (uuid)
  user_id         text
  cell_id         text (FK → songCells.id)
  song_id         text (FK → songs.id)
  section_id      text (FK → songSections.id)
  song_key_id     text (FK → songKeys.id)
  was_clean       boolean
  tempo_bpm       integer
  notes           text
  created_at      timestamp
```

---

### Table 5: `songKeyRunThroughs`

```
songKeyRunThroughs
  id                        text (uuid)
  user_id                   text
  song_key_id               text (FK → songKeys.id)
  song_id                   text (FK → songs.id)
  was_clean                 boolean
  consecutive_clean_count   integer
  tempo_bpm                 integer
  notes                     text
  is_retest                 boolean     -- true when attempt is a prompted retest, not initial testing
  created_at                timestamp
```

Notes:
- Gates the `comfortable → solid` transition at the key level
- 3 consecutive clean run-throughs required. Streak resets on any failed attempt.
- `is_retest` distinguishes initial Solid achievement from maintenance retesting — important for Practice Sessions prioritization and meta-dashboard

---

### Table 6: `songKeyEngagements`

```
songKeyEngagements
  id                    text (uuid)
  user_id               text
  song_key_id           text (FK → songKeys.id)
  song_id               text (FK → songs.id)
  practice_session_id   text | null
  engaged_at            timestamp
  created_at            timestamp
```

Notes:
- One row per session per key — any activity on the song in that key logs one engagement
- `practice_session_id` nullable — engagements can be logged from Song Repertoire directly
- Lived-with window logic runs on each insert, writes result back to `songKeys.lived_with_sessions_in_window`

---

### Rollup logic

**Cell state rollup** — after every `songCellRunThroughs` insert:
- If `was_clean` and `consecutive_clean_count` reaches 3 → `cell_state = 'comfortable'`, log `comfortable_at`
- If not `was_clean` → reset `consecutive_clean_count = 0`

**Key state rollup** — after any cell update, `songKeyRunThroughs` insert, or `songKeyEngagements` insert:
1. If all cells comfortable AND whole-song test passed (3 consecutive clean `songKeyRunThroughs`) → `key_state = 'solid'`, log `solid_at`, `solid_decay_state = 'solid'`
2. Else if all cells comfortable → `key_state = 'comfortable'`
3. Else if any cells learning or comfortable → `key_state = 'learning'`
4. Else → `key_state = 'not_started'`

**Solid decay** — on app open and tab focus:
- Days since `last_engaged_at` > 14 → `solid_decay_state = 'fading'`, surface in Practice Sessions recommendations
- Days since `last_engaged_at` > 30 → `solid_decay_state = 'lapsed'`, `is_retest_recommended = true`, explicit retest prompt queued
- Key stays at `solid` — demotion only on failed retest or manual reset
- Re-engagement while fading → `solid_decay_state = 'solid'`
- Re-pass after lapse → fresh `solid_at`, `is_retest = true` on the `songKeyRunThroughs` row

**Song-level state** — computed at read time, not stored:
- Count keys at `solid` (not lapsed). If ≥3 AND lived-with gate satisfied → **Internalized**
- Else if original key is `solid` → **Solid**
- Else if original key is `comfortable` or `solid` AND any non-original key has cells → **Cross-key** (compute %)
- Else if original key is `comfortable` AND no non-original cells → **Comfortable**
- Else → **Learning** (% = cells comfortable in original / total sections)

Note: Cross-key % can also show alongside Learning if non-original cells exist while original is still Learning.

---

### Section mutation behavior

| Mutation | State impact | Notes |
|---|---|---|
| Rename | None | Name updates, cells intact |
| Add | Key states recalculate honestly — keys that were Comfortable may drop to Learning | App surfaces transparent note: "Adding this section updated your key states" |
| Reorder | None | `display_order` updates only |
| Split | Inherits parent cell states by default | User can manually reset individual cells. `split_from_section_id` preserves lineage. |
| Archive | Excluded from rollup; history preserved | Accessible via "view archived" affordance |
| Restore | Re-included in rollup; history reattaches; key states recalculate | May cause keys to drop — honest |

---

### Sync registration

All 6 tables follow existing `syncedWrite` pattern with mirrored Supabase tables and RLS scoped to `user_id`:
`songSections`, `songKeys`, `songCells`, `songCellRunThroughs`, `songKeyRunThroughs`, `songKeyEngagements`

---

### Tunable parameters

| Parameter | Default | Notes |
|---|---|---|
| Cell comfortable: consecutive clean runs | 3 | |
| Whole-song Solid test: consecutive clean runs | 3 | |
| Lived-with window (days) | 14 | Rolling |
| Lived-with minimum sessions in window | 5 | |
| Solid decay warning threshold (days) | 14 | Calibrated for 2.5-year learner |
| Solid decay lapse threshold (days) | 30 | Calibrated for 2.5-year learner |
| Internalized threshold (keys at Solid) | 3 | |
| Cross-key denominator | 11 | All non-original keys |

---

## UI — approved design

### Matrix view

Accessed via dedicated view tapped into from Song Detail.

**Orientation:** Keys as rows, sections as columns. Scanning left-to-right shows how complete one key is across all sections.

**Key rows:** All 12 keys always visible. Unstarted keys dimmed but present. Original key labeled with "original" tag.

**Cell states (color + icon):**
- Comfortable: teal background, checkmark (✓)
- Learning: green background, dots (···)
- Not started (key engaged): white background, dash (—)
- Not started (key untouched): dimmed background, dimmed dash

**Key name cell left border color:**
- Solid: blue
- Comfortable: teal
- Learning: green
- Not started: neutral

**Inline strip below each key row:** State badge + progress bar + session/test context. Strip background: active keys white, untouched keys secondary.

**Song-level state header:** Song title, original key, performance tempo, section count left. Song-level state pill + cross-key % right.

### Cell interaction modal

Opens on cell tap. Functions as a practice block logger — not a quick tap-and-dismiss.

**Contents:**
- Cell context: section name · key · song name · performance tempo
- Current state badge + consecutive clean count (dots, not prominent number)
- Mode toggle: end-of-block (default) vs per-attempt
- Attempt log: sequence of attempts, each with BPM and clean/not clean, deletable
- Add attempt area: BPM input (auto-increments +4 after each clean run toward performance tempo) + Clean / Not clean buttons
- Notes field (below attempt log, not the first thing seen)
- Footer: "X more clean runs needed" hint + Save block + Mark comfortable (activates when 3-consecutive gate met)

**End-of-block mode (default):** Practice freely, return to modal, tap through attempts in sequence after the fact.

**Per-attempt mode:** Stay in modal between attempts, tap after each play-through.

Both modes write to same `songCellRunThroughs` table. Modal remembers last-used mode.

### Whole-song test modal (Comfortable → Solid)

**Initiation:** Deliberate. "Start whole-song test" button appears on key strip once all sections in that key are Comfortable. Hard gate — no exceptions.

**Modal:** Same interaction pattern as cell modal.
- Blue consecutive dots (vs teal for cell-level) — visually distinct
- "Mark solid" replaces "Mark comfortable"
- Context shows "all N sections" being tested
- Collapsed "View previous attempts" disclosure for cross-session history

**Consecutive logic:** 3 consecutive clean required. Failed attempt resets count to zero.

**Retest:** `is_retest = true` on `songKeyRunThroughs` when logging a prompted retest.

### Section setup (first open of migrated song)

**Persistent banner** at top of matrix: "Define sections to start using this song's matrix." Non-blocking but persistent until at least one section defined.

**Section setup flow:**
- Suggested chips: Intro / Verse / Pre-chorus / Chorus / Bridge / Outro / Coda
- Free-text field alongside for custom names
- All selections editable before confirming
- On confirm: sections + cells created

---

## Migration spec

### Auto-populated (no user action)

- Original key row created in `songKeys`, `is_original_key = true`
- Key state seeded from old proficiency:
  - Old Learning → `key_state = 'learning'`
  - Old Comfortable → `key_state = 'comfortable'`
  - Old Cross-key → `key_state = 'comfortable'` on original key + non-original key prompt queued
  - Old Internalized → `key_state = 'solid'` (closest honest equivalent)
- Performance tempo, original key, song name carry over unchanged
- No cell history seeded — consecutive counts start at zero

### Queued on first matrix open

- Persistent banner until section setup complete
- Section setup flow: suggested chips + free-text, editable before confirming
- For Cross-key songs: follow-up prompt "Which other keys were you working?" — selected keys created at `key_state = 'learning'`

### What never gets seeded

Cell states, run-through history, lived-with session counts, consecutive clean counts — all start fresh. That granularity was never tracked; nothing real is lost.

---

## Goal creation modal — song goals

### Granularity buttons (left to right, broadest to narrowest)

**Whole song** | **Song section** (weekly only, dimmed otherwise) | **Key**

### Whole song targets

1. **Solid in original key** — no tag; honest next milestone for most songs
2. **Cross-key %** — tagged "current" if already cross-key; selectable always (can target higher %); reveals % slider (20–100%, step 5%) on selection
3. **Internalized** — tagged "stretch" when 3+ keys at Solid is far away

### Key targets

Single option: "Get a key to a specific state"
- Key picker (all 12 keys)
- State toggle: Comfortable / Solid

### Song section targets (weekly only)

Single option: "Get a section Comfortable"
- Section picker
- Key picker

### Goal preview

Natural language rendered at bottom before adding:
- "Take Mirror to Solid in G♭"
- "Take Mirror to Cross-key 50%"
- "Get Mirror Comfortable in F"
- "Get the Bridge of Mirror Comfortable in F"

### State tags

- **achieved** — states already passed (greyed, unselectable)
- **current** — current state (greyed, unselectable — except Cross-key % which is always selectable)
- **stretch** — far from current state (selectable, labeled)
- No tag — honest next milestone (selectable, no label)

### Maintenance

Not a goal. Declared via intent toggle on Song Detail. Practice Sessions decay algorithm handles recommendations automatically.

---

## Practice Sessions integration notes

### Phase 1 impact (immediate)

The goal creation modal update affects Phase 1 sub-phase 3 steps 4–9 currently in build. The song goal section of the modal must reflect the new vocabulary and granularity design above. Old flat proficiency levels (Learning / Comfortable / Cross-key / Internalized / Maintenance) are replaced.

The `proficiencyDefinitions` seed in Phase 1 sub-phase 1 must be updated to match the new `scope: 'song'` and `scope: 'song_key'` rows above. If sub-phase 1 already ran, a migration patch is needed.

### Phase 3 impact (algorithm — future)

The session generator needs to read song state at the cell level, not just the song level. Block recommendations for songs should be able to target specific section + key combinations. Acquisition stage detection maps onto cells. Weekly cell-level goals flow into block recommendations.

This is a Phase 3 concern — document it now, build it then.

---

## Build sequencing for this redesign

Phase 1.5 — builds after Practice Sessions Phase 1 completes:

1. Schema: 6 new tables + sync registration + `proficiencyDefinitions` seed update
2. Migration: seed existing songs from old proficiency states + section setup flow
3. Matrix UI: keys-as-rows view, inline strips, song-level header
4. Cell interaction modal: attempt logging, mode toggle, consecutive logic
5. Whole-song test modal: Comfortable → Solid gate, deliberate initiation
6. Goal creation modal: update song goal section per design above

Each step commits independently. Phase 3 of Practice Sessions (algorithm) builds after Phase 1.5 complete.

---

## Open questions (remaining)

1. **Dense session clustering in lived-with window.** 7 sessions in 3 days then nothing for 11 days — does that count as 7 toward the gate? Intent is distributed contact. May need "max sessions counted per calendar day" cap. Decision deferred to build time.

2. **Internalized re-achievement after lapse.** Does the lived-with gate re-run from scratch, or does prior history count? Deferred to build time.

3. **Cross-key % denominator — user-declared target scope.** v1 always uses 11 non-original keys. Future: user could declare "I'm targeting 4 keys for this song." Deferred.

4. **Internalized decay emergence.** When a song is Internalized and keys individually lapse via Solid decay, Internalized falls back naturally through the rollup. Verify this logic holds in the implementation — no separate song-level decay field needed.

---

## Connection to design principles

- **Honest metrics, not flattering ones** → cell-level validation tests prevent advancement-by-vibes
- **Time as honest measure of investment** → lived-with gate makes time-with-the-song a real input
- **Decay signals drive recommendations, not automatic demotion** → kindness is in re-engagement surface, not in hiding reality
- **Show the reasoning** → song-level state drills down into the matrix
- **Canonical vocabulary across the app** → proficiencyDefinitions seed rows ripple through Goals, Dashboard, Practice Sessions
- **Schema decisions are expensive to change later** → fully designed before build
- **Decay thresholds reflect consolidation depth** → tunable as learner matures
- **Vocabulary earns its words at the level where the achievement happens** → Comfortable = sections done; Solid = whole song proven; Internalized = multi-key proof over time
- **Two legitimate learning paths** → model supports depth-first and breadth-first without judgment
- **Sections reflect real musical structure** → section changes are musical decisions; model responds honestly
