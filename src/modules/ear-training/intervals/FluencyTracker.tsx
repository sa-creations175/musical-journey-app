import { useEffect, useMemo, useRef, useState } from 'react';
import { db, type AttemptRecord, type IntervalData } from '../../../lib/db';
import EtItemCurationButton from '../EtItemCurationButton';
import EtItemStatus from '../EtItemStatus';
import EtRowCheckbox from '../EtRowCheckbox';
import EtBulkActionBar from '../EtBulkActionBar';
import EtSelectToggle from '../EtSelectToggle';
import { useEtCurationsLive } from '../useEtCurations';
import { useEtSelection } from '../useEtSelection';
import { ROLLING_WINDOW_SIZE } from '../../../lib/adaptiveSelection';
import { daysBetween, lastPracticedDaysAgo, localDayKey } from '../../../lib/dailyGoal';
import {
  MIN_ATTEMPTS_FOR_TIER,
  TIER_BADGE_CLASS,
  TIER_BAR_CLASS,
  TIER_DESCRIPTION,
  TIER_LABEL,
  TIER_TEXT_CLASS,
  computeTier,
  type Tier,
} from '../../../lib/tier';

const ANCHOR_MAX = 120;
const MODULE_ID = 'intervals';

type Direction = 'asc' | 'desc';

interface RollingStats {
  correct: number;
  total: number;
  percent: number;
  tier: Tier;
  daysSinceLastAttempt: number | null;
}

function rollingFor(attempts: AttemptRecord[], itemId: string, direction: Direction): RollingStats {
  const filtered = attempts
    .filter(a => a.moduleId === MODULE_ID && a.itemId === itemId && a.direction === direction)
    .sort((a, b) => b.timestamp - a.timestamp);
  const recent = filtered.slice(0, ROLLING_WINDOW_SIZE);
  const correct = recent.filter(a => a.correct).length;
  const total = recent.length;
  const today = localDayKey();
  const latestTs = filtered[0]?.timestamp;
  const daysSinceLastAttempt = latestTs
    ? daysBetween(localDayKey(new Date(latestTs)), today)
    : null;
  const tier = computeTier({
    windowCorrect: correct,
    windowTotal: total,
    daysSinceLastAttempt,
  });
  return {
    correct,
    total,
    percent: total === 0 ? 0 : Math.round((correct / total) * 100),
    tier,
    daysSinceLastAttempt,
  };
}

async function bumpManual(id: string, direction: Direction, field: 'correct' | 'total', delta: number) {
  const iv = await db.intervals.get(id);
  if (!iv) return;
  const key = (direction === 'asc' ? 'asc' : 'desc') + (field === 'correct' ? 'Correct' : 'Total') as
    | 'ascCorrect' | 'ascTotal' | 'descCorrect' | 'descTotal';
  const next = Math.max(0, iv[key] + delta);
  const patch: Partial<IntervalData> = { [key]: next };
  if (field === 'total') {
    const correctKey = direction === 'asc' ? 'ascCorrect' : 'descCorrect';
    if (iv[correctKey] > next) patch[correctKey] = next;
  } else {
    const totalKey = direction === 'asc' ? 'ascTotal' : 'descTotal';
    if (next > iv[totalKey]) patch[totalKey] = next;
  }
  await db.intervals.update(id, patch);
}

interface DirectionStatsProps {
  iv: IntervalData;
  direction: Direction;
  rolling: RollingStats;
}

