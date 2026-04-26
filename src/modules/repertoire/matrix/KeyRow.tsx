import type { SongCell, SongKey, SongMatrixSection } from '../../../lib/db';

/**
 * One row of the matrix: key name cell on the left (with the
 * "original" tag and state-coloured left border per spec lines 338-
 * 342), followed by one cell square per section, with an inline
 * strip beneath the row showing key state badge + per-key progress
 * + last-engaged context per spec line 344.
 *
 * Cell tap is intentionally inert in step 3a — `cursor-pointer`
 * suggests interactivity is coming, but no handler fires. The
 * cell-interaction modal lands in a later step.
 */

interface Props {
  keyName: string;
  /** May be null when no songKeys row exists for this key — i.e.,
   *  the key is "untouched" per the spec's untouched-vs-engaged
   *  distinction. */
  songKey: SongKey | null;
  sections: ReadonlyArray<SongMatrixSection>;
  /** Cells for this specific key, indexed by sectionId. Empty map
   *  when the key has no cells yet (untouched, or migrated key
   *  whose section setup hasn't run). */
  cellsBySectionId: ReadonlyMap<string, SongCell>;
  isOriginal: boolean;
  /** Whole-song test summary for this key, when songKey !== null.
   *  Derived upstream from songKeyRunThroughs so all 12 rows share
   *  one query rather than each making its own. Discrete-session
   *  semantics — only the cumulative attempt count is meaningful at
   *  the strip level; in-session streak doesn't persist between
   *  modal opens. */
  testSummary?: { totalAttempts: number };
  /** Cell-tap callback fired by tappable cells (where a SongCell
   *  row exists). Null cells stay inert — there's nothing yet to
   *  log against. */
  onCellTap?: (cellId: string) => void;
  /** Run-test callback fired by the inline strip's "Run test" button.
   *  Surfaced only when keyState === 'comfortable' (the gate to Solid
   *  is open). Solid keys don't expose the affordance until decay-
   *  retest lands in a later step. */
  onRunTest?: (songKeyId: string) => void;
}

export default function KeyRow({
  keyName,
  songKey,
  sections,
  cellsBySectionId,
  isOriginal,
  testSummary,
  onCellTap,
  onRunTest,
}: Props) {
  const keyEngaged = songKey !== null;
  const keyState = songKey?.keyState ?? 'not_started';

  return (
    <div
      className={[
        'border-b border-neutral-200 dark:border-neutral-800 last:border-b-0',
        keyEngaged ? '' : 'bg-neutral-50/30 dark:bg-neutral-900/30',
      ].join(' ')}
    >
      {/* Cells row: key name + N section cells */}
      <div className="flex items-stretch">
        <KeyNameCell
          keyName={keyName}
          keyState={keyState}
          isOriginal={isOriginal}
        />
        <div className="flex-1 flex items-stretch">
          {sections.map(section => (
            <CellSquare
              key={section.id}
              cell={cellsBySectionId.get(section.id) ?? null}
              keyEngaged={keyEngaged}
              onTap={onCellTap}
            />
          ))}
        </div>
      </div>

      {/* Inline strip — state badge + progress + last-engaged context */}
      <KeyStrip
        songKey={songKey}
        sections={sections}
        cellsBySectionId={cellsBySectionId}
        testSummary={testSummary}
        onRunTest={onRunTest}
      />
    </div>
  );
}

// -------------------------------------------------------------------

const KEY_BORDER_BY_STATE: Record<string, string> = {
  solid:        'border-l-blue-500',
  comfortable:  'border-l-teal-500',
  learning:     'border-l-emerald-500',
  not_started:  'border-l-neutral-300 dark:border-l-neutral-700',
};

function KeyNameCell({
  keyName,
  keyState,
  isOriginal,
}: {
  keyName: string;
  keyState: string;
  isOriginal: boolean;
}) {
  const borderClass = KEY_BORDER_BY_STATE[keyState] ?? KEY_BORDER_BY_STATE.not_started;
  const dimmed = keyState === 'not_started';
  return (
    <div
      className={[
        'flex items-center gap-1.5 px-2 py-2 w-20 shrink-0 border-l-4',
        borderClass,
        dimmed ? 'text-neutral-500' : 'text-neutral-800 dark:text-neutral-100',
      ].join(' ')}
    >
      <span className="text-sm font-medium tabular-nums">{keyName}</span>
      {isOriginal && (
        <span className="text-[9px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 leading-none">
          orig
        </span>
      )}
    </div>
  );
}

// -------------------------------------------------------------------

