import { useMemo, useRef } from 'react';
import type { Song, SongCell, SongKey, SongMatrixSection } from '../../../lib/db';
import { db } from '../../../lib/db';
import { spellKey, type Spelling } from '../../../lib/spelling';
import { useMetronomeState } from '../../../lib/useMetronome';
import PracticeTestPanel from '../../shapes-and-patterns/practiceTest/PracticeTestPanel';
import { songSurface } from '../../shapes-and-patterns/practiceTest/makeSurfaces';
import { useSongTimer } from '../useSongTimer';
import { useCellBands } from './useCellBands';
import SongMetronomeBox from './SongMetronomeBox';
import KeyRow from './KeyRow';

/**
 * A song, on the panel every surface uses.
 *
 * =====================================================================
 * THIS IS THE FLIP. `CellPanel` AND `WholeSongTestModal` ARE GONE.
 *
 * The panel already ran the same test as a song — three in a row, a bad
 * run costs it, the third clean one is the pass — and had done since
 * the test model was unified. What it did not have was a song plugged
 * into it. This is that plug, and nothing else: every rule it obeys is
 * the panel's, and the only things here are the ones only a song page
 * knows.
 *
 * =====================================================================
 * WHY A WRAPPER RATHER THAN WIRING IT IN `SongDetailView`.
 *
 * The surface needs about twenty things — the key's cells, the grid's
 * bands, the durable timer, the spelling, the metronome — and every one
 * of them would have been another line in a two-and-a-half-thousand
 * line component that has nothing else to do with the panel. Here they
 * sit next to the one thing they are for, and the page swaps one
 * element for another.
 *
 * =====================================================================
 * WHAT ONLY A SONG PAGE KNOWS, and therefore what is here:
 *
 *   the clock       A song's session is a STORED record that survives a
 *                   reload and a walk away from the desk. The panel
 *                   reads it rather than counting from its own mount,
 *                   and pausing the panel pauses it — see
 *                   `onSessionPause`, which is the two-pauses question
 *                   settled.
 *   the tempo       A run records what the METRONOME was at. Read at
 *                   write time, not at run start, because a run whose
 *                   metronome was stopped to answer §4's prompt still
 *                   had a tempo while it was played.
 *   the badge       The result screen's preview is the real `KeyRow`,
 *                   built from the grid's own data, so it cannot say
 *                   something the matrix behind it does not.
 * =====================================================================
 */

interface Props {
  song: Song;
  songKey: SongKey;
  /** Every cell of this key. */
  cells: ReadonlyArray<SongCell>;
  sections: ReadonlyArray<SongMatrixSection>;
  /**
   * The cell the panel was opened on.
   *
   * Null for a whole-song test, which is opened on the KEY ROW rather
   * than on any one section — and then the first section stands in as
   * the cell a session rating lands on, because the sitting has to
   * attach somewhere and the row itself is a schedule rather than a
   * band.
   */
  cell: SongCell | null;
  entry: 'section' | 'whole-song';
  isRetest: boolean;
  spelling: Spelling;
  onOpenLeadSheet: () => void;
  onClose: () => void;
}

export default function SongPracticePanel({
  song, songKey, cells, sections, cell, entry, isRetest, spelling,
  onOpenLeadSheet, onClose,
}: Props) {
  const timer = useSongTimer(song.id);
  const metro = useMetronomeState();
  const bands = useCellBands(cells);

  // Held in a ref so the surface can read the live values without being
  // rebuilt on every tick — a new surface object each render would
  // remount the panel and lose the session.
  const live = useRef({ timer, metro });
  live.current = { timer, metro };

  const openedOn = cell ?? cells[0] ?? null;

  const cellIdBySectionId = useMemo(
    () => new Map(cells.map(c => [c.sectionId, c.id])),
    [cells],
  );
  const sectionOptions = useMemo(
    () => sections.map(s => ({ id: s.id, label: s.name })),
    [sections],
  );

  const spelled = spellKey(songKey.keyName, spelling);
  const sectionName = openedOn
    ? sections.find(s => s.id === openedOn.sectionId)?.name ?? 'Section'
    : 'Section';

  const surface = useMemo(() => {
    if (openedOn === null) return null;
    return songSurface({
      cellLabel: entry === 'whole-song' ? song.title : sectionName,
      skillLabel: entry === 'whole-song'
        ? `The Whole Song · ${spelled}`
        : spelled,
      cellId: openedOn.id,
      songKeyId: songKey.id,
      cellIdBySectionId,
      songId: song.id,
      keyName: songKey.keyName,
      entry,
      sectionLabel: sectionName,
      songTitle: song.title,
      spelledKeyName: spelled,
      sections: sectionOptions,
      expectedSectionCount: sections.length,
      isRetest,
      songTempo: song.tempo ?? null,
      onOpenLeadSheet,
      readSessionElapsedMs: () => live.current.timer.elapsedMs,
      readSessionId: () => live.current.timer.record?.sessionId ?? null,
      // THE TWO PAUSES, SETTLED. The panel's pause is the session's,
      // and this is how the record that owns the minutes hears it.
      // THE STORED CLOCK, STARTED. It read zero for a whole sitting
      // because nothing ever started it — the panel was faithfully
      // reporting a timer that had never begun.
      //
      // Only when nothing else is running. A timer already going on
      // ANOTHER song belongs to that song, and the page offers the
      // swap; quietly clobbering it here would move minutes from one
      // song's record to another's.
      onSessionStart: () => {
        if (live.current.timer.record === null) live.current.timer.start();
      },
      onSessionPause: (paused) => {
        if (paused) live.current.timer.pause();
        else live.current.timer.resume();
      },
      // THE STOP INTERCEPT REACHES THE SONG'S BOX TOO. Without it the
      // rule would hold on three surfaces and not on the one it was
      // written for.
      renderMetronome: (onStoppedByUser) => (
        <SongMetronomeBox
          onStoppedByUser={onStoppedByUser}
          /* TESTING'S RULES, BECAUSE THEY ARE THE STRICTER ONES AND
             THE PANEL HAS NOT SAID WHICH MODE YET WHEN THIS IS BUILT.
             A practice session under a test-shaped box sees a floor it
             does not have to obey, which is a smaller wrong than a
             test under a practice box seeing no floor at all. Handing
             the box the panel's mode is the real answer and wants the
             mode threaded through the surface — flagged, not faked. */
          mode="testing"
          songTempo={song.tempo ?? null}
          onSetSongTempo={async bpm => { await db.songs.update(song.id, { tempo: bpm }); }}
        />
      ),
      renderBadgePreview: () => (
        <KeyRow
          keyName={songKey.keyName}
          spelling={spelling}
          songKey={songKey}
          sections={sections}
          cellsBySectionId={new Map(cells.map(c => [c.sectionId, c]))}
          bands={bands}
          isOriginal={songKey.isOriginalKey}
          now={Date.now()}
        />
      ),
    });
    // The surface is rebuilt only when the THING being practised
    // changes. Live values reach it through the ref above; rebuilding
    // on a clock tick would remount the panel mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedOn?.id, songKey.id, entry, isRetest, song.tempo, song.title, spelled]);

  if (surface === null) return null;

  return (
    <PracticeTestPanel
      surface={surface}
      onClose={() => {
        // A song's clock outlives the panel — it is the page's timer,
        // and closing a panel is not stopping practice. Only the
        // metronome is the panel's to quieten, which it does itself.
        onClose();
      }}
    />
  );
}
