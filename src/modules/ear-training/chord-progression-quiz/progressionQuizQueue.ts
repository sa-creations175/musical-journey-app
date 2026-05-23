// SM-2 drill queue for the Chord Progression Quiz. The item set is
// dynamic — one entry per quizzable repertoire section (a section with
// chords actually charted) — so the queue is enumerated from the user's
// songs at load time, then ordered like the other SR drills: unseen
// first, then most-overdue, then soonest-future.

import type { ChordFunction, Song, SongSection } from '../../../lib/db';
import { db } from '../../../lib/db';
import {
  CHORD_PROGRESSION_QUIZ_MODULE_REF,
  concreteLine,
  hasChartData,
  progressionSignature,
  quizItemRef,
  romanLine,
  sectionBarCount,
  sectionChords,
} from './progressionQuiz';

export interface ProgressionQuizItem {
  /** SM-2 itemRef (cpq:<songId>:<sectionId>). */
  itemRef: string;
  song: Song;
  section: SongSection;
  /** "[Song] — [Section]" prompt label. */
  prompt: string;
  /** Ordered chords as charted (for the bar-grid reveal). */
  chords: ChordFunction[];
  /** "I - vi - ii - V7" — the answer line + multiple-choice comparison key. */
  romanLine: string;
  /** "Cm - Ab - Dm7b5 - G7" for the song's key. */
  concreteLine: string;
  /** Key-independent progression signature (for distractor de-duping). */
  signature: string;
  /** Bar count from the derived grid (Type 4 answer). */
  barCount: number;
}

export interface QuizSpacingRow {
  itemRef: string;
  nextDueAt: number | null;
}

/** Build a quiz item per quizzable section (chart data present), joining
 *  each section to its song. Sections whose song is missing or that have
 *  no charted chords are skipped. Pure. */
export function enumerateQuizItems(
  songs: ReadonlyArray<Song>,
  sections: ReadonlyArray<SongSection>,
): ProgressionQuizItem[] {
  const songById = new Map(songs.map(s => [s.id, s]));
  const items: ProgressionQuizItem[] = [];
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
  for (const section of ordered) {
    const song = songById.get(section.songId);
    if (!song) continue;
    if (!hasChartData(song, section)) continue;
    const chords = sectionChords(song, section);
    items.push({
      itemRef: quizItemRef(song.id, section.id),
      song,
      section,
      prompt: `${song.title} — ${section.name}`,
      chords,
      romanLine: romanLine(chords),
      concreteLine: concreteLine(chords, song.key),
      signature: progressionSignature(chords),
      barCount: sectionBarCount(song, section),
    });
  }
  return items;
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
