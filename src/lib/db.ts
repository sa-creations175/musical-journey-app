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

export interface Song {
  id: string;
  title: string;
  artist: string;
  genre?: string;
  key?: string;
  tempo?: number;
  addedDate: number;
  notes?: string;
  technical: boolean;
  byEar: boolean;
  memorized: boolean;
  progressionAnalyzed: boolean;
  recorded: boolean;
  audioLinks: string[];
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
  }
}

export const db = new AppDB();
