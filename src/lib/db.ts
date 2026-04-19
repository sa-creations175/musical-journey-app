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
}

export interface DailySummary {
  date: string; // YYYY-MM-DD, local day
  moduleId: string;
  correctCount: number;
  wrongCount: number;
  dailyGoal: number;
  goalMet: boolean;
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
  }
}

export const db = new AppDB();
