import { useState } from 'react';
import type { DrillHand, DrillSession } from '../../lib/db';
import { bandVerdictLabel, type BandVerdict } from '../../lib/spacing/banding';
import ProgressTrackerBand from '../../components/moduleHome/ProgressTrackerBand';
import { formatAgo, formatDuration, type HandProgress } from './handProgress';

/**
 * Everything about one cell, standing under the grid. ONE COMPONENT,
 * FOR ALL THREE GRIDS.
 *
 * =====================================================================
 * IT IS A SECTION, NOT A POP-UP, AND THAT IS THE POINT.
 *
 * Tapping a cell used to open a modal: the grid went away, you read one
 * square's story through a window, and you closed it to get back. So
 * comparing two cells meant opening and closing two windows, and the
 * thing you were comparing them against — the grid — was hidden while
 * you did it.
 *
 * This stands below the grid and fills. The grid never moves, and the
 * page scrolls the band to the top so the answer is where you are
 * looking.
 *
 * The band is the app's own dark green `ProgressTrackerBand`, the same
 * one every other module's detail section uses.
 *
 * =====================================================================
 * IT WAS `ScaleProgressDetails`, AND SCALES WERE NEVER THE SPECIAL ONE.
 *
 * The chord grid opened a modal that drew this same table, and the
 * prototype's own note says so: two places, one job. Voice leading had
 * neither. So the surface differences are a LIST, not three components:
 *
 *   how many targets   three hands / twelve shapes-by-hand / one
 *   a roll-up at all   only where a cell holds more than one target
 *   Edit what counts   only where there is a roll-up to change
 *   a closing note     "Two octaves, always." is a scale's fact
 *
 * Anything a surface wants that is NOT on that list is drift.
 *
 * =====================================================================
 * WHAT ONE RUN SAYS: RATING · LENGTH · TEMPO · WHEN · SITTING.
 *
 * The line the signed-off grid prototype draws, now that the row
 * carries the last two. A run that recorded no tempo shows NO TEMPO —
 * not a zero, not a dash that reads like a value, and not the target it
 * was aiming at. Same for the sitting.
 *
 * Absent is common and honest: every row written before those fields
 * existed has neither, and a practice run played in silence has no
 * tempo at all. Nothing here reaches for the metronome's current
 * setting or matches a sitting by timestamp to fill a gap.
 * =====================================================================
 */

/**
 * What a target ROW is called where the hand is the whole difference
 * between one target and the next — a scale cell, or a voice-leading
 * cell's single two-handed target. The chord grid prefixes the shape
 * onto these, because there the hand is only half of what a row is.
 */
export const HAND_ROW_LABEL: Readonly<Record<DrillHand, string>> = {
  left: 'Left hand',
  right: 'Right hand',
  both: 'Both hands',
};

/**
 * The Drill button's word — the app's approved three, and the reason
 * every target here carries a hand even where the row's own name
 * already says which shape it is. The row says WHICH; the button says
 * which HAND, and neither invents a word.
 */
const DRILL_LABEL: Readonly<Record<DrillHand, string>> = {
  left: 'Drill left hand',
  right: 'Drill right hand',
  both: 'Drill both hands',
};

const FEEL_WORD: Record<number, string> = {
  1: 'Struggled', 2: 'Working on it', 3: 'Clean', 4: 'In flow',
};

/** One drillable thing under the cell, with everything known about it. */
export interface DetailTarget {
  /** `targetKey(itemRef, hand)` — the app's one spelling for a target,
   *  so the set this section toggles is the set every counting surface
   *  reads. */
  key: string;
  /** What the row is called: "Left hand", or "Root position · Left
   *  hand" where the cell holds more than one shape. */
  label: string;
  hand: DrillHand;
  progress: HandProgress;
}

/**
 * How the cell's own word was arrived at, or null where there is
 * nothing to arrive at.
 *
 * NULL WHERE A CELL HOLDS ONE TARGET. Voice leading is two-handed by
 * nature, so its cell IS its target — there is no rule to pick and no
 * sentence explaining a choice nobody made.
 */
export interface RollupNote {
  ruleWord: 'furthest' | 'lowest';
  /** The noun for what is being rolled up — "hands" on the scales
   *  grid, whose sentence is approved with it. NULL on the chord grid,
   *  where the twelve things are shapes across hands and the walked
   *  prototype's own sentence names no noun. */
  unitLabel: string | null;
}

