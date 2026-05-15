/**
 * Stage-aware heat grid for a single Voice-Leading pattern × 12 keys.
 *
 * Unlike the generic HeatGrid (which colors from DrillSkill /
 * DrillType aggregates), VL sub-cells live in spacingState only —
 * no per-sub-cell DrillSkill rows. This grid pulls the spacingState
 * rows that match `vl:${patternId}:` and renders the worst (lowest)
 * acquisitionStage across the sub-cells for each key.
 *
 * Custom user-added patterns: rendered with the same shell but
 * cells are not clickable (no sub-cell catalog → no drill flow).
 */
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SpacingState, type AcquisitionStage } from '../../lib/db';
import { KEYS, VOICE_LEADING_PATTERN_BY_ID, enumerateVoiceLeadingCells } from './catalog';

interface Props {
  /** Pattern id — built-in or custom. Custom ids aren't in the
   *  catalog and produce non-interactive cells. */
  patternId: string;
  /** Optional click handler. Called with `keyName` when a cell is
   *  tapped (only fires for built-in patterns). */
  onCellOpen?: (keyName: string) => void;
}

/** Lowest-rank (worst) stage across a set of cells. `null` when the
 *  set is empty. A missing row counts as 'new' — the worst possible
 *  stage — so cells with any sub-cell never practised always color
 *  as untouched. */
function worstStageAcross(
  itemRefs: ReadonlyArray<string>,
  rowsByRef: ReadonlyMap<string, SpacingState>,
): AcquisitionStage {
  if (itemRefs.length === 0) return 'new';
  let worstRank = STAGE_RANK.mastered + 1;
  let worst: AcquisitionStage = 'new';
  for (const ref of itemRefs) {
    const row = rowsByRef.get(ref);
    const stage = row?.acquisitionStage ?? 'new';
    const rank = STAGE_RANK[stage];
    if (rank < worstRank) {
      worstRank = rank;
      worst = stage;
      if (stage === 'new') return 'new';
    }
  }
  return worst;
}

const STAGE_RANK: Readonly<Record<AcquisitionStage, number>> = {
  new:           0,
  acquiring:     1,
  acquired:      2,
  consolidated:  3,
  mastered:      4,
};

/** Background style per stage. Mirrors the heat-grid green ramp
 *  in HeatGrid.tsx so visual continuity is preserved across the
 *  three S&P submodules. */
function stageOpacity(stage: AcquisitionStage, anyRowExists: boolean): number {
  if (!anyRowExists) return 0.05;
  switch (stage) {
    case 'new':          return 0.15;
    case 'acquiring':    return 0.30;
    case 'acquired':     return 0.55;
    case 'consolidated': return 0.75;
    case 'mastered':     return 0.90;
  }
}

function stageTitle(stage: AcquisitionStage, anyRowExists: boolean): string {
  if (!anyRowExists) return 'untouched — click to drill';
  switch (stage) {
    case 'new':          return 'just started — click to drill';
    case 'acquiring':    return 'acquiring — click to drill';
    case 'acquired':     return 'acquired — click to drill';
    case 'consolidated': return 'consolidated — click to drill';
    case 'mastered':     return 'mastered — click to drill';
  }
}

export default function VoiceLeadingPatternGrid({ patternId, onCellOpen }: Props) {
  const pattern = VOICE_LEADING_PATTERN_BY_ID.get(patternId);

  // Pull every spacingState row whose itemRef belongs to this
  // pattern. The compound index `[moduleRef+itemRef]` exists but
  // prefix queries within a compound require dropping to a string
  // index; filter in-memory off the moduleRef-scoped subset since
  // the dataset is small (≤324 VL rows even when fully populated).
  const rows = useLiveQuery<SpacingState[]>(
    () => db.spacingState
      .where('moduleRef').equals('shapes-and-patterns')
      .filter(r => r.itemRef.startsWith(`vl:${patternId}:`))
      .toArray(),
    [patternId],
  ) ?? [];

  const rowsByRef = useMemo(() => {
    const m = new Map<string, SpacingState>();
    for (const r of rows) m.set(r.itemRef, r);
    return m;
  }, [rows]);

  // Pre-compute worst-stage per key.
  const stageByKey = useMemo(() => {
    const m = new Map<string, { stage: AcquisitionStage; anyRowExists: boolean }>();
    if (!pattern) return m;
    for (const k of KEYS) {
      const refs = enumerateVoiceLeadingCells(pattern, k);
      const anyRowExists = refs.some(r => rowsByRef.has(r));
      m.set(k, {
        stage: worstStageAcross(refs, rowsByRef),
        anyRowExists,
      });
    }
    return m;
  }, [pattern, rowsByRef]);

  const interactive = pattern !== undefined;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        <div
          className="grid"
          style={{ gridTemplateColumns: `minmax(160px, 1fr) repeat(${KEYS.length}, minmax(42px, 56px))` }}
        >
          <div />
          {KEYS.map(k => (
            <div
              key={k}
              className="text-[10px] uppercase tracking-wide text-neutral-500 text-center font-mono"
            >
              {k}
            </div>
          ))}
        </div>
        <div
          className="grid items-center"
          style={{ gridTemplateColumns: `minmax(160px, 1fr) repeat(${KEYS.length}, minmax(42px, 56px))` }}
        >
          <div className="text-xs pr-3 py-1 truncate text-neutral-500">
            across 12 keys
          </div>
          {KEYS.map(k => {
            const summary = stageByKey.get(k) ?? { stage: 'new' as const, anyRowExists: false };
            const opacity = stageOpacity(summary.stage, summary.anyRowExists);
            const title = interactive
              ? stageTitle(summary.stage, summary.anyRowExists)
              : 'custom pattern — sub-cell drill flow not yet available';
            return (
              <button
                key={k}
                onClick={interactive && onCellOpen ? () => onCellOpen(k) : undefined}
                disabled={!interactive}
                title={title}
                aria-label={`${k} · ${title}`}
                className={`relative aspect-square mx-0.5 my-0.5 rounded-sm border border-neutral-200/60 dark:border-neutral-800/60 transition focus:outline-none ${
                  interactive
                    ? 'hover:ring-2 hover:ring-fluent/50 cursor-pointer'
                    : 'opacity-60 cursor-not-allowed'
                }`}
                style={{
                  backgroundColor: `rgba(29, 158, 117, ${opacity})`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
