import { useState, type KeyboardEvent } from 'react';
import { tokenizeLyricLines } from './lyricLine';

// Lyric input area (Lead Sheet Redesign step 6, May 2026 —
// docs/LEAD_SHEET_REDESIGN.md). The user pastes a verse here; each
// non-empty text line becomes one `LyricLine`. New lines appear in
// the bar-grid's pending tray at start == end == (0, 0); the user
// drags them onto beat positions from there.
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

  return (
    <div
      key={sectionId}
      className="rounded-md border border-neutral-200 dark:border-neutral-800 p-2 bg-neutral-50/40 dark:bg-neutral-900/40 space-y-2"
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-neutral-500">
        <span>lyric paste</span>
        <span>cmd/ctrl + enter to add</span>
      </div>

      <div className="flex gap-2 items-start">
        <textarea
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
