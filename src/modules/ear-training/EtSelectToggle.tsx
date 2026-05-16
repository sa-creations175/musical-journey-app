/**
 * Compact "Select" button for the fluency tracker header. Toggles
 * the tracker's selection mode on/off via the provided
 * EtSelectionState. Visually flips state when active.
 */
import type { EtSelectionState } from './useEtSelection';

interface Props {
  selection: EtSelectionState;
}

export default function EtSelectToggle({ selection }: Props) {
  const handleClick = () => {
    if (selection.active) selection.exit();
    else selection.enter();
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={selection.active}
      className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition ${
        selection.active
          ? 'border-fluent bg-fluent text-white'
          : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
      }`}
    >
      {selection.active ? 'Exit select' : 'Select'}
    </button>
  );
}
