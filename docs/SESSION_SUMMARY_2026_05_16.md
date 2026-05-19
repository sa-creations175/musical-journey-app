# Session Summary — May 15–16, 2026

## What shipped

### Voice Leading submodule (full build)
- **Catalog:** 7 patterns, 372 cells (5-one, major-251, minor-251, diatonic-cycle, minor-aba, dom7b9, dim7). Correct musical naming — levels replaced with guide-tones/seventh-chords/full-voicing/aba-structure. Circle of 4ths key ordering for unstarted cells.
- **Drill modal:** VoiceLeadingDrillModal with countdown timer, sub-cell picker (most-due first), DrillSession + SpacingState writes. Matches ScalesDrillModal pattern.
- **Timer alignment:** All S&P drill modals (ScalesDrillModal, VoiceLeadingDrillModal, DrillSessionModal) now use countdown with user-set duration, auto-advance to rating, complete-early button.
- **25/50/25 split:** shapesSplit fires three-way (scales/chord shapes/VL) on every S&P block ≥15 min. Unconditional — no hasVoiceLeadingItems gate.
- **Per-key gating:** Within a pattern, next type (e.g. seventh-chords) only surfaces in a key when all cells of the current type (guide-tones) in that key reach `acquiring`.
- **Cold-start fix:** VL cells enumerate from catalog directly — unstarted cells without spacingState rows now compete in the sort. Diatonic cycle (catalog index 0) always surfaces first for unstarted cells.
- **Pattern priority:** Diatonic cycle → five-one → major-251 → minor-251 → minor-aba → dom7b9 → dim7.

### Context model refactor
- `mixed` removed (zombie — never user-facing, identical behavior to `keys`). Goal contextTag `mixed` → null; session fallback → `keys`.
- `full` added: keyboard block first → non-keyboard block second. `isKeyboardRequired: boolean` on AlgorithmBlock. `sequenceBlocks` sorts keyboard-required blocks first when context is `full`.
- `FULL_FACTORS` weight table: keyboard modules get keys-context weights, cognitive modules get laptop weights.
- Production on phone: surfaces normally. Hands-on Logic exercises show "Requires Logic" badge (informational, not blocking).

### SESSION_DESIGN.md + sessionDesign.ts
- Single source-of-truth constants file: `src/lib/sessionAlgorithm/sessionDesign.ts`. All session structure constants migrated from shapesSplit, timeAllocation, contextWeighting, repertoireSplit, sessionGenerator.
- **New S&P split:** three-way 15/45/40 (was 25/50/25), two-way 20/80 (was 30/70).
- **Graduated S&P/Repertoire split:** 25/75 at <45 min, 35/65 at 45-59 min, 40/60 at 60+ min. Hard constraint — Phase B goal pace does not override it.
- **Scales warm-up:** SCALES_SEGMENT_MAX_KEYS = 2 (was 3). 2 types per key (most-due pair). Circle of 4ths key selection. No song key influence.
- **Mental viz:** Surfaces in laptop (0.8×) and phone (1.4×) sessions as a fixed 5-min block. No SpacingState. quickLaunchRoute to mental-viz tab.
- **Non-keyboard sequencing:** NON_KEYBOARD_MODULE_ORDER enforced: mental viz → ET → HF → Production. Chord progressions and scales/modes parallel (same order index, weight decides).
- **Focused proposal fix:** graduated split now applies to ALL proposals (balanced and focused) via post-processing in generateProposals. Repertoire block injected into focused S&P proposals at designed fraction.

### Scales system fixes
- **Db bug fixed:** activeSongKeys removed from pickScalesKeys entirely. Warm-up is purely spacing-state driven — no song key influence.
- **Scale-prep upgraded:** emits real scale itemRefs, opens ScalesDrillModal in-session (inSessionDrillKind flag) instead of deep-linking away from the session.
- **Cross-key scale-prep:** Uses expansion key (not home key) for cross-key maintenance songs.
- **Scale-prep block flow:** chord quiz + scale prep + song block are one locked draggable unit in the proposal.

### Metronome
- **DrillMetronomeSetup component:** shared BPM slider, 6 preset chips (60/75/90/110/130/160), groove selector. Shown in setup phase of all three S&P drill modals (DrillSessionModal, ScalesDrillModal, VoiceLeadingDrillModal).
- **InlineSongMetronome:** compact BPM stepper + start/stop inline on song practice blocks (SotM, maintenance, whole-song-run). Uses `song` driver key. Always visible (not behind expand).
- **Global singleton:** all controls read/write the same metronomeBpm Dexie pref. No BPM duplication.

### Proposal drag-to-reorder fixes
- **Grouping logic:** S&P warm-up blocks are independent draggable units. Repertoire warm-up blocks (chord quiz, scale prep) chain forward to their isSongPractice anchor — whole group locked together.
- **Visual affordance:** drag handle color bumped from neutral-300 to neutral-400.
- **Reordering confirmed working end-to-end** — user order preserved through to active session.

