import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  type AcquisitionStage,
  type DrillSession,
  type DrillSkill,
  type DrillType,
  type SpacingState,
} from '../../lib/db';
import Modal from '../../components/Modal';
import { assertSpacingStage } from '../../lib/spacingState';
import DrillListModal from './DrillListModal';
import DrillSessionModal from './DrillSessionModal';
import {
  CHORD_QUALITY_BY_ID,
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
  inversionStateLabel,
} from './catalog';
import {
  findAllChordShapeSkillsForCell,
  humanAgo,
} from './drillModel';

type SelfAssessmentLevel = 'not_started' | 'familiar' | 'comfortable';

interface Props {
  /** Chord-shape cell coordinates. The panel materialises every
   *  inversion-state row for (quality × keyName) on open via
   *  findAllChordShapeSkillsForCell. */
  keyName: string;
  quality: string;
  onClose: () => void;
}

/**
 * Phase 4 inversion redesign — cell-level inversion breakdown.
 *
 * One compact row per inversion state (no chevron / expand). Each
 * row shows:
 *   · inversion name (Root position / 1st inversion / …)
 *   · acquisition badge (Acquired / In progress / Not started)
 *   · last-practiced label (e.g. "3 days ago" / "never")
 *   · inline "Drill" button → opens DrillListModal for that
 *     inversion-state's skill row
 *
 * For sevenths, the supplementary row (two-handed drills) renders
 * after the acquisition-path rows in a quieter style — labelled
 * "Other drills (two-handed)", no acquisition badge (those drills
 * don't gate acquisition).
 *
 * Extensions and special/sixth qualities have only one
 * inversionState (null) — for those the panel collapses to a
 * single row, effectively forwarding to DrillListModal directly.
 */
