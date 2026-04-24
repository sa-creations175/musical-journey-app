import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { glossaryAlphabetical } from './content/glossary';
import GlossaryOverlay from './GlossaryOverlay';

type Sort = 'alpha' | 'status';
type StatusFilter = 'all' | 'got-it' | 'not-yet';

/**
 * Standalone Glossary view — a searchable reference across all
 * terms. Users filter by status (Got it / Not yet) and toggle
 * between alphabetical sort and sort-by-status. Each card opens
 * the same overlay used inline from lessons.
 */
export default function GlossaryView() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<Sort>('alpha');
  const [openTerm, setOpenTerm] = useState<string | null>(null);

  const rawStates = useLiveQuery(
    async () => db.glossaryTermStates.toArray(),
    [],
  );
  const states = useMemo(() => rawStates ?? [], [rawStates]);
  const stateById = useMemo(() => {
    const m = new Map<string, (typeof states)[number]>();
    for (const s of states) m.set(s.id, s);
    return m;
  }, [states]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = glossaryAlphabetical();
    if (q) {
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.definition.toLowerCase().includes(q) ||
        t.example.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter(t => {
        const m = stateById.get(t.id)?.mastery ?? 'not-yet';
        return m === statusFilter;
      });
    }
    if (sort === 'status') {
      // Not-yet first (needs attention), then got-it.
      list = [...list].sort((a, b) => {
        const ma = stateById.get(a.id)?.mastery ?? 'not-yet';
        const mb = stateById.get(b.id)?.mastery ?? 'not-yet';
        if (ma === mb) return a.name.localeCompare(b.name);
        return ma === 'not-yet' ? -1 : 1;
      });
    }
    return list;
  }, [query, statusFilter, sort, stateById]);

  const counts = useMemo(() => {
    const all = glossaryAlphabetical().length;
    let gotIt = 0;
    for (const s of states) if (s.mastery === 'got-it') gotIt += 1;
    return { all, gotIt, notYet: all - gotIt };
  }, [states]);

  return (
    <div className="space-y-4 max-w-4xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-medium tracking-tight">Glossary</h1>
        <p className="text-sm text-neutral-500">
          Every production term introduced across the lessons. Click any card for the full definition and "got it" tracking.
        </p>
        <p className="text-[11px] text-neutral-500 pt-1">
          <span className="font-mono tabular-nums text-fluent">{counts.gotIt}</span> marked got it
          {' · '}
          <span className="font-mono tabular-nums">{counts.notYet}</span> still to revisit
          {' · '}
          <span className="font-mono tabular-nums">{counts.all}</span> total
        </p>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="search terms…"
          className="flex-1 min-w-[200px] rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm"
        />
        <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
          {(['all', 'not-yet', 'got-it'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded transition ${
                statusFilter === s
                  ? 'bg-production text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              {s === 'all' ? 'all' : s === 'got-it' ? 'got it' : 'not yet'}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
          sort
          <select
            value={sort}
            onChange={e => setSort(e.target.value as Sort)}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
          >
            <option value="alpha">a–z</option>
            <option value="status">by status</option>
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-neutral-500 italic">
          no terms match these filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {rows.map(t => {
            const mastery = stateById.get(t.id)?.mastery ?? 'not-yet';
            return (
              <button
                key={t.id}
                onClick={() => setOpenTerm(t.id)}
                className="text-left rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 hover:border-production/60 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className={`text-[10px] uppercase tracking-wide font-medium ${
                    mastery === 'got-it' ? 'text-fluent' : 'text-neutral-400'
                  }`}>
                    {mastery === 'got-it' ? 'got it' : 'not yet'}
                  </span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed line-clamp-2">
                  {t.definition}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {openTerm && (
        <GlossaryOverlay
          termId={openTerm}
          onClose={() => setOpenTerm(null)}
        />
      )}
    </div>
  );
}
