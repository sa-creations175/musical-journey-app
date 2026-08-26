/**
 * The pool a drill will draw from, as a row of buttons.
 *
 * =====================================================================
 * LIT IS THE POOL. There is no separate "apply" and no saved filter —
 * what is lit when Start is pressed is what the run is built from, and
 * nothing survives the page.
 *
 * That is the whole lesson of the filter this replaces. Harmonic
 * fluency's pool used to live in a persisted preference that no control
 * displayed, so a drill could be narrowed for months by a tap the
 * reader had forgotten making. A control that shows the pool cannot do
 * that.
 * =====================================================================
 *
 * THE LAST LIT OPTION CANNOT BE PUT OUT. An empty pool has no honest
 * meaning here — it would either be "nothing", which no drill can
 * serve, or "everything", which is the opposite of what unlighting
 * looks like. So the row always names a real pool.
 *
 * DISABLED WHILE A DRILL RUNS, where a caller keeps it on screen. The
 * pool is decided when the run starts, and a row that could still be
 * pressed would promise a change the drill on screen will not make.
 */
import { moduleMetaById } from '../../lib/moduleMeta';

export interface PoolOption {
  id: string;
  label: string;
}

export default function PoolPicker({
  options, lit, onToggle, moduleId, disabled = false,
}: {
  options: readonly PoolOption[];
  lit: ReadonlySet<string>;
  /** Called with the option pressed. The caller owns the set; this
   *  never toggles the last lit one. */
  onToggle: (id: string) => void;
  /** The module whose accent lights a button — the id, never a hex, so
   *  a page cannot introduce a second hue for its own row. */
  moduleId: string;
  disabled?: boolean;
}) {
  const accentHex = moduleMetaById(moduleId)?.accentHex;

  return (
    <div
      className="flex flex-wrap gap-1.5"
      data-testid="pool-picker"
      role="group"
    >
      {options.map(opt => {
        const on = lit.has(opt.id);
        const last = on && lit.size === 1;
        return (
          <button
            key={opt.id}
            type="button"
            data-testid="pool-option"
            data-option={opt.id}
            data-lit={on ? 'true' : 'false'}
            aria-pressed={on}
            disabled={disabled || last}
            onClick={() => onToggle(opt.id)}
            className={`px-2.5 py-1 rounded-lg border text-xs transition ${
              on
                ? 'text-white border-transparent'
                : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
            } ${disabled ? 'opacity-60 cursor-default' : ''}`}
            style={on && accentHex ? { backgroundColor: accentHex } : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Toggle one option, refusing to leave the pool empty.
 *
 * A pure function so the rule is stated once and every page that owns a
 * lit set applies the same one.
 */
export function togglePool(
  lit: ReadonlySet<string>,
  id: string,
): ReadonlySet<string> {
  const next = new Set(lit);
  if (next.has(id)) {
    if (next.size === 1) return lit;
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}
