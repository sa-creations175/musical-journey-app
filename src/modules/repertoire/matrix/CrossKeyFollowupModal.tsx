import { useCallback, useState } from 'react';
import Modal from '../../../components/Modal';
import {
  db,
  type Song,
  type SongCell,
  type SongKey,
  type SongMatrixSection,
} from '../../../lib/db';
import { keysOrderedFromOriginal } from './keys';

/**
 * Cross-key follow-up — auto-fires after section setup completes
 * for songs migrated from the legacy `stage: 'cross-key'` state.
 * Per SONG_PROGRESSION_DESIGN_3.md "Migration spec / Queued on
 * first matrix open":
 *
 *   For Cross-key songs: follow-up prompt "Which other keys were
 *   you working?" — selected keys created at key_state = 'learning'.
 *
 * The eligibility latch lives in SongMatrixView (render-time
 * setState pattern, once-per-mount); this component is just the
 * modal surface + persistence logic.
 *
 * Parent should only render this with `open === true` when an
 * `originalKey` is set — modal copy and chip ordering both depend
 * on it.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  song: Song;
  /** The keyName of the song's original key (e.g., "C", "F#"). The
   *  11 chips are derived as the cycle-of-fourths order from this
   *  key, with the original itself filtered out. */
  originalKey: string;
  /** The current list of non-archived sections. Cells get
   *  materialized for each selected key × every section so the
   *  matrix grid lights up immediately on confirm. */
  visibleSections: ReadonlyArray<SongMatrixSection>;
}

export default function CrossKeyFollowupModal({
  open,
  onClose,
  song,
  originalKey,
  visibleSections,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Reset on close. Same useCallback rationale as
  // SectionSetupModal: Modal's focus-handling effect lists onClose
  // in its deps, so an unstable handleClose ref re-fires it on
  // every re-render and would steal focus from any future input
  // we add to this modal. The chip-only UI here happens not to
  // have a focused input, but the pattern stays consistent.
  const handleClose = useCallback(() => {
    setSelected(new Set());
    setBusy(false);
    onClose();
  }, [onClose]);

  // 11 chips: non-original keys in cycle-of-fourths order from the
  // original. Same ordering function the matrix grid uses, so the
  // chip order maps directly onto the row order — closely-related
  // keys (one or two fourths away from home) sit first, matching
  // how players typically approach cross-key work.
  const orderedNonOriginalKeys = keysOrderedFromOriginal(originalKey)
    .filter(k => k !== originalKey);

  const toggleKey = (keyName: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(keyName)) next.delete(keyName);
      else next.add(keyName);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      const now = Date.now();
      const selectedKeyNames = Array.from(selected);

      const newKeyRows: SongKey[] = selectedKeyNames.map(keyName => ({
        // Deterministic id — same shape the migration step uses for
        // the original key. Lets a stale re-run upsert without
        // duplicates on this device or across sync from another
        // device that picked the same keys.
        id: `songkey-${song.id}-${keyName}`,
        songId: song.id,
        keyName,
        isOriginalKey: false,
        keyState: 'learning',
        solidAt: null,
        solidDecayState: null,
        lastDecayCheckAt: null,
        livedWithSessionCount: 0,
        livedWithFirstSessionAt: null,
        livedWithWindowStartAt: null,
        livedWithSessionsInWindow: 0,
        wholeSongTestPassedAt: null,
        isRetestRecommended: false,
        lastEngagedAt: null,
        createdAt: now,
        updatedAt: now,
      }));

      // One cell per (new key × existing section), all empty. The
      // deterministic cell id matches the section-setup pattern, so
      // a future flow that adds sections to existing keys will
      // produce idempotent bulkPuts here too.
      const newCellRows: SongCell[] = [];
      for (const newKey of newKeyRows) {
        for (const section of visibleSections) {
          newCellRows.push({
            id: `cell-${newKey.id}-${section.id}`,
            songId: song.id,
            sectionId: section.id,
            songKeyId: newKey.id,
            cellState: 'empty',
            comfortableAt: null,
            consecutiveCleanCount: 0,
            lastRunAt: null,
            lastRunWasClean: null,
            notes: null,
            lastEngagedAt: null,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      // Atomic — keys and cells either both land or neither does.
      // Half-state would render new key rows in the matrix without
      // their cells, which the cell-state row would then materialize
      // lazily as 'engaged-empty' — recoverable but ugly.
      await db.transaction('rw', [db.songKeys, db.songCells], async () => {
        await db.songKeys.bulkPut(newKeyRows);
        await db.songCells.bulkPut(newCellRows);
      });

      handleClose();
    } catch (err) {
      console.warn('[matrix] cross-key follow-up save failed', err);
      setBusy(false);
    }
  };

  const canConfirm = selected.size > 0 && !busy;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Which other keys were you working in?"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 text-sm rounded-md text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
            className="px-3 py-1.5 text-sm rounded-md bg-fluent text-white hover:bg-fluent/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {selected.size === 0
              ? 'Pick at least one key'
              : `Add ${selected.size} key${selected.size === 1 ? '' : 's'} to the matrix`}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          You had{' '}
          <span className="text-neutral-800 dark:text-neutral-100 font-medium">
            {song.title}
          </span>
          {' '}marked as Cross-key. Pick the keys you were practicing in and we'll
          add them to the matrix.
        </p>

        <div>
          <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
            Original key: <span className="text-neutral-500 dark:text-neutral-400 font-normal">{originalKey}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {orderedNonOriginalKeys.map(keyName => {
              const isSelected = selected.has(keyName);
              return (
                <button
                  key={keyName}
                  type="button"
                  onClick={() => toggleKey(keyName)}
                  className={[
                    'text-xs px-2.5 py-1.5 rounded-md border transition font-medium tabular-nums',
                    isSelected
                      ? 'border-fluent bg-fluent/10 text-fluent'
                      : 'border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent/60',
                  ].join(' ')}
                >
                  {isSelected ? '✓ ' : '+ '}{keyName}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
