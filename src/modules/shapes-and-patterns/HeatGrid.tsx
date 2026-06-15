import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DrillSkill, type DrillType, type SpacingState, type AcquisitionStage } from '../../lib/db';
import {
  aggregateCell,
  findOrCreateSkill,
  freshnessAlpha,
  freshnessTier,
  heatTierFor,
  humanAgo,
  formatDuration,
  parseShapesItemRef,
  type CellAggregate,
  type SkillDescriptor,
} from './drillModel';
import DrillListModal from './DrillListModal';
import InversionBreakdownPanel from './InversionBreakdownPanel';
import ThreeBandCell, { type BandStage } from './ThreeBandCell';
import { KEYS_CIRCLE_OF_FOURTHS } from './catalog';

interface RowMeta {
  /** Stable id for React keys. */
  id: string;
  /** Label shown on the row's left gutter. */
  label: string;
  /** Build a skill descriptor for a given (row, key). Heat-grid kinds
   *  (chord-shape / scale / voice-leading) supply this. */
  descriptorFor: (keyName: string) => SkillDescriptor;
}

interface Props {
  rows: RowMeta[];
  /** Column keys. Defaults to all 12. Rarely overridden. */
  keyList?: readonly string[];
  /** Optional accent color for the "row label" column (e.g. for
   *  grouping triads vs sevenths). */
  rowAccent?: (row: RowMeta) => string | undefined;
}

/**
 * The shared 12-column heat grid. Generic across chord-shape / scale /
 * voice-leading so the three heat-using activity areas can render
 * with one component. Each cell:
 *   · looks up the matching DrillSkill (if any),
 *   · aggregates its DrillTypes' total seconds + last-practised,
 *   · colours itself by heat tier × freshness,
 *   · flags imbalance via a corner dot,
 *   · opens DrillListModal on click (materialising the skill +
 *     default drill types if it didn't exist yet).
 */
