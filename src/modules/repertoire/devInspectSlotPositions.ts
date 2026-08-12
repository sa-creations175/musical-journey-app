import { db } from '../../lib/db';
import { auditSongPositions, type SongFinding } from './slotPositionAudit';

/**
 * DRY RUN for the `beatPos` damage shipped between 17d6927 (12.3) and
 * c08d840 (12.5). Reports which songs hold slot-valued positions, and
 * writes nothing.
 *
 * See `slotPositionAudit.ts` for how damage is told apart from
 * legitimate data, and for the blind spots — which this output repeats
 * every run rather than leaving in the source, because a detector is
 * only trustworthy if its limits travel with its results.
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
  const withSections = findings.filter(f => f.sections.length > 0);
  const onEighths = withSections.filter(f => f.eighths);

  const total = (pick: (f: SongFinding) => number) =>
    findings.reduce((n, f) => n + pick(f), 0);
  const rows = (pick: (f: SongFinding) => unknown[]) =>
    findings.flatMap(f => pick(f));

  /* eslint-disable no-console */
  console.group('[auditSlotPositions] DRY RUN — nothing is written');

  console.log(
    `${songs.length} songs · ${withSections.length} with migrated sections · ` +
      `${onEighths.length} on eighths and therefore assessed for damage`,
  );
  console.log(
    `${total(f => f.damagedPlacements)} damaged · ` +
      `${total(f => f.ambiguousPlacements)} ambiguous · ` +
      `${total(f => f.invisiblePlacements)} invisible · ` +
      `${total(f => f.barsLost)} bars missing · ` +
      `${total(f => f.stampMismatches)} stamp mismatches`,
  );

  if (onEighths.length < withSections.length) {
    console.log(
      `${withSections.length - onEighths.length} song(s) are not on eighths ` +
        'and are NOT assessed for damage. That is correct rather than a gap: ' +
        'with eighths off the packer counts beats, so beatPos is written ' +
        'correctly and this defect cannot reach them.',
    );
  }

  // --- Decisive damage ----------------------------------------------
  const damaged = findings.filter(f => f.damagedPlacements > 0);
  if (damaged.length === 0) {
    console.log('No slot-encoded positions found.');
  } else {
    console.warn(`${damaged.length} song(s) hold slot-valued positions:`);
    console.table(
      rows(f =>
        f.sections.flatMap(s =>
          s.damaged.map(p => ({
            song: f.title,
            section: s.sectionName,
            placement: p.placementId,
            'beatPos stored': p.storedBeatPos,
            'beatPos correct': p.expectedBeatPos,
            'offbeat correct': p.expectedOffbeat,
            'beats stored': p.storedBeats,
            duration: p.duration,
            'dropped from grid': p.invisible,
          })),
        ),
      ),
    );
  }

  // --- Ambiguous, explicitly not damage -----------------------------
  const ambiguous = findings.filter(f => f.ambiguousPlacements > 0);
  if (ambiguous.length > 0) {
    console.log(
      `${total(f => f.ambiguousPlacements)} placement(s) sit at exactly twice ` +
        'their reconstructed beat but still inside beat range. An ordinary ' +
        'drag one beat right produces the same number, so these are NOT ' +
        'counted as damage and should not be repaired on this evidence alone:',
    );
    console.table(
      rows(f =>
        f.sections.flatMap(s =>
          s.ambiguous.map(p => ({
            song: f.title,
            section: s.sectionName,
            placement: p.placementId,
            'beatPos stored': p.storedBeatPos,
            'beatPos rebuilt': p.expectedBeatPos,
            'could be': 'slot encoding OR a drag',
          })),
        ),
      ),
    );
  }

  // --- Double-doubled durations -------------------------------------
  const doubled = findings.filter(f => f.doubleDoubledPlacements > 0);
  if (doubled.length > 0) {
    console.warn(
      'Durations doubled TWICE — materialised unstamped in the 12.3→12.4 ' +
        'window, then doubled again by the repair. 4× their original:',
    );
    console.table(
      rows(f =>
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

  // --- Stamp state, for EVERY section -------------------------------
  console.group('Unit stamp — every migrated section');
  console.log(
    'Reported for all sections, not just suspect ones, so a clean result ' +
      'can be confirmed instead of assumed.',
  );
  console.table(
    rows(f =>
      f.sections.map(s => ({
        song: f.title,
        section: s.sectionName,
        'song on eighths': f.eighths,
        'section unit': s.inSlotUnits ? 'slots' : 'beats',
        agree: s.stampMismatch === null,
        mismatch: s.stampMismatch ?? '',
        placements: s.placements,
        'bars now': s.barsNow,
        'bars if repaired': s.barsIfRepaired,
      })),
    ),
  );
  if (total(f => f.stampMismatches) > 0) {
    console.warn(
      'A "section-slots-song-beats" mismatch is real drift: the section ' +
        'claims slot units while the song says beats. ' +
        '"section-unstamped-song-eighths" is milder — either the lazy repair ' +
        'has not run for that song yet, or the section is genuinely in beats.',
    );
  }
  console.groupEnd();

  // --- Editing, which is not damage ---------------------------------
  console.group('Edited since migration — a diagnostic, NOT a health signal');
  console.log(
    'Once a section is migrated, edits go to placements and never back to ' +
      'phrases. The reconstruction is a frozen snapshot of the ' +
      'pre-migration state, so divergence from it accumulates permanently ' +
      'and harmlessly with ordinary use. A high count here means the ' +
      'section has been worked on. It implies nothing about correctness.',
  );
  console.log(
    'One action can move many placements: cascadeChordPlacements pushes ' +
      'everything after a lengthened chord forward (beat-only), and a bar ' +
      'delete or reorder shifts every downstream barIndex (bar-only). So a ' +
      'large bar-only count is likely ONE reorder, not many edits.',
  );
  const shapeCounts = { 'bar-only': 0, 'beat-only': 0, both: 0 };
  for (const f of findings) {
    for (const s of f.sections) {
      for (const p of s.edited) {
        if (p.editShape) shapeCounts[p.editShape] += 1;
      }
    }
  }
  console.table([shapeCounts]);
  if (total(f => f.editedPlacements) > 0) {
    console.table(
      rows(f =>
        f.sections
          .filter(s => s.edited.length > 0)
          .map(s => ({
            song: f.title,
            section: s.sectionName,
            edited: s.edited.length,
            'bar-only': s.edited.filter(p => p.editShape === 'bar-only').length,
            'beat-only': s.edited.filter(p => p.editShape === 'beat-only').length,
            both: s.edited.filter(p => p.editShape === 'both').length,
          })),
      ),
    );
  }
  console.groupEnd();

  // --- Lyric side ----------------------------------------------------
  const orphaned = findings.flatMap(f =>
    f.orphanedAnchors.map(a => ({ song: f.title, ...a })),
  );
  console.group('Lyric anchors');
  console.log(
    'Anchors were never written with slot values — the drop path converts ' +
      'through slotToPosition, which is why turning eighths on was a no-op ' +
      'for placed lyrics. Nothing on the lyric side is corrupt; what follows ' +
      'is collateral only.',
  );
  console.log(
    `${total(f => f.anchorsInDamagedSections)} anchor(s) sit in a section with ` +
      'decisive damage: they still point at the beat they always did, but the ' +
      'chords around them moved, so they will appear to re-align once the ' +
      'chords are repaired.',
  );
  if (orphaned.length === 0) {
    console.log('No anchors point past the end of their section.');
  } else {
    console.warn(`${orphaned.length} anchor(s) point past their section's last bar:`);
    console.table(orphaned);
  }
  console.groupEnd();

  // --- Limits, every run ---------------------------------------------
  const unreconstructable = findings.reduce(
    (n, f) => n + f.sections.reduce((m, s) => m + s.unreconstructable, 0),
    0,
  );
  const handAdded = findings.reduce(
    (n, f) => n + f.sections.reduce((m, s) => m + s.handAdded, 0),
    0,
  );
  console.group('What this detector CANNOT see');
  console.log(
    '1. A damaged chord at beatPos 0. Slot 0 and beat 0 are the same ' +
      'number, so it is invisible here — and harmless, the stored value is ' +
      'correct either way.',
  );
  console.log(
    '2. The difference between slot encoding and a drag, for any position ' +
      'still inside beat range. In 4/4 that is beat 1 reading as 2. Those ' +
      'are in the ambiguous bucket above, never counted as damage.',
  );
  console.log(
    `3. Sections whose phrases changed after migration — ${unreconstructable} ` +
      'placement(s) have no counterpart in the reconstruction, so nothing ' +
      'can be said about them either way.',
  );
  console.log(
    `4. Hand-added placements — ${handAdded} skipped. This defect only ever ` +
      'touched materialisation, so a chord added by hand was never at risk.',
  );
  console.log(
    '5. Non-eighths songs, by design. The defect cannot reach them.',
  );
  console.groupEnd();

  console.log('Per song:');
  console.table(
    withSections
      .map(f => ({
        song: f.title,
        eighths: f.eighths,
        assessed: f.eighths,
        sections: f.sections.length,
        damaged: f.damagedPlacements,
        ambiguous: f.ambiguousPlacements,
        invisible: f.invisiblePlacements,
        'double-doubled': f.doubleDoubledPlacements,
        edited: f.editedPlacements,
        'bars missing': f.barsLost,
      }))
      .sort((x, y) => y.damaged - x.damaged || y.ambiguous - x.ambiguous),
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