### ET tier system
- **C1:** Chord progressions stage system (4 stages: key detection / chord motion + short diatonic / common patterns + modal / complex). Cross-submodule gate: Stage 1 requires CR T1 ≥75%.
- **C4:** Per-item curation layer. `etItemCuration` Dexie table (v23). `etCuration.ts` helper API. ⋯ button on all four ET fluency trackers. Curation sheet: edit label, flag, hide.
- **Curation UX:** Status indicators (⚐ flagged, ⊘ hidden) always visible inline. Bulk selection mode with Select toggle, checkboxes, smart Flag/Unflag + Hide/Unhide action bar.
- **C2 (5401402):** Scales/modes tier system. 9 modes split into Stage 1 (7 modes) + Stage 2 (harmonic/melodic minor). `scaleModeTierUnlock.ts` mirrors progressionTierUnlock pattern. Stats aggregated per mode not per tab variant. Also fixed C4 silent regression: intervals + scales-modes were excluded from sessions since C4 shipped (bare IDs vs variant-suffix spacingState rows mismatch). Fixed by enumerating variants in eligible set.
- **C3 (96e17b2):** `etStageGate.ts` — pure-functional cross-submodule gate. Computes global ET stage 1-5. All per-submodule unlock files route through single enforcement point. `getGlobalEtStage()` available for future UI progress display.

---

## Key design decisions made this session

### Session structure
- **Keyboard session order:** Scales warm-up → Chord shapes → VL → Chord quiz → Scale prep → SotM → Scale prep → Maintenance.
- **Non-keyboard session order:** Mental viz → ET (intervals → CR → [chord progressions ∥ scales/modes] → HF → Production (vocab → lessons).
- **Full session:** Keyboard block first, non-keyboard block second.
- **S&P splits:** 15% scales / 45% chord shapes / 40% VL (three-way); 20% scales / 80% chord shapes (two-way).
- **Graduated Repertoire dominance:** Songs always get the majority. Shorter sessions = higher Repertoire fraction.
- **Scales warm-up:** 2 keys max, 2 types per key (most-due pair), ~5 min total.

### ET progression (designed and partially built)
Five-stage arc: identify individual sounds → identify tonal context → identify movement and voicing → identify patterns → full complexity. See SESSION_DESIGN.md for full stage table.

### Chord progressions catalog approach
Pre-built catalog of 58 items is largely not useful — most were created without personal connection. Plan: populate organically from songs discovered through repertoire. Curation tools now exist to flag/hide/edit items. Future item: "add progression from song" flow.

---

## Known issues / watch items
- **Skip/defer block during active session** — no mechanism exists. Needed for skipping a block without abandoning the session.
- **Chord shapes drill blocks** navigate away from session (same issue scale-prep had before fix). `inSessionDrillKind` pattern exists — extend to chord shapes in a follow-on.
- **Right proposal collapses to one card** in keyboard sessions — focused and balanced proposals are identical after graduated split enforcement. Needs Flexible Session Proposal design (separate design item).
- **Scale-prep in-session modal** — verify in first real practice session (couldn't easily test mid-session without skip feature).
- **Chord progressions catalog:** C2 + C3 paused pending catalog curation. Resume once hidden items reviewed.
- **scalesSegmentBudget proportional branch** — dead code since unconditional 3-way split. Cleanup deferred.

---

## Outstanding build items (updated)

### In progress
- ET C2 (scales/modes tier system) + C3 (etStageGate) — building at session close

### Ready to build
- Chord shapes in-session drill modal (one-line extension of inSessionDrillKind)
- Skip/defer block during active session
- Multiple YouTube/reference video links per song

### Design items (need design doc before building)
- Flexible Session Proposal Design — multiple named alternatives + customize flow. Unifies drag-to-reorder, time picker redesign, 15-min curated session mode.
- ET chord progressions "add from repertoire" flow — discover progression in song → add to ET practice
- Song key tonality toggle (major/minor perspective on song detail)
- Chord-scale warm-up post-acquisition (replace scale-prep with diatonic chord-scale practice once scales solid)
- Advanced Harmonic Learning design doc (tritone sub, hybrid chords, inversion ET)
- Lead sheet ↔ matrix deep connection
- Scales as proper S&P submodule

### Polish
- Active session header safe-area-inset-top padding (mobile notch)
- Mobile nav — full bottom tab bar (Goals/Dashboard/Practice/Modules)
- Collapsible metronome + instrument picker during sessions on mobile
- Weekly plan Repertoire time breakdown (SotM and maintenance as separate line items)
- ET chord progressions catalog — permanent delete of hidden items (defer 1 week)

### Watching (need real usage data)
- HF/ET seed reconciliation (20s vs 30s)
- Production seed (60 min vs 45 min)
- 9c two-choice UX + steady-state weighting shift
- Non-keyboard session proportions + full session time split
- Flexible proposal UX — needs real sessions before designing

---

## Commits this session
5401402, 96e17b2 (ET C2 + C3 — scales/modes tier system + etStageGate)
8cff5f0, 2fc548d, 64e73ee (ET C1 + C4 + curation UX)
5c858a6 (VL cold-start), 4e4ceca (VL circle of 4ths ordering)
d8e62cb (scale-prep in-session modal), d22ff5e (drag grouping + affordance)
0fd10cb, fd965b9 (metronome — song blocks + drill modals)
bea7958 (metronome setup phase)
fb3210f (focused proposal graduated split fix)
a172bc1 (graduated split hard constraint)
43c5b42, 770512c, 2b12bfb (SESSION_DESIGN.md + sessionDesign.ts)
71a01c7, e547cfe, 902496c (context model refactor)
7636bcb, 262ff87 (VL progression ordering + catalog correction)
c5d0e98, 0876d1c, 25c555f (scales warm-up + scale-prep upgrade)
a48eaad (scales Db bug fix)
db605fc (ScalesDrillModal + VoiceLeadingDrillModal timer alignment)
00e3ea8, 262ff87 (VL heat grid + modal API)
8b03ca1, 3262bb9, 9db02ae (VL initial build — split, modal, catalog)
