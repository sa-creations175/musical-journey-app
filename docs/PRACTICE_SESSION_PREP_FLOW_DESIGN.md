# Practice Session Prep Flow & Timing Redesign
## Musical Journey App | May 2026

---

## Problem

Block timers start counting down immediately when a session begins — before the user has read the instructions, found the right key, set their metronome, or gotten into position. This means:

1. Prep time eats into drill time — a 2-minute block becomes 1:45 of actual practice
2. There's no distinction between "time spent practicing" and "time spent navigating/prepping"
3. Session time estimates are inaccurate because they don't account for real overhead
4. The experience feels rushed — the timer is already running before you're ready

---

## Solution Overview

A **Prep → Drill → Rate** flow for every block, with three simultaneous timers that measure different things. Real overhead data feeds back into future session time estimates.

---

## The Three Timers

### 1. Session Timer
- **Always running** from session start to session end
- Counts up — total wall clock time
- Visible in the session header at all times
- Never pauses for any reason

### 2. Block Timer
- **Counts up** from when the prep screen for a block appears
- Measures total block duration: prep + drill + rating
- Resets at the start of each new block
- Stops when the user taps Ready on the next block's prep screen
- This is the "true block duration" — reality, not the estimate
- Over time: "your chord shape blocks average 3m 15s even though they're planned for 2 min"

### 3. Drill Timer
- **Counts down** from the block's planned drill duration
- Only runs during active drilling (not during prep, not during rating)
- If the user adjusts time on the prep screen (+30s / -30s), the drill timer reflects the adjusted duration
- When it hits 0: end chime fires, drill completes
- The user always gets the full planned drill time regardless of how long prep took

---

## Prep → Drill → Rate Flow

### Prep Screen
Shown before each block. Block timer starts here. This is the **only configuration screen** — all settings that previously lived inside the drill modal (BPM, metronome style, timing adjustments) are surfaced here instead.

**Displays:**
- What's coming: block type, specific content, planned duration
  - "Scales · C major + C major pentatonic · 2 min"
  - "Chord shapes · Minor triads · 5 min"
  - "HF Flashcards · 20 cards · 4 min"
- Recommended BPM — editable inline
- Metronome style selector (remembers last-used)
- Metronome on/off toggle
- **Time adjustment**: +1 min / +2 min / +5 min / -30s buttons
- **Ready button** — starts the countdown

**Voice prompt (on arrival):**
"Up next: [block description]. [X] minutes. Get into position and tap ready when you're set."

**Block timer starts** when prep screen appears.
**Drill timer does NOT start** until after the countdown.

### Auto-navigation (Level 3)
On GO, the app navigates directly to the specific drill — not just the module home, but the exact matrix cell, flashcard queue, or drill screen for the block's itemRefs. The drill modal opens pre-configured with the BPM and style set on the prep screen. No additional navigation, no tapping inside the matrix, no re-configuring inside the modal.

The prep screen eliminates all overhead that previously happened inside the drill modal. The drill modal becomes purely the drill.

---

### Countdown
After tapping Ready:
- Visual: 4... 3... 2... 1... GO
- Audio: metronome clicks or chime on each beat
- **End chime** on "GO" — signals drill start
- Drill timer starts counting down on GO

---

### Drill
Active drilling phase. App has auto-navigated directly to the specific drill (Level 3).

- Drill timer counts down visibly in the banner
- Session timer continues counting up
- Block timer continues counting up
- Drill modal is already open on the correct cell/queue, pre-configured with BPM and style from prep screen
- **Warning chime** at 10 seconds remaining
- **End chime** when drill timer hits 0
- Auto-returns to rating screen

---

### Rating Screen
After drill completes. Block timer continues.

**Voice prompt:**
"How did that feel?"

- Flying / Cruising / Crawling (existing rating UI)
- Auto-advances after rating is selected (no extra tap needed)
- 2-second grace delay before auto-advancing

**Extend time option (shown below rating):**
"Want more time on this?"
- +1 min · +2 min · +5 min · Done (move on)

If extended: drill resumes, drill timer resets to chosen amount, block timer continues. Session runs longer — subsequent blocks are NOT compressed. Repeat rating screen after extension ends.

Extend option appears on: flashcard blocks, shapes & patterns drills, repertoire/song drills.
Does NOT appear on: mental visualization, warm-up/intro blocks.

**Voice prompt on advance:**
Brief session status update every 2-3 blocks:
"[X] minutes in. [Y] minutes of practice so far. Next up: [block name]."

---

## Session End Summary

At session end, show in sequence:

