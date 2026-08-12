import { db } from '../../lib/db';
import { auditSongPositions } from './slotPositionAudit';

/**
 * DRY RUN for the `beatPos` damage shipped between 17d6927 (12.3) and
 * c08d840 (12.5). Reports which songs and sections hold slot-valued
 * positions, and writes nothing.
 *
 * See `slotPositionAudit.ts` for how damage is told apart from
 * legitimate data — the short version is that it reconstructs the
 * correct positions from phrase data rather than inferring anything
 * from value ranges, and names the cases where it cannot.
 *
 * Usage in the browser console, from anywhere in Repertoire:
 *
 *     await __auditSlotPositions()
 *
 * Pure inspection — no writes. Mirrors `__auditChordDurations`.
 */
export async function auditAllSlotPositions(): Promise<void> {
  const songs = await db.songs.toArray();
  const allSections = await db.songSections.toArray();
  const bySong = new Map<string, typeof allSections>();
  for (const s of allSections) {
    const list = bySong.get(s.songId);
    if (list) list.push(s);
    else bySong.set(s.songId, [s]);
  }

  const findings = songs.map(song =>
    auditSongPositions(song, bySong.get(song.id) ?? []),
  );
  const damaged = findings.filter(f => f.damagedPlacements > 0);
  const doubleDoubled = findings.filter(f => f.doubleDoubledPlacements > 0);
  const diverged = findings.filter(f => f.divergedPlacements > 0);

  const total = (pick: (f: (typeof findings)[number]) => number) =>
    findings.reduce((n, f) => n + pick(f), 0);

  /* eslint-disable no-console */
  console.group('[auditSlotPositions] DRY RUN — nothing is written');

  console.log(
    `${songs.length} songs · ${findings.filter(f => f.eighths).length} on eighths · ` +
      `${total(f => f.damagedPlacements)} placements with slot-valued beatPos · ` +
      `${total(f => f.invisiblePlacements)} currently invisible · ` +
      `${total(f => f.barsLost)} bars missing`,
  );

  if (damaged.length === 0) {
    console.log(
      'No slot-encoded positions found. Note the detector cannot see a ' +
        'damaged chord at beatPos 0 — slot 0 and beat 0 are the same ' +
        'number, so the stored value is correct either way and there is ' +
        'nothing to repair.',
    );
  } else {
    console.warn(`${damaged.length} song(s) hold slot-valued positions:`);
    console.table(
      damaged.map(f => ({
        song: f.title,
        'damaged placements': f.damagedPlacements,
        invisible: f.invisiblePlacements,
        'bars missing': f.barsLost,
        'anchors affected': f.anchorsInDamagedSections,
      })),
    );

    console.group('Per section — stored vs. reconstructed');
    for (const f of damaged) {
      for (const s of f.sections) {
        if (s.damaged.length === 0) continue;
        console.log(
          `${f.title} › ${s.sectionName} — ${s.beatsPerBar}/4, ` +
            `${s.inSlotUnits ? 'slot units' : 'beats'}, ` +
            `bars ${s.barsNow} now vs ${s.barsIfRepaired} repaired`,
        );
        console.table(
          s.damaged.map(p => ({
            placement: p.placementId,
            'beatPos stored': p.storedBeatPos,
            'beatPos correct': p.expectedBeatPos,
            'offbeat correct': p.expectedOffbeat,
            'beats stored': p.storedBeats,
            duration: p.duration,
            'dropped from grid': p.invisible,
          })),
        );
      }
    }
    console.groupEnd();
  }

  if (doubleDoubled.length > 0) {
    console.warn(
      'Durations doubled TWICE — materialised unstamped in the 12.3→12.4 ' +
        'window, then doubled again by the repair. These are 4× their ' +
        'original length:',
    );
    console.table(
      doubleDoubled.flatMap(f =>
        f.sections.flatMap(s =>
          s.doubleDoubled.map(p => ({
            song: f.title,
            section: s.sectionName,
            placement: p.placementId,
            'beats stored': p.storedBeats,
            'beats original': p.expectedBeats,
            'should be': p.expectedBeats * 2,
          })),
        ),
      ),
    );
  }

  if (diverged.length > 0) {
    console.log(
      `${total(f => f.divergedPlacements)} placement(s) differ from the ` +
        'reconstruction in a way that is NOT the slot fingerprint — almost ' +
        'certainly chords moved or edited since materialisation, not this ' +
        'defect. Listed so a clean result is not claimed over data the ' +
        'detector cannot account for:',
    );
    console.table(
      diverged.flatMap(f =>
        f.sections.flatMap(s =>
          s.diverged.map(p => ({
            song: f.title,
            section: s.sectionName,
            placement: p.placementId,
            'beatPos stored': p.storedBeatPos,
            'beatPos rebuilt': p.expectedBeatPos,
            'beats stored': p.storedBeats,
            duration: p.duration,
          })),
        ),
      ),
    );
  }

  const unreconstructable = findings.reduce(
    (n, f) => n + f.sections.reduce((m, s) => m + s.unreconstructable, 0),
    0,
  );
  if (unreconstructable > 0) {
    console.log(
      `${unreconstructable} materialised placement(s) have no counterpart in ` +
        'the reconstruction — their phrases were edited after materialisation, ' +
        'so the detector can say nothing about them either way.',
    );
  }

  // --- Lyric side ---------------------------------------------------
  const orphaned = findings.flatMap(f =>
    f.orphanedAnchors.map(a => ({ song: f.title, ...a })),
  );
  console.group('Lyric anchors');
  console.log(
    'Anchors were never written with slot values — the drop path converts ' +
      'through slotToPosition, which is why turning eighths on was a no-op ' +
      'for placed lyrics. Nothing on the lyric side is corrupt. What follows ' +
      'is collateral only.',
  );
  console.log(
    `${total(f => f.anchorsInDamagedSections)} anchor(s) sit in a damaged ` +
      'section: they still point at the beat they always did, but the chords ' +
      'around them moved or vanished, so they will appear to re-align when ' +
      'the chords are repaired.',
  );
  if (orphaned.length === 0) {
    console.log('No anchors point past the end of their section.');
  } else {
    console.warn(
      `${orphaned.length} anchor(s) point past the last bar their section ` +
        'currently renders — orphaned by placements the grid dropped:',
    );
    console.table(orphaned);
  }
  console.groupEnd();

  console.log('Per song:');
  console.table(
    findings
      .filter(f => f.sections.length > 0)
      .map(f => ({
        song: f.title,
        eighths: f.eighths,
        sections: f.sections.length,
        damaged: f.damagedPlacements,
        invisible: f.invisiblePlacements,
        'double-doubled': f.doubleDoubledPlacements,
        diverged: f.divergedPlacements,
        'bars missing': f.barsLost,
      }))
      .sort((x, y) => y.damaged - x.damaged || y.diverged - x.diverged),
  );

  console.groupEnd();
  /* eslint-enable no-console */
}

declare global {
  interface Window {
    __auditSlotPositions?: typeof auditAllSlotPositions;
  }
}

if (typeof window !== 'undefined') {
  window.__auditSlotPositions = auditAllSlotPositions;
}
