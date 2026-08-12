import { db } from '../../lib/db';
import { analyseSectionTiling, looksUndoubled } from './barTiling';

/**
 * RAW DUMP of what a song's bars actually contain, in slots. Reads
 * only; writes nothing.
 *
 * Two entry points, from anywhere in Repertoire:
 *
 *     await __dumpBars('O Come')          // every bar, values verbatim
 *     await __auditBarTiling()            // scope: every song, gaps + overlaps
 *
 * `__dumpBars` interprets nothing. It prints stored `beatPos`,
 * `offbeat` and `beats` exactly as they sit in Dexie, plus the slot
 * arithmetic those values imply, so a bar that looks wrong on screen
 * can be read against a bar that looks right.
 */

function unitWarning(
  claimedUnit: 'slots' | 'beats',
  songOnEighths: boolean,
): string {
  if (songOnEighths && claimedUnit === 'beats') {
    return 'song is on eighths but this section is UNSTAMPED — durations ' +
      'should be read as beats, and the grid measures in slots';
  }
  if (!songOnEighths && claimedUnit === 'slots') {
    return 'section claims slot units but the song is in beats — drift';
  }
  return '';
}

export async function dumpBars(titleFragment = ''): Promise<void> {
  const songs = await db.songs.toArray();
  const needle = titleFragment.trim().toLowerCase();
  const matches = needle
    ? songs.filter(s => s.title.toLowerCase().includes(needle))
    : songs;

  /* eslint-disable no-console */
  console.group(`[dumpBars] ${matches.length} song(s) — READ ONLY`);
  if (matches.length === 0) {
    console.warn(`No song title contains "${titleFragment}".`);
    console.log('Titles:', songs.map(s => s.title));
    console.groupEnd();
    return;
  }

  for (const song of matches) {
    const sections = (await db.songSections.where('songId').equals(song.id).toArray())
      .slice()
      .sort((a, b) => a.order - b.order);

    console.group(
      `${song.title} — eighths: ${song.eighths === true}, ` +
        `timeSignature: ${song.timeSignature ?? '(unset)'}`,
    );

    for (const section of sections) {
      const t = analyseSectionTiling(song, section);
      if (!t) {
        console.log(
          `${section.name} — no stored chordPlacements (still legacy ` +
            'phrase-anchored); nothing to dump.',
        );
        continue;
      }

      const warn = unitWarning(t.claimedUnit, t.songOnEighths);
      console.group(
        `${t.sectionName} — ${t.beatsPerBar}/4, ${t.slotsPerBar} slots/bar, ` +
          `stamp: ${t.stamp ?? 'absent'} (claims ${t.claimedUnit}), ` +
          `${t.placements} placements, ${t.bars.length} bars` +
          (warn ? ` — ${warn}` : ''),
      );

      for (const bar of t.bars) {
        if (bar.isEmpty) {
          console.log(`bar ${bar.barIndex}: empty`);
          continue;
        }
        const flags = [
          bar.fillsBar ? 'fills bar' : 'DOES NOT FILL',
          bar.gaps.length
            ? `gaps ${bar.gaps.map(g => `[${g.from}-${g.to})`).join(' ')}`
            : '',
          bar.overlaps.length ? `overlaps at ${bar.overlaps.join(',')}` : '',
          bar.overflow ? `${bar.overflow} slot(s) tie past bar end` : '',
          looksUndoubled(bar) ? 'PATTERN: durations look undoubled' : '',
        ]
          .filter(Boolean)
          .join(' · ');

        console.log(
          `bar ${bar.barIndex}: ${bar.covered}/${bar.slotsPerBar} slots — ${flags}`,
        );
        console.table(
          bar.spans.map(s => ({
            chord: s.label,
            'beatPos (stored)': s.beatPos,
            'offbeat (stored)': s.offbeat,
            'beats (stored)': s.beats,
            'start slot': s.startSlot,
            'end slot': s.endSlot,
            placement: s.placementId,
          })),
        );
      }

      console.groupEnd();
    }
    console.groupEnd();
  }
  console.groupEnd();
  /* eslint-enable no-console */
}

/**
 * SCOPE. Every song, every migrated section: which bars fail to tile.
 * Answers "how widespread is this" without interpreting any single
 * bar.
 */
export async function auditBarTiling(): Promise<void> {
  const songs = await db.songs.toArray();
  const allSections = await db.songSections.toArray();

  const rows: Array<Record<string, unknown>> = [];
  const perSong = new Map<
    string,
    { problems: number; undoubled: number; bars: number; sections: number }
  >();

  for (const song of songs) {
    const sections = allSections
      .filter(s => s.songId === song.id)
      .sort((a, b) => a.order - b.order);
    for (const section of sections) {
      const t = analyseSectionTiling(song, section);
      if (!t) continue;
      const agg = perSong.get(song.title) ?? {
        problems: 0,
        undoubled: 0,
        bars: 0,
        sections: 0,
      };
      agg.sections += 1;
      agg.bars += t.bars.filter(b => !b.isEmpty).length;
      for (const bar of t.bars) {
        if (bar.isEmpty || bar.fillsBar) continue;
        agg.problems += 1;
        const undoubled = looksUndoubled(bar);
        if (undoubled) agg.undoubled += 1;
        rows.push({
          song: song.title,
          section: t.sectionName,
          bar: bar.barIndex,
          'slots covered': `${bar.covered}/${bar.slotsPerBar}`,
          chords: bar.spans.length,
          gaps: bar.gaps.map(g => `[${g.from}-${g.to})`).join(' '),
          overlaps: bar.overlaps.length,
          'looks undoubled': undoubled,
          'song on eighths': t.songOnEighths,
          'claims unit': t.claimedUnit,
        });
      }
      perSong.set(song.title, agg);
    }
  }

  /* eslint-disable no-console */
  console.group('[auditBarTiling] DRY RUN — nothing is written');
  console.log(
    'A bar "fails to tile" when its chords leave slots uncovered or ' +
      'overlap. Empty bars are ignored — an empty bar is a legitimate ' +
      'rest, not a defect.',
  );
  console.log(
    '"looks undoubled" means every chord in the bar would tile it exactly ' +
      'if its duration doubled, AND each chord starts where the previous ' +
      'one would then end. That is the signature of durations counted in ' +
      'beats inside a bar measured in slots. It is a HYPOTHESIS, not proof: ' +
      'a bar with genuine rests can coincide with it.',
  );

  if (rows.length === 0) {
    console.log('Every non-empty bar tiles cleanly.');
  } else {
    console.warn(`${rows.length} bar(s) do not tile:`);
    console.table(rows);
    console.log('Per song:');
    console.table(
      [...perSong.entries()]
        .map(([song, a]) => ({
          song,
          sections: a.sections,
          'non-empty bars': a.bars,
          'bars not tiling': a.problems,
          'of those, look undoubled': a.undoubled,
        }))
        .filter(r => r['non-empty bars'] > 0)
        .sort((x, y) => y['bars not tiling'] - x['bars not tiling']),
    );
  }
  console.groupEnd();
  /* eslint-enable no-console */
}

declare global {
  interface Window {
    __dumpBars?: typeof dumpBars;
    __auditBarTiling?: typeof auditBarTiling;
  }
}

if (typeof window !== 'undefined') {
  window.__dumpBars = dumpBars;
  window.__auditBarTiling = auditBarTiling;
}
