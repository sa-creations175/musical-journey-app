/**
 * Slim drill runner for a single Voice-Leading sub-cell.
 *
 * Mirrors ScalesDrillModal: setup → running → paused → assess. Runs
 * off the static VL catalog (no DrillSkill / DrillType rows). On
 * open the modal picks the most-due sub-cell for the supplied
 * (patternId × keyName) using spacingState — surfacing untouched
 * cells first, then the row with the earliest `nextDueAt`. The
 * picked sub-cell label (e.g. "Level 1, Position A") is shown in
 * the modal title so the user knows exactly what they're about to
 * drill.
 *
 * On save the modal does two writes:
 *
 *   1. A DrillSession row via `logVoiceLeadingDrillSession`, so the
 *      VL attempt is counted in getWeeklyAttempts. The row carries
 *      no DrillSkill / DrillType (VL sub-cells have none).
 *   2. A `recordEngagement` against the sub-cell itemRef with the
 *      procedural-memory rating signal — the canonical proficiency
 *      signal that flows through to the heat-grid stage color.
 *
 * Custom user-added patterns aren't in the catalog and won't yield
 * a sub-cell — the modal short-circuits to a placeholder state in
 * that case (deferred: a "no sub-cell catalog yet" affordance).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from '../../components/Modal';
import { db, type SpacingState } from '../../lib/db';
import { recordEngagement } from '../../lib/spacingState';
import { voiceLeadingCellSeconds } from '../../lib/sessionAlgorithm/timePerAttempt';
import {
  formatDuration,
  logVoiceLeadingDrillSession,
} from './drillModel';
import {
  parseVoiceLeadingItemRef,
  pickMostDueVoiceLeadingSubCell,
  VOICE_LEADING_PATTERN_BY_ID,
  voiceLeadingSubCellLabel,
} from './catalog';

interface Props {
  patternId: string;
  keyName: string;
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

export default function VoiceLeadingDrillModal({
  patternId,
  keyName,
  onClose,
  onLogged,
}: Props) {
  const pattern = VOICE_LEADING_PATTERN_BY_ID.get(patternId);

  // Pull the spacingState rows for this module so we can route to the
  // most-due sub-cell. Filtering at query time keeps the dataset
  // small even before sub-cells fill up.
  const spacingRows = useLiveQuery<SpacingState[]>(
    () => db.spacingState
      .where('moduleRef').equals('shapes-and-patterns')
      .toArray(),
    [],
  ) ?? [];

  // Sub-cell pick. Recomputes when spacingState changes; the modal
  // re-targets the next-due sub-cell after a save (the just-drilled
  // cell's nextDueAt moves forward and another sub-cell rotates in).
  const subCellItemRef = useMemo(() => {
    if (!pattern) return null;
    return pickMostDueVoiceLeadingSubCell(
      patternId,
      keyName,
      spacingRows,
    );
  }, [pattern, patternId, keyName, spacingRows]);

  const subCellDesc = subCellItemRef
    ? parseVoiceLeadingItemRef(subCellItemRef)
    : null;
  const subCellLabel = subCellDesc
    ? voiceLeadingSubCellLabel(subCellDesc)
    : null;
  const suggested = subCellDesc ? voiceLeadingCellSeconds(subCellDesc) : 90;

  const [phase, setPhase] = useState<Phase>('setup');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [feel, setFeel] = useState<FeelRating | null>(null);
  const [saving, setSaving] = useState(false);
  const intervalRef = useRef<number | null>(null);

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
    if (saving || feel === null || !subCellItemRef) return;
    setSaving(true);
    try {
      await logVoiceLeadingDrillSession({
        itemRef: subCellItemRef,
        durationSeconds: elapsedSec,
        rating: feel,
        targetSeconds: suggested,
      });
      await recordEngagement({
        itemRef: subCellItemRef,
        moduleRef: 'shapes-and-patterns',
        signal: { kind: 'rating', rating: feel },
      });
      onLogged?.();
      onClose();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[vl-drill] save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const overSuggested = elapsedSec > suggested;
  const title = pattern
    ? `${pattern.label} in ${keyName}`
    : `Voice-leading in ${keyName}`;
  const description = subCellLabel
    ? `${subCellLabel} · ~${suggested}s suggested`
    : `~${suggested}s suggested`;

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
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
              disabled={feel === null || saving || !subCellItemRef}
              className={`px-4 py-1.5 rounded-md text-sm font-medium text-white ${
                feel === null || saving || !subCellItemRef
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
        {!pattern && (
          <div className="text-sm text-neutral-600 dark:text-neutral-300">
            This pattern isn't in the built-in catalog yet, so its sub-cell
            drill flow isn't available. Custom patterns currently support
            heat-grid tracking only.
          </div>
        )}

        {pattern && phase === 'setup' && (
          <div className="space-y-3">
            {subCellLabel && (
              <div className="rounded-md border border-fluent/30 bg-fluent/5 p-3 text-xs">
                <div className="text-[10px] uppercase tracking-wide text-fluent mb-1">
                  Most-due sub-cell
                </div>
                <div className="text-neutral-700 dark:text-neutral-200 font-medium">
                  {subCellLabel}
                </div>
              </div>
            )}
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Run the progression in {keyName} repeatedly for the duration.
              Aim for ~{suggested}s; longer is fine if you want to settle in.
              Rate Flying / Cruising / Crawling when you're done.
            </p>
            <button
              onClick={handleStart}
              className="w-full px-4 py-2 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
            >
              Start drill
            </button>
          </div>
        )}

        {pattern && (phase === 'running' || phase === 'paused') && (
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

        {pattern && phase === 'assess' && (
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
          </div>
        )}
      </div>
    </Modal>
  );
}
