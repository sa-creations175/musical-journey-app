# Practice Sessions Phase 1 — Song Goal Modal Addendum

This document updates the goal creation modal spec for songs only. Paste alongside the existing Phase 1 build prompt when resuming sub-phase 3 steps 4–9. Everything else in the Phase 1 spec is unchanged.

---

## What changed

The Song Progression Redesign (April 26, 2026) changed the song proficiency vocabulary and goal targeting model. The goal creation modal must reflect these changes before Phase 1 ships.

---

## `proficiencyDefinitions` seed correction

If sub-phase 1 already ran, apply a migration patch to update the song-scope rows.

Replace existing `scope: 'song'` rows with:

| display_order | level | short_label | description |
|---|---|---|---|
| 1 | learning | Just getting started | Working through sections in the original key — not yet comfortable with all of them |
| 2 | comfortable | Sections under your fingers | Every section of the original key feels comfortable individually |
| 3 | solid | Proven end-to-end | Played the whole song through cleanly, multiple times, at tempo, in the original key |
| 4 | cross_key | Taking it further | Extending the song into new keys beyond the original |
| 5 | internalized | Truly yours | Solid across multiple keys, and lived with long enough that it plays from somewhere deeper than memory |

Add new `scope: 'song_key'` rows:

| display_order | level | short_label | description |
|---|---|---|---|
| 1 | learning | Working on it | Some sections are comfortable, others still being built |
| 2 | comfortable | Sections done | Every section in this key is comfortable individually |
| 3 | solid | Whole song proven | Played the full song through cleanly, 3 times in a row, at tempo, in this key |

**No Maintenance row** for song or song_key scope — Maintenance is a user-declared intent, not a proficiency level.

---

## Goal creation modal — song goal section

When the user is creating a goal and selects a song as the related item, the goal targeting UI must reflect the following design. This replaces any previous flat proficiency-level dropdown for songs.

### Granularity selector (3 buttons, left to right)

**Whole song** | **Song section** | **Key**

- "Song section" is dimmed and shows a tooltip "Only available for weekly goals" for non-weekly timeframes
- Default selection: Whole song

### Whole song targets (when Whole song selected)

Show 3 options as selectable rows, in this order:

1. **Solid in original key**
   - Hint: "Prove the whole song end-to-end in [original key]"
   - No tag for most songs (honest next milestone)
   - Tagged "achieved" and unselectable if song is already at Solid or beyond

2. **Cross-key %**
   - Hint: "Reach a target % of sections comfortable across non-original keys"
   - Tagged "current" if song is already Cross-key — but still selectable (user can target a higher %)
   - On selection: reveals a % slider (min 20%, max 100%, step 5%)
   - Tagged "achieved" and unselectable only if Cross-key % is at 100%

3. **Internalized**
   - Hint: "3+ keys at Solid + lived-with gate satisfied"
   - Tagged "stretch" when far from current state
   - Always selectable

State tags:
- **achieved** → grey badge, row unselectable
- **current** → green badge, row selectable (Cross-key % case)
- **stretch** → purple badge, row selectable
- No tag → selectable, honest next milestone

### Key targets (when Key selected)

Single option: "Get a key to a specific state"
- Key picker dropdown (all 12 major keys)
- State toggle below: **Comfortable** | **Solid**

### Song section targets (when Song section selected, weekly only)

Single option: "Get a section Comfortable"
- Section picker dropdown (sections defined for that song)
- Key picker dropdown (all 12 major keys)

### Goal preview

Always show a natural-language preview of the goal at the bottom of the modal before the Add button:
- "Take [Song] to Solid in [original key]"
- "Take [Song] to Cross-key [X]%"
- "Take [Song] to Internalized"
- "Get [Song] Comfortable in [Key]"
- "Get [Song] Solid in [Key]"
- "Get the [Section] of [Song] Comfortable in [Key]"

Add button disabled until a target is selected.

### Maintenance

Maintenance is NOT a goal target. Do not include it in the goal creation modal for songs. It is declared via a separate intent toggle on the Song Detail view (not built in Phase 1 — deferred to Phase 1.5).

---

## No other Phase 1 changes

All other Phase 1 sub-phases, schema tables, and build specs are unchanged. This addendum affects only:
- `proficiencyDefinitions` seed (song and song_key scope rows)
- Goal creation modal song-goal section

Everything else proceeds per the existing Phase 1 build spec in `PRACTICE_SESSIONS_DESIGN_3.md`.
