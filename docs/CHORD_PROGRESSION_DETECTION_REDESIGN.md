# Chord Progression Detection Redesign
## Musical Journey App | May 2026

---

## Problem

The current detection system is broken in three ways:

1. **Quality-blind** — strips chord quality before matching, so `1dom9(13)` and `1maj7` are treated identically. "The floating Lydian" fires on a dominant tonic, which has nothing to do with Lydian.

2. **Single-chord patterns** — several catalog entries are just `['I']`. These are not progressions. They produce meaningless, noisy detections.

3. **Opaque names** — names like "The floating Lydian" or "The gospel walk-up" are only meaningful to someone who already knows jazz theory. The user can't verify whether the detection is correct without looking it up.

---

## Solution

Replace the name-forward detection system with a **pattern-recognition + numeral display** system:

- Show the user the actual numeral sequence of the section's chords
- Highlight subsequences that match known structural patterns
- No nicknames — just structural facts
- The user makes their own associations and meanings

---

## Pattern Catalog (Simplified)

Replace the ~60 catalog entries with ~10 focused, musically meaningful multi-chord patterns. All patterns require ≥2 chords.

| Pattern ID | Numerals | Description |
|------------|----------|-------------|
| `ii-V-I` | II V I | Jazz/gospel ii-V-I resolution |
| `V-I` | V I | Basic dominant resolution |
| `V-I-IV` | V I IV | Gospel dominant resolution with subdominant move |
| `I-IV` | I IV | Tonic to subdominant |
| `I-V-vi-IV` | I V vi IV | Pop loop (any rotation) |
| `walk-up` | I II III IV | Diatonic ascending bass walk |
| `walk-down` | I VII vi V | Diatonic descending bass walk |
| `IV-V-I` | IV V I | Subdominant to dominant resolution |
| `I-vi-IV-V` | I vi IV V | Classic doo-wop / circle progression |

---

## Quality Matching — Flexible

Match on **root motion** (scale degree), not strict quality. When a chord deviates from the expected diatonic quality, note it but don't exclude the match.

**Examples:**
- `5m7 → 1dom9(13) → 4maj7` = V-I-IV match (5 is minor instead of dominant — noted)
- `2m7 → 5dom7 → 1maj7` = ii-V-I exact match
- `2dom7 → 5dom7 → 1maj7` = ii-V-I match (2 is dominant instead of minor — noted)

This ensures real patterns in real songs aren't missed just because they deviate from textbook voicings. The note about quality deviation is informational, not a rejection.

---

## Detection Algorithm Changes

### 1. Root-motion matching (keep)
Continue mapping chords to scale degrees (I, II, III, etc.) for pattern matching. Keep case sensitivity (I = major-ish tonic, i = minor tonic) but make quality deviations informational rather than blocking.

### 2. Minimum pattern length: 2 chords
Remove all single-chord entries from the catalog. Every detected pattern must be at least 2 chords.

### 3. Passing chord filtering
Before detection, optionally strip chords that are:
- Only 1 beat long
- Occur between two chords of the same root (clear passing motion)

This gives the harmonic skeleton view.

### 4. Rotation awareness
For loop patterns (I-V-vi-IV), detect any rotation of the cycle. A section starting on vi-IV-I-V is the same loop, different entry point.

---

## UI Redesign

### Numeral strip
Show the full chord sequence as scale degrees at the top of the detected section:

```
IV · III · vi · v · I · v
```

This is always visible regardless of whether any patterns were detected.

### Pattern highlights
Below the numeral strip, list detected patterns with their position:

```
V → I     at bars 2–3
V → I → IV  at bars 3–5 (note: V is minor)
```

No nicknames. Just the pattern numerals and where it appears.

### Foundation view (toggle)
A small toggle: "Full / Foundation".

Foundation mode reveals the harmonic skeleton by visually fading harmonically-tagged chords (secondary_dominant, secondary_ii, borrowed, passing). These are the chords already identified by the existing harmonic tagging system with dashed borders.

**Critical: bars and beat positions are preserved.** A secondary dominant that occupied beat 1 of bar 2 still shows as an occupied beat — it renders as a faint/ghosted placeholder rather than disappearing. The timing grid is never disrupted. Only the chord content is de-emphasized, not the structure.

**Example — "I Want You Around":**
- Full view: IV · III(sec.dom) · vi · v(sec.ii) · I(sec.dom) · v(sec.ii)
- Foundation view: IV · [ghost] · vi · [ghost] · [ghost] · [ghost]
- Reading: 4 and 6 alternating — the true harmonic loop

This works because the harmonic tagging system (step 4 of the lead sheet redesign) already identifies these chords. Foundation mode just visually suppresses them. No new detection needed.

### Cross-song pattern tracking (future)
Once multiple songs have detection data, the app can surface: "This V-I-IV motion appears in 4 of your 8 songs." Deferred until there are enough songs to make this meaningful.

---

## What Gets Removed

- All ~60 catalog entries replaced with ~10 focused patterns
- All nickname display — no "The floating Lydian", no "The gospel walk-up"
- Single-chord pattern entries deleted
- The "Add to ET practice" affordance on detected tags stays — but the tag now shows the pattern numerals (e.g. "V → I → IV") not a name

---

## Build Sequence

1. **Simplify catalog** — replace with 10-pattern catalog, add rotation support, minimum 2 chords
2. **Fix quality matching** — flexible root-motion matching with quality deviation notes  
3. **Redesign detection UI** — numeral strip + pattern highlights, remove nicknames
4. **Foundation view** — passing chord filter + skeleton toggle
5. **Cross-song tracking** — deferred

---

## What This Enables Long-Term

As you add more songs to your repertoire with lead sheets, the detection system builds a picture of which harmonic patterns appear across your real music. You start to see: "every song I love has a V-I-IV somewhere." The app surfaces the structural fact; you make the musical connection.
