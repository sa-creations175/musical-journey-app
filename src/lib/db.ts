import Dexie, { type Table } from 'dexie';

export interface IntervalData {
  id: string;
  name: string;
  semitones: number;
  ascAnchorDefault: string;
  descAnchorDefault: string;
  ascAnchorCustom?: string;
  descAnchorCustom?: string;
  ascCorrect: number;
  ascTotal: number;
  descCorrect: number;
  descTotal: number;
}

export interface ChordData {
  id: string;
  name: string;
  tier: 'foundational' | 'seventh' | 'dominant' | 'extensions';
  family: 'major' | 'minor' | 'dom' | 'sus' | 'dim' | 'aug';
  intervals: number[];
  formula: string;
  soundDefault: string;
  soundCustom?: string;
  correct: number;
  total: number;
}

export interface ChordShapeData {
  id: string;
  chordId: string;
  key: number;
  inversion: 0 | 1 | 2 | 3;
  mastered: boolean;
  notes?: string;
}

// One of five user-facing learning stages. Each has its own coaching
// guidance in src/modules/repertoire/stage.ts. Users control stage
// advancement; the app only suggests when criteria are met.
export type RepertoireStage =
  | 'learning'
  | 'comfortable'
  | 'internalized'
  | 'cross-key'
  | 'maintenance';

export interface Song {
  id: string;
  title: string;
  artist: string;
  genre?: string;
  /** Original/home key, e.g. "C", "Db", "G". */
  key?: string;
  /** Marks the key as an estimate that the user should verify against
   *  the original recording. Pre-populated songs set this for songs
   *  where the home key couldn't be determined confidently. */
  keyNeedsVerification?: boolean;
  /** Single tempo in BPM, or null/undefined if unset. */
  tempo?: number;
  /** Optional human tempo range like "60-75 BPM". Rendered verbatim. */
  tempoLabel?: string;
  /** Current user-controlled stage. Defaults to 'learning' for new
   *  songs. Advancement is user-driven; the UI suggests when criteria
   *  are met but never forces a change. */
  stage?: RepertoireStage;
  /** Free-text "why I'm learning this" description. Starter copy is
   *  pre-populated when a song is seeded; user can edit or clear it. */
  description?: string;
  /** Full-song lyrics reference (flowing text with [Section] markers).
   *  Editable by the user. Pre-populated for the subset of seeded
   *  songs whose lyrics could be verified without fabrication; for
   *  the rest carries a short "add lyrics here" prompt. */
  fullLyrics?: string;
  /** Spotify / YouTube / Apple Music links. Free-form strings. */
  spotifyLink?: string;
  youtubeLink?: string;
  /** Running list of every URL the user has pasted for this song.
   *  Preserved for backward compatibility with the initial Song schema. */
  audioLinks: string[];
  addedDate: number;
  notes?: string;
  /** @deprecated — carried forward from the original schema. Not used
   *  by the Repertoire module but kept so existing backups round-trip. */
  technical?: boolean;
  /** @deprecated — see `technical`. */
  byEar?: boolean;
  /** @deprecated — see `technical`. */
  memorized?: boolean;
  /** @deprecated — see `technical`. */
  progressionAnalyzed?: boolean;
  /** @deprecated — see `technical`. */
  recorded?: boolean;
}

/** One atomic unit inside a phrase line. A word beat carries lyric
 *  text; a blank beat carries no lyric but can still hold a chord
 *  (used for instrumental hits, pickup chords, mid-word chord changes,
 *  etc.). Chords anchor to beat ids — never to character offsets — so
 *  editing lyrics can't cascade chord placements.
 *
 *  `joinToNext` marks the beat as a syllable of a larger word: when
 *  true, the renderer visually joins this beat's text to the next
 *  beat's with a hyphen, so three beats `{text:'A', joinToNext:true}`,
 *  `{text:'maz', joinToNext:true}`, `{text:'ing'}` display as
 *  "A-maz-ing" while still carrying independent chord slots above
 *  each syllable. */
export interface Beat {
  id: string;
  type: 'word' | 'blank';
  /** Word text. Undefined / empty for blank beats. */
  text?: string;
  /** Syllable-group join flag. Only meaningful on 'word' beats. */
  joinToNext?: boolean;
}

/** Named chord arrangement stored at the section level. Every phrase
 *  within a section shares this list of arrangements; each phrase
 *  decides which chord lands on which beat for each arrangement. */
