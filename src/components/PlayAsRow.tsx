/**
 * The Play as row: Together · Up · Down · Up and Down.
 *
 * =====================================================================
 * ONE ROW, WHEREVER IT STANDS.
 *
 * Silas's ruling of 12 Sep 2026 puts it on every surface the shared
 * player appears, and his answer of 13 Sep puts it in the spots the
 * rows it replaced stood in: the aids fold and the end of Settings,
 * where "Chord sounds" was, and the Direction row's place on a scale
 * card that had one. Several places, one component, so the words and
 * the order cannot come apart between them.
 * =====================================================================
 */
import { PLAY_AS_AID_NOTE, PLAY_AS_OPTIONS, type PlayAs } from '../lib/player/settings';

const CHIP = 'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors';
const CHIP_OFF = 'border-black/10 dark:border-white/20 bg-black/[0.03] '
  + 'dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/10';
const CHIP_ON = 'border-neutral-900 dark:border-neutral-100 bg-neutral-900 '
  + 'text-white dark:bg-neutral-100 dark:text-neutral-900';

export default function PlayAsRow({
  value, onChange, testIdPrefix = 'play-as', aidNote = false,
}: {
  value: PlayAs;
  onChange: (next: PlayAs) => void;
  /** Distinct per spot, so a screen showing the aids fold and the panel
   *  can tell the two apart. */
  testIdPrefix?: string;
  /** Chord Recognition's line under the row: a run is an aid there. */
  aidNote?: boolean;
}) {
  return (
    <div className="space-y-1.5" data-testid={`${testIdPrefix}-row`}>
      <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
        Play as
      </div>
      <div className="flex flex-wrap items-center gap-1.5" data-testid={`${testIdPrefix}-chips`}>
        {PLAY_AS_OPTIONS.map(o => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            data-testid={`${testIdPrefix}-${o.id}`}
            onClick={() => onChange(o.id)}
            className={`${CHIP} ${value === o.id ? CHIP_ON : CHIP_OFF}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {aidNote && (
        <p
          className="text-[11px] text-neutral-500 dark:text-neutral-400"
          data-testid={`${testIdPrefix}-aid-note`}
        >
          {PLAY_AS_AID_NOTE}
        </p>
      )}
    </div>
  );
}
