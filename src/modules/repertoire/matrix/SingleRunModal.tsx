import { useCallback, useState } from 'react';
import Modal from '../../../components/Modal';
import type { Song, SongCell, SongKey } from '../../../lib/db';
import { isInTempoRange, logSingleKeyRun } from './cellRollup';

/**
 * Log ONE run-through of the whole song in one key.
 *
 * ---------------------------------------------------------------
 * WHAT THIS IS NOT
 *
 * It sits beside the whole-song test and the two are easy to
 * confuse, so the copy works hard to separate them:
 *
 *   Whole-song TEST — three consecutive clean runs in one sitting,
 *   available only once every section in the key is comfortable.
 *   It is a graduation: passing it is what makes a key Solid.
 *
 *   A single RUN — one pass, in any key, at any state. It records
 *   that you played the song through in that key. It never unlocks
 *   anything.
 *
 * Depth versus breadth. The test says "this key is finished"; a
 * single run says "I have been through the song in this key". Both
 * are worth recording and they are not degrees of the same thing.
 * ---------------------------------------------------------------
 *
 * One attempt per open, deliberately. Adding a list would make this
 * a test session with the gate filed off — and the user would
 * reasonably expect three clean ones to count for something.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  songKey: SongKey;
  song: Song;
  siblingCells: ReadonlyArray<SongCell>;
  totalSections: number;
}

export default function SingleRunModal({
  open,
  onClose,
  onSaved,
  songKey,
  song,
  siblingCells,
  totalSections,
}: Props) {
  const [bpmInput, setBpmInput] = useState<string>(String(song.tempo ?? ''));
  const [busy, setBusy] = useState(false);

  const handleClose = useCallback(() => {
    setBpmInput('');
    setBusy(false);
    onClose();
  }, [onClose]);

  const performanceTempo = song.tempo ?? null;
  const parsedBpm = parseInt(bpmInput, 10);
  const hasBpm = Number.isFinite(parsedBpm) && parsedBpm > 0;
  const atTempo = hasBpm && isInTempoRange(parsedBpm, performanceTempo);

  const save = async (wasClean: boolean) => {
    if (busy || !hasBpm) return;
    setBusy(true);
    try {
      await logSingleKeyRun({
        songKey,
        attempt: {
          id: `singlerun-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`,
          bpm: parsedBpm,
          wasClean,
        },
        performanceTempo,
        siblingCells,
        expectedSectionCount: totalSections,
        now: Date.now(),
      });
      onSaved?.();
      handleClose();
    } catch (err) {
      console.warn('[matrix] single run save failed', err);
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`One run-through · ${songKey.keyName} · ${song.title}`}
      footer={
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 text-sm rounded-md text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-snug">
          Records that you played <span className="font-medium">{song.title}</span> all
          the way through in <span className="font-mono">{songKey.keyName}</span>.
          {' '}
          <span className="text-neutral-500">
            This does not unlock Solid — that needs the whole-song test, which is
            three clean runs in a row in one sitting.
          </span>
        </p>

        <div>
          <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
            What tempo?
          </div>
          <label className="inline-flex items-center gap-1.5 px-3 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">♩</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={bpmInput}
              onChange={e => setBpmInput(e.target.value)}
              placeholder="BPM"
              autoFocus
              className="w-20 py-2 bg-transparent text-sm tabular-nums focus:outline-none"
              aria-label="Tempo BPM"
            />
          </label>
          {/* Tempo is REQUIRED here, unlike the cell modal where a
              blank tempo records an untimed attempt honestly. The
              only rule that reads these rows asks for a run AT
              performance tempo, and a run with no stated tempo cannot
              answer it — so a tempo-less row would be a record the
              user thought counted and that nothing would ever
              count. */}
          {hasBpm && performanceTempo !== null && !atTempo && (
            <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              Below ♩ {performanceTempo - 10}, the floor for this song. The run is
              recorded either way, but only runs at or above the floor count
              toward taking the song into all twelve keys.
            </p>
          )}
          {performanceTempo === null && (
            <p className="mt-1.5 text-[11px] text-neutral-500">
              No performance tempo set for this song yet, so there is no floor to
              measure against.
            </p>
          )}
        </div>

        <div>
          <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
            How did it go?
          </div>
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => void save(true)}
              disabled={!hasBpm || busy}
              className="flex-1 px-3 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              ✓ Clean
            </button>
            <button
              type="button"
              onClick={() => void save(false)}
              disabled={!hasBpm || busy}
              className="flex-1 px-3 py-2 text-sm rounded-md bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              ✗ Not clean
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-500">
            Saves and closes — one run per visit.
          </p>
        </div>
      </div>
    </Modal>
  );
}