export interface Arrangement {
  id: string;
  name: string;
  /** Per-arrangement notes (picked up from legacy alternateNote when
   *  the Alternates arrangement is auto-created). */
  notes?: string;
}

/**
 * Functional chord representation. The user works in functional
 * harmony, so chords store their position (scale-degree function) and
 * quality independently of any concrete key. Concrete chord names
 * ("Fmaj7", "Ab", etc.) are DERIVED at render time from the song
 * section's current key + these functional fields.
 *
 * Degree label convention matches the Chord Motion module:
 *   "1" "b2" "2" "b3" "3" "4" "#4" "5" "b6" "6" "b7" "7"
 * — so progression detection can interoperate without a translation
 * layer.
 *
 * When the user types something the parser can't resolve (a chord in
 * a key the section doesn't declare, an unrecognised quality), the
 * entry is stored with `unparsed: true` and `raw` preserved so no
 * input is silently discarded.
 */
export interface ChordFunction {
  /** Scale-degree label — "1", "b2", "2", ... "7". Empty string when
   *  parsing failed (check `unparsed`). */
  function: string;
  /** Quality suffix as the user would read it: "", "m", "7", "maj7",
   *  "m7", "m7b5", "dim", "aug", "add9", "m(add9)", etc. */
  quality: string;
  /** Bass function for slash chords, as a scale-degree label
   *  ("3", "5", "b7"). Undefined when not a slash. */
  bass?: string;
  /** Original user-entered text. Preserved verbatim so the display
   *  layer can fall back to raw when parsing produced nothing useful. */
  raw?: string;
  /** Flag set by the parser when it couldn't resolve the input to a
   *  functional position (e.g. a concrete chord name in a section
   *  whose key is unknown). Renderer shows `raw` with a small warning. */
  unparsed?: boolean;
}

/**
 * One phrase line = a sequence of beats + per-arrangement chord
 * placements over those beats.
 *
 * Legacy fields `chords` / `lyrics` remain for backward compatibility
 * with pre-beat data — the renderer derives beats from `lyrics.split`
 * when `beats` is absent. Those fields are written on seed/init but
 * the authoritative post-refactor state lives on `beats` +
 * `chordsByArrangement`.
 */
export interface Phrase {
  id: string;
  /** Ordered beat sequence. When undefined, renderer derives from
   *  `lyrics` (one word beat per whitespace-split token). */
  beats?: Beat[];
  /** arrangementId → { beatId → ChordFunction }. Functional storage
   *  means the placement survives a key change without rewriting
   *  anything — only the displayed concrete chord name (when the user
   *  has that notation mode on) re-derives. */
  chordsByArrangement?: Record<string, Record<string, ChordFunction>>;
  /** @deprecated pre-beat single chord string for the whole line.
   *  Migrated into `chordsByArrangement.basic` at render time. */
  chords?: string;
  /** @deprecated pre-beat single lyric string. Split into word beats
   *  on demand. */
  lyrics?: string;
}

export interface SongSection {
  id: string;
  songId: string;
  /** Display name — "Verse 1", "Chorus", "Bridge", "Outro", etc. */
  name: string;
  /** Ordering within the song (0-indexed). */
  order: number;
  /** Pre-populated seed lyrics or empty string. Preserved as a fallback
   *  when `phrases` is absent (legacy pre-phrase-refactor data) and as
   *  a pristine copy of the original seed text. */
  lyrics: string;
  /** When true, the section's seed lyrics came from a source the author
   *  couldn't fully verify — surface a "needs verification" hint. */
  lyricsNeedsVerification?: boolean;
  /** Authoritative lyric + chord data. Each phrase is one displayed
   *  row. Empty / missing = fall back to `lyrics` split on newlines. */
  phrases?: Phrase[];
  /** Named chord arrangements available on this section. Every
   *  section gets a seed "Basic" arrangement; users can add their own
   *  ("My arrangement", "Jazz voicings", etc.). When undefined, the
   *  renderer synthesises a single `{ id: 'basic', name: 'Basic' }`. */
  arrangements?: Arrangement[];
  /** Which arrangement is currently shown in the editor. Defaults to
   *  the first arrangement (usually 'basic'). */
  activeArrangementId?: string;
  /** @deprecated kept for backward-compat with pre-phrase-line data.
   *  Space-separated chord tokens for the whole section. */
  basicChords?: string;
  /** Optional alternate/substitution chord chart the user explores.
   *  When non-empty on first load post-refactor, auto-materialised as
   *  an "Alternates" arrangement alongside Basic. */
  alternateChords?: string;
  /** @deprecated kept for backward-compat. Per-line strike-through
   *  flags keyed by the old lyric-line index. Not used by phrase-line
   *  rendering. */
  struckLines?: number[];
  /** Section hidden from playback view (collapsed) but still in data. */
  hidden?: boolean;
  /** Per-section stage — can diverge from song-level stage. Defaults to
   *  inheriting the song's stage at render time. */
  stage?: RepertoireStage;
  /** Free text for performance cues / voicing ideas. */
  notes?: string;
  /** User note explaining when/why an alternate chord is used. */
  alternateNote?: string;
}

