/**
 * Phase A sync table configuration.
 *
 * Every entry here names one Dexie table whose writes should be
 * mirrored to Supabase on change. Phase A deliberately omits tables
 * that use counters or auto-increment numeric ids — those need
 * additive-merge logic that last-write-wins would silently destroy:
 *
 *   intervals          (ascCorrect/ascTotal/descCorrect/descTotal)
 *   chordQualities     (correct/total)
 *   attempts           (++id auto-increment, needs UUID switch)
 *   dailySummaries     (correctCount/wrongCount — increment-merge)
 *   drillTypes         (repCount/totalSeconds)
 *   producerStats      (count)
 *   quizStats          (correct/wrong/streak/bestStreak)
 *
 * Phase B lands those with proper per-table merge rules.
 */

/** Top-level Postgres columns we extract from the Dexie row payload.
 *  The rest of the row lives in the `data` JSONB column. We only
 *  pull out values we actually index/query on server-side. */
export interface ColumnMapping {
  /** Dexie field name (camelCase). */
  dexie: string;
  /** Postgres column name (snake_case). */
  pg: string;
}

export interface SyncTableConfig {
  /** Dexie table name (camelCase). */
  dexie: string;
  /** Postgres table name (snake_case). */
  pg: string;
  /** The Dexie row field that holds the primary id. Most tables use
   *  'id' but several use natural keys (skillId, entryId, cardId, etc.). */
  idField: string;
  /** Per-row top-level Postgres columns to populate on push (beyond
   *  id / user_id / data / created_at / updated_at). */
  topLevel: ColumnMapping[];
}

/**
 * Phase A config, in deterministic order. Adding a new table here +
 * in the Postgres schema is all that's needed to bring it into sync.
 */
