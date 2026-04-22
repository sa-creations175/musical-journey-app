import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/db';

const MAX = 280;

interface Props {
  /** Composite key — see intervalDescriptionKey() (e.g. "minor-3rd-ascending"). */
  intervalKey: string;
  /** Claude's starter text. Pre-populates the textarea the first time
      a user opens the editor, and is restored when they reset. */
  defaultText: string;
}

/**
 * Per-interval-quality + direction user description. Collapsed by
 * default — shows a compact preview of whatever is currently in effect
 * (either the user's saved text or Claude's default) with an ✎ affordance
 * that expands an inline edit form. Mirrors the interaction model used
 * by AssociationsEditor so it feels familiar across the module.
 */
export default function IntervalDescriptionEditor({ intervalKey, defaultText }: Props) {
  const saved = useLiveQuery(
    () => db.intervalDescriptions.get(intervalKey),
    [intervalKey],
  );
  const userText = saved?.text;
  const hasUserText = typeof userText === 'string' && userText.length > 0;
  const effective = hasUserText ? userText! : defaultText;

  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(effective);
  const [dirty, setDirty] = useState(false);

  // Keep the draft in lockstep with the source-of-truth text when the
  // user hasn't typed anything yet — covers cross-interval rotation
  // while the component stays mounted.
  useEffect(() => {
    if (!dirty) setDraft(effective);
  }, [effective, dirty, intervalKey]);

  // Collapse when the user rotates to a different interval so the new
  // description isn't dropped into an edit state mid-stream.
  useEffect(() => {
    setExpanded(false);
    setDirty(false);
  }, [intervalKey]);

  const save = async () => {
    const text = draft.trim().slice(0, MAX);
    if (text === '' || text === defaultText) {
      await db.intervalDescriptions.delete(intervalKey);
    } else {
      await db.intervalDescriptions.put({ intervalKey, text, updatedAt: Date.now() });
    }
    setDirty(false);
    setExpanded(false);
  };
  const cancel = () => {
    setDraft(effective);
    setDirty(false);
    setExpanded(false);
  };
  const reset = async () => {
    await db.intervalDescriptions.delete(intervalKey);
    setDraft(defaultText);
    setDirty(false);
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <div className="text-xs flex items-start gap-2">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500 mt-0.5">
          my description
        </span>
        <span className="flex-1 whitespace-pre-wrap text-neutral-700 dark:text-neutral-200">
          {effective}
          {!hasUserText && (
            <span className="ml-1 text-neutral-400 italic">(claude's default)</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="edit description"
          title="edit description"
          className="text-neutral-400 hover:text-fluent shrink-0"
        >
          ✎
        </button>
      </div>
    );
  }

  const saveDisabled = !dirty || draft.trim() === effective;

  return (
    <div className="rounded-md border border-fluent/30 bg-fluent/5 p-3 space-y-2">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-fluent font-medium">
          my description
        </div>
        <div className="text-[11px] text-neutral-500 mt-0.5">
          your personal take on how this interval feels — applies everywhere this interval shows up
        </div>
      </div>
      <textarea
        value={draft}
        onChange={e => { setDraft(e.target.value.slice(0, MAX)); setDirty(true); }}
        rows={2}
        maxLength={MAX}
        placeholder={defaultText}
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
        {hasUserText && (
          <button
            type="button"
            onClick={reset}
            className="px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-needswork hover:border-needswork"
          >
            reset to default
          </button>
        )}
        <span className="ml-auto text-[11px] text-neutral-400 tabular-nums">
          {draft.length}/{MAX}
        </span>
      </div>
    </div>
  );
}
