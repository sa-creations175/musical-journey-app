import Modal from '../../components/Modal';
import type { GoalScope } from '../../lib/db';
import type { LayerDef } from './Goals';

/**
 * Customize Layers — a modal listing all six Goals home layers
 * with a visible/hidden toggle per layer. Hidden layers don't
 * render on Goals home; they remain reachable via this panel so
 * users can restore them.
 *
 * Default state is "all visible" — the panel exists for users who
 * never use a particular horizon (e.g. someone who never thinks
 * past quarterly) and want a tighter home view.
 */
export default function CustomizeLayersModal({
  open,
  onClose,
  layers,
  hiddenLayers,
  onSetHidden,
}: {
  open: boolean;
  onClose: () => void;
  layers: LayerDef[];
  hiddenLayers: GoalScope[];
  onSetHidden: (scope: GoalScope, hidden: boolean) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize layers"
      description="Hide layers you don't use. They stay reachable here if you change your mind."
    >
      <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        {layers.map(layer => {
          const hidden = hiddenLayers.includes(layer.scope);
          return (
            <li key={layer.scope} className="py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                  {layer.title}
                </div>
                <div className="text-xs text-neutral-500">
                  {layer.type === 'aspirational' ? 'Aspirational / open-text' : 'Measurable goals'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!hidden}
                onClick={() => onSetHidden(layer.scope, !hidden)}
                className={`relative inline-flex w-10 h-6 rounded-full transition-colors ${
                  hidden ? 'bg-neutral-300 dark:bg-neutral-700' : 'bg-fluent'
                }`}
                aria-label={hidden ? `show ${layer.title}` : `hide ${layer.title}`}
              >
                <span
                  className={`inline-block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    hidden ? 'translate-x-0.5' : 'translate-x-[18px]'
                  } mt-0.5`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
