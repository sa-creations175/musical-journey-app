/**
 * Per-row selection checkbox. Renders only when the tracker's
 * EtSelectionState is active. Tap (or keyboard Enter/Space) toggles
 * the item's membership in `selected`. Uses a `<span role="checkbox">`
 * pattern so it can nest inside other interactive markup without
 * violating HTML.
 */
import type { EtSelectionState } from './useEtSelection';

interface Props {
  itemRef: string;
  selection: EtSelectionState;
}

export default function EtRowCheckbox({ itemRef, selection }: Props) {
  if (!selection.active) return null;
  const checked = selection.selected.has(itemRef);
  const handle = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    selection.toggle(itemRef);
  };
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={handle}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handle(e);
        }
      }}
      className={`inline-flex items-center justify-center w-5 h-5 rounded border cursor-pointer transition ${
        checked
          ? 'bg-fluent border-fluent text-white'
          : 'border-neutral-300 dark:border-neutral-600 hover:border-fluent'
      }`}
    >
      {checked && <span aria-hidden className="text-xs leading-none">✓</span>}
    </span>
  );
}
