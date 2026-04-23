import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DrillSkill } from '../../lib/db';
import HeatGrid from './HeatGrid';
import { KEYS, VOICE_LEADING_PATTERNS, type VoiceLeadingPattern } from './catalog';
import { getPref, setPref } from '../../lib/userPrefs';
import { useToast } from '../../components/Toaster';

const PREF_CUSTOM_PATTERNS = 'shapesAndPatternsCustomVoiceLeading';

interface CustomPattern extends VoiceLeadingPattern {
  createdAt: number;
}

/**
 * Voice-leading drills: one heat-grid per pattern, spread across 12
 * keys. Users can add custom patterns alongside the three shipped
 * defaults; pattern labels are editable inline.
 */
export default function VoiceLeadingDrills() {
  const [custom, setCustom] = useState<CustomPattern[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const { toast } = useToast();

  // Live query of voice-leading skills so we can update labels on
  // existing DrillSkill rows when the user renames a pattern.
  const skills = useLiveQuery<DrillSkill[]>(
    () => db.drillSkills.where('kind').equals('voice-leading').toArray(),
    [],
  ) ?? [];

  useEffect(() => {
    (async () => {
      const saved = await getPref<CustomPattern[]>(PREF_CUSTOM_PATTERNS, []);
      setCustom(Array.isArray(saved) ? saved : []);
      setLoaded(true);
    })();
  }, []);

  const allPatterns: (VoiceLeadingPattern & { builtin?: boolean })[] = useMemo(() => [
    ...VOICE_LEADING_PATTERNS.map(p => ({ ...p, builtin: true })),
    ...custom,
  ], [custom]);

  const persistCustom = async (next: CustomPattern[]) => {
    setCustom(next);
    if (loaded) await setPref(PREF_CUSTOM_PATTERNS, next);
  };

  const addPattern = async () => {
    const trimmed = newLabel.trim();
    if (trimmed === '') return;
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await persistCustom([...custom, {
      id,
      label: trimmed,
      description: newDescription.trim() || undefined,
      createdAt: Date.now(),
    }]);
    setAdding(false);
    setNewLabel('');
    setNewDescription('');
    toast({ message: `Pattern added: ${trimmed}`, variant: 'success' });
  };

  const saveRename = async (patternId: string) => {
    const trimmed = nameDraft.trim();
    if (trimmed === '') { setRenamingId(null); return; }

    // Update the catalog-side label.
    const isBuiltin = VOICE_LEADING_PATTERNS.some(p => p.id === patternId);
    if (isBuiltin) {
      // Convert the built-in to a custom override with the new name.
      const base = VOICE_LEADING_PATTERNS.find(p => p.id === patternId)!;
      const overriden = custom.filter(c => c.id !== base.id);
      overriden.push({ ...base, label: trimmed, createdAt: Date.now() });
      await persistCustom(overriden);
    } else {
      await persistCustom(custom.map(c =>
        c.id === patternId ? { ...c, label: trimmed } : c,
      ));
    }

    // Update any existing DrillSkill rows so the heat grid / drill
    // list re-show the new label immediately.
    const matching = skills.filter(s => s.patternId === patternId);
    if (matching.length > 0) {
      await db.transaction('rw', db.drillSkills, async () => {
        for (const s of matching) {
          const keyName = s.keyName ?? '';
          await db.drillSkills.update(s.id, {
            label: `${trimmed} in ${keyName}`,
          });
        }
      });
    }
    setRenamingId(null);
    toast({ message: `Renamed to "${trimmed}".`, variant: 'success' });
  };

  return (
    <div className="space-y-5">
      {allPatterns.map(pattern => {
        // If user renamed a builtin, our custom list carries the
        // override; pick the last matching entry (custom wins).
        const effective = custom.find(c => c.id === pattern.id) ?? pattern;
        const rows = [{
          id: effective.id,
          label: `across 12 keys`,
          descriptorFor: (keyName: string) => ({
            kind: 'voice-leading' as const,
            keyName,
            patternId: effective.id,
          }),
        }];
        return (
          <section
            key={effective.id}
            className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                {renamingId === effective.id ? (
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onBlur={() => saveRename(effective.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                  />
                ) : (
                  <button
                    onClick={() => { setRenamingId(effective.id); setNameDraft(effective.label); }}
                    className="text-sm font-medium hover:text-fluent"
                    title="click to rename"
                  >
                    {effective.label}
                  </button>
                )}
                {effective.description && (
                  <p className="text-xs text-neutral-500 mt-0.5">{effective.description}</p>
                )}
              </div>
              {!pattern.builtin && (
                <button
                  onClick={async () => {
                    if (!confirm(`Remove pattern "${effective.label}"? Existing drill data stays but is hidden from this tab.`)) return;
                    await persistCustom(custom.filter(c => c.id !== pattern.id));
                    toast({ message: 'Custom pattern removed.', variant: 'warning' });
                  }}
                  className="text-neutral-400 hover:text-needswork text-[11px]"
                >
                  remove
                </button>
              )}
            </div>
            <HeatGrid rows={rows} keyList={KEYS} />
          </section>
        );
      })}

      {adding ? (
        <section className="rounded-card border border-fluent/40 bg-fluent/5 p-3 sm:p-5 space-y-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-500 text-xs uppercase tracking-wide">pattern name</span>
            <input
              autoFocus
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="e.g. Stepwise 7-3 connecting"
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-500 text-xs uppercase tracking-wide">short description (optional)</span>
            <input
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={addPattern}
              disabled={newLabel.trim() === ''}
              className={`px-3 py-1.5 rounded-md text-xs font-medium text-white ${
                newLabel.trim() === ''
                  ? 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'
                  : 'bg-fluent hover:opacity-90'
              }`}
            >
              add pattern
            </button>
            <button
              onClick={() => { setAdding(false); setNewLabel(''); setNewDescription(''); }}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs"
            >
              cancel
            </button>
          </div>
        </section>
      ) : (
        <div className="flex justify-center">
          <button
            onClick={() => setAdding(true)}
            className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
          >
            + add voice-leading pattern
          </button>
        </div>
      )}
    </div>
  );
}