function DirectionStats({ iv, direction, rolling }: DirectionStatsProps) {
  const manualCorrect = direction === 'asc' ? iv.ascCorrect : iv.descCorrect;
  const manualTotal = direction === 'asc' ? iv.ascTotal : iv.descTotal;
  const isUntouched = rolling.tier === 'untouched';
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between text-xs text-neutral-500 mb-1 gap-2 flex-wrap">
        <span>{direction === 'asc' ? 'ascending' : 'descending'}</span>
        <span className="font-mono">
          {isUntouched ? (
            <span className="text-neutral-400">
              no data yet — needs {MIN_ATTEMPTS_FOR_TIER} ({rolling.total}/{MIN_ATTEMPTS_FOR_TIER})
            </span>
          ) : (
            <>
              {rolling.correct}/{rolling.total}
              <span className="ml-1">· {rolling.percent}%</span>
              <span className={`ml-1 ${TIER_TEXT_CLASS[rolling.tier]}`}>— {TIER_LABEL[rolling.tier]}</span>
            </>
          )}
        </span>
      </div>
      <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        <div
          className={`h-full ${TIER_BAR_CLASS[rolling.tier]} transition-all`}
          style={{ width: rolling.total === 0 ? 0 : `${Math.max(4, rolling.percent)}%` }}
        />
      </div>
      <div className="mt-2 text-[11px] text-neutral-500">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-neutral-400">manual log</span>
          <span className="font-mono mr-1">{manualCorrect}/{manualTotal}</span>
          <button
            onClick={() => bumpManual(iv.id, direction, 'correct', -1)}
            className="w-5 h-5 rounded border border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent"
            aria-label={`remove correct ${direction}`}
          >−</button>
          <button
            onClick={() => bumpManual(iv.id, direction, 'correct', 1)}
            className="px-1.5 h-5 rounded border border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent"
          >+correct</button>
          <button
            onClick={() => bumpManual(iv.id, direction, 'total', -1)}
            className="w-5 h-5 rounded border border-neutral-200 dark:border-neutral-700 hover:border-needswork hover:text-needswork"
            aria-label={`remove attempt ${direction}`}
          >−</button>
          <button
            onClick={() => bumpManual(iv.id, direction, 'total', 1)}
            className="px-1.5 h-5 rounded border border-neutral-200 dark:border-neutral-700 hover:border-needswork hover:text-needswork"
          >+attempt</button>
        </div>
      </div>
    </div>
  );
}

interface AnchorEditorProps {
  iv: IntervalData;
  direction: Direction;
}

