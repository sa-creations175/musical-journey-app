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
import { db, type SpacingState } from '../../lib/db';
import {
  KEYS_CIRCLE_OF_FOURTHS,
  VOICE_LEADING_PATTERN_BY_ID,
  voiceLeadingGridRows,
} from './catalog';
import { spellKey } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';
import BandCell from './BandCell';
import { itemCellTargets, rowsByRefHand, verdictForTargets } from './cellTargets';
import { bandVerdictLabel } from '../../lib/spacing/banding';

interface Props {
  /** Pattern id — built-in or custom. Custom ids aren't in the
   *  catalog and render the placeholder shell. */
  patternId: string;
  /** Optional click handler. Called with the specific sub-cell
   *  itemRef when a cell is tapped. Only fires for built-in
   *  patterns. */
  onCellOpen?: (itemRef: string) => void;
}

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

  const byRefHand = useMemo(() => rowsByRefHand(spacingRows), [spacingRows]);

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
            gridTemplateColumns: `minmax(160px, 200px) repeat(${KEYS_CIRCLE_OF_FOURTHS.length}, minmax(42px, 56px))`,
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
              gridTemplateColumns: `minmax(160px, 200px) repeat(${KEYS_CIRCLE_OF_FOURTHS.length}, minmax(42px, 56px))`,
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
              // ONE ROW, AND THAT IS THE WHOLE SQUARE. Voice leading is
              // two-handed by nature and only ever writes `both`, so
              // `itemCellTargets` returns a single target and the
              // rollup is the row — no aggregation, same rule.
              const verdict = verdictForTargets(itemCellTargets(itemRef), byRefHand);
              // "Seventh Chords · Position 1 · the key of Eb — Not Started".
              // A bare key letter after "in" read as a stray word, and
              // a lowercase "not started" read as a description rather
              // than the status it is. Both are marked; the separator
              // is a middot so the three facts read as three facts.
              const title = `${row.label} · the key of ${spellKey(k, spelling)} — ${bandVerdictLabel(verdict)}`;
              return (
                <BandCell
                  key={k}
                  verdict={verdict}
                  title={title}
                  onClick={onCellOpen ? () => onCellOpen(itemRef) : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