interface Props {
  /** The cell's name, or null when none has been picked. */
  cellLabel: string | null;
  targets: ReadonlyArray<DetailTarget>;
  /** The cell's own status — the roll-up of the counted targets. */
  verdict: BandVerdict;
  /** How that word was arrived at, or null where the cell is its own
   *  target. See `RollupNote`. */
  rollup: RollupNote | null;
  /** A closing fact about every target here. "Two octaves, always."
   *  is a scale's; the other two grids have none. */
  note?: string;
  /** Which targets are out of the cell's score, by `key`. */
  notCounted: ReadonlySet<string>;
  /** ABSENT MEANS NO EDIT WHAT COUNTS. A cell with one target has
   *  nothing to take out — doing so would leave it with no status at
   *  all — so the control is not offered rather than offered and
   *  refused. */
  onToggleCounted?: (key: string) => void;
  /**
   * SPREAD THE CHANGE JUST MADE ALONG THE KEY AXIS.
   *
   * Offered after a target is toggled, never before: the offer names
   * a change that has already happened, so it reads as "and the rest"
   * rather than as a mode you have to be in first. `nowOut` says which
   * way the change went, so the wider gesture matches it — putting one
   * back offers putting all twelve back.
   *
   * Absent where there is no key axis to spread along.
   */
  onApplyToEveryKey?: (key: string, nowOut: boolean) => void;
  onDrill: (key: string) => void;
  /** How long each sitting held, by id — see `sessionSecondsById`.
   *  A run whose sitting is not in here shows no sitting. */
  sessionSeconds: ReadonlyMap<string, number>;
  now: number;
  ref?: React.Ref<HTMLDivElement>;
}

