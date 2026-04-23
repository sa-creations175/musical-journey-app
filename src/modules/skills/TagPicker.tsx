import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { normalizeTag } from './tagHelpers';

interface Props {
  /** Tags currently applied to the target (skill annotation, diary
   *  entry, etc.). The picker filters these out so the user can't
   *  re-add a tag that's already present. */
  existing: string[];
  onAdd: (tag: string) => void;
  /** Small curated seed list merged with aggregated tags — used as
   *  fallback when the user hasn't built their own tag vocabulary
   *  yet. Optional. */
  seed?: readonly string[];
  /** Placeholder shown in the input. */
  placeholder?: string;
}

/**
 * Searchable tag picker with typeahead, usage-weighted suggestions,
 * and a create-new option. Aggregates every tag currently used on
 * `skillAnnotations` + `harmonicDiaryEntries` (both emotional and
 * genre tags) plus an optional `seed` list. Surfaces most-used
 * tags first when the query is empty. When the typed text doesn't
 * exactly match an existing tag, surfaces a "Create new tag"
 * affordance at the bottom so the user can commit their variant.
 *
 * Tag format is normalised on add: lowercased, whitespace collapsed,
 * multi-word phrases hyphenated. This keeps the aggregate pool free
 * of common variant duplicates ("Modal Interchange" vs
 * "modal interchange" vs "Modal-Interchange").
 */
export default function TagPicker({ existing, onAdd, seed = [], placeholder }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Aggregate tags + usage counts across the whole app. Recomputes
  // reactively when annotations or diary entries change. Seed tags
  // are folded in at render-time so different callers can pass
  // different seed lists without invalidating the live-query result.
  const rawCounts = useLiveQuery(async () => {
    const [annotations, diary] = await Promise.all([
      db.skillAnnotations.toArray(),
      db.harmonicDiaryEntries.toArray(),
    ]);
    const counts = new Map<string, number>();
    const bump = (t: string) => counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const a of annotations) for (const t of a.tags ?? []) bump(t);
    for (const e of diary) {
      for (const t of e.emotionalTags ?? []) bump(t);
      for (const t of e.genreTags ?? []) bump(t);
    }
    return counts;
  }, []);
  const tagCounts: Map<string, number> = (() => {
    const merged = new Map(rawCounts ?? []);
    for (const t of seed) if (!merged.has(t)) merged.set(t, 0);
    return merged;
  })();

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const existingSet = new Set(existing.map(t => t.toLowerCase()));
    const entries = [...tagCounts.entries()]
      .filter(([tag]) => !existingSet.has(tag))
      .filter(([tag]) => q === '' || tag.includes(q));
    entries.sort((a, b) => {
      // Most-used first; tie-break alphabetically for stability.
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
    return entries.slice(0, 12);
  }, [tagCounts, query, existing]);

  const normalized = normalizeTag(query);
  const alreadyExists = filtered.some(([t]) => t === normalized) || existing.map(t => t.toLowerCase()).includes(normalized);
  const showCreate = normalized.length > 0 && !alreadyExists;

  const commit = (tag: string) => {
    const t = normalizeTag(tag);
    if (t === '') return;
    onAdd(t);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-1.5">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (filtered.length > 0 && !showCreate) {
                commit(filtered[0][0]);
              } else if (normalized) {
                commit(normalized);
              }
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder={placeholder ?? 'search existing tags or type a new one…'}
          className="flex-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
        />
        <button
          onClick={() => {
            if (showCreate) commit(normalized);
            else if (filtered.length > 0) commit(filtered[0][0]);
          }}
          disabled={normalized === '' && filtered.length === 0}
          className={`px-2.5 py-1 rounded-md text-xs ${
            normalized === '' && filtered.length === 0
              ? 'border border-neutral-200 dark:border-neutral-700 text-neutral-400'
              : 'bg-fluent text-white hover:opacity-90'
          }`}
        >
          add
        </button>
      </div>

      {open && (filtered.length > 0 || showCreate) && (
        <div
          className="absolute left-0 right-0 mt-1 z-50 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg max-h-64 overflow-y-auto"
          role="listbox"
        >
          {filtered.length > 0 && (
            <div className="py-1">
              {query.trim() === '' && (
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-neutral-400">
                  most-used tags
                </div>
              )}
              {filtered.map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => commit(tag)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-fluent/5"
                  role="option"
                  aria-selected="false"
                >
                  <span className="truncate">{tag}</span>
                  {count > 0 && (
                    <span className="shrink-0 text-[10px] text-neutral-400 font-mono tabular-nums">
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {showCreate && (
            <>
              {filtered.length > 0 && (
                <div className="border-t border-neutral-100 dark:border-neutral-800" />
              )}
              <button
                onClick={() => commit(normalized)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-fluent/5"
              >
                <span className="text-neutral-500">+ create new tag:</span>
                <span className="font-medium text-fluent">{normalized}</span>
              </button>
            </>
          )}
        </div>
      )}

      <p className="mt-1.5 text-[10px] text-neutral-500 italic">
        type to filter or create a tag — lowercase, hyphenated multi-word phrases.
      </p>
    </div>
  );
}

