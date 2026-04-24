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

## Repertoire — Future Enhancements
- Surface associated context in the delete-song confirm modal — before deleting, show what will be lost (diary entries, Skills Catalogue annotations, custom tags/priority) so users with real, meaningful associations don't lose that context silently. V1 deletes them silently, which is fine for test songs; v2 should protect real ones.
- Chord-level semantic connections — click a chord in the lead sheet to open that chord's Chord Recognition tier, or audition it against your ear-training fluency in the current key.
- Back-references from other modules — "this motion appears in Mirror (verse)" and "this progression is the hook of A Couple Minutes", surfaced next to the source drill.
- Multi-voicing tracking per chord — attach several voicings to a single chord slot so the user can compare alternatives without stomping on the primary chart.
- Audio recording of practice sessions — record straight into the session log with playback, so you can hear last week's take when you come back.
- Tempo progression tracking — graph how the target tempo has climbed over time for each song, flagging plateaus and breakthroughs.
- Integration with a Practice Sessions module — auto-log a Repertoire session when the user is practising inside a larger session block.
- Cross-song progression library — "songs in your repertoire that use the 1-5-6-4" / "songs that borrow bVII", surfaced as a browsable view.
- Mode tagging per section — connect a section's modal colour ("Dorian bridge") to Scales & Modes fluency.
- Modal interchange flagging — mark chords that are borrowed from the parallel minor / Mixolydian / harmonic minor so the ear has a vocabulary for "why does this section feel brighter / darker".
- Shared repertoire with friends — export a read-only song (or full repertoire) for another user to import.