/** One parsed chord token inside a section. Populated by the chord
 *  parser at save time so cross-module queries ("find songs that use
 *  bVII") don't need to re-parse text on the fly. */
export interface SongChord {
  /** Composite key: `${songId}:${sectionId}:${position}`. */
  id: string;
  songId: string;
  sectionId: string;
  /** Zero-indexed position within the section's chord chart (token order). */
  position: number;
  /** Original token as typed by the user. Preserved for display so
   *  enharmonic spelling and extensions stay faithful. */
  rawText: string;
  /** Root pitch class name (e.g. "C", "F#", "Bb"). Empty string when
   *  parsing failed. */
  root: string;
  /** Coarse quality bucket. Fine extensions go in `extensions`. */
  quality: 'major' | 'minor' | 'dominant' | 'diminished' | 'augmented' | 'half-dim' | 'unknown';
  /** Extensions present on the chord (e.g. ['7', 'b9', '#11']). */
  extensions: string[];
  /** Slash-bass note name when present. */
  bass?: string;
  /** True when the parser produced usable structure. False falls back
   *  to `rawText` at render time with a small warning icon. */
  parsed: boolean;
}

export interface SongPracticeLog {
  id: string;
  songId: string;
  /** ISO-ish timestamp (epoch ms) for sort + heatmap. */
  timestamp: number;
  /** Minutes practised (whole number or decimal). */
  durationMin: number;
  /** Section ids touched in this session. Empty array = whole song. */
  sectionIds: string[];
  /** Key names practised in this session. E.g. ['C', 'G', 'Eb']. */
  keys: string[];
  /** 1-5 feel rating — 1 struggled, 5 breakthrough. */
  feelRating: 1 | 2 | 3 | 4 | 5;
  /** Optional session notes. */
  notes?: string;
  /** Marker for sessions where the user indicated they worked at
   *  target tempo. Drives the Learning → Comfortable advancement. */
  atTargetTempo?: boolean;
}

export interface SongCrossKeyProgress {
  /** Composite key: `${songId}:${sectionId}:${keyName}`. */
  id: string;
  songId: string;
  sectionId: string;
  keyName: string;
  /** Count of sessions that touched this (section, key) pair. */
  sessionCount: number;
  /** Timestamp of most recent session touching this pair. */
  lastPracticed: number;
  /** User-marked mastery flag. `sessionCount` alone never promotes to
   *  mastered — the user toggles it explicitly on the grid. */
  mastered: boolean;
}

export interface WantToLearnEntry {
  id: string;
  title: string;
  artist: string;
  priority: 'high' | 'medium' | 'low';
  /** Free-text reason for wanting to learn — drives the description
   *  when the entry is promoted to the Active repertoire. */
  why?: string;
  link?: string;
  /** Loose tags for mood/style ("soul", "ballad", "up-tempo", etc.). */
  tags: string[];
  addedDate: number;
}

// --- Shapes & Patterns module (v9) ----------------------------------

/** Which activity area a drill belongs to. Four top-level categories
 *  surface in the module's UI; the first two share the heat-grid
 *  pattern while the latter two use flat lists. */
export type DrillKind =
  | 'chord-shape'
  | 'scale'
  | 'voice-leading'
  | 'mental-viz';

/**
 * A drillable "cell" — something the user can practise across
 * multiple drill types. Created lazily on first interaction: opening
 * a heat-grid cell that's never been practised materialises the
 * DrillSkill + its default DrillTypes on demand.
 *
 * The shape is deliberately polymorphic across the four drill kinds
 * because the heat-grid dimensions differ (chord×key vs scale×key vs
 * pattern×key vs single card).
 */
