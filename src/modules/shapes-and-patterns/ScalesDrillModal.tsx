/**
 * Slim drill runner for a single Scales cell. Mirrors the
 * DrillSessionModal flow (setup → running → paused → assess) but
 * runs purely off the Scales-submodule itemRef ladder instead of
 * the legacy DrillSkill / DrillType rows — the Scales catalog is
 * static (96 cells from scaleSkills.ts), spacingState is the
 * canonical signal, and there are no per-cell DrillType subdivisions
 * to pick from.
 *
 * On save the modal calls `recordEngagement` against the cell's
 * scale itemRef with the procedural-memory rating signal that comes
 * out of the user's Flying / Cruising / Crawling pick. No
 * DrillSession row is written — scale practice no longer rides the
 * legacy DrillSession history.
 *
 * For natural-minor cells the assess phase surfaces the relative-
 * major callout from the design doc ("C natural minor → relative
 * major: Eb") so the user can flow into the major scale next.
 */
import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/Modal';
import { recordEngagement } from '../../lib/spacingState';
import { formatDuration } from './drillModel';
import { relativeMajorOf } from './spTiers';
import type { ScaleCell } from './scaleSkills';

interface Props {
  cell: ScaleCell;
  onClose: () => void;
  onLogged?: () => void;
}

type Phase = 'setup' | 'running' | 'paused' | 'assess';

type FeelRating = 'flying' | 'cruising' | 'crawling';

const FEEL_OPTIONS: ReadonlyArray<{
  value: FeelRating;
  label: string;
  hint: string;
  activeClass: string;
  inactiveClass: string;
}> = [
  {
    value: 'flying',
    label: 'Flying',
    hint: 'effortless, in flow',
    activeClass: 'bg-amber-500 text-white border-amber-500',
    inactiveClass:
      'border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10',
  },
  {
    value: 'cruising',
    label: 'Cruising',
    hint: 'steady, clean execution',
    activeClass: 'bg-fluent text-white border-fluent',
    inactiveClass:
      'border-fluent/40 text-fluent hover:bg-fluent/10',
  },
  {
    value: 'crawling',
    label: 'Crawling',
    hint: 'struggle, breakdowns',
    activeClass: 'bg-needswork text-white border-needswork',
    inactiveClass:
      'border-needswork/40 text-needswork hover:bg-needswork/10',
  },
];

/** Suggested per-cell drill duration in seconds. Maintenance scales
 *  (major) ride a fast 30 s warm-up; natural minor — the drill cell
 *  — gets 90 s; pent cells stay at 30 s. Matches the
 *  SCALES_SUBMODULE_DESIGN.md weighting split that the session
 *  algorithm reads. */
function suggestedDurationFor(cell: ScaleCell): number {
  return cell.kind === 'natural-minor' ? 90 : 30;
}

function cellTitle(cell: ScaleCell): string {
  return cell.startingPoint
    ? `${cell.keyName} ${labelForKind(cell.kind)} — from ${cell.startingPoint}`
    : `${cell.keyName} ${labelForKind(cell.kind)}`;
}

function labelForKind(kind: ScaleCell['kind']): string {
  switch (kind) {
    case 'major':            return 'Major Scale';
    case 'natural-minor':    return 'Natural Minor';
    case 'major-pentatonic': return 'Major Pentatonic';
    case 'minor-pentatonic': return 'Minor Pentatonic';
  }
}

