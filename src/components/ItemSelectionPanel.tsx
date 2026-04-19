import { useMemo, useState, type ReactNode } from 'react';
import Modal from './Modal';

export interface SelectableItem {
  key: string;
  label: string;
}

export interface SelectionSection {
  title: string;
  items: SelectableItem[];
}

interface Props {
  title: string;
  description?: string;
  /** Optional context note rendered at the top of the body. Parent controls content + styling. */
  note?: ReactNode;
  sections: SelectionSection[];
  initialSelection: string[];
  onStart: (selection: string[]) => void;
  onCancel: () => void;
  startLabel?: string;
  suggestWeakSpots?: () => string[];
  suggestLabel?: string;
  emptySuggestionMessage?: string;
}

// Reusable selection panel for any quiz module: sectioned checkbox items,
// All / None / (optional) Suggest quick-selects, Start / Cancel footer.
// Renders inside the shared <Modal> (which handles portal, scroll lock,
// focus, Escape, backdrop click).
export default function ItemSelectionPanel({
  title,
  description,
  note,
  sections,
  initialSelection,
  onStart,
  onCancel,
  startLabel = 'start focus session',
  suggestWeakSpots,
  suggestLabel = 'suggest my weak spots',
  emptySuggestionMessage = "you don't have any items in developing or needs-work tier yet.",
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelection));
  const [suggestionEmpty, setSuggestionEmpty] = useState(false);

  const allKeys = useMemo(
    () => sections.flatMap(s => s.items.map(i => i.key)),
    [sections],
  );

  const toggle = (key: string, isOn: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (isOn) next.add(key); else next.delete(key);
      return next;
    });
    setSuggestionEmpty(false);
  };

  const selectAll = () => { setSelected(new Set(allKeys)); setSuggestionEmpty(false); };
  const selectNone = () => { setSelected(new Set()); setSuggestionEmpty(false); };
  const selectSuggestion = () => {
    if (!suggestWeakSpots) return;
    const keys = suggestWeakSpots();
    if (keys.length === 0) {
      setSuggestionEmpty(true);
      return;
    }
    setSelected(new Set(keys));
    setSuggestionEmpty(false);
  };

  const count = selected.size;

  const footer = (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      <span className="text-xs text-neutral-500 mr-auto">
        {count === 0 ? 'select at least one interval' : `${count} selected`}
      </span>
      <button
        data-autofocus
        onClick={onCancel}
        className="px-4 min-h-[44px] rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm hover:border-neutral-400"
      >
        cancel
      </button>
      <button
        onClick={() => onStart([...selected])}
        disabled={count === 0}
        className={`px-4 min-h-[44px] rounded-lg text-sm font-medium ${
          count === 0
            ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
            : 'bg-fluent text-white hover:opacity-90'
        }`}
      >
        {startLabel}
      </button>
    </div>
  );

  return (
    <Modal open onClose={onCancel} title={title} description={description} footer={footer}>
      {note && <div className="mb-4">{note}</div>}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <button onClick={selectAll} className="px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent">
          all
        </button>
        <button onClick={selectNone} className="px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent">
          none
        </button>
        {suggestWeakSpots && (
          <button onClick={selectSuggestion} className="px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent">
            {suggestLabel}
          </button>
        )}
      </div>
      {suggestionEmpty && (
        <p className="mb-4 text-[11px] text-neutral-500 italic">{emptySuggestionMessage}</p>
      )}

      <div className="space-y-5">
        {sections.map(section => (
          <section key={section.title}>
            <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{section.title}</h4>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {section.items.map(item => {
                const on = selected.has(item.key);
                return (
                  <label
                    key={item.key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition select-none ${
                      on
                        ? 'border-fluent bg-fluent/10 text-fluent'
                        : 'border-neutral-200 dark:border-neutral-700 hover:border-fluent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={e => toggle(item.key, e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-300 text-fluent focus:ring-fluent"
                    />
                    <span className="font-mono truncate">{item.label}</span>
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