export default function HeatGrid({ rows, keyList = KEYS_CIRCLE_OF_FOURTHS, rowAccent }: Props) {
  const [openSkill, setOpenSkill] = useState<DrillSkill | null>(null);
  // Phase 4 inversion redesign — chord-shape cells route to the
  // breakdown panel (one row per inversion state). Other kinds
  // continue to open DrillListModal directly.
  const [openChordShapeCell, setOpenChordShapeCell] = useState<{ keyName: string; quality: string } | null>(null);

  // Single live query for all skills + types in the module; heavy on
  // first load but avoids N×M queries per cell.
  const allSkills = useLiveQuery<DrillSkill[]>(() => db.drillSkills.toArray(), []) ?? [];
  const allTypes = useLiveQuery<DrillType[]>(() => db.drillTypes.toArray(), []) ?? [];

  // Group drill types by skillId for O(1) lookup when colouring each
  // cell.
  const typesBySkill = useMemo(() => {
    const m = new Map<string, DrillType[]>();
    for (const t of allTypes) {
      const arr = m.get(t.skillId) ?? [];
      arr.push(t);
      m.set(t.skillId, arr);
    }
    return m;
  }, [allTypes]);

  // Per-(quality × key × hand) acquisition stages — chord-shape cells
  // render three bands (LH / RH / Both), each coloured by that hand's
  // acquisition state aggregated across the cell's inversion rows. Keyed
  // `${quality} ${keyName} ${hand}`.
  const allSpacing = useLiveQuery<SpacingState[]>(
    () => db.spacingState.where('moduleRef').equals('shapes-and-patterns').toArray(),
    [],
  ) ?? [];
  const chordStagesByCellHand = useMemo(() => {
    const m = new Map<string, AcquisitionStage[]>();
    for (const r of allSpacing) {
      const d = parseShapesItemRef(r.itemRef);
      if (!d || d.kind !== 'chord-shape') continue;
      const key = `${d.quality} ${d.keyName} ${r.hand}`;
      const arr = m.get(key) ?? [];
      arr.push(r.acquisitionStage);
      m.set(key, arr);
    }
    return m;
  }, [allSpacing]);
  // A cell-hand band reads `acquired` only when every drilled inversion
  // for that hand is acquired+, `acquiring` if any is started, and null
  // (not started) when the hand has no rows.
  const chordBandStage = (quality: string, keyName: string, hand: string): BandStage => {
    const stages = chordStagesByCellHand.get(`${quality} ${keyName} ${hand}`);
    if (!stages || stages.length === 0) return null;
    const allAcquired = stages.every(
      s => s === 'acquired' || s === 'consolidated' || s === 'mastered',
    );
    return allAcquired ? 'acquired' : 'acquiring';
  };

  const openCell = async (desc: SkillDescriptor) => {
    if (desc.kind === 'chord-shape') {
      // Materialise the cell's inversion-state rows up-front, then route
      // to the breakdown panel.
      await findOrCreateSkill(desc);
      setOpenChordShapeCell({ keyName: desc.keyName, quality: desc.quality });
    } else {
      const skill = await findOrCreateSkill(desc);
      setOpenSkill(skill);
    }
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        {/* Column header with key names */}
        <div
          className="grid"
          style={{ gridTemplateColumns: `minmax(160px, 1fr) repeat(${keyList.length}, minmax(42px, 56px))` }}
        >
          <div />
          {keyList.map(k => (
            <div
              key={k}
              className="text-[10px] uppercase tracking-wide text-neutral-500 text-center font-mono"
            >
              {k}
            </div>
          ))}
        </div>

        {/* Rows */}
        {rows.map(row => (
          <div
            key={row.id}
            className="grid items-center"
            style={{ gridTemplateColumns: `minmax(160px, 1fr) repeat(${keyList.length}, minmax(42px, 56px))` }}
          >
            <div className={`text-xs pr-3 py-1 truncate ${rowAccent?.(row) ?? ''}`} title={row.label}>
              {row.label}
            </div>
            {keyList.map(k => {
              const desc = row.descriptorFor(k);
              // Chord-shape cells show three per-hand acquisition bands
              // (LH / RH / Both); other kinds keep the heat cell.
              if (desc.kind === 'chord-shape') {
                return (
                  <ThreeBandCell
                    key={k}
                    left={chordBandStage(desc.quality, desc.keyName, 'left')}
                    right={chordBandStage(desc.quality, desc.keyName, 'right')}
                    both={chordBandStage(desc.quality, desc.keyName, 'both')}
                    title={`${desc.quality} ${desc.keyName} — LH / RH / Both`}
                    onClick={() => { void openCell(desc); }}
                  />
                );
              }
              return (
                <Cell
                  key={k}
                  descriptor={desc}
                  skill={findSkillFor(allSkills, desc)}
                  types={findTypesFor(allSkills, typesBySkill, desc)}
                  onOpen={() => { void openCell(desc); }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {openSkill && (
        <DrillListModal
          skill={openSkill}
          onClose={() => setOpenSkill(null)}
        />
      )}
      {openChordShapeCell && (
        <InversionBreakdownPanel
          keyName={openChordShapeCell.keyName}
          quality={openChordShapeCell.quality}
          onClose={() => setOpenChordShapeCell(null)}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------

interface CellProps {
  descriptor: SkillDescriptor;
  skill?: DrillSkill;
  types: DrillType[];
  onOpen: () => void;
}

function Cell({ descriptor, skill, types, onOpen }: CellProps) {
  const agg: CellAggregate = aggregateCell(types);
  const heat = heatTierFor(agg.totalSeconds);
  const fresh = freshnessTier(agg.lastPracticedAt);
  const alpha = freshnessAlpha(fresh);

  // Base colour intensity from heat tier. Freshness multiplies alpha
  // so stale cells visibly desaturate.
  const heatOpacity = heat === 'empty' ? 0.05
    : heat === 'light' ? 0.25
    : heat === 'medium' ? 0.55
    : 0.85;
  const effectiveOpacity = heatOpacity * alpha;

  const untouched = skill === undefined || agg.totalSeconds === 0;
  const title = untouched
    ? `${descriptor.kind === 'chord-shape' ? 'Not practised' : 'Untouched'} — click to open`
    : `${formatDuration(agg.totalSeconds)} · last ${humanAgo(agg.lastPracticedAt)}${agg.imbalanced ? ' · imbalanced' : ''}`;

  const attentionFlag = fresh === 'aging' || fresh === 'stale';

  return (
    <button
      onClick={onOpen}
      title={title}
      className="relative aspect-square mx-0.5 my-0.5 rounded-sm border border-neutral-200/60 dark:border-neutral-800/60 hover:ring-2 hover:ring-fluent/50 transition focus:outline-none"
      style={{
        backgroundColor: `rgba(29, 158, 117, ${effectiveOpacity})`,
      }}
    >
      {agg.imbalanced && (
        <span
          aria-hidden
          className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-developing"
          title="incomplete — some drill types under-practised"
        />
      )}
      {attentionFlag && agg.totalSeconds > 0 && (
        <span
          aria-hidden
          className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-needswork/80"
          title="going stale — time for a refresh"
        />
      )}
    </button>
  );
}

function findSkillFor(skills: DrillSkill[], desc: SkillDescriptor): DrillSkill | undefined {
  switch (desc.kind) {
    case 'chord-shape':
      // Multiple skill rows may match a chord-shape cell after the
      // Phase 4 inversion redesign (one per inversion state). Return
      // the first match so the cell's "is touched at all?" check
      // still resolves; per-row coloring uses findTypesFor (which
      // unions drillTypes across all matching skills).
      return skills.find(s => s.kind === 'chord-shape' && s.keyName === desc.keyName && s.quality === desc.quality);
    case 'scale':
      return skills.find(s => s.kind === 'scale' && s.keyName === desc.keyName && s.scale === desc.scale);
    case 'voice-leading':
      return skills.find(s => s.kind === 'voice-leading' && s.patternId === desc.patternId && s.keyName === desc.keyName);
    case 'mental-viz':
      return skills.find(s => s.kind === 'mental-viz' && s.variant === desc.variant);
  }
}

function findTypesFor(
  skills: DrillSkill[],
  typesBySkill: Map<string, DrillType[]>,
  desc: SkillDescriptor,
): DrillType[] {
  // Chord-shape cells aggregate across every per-inversion skill
  // row in the cell so the heat color reflects total practice time
  // across all inversions, not just one.
  if (desc.kind === 'chord-shape') {
    const matching = skills.filter(
      s => s.kind === 'chord-shape' && s.keyName === desc.keyName && s.quality === desc.quality,
    );
    const out: DrillType[] = [];
    for (const skill of matching) {
      const skillTypes = typesBySkill.get(skill.id);
      if (skillTypes) out.push(...skillTypes);
    }
    return out;
  }
  const skill = findSkillFor(skills, desc);
  if (!skill) return [];
  return typesBySkill.get(skill.id) ?? [];
}
