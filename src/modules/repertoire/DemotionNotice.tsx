import type { SongStageDemotion } from '../../lib/db';
import { STAGE_LABEL } from './stage';

/**
 * That the song lost a rung, when, and which criterion stopped being
 * met.
 *
 * ---------------------------------------------------------------
 * NOT A TOAST, AND IT PERSISTS.
 *
 * A demotion happens while nobody is watching — a key goes overdue on
 * a Tuesday and the drop is computed the next time the page opens. A
 * toast announcing it would be gone before you looked up from the
 * keyboard, and would announce something that had already happened
 * days earlier. So it is stored and shown until something changes it.
 *
 * It also survives its own cause being fixed: re-prove the key and the
 * criterion passes again, but the notice stands until the song is back
 * at the rung it fell FROM. Otherwise a two-rung fall that recovers
 * one rung would erase the record, and the page would say nothing
 * happened while the song was still short of where it was.
 * ---------------------------------------------------------------
 *
 * THE TONE IS DELIBERATE. The app decided this on its own, about a
 * song the user may have spent months on, and the last line is what
 * stops it reading as punishment: nothing was lost, the work is still
 * recorded, and the rung comes back when the key does.
 */
export default function DemotionNotice({
  demotion,
}: {
  demotion: SongStageDemotion;
}) {
  const when = new Date(demotion.at).toLocaleDateString(undefined, {
    month: 'long', day: 'numeric',
  });

  return (
    <div className="rounded-md border border-[#E88943]/40 bg-[#E88943]/5 px-3 py-2.5 space-y-1.5">
      <p className="text-xs font-medium text-neutral-800 dark:text-neutral-100">
        This song dropped from {STAGE_LABEL[demotion.from]} to{' '}
        {STAGE_LABEL[demotion.to]} on {when}.
      </p>
      <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
        {demotion.criterionLabel}
        {demotion.criterionLabel.endsWith('.') ? '' : '.'}
        {demotion.detail ? ` ${demotion.detail}` : ''}
      </p>
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
        Nothing was lost — the work is still recorded. Prove it again and the
        rung comes back.
      </p>
    </div>
  );
}