export const SYNC_TABLES: SyncTableConfig[] = [
  { dexie: 'songs', pg: 'songs', idField: 'id',
    topLevel: [{ dexie: 'addedDate', pg: 'added_date' }] },
  { dexie: 'songSections', pg: 'song_sections', idField: 'id',
    topLevel: [{ dexie: 'songId', pg: 'song_id' }] },
  { dexie: 'songChords', pg: 'song_chords', idField: 'id',
    topLevel: [
      { dexie: 'songId', pg: 'song_id' },
      { dexie: 'sectionId', pg: 'section_id' },
    ] },
  { dexie: 'songPracticeLog', pg: 'song_practice_log', idField: 'id',
    topLevel: [
      { dexie: 'songId', pg: 'song_id' },
      { dexie: 'timestamp', pg: 'timestamp' },
    ] },
  { dexie: 'songCrossKeyProgress', pg: 'song_cross_key_progress', idField: 'id',
    topLevel: [
      { dexie: 'songId', pg: 'song_id' },
      { dexie: 'sectionId', pg: 'section_id' },
      { dexie: 'keyName', pg: 'key_name' },
    ] },
  { dexie: 'wantToLearn', pg: 'want_to_learn', idField: 'id',
    topLevel: [{ dexie: 'addedDate', pg: 'added_date' }] },
  { dexie: 'sessions', pg: 'sessions', idField: 'id',
    topLevel: [{ dexie: 'date', pg: 'date' }] },
  { dexie: 'drillSessions', pg: 'drill_sessions', idField: 'id',
    topLevel: [
      { dexie: 'skillId', pg: 'skill_id' },
      { dexie: 'drillTypeId', pg: 'drill_type_id' },
      { dexie: 'timestamp', pg: 'timestamp' },
    ] },
  { dexie: 'drillSkills', pg: 'drill_skills', idField: 'id', topLevel: [] },
  { dexie: 'creativeSessions', pg: 'creative_sessions', idField: 'id',
    topLevel: [
      { dexie: 'timestamp', pg: 'timestamp' },
      { dexie: 'mode', pg: 'mode' },
    ] },
  { dexie: 'productionLessons', pg: 'production_lessons', idField: 'id',
    topLevel: [{ dexie: 'pathId', pg: 'path_id' }] },
  { dexie: 'productionLessonSessions', pg: 'production_lesson_sessions', idField: 'id',
    topLevel: [
      { dexie: 'lessonId', pg: 'lesson_id' },
      { dexie: 'timestamp', pg: 'timestamp' },
    ] },
  { dexie: 'glossaryTermStates', pg: 'glossary_term_states', idField: 'id', topLevel: [] },
  { dexie: 'referenceTracks', pg: 'reference_tracks', idField: 'id',
    topLevel: [{ dexie: 'addedAt', pg: 'added_at' }] },
  { dexie: 'lessonReferenceTracks', pg: 'lesson_reference_tracks', idField: 'id',
    topLevel: [
      { dexie: 'lessonId', pg: 'lesson_id' },
      { dexie: 'trackId', pg: 'track_id' },
    ] },
  { dexie: 'skillAnnotations', pg: 'skill_annotations', idField: 'skillId', topLevel: [] },
  { dexie: 'harmonicDiaryEntries', pg: 'harmonic_diary_entries', idField: 'entryId',
    topLevel: [{ dexie: 'skillId', pg: 'skill_id' }] },
  { dexie: 'progressionAssociations', pg: 'progression_associations', idField: 'progressionId', topLevel: [] },
  { dexie: 'modeAssociations', pg: 'mode_associations', idField: 'modeId', topLevel: [] },
  { dexie: 'intervalDescriptions', pg: 'interval_descriptions', idField: 'intervalKey', topLevel: [] },
  { dexie: 'flashcardStates', pg: 'flashcard_states', idField: 'cardId',
    topLevel: [{ dexie: 'nextReviewDate', pg: 'next_review_date' }] },
  { dexie: 'userPrefs', pg: 'user_prefs', idField: 'key', topLevel: [] },
  { dexie: 'logicSkills', pg: 'logic_skills', idField: 'id', topLevel: [] },
  { dexie: 'chordShapes', pg: 'chord_shapes', idField: 'id', topLevel: [] },

  // ----------------------------------------------------------
  // Practice Sessions + Goals (v16 / Phase 1, April 2026)
  // ----------------------------------------------------------
  { dexie: 'practiceSessions', pg: 'practice_sessions', idField: 'id',
    topLevel: [
      { dexie: 'startedAt', pg: 'started_at' },
      { dexie: 'lastEngagedAt', pg: 'last_engaged_at' },
    ] },
  { dexie: 'practiceBlocks', pg: 'practice_blocks', idField: 'id',
    topLevel: [{ dexie: 'sessionId', pg: 'session_id' }] },
  { dexie: 'goals', pg: 'goals', idField: 'id',
    topLevel: [
      { dexie: 'scope', pg: 'scope' },
      { dexie: 'status', pg: 'status' },
      { dexie: 'parentGoalId', pg: 'parent_goal_id' },
      { dexie: 'targetDate', pg: 'target_date' },
      { dexie: 'lastEngagedAt', pg: 'last_engaged_at' },
    ] },
  { dexie: 'dayProfiles', pg: 'day_profiles', idField: 'id',
    topLevel: [{ dexie: 'name', pg: 'name' }] },
  { dexie: 'vacationPeriods', pg: 'vacation_periods', idField: 'id',
    topLevel: [
      { dexie: 'startDate', pg: 'start_date' },
      { dexie: 'endDate', pg: 'end_date' },
    ] },
  { dexie: 'proficiencyDefinitions', pg: 'proficiency_definitions', idField: 'id',
    topLevel: [
      { dexie: 'level', pg: 'level' },
      { dexie: 'displayOrder', pg: 'display_order' },
    ] },
  { dexie: 'spacingState', pg: 'spacing_state', idField: 'id',
    topLevel: [
      { dexie: 'itemRef', pg: 'item_ref' },
      { dexie: 'moduleRef', pg: 'module_ref' },
      { dexie: 'nextDueAt', pg: 'next_due_at' },
      { dexie: 'acquisitionStage', pg: 'acquisition_stage' },
    ] },
  { dexie: 'prompts', pg: 'prompts', idField: 'id',
    topLevel: [
      { dexie: 'status', pg: 'status' },
      { dexie: 'tier', pg: 'tier' },
      { dexie: 'promptType', pg: 'prompt_type' },
      { dexie: 'surface', pg: 'surface' },
      { dexie: 'expiresAt', pg: 'expires_at' },
    ] },
];

/** Dexie table name → config lookup. */
export const SYNC_TABLE_BY_DEXIE: Map<string, SyncTableConfig> = new Map(
  SYNC_TABLES.map(cfg => [cfg.dexie, cfg]),
);

/** Whether a given Dexie table name is in the Phase A sync set. */
export function isSynced(dexieTableName: string): boolean {
  return SYNC_TABLE_BY_DEXIE.has(dexieTableName);
}