## Shapes & Patterns — Future Enhancements
- "Legacy mastery" declaration — mark cells as already solid from prior practice so the app respects that without requiring re-logging to turn the heat up.
- Smart freshness decay — cells with significant cumulative investment decay more slowly than shallow cells, so a deeply-practised chord doesn't shout "stale" after a week off.
- Self-assessment recalibration — periodic check-ins on cells the user declared solid; if you've been away a while, the app prompts "still solid?" before surfacing it in the "what needs attention" list.
- Additional scales: harmonic minor, melodic minor, the seven modes, pentatonics, blues, bebop, diminished, whole tone.
- Fingering overlays (beginner-focused, toggleable) for scale and chord-shape drills.
- Cross-module integration with Song Repertoire — "you're using Abmaj7 in three songs, want to drill it?" surfaced as a suggestion in the attention panel.
- Cross-module integration with Harmonic Fluency — mental-visualisation drill completions feed flashcard scheduling so theory review rides along with physical practice.
- Chord voicings beyond root+inversions — rootless, spread, quartal, cluster, drop-2, drop-3 — as their own drill-type families inside the chord-shape cells.
- Practice streaks specific to this module (separate from ear training's daily streak, because drilling is about accumulation, not daily minimums).
- Metronome groove authoring — let users tweak / build their own grooves per-step, saved as presets that show up in the header selector.

## In-App Ideas Capture (new feature)

A simple place inside the app to capture feature ideas as they come during practice sessions. Fields: module/area, idea description, priority (nice-to-have / really want / must have), date added. Ideas can later be promoted to this roadmap when ready to build.

## Cross-Module Integration
- Repertoire → Chord Progressions detection: when a user adds a song with chord progressions in Repertoire, automatically detect which catalog progressions appear and surface them as "Related ear training" on the song's detail page. Each detected progression links to ear training practice for that progression in the song's key.
- Chord Progressions → Repertoire surfacing: when a user practices a progression in ear training, show their own repertoire songs that use this progression alongside the curated song examples. Creates a personal "songs I know that contain this pattern" list.
- Section-level progression tagging: songs in Repertoire can have multiple sections (verse, chorus, bridge) each with their own progression. Detection runs per section.
- Progression practice goals: "You have 5 songs in your repertoire that use the 1-5-6-4. Mark this progression as fluent to 'unlock' those songs."

## Chord Progressions — Future Enhancements
- Spotify OAuth integration for personalized song examples and listening-history-based progression recommendations
- Embedded audio player for song examples (requires API integration with Spotify Web Playback SDK or similar)
- User-contributed progressions (add your own named patterns to the catalog)
- Visual piano overlay showing bass note and chord as they play
- Modulation trainer (progressions that change key mid-stream)
- Real-song transcription mode (paste a song's progression, practice it in any key)
- Modulation challenges: progressions that start in one key and modulate to another. The user identifies the original key, the destination key, and the modulation type (direct, pivot chord, common-tone, chromatic). Advanced ear training — post-v1 feature.
- Extended tonic context options: eventually offer "I-V-I cadence" as a third option between "single tonic note" and "none" for users who want more priming.
- Advanced inversion tracking: separate fluency metrics for chord identification vs inversion identification so users can see where their weakness is.
- Inversion-only drill mode: user hears the chord and just has to identify the bass inversion, not the chord itself.
- Per-progression chord quality overrides: the `requiresDominant` flag pattern can extend to more nuanced rules (e.g. "this progression specifically needs Maj7 on I").
- Common cadences scope for Chord Motion — filter to recognisable landing patterns (IV→I, V→I, vi→IV, ii→V) instead of all motions.
- Chord quality scope for Chord Motion — filter by destination chord quality (major / minor / dominant / diminished) for targeted drilling.
- Additional scope options for chromatic Chord Motion — modal-interchange-only, secondary-dominants-only, tritone-subs-only sub-pools inside the "all motions including chromatic" scope.
- Difficulty progression suggestions in Chord Motion — app nudges "ready to try chromatic?" or "ready to drop scaffolding?" when rolling-window fluency on the current scope clears a threshold.
- Chord voicing complexity scope in Chord Motion — practice with triads only vs sevenths only vs jazz voicings. Currently hard-coded to seventh chords.
- Extended progressions for Key Detection — bring in tiers 4–6 progressively once the user is fluent in the curated tier-1-to-3 pool.
- Modulation challenges in Key Detection — progressions that change key mid-stream so the user distinguishes the original key from the destination key.
- Chord Motion with extended qualities — 9ths, 11ths, 13ths layered onto the two-chord motion drills so the ear learns to separate motion from colour.
- Visual piano overlay showing the full motion across octaves (currently limited to one-octave clicks inside the tonic's register).
- Integration with Repertoire — identify the key of a saved song's section by ear, then surface the detected key next to the song entry.

## Scales & Modes — Future Enhancements
- Keyboard construction mode: hear a mode, then click the notes on a keyboard to "construct" the scale visually.
- Melody identification: user identifies the mode of a melodic phrase (harder than a vamp because just melody, no chords).
- Modal improvisation challenges: user is given a mode and a chord vamp, prompted to improvise notes from the mode over the vamp.
- Play-along modal vamps: extended loops users can practice their own playing over.
- Mode blending: training to hear when a song shifts between modes mid-piece.
- Advanced modes: pentatonic scales, blues scales, bebop scales, diminished / whole tone scales as extras.

## Harmonic Fluency — Future Enhancements
- Cross-category "weakness challenges" — daily curated set pulling from the user's weakest tiers across all 12 categories
- Streak-based difficulty scaling — as user gets cards right, slightly harder variants get introduced
- User-created flashcards — let users add their own questions + answers
- Shared card decks — community-contributed category expansions
- Audio-enabled cards — blending the flashcard format with ear training specifically for the ear-theory crossover category
- Skill Catalogue integration — each card's `skillTag` surfaces on a central Skills Catalogue page so users can see every fluency skill the app trains

## Future Modules
- Modal Interchange sub-module: catching borrowed chords from parallel minor in an otherwise-diatonic context. Chord-level awareness. Distinct from Chord Progressions (which teaches pattern recognition) and Scales & Modes (which teaches full-section modal awareness).
- Scales & Modes sub-module: recognizing when a section of music lives inside a specific mode (Dorian, Lydian, Mixolydian, harmonic/melodic minor). Section-level awareness. Focus on signature chords that reveal each mode — Dorian IV major, Lydian #IV, Mixolydian bVII.

## Playback Controls
- Tempo-to-music-context presets — "ballad slow," "medium swing," "up-tempo" etc. for chord progressions and cadences specifically
- Per-chord-quality speed preferences (e.g. automatically play Dom13 slower than a simple major triad since it's more complex)
- Keyboard shortcuts for speed adjustment during practice
- Save speed profiles per module tier (e.g. slower default for Extensions tier, faster for Foundational Triads)

## Data & Sync
- Cloud sync via Supabase — automatic continuous backup to a cloud database. Users can create a free account, log in on multiple devices, and have their practice data synced seamlessly. Works alongside local IndexedDB (IndexedDB as cache, Supabase as source of truth). Conflict resolution for offline edits. Much bigger than export/import — will require a dedicated build phase.
- Scheduled automatic exports — app automatically exports to a user-specified folder (via File System Access API if supported) on a schedule, without requiring manual clicks
- Import merge mode — instead of replacing all data, merge imported attempts with current data by timestamp (useful for combining practice data from two devices before cloud sync exists)
- Selective export — choose which data to export (just attempts, or everything)
- Practice data analytics — once cloud sync exists, show long-term trends, year-over-year comparisons, etc.

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
