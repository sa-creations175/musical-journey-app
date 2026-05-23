// SM-2 drill queue for the Chord Progression Quiz. The item set is
// dynamic — one entry per (quizzable repertoire section × question type)
// — so the queue is enumerated from the user's songs at load time, then
// ordered like the other SR drills: unseen first, then most-overdue,
// then soonest-future. Each (section, type) is an independent SM-2 row,
// so a section's easy types can surface before its hard ones.

import type { ChordFunction, Song, SongSection } from '../../../lib/db';
import { db } from '../../../lib/db';
import {
  CHORD_PROGRESSION_QUIZ_MODULE_REF,
  QUIZ_TYPES,
  type QuizType,
  hasChartData,
  progressionSignature,
  quizItemRef,
  romanLine,
  sectionBarCount,
  sectionChords,
} from './progressionQuiz';

/** A multiple-choice item needs at least this many distinct distractor
 *  progressions from OTHER songs to be worth posing. */
const MC_MIN_DISTRACTORS = 3;

export interface ProgressionQuizItem {
  /** SM-2 itemRef (cpq:<songId>:<sectionId>:<type>). */
  itemRef: string;
  /** Which question type this item poses. */
  type: QuizType;
  song: Song;
  section: SongSection;
  /** "[Song] — [Section]" prompt label (the drill appends "in the key of
   *  X" for transposition types). */
  prompt: string;
  /** Ordered chords as charted (for the bar-grid reveal). */
  chords: ChordFunction[];
  /** "I - vi - ii - V7" — the answer line + multiple-choice comparison key. */
  romanLine: string;
  /** Key-independent progression signature (for distractor de-duping). */
  signature: string;
  /** Bar count from the derived grid (Type 4 answer). */
  barCount: number;
}

export interface QuizSpacingRow {
  itemRef: string;
  nextDueAt: number | null;
}

/** Base per-section data, before fanning out to typed items. */
interface SectionBase {
  song: Song;
  section: SongSection;
  prompt: string;
  chords: ChordFunction[];
  romanLine: string;
  signature: string;
  barCount: number;
}

/** Build quiz items: one per (quizzable section × applicable type).
 *  Sections whose song is missing or that have no charted chords are
 *  skipped. The multiple-choice type is only emitted for sections that
 *  have enough distinct distractor progressions in OTHER songs. Pure. */
export function enumerateQuizItems(
  songs: ReadonlyArray<Song>,
  sections: ReadonlyArray<SongSection>,
): ProgressionQuizItem[] {
  const songById = new Map(songs.map(s => [s.id, s]));
  // Stable order: by song learning-order then section order, so the
  // enumeration tie-break in the queue is deterministic.
  const ordered = sections.slice().sort((a, b) => {
    const sa = songById.get(a.songId);
    const sb = songById.get(b.songId);
    const la = sa?.learningOrder ?? Number.MAX_SAFE_INTEGER;
    const lb = sb?.learningOrder ?? Number.MAX_SAFE_INTEGER;
    if (la !== lb) return la - lb;
    return a.order - b.order;
  });

  const bases: SectionBase[] = [];
  for (const section of ordered) {
    const song = songById.get(section.songId);
    if (!song) continue;
    if (!hasChartData(song, section)) continue;
    const chords = sectionChords(song, section);
    bases.push({
      song,
      section,
      prompt: `${song.title} — ${section.name}`,
      chords,
      romanLine: romanLine(chords),
      signature: progressionSignature(chords),
      barCount: sectionBarCount(song, section),
    });
  }

  const items: ProgressionQuizItem[] = [];
  for (const base of bases) {
    const types = applicableTypes(base, bases);
    for (const type of types) {
      items.push({
        itemRef: quizItemRef(base.song.id, base.section.id, type),
        type,
        song: base.song,
        section: base.section,
        prompt: base.prompt,
        chords: base.chords,
        romanLine: base.romanLine,
        signature: base.signature,
        barCount: base.barCount,
      });
    }
  }
  return items;
}

/** Which question types apply to a section. All types apply except `mc`,
 *  which needs enough distinct distractor progressions from other songs. */
function applicableTypes(target: SectionBase, all: ReadonlyArray<SectionBase>): QuizType[] {
  const distinctOtherLines = new Set<string>();
  for (const b of all) {
    if (b.song.id === target.song.id) continue;
    if (b.romanLine === target.romanLine) continue;
    distinctOtherLines.add(b.romanLine);
  }
  const mcViable = distinctOtherLines.size >= MC_MIN_DISTRACTORS;
  return QUIZ_TYPES.filter(t => t !== 'mc' || mcViable);
}

/**
 * Pure ordering: unseen first, then by `nextDueAt` ascending (overdue →
 * soonest-future), enumeration order breaking ties. Mirrors the mental-
 * viz queue so the drills behave consistently.
 */
export function orderQuizQueue(
  items: ReadonlyArray<ProgressionQuizItem>,
  rows: ReadonlyArray<QuizSpacingRow>,
): ProgressionQuizItem[] {
  const dueByRef = new Map<string, number | null>();
  for (const r of rows) dueByRef.set(r.itemRef, r.nextDueAt);
  const keyFor = (item: ProgressionQuizItem): number => {
    if (!dueByRef.has(item.itemRef)) return -Infinity; // unseen leads
    return dueByRef.get(item.itemRef) ?? 0;
  };
  return items
    .map((item, i) => ({ item, i, key: keyFor(item) }))
    .sort((a, b) => a.key - b.key || a.i - b.i)
    .map(e => e.item);
}

/** Filter an ordered item list to a single song, preserving order. Used
 *  by the song-filtered drill mode (chord-quiz warm-up → ?songId=X): the
 *  walked queue is scoped to one song, while the full list still feeds
 *  the multiple-choice distractor pool (which draws from other songs). */
export function filterItemsBySong(
  items: ReadonlyArray<ProgressionQuizItem>,
  songId: string,
): ProgressionQuizItem[] {
  return items.filter(i => i.song.id === songId);
}

/** Roman-line distractor pool for a target item: progressions from OTHER
 *  songs (never the same song, so a distractor can't be a passing-chord
 *  variation of the same chart), excluding lines identical to the
 *  target's. Pure. */
export function distractorPoolFor(
  target: ProgressionQuizItem,
  allItems: ReadonlyArray<ProgressionQuizItem>,
): string[] {
  const pool: string[] = [];
  const seen = new Set<string>([target.romanLine]);
  for (const item of allItems) {
    if (item.song.id === target.song.id) continue;
    if (seen.has(item.romanLine)) continue;
    seen.add(item.romanLine);
    pool.push(item.romanLine);
  }
  return pool;
}

/** Load songs + sections + spacing rows and return the ordered queue. */
export async function loadProgressionQuizQueue(): Promise<ProgressionQuizItem[]> {
  const [songs, sections, rows] = await Promise.all([
    db.songs.toArray(),
    db.songSections.toArray(),
    db.spacingState
      .where('moduleRef')
      .equals(CHORD_PROGRESSION_QUIZ_MODULE_REF)
      .toArray(),
  ]);
  const items = enumerateQuizItems(songs, sections);
  return orderQuizQueue(
    items,
    rows.map(r => ({ itemRef: r.itemRef, nextDueAt: r.nextDueAt ?? null })),
  );
}
