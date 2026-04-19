# Musical Journey App — Roadmap

This document captures planned features and ideas for future development. Items here are not yet in the spec but should be considered when planning new build phases.

## Ear Training

### Intervals
- Extended melodic pattern quiz — train the ear on sequences of 3-8 notes forming common melodic phrases (riffs, hooks, melodic fragments from gospel, R&B, and jazz traditions). Separate from interval quiz but shares the audio engine.

### Modal Interchange (new sub-module)
Train the ear to catch "borrowed" chords — moments when a song in a major key reaches outside to grab a chord from the parallel minor. Focus on the most common borrowed chords: iv min, bVI maj7, bVII 7, bIII maj7, ii min7♭5. Think chord-level awareness — catching one moment at a time. Key references: Stevie Wonder, Donny Hathaway, classic gospel and soul ballads.

### Scales & Modes (new sub-module)
Train the ear to recognize when an entire section of music lives inside a specific mode. Covers the seven modes of the major scale plus harmonic and melodic minor. Each mode has a signature chord that says "you're in this mode" — min6 for Dorian, Maj7♯11 for Lydian, dom7 tonic for Mixolydian, V7-to-i-min for harmonic minor, min(Maj7) tonic for melodic minor. Think section-level awareness — reading the weather of the whole landscape.

## Voicings & Inversions (new top-level module)

Dedicated module for practicing voicings and inversions — primarily about playing, not listening. Includes:
- Inversion vocabulary — the 7 slash chords (1/3, 1/5, 4/5, 2/3, 3/3, 5/3, 6/b7) with sound character and functional context
- AB voicings from Chord Academy course (A and B positions for dom7 9(13), dom7 #9#5, min9, maj9, min6/9)
- Polychords — b7 major over minor triad for min9(11), b6 major over dom7 for #9#5, 2 major over dom7 for 9(13)#11
- Hybrids — triads over non-root bass notes (V/I for maj7sus2, II/I for Lydian color)
- Upper structure triads — 2 major over 4, etc.

Optional sub-feature: ear training layer inside Voicings module — "hear this voicing, identify whether it's A position or B position."

## Repertoire

### Chord Progression Playback
For each song, store its chord progression (Roman numerals or named chords) with optional section labels (verse, chorus, bridge). "Play progression" button loops the progression at user-specified tempo, transposable to any key. Use cases: ear-training real songs you're learning, reviewing old analyses, testing progression variations, songwriter practice loop.

## In-App Ideas Capture (new feature)

A simple place inside the app to capture feature ideas as they come during practice sessions. Fields: module/area, idea description, priority (nice-to-have / really want / must have), date added. Ideas can later be promoted to this roadmap when ready to build.

## Calendar & Progress Visualization
- Year-at-a-glance heatmap (full year grid, single view)
- Cross-module combined calendar showing overall practice across all modules
- Streak visualization on the calendar (rings or connected indicators showing current streak days)
- Tap a day to drill into that day's specific attempts (per-interval or per-chord breakdown)
- Time-of-day practice patterns (morning vs evening heatmap)
- Export calendar data to CSV/JSON for personal backup

## Progress Visualization
- Calendar view for per-module practice history — GitHub-style contribution graph. Cells colored by % of daily goal hit that day. Empty = no practice, partial fill = below goal, full = goal met, extra glow = significantly over goal. Monthly and year-at-a-glance variants.
- Top-level Skills Dashboard — cross-module view showing:
  - Per-module fluency totals and trend (improving / plateau / declining)
  - Last practiced per module
  - Strongest items across all modules
  - Weakest items across all modules
  - Recently improved (moved up a tier in the last 7 days)
  - Recently declined (moved down a tier in the last 7 days)
  - Stale items warning (previously fluent, now untouched for 30+ days)
  - Today's suggested focus (3-5 items the algorithm recommends prioritizing)
- Per-item history view — click any interval (or chord, or other item) to see its accuracy trend over time as a line graph with weekly buckets
- Year-at-a-glance heatmap — full year calendar grid, each day colored by practice intensity across all modules combined
- Radar chart visualization — at-a-glance view showing fluency across module categories
- End-of-session summary — "Nice work today: 34 answers, 89% accuracy, 2 new intervals moved to Fluent"

## Gamification & Progress Tracking
- Per-interval history view showing accuracy trend over time (weekly buckets)
- Practice heatmap calendar (Duolingo-style) showing which days had practice activity
- Module-wide progress dashboard pulling from attempts table
- Weekly summary shown on first load of a new week
- Achievement badges (first fluent interval, all diatonic intervals fluent, 7-day streak, 30-day streak, 100-correct day, etc.)
- End-of-session summary ("Nice work today: 34 answers, 89% accuracy, 2 new intervals moved to fluent")
- Configurable practice modes: Adaptive (default), Uniform random, Struggle mode (only sub-80% items), Fluency maintenance (only 80%+ items)
- Configurable daily goal in settings

## Other
- Cloud sync via Supabase or Firebase for cross-device access
- Export/backup functionality (JSON dump of all user data)
- Instrument selector that persists across sessions (Ear Training module scope — DONE / pending)
