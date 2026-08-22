import type { SongCell, SongKey, SongMatrixSection } from '../../../lib/db';
import { computeSolidDecayState, daysSinceEngaged } from './solidDecay';
import { isKeyRowEngaged } from './songLevelState';
import { spellKey, type Spelling } from '../../../lib/spelling';

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
  /** The IDENTITY. Used for lookups and as the row's React key; never
   *  rendered directly — see `spelling` below and lib/spelling.ts. */
  keyName: string;
  /** How to READ `keyName`. Resolved once in SongMatrixView so every
   *  row, cell and modal on the page cannot spell it differently. */
  spelling: Spelling;
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
  testSummary?: { totalAttempts: number; singleRuns: number };
  /** Wall-clock instant for live-derive decay. Captured at parent
   *  mount, passed through verbatim so all 12 rows share a single
   *  reference instant. */
  now: number;
  /** Cell-tap callback fired by tappable cells (where a SongCell
   *  row exists). Null cells stay inert — there's nothing yet to
   *  log against. */
  onCellTap?: (cellId: string) => void;
  /** Run-test callback fired by the inline strip's "Run test" /
   *  "Run retest" button. Surfaced when keyState === 'comfortable'
   *  (initial test) OR when the key is solid+lapsed (retest path —
   *  the only way back to fresh-solid). */
  onRunTest?: (songKeyId: string) => void;
  /** Log-one-run callback. Unlike `onRunTest` this is offered on
   *  EVERY key at every state — that is the whole point of it. */
  onLogRun?: (songKeyId: string) => void;
}

export default function KeyRow({
  keyName,
  spelling,
  songKey,
  sections,
  cellsBySectionId,
  isOriginal,
  testSummary,
  now,
  onCellTap,
  onRunTest,
  onLogRun,
}: Props) {
  // See isKeyRowEngaged — row existence stopped meaning "touched" once
  // all 12 keys are materialised.
  const keyEngaged = isKeyRowEngaged(songKey);
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
          spelling={spelling}
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
        now={now}
        onRunTest={onRunTest}
        onLogRun={onLogRun}
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
  spelling,
  keyState,
  isOriginal,
}: {
  keyName: string;
  spelling: Spelling;
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
      <span className="text-sm font-medium tabular-nums">{spellKey(keyName, spelling)}</span>
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
  now,
  onRunTest,
  onLogRun,
}: {
  songKey: SongKey | null;
  sections: ReadonlyArray<SongMatrixSection>;
  cellsBySectionId: ReadonlyMap<string, SongCell>;
  testSummary?: { totalAttempts: number; singleRuns: number };
  now: number;
  onRunTest?: (songKeyId: string) => void;
  onLogRun?: (songKeyId: string) => void;
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

  // Decay state is live-derived from the parent's mount-time `now`
  // snapshot. The persisted solidDecayState column is for off-view
  // consumers; in-view always asks the function.
  const decayState = songKey
    ? computeSolidDecayState(songKey, now)
    : null;

  // ---------------------------------------------------------------
  // ONE TEST CONTROL, ALWAYS AVAILABLE.
  //
  // The whole-song test used to appear only once every section in the
  // key was comfortable. That gate is gone. Sections are somewhat
  // arbitrary — a chorus is a chorus because it got named one — and
  // the song is the real unit; working section by section is a good
  // recommendation, not a rule worth enforcing. Some songs arrive
  // already in the hands, and the app should not tell you it cannot
  // test something you can play.
  //
  // WEIGHT, NOT AVAILABILITY, carries the recommendation. The control
  // is always there; it renders as a filled CTA when there is a
  // reason to prompt — the sections are all comfortable and Solid is
  // one pass away, or the key has lapsed and only a retest clears it
  // — and as a quiet link the rest of the time. Same action, same
  // passing standard either way: three clean runs in a row, in one
  // sitting. Taking the direct route earns no higher bar.
  // ---------------------------------------------------------------
  const showTest = songKey !== null && onRunTest !== undefined;
  const isRetestCta = decayState === 'lapsed';
  const promptTest = stateKey === 'comfortable' || isRetestCta;
  const totalAttempts = testSummary?.totalAttempts ?? 0;
  const singleRuns = testSummary?.singleRuns ?? 0;
  // One pass of the whole song, recorded and nothing more. Distinct
  // from the test, which is three in a row in one sitting.
  const showLogRun = songKey !== null && onLogRun !== undefined;

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
      {songKey && (decayState === 'fading' || decayState === 'lapsed') && (
        <DecayBadge state={decayState} daysSince={daysSinceEngaged(songKey, now)} />
      )}
      <ProgressBar percent={percent} engaged={engaged} />
      <span className="shrink-0 text-neutral-700 dark:text-neutral-200 tabular-nums">
        {totalSections === 0 ? 'No sections yet' : `${comfortableInKey}/${totalSections} sections`}
      </span>
      {(stateKey === 'comfortable' || decayState === 'lapsed') && songKey && (
        <TestStatus totalAttempts={totalAttempts} />
      )}
      {songKey && singleRuns > 0 && <RunStatus singleRuns={singleRuns} />}
      <span className="shrink-0 text-neutral-400 dark:text-neutral-500">
        {formatLastEngaged(songKey?.lastEngagedAt)}
      </span>
      {showLogRun && (
        <button
          type="button"
          onClick={() => onLogRun!(songKey!.id)}
          title="Record one run-through of the whole song in this key. Does not unlock Solid."
          className="shrink-0 text-[10px] uppercase tracking-wide font-medium text-neutral-500 hover:text-fluent underline-offset-2 hover:underline"
        >
          + log a run
        </button>
      )}
      {showTest && (
        <button
          type="button"
          onClick={() => onRunTest!(songKey!.id)}
          title={testHint(stateKey, isRetestCta)}
          className={[
            'shrink-0 text-[10px] uppercase tracking-wide font-medium',
            promptTest
              ? `px-2 py-0.5 rounded text-white ${isRetestCta ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`
              : 'text-neutral-500 hover:text-fluent underline-offset-2 hover:underline',
          ].join(' ')}
        >
          {isRetestCta ? 'Retest song →' : promptTest ? 'Test song →' : 'Test song'}
        </button>
      )}
    </div>
  );
}

