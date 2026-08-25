import { Link } from 'react-router-dom';
import StaffReference from '../../components/staffReference/StaffReference';
import { moduleMetaById } from '../../lib/moduleMeta';

/**
 * Reading's staff reference, on its own page.
 *
 * The drawing is `StaffReference` — the same component the reveal panel
 * renders — so what is checked here and what is shown after a missed
 * note cannot differ. This page is the one that lets the mnemonics be
 * EDITED; the panel reads them.
 */
export default function ReadingReference() {
  const meta = moduleMetaById('reading');
  return (
    <div className="space-y-4">
      <Link
        to={meta?.route ?? '/reading'}
        className="text-xs text-neutral-500 hover:text-fluent"
      >
        ← {meta?.label ?? 'reading'}
      </Link>

      {/* No card of its own here — the reference draws one, with the
          legend beneath it. Two nested cards read as two panels. */}
      <StaffReference editable />
    </div>
  );
}
