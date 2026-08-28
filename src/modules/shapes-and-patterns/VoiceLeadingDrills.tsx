import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DrillSkill } from '../../lib/db';
import VoiceLeadingPatternGrid from './VoiceLeadingPatternGrid';
import PracticeTestPanel from './practiceTest/PracticeTestPanel';
import { voiceLeadingSurface } from './practiceTest/makeSurfaces';
import { parseVoiceLeadingItemRef, voiceLeadingSubCellLabel } from './catalog';
import { VOICE_LEADING_PATTERN_BY_ID } from './catalog';
import {
  applyRemove,
  applyRename,
  mergePatternList,
  type CustomPattern,
} from './voiceLeadingPatternList';
import { getPref, setPref } from '../../lib/userPrefs';
import { useToast } from '../../components/Toaster';
import { spellKey, type Spelling } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';

const PREF_CUSTOM_PATTERNS = 'shapesAndPatternsCustomVoiceLeading';

// The list, the override rules and the two writers all live in
// `voiceLeadingPatternList` — pure, and tested there. This file draws
// what that returns.

/**
 * Voice-leading drills: one heat-grid per pattern, spread across 12
 * keys. Users can add custom patterns alongside the three shipped
 * defaults; pattern labels are editable inline.
 */
export default function VoiceLeadingDrills() {
  const [spelling] = useSpelling();
  const [custom, setCustom] = useState<CustomPattern[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [activeDrillItemRef, setActiveDrillItemRef] = useState<string | null>(null);
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

  // MERGED BY ID, NOT CONCATENATED. An override replaces fields on the
  // built-in it names; it never becomes a second section. See the note
  // at the top of `voiceLeadingPatternList`.
  const allPatterns = useMemo(() => mergePatternList(custom), [custom]);

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

    // DELETE ON DEFAULT. A rename back to the shipped name removes the
    // override rather than storing one that says nothing — which is
    // what a stray click on a title, saved on blur, used to leave
    // behind. `null` means there is nothing worth writing.
    const next = applyRename(custom, patternId, trimmed, Date.now());
    if (next !== null) await persistCustom(next);

    // Update any existing DrillSkill rows so the heat grid / drill
    // list re-show the new label immediately.
    const matching = skills.filter(s => s.patternId === patternId);
    if (matching.length > 0) {
      await db.transaction('rw', db.drillSkills, async () => {
        for (const s of matching) {
          const keyName = s.keyName ?? '';
          await db.drillSkills.update(s.id, {
            label: `${trimmed} in ${spellKey(keyName, spelling)}`,
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
        // `pattern` is already the merged result — the override has
        // been applied. There is exactly one entry per id, so this key
        // is unique; it used to collide, because two sections shared
        // an id and both keyed on it.
        const effective = pattern;
        return (
          <section
            key={pattern.id}
            className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-3"
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
              {/* THE SAME LINK, TWO OUTCOMES, because there are two
                  things it can be acting on now that a rename no
                  longer forks a pattern.

                  On a pattern of the reader's own it removes the
                  pattern. On an OVERRIDDEN BUILT-IN it deletes the
                  override, which restores the shipped name — the
                  pattern itself cannot be removed, because it ships.

                  THE WORDING IS UNCHANGED AND IS A SEPARATE CALL.
                  "Remove" is honest for the first and arguably wrong
                  for the second; that is Silas's to decide, so the
                  behaviour moved and the word did not. */}
              {(!pattern.builtin || pattern.overridden) && (
                <button
                  onClick={async () => {
                    const question = pattern.builtin
                      ? `Restore the shipped name for "${effective.label}"?`
                      : `Remove pattern "${effective.label}"? Existing drill data stays but is hidden from this tab.`;
                    if (!confirm(question)) return;
                    await persistCustom(applyRemove(custom, pattern.id));
                    toast({
                      message: pattern.builtin
                        ? 'Shipped name restored.'
                        : 'Custom pattern removed.',
                      variant: 'warning',
                    });
                  }}
                  className="text-neutral-400 hover:text-needswork text-[11px]"
                >
                  Remove
                </button>
              )}
            </div>
            <VoiceLeadingPatternGrid
              patternId={effective.id}
              onCellOpen={pattern.builtin
                ? (itemRef) => setActiveDrillItemRef(itemRef)
                : undefined}
            />
          </section>
        );
      })}

      {activeDrillItemRef && (
        /* NO PICK A SKILL STEP. A voice-leading cell is already one
           skill — pattern, row and key — so the tap opens straight on
           the mode chooser. The sub-cell label is the header's second
           line rather than a step you walk through. */
        <PracticeTestPanel
          surface={voiceLeadingSurface({
            cellLabel: voiceLeadingCellLabel(activeDrillItemRef, spelling),
            skillLabel: voiceLeadingSubCellDescription(activeDrillItemRef),
            itemRef: activeDrillItemRef,
          })}
          onClose={() => setActiveDrillItemRef(null)}
        />
      )}

      {adding ? (
        <section className="rounded-2xl border border-fluent/40 bg-fluent/5 p-3 sm:p-5 space-y-2">
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
              Add Pattern
            </button>
            <button
              onClick={() => { setAdding(false); setNewLabel(''); setNewDescription(''); }}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs"
            >
              Cancel
            </button>
          </div>
        </section>
      ) : (
        <div className="flex justify-center">
          <button
            onClick={() => setAdding(true)}
            className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
          >
            + Add Voice-Leading Pattern
          </button>
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------

/** "Major 2–5–1 in E♭" — the pattern and the key, from the itemRef. */
function voiceLeadingCellLabel(itemRef: string, spelling: Spelling): string {
  const desc = parseVoiceLeadingItemRef(itemRef);
  if (!desc) return 'Voice-leading';
  const pattern = VOICE_LEADING_PATTERN_BY_ID.get(desc.patternId);
  return `${pattern?.label ?? 'Pattern'} in ${spellKey(desc.keyName, spelling)}`;
}

/** The row within the pattern — the starting position or voicing type. */
function voiceLeadingSubCellDescription(itemRef: string): string {
  const desc = parseVoiceLeadingItemRef(itemRef);
  return desc ? voiceLeadingSubCellLabel(desc) : '';
}
