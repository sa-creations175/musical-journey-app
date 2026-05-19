# Lead Sheet Redesign — Design Document
## Musical Journey App | May 2026

---

## Problem

The current lead sheet is text-based — chord names positioned sequentially alongside lyrics with small beat markers. It doesn't communicate chord duration, measure structure, or rhythmic feel visually. Reading it while playing requires too much mental parsing.

---

## Solution Overview

Replace the current lead sheet with a **measure grid view** — the single, canonical way to view and edit a song's chord/lyric structure. Each section renders as a fixed-width bar grid with lyrics flowing freely below.

---

## Visual Layout

### Bar Grid
- **4 bars per row** (standard), wrapping to the next row naturally
- Each bar is a fixed-width box with a bar number in the top-left corner
- Chords inside each bar are **proportional to their beat count** — a chord lasting 2 beats takes half the bar width, 4 beats fills the full bar
- Bar boxes have a visible border so measure boundaries are always clear

### Chord Boxes
- Chord name at top (Nashville number notation, same as today)
- Beat dots below the name — one dot per beat (e.g. `· · · ·` for 4 beats)
- Color coded by scale degree for visual pattern recognition across songs
- Small font to fit even complex chord names (e.g. `1dom9(13)`) without abbreviation

### Lyrics
- Lyrics are a **separate line below each phrase group** — not confined to bar boxes
- Lyrics flow freely as prose, anchored to beat positions but visually decoupled from bar boundaries
- This correctly handles anacrusis (pickup notes) and lyrics that start before the downbeat

### Time Signature
- Displayed on each section header (e.g. `4/4`)
- Defaults to the song-level time signature
- Can be overridden per section for songs with mid-song time signature changes
- Drives bar structure — determines how many beats constitute a full bar

---

## Data Model Changes

### New fields needed

**On `LeadSheetChord` (or equivalent chord cell):**
```ts
beats: number           // how many beats this chord occupies, default 1
harmonicTag?: string    // 'secondary_dominant' | 'borrowed' | 'passing' | 'pedal' | string (custom)
```

**On `LeadSheetSection`:**
```ts
timeSignature?: string  // e.g. '4/4', '6/8', '3/4' — overrides song-level if set
```

**On `Song`:**
```ts
timeSignature?: string  // song-level default, e.g. '4/4'
```
(Currently stored as `time` field — may already exist, verify schema)

**On `SongSection` (lyrics):**
```ts
lyricLines?: LyricLine[]
```

**New `LyricLine` type:**
```ts
interface LyricLine {
  id: string
  words: string[]
  startBar: number      // 0-indexed bar in section
  startBeat: number     // 0-indexed beat within bar
  endBar: number
  endBeat: number
  wordOffsets?: number[] // per-word beat offset from auto-distributed position
}
```

---

## Editing Model

### Adding and managing bars
- Each section has an **+ Add bar** button at the end of the grid
- Bars can be deleted (× on hover) — prompts if the bar contains chords or lyrics
- Bars can be reordered via drag

### Adding chords to a bar
- Tap inside an empty bar → chord picker opens
- Select chord, set beat count (1–time signature numerator)
- Multiple chords in one bar: tap the remaining space to add another chord
- Chord beat count is adjustable by dragging the chord box edge to resize

### Lyrics editing — lyric line model

Lyrics are placed as **lines**, not individual words. A lyric line is a group of words that span a defined range of beats in the bar grid.

**The flow:**
1. Paste a line of lyrics into the text area below the chord grid
2. A lyric line strip appears showing all the words
3. Drag a **start marker** to set which beat the line begins on
4. Drag an **end marker** to set which beat the line ends on
5. Words auto-distribute evenly across the range
6. Nudge individual words left or right within the bounds to fine-tune timing

**Adjustments:**
- Moving the start or end marker rescales the whole line (words re-distribute)
- Dragging an individual word left/right shifts it within the bounds
- Words cannot be moved outside the start/end range without moving the markers
- Paste multiple lines for multiple phrases — each becomes its own independent lyric line

**Syllable splitting:**
- A word can be split into syllables (e.g. "some-thin'" → "some" + "thin'")
- Tap a word → split affordance appears
- Each syllable becomes its own token that can be nudged independently within the line's bounds

**Data model — LyricLine:**
```ts
interface LyricLine {
  id: string
  words: string[]                    // original words in order
  startBar: number                   // 0-indexed bar in section
  startBeat: number                  // 0-indexed beat within bar
  endBar: number
  endBeat: number
  wordOffsets?: number[]             // per-word beat offset from auto-distributed position
}
```

Note: This replaces the original per-word LyricToken model. SongSection stores `lyricLines?: LyricLine[]` instead of `lyricTokens?: LyricToken[]`.

### Beat snapping
- Start and end markers snap to beat positions
- Individual word nudges snap to beat positions
- Visual snap indicator on drag

---

## Time Signature Tracking

### Per-song
- Time signature stored on the Song record
- Shown in the song header (`key: B · tempo: 85 · time: 4/4`)
- Editable from song settings

### Per-section override
- Section header shows the time signature with an edit affordance
- If a section's time sig differs from the song default, it's shown with a visual indicator
- Changing a section's time sig re-renders that section's bar grid accordingly

### Future — time signature analytics
- Track time signatures across all songs in the repertoire
- Surface patterns: "6 of your 8 songs are in 4/4 · 2 are in 6/8"
- Filter/sort repertoire by time signature
- This data becomes available automatically as songs get time signatures added

