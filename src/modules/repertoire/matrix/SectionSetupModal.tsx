import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../../../components/Modal';
import { db, type Song, type SongCell, type SongKey, type SongMatrixSection } from '../../../lib/db';

/**
 * Section setup flow for a song's first matrix open. Per
 * SONG_PROGRESSION_DESIGN_3.md "Section setup":
 *
 *   - Suggested chips (Intro / Verse / Pre-chorus / Chorus / Bridge
 *     / Outro / Coda) — tapping always adds a new draft of that
 *     name. Multiple taps = multiple drafts (so a song with two
 *     verses can be set up by tapping Verse twice; the user can
 *     then rename each via click-to-edit if they want "Verse 1" /
 *     "Verse 2"). The chip's ✓/+ state reflects whether at least
 *     one draft of that name exists; removal is via the × on each
 *     draft row, never via the chip itself.
 *   - Free-text field for custom names — always adds, never
 *     deduplicates
 *   - Up/down arrows to reorder
 *   - Click-to-edit on each draft name (Enter/blur commits, Esc
 *     cancels)
 *   - Remove (×) per draft
 *
 * On confirm, sections + cells are created in a single Dexie
 * transaction so we never end up with sections without cells (or
 * vice versa). Cells are created for every existing songKey row
 * for the song — in step 3b that's just the original key (one row);
 * step 3c will add cells for any extra keys the user adds via the
 * cross-key follow-up.
 *
 * Cell ids follow `cell-{keyId}-{sectionId}` deterministically so a
 * future flow that adds keys to existing sections (or vice versa)
 * can run a transactional bulkPut without risking duplicates.
 */

const SUGGESTED_CHIPS: ReadonlyArray<string> = [
  'Intro', 'Verse', 'Pre-chorus', 'Chorus', 'Bridge', 'Outro', 'Coda',
];

interface SectionDraft {
  draftId: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  song: Song;
  /** Existing songKeys for this song — cells get created for each
   *  on confirm. In step 3b this is typically one (the original
   *  key from migration); step 3c adds more. */
  songKeys: ReadonlyArray<SongKey>;
}

