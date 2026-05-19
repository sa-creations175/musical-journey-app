import { useEffect, useState, type KeyboardEvent } from 'react';
import { tokenizeLyrics, type StagedLyricToken } from './lyricTokens';

// Lyric staging area (Lead Sheet Redesign step 5, May 2026 —
// docs/LEAD_SHEET_REDESIGN.md). Sits below the bar grid and above
// the phrase editor. The user pastes a line or verse of lyrics, the
// text tokenizes into individual word chips, and the chips wait in
// this staging row until step 6 wires drag-to-beat. Tokens live in
// local React state — no Dexie persistence until they get a position.
//
// State semantics: tokens are scoped to a single section instance and
// reset when the section changes (the `sectionId` key drives the
// useEffect reset). Navigating away and back loses the staging — that
// limitation lifts in step 6 when placed tokens persist.

interface Props {
  sectionId: string;
}

export default function LyricStagingArea({ sectionId }: Props) {
  const [tokens, setTokens] = useState<StagedLyricToken[]>([]);
  const [draftText, setDraftText] = useState('');

  // Reset staged state when a different section rotates in so chips
  // don't bleed from one section's staging to another's.
  useEffect(() => {
    setTokens([]);
    setDraftText('');
  }, [sectionId]);

  const commitDraft = () => {
    const fresh = tokenizeLyrics(draftText);
    if (fresh.length === 0) {
      setDraftText('');
      return;
    }
    setTokens(prev => [...prev, ...fresh]);
    setDraftText('');
  };

  const removeToken = (id: string) => {
    setTokens(prev => prev.filter(t => t.id !== id));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter submits; Shift+Enter inserts a literal newline so a user
    // pasting a multi-line verse can still edit before committing.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitDraft();
    }
  };

  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-2 bg-neutral-50/40 dark:bg-neutral-900/40 space-y-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-neutral-500">
        <span>lyric staging</span>
        <span>
          {tokens.length} token{tokens.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex gap-2 items-start">
        <textarea
          value={draftText}
          onChange={e => setDraftText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="paste a line or verse — Enter to tokenize"
          rows={2}
          className="flex-1 min-w-0 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs resize-y"
        />
        <button
          type="button"
          onClick={commitDraft}
          disabled={draftText.trim() === ''}
          className="px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent disabled:opacity-30 disabled:cursor-not-allowed"
        >
          add
        </button>
      </div>

      {tokens.length === 0 ? (
        <p className="text-[11px] italic text-neutral-500">
          No staged lyrics yet — paste a line above to tokenize.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {tokens.map(token => (
            <LyricChip
              key={token.id}
              token={token}
              onRemove={() => removeToken(token.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LyricChip({
  token,
  onRemove,
}: {
  token: StagedLyricToken;
  onRemove: () => void;
}) {
  // `cursor-grab` hints at draggability; the actual @dnd-kit wiring
  // for drag-to-beat lands in step 6.
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 cursor-grab select-none">
      <span>{token.text}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`remove ${token.text}`}
        className="text-neutral-400 hover:text-needswork leading-none"
      >
        ×
      </button>
    </span>
  );
}
