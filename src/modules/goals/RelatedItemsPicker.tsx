import { useEffect, useMemo, useState } from 'react';
import {
  buildSkillRegistry,
  type SkillRecord,
} from '../skills/registry';
import { moduleMetaById } from '../../lib/moduleMeta';

/**
 * Related-items picker. Loads the unified SkillRecord[] from
 * `buildSkillRegistry()` once when the picker mounts, then
 * substring-filters client-side. Multi-select via checkboxes.
 *
 * Display per result row:
 *   [color square]  module label  •  item name  •  [proficiency badge]
 *
 * Result list is capped at 20 visible rows. When a substring match
 * yields more, a "Refine search to see more" hint surfaces; the
 * user narrows the input.
 *
 * Glossary terms are intentionally absent — they aren't in the
 * skills registry per the existing convention. If the future
 * Production Vocabulary flashcard deck reifies them, they'll show
 * up here automatically.
 *
 * Proficiency display in Phase 1 step 4 falls back to the existing
 * `currentTier` value (the Tier enum: mastered / fluent / developing /
 * needsWork / stale / untouched). Phase 2 (spacing state) will
 * refine the per-module proficiency display to use the new
 * vocabulary directly. For now the badge surfaces existing-tier
 * info so users have *some* mastery signal beyond the item name.
 */

interface Props {
  /** Currently selected skillIds. */
  selected: string[];
  onChange: (skillIds: string[]) => void;
}

const MAX_VISIBLE = 20;

export default function RelatedItemsPicker({ selected, onChange }: Props) {
  const [allRecords, setAllRecords] = useState<SkillRecord[] | null>(null);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load registry once on mount. The walk is single-digit ms for a
  // typical user, so no caching is needed beyond the component's
  // own state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const records = await buildSkillRegistry();
        if (!cancelled) setAllRecords(records);
      } catch (err) {
        console.warn('[goals] buildSkillRegistry failed', err);
        if (!cancelled) setLoadError('Could not load items. Try again.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const { matches, totalMatchCount } = useMemo(() => {
    if (!allRecords) return { matches: [] as SkillRecord[], totalMatchCount: 0 };
    const q = query.trim().toLowerCase();
    if (q === '') return { matches: [] as SkillRecord[], totalMatchCount: 0 };
    const all = allRecords.filter(r => r.name.toLowerCase().includes(q));
    return { matches: all.slice(0, MAX_VISIBLE), totalMatchCount: all.length };
  }, [allRecords, query]);

  const groupedMatches = useMemo(() => groupByModule(matches), [matches]);

  const selectedRecords = useMemo(
    () => (allRecords ?? []).filter(r => selectedSet.has(r.skillId)),
    [allRecords, selectedSet],
  );

  const toggle = (skillId: string) => {
    if (selectedSet.has(skillId)) {
      onChange(selected.filter(id => id !== skillId));
    } else {
      onChange([...selected, skillId]);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Selected chips */}
      {selectedRecords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedRecords.map(r => {
            const meta = moduleMetaById(r.moduleId);
            return (
              <span
                key={r.skillId}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
                style={{
                  backgroundColor: meta ? `${meta.accentHex}1a` : '#e5e7eb',
                  color: meta?.accentHex,
                }}
              >
                {r.name}
                <button
                  type="button"
                  onClick={() => toggle(r.skillId)}
                  aria-label={`remove ${r.name}`}
                  className="text-current/60 hover:text-current text-base leading-none -mr-0.5"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Search input */}
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search songs, drills, lessons, ear-training items…"
        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-fluent/40"
      />

      {/* Results */}
      {loadError && <p className="text-xs text-needswork">{loadError}</p>}
      {!allRecords && !loadError && (
        <p className="text-xs text-neutral-500 italic">Loading items…</p>
      )}
      {allRecords && query.trim() === '' && (
        <p className="text-xs text-neutral-500 italic">
          Type to search across all skills, songs, and lessons.
        </p>
      )}
      {allRecords && query.trim() !== '' && matches.length === 0 && (
        <p className="text-xs text-neutral-500 italic">No matches.</p>
      )}
      {groupedMatches.length > 0 && (
        <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto rounded-md border border-black/[0.07] p-2">
          {groupedMatches.map(group => (
            <li key={group.moduleId}>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1 px-1">
                {group.moduleLabel}
              </div>
              <ul className="flex flex-col">
                {group.records.map(r => (
                  <PickerRow
                    key={r.skillId}
                    record={r}
                    selected={selectedSet.has(r.skillId)}
                    onToggle={() => toggle(r.skillId)}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {totalMatchCount > MAX_VISIBLE && (
        <p className="text-xs text-neutral-500 italic">
          {totalMatchCount - MAX_VISIBLE} more match — refine search to see them.
        </p>
      )}
    </div>
  );
}

function PickerRow({
  record,
  selected,
  onToggle,
}: {
  record: SkillRecord;
  selected: boolean;
  onToggle: () => void;
}) {
  const meta = moduleMetaById(record.moduleId);
  const accent = meta?.accentHex ?? '#9ca3af';
  return (
    <li>
      <label className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900/40 cursor-pointer">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="shrink-0"
        />
        <span
          aria-hidden
          className="inline-block w-3 h-3 rounded-sm shrink-0"
          style={{ backgroundColor: accent }}
        />
        <span className="text-sm flex-1 min-w-0 truncate" title={record.name}>
          {record.name}
        </span>
        <ProficiencyBadge tier={record.currentTier} />
      </label>
    </li>
  );
}

function ProficiencyBadge({ tier }: { tier: SkillRecord['currentTier'] }) {
  if (tier === null || tier === 'untouched') {
    return (
      <span className="text-[10px] text-neutral-400 italic shrink-0">
        Not yet started
      </span>
    );
  }
  const label = tier.charAt(0).toUpperCase() + tier.slice(1).replace(/([A-Z])/g, ' $1');
  return (
    <span className="text-[10px] uppercase tracking-wide text-neutral-500 shrink-0">
      {label}
    </span>
  );
}

interface ModuleGroup {
  moduleId: string;
  moduleLabel: string;
  records: SkillRecord[];
}

function groupByModule(records: SkillRecord[]): ModuleGroup[] {
  const order: string[] = [];
  const byId = new Map<string, ModuleGroup>();
  for (const r of records) {
    let g = byId.get(r.moduleId);
    if (!g) {
      g = { moduleId: r.moduleId, moduleLabel: r.moduleLabel, records: [] };
      byId.set(r.moduleId, g);
      order.push(r.moduleId);
    }
    g.records.push(r);
  }
  return order.map(id => byId.get(id)!);
}