export interface DrillSkill {
  id: string;
  kind: DrillKind;
  /** Major-pitch-name key for the skill ("C", "Db", …, "B"). Optional
   *  because mental-viz drills aren't key-pinned. */
  keyName?: string;
  /** Chord-quality id for 'chord-shape' skills ("maj", "m7b5", etc.). */
  quality?: string;
  /** Scale id for 'scale' skills ('major' / 'natural-minor' in v1). */
  scale?: string;
  /** Voice-leading pattern id for 'voice-leading' skills. */
  patternId?: string;
  /** Mental-viz variant id ('shape-viz' / 'ghost-keyboard' / …). */
  variant?: string;
  /** Denormalised display label — used when rendering without having
   *  to re-derive from catalog. Editable. */
  label?: string;
  createdAt: number;
}

/** One practice type inside a skill. E.g. for "Cmaj triad" the types
 *  are "Root position", "1st inversion", "2nd inversion", "All
 *  inversions fluid". Aggregate counts here are maintained by the
 *  session-logging flow so the heat-grid doesn't need to sum sessions
 *  at render time. */
export interface DrillType {
  id: string;
  skillId: string;
  name: string;
  /** Suggested duration in seconds — default fill for the drill
   *  session timer. Editable. */
  suggestedSeconds: number;
  /** Display ordering within the skill. */
  order: number;
  repCount: number;
  totalSeconds: number;
  lastPracticedAt: number | null;
  /** User-added drills flagged so the UI can distinguish them from
   *  defaults (only for display; no behavioural difference). */
  userCreated?: boolean;
}

export interface DrillSession {
  id: string;
  drillTypeId: string;
  skillId: string;
  /** How long this session actually ran (not the target). Minimum
   *  enforced at 30 s by the UI before a session can save. */
  durationSeconds: number;
  /** 1 = struggled, 2 = working on it, 3 = clean, 4 = in flow. */
  feelRating: 1 | 2 | 3 | 4;
  notes?: string;
  timestamp: number;
}

/**
 * Creative-time session — "Just Play" (freeform keyboard exploration)
 * or "Just Produce" (beat-making / sound design / recording). Logged
 * from the header's creative-time button, separate from the skill-
 * targeted `sessions` and `drillSessions` tables because creative
 * work isn't tied to a specific practiceable item.
 */
export interface CreativeSession {
  id: string;
  timestamp: number;
  mode: 'play' | 'produce';
  durationSeconds: number;
  /** Prompt text the user accepted (or skipped past). Undefined when
   *  the user chose to play with no prompt. */
  prompt?: string;
  /** Prompt template id — records WHICH kind of prompt was used
   *  (e.g. 'recent-drill', 'emotion-tag'). Future feedback loops. */
  promptKind?: string;
  notes?: string;
  /** Flagged when shorter than the 2-minute "genuine session"
   *  threshold. Still logged so noodling is visible. */
  quickExploration?: boolean;
}

// --- Skills registry + Harmonic Diary (v11) -------------------------
//
// These two tables power the Skills Catalogue and Harmonic Diary
// features. They are both ANNOTATION layers on top of existing module
// data — the module tables remain the source of truth for tier /
// freshness / attempt counts, while these tables carry user-set
// metadata (priorities, tags, emotional associations) that doesn't
// belong inside any single module.

/** Skill type classification — used by the Skills Catalogue to group
 *  and filter the unified view. 'theory' covers conceptual harmonic
 *  fluency cards; 'ear' covers interval / chord-recognition /
 *  progression ear-training; 'physical-*' covers the three Shapes &
 *  Patterns drill kinds (mental-viz stays its own category since it's
 *  a cognitive drill); 'song' covers repertoire entries. */
export type SkillType =
  | 'theory'
  | 'ear'
  | 'physical-chord-shape'
  | 'physical-scale'
  | 'physical-voice-leading'
  | 'physical-mental-viz'
  | 'song'
  | 'production';

/** User-settable learning intent — lets the catalogue surface what
 *  the user is actively choosing to invest in vs maintain. */
export type SkillPriority = 'comfort' | 'deep' | 'maintenance';

