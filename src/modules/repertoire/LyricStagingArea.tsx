import { useEffect, useState, type KeyboardEvent } from 'react';
import { tokenizeLyricLines } from './lyricLine';

// Lyric input area (Lead Sheet Redesign step 6, May 2026 —
// docs/LEAD_SHEET_REDESIGN.md). The user pastes a verse here; each
// non-empty text line becomes one `LyricLine`. New lines appear in
// the bar-grid's pending tray at start == end == (0, 0); the user
// drags them onto beat positions from there.
//
// Collapsible: collapsed by default so it doesn't claim permanent
// real estate. Collapsed state shows a "+ Add lyrics" link with a
// count badge when the draft holds un-submitted words. Expanding
// reveals the textarea + add button; a chevron collapses it back.
//
// Controlled component: this view holds only the draft text. The
// parent (LeadSheetSection) gets a `onSubmitLines(words[][])` callback
// per paste and is responsible for the section.lyricLines write.

interface Props {
  sectionId: string;
  /** Fires once per paste; one entry per non-empty text line, each
   *  carrying that line's words. Empty paste / whitespace-only paste
   *  fires nothing. */
  onSubmitLines: (lines: string[][]) => void;
}

export default function LyricStagingArea({ sectionId, onSubmitLines }: Props) {
  const [draftText, setDraftText] = useState('');
  const [expanded, setExpanded] = useState(false);

  // Rotating a different section in resets the local UI: collapse and
  // drop any un-submitted draft so a stale staged-word badge doesn't
  // carry across sections.
  useEffect(() => {
    setExpanded(false);
    setDraftText('');
  }, [sectionId]);

  const stagedWordCount = tokenizeLyricLines(draftText).reduce(
    (n, line) => n + line.length,
    0,
  );

  const commitDraft = () => {
    const lines = tokenizeLyricLines(draftText);
    if (lines.length === 0) {
      setDraftText('');
      return;
    }
    onSubmitLines(lines);
    setDraftText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter submits without needing to click; Enter alone
    // inserts a newline since the user is typing a multi-line verse.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commitDraft();
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-fluent"
      >
        + Add lyrics
        {stagedWordCount > 0 && (
          <span className="text-neutral-400">
            · {stagedWordCount} word{stagedWordCount === 1 ? '' : 's'} staged
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-2 bg-neutral-50/40 dark:bg-neutral-900/40 space-y-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-neutral-500">
        <span>lyric paste</span>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">cmd/ctrl + enter to add</span>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="collapse lyric paste"
            title="collapse"
            className="inline-flex items-center gap-1 rounded border border-neutral-300 dark:border-neutral-700 px-1.5 py-0.5 normal-case text-neutral-500 hover:border-fluent hover:text-fluent"
          >
            <span aria-hidden>▴</span> collapse
          </button>
        </div>
      </div>

      <div className="flex gap-2 items-start">
        <textarea
          autoFocus
          value={draftText}
          onChange={e => setDraftText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="paste a verse — one bar grid line per text line"
          rows={3}
          className="flex-1 min-w-0 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs resize-y font-mono"
        />
        <button
          type="button"
          onClick={commitDraft}
          disabled={draftText.trim() === ''}
          className="px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent disabled:opacity-30 disabled:cursor-not-allowed"
        >
          add lines
        </button>
      </div>
    </div>
  );
}
