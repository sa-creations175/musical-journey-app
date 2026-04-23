import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { db, type HarmonicDiaryEntry } from '../../lib/db';
import { buildSkillRegistry, type SkillRecord } from '../skills/registry';
import Modal from '../../components/Modal';
import DiaryEntryCard from './DiaryEntryCard';
import DiaryEntryEditor from './DiaryEntryEditor';
import { loadAllDiaryEntries, migrateLegacyAssociationsIfNeeded, seedStartersIfNeeded } from './data';
import { EMOTIONAL_TAGS, defaultStarterFor, quoteForToday } from './vocab';
import { playSkillAudio } from './audio';

type ViewMode = 'moodboard' | 'list';

/**
 * Harmonic Diary landing.
 *
 * Two view modes:
 *   - Moodboard (default for first-time users). Atmospheric canvas,
 *     masonry-ish layout, subtle palette shifts based on search.
 *   - List. Functional, quick scan, same filters.
 *
 * First-open migrates legacy associations from the three per-module
 * tables into the unified diary (idempotent). New entries and edits
 * write to the unified table only.
 */
export default function HarmonicDiary() {
  const [searchParams] = useSearchParams();

  // Kick off legacy migration + starter seed once on first mount.
  // Both are idempotent; starters fill in gaps for any skill the
  // user hasn't written an entry for yet.
  useEffect(() => {
    void (async () => {
      await migrateLegacyAssociationsIfNeeded();
      await seedStartersIfNeeded();
    })();
  }, []);

  const rawEntries = useLiveQuery<HarmonicDiaryEntry[]>(
    () => loadAllDiaryEntries(),
    [],
  );
  // Stable empty-array reference when dexie hasn't emitted yet —
  // avoids re-creating a new [] on every render (which would
  // invalidate memoised selectors downstream).
  const entries = useMemo<HarmonicDiaryEntry[]>(() => rawEntries ?? [], [rawEntries]);

  // Build the skill registry for context (name lookup, module route).
  // Registry is rebuilt whenever attempts/drills/songs change so entry
  // cards reflect fresh tier/freshness.
  const liveSignal = useLiveQuery(async () => {
    const [a, d, s, ann] = await Promise.all([
      db.attempts.count(),
      db.drillSessions.count(),
      db.songPracticeLog.count(),
      db.skillAnnotations.count(),
    ]);
    return { a, d, s, ann };
  }, []);
  const [skillsById, setSkillsById] = useState<Map<string, SkillRecord>>(new Map());
  useEffect(() => {
    (async () => {
      const regs = await buildSkillRegistry();
      const map = new Map<string, SkillRecord>();
      for (const r of regs) map.set(r.skillId, r);
      setSkillsById(map);
    })();
  }, [liveSignal]);

  const [mode, setMode] = useState<ViewMode>('moodboard');
  const [search, setSearch] = useState('');
  const [activeEmotionFilter, setActiveEmotionFilter] = useState<string | null>(null);
  const [activeModuleFilter, setActiveModuleFilter] = useState<string | null>(null);

  // Editor modal state.
  const [editing, setEditing] = useState<{ entry: HarmonicDiaryEntry | null; skillId: string; starter?: string } | null>(null);

  // Pick skill modal state — used when starting a new entry.
  const [picking, setPicking] = useState(false);

  // URL integration: `?skill=<id>&compose=1` from the catalogue jump
  // opens the editor pre-populated for that skill.
  useEffect(() => {
    const skillId = searchParams.get('skill');
    const compose = searchParams.get('compose');
    if (!skillId) return;
    const existing = entries.find(e => e.skillId === skillId) ?? null;
    const skill = skillsById.get(skillId);
    if (existing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing({ entry: existing, skillId, starter: existing.claudeStarterText });
    } else if (compose === '1') {
      setEditing({
        entry: null,
        skillId,
        starter: skill ? defaultStarterFor(skill.skillType, skill.name) : undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, skillsById]);

  const quote = useMemo(() => quoteForToday(), []);

  // Filter + search pipeline. Search matches everything that makes
  // a diary entry findable: user text, starter text, tags, and the
  // underlying skill's name / module label / category.
  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e => {
      if (activeEmotionFilter && !e.emotionalTags.includes(activeEmotionFilter)) return false;
      if (activeModuleFilter) {
        const skill = skillsById.get(e.skillId);
        if (!skill || skill.moduleId !== activeModuleFilter) return false;
      }
      if (q) {
        const skill = skillsById.get(e.skillId);
        const parts = [
          e.userText,
          e.claudeStarterText ?? '',
          e.emotionalTags.join(' '),
          e.genreTags.join(' '),
          skill?.name ?? '',
          skill?.moduleLabel ?? '',
          skill?.category ?? '',
          skill?.skillType ?? '',
        ].join(' ').toLowerCase();
        if (!parts.includes(q)) return false;
      }
      return true;
    });
  }, [entries, skillsById, search, activeEmotionFilter, activeModuleFilter]);

  // Surface all emotion tags actually present in entries — lets the
  // chip row shrink when the user hasn't used the full vocabulary yet.
  const emotionChips = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) for (const t of e.emotionalTags) set.add(t);
    // Always include a curated set up front so the chip row looks
    // populated on first visit.
    for (const t of EMOTIONAL_TAGS.slice(0, 10)) set.add(t);
    return [...set].sort();
  }, [entries]);

  const moduleOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const e of entries) {
      const skill = skillsById.get(e.skillId);
      if (skill) set.set(skill.moduleId, skill.moduleLabel);
    }
    return [...set.entries()].map(([moduleId, label]) => ({ moduleId, label }));
  }, [entries, skillsById]);

  const openEditor = (entry: HarmonicDiaryEntry) => {
    setEditing({ entry, skillId: entry.skillId, starter: entry.claudeStarterText });
  };

  return (
    <div className="diary-root space-y-5">
      {/* Top header — editorial masthead. Single earth-tone palette
          for everything; no mode toggle, no emotion-driven shifts. */}
      <header className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1
            className="diary-serif text-3xl sm:text-4xl font-medium tracking-tight"
            style={{ color: 'var(--diary-text)' }}
          >
            harmonic diary
          </h1>
          <div className="flex items-center gap-2">
            <ViewToggle mode={mode} onChange={setMode} />
            <button
              onClick={() => setPicking(true)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition"
              style={{
                backgroundColor: 'var(--diary-text)',
                color: 'var(--diary-card-bg)',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            >
              + add association
            </button>
          </div>
        </div>

        {/* Daily lineage quote — full-strength primary text so it
            reads crisp against the paper background. */}
        <div className="text-center py-3">
          <span className="diary-divider-glyph" aria-hidden>· · ·</span>
          <span className="diary-divider" aria-hidden />
          <p
            className="diary-serif-italic max-w-2xl mx-auto leading-relaxed"
            style={{ fontSize: '26px', color: 'var(--diary-text)' }}
          >
            {quote}
          </p>
          <span className="diary-divider" aria-hidden />
          <span className="diary-divider-glyph" aria-hidden>· · ·</span>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search associations, tags, skills…"
            className="diary-input flex-1 min-w-[200px] rounded-md px-3 py-2 text-sm"
          />
          {(activeEmotionFilter || activeModuleFilter || search) && (
            <button
              onClick={() => {
                setActiveEmotionFilter(null);
                setActiveModuleFilter(null);
                setSearch('');
              }}
              className="text-xs underline-offset-2 hover:underline transition"
              style={{ color: 'var(--diary-text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--diary-text)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--diary-text-muted)'; }}
            >
              clear
            </button>
          )}
        </div>

        {/* Emotion chip row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {emotionChips.map(tag => {
            const active = activeEmotionFilter === tag;
            return (
              <button
                key={tag}
                onClick={() => setActiveEmotionFilter(tag === activeEmotionFilter ? null : tag)}
                className={active ? 'diary-chip' : 'diary-chip-muted'}
                style={{ cursor: 'pointer' }}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* Module chip row */}
        {moduleOptions.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest mr-1" style={{ color: 'var(--diary-text-dim)' }}>origin</span>
            {moduleOptions.map(m => {
              const active = activeModuleFilter === m.moduleId;
              return (
                <button
                  key={m.moduleId}
                  onClick={() => setActiveModuleFilter(m.moduleId === activeModuleFilter ? null : m.moduleId)}
                  className="px-2.5 py-0.5 rounded-full text-[11px] transition"
                  style={active ? {
                    backgroundColor: 'var(--diary-accent)',
                    color: 'var(--diary-card-bg)',
                    border: '1px solid var(--diary-accent)',
                  } : {
                    backgroundColor: 'transparent',
                    color: 'var(--diary-text-muted)',
                    border: '1px solid var(--diary-card-border)',
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Body */}
      {entries.length === 0 ? (
        <EmptyState onAdd={() => setPicking(true)} />
      ) : filteredEntries.length === 0 ? (
        <div className="py-10 text-center diary-serif-italic" style={{ color: 'var(--diary-text-muted)' }}>
          no entries match these filters.
        </div>
      ) : mode === 'moodboard' ? (
        <MoodboardView
          entries={filteredEntries}
          skillsById={skillsById}
          onEdit={openEditor}
        />
      ) : (
        <ListView entries={filteredEntries} skillsById={skillsById} onEdit={openEditor} />
      )}

      {editing && (
        <DiaryEntryEditor
          entry={editing.entry}
          skill={skillsById.get(editing.skillId)}
          skillId={editing.skillId}
          starter={editing.starter}
          onClose={() => setEditing(null)}
        />
      )}

      {picking && (
        <SkillPickerModal
          skillsById={skillsById}
          entries={entries}
          onClose={() => setPicking(false)}
          onPick={skill => {
            setPicking(false);
            const existing = entries.find(e => e.skillId === skill.skillId) ?? null;
            setEditing({
              entry: existing,
              skillId: skill.skillId,
              starter: existing?.claudeStarterText ?? defaultStarterFor(skill.skillType, skill.name),
            });
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="view mode"
      className="inline-flex rounded-md p-0.5 text-xs"
      style={{ border: '1px solid var(--diary-card-border)' }}
    >
      {(['moodboard', 'list'] as ViewMode[]).map(m => {
        const active = mode === m;
        return (
          <button
            key={m}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m)}
            className="px-2.5 py-1 rounded transition"
            style={active ? {
              backgroundColor: 'var(--diary-text)',
              color: 'var(--diary-card-bg)',
            } : {
              color: 'var(--diary-text-muted)',
            }}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------
// Views
// -------------------------------------------------------------------

function MoodboardView({
  entries,
  skillsById,
  onEdit,
}: {
  entries: HarmonicDiaryEntry[];
  skillsById: Map<string, SkillRecord>;
  onEdit: (e: HarmonicDiaryEntry) => void;
}) {
  // The gradient + grain lives on the outer `.diary-root`, so
  // MoodboardView just handles the masonry-ish card layout.
  return (
    <div
      className="diary-moodboard grid gap-6 sm:gap-7"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}
    >
      {entries.map(e => (
        <div key={e.entryId} className="diary-card-wrap">
          <DiaryEntryCard
            entry={e}
            skill={skillsById.get(e.skillId)}
            variant="moodboard"
            onEdit={() => onEdit(e)}
            onPlay={() => playSkillAudio(skillsById.get(e.skillId))}
          />
        </div>
      ))}
    </div>
  );
}

function ListView({
  entries,
  skillsById,
  onEdit,
}: {
  entries: HarmonicDiaryEntry[];
  skillsById: Map<string, SkillRecord>;
  onEdit: (e: HarmonicDiaryEntry) => void;
}) {
  return (
    <div className="diary-list p-4 sm:p-5">
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {entries.map(e => (
          <li key={e.entryId}>
            <DiaryEntryCard
              entry={e}
              skill={skillsById.get(e.skillId)}
              variant="list"
              onEdit={() => onEdit(e)}
              onPlay={() => playSkillAudio(skillsById.get(e.skillId))}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// -------------------------------------------------------------------
// Empty state
// -------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className="rounded-lg p-8 sm:p-12 text-center space-y-3"
      style={{
        backgroundColor: 'var(--diary-card-bg)',
        border: '1px solid var(--diary-card-border)',
      }}
    >
      <p className="diary-serif text-xl" style={{ color: 'var(--diary-text)' }}>
        your diary is a clean page.
      </p>
      <p
        className="text-sm max-w-md mx-auto leading-relaxed"
        style={{ color: 'var(--diary-text-muted)' }}
      >
        Associations are notes about how a chord, mode, progression, or song <em className="diary-serif-italic">feels</em> to you. They live across modules, searchable and taggable.
      </p>
      <button
        onClick={onAdd}
        className="mt-2 px-4 py-2 rounded-md text-sm font-medium transition"
        style={{ backgroundColor: 'var(--diary-text)', color: 'var(--diary-card-bg)' }}
      >
        + add your first association
      </button>
    </div>
  );
}

// -------------------------------------------------------------------
// Skill picker (for new entries)
// -------------------------------------------------------------------

function SkillPickerModal({
  skillsById,
  entries,
  onClose,
  onPick,
}: {
  skillsById: Map<string, SkillRecord>;
  entries: HarmonicDiaryEntry[];
  onClose: () => void;
  onPick: (skill: SkillRecord) => void;
}) {
  const [query, setQuery] = useState('');

  // Suggest skills the user has interacted with but not yet written
  // an association about — the path of least resistance is usually
  // the most useful skill to capture a note on next.
  const existingSkillIds = useMemo(() => new Set(entries.map(e => e.skillId)), [entries]);
  const skills = useMemo(() => [...skillsById.values()], [skillsById]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = skills.slice();
    if (q) {
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.moduleLabel.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
      );
    } else {
      // No query — surface recently-practised skills that don't yet
      // have a diary entry, then everything else.
      list.sort((a, b) => {
        const aHas = existingSkillIds.has(a.skillId) ? 1 : 0;
        const bHas = existingSkillIds.has(b.skillId) ? 1 : 0;
        if (aHas !== bHas) return aHas - bHas;
        return (b.lastPracticed ?? 0) - (a.lastPracticed ?? 0);
      });
    }
    return list.slice(0, 50);
  }, [skills, query, existingSkillIds]);

  return (
    <Modal
      open
      onClose={onClose}
      title="pick a skill to write about"
      description="any chord, progression, mode, song, or drill you've practised"
    >
      <div className="space-y-3">
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="search by name, module, or category…"
          className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        />
        {results.length === 0 ? (
          <p className="text-xs text-neutral-500 italic py-6 text-center">no skills match that search.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 max-h-[50vh] overflow-y-auto">
            {results.map(s => {
              const already = existingSkillIds.has(s.skillId);
              return (
                <li key={s.skillId}>
                  <button
                    onClick={() => onPick(s)}
                    className="w-full flex items-center gap-3 py-2 text-left hover:bg-fluent/5 rounded px-2 -mx-2 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{s.name}</div>
                      <div className="text-[11px] text-neutral-500 truncate">
                        {s.moduleLabel} · {s.category}
                      </div>
                    </div>
                    {already && (
                      <span className="shrink-0 text-[10px] text-fluent italic">has entry</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
