# Lead Sheet Play Mode — Design Document
## Musical Journey App | May 2026

---

## Problem

The lead sheet in edit mode is optimized for building and editing chord charts.
When you're actually sitting at the piano playing through a song, all the editing
chrome — stage pickers, arrangement controls, hide/delete buttons, numerals,
patterns, empty beat slots — creates visual noise that breaks the chord flow
from section to section. You can't easily scan from the end of the Chorus into
the start of Verse 1 without your eye catching on controls that aren't relevant
to playing.

Additionally, drag-and-drop section reordering doesn't work well on mobile and
causes accidental drags when trying to tap chords. This needs to be replaced
with an explicit reorder mode.

---

## Two Features

### 1. Play Mode
A stripped-down view of the lead sheet optimized for playing through the song.
All editing chrome disappears. Only the chord flow remains.

### 2. Reorder Mode (replaces drag-and-drop)
An explicit mode for reordering sections. Entered via a dedicated button.
Each section shows up/down arrows. Exit when done.

---

## Play Mode Design

### Trigger
A **"play"** button in the LEAD SHEET header row, alongside the existing
"notation:" picker and "+ add section". Same visual weight as "edit" on the
song header card — plain text button, no icon needed.

Tapping "play" enters play mode. A small **"exit"** button (or "editing") in
the same position exits back to normal mode. No modal, no confirmation — instant
toggle.

Play mode state is **not persisted** — closing and reopening the song always
returns to normal edit mode.

### What disappears in play mode

**Per-section chrome:**
- Stage picker (Learning / Comfortable dropdown)
- Stage badge (LEARNING pill)
- Arrangement selector (ARRANGEMENT: Basic ▾)
- rename / duplicate / + new arrangement links
- ↑ ↓ hide delete buttons
- BAR GRID label and bar count / time signature header
- Undo/redo arrows on bar grid

**Per-section content:**
- NUMERALS row
- PATTERNS row
- Section notes (▸ section notes)
- + Add lyrics
- + bar button
- Empty beat slots — completely invisible (no dashed border, no space taken).
  Only occupied chord slots render.

**Lead sheet header:**
- notation picker hides
- + add section hides
- play button becomes "exit" (or "editing")

### What stays in play mode

- Song header card (title, artist, key, tempo) — stays, read-only
- Section name (Chorus, Verse 1, Bridge, etc.) — stays as a small dim label
  above each section's chord grid. Just the name, nothing else.
- The chord grid itself — all occupied chord slots, full color, fully readable
- Voicing popover — tapping a chord still opens the voicing carousel. This is
  intentional: you may want to check or browse voicings while playing.
- Lyrics (if present) — stays, since they're part of playing through the song

### Visual treatment in play mode

Sections flow with minimal vertical gap between them — just enough to read the
section name label. The chord grids feel continuous, like reading a real lead
sheet top to bottom.

Empty beat slots render as nothing — no box, no dashed border. The occupied
slots fill the bar proportionally based on their beat duration. This makes bars
with passing chords on beat 3 or 6 display correctly without a sea of empty
dashed boxes.

The section name label: small, muted (text-dim color), positioned above the
grid. Something like `Chorus` in 12px muted text — enough to orient you without
dominating.

---

## Reorder Mode Design (replaces drag-and-drop)

### Remove
- The ≡ drag handle on each section card
- Drag-and-drop section reordering entirely

### Add
A **"reorder"** link or button in the LEAD SHEET header (alongside "+ add
section"). Small, unobtrusive.

Tapping "reorder" enters reorder mode:
- Each section card shows a **↑** and **↓** button (large enough to tap on
  mobile — 44px touch target)
- The ↑ on the first section and ↓ on the last section are disabled (greyed)
- Tapping ↑ or ↓ immediately moves the section and re-renders the list
- A **"done"** button in the header exits reorder mode
- All other editing controls remain visible during reorder mode (it's additive,
  not a stripped view)

Reorder mode and play mode are mutually exclusive — entering one exits the other.

---

## Build Sequence

### Step 1 — Remove drag-and-drop, add reorder mode
- Remove ≡ drag handles from section cards
- Remove dnd-kit drag logic from LeadSheetSection / LeadSheet container
- Add reorder mode state + "reorder" / "done" toggle in lead sheet header
- Add ↑ ↓ buttons to each section card in reorder mode
- Wire ↑ ↓ to existing section order logic (same as existing ↑ ↓ buttons
  on section cards — these may already exist and just need to be surfaced
  in reorder mode)
- Tests: reorder mode toggle, up/down mutations, boundary conditions

### Step 2 — Play mode
- Add play mode state to lead sheet
- Add "play" / "exit" toggle button in lead sheet header
- Conditionally hide all chrome listed above when in play mode
- Hide empty beat slots in play mode (render nothing for unoccupied positions)
- Section name label: small, muted, above each grid
- Ensure voicing popover still works in play mode
- Tests: play mode toggle, chrome hidden correctly, voicing popover accessible

### Step 3 — Mobile voicing popover polish
The voicing carousel popover is currently too large for mobile screens.
- Audit the popover dimensions on mobile
- Reduce height, make it sheet-like from the bottom or constrain to viewport
- Ensure the piano keyboard and carousel controls are usable at 390px
- This is a separate step since it doesn't depend on play mode

---

## Not In Scope

- Play mode persistence across sessions (always resets to edit mode on open)
- Autoscroll during play mode
- Any playback or audio features in play mode
- Hiding sections marked as "hidden" (existing hide behavior unchanged)

---

## Connection to Design Principles

- **Minimize real-time thinking during practice** — play mode removes all
  decisions and noise so you can focus on the music, not the interface
- **"Play" not "read"** — the name signals intent: this is the mode you use
  when you're at the piano, not when you're studying
