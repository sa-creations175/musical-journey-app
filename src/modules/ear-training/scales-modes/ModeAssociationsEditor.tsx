import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/db';
import { canonicalSkillId } from '../../skills/registry';

const ASSOC_MAX = 500;

interface Props {
  modeId: string;
  /** Always-editing mode (used when embedded in a reveal card). */
  alwaysEditing?: boolean;
}

/**
 * Per-mode "my associations" editor, mirroring the progressions version.
 * Both views (reference card + reveal) share state via useLiveQuery on
 * `modeAssociations`, so edits in one surface appear instantly in the
 * other.
 */
export default function ModeAssociationsEditor({ modeId, alwaysEditing = false }: Props) {
  const assoc = useLiveQuery(
    () => db.modeAssociations.get(modeId),
    [modeId],
  );
  const savedText = assoc?.text ?? '';
  const [draft, setDraft] = useState(savedText);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(alwaysEditing);

  useEffect(() => {
    if (!dirty) setDraft(savedText);
  }, [savedText, dirty]);

  useEffect(() => {
    if (alwaysEditing) setExpanded(true);
  }, [alwaysEditing]);

  const hasSaved = savedText.length > 0;
  const saveDisabled = !dirty && draft === savedText;

  const save = async () => {
    const text = draft.trim().slice(0, ASSOC_MAX);
    if (text) {
      await db.modeAssociations.put({ modeId, text, updatedAt: Date.now() });
    } else {
      await db.modeAssociations.delete(modeId);
    }
    setDirty(false);
    if (!alwaysEditing) setExpanded(false);
  };
  const cancel = () => {
    setDraft(savedText);
    setDirty(false);
    if (!alwaysEditing) setExpanded(false);
  };
  const reset = async () => {
    await db.modeAssociations.delete(modeId);
    setDraft('');
    setDirty(false);
    if (!alwaysEditing) setExpanded(false);
  };

  if (!alwaysEditing && !expanded) {
    return (
      <div className="text-xs">
        {hasSaved ? (
          <div className="flex items-start gap-2">
            <span className="italic text-neutral-700 dark:text-neutral-200 flex-1 whitespace-pre-wrap">
              {savedText}
              <span className="not-italic text-neutral-400 ml-1">(your notes)</span>
            </span>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="edit associations"
              title="edit associations"
              className="text-neutral-400 hover:text-fluent shrink-0"
            >
              ✎
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-neutral-400 hover:text-fluent inline-flex items-center gap-1"
          >
            <span>✎</span>
            <span>add my associations</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-fluent/30 bg-fluent/5 p-3 space-y-2">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-fluent font-medium">
          my associations
        </div>
        <div className="text-[11px] text-neutral-500 mt-0.5">
          songs, scenes, or feelings that help you remember this mode
        </div>
      </div>
      {alwaysEditing && hasSaved && !dirty && (
        <div className="text-xs italic text-neutral-700 dark:text-neutral-200 whitespace-pre-wrap">
          {savedText}
          <span className="not-italic text-neutral-400 ml-1">(your notes)</span>
        </div>
      )}
      <textarea
        value={draft}
        onChange={e => { setDraft(e.target.value.slice(0, ASSOC_MAX)); setDirty(true); }}
        rows={3}
        maxLength={ASSOC_MAX}
        placeholder={
          hasSaved
            ? 'edit your note…'
            : 'e.g. "that Tom Misch track feels like this" or "the sound of stepping out of the subway at night"'
        }
        className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs focus:outline-none focus:border-fluent"
      />
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <button
          type="button"
          onClick={save}
          disabled={saveDisabled}
          className={`px-2.5 py-1 rounded-md text-white ${
            saveDisabled
              ? 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'
              : 'bg-fluent hover:opacity-90'
          }`}
        >
          save
        </button>
        <button
          type="button"
          onClick={cancel}
          className="px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700"
        >
          cancel
        </button>
        {hasSaved && (
          <button
            type="button"
            onClick={reset}
            className="px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-needswork hover:border-needswork"
          >
            reset to default
          </button>
        )}
        <span className="ml-auto text-[11px] text-neutral-400 tabular-nums">
          {draft.length}/{ASSOC_MAX}
        </span>
      </div>
      <Link
        to={`/harmonic-diary?skill=${encodeURIComponent(canonicalSkillId('scales-modes', 'mode', modeId))}`}
        className="inline-block text-[11px] text-fluent hover:underline"
      >
        open in Harmonic Diary →
      </Link>
    </div>
  );
}