export default function CellProgressDetails({
  cellLabel, targets, verdict, rollup, note, notCounted, onToggleCounted,
  onApplyToEveryKey, onDrill, sessionSeconds, now, ref,
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  /**
   * The target just toggled, and which way it went.
   *
   * THE OFFER FOLLOWS A CHANGE RATHER THAN PRECEDING IT. Cleared when
   * edit mode closes, and replaced when another target is toggled —
   * one offer at a time, always about the last thing done.
   */
  const [lastEdit, setLastEdit] = useState<{ key: string; nowOut: boolean } | null>(null);

  const counted = targets.filter(t => !notCounted.has(t.key));
  const practiceSeconds = counted.reduce((n, t) => n + t.progress.practiceSeconds, 0);
  const testSeconds = counted.reduce((n, t) => n + t.progress.testSeconds, 0);
  const outCount = targets.length - counted.length;
  /** Has ANY of this cell been touched? See `timeLine`. */
  const cellTouched = counted.some(t => touched(t.progress));

  return (
    /**
     * ROOM TO REACH THE TOP.
     *
     * A browser cannot scroll past the end of the document, so a
     * section near the bottom of the page stops part way however it is
     * asked — which is how Progress Details ended up at the BOTTOM of
     * the screen with the grid you had just left filling the rest.
     * Reserved only while a cell is picked: an empty state has nothing
     * to scroll to and a screen of blank under it would be a hole.
     */
    <div className={`space-y-2 ${cellLabel === null ? '' : 'min-h-[85vh]'}`}>
      <ProgressTrackerBand
        ref={ref}
        data-testid="scale-progress-details"
        label="Progress Details"
        right={cellLabel ?? undefined}
      />

      {cellLabel === null ? (
        <p className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700 px-3 py-6 text-center text-xs text-neutral-500">
          Pick a cell above and everything about it shows up here.
        </p>
      ) : (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700">
          <div className="flex items-baseline gap-3 px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
            <span className="text-sm font-medium">{cellLabel}</span>
            <span className="flex-1" />
            {/* NO EDIT WHAT COUNTS WHERE THERE IS ONE TARGET. See
                `onToggleCounted`. */}
            {onToggleCounted && (
              <button
                type="button"
                onClick={() => {
                  setEditing(e => !e);
                  setOpenKey(null);
                  setLastEdit(null);
                }}
                className="text-[11px] text-neutral-500 hover:text-fluent underline underline-offset-2"
              >
                {editing ? 'Done' : 'Edit what counts'}
              </button>
            )}
          </div>

          {editing && (
            /* THE APPROVED SENTENCE for this mode, from the copy file's
               shapes-grid section. It is deliberately noun-free —
               "anything" — which is why it works on a grid whose
               targets are hands and on one whose targets are shapes
               across hands. */
            <p className="px-3 py-2 text-[11px] leading-snug text-neutral-600 dark:text-neutral-300 bg-developing/10">
              Tap anything you&rsquo;re not working on. It won&rsquo;t count toward
              this cell&rsquo;s status.
            </p>
          )}

          {/* THE ROLL-UP, AND THE TIME BEHIND IT. Both read the targets
              still counted, so the status and the number under it
              cannot describe different sets. */}
          <p className="px-3 py-2 text-xs leading-snug text-neutral-700 dark:text-neutral-200">
            Reads <b>{bandVerdictLabel(verdict)}</b>
            {rollup !== null && (
              <>
                {' '}— the {rollup.ruleWord} of the <b>{counted.length}</b>
                {rollup.unitLabel !== null && (
                  <> {rollup.unitLabel}{counted.length === 1 ? '' : ''}</>
                )}{' '}still counted
              </>
            )}
            .{cellTouched && (
              <>
                {' '}<b>Total time</b> {formatDuration(practiceSeconds + testSeconds)}{' '}
                ({formatDuration(practiceSeconds)} practice,{' '}
                {formatDuration(testSeconds)} testing).
              </>
            )}
            {note !== undefined && <> {note}</>}
          </p>

          <div className="px-2 pb-2 space-y-1">
            {targets.map(t => {
              const out = notCounted.has(t.key);
              const open = openKey === t.key && !editing;
              const p = t.progress;
              return (
                <div key={t.key}>
                  {/* =====================================================
                      A ROW IS A CONTROL, AND HAS TO LOOK LIKE ONE.
                      It was a bare line of text with a hover tint, so
                      there was nothing to say it could be pressed until
                      you had already found out. It carries a boundary,
                      a hover, a pointer, a focus ring and a caret that
                      turns — the whole affordance, without hovering.
                      The contents are unchanged.
                      ===================================================== */}
                  <button
                    type="button"
                    data-testid="detail-target"
                    data-target={t.key}
                    data-counted={out ? 'false' : 'true'}
                    aria-expanded={editing ? undefined : open}
                    onClick={() => {
                      if (editing) {
                        onToggleCounted?.(t.key);
                        // The state it is ABOUT to be in — the parent
                        // owns the set and has not written it yet.
                        setLastEdit({ key: t.key, nowOut: !out });
                        return;
                      }
                      setOpenKey(open ? null : t.key);
                    }}
                    className={[
                      'w-full flex items-center gap-2 px-2 py-2 rounded-md text-left text-xs',
                      'border bg-white dark:bg-neutral-900',
                      'border-neutral-200 dark:border-neutral-700',
                      'cursor-pointer transition-colors',
                      'hover:border-fluent hover:bg-fluent/5',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fluent',
                      open ? 'border-fluent bg-fluent/5' : '',
                      out ? 'opacity-55' : '',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden
                      className={`text-[9px] w-2 shrink-0 transition-transform ${
                        open ? 'text-fluent rotate-90' : 'text-neutral-500'
                      }`}
                    >
                      ▸
                    </span>
                    {/* STRUCK THROUGH WHERE IT IS OUT, as the prototype
                        draws it: the row is still here and still says
                        what it reached — it has simply stopped
                        counting. Nothing is deleted. */}
                    <span className={`font-medium w-40 shrink-0 ${out ? 'line-through' : ''}`}>
                      {t.label}
                    </span>
                    <span className="shrink-0">{bandVerdictLabel(p.verdict)}</span>
                    <span className="flex-1 min-w-0 text-[11px] text-neutral-500 truncate">
                      {/* NOTHING RATHER THAN EMPTY FIELDS. An untouched
                          target printed "Total time — (— practice, —
                          testing)" — a row of em dashes saying nothing,
                          twice over on a cell where none of it had been
                          touched. A dash in a log reads as a
                          measurement. */}
                      {touched(p) && (
                        <>
                          <b>Total time</b>{' '}
                          {formatDuration(p.practiceSeconds + p.testSeconds)} (
                          {formatDuration(p.practiceSeconds)} practice,{' '}
                          {formatDuration(p.testSeconds)} testing)
                        </>
                      )}
                      {p.lastPracticedAt !== null && (
                        <>
                          {touched(p) && ' · '}
                          <b>Last practiced</b> {formatAgo(p.lastPracticedAt, now)}
                        </>
                      )}
                    </span>
                    {out && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 shrink-0">
                        not counted
                      </span>
                    )}
                  </button>

                  {/* AND THE REST OF THE KEYS, if you want them.
                      Offered under the row it is about, so there is
                      nothing to read to work out what "every key" would
                      apply to. It disappears once taken, because it has
                      been taken. */}
                  {editing && onApplyToEveryKey && lastEdit?.key === t.key && (
                    <div className="ml-6 mb-1">
                      <button
                        type="button"
                        data-testid="apply-to-every-key"
                        onClick={() => {
                          onApplyToEveryKey(t.key, lastEdit.nowOut);
                          setLastEdit(null);
                        }}
                        className="px-2 py-0.5 rounded-md border border-developing/50 text-developing text-[11px] font-medium hover:bg-developing/10"
                      >
                        Apply to every key
                      </button>
                    </div>
                  )}

                  {open && (
                    <div className="ml-6 mb-2 space-y-2">
                      {/* THE DRILL BUTTON SITS ABOVE THE LOGS. What you
                          came to do, before the history of having done
                          it. */}
                      <button
                        type="button"
                        onClick={() => onDrill(t.key)}
                        className="px-3 py-1.5 rounded-lg bg-fluent text-white text-xs font-medium hover:opacity-90"
                      >
                        {DRILL_LABEL[t.hand]}
                      </button>
                      <RunLog
                        title="Practice runs"
                        runs={p.practiceRuns}
                        sessionSeconds={sessionSeconds}
                        now={now}
                      />
                      <RunLog
                        title="Test runs"
                        runs={p.testRuns}
                        sessionSeconds={sessionSeconds}
                        now={now}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* HOW MANY ARE OUT, from the prototype's own footer. Absent
              when none are: a zero here would be a fact nobody needed. */}
          {outCount > 0 && (
            <p className="px-3 pb-2 text-[11px] text-neutral-500">
              <b>{outCount}</b> taken out of this cell&rsquo;s score.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Has this target been touched at all?
 *
 * BOTH HALVES, because a run can be logged without a rating and a
 * rating can arrive without a drill row — the two sources answer
 * different questions and neither is a proxy for the other. See
 * `HandProgress`.
 */
function touched(p: HandProgress): boolean {
  return p.practiceSeconds > 0 || p.testSeconds > 0 || p.lastPracticedAt !== null;
}

/** One log, newest first. */
function RunLog({ title, runs, sessionSeconds, now }: {
  title: string;
  runs: ReadonlyArray<DrillSession>;
  sessionSeconds: ReadonlyMap<string, number>;
  now: number;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
        {title}
      </div>
      {runs.length === 0 ? (
        <p className="text-[11px] text-neutral-400">None yet.</p>
      ) : (
        <div className="space-y-0.5">
          {runs.map((r, i) => (
            <div key={r.id} className="flex items-baseline gap-2 text-[11px]">
              <span className="font-mono text-neutral-400 w-6 shrink-0">
                #{runs.length - i}
              </span>
              <span className="font-medium">
                {r.feelRating ? FEEL_WORD[r.feelRating] : 'Not rated'}
              </span>
              {/* WHAT IS THERE, IN ORDER, AND NOTHING FOR WHAT IS NOT.
                  A missing tempo or sitting drops its own segment and
                  its separator with it — no placeholder takes the
                  space, because a placeholder in a log reads as a
                  measurement. */}
              <span className="text-neutral-500">
                {runLine(r, sessionSeconds, now)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One run's line: length, then whatever else the row recorded.
 *
 * The order is the prototype's — length · tempo · when · sitting — and
 * a segment the row cannot fill is not written, separator and all.
 */
function runLine(
  run: DrillSession, sessionSeconds: ReadonlyMap<string, number>, now: number,
): string {
  const sitting = run.sessionId === undefined
    ? undefined
    : sessionSeconds.get(run.sessionId);
  return [
    formatDuration(run.durationSeconds),
    run.bpm !== undefined ? `${run.bpm} bpm` : null,
    formatAgo(run.timestamp, now),
    sitting !== undefined ? `session ${formatDuration(sitting)}` : null,
  ].filter((part): part is string => part !== null).join(' \u00b7 ');
}