### 1. Three-timer breakdown
```
Session time:     47 min
True practice:    34 min  (drill timer total)
Overhead:         13 min  (session - practice)
Efficiency:       72%
```

### 2. Matrix progress review
After the timing summary, show a visual review of the matrices for each module practiced in the session:
- Read-only heat grid for each module (shapes, HF, ET, etc.)
- Cells drilled in this session highlighted with a "practiced today" indicator
- Stage changes called out: "3 new cells acquired · 7 cells reinforced · 2 cells due again tomorrow"
- Tap any cell to see its current spacing state

This closes the loop — you can see what actually changed, not just get a summary number. Over time the matrix becomes a visual record of accumulated progress.

---

## Data Model

### New fields on practiceSession (or a new sessionMetrics table)

```ts
interface SessionTimingData {
  sessionId: string
  totalSessionSeconds: number        // session timer final value
  totalDrillSeconds: number          // drill timer cumulative total
  totalOverheadSeconds: number       // session - drill
  blocks: BlockTimingData[]
}

interface BlockTimingData {
  blockId: string
  moduleRef: string
  plannedSeconds: number             // what was proposed
  adjustedSeconds: number            // after user +/- adjustment
  actualDrillSeconds: number         // how long the drill actually ran
  totalBlockSeconds: number          // block timer final (prep+drill+rating)
  prepSeconds: number                // totalBlock - actualDrill - ratingSeconds
  ratingSeconds: number              // time on rating screen
}
```

### Future use
- `totalBlockSeconds` by `moduleRef` → feeds session proposal time estimates
- `totalOverheadSeconds` / `totalSessionSeconds` → efficiency metric
- `adjustedSeconds` vs `plannedSeconds` → do users consistently need more time on certain block types?

---

## Voice Prompts

All voice prompts are optional (toggleable in settings). When enabled, uses the best available system voice.

### Prompt scripts

**Block intro (prep screen arrival):**
"Up next: [block name]. [duration] minutes. Get into position and tap ready when you're set."

**Countdown:**
"4... 3... 2... 1..."

**Rating request:**
"Quick rating — how did that feel?"

**Session progress (every 2-3 blocks):**
"[X] minutes in. [Y] minutes of practice so far."

**Session end:**
"Session complete. [X] minutes total, [Y] minutes of actual practice. Great work."

---

## Metronome Integration

- Metronome on/off toggle visible on prep screen for each block
- BPM shown and adjustable on prep screen
- Metronome auto-starts on GO (if enabled)
- Metronome auto-stops when drill timer hits 0
- GlobalSessionBanner retains the metronome toggle for mid-session control (already built)

---

## Time Adjustment UX

On the prep screen:
- Default: planned block duration
- **+30s** / **-30s** buttons
- Minimum: 30 seconds (can't go below)
- Maximum: planned duration × 2 (can't more than double a block)
- The adjustment persists for that block only — doesn't change the proposal

---

## Chime System

- **Countdown beats**: 4 soft clicks (can be metronome or a distinct chime)
- **GO**: one clear bell/chime — marks drill start
- **10-second warning**: two quick soft chimes
- **Drill end**: three chimes descending — marks completion
- All chimes respect the device mute switch? TBD — practice use may need to override

---

## Build Sequence

1. **Three-timer infrastructure** — session, block, drill timers; data model for capturing timing ✅ Phase 1 (CC building)
2. **Prep screen** — block preview, BPM/style config, time adjustment, Ready button; block timer starts here
3. **Level 3 auto-navigation** — GO routes directly to specific drill screen (matrix cell, flashcard queue, etc.), opens pre-configured
4. **Countdown + chimes** — 4-3-2-1-GO with audio; drill timer starts on GO; auto-starts metronome
5. **Drill timer + rating auto-advance** — global drill countdown in banner; warning chime at 10s; end chime → auto-return to rating; auto-advance after rating
6. **Extend time option** — +1/+2/+5 min on rating screen for flashcard/shapes/repertoire blocks
7. **Voice prompts** — toggleable, best system voice; scripts for intro/rating/progress/end
8. **Session end — timing summary** — three-timer breakdown, efficiency %
9. **Session end — matrix progress review** — heat grid for each module practiced, stage changes highlighted, "practiced today" indicators
10. **Overhead learning** — feed real block timing data back into session proposal estimates (Phase 4, deferred)

---

## What This Fixes

- Practice time is fully protected — you always get the full planned drill duration
- Overhead is measured and visible — you know exactly how much time goes to transitions
- Session estimates become more accurate over time as real block durations are recorded
- The experience feels coached rather than rushed — there's intentional space for prep
- The metronome is always accessible and context-aware (auto-starts/stops with drills)