function DecayBadge({
  state,
  daysSince,
}: {
  state: 'fading' | 'lapsed';
  daysSince: number | null;
}) {
  // Days suffix only when we have a timestamp to compute it from.
  // Defensive — solid keys should always have lastEngagedAt set,
  // but the decay function tolerates missing values.
  const suffix = daysSince != null ? ` ${daysSince}d` : '';
  if (state === 'fading') {
    return (
      <span
        className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
        title="Engagement clock past 14 days — heads-up only"
      >
        Fading{suffix}
      </span>
    );
  }
  return (
    <span
      className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
      title="Past 30 days — retest recommended"
    >
      Lapsed{suffix}
    </span>
  );
}

/**
 * Cumulative single run-throughs in this key.
 *
 * Worded so it cannot be mistaken for test progress. "Tested N×" and
 * "N runs" sit side by side and count different events — which is
 * why `kind` exists on the row. Before it, a single run would have
 * inflated the tested counter and made a key look further along the
 * graduation path than it was.
 *
 * Hidden at zero rather than reading "0 runs": twelve rows each
 * carrying a line that says nothing is worse than no line.
 */
/**
 * The hover explanation that replaced the gate.
 *
 * With the test always available, nothing stops a reader opening it
 * on a key whose sections are untouched — so the control itself has to
 * say what the test is and what passing it does. The Solid caveat is
 * the load-bearing half: `keyState` is recomputed from the CELLS on a
 * pass, so a pass on a key whose sections are not comfortable
 * genuinely cannot make it Solid, and saying otherwise would promise
 * something the save does not do.
 */
function testHint(keyState: string, isRetest: boolean): string {
  if (isRetest) {
    return 'This key has lapsed. Three clean run-throughs in a row, in one '
      + 'sitting, clears the lapse and restores Solid.';
  }
  if (keyState === 'comfortable') {
    return 'Play the whole song in this key: three clean run-throughs in a '
      + 'row, in one sitting. Every section here is comfortable, so passing '
      + 'makes this key Solid.';
  }
  return 'Play the whole song in this key: three clean run-throughs in a '
    + 'row, in one sitting. Passing moves the song to Comfortable. It will '
    + 'not make this key Solid — that needs the sections comfortable too, '
    + 'which is what working them one at a time is for.';
}

function RunStatus({ singleRuns }: { singleRuns: number }) {
  // Weighted to match the sections count, not the metadata around it.
  // Both are progress through the key; "N/M sections", "N runs",
  // "Today" and "+ log a run" all rendering at one weight meant
  // nothing on the strip read first.
  return (
    <span className="shrink-0 text-neutral-700 dark:text-neutral-200 tabular-nums">
      {singleRuns} run{singleRuns === 1 ? '' : 's'}
    </span>
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