function AnchorRow({ iv, direction }: AnchorEditorProps) {
  const defaultText = direction === 'asc' ? iv.ascAnchorDefault : iv.descAnchorDefault;
  const customText = direction === 'asc' ? iv.ascAnchorCustom : iv.descAnchorCustom;
  const active = customText ?? defaultText;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(customText ?? '');

  const openEditor = () => {
    setDraft(customText ?? '');
    setEditing(true);
  };

  const save = async () => {
    const trimmed = draft.trim().slice(0, ANCHOR_MAX);
    const patch: Partial<IntervalData> = direction === 'asc'
      ? { ascAnchorCustom: trimmed.length ? trimmed : undefined }
      : { descAnchorCustom: trimmed.length ? trimmed : undefined };
    await db.intervals.update(iv.id, patch);
    setEditing(false);
  };

  const useDefault = async () => {
    const patch: Partial<IntervalData> = direction === 'asc'
      ? { ascAnchorCustom: undefined }
      : { descAnchorCustom: undefined };
    await db.intervals.update(iv.id, patch);
    setEditing(false);
  };

  return (
    <div className="text-xs">
      <div className="flex items-start gap-2">
        <div className="text-neutral-500 w-14 shrink-0 pt-0.5">{direction === 'asc' ? 'asc ♪' : 'desc ♪'}</div>
        {!editing ? (
          <div className="flex-1 min-w-0 flex items-start gap-2">
            <span className={customText ? 'italic' : ''}>
              {active}
              {customText && <span className="ml-1 not-italic text-neutral-500">(your reference)</span>}
            </span>
            <button
              onClick={openEditor}
              aria-label={`edit ${direction} anchor`}
              className="text-neutral-400 hover:text-fluent shrink-0"
              title="edit anchor"
            >
              ✎
            </button>
          </div>
        ) : (
          <div className="flex-1 min-w-0 space-y-2">
            <textarea
              value={draft}
              maxLength={ANCHOR_MAX}
              onChange={e => setDraft(e.target.value.slice(0, ANCHOR_MAX))}
              rows={2}
              className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs focus:outline-none focus:border-fluent"
              placeholder={defaultText}
            />
            <div className="flex items-center gap-2">
              <button onClick={save} className="px-2 py-1 rounded-md bg-fluent text-white hover:opacity-90">save</button>
              <button onClick={() => setEditing(false)} className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700">cancel</button>
              {customText && (
                <button onClick={useDefault} className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-500">use default</button>
              )}
              <span className="ml-auto text-neutral-400">{draft.length}/{ANCHOR_MAX}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const TIER_ORDER: Tier[] = ['mastered', 'fluent', 'developing', 'needsWork', 'stale', 'untouched'];

function TierLegend() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="tier legend"
        aria-expanded={open}
        className="w-5 h-5 rounded-full border border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:text-fluent hover:border-fluent text-xs leading-none"
      >
        ?
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 w-72 rounded-card border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 text-xs shadow-lg">
          <div className="font-medium mb-2">skill tiers</div>
          <ul className="space-y-1.5">
            {TIER_ORDER.map(tier => (
              <li key={tier} className="flex items-start gap-2">
                <span className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${TIER_BAR_CLASS[tier]}`} />
                <span className={`font-medium w-20 shrink-0 ${TIER_TEXT_CLASS[tier]}`}>{TIER_LABEL[tier]}</span>
                <span className="text-neutral-500">{TIER_DESCRIPTION[tier]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface Props {
  intervals: IntervalData[];
  attempts: AttemptRecord[];
}

export default function FluencyTracker({ intervals, attempts }: Props) {
  const sorted = useMemo(
    () => [...intervals].sort((a, b) => a.semitones - b.semitones),
    [intervals],
  );
  const itemRefs = useMemo(() => sorted.map(iv => iv.id), [sorted]);
  const curations = useEtCurationsLive(itemRefs);
  const selection = useEtSelection();

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base sm:text-lg font-medium tracking-tight">fluency tracker</h2>
          <TierLegend />
          <EtSelectToggle selection={selection} />
        </div>
        <span className="text-[11px] sm:text-xs text-neutral-500">
          rolling window: last {ROLLING_WINDOW_SIZE} attempts per direction
        </span>
      </div>
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {sorted.map(iv => {
          const ascRolling = rollingFor(attempts, iv.id, 'asc');
          const descRolling = rollingFor(attempts, iv.id, 'desc');
          const bothMastered = ascRolling.tier === 'mastered' && descRolling.tier === 'mastered';
          const anyStale = ascRolling.tier === 'stale' || descRolling.tier === 'stale';
          const ivAttempts = attempts.filter(a => a.moduleId === MODULE_ID && a.itemId === iv.id);
          const daysAgo = lastPracticedDaysAgo(ivAttempts);
          const curation = curations.get(iv.id);
          const dim = curation?.hidden ? 'opacity-60' : '';
          return (
            <div key={iv.id} className={`py-4 first:pt-0 last:pb-0 grid lg:grid-cols-[220px,1fr] gap-3 sm:gap-4 ${dim}`}>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <EtRowCheckbox itemRef={iv.id} selection={selection} />
                  <span className="font-medium">{iv.name}</span>
                  <span className="text-xs font-mono text-neutral-400">{iv.id}</span>
                  <EtItemStatus curation={curation} />
                  <EtItemCurationButton
                    itemRef={iv.id}
                    defaultLabel={iv.name}
                    itemKindLabel="Interval"
                  />
                  {bothMastered && (
                    <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border inline-flex items-center gap-1 ${TIER_BADGE_CLASS.mastered}`}>
                      <span aria-hidden>★</span> mastered
                    </span>
                  )}
                  {anyStale && (
                    <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border inline-flex items-center gap-1 ${TIER_BADGE_CLASS.stale}`} title="was fluent — going cold">
                      <span aria-hidden>⚠</span> stale
                    </span>
                  )}
                </div>
                {daysAgo !== null && daysAgo >= 3 && (
                  <div className={`text-[11px] mt-0.5 ${anyStale ? 'text-neutral-500' : 'text-neutral-400'}`}>
                    last practiced {daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`}
                  </div>
                )}
                <div className="mt-2 space-y-1.5">
                  <AnchorRow iv={iv} direction="asc" />
                  <AnchorRow iv={iv} direction="desc" />
                </div>
              </div>
              <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 min-w-0">
                <DirectionStats iv={iv} direction="asc" rolling={ascRolling} />
                <DirectionStats iv={iv} direction="desc" rolling={descRolling} />
              </div>
            </div>
          );
        })}
      </div>
      {selection.active && (
        <EtBulkActionBar
          selected={selection.selected}
          curations={curations}
          onClear={selection.clear}
          onExit={selection.exit}
        />
      )}
    </section>
  );
}