export default function InversionBreakdownPanel({ keyName, quality, onClose }: Props) {
  // Two modal states:
  //   - `openSession`: the skill row has exactly one drill type
  //     (the seed) — start that drill immediately.
  //   - `openSkill`:   the skill row has multiple drill types (e.g.,
  //     the supplementary two-handed-drills row on sevenths, or any
  //     row the user has added customs to) — go through DrillListModal
  //     so they can pick which one.
  const [openSession, setOpenSession] = useState<{ skill: DrillSkill; drillType: DrillType } | null>(null);
  const [openSkill, setOpenSkill] = useState<DrillSkill | null>(null);
  // Self-assessment dismissal: hides the prompt for the lifetime of
  // the panel after the user picks "Not started" (no spacingState
  // rows get created in that case, so the persistence-based check
  // alone would re-show the prompt every open). Familiar /
  // Comfortable selections also flip this flag so the prompt-→-rows
  // transition feels instant — the live query catches up
  // milliseconds later with the seeded stages, but the UI shouldn't
  // wait on it. Resets on panel remount (i.e., next time the user
  // opens the cell from the heat grid).
  const [selfAssessmentDismissed, setSelfAssessmentDismissed] = useState(false);
  const [seedingAssessment, setSeedingAssessment] = useState(false);

  // Materialise + load all skill rows for the cell. findAllChordShape­
  // SkillsForCell runs the cell-level transaction (creates any
  // missing rows) and returns the full list, sorted by row id (so
  // we re-sort by INVERSION_STATES order below).
  const skills = useLiveQuery<DrillSkill[]>(
    async () => {
      await findAllChordShapeSkillsForCell(keyName, quality);
      return db.drillSkills
        .where('[kind+keyName+quality]').equals(['chord-shape', keyName, quality])
        .toArray();
    },
    [keyName, quality],
  ) ?? [];

  // Live drill types — still needed to decide whether to route a row
  // through DrillListModal (multiple drills to pick from) or
  // DrillSessionModal directly (single seed drill).
  const skillIds = useMemo(() => new Set(skills.map(s => s.id)), [skills]);
  const drillTypes = useLiveQuery<DrillType[]>(
    () => db.drillTypes.toArray(),
    [],
  ) ?? [];
  const typesBySkill = useMemo(() => {
    const m = new Map<string, DrillType[]>();
    for (const t of drillTypes) {
      if (!skillIds.has(t.skillId)) continue;
      const arr = m.get(t.skillId) ?? [];
      arr.push(t);
      m.set(t.skillId, arr);
    }
    return m;
  }, [drillTypes, skillIds]);

  // Last-practiced per skill, read directly from db.drillSessions —
  // the canonical "this drill happened" record. Earlier versions of
  // this panel derived lastPracticedAt from drillTypes.lastPracticedAt
  // (a denormalised cache populated by logSession), but the cache's
  // update path turned out not to propagate reliably to the live
  // query in this surface — badge updates fired (spacingState was
  // written via a separate code path) while the cache read stayed
  // stale. Pulling from drillSessions sidesteps the cache entirely.
  const drillSessionsForSkills = useLiveQuery<DrillSession[]>(
    async () => {
      if (skillIds.size === 0) return [];
      return db.drillSessions
        .where('skillId').anyOf([...skillIds])
        .toArray();
    },
    [skillIds],
  ) ?? [];
  const lastPracticedBySkill = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of drillSessionsForSkills) {
      const existing = m.get(s.skillId);
      if (existing === undefined || s.timestamp > existing) {
        m.set(s.skillId, s.timestamp);
      }
    }
    return m;
  }, [drillSessionsForSkills]);

  // Live spacingState rows for this cell (filtered down to chord-
  // shape rows whose itemRef prefix matches the cell). The whole
  // shapes module's spacingState is small enough that a full pull
  // is fine.
  const itemRefPrefix = `chord-shape:${quality}:${keyName}`;
  const spacingRows = useLiveQuery<SpacingState[]>(
    () => db.spacingState
      .where('moduleRef').equals('shapes-and-patterns')
      .toArray(),
    [],
  ) ?? [];
  const stageByItemRef = useMemo(() => {
    const m = new Map<string, AcquisitionStage>();
    for (const r of spacingRows) {
      if (r.itemRef === itemRefPrefix || r.itemRef.startsWith(`${itemRefPrefix}:`)) {
        m.set(r.itemRef, r.acquisitionStage);
      }
    }
    return m;
  }, [spacingRows, itemRefPrefix]);

  // Determine the kind from the quality to pick the inversion-state
  // ordering. Defensive fallback to `special` for unrecognised
  // qualities.
  const qualityEntry = CHORD_QUALITY_BY_ID.get(quality);
  const kind = qualityEntry?.kind ?? 'special';
  const states = INVERSION_STATES_FOR_CHORD_SHAPE_KIND[kind];

  // Self-assessment prompt visibility: first-open with no existing
  // spacingState rows AND the user hasn't yet picked an option. Once
  // any spacingState row exists for the cell (from prior practice or
  // a Familiar/Comfortable seed), the prompt stays hidden.
  const hasAnySpacingForCell = stageByItemRef.size > 0;
  const showSelfAssessment = !selfAssessmentDismissed && !hasAnySpacingForCell;

  /**
   * Seed spacingState rows for the acquisition-path inversion states
   * at the chosen stage (or no-op for 'not_started'). Supplementary
   * rows are intentionally skipped — they're practice tools, not
   * acquisition targets.
   *
   * Uses assertSpacingStage (deliberate state declaration), not
   * recordEngagement — the user hasn't actually practiced, they're
   * declaring where they're starting from. No performanceHistory
   * entries are appended.
   */
  const handleSelfAssessment = async (level: SelfAssessmentLevel) => {
    if (seedingAssessment) return;
    if (level === 'not_started') {
      setSelfAssessmentDismissed(true);
      return;
    }
    const stage: AcquisitionStage = level === 'familiar' ? 'acquiring' : 'acquired';
    const pathStates = states.filter(s => s !== 'supplementary');
    setSeedingAssessment(true);
    try {
      await Promise.all(
        pathStates.map(state => {
          const itemRef = state ? `${itemRefPrefix}:${state}` : itemRefPrefix;
          return assertSpacingStage(itemRef, 'shapes-and-patterns', stage);
        }),
      );
      setSelfAssessmentDismissed(true);
    } finally {
      setSeedingAssessment(false);
    }
  };

  // Derive title from the first skill's label (which already carries
  // the chord notation, e.g. "Cmaj7 (major seventh)"). Strip the
  // trailing inversion-state suffix the labelFor helper appends.
  const cellLabel = (() => {
    const root = skills.find(s => (s.inversionState ?? null) === 'root') ?? skills[0];
    if (!root?.label) return `${keyName}${qualityEntry?.suffix ?? ''}`;
    const dashIdx = root.label.indexOf(' — ');
    return dashIdx > 0 ? root.label.slice(0, dashIdx) : root.label;
  })();

  return (
    <Modal
      open
      onClose={onClose}
      title={cellLabel}
      description="Each inversion is its own trackable acquisition target."
      footer={(
        <div className="flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            close
          </button>
        </div>
      )}
    >
      {showSelfAssessment ? (
        <SelfAssessmentPrompt
          label={cellLabel}
          disabled={seedingAssessment}
          onPick={handleSelfAssessment}
        />
      ) : (
        <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {states.map(state => {
            const skill = skills.find(s => (s.inversionState ?? null) === state);
            const itemRef = state ? `${itemRefPrefix}:${state}` : itemRefPrefix;
            const stage = stageByItemRef.get(itemRef);
            const skillTypes = skill ? typesBySkill.get(skill.id) ?? [] : [];
            // Pulled from drillSessions (canonical), not the
            // drillTypes.lastPracticedAt cache — see lastPracticedBySkill
            // construction above.
            const lastPracticedAt = skill ? lastPracticedBySkill.get(skill.id) ?? null : null;

            return (
              <InversionRow
                key={state ?? 'single'}
                label={state ? inversionStateLabel(state) : 'Drills'}
                isSupplementary={state === 'supplementary'}
                stage={stage}
                lastPracticedAt={lastPracticedAt}
                disabled={!skill}
                onDrill={() => {
                  if (!skill) return;
                  // Inversion-state skill rows seed exactly one drill —
                  // skip DrillListModal and jump straight into the
                  // timer. Multi-drill rows (supplementary two-handed,
                  // or any user-customised cell) keep going through
                  // DrillListModal so the user can pick.
                  if (skillTypes.length === 1 && state !== 'supplementary') {
                    setOpenSession({ skill, drillType: skillTypes[0] });
                  } else {
                    setOpenSkill(skill);
                  }
                }}
              />
            );
          })}
        </div>
      )}

      {openSession && (
        <DrillSessionModal
          skill={openSession.skill}
          drillType={openSession.drillType}
          onClose={() => setOpenSession(null)}
          onLogged={() => setOpenSession(null)}
        />
      )}
      {openSkill && (
        <DrillListModal
          skill={openSkill}
          onClose={() => setOpenSkill(null)}
        />
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------

interface InversionRowProps {
  label: string;
  isSupplementary: boolean;
  stage: AcquisitionStage | undefined;
  lastPracticedAt: number | null;
  disabled: boolean;
  onDrill: () => void;
}

/**
 * First-open self-assessment prompt. Replaces the inversion rows
 * until the user picks an option, so the rows don't have to render
 * misleading "Not started" badges next to the question that's
 * asking what state to start them in.
 *
 *   Not started  → no spacingState rows created; rows show with
 *                  "Not started" badges, normal acquisition path
 *                  applies.
 *   Familiar     → all acquisition-path inversion-state rows seeded
 *                  at 'acquiring' stage.
 *   Comfortable  → same, seeded at 'acquired' stage.
 *
 * Supplementary rows (two-handed seventh drills) are never seeded
 * by self-assessment — they're practice tools, not acquisition
 * targets.
 */
function SelfAssessmentPrompt({
  label,
  disabled,
  onPick,
}: {
  label: string;
  disabled: boolean;
  onPick: (level: SelfAssessmentLevel) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium">
          How well do you know {label}?
        </div>
        <div className="text-xs text-neutral-500 mt-1">
          Quick self-assessment — sets the starting acquisition stage for each
          inversion. You can always revise by drilling; the spacing system
          will demote shapes you rate poorly later on.
        </div>
      </div>
      <div className="grid gap-2">
        <SelfAssessmentOption
          title="Not started"
          hint="I haven't practiced this. Start from scratch."
          disabled={disabled}
          onClick={() => onPick('not_started')}
        />
        <SelfAssessmentOption
          title="Familiar"
          hint="I know it but it's not solid. Start at acquiring stage."
          disabled={disabled}
          onClick={() => onPick('familiar')}
        />
        <SelfAssessmentOption
          title="Comfortable"
          hint="I can play this reliably. Start at acquired stage."
          disabled={disabled}
          onClick={() => onPick('comfortable')}
        />
      </div>
    </div>
  );
}

function SelfAssessmentOption({
  title,
  hint,
  disabled,
  onClick,
}: {
  title: string;
  hint: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-left rounded-lg border px-3 py-2.5 transition ${
        disabled
          ? 'border-neutral-200 dark:border-neutral-800 opacity-50 cursor-not-allowed'
          : 'border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:bg-fluent/5'
      }`}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-[11px] text-neutral-500 mt-0.5">{hint}</div>
    </button>
  );
}

/**
 * One row in the breakdown panel. Compact horizontal layout:
 *   [inversion name]  [acquisition badge]  [last practiced]  [Drill →]
 *
 * Supplementary rows (two-handed seventh drills) render in a
 * lower-contrast style and skip the acquisition badge — they
 * don't gate acquisition.
 */
function InversionRow({
  label,
  isSupplementary,
  stage,
  lastPracticedAt,
  disabled,
  onDrill,
}: InversionRowProps) {
  const badge = stageBadge(stage);
  return (
    <div className={`py-2.5 flex items-center gap-3 ${isSupplementary ? 'opacity-80' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {isSupplementary && (
          <div className="text-[11px] text-neutral-500 mt-0.5">
            two-handed drills · don't count toward acquisition
          </div>
        )}
      </div>
      {!isSupplementary && (
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${badge.className}`}
        >
          {badge.label}
        </span>
      )}
      <div className="text-[11px] text-neutral-500 tabular-nums w-24 text-right">
        {lastPracticedAt == null ? 'never' : humanAgo(lastPracticedAt)}
      </div>
      <button
        onClick={onDrill}
        disabled={disabled}
        className={`px-3 py-1 rounded-md text-xs font-medium ${
          disabled
            ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
            : 'bg-fluent text-white hover:opacity-90'
        }`}
      >
        Drill
      </button>
    </div>
  );
}

/** Map an acquisition stage to a badge label + Tailwind class.
 *  `acquired` / `consolidated` / `mastered` all show as "Acquired"
 *  — once the user clears the acquisition threshold the badge
 *  doesn't subdivide further (the heat-grid cell color reflects
 *  longer-term decay separately). */
function stageBadge(stage: AcquisitionStage | undefined): { label: string; className: string } {
  if (stage === 'acquired' || stage === 'consolidated' || stage === 'mastered') {
    return {
      label: 'Acquired',
      className: 'bg-mastered/15 text-mastered',
    };
  }
  if (stage === 'acquiring') {
    return {
      label: 'In progress',
      className: 'bg-developing/15 text-developing',
    };
  }
  return {
    label: 'Not started',
    className: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  };
}
