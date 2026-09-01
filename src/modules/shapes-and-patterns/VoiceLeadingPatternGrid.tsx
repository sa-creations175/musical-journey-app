/**
 * One Voice-Leading pattern's grid, wearing the face the other two
 * grids wear.
 *
 * Renders one row per sub-dimension across the 12 keys. Each cell IS
 * one sub-cell itemRef and names its status in the six words.
 *
 * TAPPING ONE SELECTS IT. It used to open the session panel directly —
 * this was the last grid where clicking a square took over the screen —
 * and it fills Progress Details below now, exactly as a chord or scale
 * cell does. The specific itemRef is handed up, so there is no most-due
 * re-pick at click time.
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
import KeyedGrid, { type Layout } from './KeyedGrid';
import { itemCellTargets, rowsByRefHand, verdictForTargets } from './cellTargets';
import { bandVerdictLabel } from '../../lib/spacing/banding';

interface Props {
  /** Pattern id — built-in or custom. Custom ids aren't in the
   *  catalog and render the placeholder shell. */
  patternId: string;
  /** Which axis runs down the side. Owned by the page, so every
   *  pattern on it turns together. */
  layout: Layout;
  /** Optional click handler. Called with the specific sub-cell
   *  itemRef when a cell is tapped. Only fires for built-in
   *  patterns. */
  onCellOpen?: (itemRef: string) => void;
  /** The itemRef Progress Details is currently telling, so the grid can
   *  ring it. Null when nothing is picked. */
  selectedRef?: string | null;
}

export default function VoiceLeadingPatternGrid({
  patternId, layout, onCellOpen, selectedRef = null,
}: Props) {
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
    <KeyedGrid
      rows={rows.map(r => ({ rowKey: r.rowId, label: r.label, hint: r.hint }))}
      keys={KEYS_CIRCLE_OF_FOURTHS}
      layout={layout}
      spelling={spelling}
      renderCell={(rowId, keyName, showKeyLabel) => {
        const row = rows.find(r => r.rowId === rowId);
        if (!row) return null;
        const itemRef = row.itemRefForKey(keyName);
        // ONE ROW, AND THAT IS THE WHOLE SQUARE. Voice leading is
        // two-handed by nature and only ever writes `both`, so
        // `itemCellTargets` returns a single target and the rollup is
        // the row — no aggregation, same rule.
        const verdict = verdictForTargets(itemCellTargets(itemRef), byRefHand);
        // "Seventh Chords · Position 1 · the key of Eb — Not Started".
        // A bare key letter after "in" read as a stray word, and a
        // lowercase "not started" read as a description rather than the
        // status it is. Both are marked; the separator is a middot so
        // the three facts read as three facts.
        const title = `${row.label} · the key of ${spellKey(keyName, spelling)} — ${bandVerdictLabel(verdict)}`;
        return (
          <BandCell
            verdict={verdict}
            title={title}
            keyLabel={showKeyLabel ? spellKey(keyName, spelling) : undefined}
            selected={itemRef === selectedRef}
            onClick={onCellOpen ? () => onCellOpen(itemRef) : undefined}
          />
        );
      }}
    />
  );
}