---

## Color System

Chord boxes are colored by **scale degree** — consistent across all songs so patterns become visually recognizable over time. A 4maj7 in one song uses the same color as a 4maj7 in another.

### Color mapping by harmonic function

Each scale degree gets its own distinct color. Degrees in the same harmonic function family share a color ramp (similar hue, different shade) so the grouping is visible at a glance.

| Degree | Family | Color |
|--------|--------|-------|
| 1 | Tonic | Teal 600 (darkest) |
| 3 | Tonic | Teal 400 (mid) |
| 6 | Tonic | Teal 200 (lightest) |
| 4 | Subdominant | Purple 600 |
| 2 | Subdominant | Purple 400 |
| 5 | Dominant | Amber 600 |
| 7 | Dominant | Amber 400 |

### Harmonic tagging

Each chord cell can carry an optional harmonic tag that signals behavior outside the diatonic norm. Tags are consistent across all songs — a "secondary dominant" tag in one song looks the same as in another.

**Available tags:**
- **Secondary dominant** — chord acts as V of the next chord (not diatonic V)
- **Borrowed/modal mixture** — chord borrowed from a parallel mode
- **Passing chord** — chromatic connective tissue between two chords
- **Pedal point** — chord sustained over a moving bass line
- **Custom** — free label for anything else

**Visual treatment:** Tagged chords retain their degree color but get a dashed border overlay, making them visually distinct from diatonic chords without losing degree identity.

### Auto-detection rule

The app auto-detects secondary dominants on first pass using this rule:
- Chord has a dominant quality (dom7, dom9, dom13, 7, 9, 13 — anything with a b7)
- AND the scale degree is not the diatonic V (5)
- → Automatically tagged as secondary dominant

Expected accuracy: ~85–90% for gospel/R&B/soul repertoire. Manual override available for edge cases.

### Manual formatting

Tap a chord cell → formatting sheet appears → one-tap to apply or remove a harmonic tag. Tags apply to that chord cell instance in this lead sheet arrangement. Tag changes propagate to the bar grid visual immediately.

---

## Migration

The existing lead sheet data (chord cells, lyrics, sections) maps to the new model:
- Existing chords default to `beats: 1` — will look uniform until the user adds beat counts
- Existing lyrics attach to bar 0, beat 0 until repositioned
- No data loss — the redesign is additive

Users will need to manually add beat counts to existing chord data for the proportional layout to be meaningful. This is expected — it's a one-time enrichment per song.

---

## Chord Progression → ET Connection

The lead sheet is the natural source of truth for chord progressions discovered through repertoire. This creates a direct pipeline from song learning into the ET chord progressions drill module.

### The flow

1. **Detection (already exists)** — the lead sheet already detects progressions in sections (e.g. "The floating Lydian", "Funk 1-chord vamp"). These tags appear below each section.

2. **Add to ET catalog (new)** — a detected or manually identified progression can be flagged from the lead sheet and added to the ET chord progressions catalog. This is the primary way the catalog gets populated with personally meaningful progressions — discovered organically through songs you're actually learning.

3. **Surfaces in chord progression quiz** — once added to the ET catalog, the progression becomes available in the chord progression quiz activity during sessions. The quiz asks you to identify or recall the progression by ear.

4. **Surfaces in ET chord progressions drill** — the progression also enters the ET chord progressions drill module, where it gets spaced repetition treatment alongside other ET content.

### Design intent

The chord progressions catalog has historically been populated with pre-built content that lacks personal connection. The lead sheet → ET pipeline is the correct long-term solution: you discover a progression you love in a song you're learning, add it to your practice, and it gets reinforced through structured drill. The catalog grows organically from real repertoire.

### What this requires

- A "Add to ET practice" affordance on detected progression tags in the lead sheet section footer
- A confirmation step showing the progression pattern and letting the user label it (optional)
- The ET catalog add flow (already partially designed — see ET curation design)
- No changes to the ET drill or quiz mechanics — they already handle catalog items generically

### Status

Design ready. Build deferred until after the lead sheet bar grid is complete (steps 1–7). This is step 9 in the build sequence.

---

## What Is Not Being Built

- **Staff notation** — no musical staff, no note values, no traditional notation
- **Strumming patterns** — rhythm pattern notation deferred to a future design
- **Auto-detect beat counts** — beat counts are entered manually, not inferred from audio
- **Export to PDF/image** — deferred
- **Plain text view toggle** — the bar grid replaces the text view entirely; no toggle

---

## Build Sequence (suggested)

1. **Schema changes** — add `beats`, `harmonicTag` to chord cells, `timeSignature` to sections and songs ✅ Done
2. **Bar grid renderer** — render existing chord data as fixed-width bar grid with degree-based colors ✅ Done
3. **Beat count editing + drag reorder** — tap chord to set beat count, drag to reorder ✅ Done
4. **Harmonic tagging** — auto-detect secondary dominants/borrowed/secondary ii, manual tag override, dashed border ✅ Done
5. **Lyric staging area** — paste text, get word chips in staging area ✅ Done (will be partially replaced by step 6)
6. **Lyric line placement** — paste a line, set start/end beat markers, words auto-distribute, nudge individual words
7. **Syllable splitting** — split a word into syllables within a lyric line
8. **Per-section time signature** — override time sig per section, section header edit
9. **Lead sheet → ET pipeline** — "Add to ET practice" affordance on detected progressions
10. **Time signature analytics** — deferred
