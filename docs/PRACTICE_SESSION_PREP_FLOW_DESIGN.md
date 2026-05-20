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
Shown before each block. Block timer starts here.

**Displays:**
- What's coming: block type, specific content, planned duration
  - "Scales · C major + C major pentatonic · 2 min"
  - "Chord shapes · Minor triads · 5 min"
  - "HF Flashcards · 20 cards · 4 min"
- Recommended BPM (for timed drills)
- Metronome on/off toggle
- **Time adjustment**: +30s / -30s buttons to modify the drill duration before starting
- **Ready button** — starts the countdown

**Voice prompt (on arrival):**
"Up next: [block description]. [X] minutes. Get into position and tap ready when you're set."

**Block timer starts** when prep screen appears.
**Drill timer does NOT start** until after the countdown.

---

### Countdown
After tapping Ready:
- Visual: 4... 3... 2... 1... GO
- Audio: metronome clicks or chime on each beat
- **End chime** on "GO" — signals drill start
- Drill timer starts counting down on GO

---

### Drill
Active drilling phase.

- Drill timer counts down visibly
- Session timer continues counting up
- Block timer continues counting up
- **Warning chime** at 10 seconds remaining
- **End chime** when drill timer hits 0
- Drill modal/interface appears as it does today

---

### Rating Screen
After drill completes. Block timer continues.

**Voice prompt:**
"How did that feel?"

- Flying / Cruising / Crawling (existing rating UI)
- Auto-advances after rating is selected (no extra tap needed)
- Optional: 2-second delay before advancing so the tap doesn't accidentally trigger the next prep screen

**Voice prompt on advance:**
Brief session status update every 2-3 blocks:
"[X] minutes in. [Y] minutes of practice so far. Next up: [block name]."

---

## Session End Summary

At session end, show the three-timer breakdown:

```
Session time:     47 min
True practice:    34 min  (drill timer total)
Overhead:         13 min  (session - practice)
Efficiency:       72%
```

Over multiple sessions, the app tracks:
- Average overhead per block type
- Average block duration (planned vs actual)
- Efficiency trend over time

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

1. **Three-timer infrastructure** — session, block, drill timers running simultaneously; data model for capturing timing data
2. **Prep screen** — block preview, time adjustment, Ready button; block timer starts here
3. **Countdown + chimes** — 4-3-2-1 with audio; drill timer starts on GO
4. **Rating screen auto-advance** — auto-advance after rating, no extra tap
5. **Voice prompts** — toggleable, uses best system voice; scripts for intro/rating/progress/end
6. **Session end summary** — three-timer breakdown, efficiency display
7. **Overhead learning** — feed block timing data back into session proposal estimates (Phase 4 / deferred until data accumulates)

---

## What This Fixes

- Practice time is fully protected — you always get the full planned drill duration
- Overhead is measured and visible — you know exactly how much time goes to transitions
- Session estimates become more accurate over time as real block durations are recorded
- The experience feels coached rather than rushed — there's intentional space for prep
- The metronome is always accessible and context-aware (auto-starts/stops with drills)
