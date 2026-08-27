/**
 * Stage-aware heat grid for a single Voice-Leading pattern.
 *
 * Renders one row per sub-dimension across the 12 keys. Each cell
 * represents one specific VL sub-cell itemRef; its color reflects
 * the acquisitionStage of that exact spacingState row (not worst-
 * of-sub-cells). Tapping a cell hands the specific itemRef to the
 * parent so the modal opens against the exact sub-cell — no
 * most-due re-pick at click time.
 *
 * Row composition comes from `voiceLeadingGridRows(pattern)` —
 * type-position patterns yield 6 rows, diatonic-cycle yields 3,
 * minor-aba yields 2, inversion-4 patterns yield 4. Mirrors the
 * scale-drills layout (ScaleDrills.tsx) which renders one row per
 * scale-kind × starting-point.
 *
 * Custom user-added patterns are rendered with a placeholder shell
 * (no sub-cell catalog → no rows to draw, no drill flow).
 */
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SpacingState, type AcquisitionStage } from '../../lib/db';
import {
  KEYS_CIRCLE_OF_FOURTHS,
  VOICE_LEADING_PATTERN_BY_ID,
  voiceLeadingGridRows,
} from './catalog';
import { spellKey } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';
import { bucketForStage, type AcquisitionBucket } from './acquisition';

interface Props {
  /** Pattern id — built-in or custom. Custom ids aren't in the
   *  catalog and render the placeholder shell. */
  patternId: string;
  /** Optional click handler. Called with the specific sub-cell
   *  itemRef when a cell is tapped. Only fires for built-in
   *  patterns. */
  onCellOpen?: (itemRef: string) => void;
}

/** The palette every S&P grid paints with. The collapse itself lives
 *  in `acquisition.ts` — this file used to carry its own copy, one of
 *  four saying the same thing in slightly different words. */
const STAGE_BG: Readonly<Record<AcquisitionBucket, string>> = {
  'acquired':    'bg-mastered/35 hover:bg-mastered/50 border-mastered/40',
  'in-progress': 'bg-developing/25 hover:bg-developing/40 border-developing/40',
  'not-started': 'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border-neutral-300 dark:border-neutral-700',
};

const STAGE_LEGEND_LABEL: Readonly<Record<AcquisitionBucket, string>> = {
  'acquired':    'acquired',
  'in-progress': 'in progress',
  'not-started': 'not started',
};

export default function VoiceLeadingPatternGrid({ patternId, onCellOpen }: Props) {
  const [spelling] = useSpelling();
  const pattern = VOICE_LEADING_PATTERN_BY_ID.get(patternId);

  // Pull every spacingState row whose itemRef belongs to this
  // pattern. The dataset is small (≤72 rows even for the
  // type-position patterns when fully populated) so the in-memory
  // filter on the moduleRef-indexed subset is cheap.
  const spacingRows = useLiveQuery<SpacingState[]>(
    () => db.spacingState
      .where('moduleRef').equals('shapes-and-patterns')
      .filter(r => r.itemRef.startsWith(`vl:${patternId}:`))
      .toArray(),
    [patternId],
  ) ?? [];

  const stageByItemRef = useMemo(() => {
    const m = new Map<string, AcquisitionStage>();
    for (const r of spacingRows) m.set(r.itemRef, r.acquisitionStage);
    return m;
  }, [spacingRows]);

  const rows = useMemo(
    () => (pattern ? voiceLeadingGridRows(pattern) : []),
    [pattern],
  );

  // Custom (non-catalog) pattern — render a friendly shell with no
  // sub-cell rows. The custom-pattern feature was always display-
  // only; this preserves that.
  if (!pattern) {
    return (
      <div className="text-xs text-neutral-500 italic">
        Custom pattern — sub-cell drill flow isn't available for user-added patterns yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max space-y-1">
        {/* Column header — key names */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `minmax(160px, 200px) repeat(${KEYS_CIRCLE_OF_FOURTHS.length}, minmax(34px, 44px))`,
          }}
        >
          <div />
          {KEYS_CIRCLE_OF_FOURTHS.map(k => (
            <div
              key={k}
              className="text-[10px] tracking-wide text-neutral-500 text-center font-mono"
            >
              {/* Label only — `k` remains the identity passed to
                  row.itemRefForKey below. See lib/spelling.ts. */}
              {spellKey(k, spelling)}
            </div>
          ))}
        </div>

        {/* One row per sub-dimension */}
        {rows.map(row => (
          <div
            key={row.rowId}
            className="grid items-center"
            style={{
              gridTemplateColumns: `minmax(160px, 200px) repeat(${KEYS_CIRCLE_OF_FOURTHS.length}, minmax(34px, 44px))`,
            }}
          >
            <div
              className="text-xs pr-2 py-0.5 min-w-0 text-neutral-600 dark:text-neutral-300"
              title={row.hint ? `${row.label} — ${row.hint}` : row.label}
            >
              <div className="truncate">{row.label}</div>
              {/* The name says which row; the hint says what you play.
                  Only Extended Voicings has one — it is the row whose
                  name was ambiguous enough to need two names before. */}
              {row.hint && (
                <div className="text-[10px] leading-tight text-neutral-400 truncate">
                  {row.hint}
                </div>
              )}
            </div>
            {KEYS_CIRCLE_OF_FOURTHS.map(k => {
              const itemRef = row.itemRefForKey(k);
              const bucket = bucketForStage(stageByItemRef.get(itemRef));
              const title = `${row.label} in ${spellKey(k, spelling)} — ${STAGE_LEGEND_LABEL[bucket]}`;
              return (
                <button
                  key={k}
                  onClick={onCellOpen ? () => onCellOpen(itemRef) : undefined}
                  title={title}
                  aria-label={title}
                  className={`aspect-square mx-0.5 my-0.5 rounded-sm border transition focus:outline-none focus:ring-2 focus:ring-fluent/50 ${STAGE_BG[bucket]}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
