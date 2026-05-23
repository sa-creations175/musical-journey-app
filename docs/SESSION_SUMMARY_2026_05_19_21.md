# Session Summary — May 19–21, 2026
## Musical Journey App

---

## Session Overview

Three days of work spanning lead sheet completion, voicing feature, chord progression detection redesign, and a major practice session prep flow build (phases 1–3 plus extensive polish).

---

## Lead Sheet Redesign — Completed

### Steps completed this session:
- **Step 7** — Syllable splitting (splitWord/joinWords helpers, character strip popover)
- **Step 8** — Per-section time signature override (picker in bar grid header, * indicator)
- **Step 9** — Lead sheet → ET pipeline (+ button on detected progressions, addedFromRepertoire flag)
- **New chord add** — tap empty beat slot → ChordAddPopover with Nashville notation input
- **Legacy phrase editor removed** — bar grid is now the canonical chord editor
- **Chord delete** — delete button in chord editor popover
- **Copy/paste chord** — copy from popover, paste button appears on empty beat slots
- **Duplicate React key fix** — detected progressions deduped with index suffix
- **Multi-level undo/redo** — 20-step stack, ↩/↪ in bar grid header, full-record snapshot via db.put()
- **Beat count fix** — popover was reading stale cell.chord.beats instead of live cell.beats
- **sectionRef pattern** — stale closure fix for all async handlers in LeadSheetSection
- **cascadeChordPlacements** — pushes overlapping chords forward when beat count expands

---

## Piano Voicing Feature

Full piano voicing display on chord editor popover:

- **PianoKeyboard.tsx** — 3-octave SVG, editable mode with L/R hand toggle
- **Chord-degree interval coloring** — each key colored by its interval from chord root:
  - Root: deep green · Maj 3rd: light green · Min 3rd: teal · 5th: gray
  - Maj 7th: light amber · Dom/Min 7th: deep amber · 4th/11th: purple
  - 6th/13th: bright blue · b6/#5: deep blue · 9th/add2: pink
  - b2/b9: red · tritone: red · everything else: neutral gray
- **L/R hand distinction** — opacity (R=1.0, L=0.65) of interval color
- **Octave-aware offsets** — 0–35 (3 octaves × 12), each octave independently selectable
- **VoicingEntry schema** — `{offset: number, hand: 'L'|'R'}[]` on ChordPlacement
- **voicingHelpers.ts** — intervalColor(), normalizeVoicing(), chordRootNote(), notesFromVoicing()
- **Session-allocated subtitle** — ScalesDrillModal shows "~Xs in this session" when launched from runner

---

## Chord Progression Detection Redesign

- **New detectionPatterns.ts** — 9 focused patterns (≥2 chords), separate from ET catalog
- **Rewritten progressionDetection.ts** — flexible root-motion matching, effectiveHarmonicTag drives secondary dominant exclusion, rotation-aware for I-V-vi-IV loop
- **Detection reads bar grid** — post-migration chords correctly detected (was reading phrases)
- **Numeral strip** — shows full chord sequence as scale degrees (IV · III · vi · v · I · v)
- **Pattern highlights** — shows matched patterns with bar positions, no nicknames
- **Foundation view toggle** — Full/Foundation in bar grid header, ghosts harmonically-tagged chords while preserving bar structure
- **ET catalog.ts untouched** — 45 importers unaffected

---

## Practice Session Prep Flow

### Design decisions locked:
- **Three timers**: Session (always running) · Block (counts up from prep) · Drill (counts down during drilling only)
- **Level 3 auto-navigation**: GO routes directly to specific drill screen, pre-configured
- **D1**: Prep + countdown on session screen, drill in module with global drill timer in banner
- **D2**: Pause suspends all three timers; existing active-time machinery preserved; new per-block timing fields added
- **D3**: blockPhase lives in reducer state (prep/drill/rating) for navigation survival and persistence

### Phase 1 — Three-timer infrastructure ✅
- BlockPhase type, begin-prep/start-drill/complete-drill/adjust-drill-time actions
- getTimes() returns drillElapsedMs, drillRemainingMs, blockPhaseActiveMs
- PracticeBlock extended: prepSeconds, actualDrillSeconds, ratingSeconds, adjustedDrillSeconds, totalBlockSeconds
- PracticeSession extended: totalDrillSeconds, totalOverheadSeconds
- Dexie v25