/**
 * User annotations for a specific skill. `skillId` is a canonical
 * string built by `canonicalSkillId` in src/modules/skills/registry.ts
 * — it stays stable across module refactors because it embeds both
 * moduleId and itemId.
 *
 * Tier / freshness / lastPracticed are INTENTIONALLY absent — those
 * are derived live from source module tables. Only user-set
 * annotations persist here.
 */
export interface SkillAnnotation {
  skillId: string;
  priority?: SkillPriority;
  /** Free-form tags the user has attached to this skill ("Modal
   *  Interchange", "gospel-blue", etc.). */
  tags: string[];
  /** User can override the catalogue's auto-derived display name. */
  customName?: string;
  /** User can write a private note about the skill, visible only
   *  inside the catalogue detail panel. */
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * One harmonic-diary entry — the association a user has with a
 * specific skill. Extends the per-module association concept (the
 * existing `progressionAssociations`, `modeAssociations`, and
 * `intervalDescriptions` tables) into a single unified space that can
 * hold emotional/genre tags and link to any skill regardless of
 * source module.
 *
 * `claudeStarterText` holds the app-generated seed associated with
 * the skill. When the user edits, `userText` carries their version
 * and `isStarterEdited = true` flags that the entry is now
 * user-owned. Both are kept so we can show "Claude's starter — tap
 * to customise" in the UI when no user text exists yet.
 */
export interface HarmonicDiaryEntry {
  /** Stable id — uuid-ish. */
  entryId: string;
  /** FK into the derived skill registry. */
  skillId: string;
  /** User-written association text. Empty string when not yet
   *  personalised. */
  userText: string;
  /** App-generated starter text shown when `userText` is empty. */
  claudeStarterText?: string;
  /** True once the user has edited the starter. */
  isStarterEdited: boolean;
  /** Emotion tag vocabulary — melancholy, hopeful, tense, resolved,
   *  bright, dark, warm, dreamy, mysterious, etc. Curated in
   *  src/modules/harmonic-diary/vocab.ts. */
  emotionalTags: string[];
  /** Genre tags — gospel, soul, neo-soul, hip-hop, jazz, etc. */
  genreTags: string[];
  createdAt: number;
  lastEdited: number;
  /** When the entry was materialised from a legacy per-module
   *  association table, this records the source so subsequent syncs
   *  stay idempotent. Absent for diary-native entries. */
  legacySource?: 'progression' | 'mode' | 'interval';
}

export interface Session {
  id: string;
  date: number;
  durationMin: number;
  focus: 'ear' | 'chords' | 'songs' | 'production' | 'improv' | 'songwriting' | 'mixed';
  notes?: string;
  reflection?: string;
  feel: 'breakthrough' | 'solid' | 'maintenance' | 'rough';
}

export interface LogicSkill {
  id: string;
  order: number;
  name: string;
  complete: boolean;
  notes?: string;
  completedDate?: number;
}

export interface ProducerStat {
  id: string;
  pillar: 'storytelling' | 'arrangement' | 'beats' | 'vibe';
  count: number;
  target: number;
  notes?: string;
}

export interface QuizStat {
  id: string;
  scope: string;
  correct: number;
  wrong: number;
  streak: number;
  bestStreak: number;
}

export interface UserPref {
  key: string;
  value: unknown;
}

export type AttemptDirection = 'asc' | 'desc';

export interface AttemptRecord {
  id?: number;
  moduleId: string;
  itemId: string;
  direction?: AttemptDirection;
  correct: boolean;
  timestamp: number;
  /** Set when the attempt should still be logged (so daily goals,
      streaks, and the calendar keep working) but must NOT feed the
      rolling-window fluency calculation. Used by small-pool focus
      sessions where the user already knows what's coming and a "correct"
      answer isn't a genuine fluency signal. Older records without the
      field are treated as normal fluency-tracked attempts. */
  excludeFromFluency?: boolean;
}

export interface DailySummary {
  date: string; // YYYY-MM-DD, local day
  moduleId: string;
  correctCount: number;
  wrongCount: number;
  dailyGoal: number;
  goalMet: boolean;
}

export interface ProgressionAssociation {
  progressionId: string;
  text: string;
  updatedAt: number;
}

export interface ModeAssociation {
  modeId: string;
  text: string;
  updatedAt: number;
}

// Per-interval-quality emotional description. Keyed by a composite id
// like "minor-3rd-ascending" so ascending and descending versions of
// the same quality live on separate rows (they feel different to the
// ear and often attract different associations).
export interface IntervalDescription {
  intervalKey: string;
  text: string;
  updatedAt: number;
}

export interface FlashcardState {
  cardId: string;
  easeFactor: number;        // SM-2, starts at 2.5
  interval: number;          // days until next review
  nextReviewDate: number;    // epoch ms
  lastReviewed: number;      // epoch ms
  consecutiveCorrect: number;
  totalAttempts: number;
  totalCorrect: number;
  /** User-flagged for "study later". Optional for backwards-compat with
      records written before the field existed. */
  isFlagged?: boolean;
}

export class AppDB extends Dexie {
  intervals!: Table<IntervalData, string>;
  chordQualities!: Table<ChordData, string>;
  chordShapes!: Table<ChordShapeData, string>;
  songs!: Table<Song, string>;
  sessions!: Table<Session, string>;
  logicSkills!: Table<LogicSkill, string>;
  producerStats!: Table<ProducerStat, string>;
  quizStats!: Table<QuizStat, string>;
  userPrefs!: Table<UserPref, string>;
  attempts!: Table<AttemptRecord, number>;
  dailySummaries!: Table<DailySummary, [string, string]>;
  progressionAssociations!: Table<ProgressionAssociation, string>;
  flashcardStates!: Table<FlashcardState, string>;
  modeAssociations!: Table<ModeAssociation, string>;
  intervalDescriptions!: Table<IntervalDescription, string>;
  songSections!: Table<SongSection, string>;
  songChords!: Table<SongChord, string>;
  songPracticeLog!: Table<SongPracticeLog, string>;
  songCrossKeyProgress!: Table<SongCrossKeyProgress, string>;
  wantToLearn!: Table<WantToLearnEntry, string>;
  drillSkills!: Table<DrillSkill, string>;
  drillTypes!: Table<DrillType, string>;
  drillSessions!: Table<DrillSession, string>;
  creativeSessions!: Table<CreativeSession, string>;
  skillAnnotations!: Table<SkillAnnotation, string>;
  harmonicDiaryEntries!: Table<HarmonicDiaryEntry, string>;

