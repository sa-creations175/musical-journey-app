import { useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from '../../../components/Modal';
import {
  db,
  type Song,
  type SongCell,
  type SongKey,
  type SongMatrixSection,
} from '../../../lib/db';

/**
 * Cells-only setup flow for a song's matrix. As of the lead-sheet →
 * matrix one-way sync, section creation lives entirely in the lead
 * sheet — `syncMatrixSectionsForSong` mirrors lead-sheet sections to
 * `songMatrixSections` on every write. This modal's remaining job is
 * to create the `songCells` rows that pair each non-archived matrix
 * section with each `songKey`, so the matrix grid actually has
 * something to render.
 *
 * Behavior:
 *   · No lead-sheet sections yet → empty state directing the user
 *     to add sections in the lead sheet first. Cancel is the only
 *     action.
 *   · Some matrix sections exist but cells are missing for one or
 *     more (section × key) pairs → list the gaps + a Confirm
 *     button that bulk-puts the missing cell rows.
 *   · Every (section × key) pair already has a cell → empty state
 *     "matrix is already set up." Cancel closes.
 *
 * Cell ids follow `cell-{keyId}-{sectionId}` deterministically so
 * reruns are upsert-safe and we never duplicate rows.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  song: Song;
  /** Existing songKeys for this song — cells get paired against
   *  each on confirm. */
  songKeys: ReadonlyArray<SongKey>;
}

export default function SectionSetupModal({ open, onClose, song, songKeys }: Props) {
  const [busy, setBusy] = useState(false);
  const sections = useLiveQuery<SongMatrixSection[]>(
    () => db.songMatrixSections
      .where('songId')
      .equals(song.id)
      .toArray()
      .then(rows => rows
        .filter(r => !r.isArchived)
        .sort((a, b) => a.displayOrder - b.displayOrder)),
    [song.id, open],
  ) ?? [];
  const existingCells = useLiveQuery<SongCell[]>(
    () => db.songCells.where('songId').equals(song.id).toArray(),
    [song.id, open],
  ) ?? [];

  const handleClose = useCallback(() => {
    setBusy(false);
    onClose();
  }, [onClose]);

  // Build the set of (sectionId|keyId) pairs that already have cells
  // so we only create the missing ones. The set is read on confirm,
  // so it doesn't matter that it's recomputed every render.
  const cellKey = (sectionId: string, songKeyId: string) =>
    `${sectionId}|${songKeyId}`;
  const existingPairs = new Set(
    existingCells.map(c => cellKey(c.sectionId, c.songKeyId)),
  );

  const missing: Array<{ sectionId: string; songKeyId: string }> = [];
  for (const section of sections) {
    for (const key of songKeys) {
      if (!existingPairs.has(cellKey(section.id, key.id))) {
        missing.push({ sectionId: section.id, songKeyId: key.id });
      }
    }
  }

  const hasSections = sections.length > 0;
  const hasMissing = missing.length > 0;
  const canConfirm = hasSections && hasMissing && !busy;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      const now = Date.now();
      const cellRows: SongCell[] = missing.map(({ sectionId, songKeyId }) => ({
        id: `cell-${songKeyId}-${sectionId}`,
        songId: song.id,
        sectionId,
        songKeyId,
        cellState: 'empty',
        comfortableAt: null,
        consecutiveCleanCount: 0,
        lastRunAt: null,
        lastRunWasClean: null,
        notes: null,
        lastEngagedAt: null,
        createdAt: now,
        updatedAt: now,
      }));
      await db.songCells.bulkPut(cellRows);
      handleClose();
    } catch (err) {
      console.warn('[matrix] cell setup save failed', err);
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Set up matrix — ${song.title}`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 text-sm rounded-md text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {canConfirm ? 'Cancel' : 'Close'}
          </button>
          {canConfirm && (
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={!canConfirm}
              className="px-3 py-1.5 text-sm rounded-md bg-fluent text-white hover:bg-fluent/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {`Confirm — create ${missing.length} cell${missing.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {!hasSections && (
          <div className="space-y-2">
            <p className="text-neutral-700 dark:text-neutral-200">
              This song doesn't have any lead-sheet sections yet.
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Sections come from the lead sheet — add Verse, Chorus, Bridge
              (or whatever your song needs) in the Lead Sheet section first.
              The matrix will mirror them automatically.
            </p>
          </div>
        )}
        {hasSections && !hasMissing && (
          <p className="text-neutral-700 dark:text-neutral-200">
            Matrix is already set up — every section has cells for every key.
          </p>
        )}
        {hasSections && hasMissing && (
          <div className="space-y-2">
            <p className="text-neutral-700 dark:text-neutral-200">
              Ready to initialize matrix cells for these sections:
            </p>
            <ul className="text-xs text-neutral-600 dark:text-neutral-300 list-disc list-inside space-y-0.5">
              {sections.map(section => (
                <li key={section.id}>{section.name}</li>
              ))}
            </ul>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 pt-1">
              {missing.length} new cell{missing.length === 1 ? '' : 's'} across {songKeys.length}{' '}
              key{songKeys.length === 1 ? '' : 's'} will be created.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