function CellSquare({
  cell,
  keyEngaged,
  onTap,
}: {
  cell: SongCell | null;
  keyEngaged: boolean;
  onTap?: (cellId: string) => void;
}) {
  const base = 'flex-1 min-w-[44px] flex items-center justify-center text-sm border-r border-neutral-200 dark:border-neutral-800 last:border-r-0 transition';

  if (cell === null) {
    // No cell record exists for this section × key intersection —
    // either the key is fully untouched or it's engaged but cells
    // haven't been materialised yet (an edge state that
    // shouldn't occur post-3b/c since sections + cells co-create).
    // Either way, nothing to log against, so the surface stays
    // inert (no button, no tap handler).
    if (!keyEngaged) {
      return (
        <div className={`${base} bg-neutral-100/40 dark:bg-neutral-900/40 text-neutral-300 dark:text-neutral-700 cursor-default`}>
          —
        </div>
      );
    }
    return (
      <div className={`${base} bg-white dark:bg-neutral-950 text-neutral-400 dark:text-neutral-500 cursor-default`}>
        —
      </div>
    );
  }

  // Tappable — rendered as a button so it carries the right
  // semantics for screen readers and keyboard navigation (Enter /
  // Space to activate). `onTap` is wired by SongMatrixView to
  // open the cell interaction modal for this specific cell.
  const stateClass = ((): string => {
    switch (cell.cellState) {
      case 'comfortable': return 'bg-teal-500 text-white font-medium hover:bg-teal-600';
      case 'learning':    return 'bg-emerald-500/90 text-white font-medium hover:bg-emerald-600';
      case 'empty':
      default:            return 'bg-white dark:bg-neutral-950 text-neutral-400 dark:text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-900';
    }
  })();
  const icon = ((): string => {
    switch (cell.cellState) {
      case 'comfortable': return '✓';
      case 'learning':    return '···';
      case 'empty':
      default:            return '—';
    }
  })();

  return (
    <button
      type="button"
      onClick={() => onTap?.(cell.id)}
      className={`${base} ${stateClass} cursor-pointer`}
      aria-label={`${cell.cellState} cell — open to log`}
    >
      {icon}
    </button>
  );
}

// -------------------------------------------------------------------

const KEY_STATE_BADGE: Record<string, { label: string; className: string }> = {
  solid:        { label: 'Solid',        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
  comfortable:  { label: 'Comfortable',  className: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200' },
  learning:     { label: 'Learning',     className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  not_started:  { label: 'Not started',  className: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400' },
};

function KeyStrip({
  songKey,
  sections,
  cellsBySectionId,
  testSummary,
  onRunTest,
}: {
  songKey: SongKey | null;
  sections: ReadonlyArray<SongMatrixSection>;
  cellsBySectionId: ReadonlyMap<string, SongCell>;
  testSummary?: { totalAttempts: number };
  onRunTest?: (songKeyId: string) => void;
}) {
  const engaged = songKey !== null;
  const stateKey = songKey?.keyState ?? 'not_started';
  const badge = KEY_STATE_BADGE[stateKey] ?? KEY_STATE_BADGE.not_started;

  // Per-key progress: cells comfortable in this key / total sections.
  // sections.length is the floor — don't divide by 0 when no
  // sections exist yet (migrated song pre-section-setup).
  const totalSections = sections.length;
  const comfortableInKey = sections.reduce((acc, section) => {
    const cell = cellsBySectionId.get(section.id);
    return acc + (cell?.cellState === 'comfortable' ? 1 : 0);
  }, 0);
  const percent = totalSections > 0
    ? Math.round((comfortableInKey / totalSections) * 100)
    : 0;

  // Test affordance: visible only when the key is at comfortable —
  // the gate to Solid. Solid keys don't show it (decay-retest is a
  // later step); learning/not-started keys aren't yet eligible.
  const showRunTest = stateKey === 'comfortable' && songKey !== null && onRunTest;
  const totalAttempts = testSummary?.totalAttempts ?? 0;

  return (
    <div
      className={[
        'flex items-center gap-3 px-3 py-1.5 text-xs',
        engaged
          ? 'bg-white dark:bg-neutral-950'
          : 'bg-neutral-50 dark:bg-neutral-900/60',
      ].join(' ')}
    >
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium ${badge.className}`}>
        {badge.label}
      </span>
      <ProgressBar percent={percent} engaged={engaged} />
      <span className="shrink-0 text-neutral-500 dark:text-neutral-400 tabular-nums">
        {totalSections === 0 ? 'No sections yet' : `${comfortableInKey}/${totalSections} sections`}
      </span>
      {showRunTest && (
        <TestStatus totalAttempts={totalAttempts} />
      )}
      <span className="shrink-0 text-neutral-400 dark:text-neutral-500">
        {formatLastEngaged(songKey?.lastEngagedAt)}
      </span>
      {showRunTest && (
        <button
          type="button"
          onClick={() => onRunTest!(songKey!.id)}
          className="shrink-0 px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Run test →
        </button>
      )}
    </div>
  );
}

function TestStatus({
  totalAttempts,
}: {
  totalAttempts: number;
}) {
  // No prior attempts — say so plainly. Once attempts exist, show
  // the cumulative count for honest context. We deliberately don't
  // show an "X/3 clean" indicator: the test is discrete-session,
  // so any across-session streak is meaningless on the strip.
  if (totalAttempts === 0) {
    return (
      <span className="shrink-0 text-neutral-400 dark:text-neutral-500 tabular-nums">
        Untested
      </span>
    );
  }
  return (
    <span className="shrink-0 text-neutral-500 dark:text-neutral-400 tabular-nums">
      Tested {totalAttempts}×
    </span>
  );
}

function ProgressBar({ percent, engaged }: { percent: number; engaged: boolean }) {
  return (
    <div className="flex-1 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded overflow-hidden">
      <div
        className={`h-full transition-all ${engaged ? 'bg-teal-500' : 'bg-neutral-300 dark:bg-neutral-700'}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function formatLastEngaged(ms: number | null | undefined): string {
  if (!ms) return 'Never engaged';
  const days = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
