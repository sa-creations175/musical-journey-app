import { useState } from 'react';
import type { Arrangement, Phrase } from '../../lib/db';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import { BASIC_ARRANGEMENT_ID, normalizePhrase, uid } from './beatsModel';

interface Props {
  arrangements: Arrangement[];
  activeId: string;
  compareIds: string[];
  /** Mutating the active arrangement id. */
  onChangeActive: (id: string) => Promise<void>;
  /** Mutating the set of arrangements for comparison. Empty array
   *  means compare mode is off. */
  onChangeCompare: (ids: string[]) => void;
  /** Called when the arrangements list itself changes (add / rename
   *  / duplicate / delete). Caller commits to DB + applies the
   *  phrase-chord mutation if any. */
  onArrangementsChange: (next: Arrangement[]) => Promise<void>;
  /** Required for duplicate / copy-from-current flows. Current phrases
   *  (after normalisation) used to seed a new arrangement's chord
   *  placements by copying from an existing one. */
  phrases: Phrase[];
  /** Save an updated phrase back (used by copy-from-current). */
  onPhraseChange: (phrase: Phrase) => Promise<void>;
}

/**
 * Section-header bar for switching / creating / comparing chord
 * arrangements. Rendered once per section above the phrase list.
 */
export default function ArrangementBar({
  arrangements,
  activeId,
  compareIds,
  onChangeActive,
  onChangeCompare,
  onArrangementsChange,
  phrases,
  onPhraseChange,
}: Props) {
  const [showNew, setShowNew] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Arrangement | null>(null);
  const comparing = compareIds.length > 0;
  const { toast } = useToast();

  const activeArrangement = arrangements.find(a => a.id === activeId) ?? arrangements[0];

  const openRename = (arr: Arrangement) => {
    setRenaming(arr.id);
    setRenameDraft(arr.name);
  };

  const commitRename = async () => {
    if (!renaming) return;
    const trimmed = renameDraft.trim();
    if (trimmed === '') { setRenaming(null); return; }
    const next = arrangements.map(a => (a.id === renaming ? { ...a, name: trimmed } : a));
    await onArrangementsChange(next);
    setRenaming(null);
    toast({ message: `Arrangement renamed to "${trimmed}".`, variant: 'success' });
  };

  const duplicateActive = async () => {
    const source = activeArrangement;
    if (!source) return;
    const newId = uid('arr');
    const newName = `${source.name} (copy)`;
    const next = [...arrangements, { id: newId, name: newName, notes: source.notes }];
    await onArrangementsChange(next);
    // Copy chord placements for every phrase.
    for (const phrase of phrases) {
      const normalised = normalizePhrase(phrase);
      const sourcePlacements = normalised.chordsByArrangement[source.id] ?? {};
      await onPhraseChange({
        ...normalised,
        chordsByArrangement: {
          ...normalised.chordsByArrangement,
          [newId]: { ...sourcePlacements },
        },
      });
    }
    await onChangeActive(newId);
    toast({ message: `Duplicated — now viewing "${newName}".`, variant: 'success' });
  };

  const deleteArrangement = async (arr: Arrangement) => {
    if (arrangements.length <= 1) {
      toast({ message: 'Can\'t delete the last arrangement.', variant: 'warning' });
      return;
    }
    const snapshot = { arrangements, phrases: phrases.map(p => ({ ...normalizePhrase(p) })) };
    // Remove the arrangement from the section list.
    const nextArrangements = arrangements.filter(a => a.id !== arr.id);
    await onArrangementsChange(nextArrangements);
    // Strip chord placements for this arrangement from every phrase.
    for (const phrase of phrases) {
      const normalised = normalizePhrase(phrase);
      const { [arr.id]: _dropped, ...rest } = normalised.chordsByArrangement;
      void _dropped;
      await onPhraseChange({ ...normalised, chordsByArrangement: rest });
    }
    // If the deleted arrangement was active, pick another.
    if (activeId === arr.id) {
      await onChangeActive(nextArrangements[0].id);
    }
    onChangeCompare(compareIds.filter(id => id !== arr.id));
    toast({
      message: `Arrangement deleted: ${arr.name}`,
      variant: 'warning',
      action: {
        label: 'Undo',
        onClick: async () => {
          await onArrangementsChange(snapshot.arrangements);
          for (const phrase of snapshot.phrases) await onPhraseChange(phrase);
          await onChangeActive(arr.id);
        },
      },
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs border-b border-neutral-200 dark:border-neutral-800 pb-2 mb-2">
      <span className="text-neutral-500 uppercase tracking-wide">
        {comparing ? 'comparing:' : 'arrangement:'}
      </span>
      {comparing ? (
        <div className="flex items-center gap-1 flex-wrap">
          {arrangements.map(a => {
            const selected = compareIds.includes(a.id);
            const isActive = a.id === activeId;
            return (
              <button
                key={a.id}
                onClick={() => {
                  if (isActive) return; // active is always in the compare set
                  if (selected) onChangeCompare(compareIds.filter(id => id !== a.id));
                  else onChangeCompare([...compareIds, a.id]);
                }}
                className={`px-2.5 py-1 rounded-md border transition ${
                  isActive
                    ? 'bg-fluent text-white border-fluent cursor-default'
                    : selected
                      ? 'border-fluent/50 text-fluent bg-fluent/10'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
                }`}
                title={isActive ? 'active (always in the compare view)' : selected ? 'click to remove from compare' : 'click to add to compare'}
              >
                {a.name}{isActive ? ' (editing)' : ''}
              </button>
            );
          })}
          <button
            onClick={() => onChangeCompare([])}
            className="ml-1 px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-needswork hover:border-needswork/40"
          >
            exit compare
          </button>
        </div>
      ) : (
        <>
          {renaming ? (
            <input
              autoFocus
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setRenaming(null);
              }}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
            />
          ) : (
            <select
              value={activeId}
              onChange={e => onChangeActive(e.target.value)}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
            >
              {arrangements.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
          {!renaming && activeArrangement && (
            <>
              <button
                onClick={() => openRename(activeArrangement)}
                className="text-neutral-500 hover:text-fluent"
                title="rename this arrangement"
              >
                rename
              </button>
              <button
                onClick={duplicateActive}
                className="text-neutral-500 hover:text-fluent"
                title="duplicate this arrangement"
              >
                duplicate
              </button>
              {activeArrangement.id !== BASIC_ARRANGEMENT_ID && arrangements.length > 1 && (
                <button
                  onClick={() => setConfirmDelete(activeArrangement)}
                  className="text-neutral-500 hover:text-needswork"
                  title="delete this arrangement"
                >
                  delete
                </button>
              )}
            </>
          )}
          <span className="text-neutral-300 dark:text-neutral-700">·</span>
          <button
            onClick={() => setShowNew(true)}
            className="text-neutral-500 hover:text-fluent"
          >
            + new arrangement
          </button>
          {arrangements.length > 1 && (
            <button
              onClick={() => onChangeCompare([activeId, ...arrangements.filter(a => a.id !== activeId).slice(0, 1).map(a => a.id)])}
              className="text-neutral-500 hover:text-fluent"
            >
              compare arrangements
            </button>
          )}
        </>
      )}

      {showNew && (
        <NewArrangementModal
          activeArrangementName={activeArrangement?.name ?? 'Basic'}
          onCancel={() => setShowNew(false)}
          onCreate={async ({ name, copyFromActive }) => {
            const newId = uid('arr');
            const newArr: Arrangement = { id: newId, name };
            const next = [...arrangements, newArr];
            await onArrangementsChange(next);
            if (copyFromActive && activeArrangement) {
              for (const phrase of phrases) {
                const normalised = normalizePhrase(phrase);
                const sourcePlacements = normalised.chordsByArrangement[activeArrangement.id] ?? {};
                await onPhraseChange({
                  ...normalised,
                  chordsByArrangement: {
                    ...normalised.chordsByArrangement,
                    [newId]: { ...sourcePlacements },
                  },
                });
              }
            } else {
              // Ensure every phrase has an empty placements map for
              // the new arrangement so the editor can write into it.
              for (const phrase of phrases) {
                const normalised = normalizePhrase(phrase);
                if (!normalised.chordsByArrangement[newId]) {
                  await onPhraseChange({
                    ...normalised,
                    chordsByArrangement: {
                      ...normalised.chordsByArrangement,
                      [newId]: {},
                    },
                  });
                }
              }
            }
            await onChangeActive(newId);
            setShowNew(false);
            toast({ message: `Arrangement "${name}" created.`, variant: 'success' });
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete arrangement "${confirmDelete?.name ?? ''}"?`}
        message={
          <p>
            Removes this arrangement's chord placements from every phrase in this section.
            The beat structure (words + blanks) is shared and won't change.
          </p>
        }
        confirmLabel="Delete arrangement"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          const arr = confirmDelete;
          setConfirmDelete(null);
          if (arr) await deleteArrangement(arr);
        }}
      />
    </div>
  );
}

// -------------------------------------------------------------------

interface NewArrangementModalProps {
  activeArrangementName: string;
  onCreate: (opts: { name: string; copyFromActive: boolean }) => Promise<void>;
  onCancel: () => void;
}

function NewArrangementModal({
  activeArrangementName,
  onCancel,
  onCreate,
}: NewArrangementModalProps) {
  const [name, setName] = useState('');
  const [copyFromActive, setCopyFromActive] = useState(true);
  const canCreate = name.trim() !== '';
  return (
    <Modal
      open
      onClose={onCancel}
      title="new arrangement"
      description="create a second set of chord placements over the same beat structure."
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            cancel
          </button>
          <button
            onClick={() => canCreate && onCreate({ name: name.trim(), copyFromActive })}
            disabled={!canCreate}
            className={`px-4 py-1.5 rounded-md text-sm font-medium text-white ${
              canCreate ? 'bg-fluent hover:opacity-90' : 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'
            }`}
          >
            create
          </button>
        </div>
      )}
    >
      <div className="space-y-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500 text-xs uppercase tracking-wide">name</span>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. My arrangement, Jazz voicings, Simpler"
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-neutral-500 text-xs uppercase tracking-wide">start from</legend>
          <label className="inline-flex items-start gap-2 cursor-pointer text-sm">
            <input
              type="radio"
              checked={copyFromActive}
              onChange={() => setCopyFromActive(true)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">copy from {activeArrangementName}</span>
              <span className="block text-[11px] text-neutral-500">new arrangement starts with the same chords as the currently-viewed one; edit from there.</span>
            </span>
          </label>
          <label className="inline-flex items-start gap-2 cursor-pointer text-sm">
            <input
              type="radio"
              checked={!copyFromActive}
              onChange={() => setCopyFromActive(false)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">start blank</span>
              <span className="block text-[11px] text-neutral-500">same beats / words, no chord placements yet.</span>
            </span>
          </label>
        </fieldset>
      </div>
    </Modal>
  );
}
