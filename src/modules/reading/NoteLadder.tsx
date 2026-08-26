/**
 * Note recognition, drawn the way the notation is: up.
 *
 * =====================================================================
 * THE NOTATION REFERENCE, COLOURED BY TIER. NOT A SECOND STAFF.
 *
 * `StaffReference` already draws the pitch ladder, both staves, the
 * dotted ledger lines and middle C, and it is the drawing the reveal
 * panel and the reference page both teach from. A second staff here
 * would be a second answer to where every note sits, and the two would
 * part company the first time either was edited.
 *
 * So this supplies nothing but what goes in the mnemonic column: one
 * mark per clef that reaches that pitch, in the tier colour the
 * horizontal grid's own cells use, opening the same item detail a cell
 * press opens.
 * =====================================================================
 *
 * TWO MARKS ON A SHARED ROW IS THE TRUTH, not a rendering compromise.
 * Treble and bass overlap for most of an octave either side of middle
 * C, and the two items there are separately scheduled — one can be
 * fluent while the other has never been asked. See `ladderRefs.ts`.
 */
import StaffReference from '../../components/staffReference/StaffReference';
import { TIER_BAR_CLASS } from '../../lib/tier';
import type { VerticalViewProps } from '../../components/moduleHome/axis';
import { noteRefsByPitch } from './ladderRefs';

/** Built once: it is a walk over the catalog and the catalog does not
 *  change while the app is running. */
const REFS_BY_PITCH = noteRefsByPitch();

export default function NoteLadder({ items, onOpen }: VerticalViewProps) {
  const byRef = new Map(items.map(i => [i.itemId, i]));

  return (
    <div data-testid="note-ladder">
      <StaffReference
        renderAside={pos => {
          const here = REFS_BY_PITCH.get(pos.id) ?? [];
          if (here.length === 0) return null;
          return (
            <span className="inline-flex items-center gap-1">
              {here.map(({ clef, itemRef }) => {
                const item = byRef.get(itemRef);
                if (!item) {
                  // A catalog item the registry did not hand over.
                  // Drawn as the gap it is, the same way the grid draws
                  // a coordinate it has no item for.
                  return (
                    <span
                      key={itemRef}
                      data-testid="ladder-gap"
                      data-clef={clef}
                      className="w-5 h-5 rounded-sm border border-dashed border-neutral-200 dark:border-neutral-800"
                    />
                  );
                }
                return (
                  <button
                    key={itemRef}
                    type="button"
                    data-testid="ladder-cell"
                    data-clef={clef}
                    data-item={itemRef}
                    title={item.name}
                    onClick={() => onOpen(item)}
                    // The grid's own class, read off the same map — so
                    // the two drawings cannot disagree about what
                    // fluent looks like.
                    className={`w-5 h-5 rounded-sm ${TIER_BAR_CLASS[item.currentTier ?? 'untouched']}`}
                  />
                );
              })}
            </span>
          );
        }}
      />
    </div>
  );
}
