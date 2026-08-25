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

      <section className="rounded-2xl border border-black/[0.07] bg-white dark:bg-neutral-900 shadow-[0_2px_12px_rgba(0,0,0,0.07)] p-3 sm:p-5">
        <StaffReference editable />
      </section>
    </div>
  );
}
