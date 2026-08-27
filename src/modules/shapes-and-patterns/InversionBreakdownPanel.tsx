import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  type DrillSession,
  type DrillSkill,
  type SpacingState,
  type DrillHand,
} from '../../lib/db';
import Modal from '../../components/Modal';
import { bandVerdictForRow } from '../../lib/spacing/row';
import { bandVerdictLabel, NOT_STARTED, type BandVerdict } from '../../lib/spacing/banding';
import { accuracyBandDef, type AccuracyBand } from '../../lib/spacing/bands';
import { HAND_ORDER } from './acquisition';
import DrillListModal from './DrillListModal';
import PracticeTestPanel from './practiceTest/PracticeTestPanel';
import {
  CHORD_QUALITY_BY_ID,
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
  inversionStateLabel,
} from './catalog';
import {
  findAllChordShapeSkillsForCell,
  humanAgo,
} from './drillModel';
import { spellKey } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';


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
  const [spelling] = useSpelling();
  // Two modal states:
  //   - `openSession`: the skill row has exactly one drill type
  //     (the seed) — start that drill immediately.
  //   - `openSkill`:   the skill row has multiple drill types (e.g.,
  //     the supplementary two-handed-drills row on sevenths, or any
  //     row the user has added customs to) — go through DrillListModal
  //     so they can pick which one.
  const [openSkill, setOpenSkill] = useState<DrillSkill | null>(null);
  /** The Practice/Test shell, opened by a grid square. Holds only what
   *  the header needs — it writes nothing in commit 1, so there is no
   *  skill row to carry. */
  const [openPractice, setOpenPractice] = useState<{ skillLabel: string } | null>(null);
  // Self-assessment dismissal: hides the prompt for the lifetime of
  // the panel after the user picks "Not started" (no spacingState
  // rows get created in that case, so the persistence-based check
  // alone would re-show the prompt every open). Familiar /
  // Comfortable selections also flip this flag so the prompt-→-rows
  // transition feels instant — the live query catches up
  // milliseconds later with the seeded stages, but the UI shouldn't
  // wait on it. Resets on panel remount (i.e., next time the user
  // opens the cell from the heat grid).

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

  // THE DRILL-TYPE LOOKUP WENT WITH THE ROUTE THAT NEEDED IT. It
  // existed to decide whether a square opened DrillListModal (several
  // drills to pick from) or DrillSessionModal (one seed drill); a
  // square opens the Practice/Test shell now and asks neither
  // question. `skillIds` stays — the last-drilled reads below still
  // need it.
  const skillIds = useMemo(() => new Set(skills.map(s => s.id)), [skills]);

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

  /**
   * Last drilled per (skill × hand), keyed `skillId|hand`.
   *
   * The grid asks about one square, so the whole-skill figure above is
   * too coarse: a row drilled left-handed yesterday must not make its
   * right-hand square read "1d ago". Straight off `drillSessions`,
   * which carries the hand — never the `drillTypes.lastPracticedAt`
   * cache, which was going stale while badges updated.
   */
  const lastPracticedBySkillHand = useMemo(() => {
    const m = new Map<string, number>();
    for (const sess of drillSessionsForSkills) {
      const key = `${sess.skillId}|${sess.hand}`;
      const existing = m.get(key);
      if (existing === undefined || sess.timestamp > existing) m.set(key, sess.timestamp);
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
  // NO STAGE MAP ANY MORE. The cell showed an acquisition stage —
  // Acquired / In Progress / Not Started — beside a rating from a
  // different vocabulary. It shows the rating and nothing else now.

  /**
   * The rating for one square of the grid, keyed `itemRef|hand`.
   *
   * =====================================================================
   * A SQUARE IS TWO ROWS, AND THE LOWER ONE WINS.
   *
   * Chord shapes are drilled in two styles per hand — solid then
   * arpeggiated — and each keeps its own spacing row. The grid has no
   * style column, so a square spans both.
   *
   * Taking the LOWER verdict follows the rule this module already
   * holds for hands: `acquisition.ts` says a hand counts as acquired
   * only when every row logged for it is. It is the same instinct as
   * the self-rated band itself, which takes the lowest of the last
   * three rather than the average — a shape you can block but not
   * arpeggiate is not yet a shape you own.
   * =====================================================================
   */
  const verdictByItemRefHand = useMemo(() => {
    const order: ReadonlyArray<AccuracyBand> = ['needs-work', 'developing', 'fluent', 'mastered'];
    const rowsFor = new Map<string, SpacingState[]>();
    for (const r of spacingRows) {
      if (r.itemRef !== itemRefPrefix && !r.itemRef.startsWith(`${itemRefPrefix}:`)) continue;
      const key = `${r.itemRef}|${r.hand}`;
      const arr = rowsFor.get(key) ?? [];
      arr.push(r);
      rowsFor.set(key, arr);
    }
    const m = new Map<string, BandVerdict>();
    for (const [key, rows] of rowsFor) {
      const verdicts = rows.map(r => bandVerdictForRow(r));
      const banded = verdicts.filter(
        (v): v is { kind: 'band'; band: AccuracyBand } => v.kind === 'band',
      );
      if (banded.length < verdicts.length) {
        // A style that has not earned a band means the square has not
        // either — Started when anything has been logged at all.
        const anyStarted = verdicts.some(v => v.kind !== 'not-started');
        m.set(key, anyStarted ? { kind: 'started', tries: 0 } : NOT_STARTED);
        continue;
      }
      m.set(key, banded.reduce((low, v) =>
        order.indexOf(v.band) < order.indexOf(low.band) ? v : low, banded[0]));
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
  // The grid's rows: every acquisition-path state. The supplementary
  // row is NOT one of them — it sits below the grid with its own Drill
  // button, because it cannot split by hand.
  const gridStates = states.filter(st => st !== 'supplementary');
  const supplementarySkill = states.includes('supplementary')
    ? skills.find(sk => sk.inversionState === 'supplementary') ?? null
    : null;
  const supplementaryLast = supplementarySkill
    ? lastPracticedBySkill.get(supplementarySkill.id) ?? null
    : null;



  // Derive title from the first skill's label (which already carries
  // the chord notation, e.g. "Cmaj7 (major seventh)"). Strip the
  // trailing inversion-state suffix the labelFor helper appends.
  const cellLabel = (() => {
    const root = skills.find(s => (s.inversionState ?? null) === 'root') ?? skills[0];
    if (!root?.label) return `${spellKey(keyName, spelling)}${qualityEntry?.suffix ?? ''}`;
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
            Close
          </button>
        </div>
      )}
    >
      <div>
        {/* THE GRID. Inversions down the side, hands across the top,
            and the whole square is the button. Twelve drills where
            there were four, and the same three hands the scales cell
            has always offered. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className="w-[34%] border-b border-neutral-200
                  dark:border-neutral-800 px-3 pb-2 pt-1 text-left text-[11px]
                  font-semibold uppercase tracking-[0.11em] text-neutral-400">
                  Shape
                </th>
                {HAND_ORDER.map(hand => (
                  <th key={hand} scope="col" className="w-[22%] border-b border-neutral-200
                    dark:border-neutral-800 px-2 pb-2 pt-1 text-center text-[11px]
                    font-semibold uppercase tracking-[0.11em] text-neutral-400">
                    {HAND_COLUMN_LABEL[hand]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gridStates.map(state => {
                const skill = skills.find(sk => (sk.inversionState ?? null) === state);
                const itemRef = state ? `${itemRefPrefix}:${state}` : itemRefPrefix;
                return (
                  <tr key={state ?? 'single'}>
                    <th scope="row" className="border-b border-r border-neutral-200
                      dark:border-neutral-800 px-3 py-2 text-left text-sm font-medium">
                      {state ? inversionStateLabel(state) : 'Drills'}
                    </th>
                    {HAND_ORDER.map(hand => (
                      <td key={hand} className="border-b border-r border-neutral-200
                        last:border-r-0 dark:border-neutral-800 px-1.5 py-1 text-center">
                        <GridCell
                          verdict={verdictByItemRefHand.get(`${itemRef}|${hand}`) ?? NOT_STARTED}
                          lastPracticedAt={skill
                            ? lastPracticedBySkillHand.get(`${skill.id}|${hand}`) ?? null
                            : null}
                          disabled={!skill}
                          onDrill={() => {
                            // THE SQUARE OPENS THE PRACTICE/TEST SHELL
                            // NOW. It used to open the drill modal
                            // straight away, which asked how long and
                            // then ran one drill; the shell asks what
                            // KIND of sitting this is first, and holds
                            // as many drills as you want inside one
                            // clock. Commit 1 of 4 — see the panel's
                            // own note for what is not in it yet.
                            //
                            // `skill` still gates the press so an
                            // un-materialised row cannot open one.
                            if (!skill) return;
                            setOpenPractice({
                              skillLabel: `${state ? inversionStateLabel(state) : 'Drills'} · ${HAND_COLUMN_LABEL[hand]}`,
                            });
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* OUTSIDE THE GRID, AND THE SHAPE SAYS SO BEFORE THE LABEL
            DOES. One exercise, not a hand-split of the row above it:
            the left hand holds the root while the right runs the
            inversions, so there is no left/right/both to offer. */}
        {supplementarySkill && (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3
            border-t border-neutral-300 bg-neutral-50 px-3 py-3
            dark:border-neutral-700 dark:bg-neutral-900/40">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Root In Left, Inversions In Right</span>
              <span className="text-[11px] text-neutral-500">
                Left hand holds the root; right hand runs the inversions up and down
              </span>
            </span>
            <span className="flex items-center gap-3">
              <RatingChip verdict={
                verdictByItemRefHand.get(`${itemRefPrefix}:supplementary|both`) ?? NOT_STARTED
              } />
              <span className="font-mono text-[11px] tabular-nums text-neutral-400">
                {supplementaryLast === null ? 'never' : humanAgo(supplementaryLast)}
              </span>
              <button
                onClick={() => setOpenSkill(supplementarySkill)}
                className="rounded-md bg-fluent px-3.5 py-1.5 text-xs font-semibold
                  text-white hover:opacity-90"
              >
                Drill
              </button>
            </span>
          </div>
        )}
      </div>

      {openSkill && (
        <DrillListModal
          skill={openSkill}
          onClose={() => setOpenSkill(null)}
        />
      )}
      {openPractice && (
        <PracticeTestPanel
          cellLabel={cellLabel}
          skillLabel={openPractice.skillLabel}
          onClose={() => setOpenPractice(null)}
        />
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------





/* `stageBadge` is gone with the row layout. The cell shows a RATING
 * now and never an acquisition stage — one vocabulary on screen. */

const HAND_COLUMN_LABEL: Record<DrillHand, string> = {
  left: 'Left',
  right: 'Right',
  both: 'Both',
};

/** Coloured square plus the word. Not Started and Started share the
 *  neutral square — neither is a band, and neither is a bad score. */
function RatingChip({ verdict }: { verdict: BandVerdict }) {
  const hex = verdict.kind === 'band' ? accuracyBandDef(verdict.band).hex : null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
      <span
        aria-hidden
        className={`h-2 w-2 flex-none rounded-[2px] ${hex ? '' : 'bg-neutral-400'}`}
        style={hex ? { background: hex } : undefined}
      />
      <span
        style={hex ? { color: hex } : undefined}
        className={hex ? '' : 'text-neutral-500'}
      >
        {bandVerdictLabel(verdict)}
      </span>
    </span>
  );
}

/** THE WHOLE SQUARE IS THE BUTTON — no separate Drill control taking up
 *  a column. Two facts stacked, which is all that fits and all that is
 *  needed to decide what to drill. */
function GridCell({ verdict, lastPracticedAt, disabled, onDrill }: {
  verdict: BandVerdict;
  lastPracticedAt: number | null;
  disabled: boolean;
  onDrill: () => void;
}) {
  return (
    <button
      onClick={onDrill}
      disabled={disabled}
      className={`flex w-full flex-col items-center gap-0.5 rounded-md border
        border-transparent px-1 py-1.5 transition-colors
        ${disabled
          ? 'cursor-not-allowed opacity-40'
          : 'hover:border-neutral-300 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fluent dark:hover:border-neutral-700 dark:hover:bg-neutral-800/60'}`}
    >
      <RatingChip verdict={verdict} />
      <span className="font-mono text-[10.5px] tabular-nums text-neutral-400">
        {lastPracticedAt === null ? 'never' : humanAgo(lastPracticedAt)}
      </span>
    </button>
  );
}