  constructor() {
    super('musical-journey');
    this.version(1).stores({
      intervals: 'id, name, semitones',
      chordQualities: 'id, name, tier, family',
      chordShapes: 'id, chordId, key, inversion',
      songs: 'id, title, artist, addedDate',
      sessions: 'id, date, focus',
      logicSkills: 'id, order',
      producerStats: 'id, pillar',
      quizStats: 'id, scope',
      userPrefs: 'key',
    });
    this.version(2).stores({
      intervals: 'id, name, semitones',
      chordQualities: 'id, name, tier, family',
      chordShapes: 'id, chordId, key, inversion',
      songs: 'id, title, artist, addedDate',
      sessions: 'id, date, focus',
      logicSkills: 'id, order',
      producerStats: 'id, pillar',
      quizStats: 'id, scope',
      userPrefs: 'key',
      attempts: '++id, timestamp, moduleId, [moduleId+itemId+direction]',
    });
    this.version(3).stores({
      intervals: 'id, name, semitones',
      chordQualities: 'id, name, tier, family',
      chordShapes: 'id, chordId, key, inversion',
      songs: 'id, title, artist, addedDate',
      sessions: 'id, date, focus',
      logicSkills: 'id, order',
      producerStats: 'id, pillar',
      quizStats: 'id, scope',
      userPrefs: 'key',
      attempts: '++id, timestamp, moduleId, [moduleId+itemId+direction]',
      dailySummaries: '[date+moduleId], date, moduleId',
    });
    this.version(4).stores({
      intervals: 'id, name, semitones',
      chordQualities: 'id, name, tier, family',
      chordShapes: 'id, chordId, key, inversion',
      songs: 'id, title, artist, addedDate',
      sessions: 'id, date, focus',
      logicSkills: 'id, order',
      producerStats: 'id, pillar',
      quizStats: 'id, scope',
      userPrefs: 'key',
      attempts: '++id, timestamp, moduleId, [moduleId+itemId+direction]',
      dailySummaries: '[date+moduleId], date, moduleId',
      progressionAssociations: 'progressionId',
    });
    this.version(5).stores({
      intervals: 'id, name, semitones',
      chordQualities: 'id, name, tier, family',
      chordShapes: 'id, chordId, key, inversion',
      songs: 'id, title, artist, addedDate',
      sessions: 'id, date, focus',
      logicSkills: 'id, order',
      producerStats: 'id, pillar',
      quizStats: 'id, scope',
      userPrefs: 'key',
      attempts: '++id, timestamp, moduleId, [moduleId+itemId+direction]',
      dailySummaries: '[date+moduleId], date, moduleId',
      progressionAssociations: 'progressionId',
      flashcardStates: 'cardId, nextReviewDate',
    });
    this.version(6).stores({
      intervals: 'id, name, semitones',
      chordQualities: 'id, name, tier, family',
      chordShapes: 'id, chordId, key, inversion',
      songs: 'id, title, artist, addedDate',
      sessions: 'id, date, focus',
      logicSkills: 'id, order',
      producerStats: 'id, pillar',
      quizStats: 'id, scope',
      userPrefs: 'key',
      attempts: '++id, timestamp, moduleId, [moduleId+itemId+direction]',
      dailySummaries: '[date+moduleId], date, moduleId',
      progressionAssociations: 'progressionId',
      flashcardStates: 'cardId, nextReviewDate',
      modeAssociations: 'modeId',
    });
    this.version(7).stores({
      intervals: 'id, name, semitones',
      chordQualities: 'id, name, tier, family',
      chordShapes: 'id, chordId, key, inversion',
      songs: 'id, title, artist, addedDate',
      sessions: 'id, date, focus',
      logicSkills: 'id, order',
      producerStats: 'id, pillar',
      quizStats: 'id, scope',
      userPrefs: 'key',
      attempts: '++id, timestamp, moduleId, [moduleId+itemId+direction]',
      dailySummaries: '[date+moduleId], date, moduleId',
      progressionAssociations: 'progressionId',
      flashcardStates: 'cardId, nextReviewDate',
      modeAssociations: 'modeId',
      intervalDescriptions: 'intervalKey',
    });
    this.version(8).stores({
      intervals: 'id, name, semitones',
      chordQualities: 'id, name, tier, family',
      chordShapes: 'id, chordId, key, inversion',
      songs: 'id, title, artist, addedDate, stage',
      sessions: 'id, date, focus',
      logicSkills: 'id, order',
      producerStats: 'id, pillar',
      quizStats: 'id, scope',
      userPrefs: 'key',
      attempts: '++id, timestamp, moduleId, [moduleId+itemId+direction]',
      dailySummaries: '[date+moduleId], date, moduleId',
      progressionAssociations: 'progressionId',
      flashcardStates: 'cardId, nextReviewDate',
      modeAssociations: 'modeId',
      intervalDescriptions: 'intervalKey',
      // Repertoire module v8 tables. songSections indexes songId so
      // SongDetail can pull all sections at once. songPracticeLog
      // indexes songId + timestamp so the history list is cheap to
      // sort. crossKeyProgress indexes songId and [songId+sectionId]
      // for the per-section grid.
      songSections: 'id, songId, order, [songId+order]',
      songChords: 'id, songId, sectionId, [songId+sectionId+position]',
      songPracticeLog: 'id, songId, timestamp, [songId+timestamp]',
      songCrossKeyProgress: 'id, songId, sectionId, [songId+sectionId]',
      wantToLearn: 'id, addedDate, priority',
    });
    this.version(9).stores({
      intervals: 'id, name, semitones',
      chordQualities: 'id, name, tier, family',
      chordShapes: 'id, chordId, key, inversion',
      songs: 'id, title, artist, addedDate, stage',
      sessions: 'id, date, focus',
      logicSkills: 'id, order',
      producerStats: 'id, pillar',
      quizStats: 'id, scope',
      userPrefs: 'key',
      attempts: '++id, timestamp, moduleId, [moduleId+itemId+direction]',
      dailySummaries: '[date+moduleId], date, moduleId',
      progressionAssociations: 'progressionId',
      flashcardStates: 'cardId, nextReviewDate',
      modeAssociations: 'modeId',
      intervalDescriptions: 'intervalKey',
      songSections: 'id, songId, order, [songId+order]',
      songChords: 'id, songId, sectionId, [songId+sectionId+position]',
      songPracticeLog: 'id, songId, timestamp, [songId+timestamp]',
      songCrossKeyProgress: 'id, songId, sectionId, [songId+sectionId]',
      wantToLearn: 'id, addedDate, priority',
      // Shapes & Patterns module. drillSkills indexes kind + the
      // triplet (kind, keyName, quality) so heat-grid lookups are
      // one round-trip per tab. drillTypes + drillSessions pivot on
      // skillId / drillTypeId for the obvious aggregations.
      drillSkills: 'id, kind, [kind+keyName+quality], [kind+keyName+scale], [kind+patternId+keyName], [kind+variant]',
      drillTypes: 'id, skillId, [skillId+order]',
      drillSessions: 'id, drillTypeId, skillId, timestamp, [skillId+timestamp], [drillTypeId+timestamp]',
    });
    this.version(10).stores({
      intervals: 'id, name, semitones',
      chordQualities: 'id, name, tier, family',
      chordShapes: 'id, chordId, key, inversion',
      songs: 'id, title, artist, addedDate, stage',
      sessions: 'id, date, focus',
      logicSkills: 'id, order',
      producerStats: 'id, pillar',
      quizStats: 'id, scope',
      userPrefs: 'key',
      attempts: '++id, timestamp, moduleId, [moduleId+itemId+direction]',
      dailySummaries: '[date+moduleId], date, moduleId',
      progressionAssociations: 'progressionId',
      flashcardStates: 'cardId, nextReviewDate',
      modeAssociations: 'modeId',
      intervalDescriptions: 'intervalKey',
      songSections: 'id, songId, order, [songId+order]',
      songChords: 'id, songId, sectionId, [songId+sectionId+position]',
      songPracticeLog: 'id, songId, timestamp, [songId+timestamp]',
      songCrossKeyProgress: 'id, songId, sectionId, [songId+sectionId]',
      wantToLearn: 'id, addedDate, priority',
      drillSkills: 'id, kind, [kind+keyName+quality], [kind+keyName+scale], [kind+patternId+keyName], [kind+variant]',
      drillTypes: 'id, skillId, [skillId+order]',
      drillSessions: 'id, drillTypeId, skillId, timestamp, [skillId+timestamp], [drillTypeId+timestamp]',
      // Creative-time sessions (Just Play / Just Produce). Indexed by
      // timestamp for "this week / this month" aggregation and by
      // [mode+timestamp] so the dashboard can split play vs produce
      // time without scanning everything.
      creativeSessions: 'id, timestamp, mode, [mode+timestamp]',
    });
    this.version(11).stores({
      intervals: 'id, name, semitones',
      chordQualities: 'id, name, tier, family',
      chordShapes: 'id, chordId, key, inversion',
      songs: 'id, title, artist, addedDate, stage',
      sessions: 'id, date, focus',
      logicSkills: 'id, order',
      producerStats: 'id, pillar',
      quizStats: 'id, scope',
      userPrefs: 'key',
      attempts: '++id, timestamp, moduleId, [moduleId+itemId+direction]',
      dailySummaries: '[date+moduleId], date, moduleId',
      progressionAssociations: 'progressionId',
      flashcardStates: 'cardId, nextReviewDate',
      modeAssociations: 'modeId',
      intervalDescriptions: 'intervalKey',
      songSections: 'id, songId, order, [songId+order]',
      songChords: 'id, songId, sectionId, [songId+sectionId+position]',
      songPracticeLog: 'id, songId, timestamp, [songId+timestamp]',
      songCrossKeyProgress: 'id, songId, sectionId, [songId+sectionId]',
      wantToLearn: 'id, addedDate, priority',
      drillSkills: 'id, kind, [kind+keyName+quality], [kind+keyName+scale], [kind+patternId+keyName], [kind+variant]',
      drillTypes: 'id, skillId, [skillId+order]',
      drillSessions: 'id, drillTypeId, skillId, timestamp, [skillId+timestamp], [drillTypeId+timestamp]',
      creativeSessions: 'id, timestamp, mode, [mode+timestamp]',
      // Skills Catalogue user annotations — keyed by canonical
      // skillId so joins with derived module data are O(1).
      skillAnnotations: 'skillId, priority, updatedAt',
      // Harmonic Diary entries. Indexed on skillId for per-skill
      // lookup and legacySource so we can deduplicate across the
      // old per-module association tables on first migration.
      harmonicDiaryEntries: 'entryId, skillId, lastEdited, legacySource',
    });
  }
}

export const db = new AppDB();