export default function ScalesDrillModal({ cell, onClose, onLogged }: Props) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [feel, setFeel] = useState<FeelRating | null>(null);
  const [saving, setSaving] = useState(false);
  const intervalRef = useRef<number | null>(null);

  // Local timer — no global session integration. Scales drilling
  // from this modal is independent of the active Practice Sessions
  // timer (which has its own block-level accounting).
  useEffect(() => {
    if (phase !== 'running') {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = window.setInterval(() => {
      setElapsedSec(s => s + 1);
    }, 1000);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [phase]);

  const handleStart = () => {
    setPhase('running');
    setElapsedSec(0);
  };
  const handlePause = () => setPhase('paused');
  const handleResume = () => setPhase('running');
  const handleEnd = () => setPhase('assess');

  const handleSave = async () => {
    if (saving || feel === null) return;
    setSaving(true);
    try {
      await recordEngagement({
        itemRef: cell.itemRef,
        moduleRef: 'shapes-and-patterns',
        signal: { kind: 'rating', rating: feel },
      });
      onLogged?.();
      onClose();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[scales-drill] save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const suggested = suggestedDurationFor(cell);
  const overSuggested = elapsedSec > suggested;
  const title = cellTitle(cell);

  // Relative-major callout — surfaces in the assess phase for
  // natural-minor cells. Provides the "next step" framing from the
  // design doc: drilling C natural minor primes the user for Eb
  // major next (same notes, brighter framing).
  const showRelativeMajor = cell.kind === 'natural-minor' && phase === 'assess';
  const relativeMajor = showRelativeMajor ? relativeMajorOf(cell.keyName) : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={
        cell.tier === 'maintenance'
          ? `Maintenance scale · ~${suggested}s suggested`
          : `Drill scale · ~${suggested}s suggested`
      }
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            Close
          </button>
          {phase === 'assess' && (
            <button
              onClick={() => void handleSave()}
              disabled={feel === null || saving}
              className={`px-4 py-1.5 rounded-md text-sm font-medium text-white ${
                feel === null || saving
                  ? 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'
                  : 'bg-fluent hover:opacity-90'
              }`}
            >
              {saving ? 'Saving…' : 'Save rating'}
            </button>
          )}
        </div>
      )}
    >
      <div className="space-y-4">
        {phase === 'setup' && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Run the scale up and down. Aim for ~{suggested}s; longer is fine
              if you want to settle in. Rate Flying / Cruising / Crawling when
              you're done.
            </p>
            <button
              onClick={handleStart}
              className="w-full px-4 py-2 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
            >
              Start drill
            </button>
          </div>
        )}

        {(phase === 'running' || phase === 'paused') && (
          <div className="space-y-4 text-center">
            <div className="text-5xl font-mono tabular-nums">
              {formatDuration(elapsedSec)}
            </div>
            <div
              className={`text-[11px] uppercase tracking-wide ${
                overSuggested ? 'text-developing' : 'text-neutral-500'
              }`}
            >
              {overSuggested
                ? `over suggested · ${suggested}s target`
                : `running · ~${suggested}s target`}
            </div>
            <div className="flex items-center justify-center gap-2">
              {phase === 'running' ? (
                <button
                  onClick={handlePause}
                  className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
                >
                  Pause
                </button>
              ) : (
                <button
                  onClick={handleResume}
                  className="px-3 py-1.5 rounded-md border border-fluent text-fluent text-sm"
                >
                  Resume
                </button>
              )}
              <button
                onClick={handleEnd}
                className="px-4 py-1.5 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
              >
                End drill
              </button>
            </div>
          </div>
        )}

        {phase === 'assess' && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                Drilled for
              </div>
              <div className="text-2xl font-mono tabular-nums">
                {formatDuration(elapsedSec)}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                How did it feel?
              </div>
              <div className="grid grid-cols-1 gap-2">
                {FEEL_OPTIONS.map(opt => {
                  const active = feel === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFeel(opt.value)}
                      aria-pressed={active}
                      className={`w-full px-3 py-2 rounded-md border text-sm text-left transition-colors ${
                        active ? opt.activeClass : opt.inactiveClass
                      }`}
                    >
                      <span className="font-medium">{opt.label}</span>
                      <span className="ml-2 opacity-70 text-xs">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {showRelativeMajor && relativeMajor && (
              <div className="rounded-md border border-fluent/30 bg-fluent/5 p-3 text-xs space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-fluent">
                  Relative major
                </div>
                <div className="text-neutral-700 dark:text-neutral-200">
                  <span className="font-mono">{cell.keyName} natural minor</span>
                  {' → relative major: '}
                  <span className="font-mono font-medium">{relativeMajor}</span>
                </div>
                <div className="text-neutral-500">
                  Same seven notes, different tonic — handy to drill {relativeMajor} major next.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
