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

export interface SongSection {
  id: string;
  songId: string;
  /** Display name — "Verse 1", "Chorus", "Bridge", "Outro", etc. */
  name: string;
  /** Ordering within the song (0-indexed). */
  order: number;
  /** Pre-populated seed lyrics or empty string. One line per row when
   *  rendered; newlines are preserved. */
  lyrics: string;
  /** When true, the section's seed lyrics came from a source the author
   *  couldn't fully verify — surface a "needs verification" hint. */
  lyricsNeedsVerification?: boolean;
  /** User-entered chord chart aligned to lyrics. One line per lyric
   *  line; chord tokens separated by spaces. Starts empty. */
  basicChords?: string;
  /** Optional alternate/substitution chord chart the user explores. */
  alternateChords?: string;
  /** Per-line strike-through flags (line index → true). */
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
  }
}

export const db = new AppDB();
