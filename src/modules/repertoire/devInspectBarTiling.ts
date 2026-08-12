import { db } from '../../lib/db';
import {
  analyseSectionTiling,
  looksUndoubled,
  oddDurations,
  problemBarCount,
  shiftPlacementsBySlots,
} from './barTiling';

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

      const odd = oddDurations(section);
      if (odd.length > 0) {
        console.warn(
          `${odd.length} placement(s) carry an ODD duration. An odd value is ` +
            'legal on its own, but it flips the cascade cursor\'s parity, and ' +
            'every chord the cascade subsequently pushes then lands on an ' +
            '"and". This is where a contiguous offbeat run starts:',
        );
        console.table(odd);
      }

      for (const bar of t.bars) {
        if (bar.isEmpty) {
          console.log(`bar ${bar.barIndex}: empty`);
          continue;
        }
        const flags = [
          bar.looksLikePickup ? 'PICKUP (right-aligned, on the beat)' : '',
          bar.anyOffbeat ? 'has offbeat chords' : '',
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
  const shiftRows: Array<Record<string, unknown>> = [];
  const perSong = new Map<
    string,
    {
      problems: number;
      undoubled: number;
      bars: number;
      sections: number;
      pickups: number;
      offbeatBars: number;
      odd: number;
      fixedByShift: number;
    }
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
        pickups: 0,
        offbeatBars: 0,
        odd: 0,
        fixedByShift: 0,
      };
      agg.sections += 1;
      agg.bars += t.bars.filter(b => !b.isEmpty).length;
      agg.pickups += t.bars.filter(b => b.looksLikePickup).length;
      agg.odd += oddDurations(section).length;

      for (const bar of t.bars) {
        if (bar.isEmpty || bar.fillsBar || bar.looksLikePickup) continue;
        agg.problems += 1;
        if (bar.anyOffbeat) agg.offbeatBars += 1;
        const undoubled = looksUndoubled(bar);
        if (undoubled) agg.undoubled += 1;
        rows.push({
          song: song.title,
          section: t.sectionName,
          bar: bar.barIndex,
          'slots covered': `${bar.covered}/${bar.slotsPerBar}`,
          chords: bar.spans.length,
          offbeat: bar.anyOffbeat,
          gaps: bar.gaps.map(g => `[${g.from}-${g.to})`).join(' '),
          overlaps: bar.overlaps.length,
          'ties past end': bar.overflow,
          'looks undoubled': undoubled,
          'song on eighths': t.songOnEighths,
          'claims unit': t.claimedUnit,
        });
      }

      // Candidate repair, dry run: move every offbeat chord back one
      // slot and see whether the section then tiles. Tests the fix
      // instead of arguing for it. Nothing is written.
      if (t.problemBars.length > 0) {
        const before = t.problemBars.length;
        const shifted = shiftPlacementsBySlots(
          song,
          section,
          -1,
          p => p.offbeat === true,
        );
        const after = problemBarCount(song, section, shifted);
        shiftRows.push({
          song: song.title,
          section: t.sectionName,
          'problem bars before': before,
          'after shifting offbeats back 1 slot': after,
          resolves: after === 0 ? 'ALL' : after < before ? 'some' : 'none',
        });
        if (after === 0) agg.fixedByShift += 1;
      }

      perSong.set(song.title, agg);
    }
  }

  /* eslint-disable no-console */
  console.group('[auditBarTiling] DRY RUN — nothing is written');
  console.log(
    'A bar "fails to tile" when its chords leave slots uncovered or ' +
      'overlap. Empty bars are ignored — an empty bar is a legitimate rest. ' +
      'PICKUP bars are excluded too: a right-aligned partial bar with every ' +
      'chord on the beat is an anacrusis, not damage. The on-the-beat clause ' +
      'is what keeps a damaged bar, which also shows a leading gap, from ' +
      'being waved through as one.',
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
    console.log('Per song (pickups excluded from the problem count):');
    console.table(
      [...perSong.entries()]
        .map(([song, a]) => ({
          song,
          sections: a.sections,
          'non-empty bars': a.bars,
          pickups: a.pickups,
          'bars not tiling': a.problems,
          'of those, with offbeats': a.offbeatBars,
          'of those, look undoubled': a.undoubled,
          'odd durations': a.odd,
        }))
        .filter(r => r['non-empty bars'] > 0)
        .sort((x, y) => y['bars not tiling'] - x['bars not tiling']),
    );
  }

  if (shiftRows.length > 0) {
    console.group('Candidate repair, DRY RUN — nothing written');
    console.log(
      'Moves every chord carrying `offbeat` back one slot and re-tests the ' +
        'tiling. If a section resolves to zero problem bars, the damage is a ' +
        'uniform one-slot parity shift and the repair is determined. If it ' +
        'only partly resolves, the shift is not uniform and a blanket fix ' +
        'would be wrong.',
    );
    console.table(shiftRows);
    console.groupEnd();
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