export default function SectionSetupModal({ open, onClose, song, songKeys }: Props) {
  const [drafts, setDrafts] = useState<SectionDraft[]>([]);
  const [customName, setCustomName] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset internal state on close (Cancel, X, Esc, post-confirm),
  // not on open. Funnel every close path through `handleClose` so a
  // subsequent reopen always sees a clean slate without needing a
  // setState-in-effect (which the cascading-renders lint rule
  // forbids — same reason we settled this pattern in
  // SectionSetupModal's sibling components in earlier sub-phases).
  //
  // useCallback is load-bearing here: Modal.tsx's focus-handling
  // useEffect lists `onClose` in its deps, so an unstable
  // handleClose reference re-fires that effect on every keystroke
  // and steals focus from whichever input the user is typing in.
  // The parent must also pass a stable onClose for this to hold
  // (see closeSetup in SongMatrixView).
  const handleClose = useCallback(() => {
    setDrafts([]);
    setCustomName('');
    setEditingIndex(null);
    setEditingValue('');
    setBusy(false);
    onClose();
  }, [onClose]);

  const draftNames = new Set(drafts.map(d => d.name));

  const addChip = (name: string) => {
    // Always-add behavior: each chip tap appends a new draft with
    // this exact name. Removal is via the × button on each draft
    // row. Lets the user pick "Verse" twice for a song with two
    // verses, then rename each draft if they want "Verse 1" /
    // "Verse 2". Functional updater so rapid double-taps batch
    // correctly.
    setDrafts(prev => [...prev, { draftId: makeDraftId(), name }]);
  };

  const addCustom = () => {
    const trimmed = customName.trim();
    if (trimmed === '') return;
    setDrafts([...drafts, { draftId: makeDraftId(), name: trimmed }]);
    setCustomName('');
  };

  const removeAt = (index: number) => {
    setDrafts(drafts.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditingValue('');
    }
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...drafts];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setDrafts(next);
  };

  const moveDown = (index: number) => {
    if (index === drafts.length - 1) return;
    const next = [...drafts];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setDrafts(next);
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditingValue(drafts[index].name);
  };

  const commitEdit = () => {
    if (editingIndex === null) return;
    const trimmed = editingValue.trim();
    if (trimmed === '') {
      // Empty rename → treat as cancel; preserves the original
      // name rather than producing an empty section.
      setEditingIndex(null);
      setEditingValue('');
      return;
    }
    setDrafts(drafts.map((d, i) => i === editingIndex ? { ...d, name: trimmed } : d));
    setEditingIndex(null);
    setEditingValue('');
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingValue('');
  };

  const handleConfirm = async () => {
    if (drafts.length === 0 || busy) return;
    setBusy(true);
    try {
      const now = Date.now();
      const sectionRows: SongMatrixSection[] = drafts.map((d, i) => ({
        id: makeId('section'),
        songId: song.id,
        name: d.name,
        displayOrder: i,
        isArchived: false,
        splitFromSectionId: null,
        createdAt: now,
        updatedAt: now,
      }));

      const cellRows: SongCell[] = [];
      for (const section of sectionRows) {
        for (const key of songKeys) {
          cellRows.push({
            id: `cell-${key.id}-${section.id}`,
            songId: song.id,
            sectionId: section.id,
            songKeyId: key.id,
            cellState: 'empty',
            comfortableAt: null,
            consecutiveCleanCount: 0,
            lastRunAt: null,
            lastRunWasClean: null,
            notes: null,
            lastEngagedAt: null,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      // Atomic write: sections and their cells either both land or
      // neither does. Avoids the half-state where the matrix UI sees
      // sections without their corresponding cells (which would
      // render the cells region empty even for the original key).
      await db.transaction('rw', [db.songMatrixSections, db.songCells], async () => {
        await db.songMatrixSections.bulkPut(sectionRows);
        await db.songCells.bulkPut(cellRows);
      });

      handleClose();
    } catch (err) {
      console.warn('[matrix] section setup save failed', err);
      setBusy(false);
    }
  };

  const canConfirm = drafts.length > 0 && !busy;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Set up sections — ${song.title}`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 text-sm rounded-md text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
            className="px-3 py-1.5 text-sm rounded-md bg-fluent text-white hover:bg-fluent/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {drafts.length === 0
              ? 'Add at least one section'
              : `Confirm — create ${drafts.length} section${drafts.length === 1 ? '' : 's'}`}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <ChipRow
          chips={SUGGESTED_CHIPS}
          selectedNames={draftNames}
          onAdd={addChip}
        />

        <CustomNameInput
          value={customName}
          onChange={setCustomName}
          onAdd={addCustom}
        />

        <DraftList
          drafts={drafts}
          editingIndex={editingIndex}
          editingValue={editingValue}
          setEditingValue={setEditingValue}
          onStartEdit={startEditing}
          onCommitEdit={commitEdit}
          onCancelEdit={cancelEdit}
          onMoveUp={moveUp}
          onMoveDown={moveDown}
          onRemove={removeAt}
        />
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------------

function ChipRow({
  chips,
  selectedNames,
  onAdd,
}: {
  chips: ReadonlyArray<string>;
  selectedNames: ReadonlySet<string>;
  onAdd: (name: string) => void;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
        Pick from common sections
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(name => {
          const selected = selectedNames.has(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => onAdd(name)}
              className={[
                'text-xs px-2.5 py-1 rounded-md border transition',
                selected
                  ? 'border-fluent bg-fluent/10 text-fluent'
                  : 'border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent/60',
              ].join(' ')}
            >
              {selected ? '✓ ' : '+ '}{name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------

function CustomNameInput({
  value,
  onChange,
  onAdd,
}: {
  value: string;
  onChange: (next: string) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
        Or type a custom name
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="e.g. Verse 1, Tag, Vamp…"
          className="flex-1 px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-fluent/40"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={value.trim() === ''}
          className="px-3 py-2 text-sm rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------

function DraftList({
  drafts,
  editingIndex,
  editingValue,
  setEditingValue,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  drafts: SectionDraft[];
  editingIndex: number | null;
  editingValue: string;
  setEditingValue: (next: string) => void;
  onStartEdit: (index: number) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  if (drafts.length === 0) {
    return (
      <div className="text-xs text-neutral-500 italic">
        No sections yet. Pick a chip above or type a custom name.
      </div>
    );
  }
  return (
    <div>
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
        Sections so far ({drafts.length})
      </div>
      <ul className="flex flex-col gap-1 rounded-md border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
        {drafts.map((draft, index) => (
          <DraftRow
            key={draft.draftId}
            draft={draft}
            index={index}
            isFirst={index === 0}
            isLast={index === drafts.length - 1}
            isEditing={editingIndex === index}
            editingValue={editingValue}
            setEditingValue={setEditingValue}
            onStartEdit={onStartEdit}
            onCommitEdit={onCommitEdit}
            onCancelEdit={onCancelEdit}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </div>
  );
}

function DraftRow({
  draft,
  index,
  isFirst,
  isLast,
  isEditing,
  editingValue,
  setEditingValue,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  draft: SectionDraft;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isEditing: boolean;
  editingValue: string;
  setEditingValue: (next: string) => void;
  onStartEdit: (index: number) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus + select-all when entering edit mode for this row.
  // Cuts the typing-to-rename motion to two interactions: click,
  // type. Without this the user would have to click the name AND
  // tab/click-into the input.
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <li className="flex items-center gap-1 px-2 py-1.5">
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => onMoveUp(index)}
          disabled={isFirst}
          aria-label="Move up"
          className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed leading-none px-1"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => onMoveDown(index)}
          disabled={isLast}
          aria-label="Move down"
          className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed leading-none px-1"
        >
          ▼
        </button>
      </div>
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editingValue}
            onChange={e => setEditingValue(e.target.value)}
            onBlur={onCommitEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onCommitEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancelEdit();
              }
            }}
            className="w-full px-2 py-1 rounded border border-fluent/60 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-fluent/40"
          />
        ) : (
          <button
            type="button"
            onClick={() => onStartEdit(index)}
            className="w-full text-left px-2 py-1 text-sm text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 rounded truncate"
            title="Click to rename"
          >
            {draft.name}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(index)}
        aria-label={`Remove ${draft.name}`}
        className="text-neutral-400 hover:text-needswork px-2 leading-none"
      >
        ×
      </button>
    </li>
  );
}

// -------------------------------------------------------------------

function makeDraftId(): string {
  return `draft-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}
