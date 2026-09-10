/**
 * Plain or by interval.
 *
 * ONE TOGGLE, ON EVERY CARD THAT LIGHTS A SCALE. It is the reader's
 * standing preference rather than a per-card choice — see
 * `useColourMode`, which remembers it per device — so the control looks
 * the same wherever it appears and changes every board at once.
 */
import type { ColourMode } from '../../../lib/builtAnswers/marks';

const BTN = 'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors';

export default function ColourToggle({
  value, onChange,
}: {
  value: ColourMode;
  onChange: (m: ColourMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="colour-toggle">
      <span className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
        Scale colours
      </span>
      {([['plain', 'Plain'], ['interval', 'By interval']] as const).map(([m, label]) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          data-testid={`colour-${m}`}
          onClick={() => onChange(m)}
          className={`${BTN} ${value === m
            ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
            : 'border-black/10 dark:border-white/20'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
