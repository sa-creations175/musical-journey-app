import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/db';
import { canonicalSkillId } from '../../skills/registry';

const ASSOC_MAX = 500;

interface Props {
  progressionId: string;
  /**
   * When true, the textarea is always visible (used on the quiz reveal
   * card). When false, shows a compact preview + ✎ icon; clicking opens
   * the textarea inline, save/cancel/reset collapses back.
   */
  alwaysEditing?: boolean;
}

/**
 * User-editable "my associations" field per progression. Both surfaces
 * (quiz reveal + fluency tracker row) render this component pointed at
 * the same progressionId — useLiveQuery keeps the two views in sync
 * automatically when one edits.
 */
export default function AssociationsEditor({ progressionId, alwaysEditing = false }: Props) {
  const assoc = useLiveQuery(
    () => db.progressionAssociations.get(progressionId),
    [progressionId],
  );
  const savedText = assoc?.text ?? '';
  const [draft, setDraft] = useState(savedText);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(alwaysEditing);

  // Keep the draft in lockstep with the saved value when the user hasn't
  // typed anything in-flight (covers cross-view syncing + progression
  // changes while the panel is mounted).
  useEffect(() => {
    if (!dirty) setDraft(savedText);
  }, [savedText, dirty]);

  // If the caller flips to alwaysEditing (e.g. reveal mounts), make sure
  // we reflect that. Not reversible — collapsing only happens on user
  // action in collapsible mode.
  useEffect(() => {
    if (alwaysEditing) setExpanded(true);
  }, [alwaysEditing]);

  const hasSaved = savedText.length > 0;
  const saveDisabled = !dirty && draft === savedText;

  const save = async () => {
    const text = draft.trim().slice(0, ASSOC_MAX);
    if (text) {
      await db.progressionAssociations.put({
        progressionId,
        text,
        updatedAt: Date.now(),
      });
    } else {
      await db.progressionAssociations.delete(progressionId);
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
    await db.progressionAssociations.delete(progressionId);
    setDraft('');
    setDirty(false);
    if (!alwaysEditing) setExpanded(false);
  };

  // Collapsed preview (fluency tracker rows)
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

  // Expanded / always-editing form
  return (
    <div className="rounded-md border border-fluent/30 bg-fluent/5 p-3 space-y-2">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-fluent font-medium">
          my associations
        </div>
        <div className="text-[11px] text-neutral-500 mt-0.5">
          add your own songs or notes that help you remember this progression
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
            : 'e.g. "the verse of my roommate\'s song" or "Stevie Wonder uses this in everything"'
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
        to={`/harmonic-diary?skill=${encodeURIComponent(canonicalSkillId('chord-progressions', 'item', progressionId))}`}
        className="inline-block text-[11px] text-fluent hover:underline"
      >
        open in Harmonic Diary →
      </Link>
    </div>
  );
}
