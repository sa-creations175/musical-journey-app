import { useMemo } from 'react';
import type { SongCell, SongKey, SongMatrixSection } from '../../../lib/db';
import { keysOrderedFromOriginal } from './keys';
import KeyRow from './KeyRow';

/**
 * The 12-row matrix grid. Layout decisions:
 *
 *   - Always render all 12 keys. Row order is the original key
 *     first, followed by the remaining 11 in circle of fourths
 *     from there (see keysOrderedFromOriginal). The original-key
 *     placement keeps the user's home base anchored at the top of
 *     every song's matrix; the cycle order beneath it groups
 *     functionally-adjacent keys close to it, which matches how
 *     players approach cross-key work in practice.
 *
 *   - Untouched keys dim themselves via per-row styling rather
 *     than getting reordered or hidden — the full 12-row shape
 *     stays consistent so visual scanning across songs reads the
 *     same way.
 *
 *   - Section columns flow inside each KeyRow's right-hand region.
 *     When sections.length === 0 (migrated song pre-section-setup),
 *     each row collapses to just its key name + inline strip; the
 *     cells region is empty. The placeholder banner above the grid
 *     tells the user how to populate the grid.
 *
 *   - The full grid scrolls horizontally on narrow viewports when
 *     section count grows past ~6 — `overflow-x-auto` on the wrapper
 *     keeps the per-row layout intact rather than collapsing cells.
 */

interface Props {
  sections: ReadonlyArray<SongMatrixSection>;
  songKeys: ReadonlyArray<SongKey>;
  songCells: ReadonlyArray<SongCell>;
  /** Map keyed by songKeyId → whole-song-test summary. Computed
   *  once in SongMatrixView from the run-throughs query so all 12
   *  rows share one read. Missing entries default to 0 attempts in
   *  KeyStrip — same UX as no run-throughs ever logged. */
  testSummariesByKeyId?: ReadonlyMap<string, { totalAttempts: number }>;
  /** Wall-clock timestamp captured once at the parent mount. Passed
   *  through so each KeyRow's decay live-derive uses a consistent
   *  reference instant across the whole grid. */
  now: number;
  /** Plumbed through to each KeyRow → CellSquare. Fires on cell
   *  tap when a cell record exists. */
  onCellTap?: (cellId: string) => void;
  /** Plumbed through to each KeyRow → KeyStrip. Fires when the user
   *  clicks "Run test" on a comfortable key's inline strip. */
  onRunTest?: (songKeyId: string) => void;
}

export default function MatrixGrid({
  sections,
  songKeys,
  songCells,
  testSummariesByKeyId,
  now,
  onCellTap,
  onRunTest,
}: Props) {
  // Index incoming data once so each KeyRow gets O(1) lookups
  // rather than scanning the full songKeys / songCells arrays per
  // render.
  const songKeysByName = useMemo(() => {
    const m = new Map<string, SongKey>();
    for (const k of songKeys) m.set(k.keyName, k);
    return m;
  }, [songKeys]);

  const cellsByKeyId = useMemo(() => {
    const m = new Map<string, Map<string, SongCell>>();
    for (const c of songCells) {
      let inner = m.get(c.songKeyId);
      if (!inner) {
        inner = new Map();
        m.set(c.songKeyId, inner);
      }
      inner.set(c.sectionId, c);
    }
    return m;
  }, [songCells]);

  const originalKeyName = songKeys.find(k => k.isOriginalKey)?.keyName ?? null;
  const orderedKeys = useMemo(
    () => keysOrderedFromOriginal(originalKeyName),
    [originalKeyName],
  );

  // Filter archived sections out — per spec, archived sections are
  // hidden from the matrix but their cell history is preserved on
  // disk for restore. The state rollup excludes them too (handled
  // upstream in songLevelState.ts when the section list is filtered
  // before passing in).
  const visibleSections = sections.filter(s => !s.isArchived);

  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-x-auto">
      <div className="min-w-fit">
        {visibleSections.length > 0 && (
          <SectionHeaderRow sections={visibleSections} />
        )}
        {orderedKeys.map(keyName => {
          const songKey = songKeysByName.get(keyName) ?? null;
          const cellsBySectionId = songKey
            ? (cellsByKeyId.get(songKey.id) ?? EMPTY_CELL_MAP)
            : EMPTY_CELL_MAP;
          const testSummary = songKey
            ? testSummariesByKeyId?.get(songKey.id)
            : undefined;
          return (
            <KeyRow
              key={keyName}
              keyName={keyName}
              songKey={songKey}
              sections={visibleSections}
              cellsBySectionId={cellsBySectionId}
              isOriginal={originalKeyName === keyName}
              testSummary={testSummary}
              now={now}
              onCellTap={onCellTap}
              onRunTest={onRunTest}
            />
          );
        })}
      </div>
    </div>
  );
}

const EMPTY_CELL_MAP: ReadonlyMap<string, SongCell> = new Map();

// -------------------------------------------------------------------

function SectionHeaderRow({ sections }: { sections: ReadonlyArray<SongMatrixSection> }) {
  return (
    <div className="flex items-stretch border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/60">
      {/* Spacer aligned with the key name column on rows below. */}
      <div className="w-20 shrink-0" />
      <div className="flex-1 flex items-stretch">
        {sections.map(section => (
          <div
            key={section.id}
            className="flex-1 min-w-[44px] px-1 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 text-center truncate border-r border-neutral-200 dark:border-neutral-800 last:border-r-0"
            title={section.name}
          >
            {section.name}
          </div>
        ))}
      </div>
    </div>
  );
}
