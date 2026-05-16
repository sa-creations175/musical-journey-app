/**
 * Inline status indicators for an ET catalog item. Renders zero,
 * one, or both of:
 *
 *   · flagged dot   — amber pill with a ⚐ glyph
 *   · hidden marker — neutral pill with a ⊘ glyph
 *
 * Hidden styling for the surrounding row (dimmed text) is the
 * tracker's responsibility — this component is just the per-item
 * adornment that sits next to the name + ⋯ button. Same compact
 * sizing as the existing tier badges so the row layout doesn't
 * shift.
 */
import type { EtItemCuration } from '../../lib/db';

interface Props {
  curation: EtItemCuration | undefined;
}

export default function EtItemStatus({ curation }: Props) {
  if (!curation) return null;
  return (
    <>
      {curation.flagged && (
        <span
          className="text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"
          title={curation.flagNote ? `flagged: ${curation.flagNote}` : 'flagged for review'}
        >
          <span aria-hidden>⚐</span> flagged
        </span>
      )}
      {curation.hidden && (
        <span
          className="text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 border border-neutral-400/50 bg-neutral-200/40 text-neutral-500 dark:bg-neutral-700/40 dark:text-neutral-400 inline-flex items-center gap-1"
          title="hidden from sessions and quiz pools"
        >
          <span aria-hidden>⊘</span> hidden
        </span>
      )}
    </>
  );
}
