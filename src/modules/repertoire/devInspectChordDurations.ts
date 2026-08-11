import { db } from '../../lib/db';
import { auditChordDurations } from './eighthsMigration';

/**
 * DRY RUN for the eighths duration migration. Reads every song's
 * sections and reports exactly what the migration would do — and
 * writes nothing.
 *
 * This exists because the migration rewrites a field on every chord
 * placement in every song, and that is where silent corruption lives.
 * The data is in the user's IndexedDB behind their own auth, so it
 * cannot be inspected from outside the browser; this is the way to
 * look at it before anything touches it.
 *
 * Usage in the browser console, from anywhere in Repertoire:
 *
 *     await __auditChordDurations()
 *
 * Pure inspection — no writes. Mirrors `devInspectSongKeys`.
 */
export async function auditAllChordDurations(): Promise<void> {
  const songs = await db.songs.toArray();
  const sections = await db.songSections.toArray();
  const bySong = new Map<string, typeof sections>();
  for (const s of sections) {
    const list = bySong.get(s.songId);
    if (list) list.push(s);
    else bySong.set(s.songId, [s]);
  }

  const overall = auditChordDurations(sections);

  /* eslint-disable no-console */
  console.group('[auditChordDurations] DRY RUN — nothing is written');
  console.log(
    `${songs.length} songs · ${overall.sections} migrated sections · ` +
      `${overall.placements} chord placements would be doubled`,
  );

  console.log('Current duration values (commonest first):');
  console.table(
    overall.histogram.map(h => ({
      'beats now': h.beats,
      'eighths after': h.beats * 2,
      count: h.count,
    })),
  );

  if (overall.anomalies.length === 0) {
    console.log('No anomalies: every value is a positive integer, so the');
    console.log('doubling is exactly reversible by halving.');
  } else {
    console.warn(
      `${overall.anomalies.length} anomalous value(s) — these would still ` +
        'be doubled, but halving them back would NOT round-trip:',
    );
    console.table(
      overall.anomalies.map(a => ({
        song:
          songs.find(s => bySong.get(s.id)?.some(x => x.id === a.sectionId))
            ?.title ?? '(unknown)',
        section: a.sectionId,
        placement: a.placementId,
        beats: a.beats,
        reason: a.reason,
      })),
    );
  }

  console.log('Per song:');
  console.table(
    songs
      .map(song => {
        const a = auditChordDurations(bySong.get(song.id) ?? []);
        return {
          song: song.title,
          sections: a.sections,
          placements: a.placements,
          anomalies: a.anomalies.length,
        };
      })
      .filter(r => r.placements > 0)
      .sort((x, y) => y.placements - x.placements),
  );
  console.groupEnd();
  /* eslint-enable no-console */
}

declare global {
  interface Window {
    __auditChordDurations?: typeof auditAllChordDurations;
  }
}

if (typeof window !== 'undefined') {
  window.__auditChordDurations = auditAllChordDurations;
}
