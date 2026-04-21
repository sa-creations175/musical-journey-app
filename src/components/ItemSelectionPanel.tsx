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

export interface FilterOption {
  /** Unique filter key. */
  key: string;
  label: string;
  /**
   * Tailwind bg class literal for the color dot next to the label
   * (e.g. `bg-family-major-500`). Omit to render a plain chip.
   */
  colorClass?: string;
}

export interface FilterConfig {
  /** Label shown above the filter chips. */
  label: string;
  options: FilterOption[];
  /**
   * Return true when an item should be visible given the currently-active
   * filter keys. Not invoked when activeFilters is empty — an empty set
   * means "All" and every item is visible.
   */
  isVisible: (itemKey: string, activeFilters: Set<string>) => boolean;
  /** Label for the "All" chip. Defaults to "All". */
  allLabel?: string;
}

export interface ExtraQuickSelect {
  label: string;
  /** Compute the key list; returned keys are intersected with visible keys. */
  compute: () => string[];
  /** Message shown if compute() returns nothing applicable. */
  emptyMessage?: string;
}

interface Props {
  title: string;
  description?: string;
  /** Optional context note rendered at the top of the body. */
  note?: ReactNode;
  /**
   * Optional filter row rendered above the quick-select buttons. Multi-
   * select; empty set is treated as "All". All quick-selects and section
   * rendering respect the current filter.
   */
  filter?: FilterConfig;
  sections: SelectionSection[];
  initialSelection: string[];
  onStart: (selection: string[]) => void;
  onCancel: () => void;
  startLabel?: string;
  suggestWeakSpots?: () => string[];
  suggestLabel?: string;
  emptySuggestionMessage?: string;
  /**
   * Additional quick-select buttons (beyond All / None / Suggest). Each
   * one replaces the visible selection with compute() ∩ visible, same
   * semantics as Suggest.
   */
  extraQuickSelects?: ExtraQuickSelect[];
}

// Reusable selection panel for any quiz module: sectioned checkbox items,
// optional category/family filter row, All / None / (optional) Suggest
// quick-selects, Start / Cancel footer. Wraps the shared <Modal>.
export default function ItemSelectionPanel({
  title,
  description,
  note,
  filter,
  sections,
  initialSelection,
  onStart,
  onCancel,
  startLabel = 'start focus session',
  suggestWeakSpots,
  suggestLabel = 'suggest my weak spots',
  emptySuggestionMessage = "you don't have any items in developing or needs-work tier yet.",
  extraQuickSelects,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelection));
  const [activeFilters, setActiveFilters] = useState<Set<string>>(() => new Set());
  const [suggestionEmpty, setSuggestionEmpty] = useState<string | null>(null);

  const allKeys = useMemo(
    () => sections.flatMap(s => s.items.map(i => i.key)),
    [sections],
  );

  const isFiltering = filter !== undefined && activeFilters.size > 0;

  const visibleKeys = useMemo(() => {
    if (!isFiltering) return allKeys;
    return allKeys.filter(k => filter!.isVisible(k, activeFilters));
  }, [allKeys, filter, activeFilters, isFiltering]);

  const visibleSections = useMemo(() => {
    if (!isFiltering) return sections;
    return sections
      .map(s => ({ ...s, items: s.items.filter(i => filter!.isVisible(i.key, activeFilters)) }))
      .filter(s => s.items.length > 0);
  }, [sections, filter, activeFilters, isFiltering]);

  const toggleItem = (key: string, isOn: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (isOn) next.add(key); else next.delete(key);
      return next;
    });
    setSuggestionEmpty(null);
  };

  // Quick-selects operate on currently-visible items only — so filtering
  // to a subset and clicking All/None/Suggest doesn't touch selections
  // in hidden categories.
  const selectAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      for (const k of visibleKeys) next.add(k);
      return next;
    });
    setSuggestionEmpty(null);
  };
  const selectNone = () => {
    setSelected(prev => {
      const next = new Set(prev);
      for (const k of visibleKeys) next.delete(k);
      return next;
    });
    setSuggestionEmpty(null);
  };
  const applyReplacement = (keys: string[], emptyMessage: string) => {
    const visibleSet = new Set(visibleKeys);
    const intersected = keys.filter(k => visibleSet.has(k));
    if (intersected.length === 0) {
      setSuggestionEmpty(emptyMessage);
      return;
    }
    setSelected(prev => {
      const next = new Set(prev);
      for (const k of visibleKeys) next.delete(k);
      for (const k of intersected) next.add(k);
      return next;
    });
    setSuggestionEmpty(null);
  };
  const selectSuggestion = () => {
    if (!suggestWeakSpots) return;
    applyReplacement(suggestWeakSpots(), emptySuggestionMessage);
  };

  const toggleFilter = (key: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const clearFilters = () => setActiveFilters(new Set());

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

      {filter && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1.5">
            {filter.label}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              label={filter.allLabel ?? 'all'}
              active={!isFiltering}
              onClick={clearFilters}
            />
            {filter.options.map(opt => (
              <FilterChip
                key={opt.key}
                label={opt.label}
                colorClass={opt.colorClass}
                active={activeFilters.has(opt.key)}
                onClick={() => toggleFilter(opt.key)}
              />
            ))}
          </div>
        </div>
      )}

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
        {extraQuickSelects?.map(qs => (
          <button
            key={qs.label}
            onClick={() => applyReplacement(qs.compute(), qs.emptyMessage ?? "no items match.")}
            className="px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent"
          >
            {qs.label}
          </button>
        ))}
      </div>
      {suggestionEmpty && (
        <p className="mb-4 text-[11px] text-neutral-500 italic">{suggestionEmpty}</p>
      )}

      <div className="space-y-5">
        {visibleSections.map(section => (
          <section key={section.title}>
            <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{section.title}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {section.items.map(item => {
                const on = selected.has(item.key);
                return (
                  <label
                    key={item.key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition select-none ${
                      on
                        ? 'border-fluent bg-fluent/10 text-fluent'
                        : 'border-neutral-200 dark:border-neutral-700 hover:border-fluent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={e => toggleItem(item.key, e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-300 text-fluent focus:ring-fluent"
                    />
                    <span className="truncate">{item.label}</span>
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

interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  colorClass?: string;
}

function FilterChip({ label, active, onClick, colorClass }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-2.5 py-1 rounded-md border text-xs inline-flex items-center gap-1.5 transition ${
        active
          ? 'border-fluent bg-fluent/10 text-fluent'
          : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
      }`}
    >
      {colorClass && <span aria-hidden className={`w-2 h-2 rounded-full ${colorClass}`} />}
      {label}
    </button>
  );
}