### Phase 2 — Prep screen + drill-timer countdown ✅
- Session starts at prep screen (not module arrival)
- Drill timer is the single countdown source (running view + banner)
- MetronomeControl embedded on prep screen
- +30s/+1/+2/+5/-30s adjustment pills
- Ready → start-drill

### Phase 3 — Level 3 auto-navigation for scales ✅
- GO opens InSessionDrillRunner over session screen
- Each scale itemRef opened in breakdown order with session-allocated seconds
- BPM/style from prep screen auto-starts metronome
- inSessionDrillActive flag prevents BlockExpiryModal from cutting runner short
- Scale ordering: Major → Major Pentatonic → Natural Minor → Minor Pentatonic per key (paired)
- Key order still spacing-driven

### Session persistence ✅
- ActiveSessionDraft table (Dexie v24) — full SessionState snapshot
- Timestamp-derived rebasing on resume (offline time excluded)
- ResumeSessionGate: "Resume your session?" prompt on reload
- 5s heartbeat for crash recovery
- Draft cleared on normal session end

### Extend time ✅
- Block-level rating screen: +30s/+1/+2/+5 min (absolute re-drill lengths)
- Per-item scale rating: same extend pills, re-drills current scale in place
- Block-level: "Go back to drills" button re-opens runner from beginning
- Session runs longer when extended — subsequent blocks not compressed

### Scale drill polish ✅
- Skip → "Next scale" label
- Redo button — restarts same scale item
- Cancel on extend runner path shows "Next scale" correctly
- 60s minimum per scale at generation level (prep card = runner = banner)
- plannedSeconds = sum of floored item seconds (banner matches prep card)

### Metronome fixes ✅
- forceStop() added to singleton — fires when session ends
- Silent metronome root cause: nextNoteTime falling behind ctx.currentTime; re-anchor fix in scheduler
- Metronome style persisted via eager hydration on singleton creation
- Compact metronome toggle added to GlobalSessionBanner (always visible during session)
- All [metro] debug logging stripped

### Retired BlockExpiryModal for prep-flow sessions ✅
- Drill hits 0 → straight to rating screen
- Rating screen waits for explicit tap (no auto-advance)
- Modal kept for other origins (shapes-drill standalone)

---

## Outstanding / Next Build Steps

### Prep flow remaining phases:
- **Phase 4** — Countdown + chimes (4-3-2-1-GO with audio)
- **Phase 5** — Drill timer in banner for non-scales blocks; auto-return to rating
- **Phase 6** — Level 3 auto-navigation for chord shapes, HF, ET, repertoire (scales done, others still manual)
- **Phase 7** — Voice prompts (toggleable)
- **Phase 8** — Session end timing summary (three-timer breakdown, efficiency %)
- **Phase 9** — Matrix progress review (heat grid of what changed this session)
- **Phase 10** — Overhead learning (deferred)

### Other outstanding:
- devWipe.ts + Goals.tsx import — uncommitted local dev tools (DO NOT COMMIT)
- ChordFunction.beats dead weight on bar-anchored placements (cleanup deferred)
- Chord progression detection redesign doc saved to outputs/
- Piano voicing chord-degree color system finalized (interval color map in voicingHelpers.ts)

---

## Test Count
2527 passing

---

## Starter Prompts

### Claude Chat — next session
```
Continue Musical Journey App. Read SESSION_SUMMARY_2026_05_19_21.md.

Scales prep flow (phases 1-3) is working well in live testing. Next priorities:
1. Phase 4: countdown + chimes (4-3-2-1-GO)
2. Phase 5: drill timer in banner + auto-return to rating for non-scales blocks
3. Phase 6: Level 3 auto-navigation for chord shapes, HF, ET, repertoire

Key principle: when approving CC plans, always ask CC to trace downstream 
implications of any field change before proceeding. "What else reads this 
field and does the change break any invariants?"
```

### Claude Code — next session
```
Continue Musical Journey App. Read SESSION_SUMMARY_2026_05_19_21.md.

2527 tests passing. Scales prep flow phases 1-3 complete. Next: Phase 4 
(countdown + chimes), Phase 5 (drill timer in banner + auto-return to rating),
Phase 6 (Level 3 nav for chord shapes, HF, ET, repertoire).

devWipe.ts is an uncommitted local dev tool — Goals.tsx has import './devWipe' 
that must NOT be committed.

Run npm run build before every commit.
```
