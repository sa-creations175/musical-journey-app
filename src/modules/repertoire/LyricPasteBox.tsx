import { useState, type KeyboardEvent } from 'react';
import { parseLyricSheet } from './lyricSheetParse';
import SectionToggle from './SectionToggle';

/**
 * Paste lyrics in, see how they'll be read, then commit.
 *
 * RAW TEXT, PARSED ONCE. The old path handed up `string[][]` and the
 * parent re-joined it into text to run the header parser — text →
 * words → text → parse, losing the original line breaks and spacing on
 * the way through. This passes the text the user actually typed and
 * parses it exactly once, at commit.
 *
 * THE PREVIEW IS THE POINT. `parseLyricSheet` guesses which lines are
 * section headers, and a guess you only discover after committing is a
 * guess you have to undo. The preview renders those guesses live, so a
 * misread `[Bridge]` is visible before anything is written.
 *
 * Nothing is written until `add lines`.
 */
export default function LyricPasteBox({
  onCommit,
  /* Names the header capability, because nothing else did. Typing a
     section name on its own line has always created a header, and the
     only way to find that out was to stumble into it. */
  label = 'add lyrics or header',
}: {
  /** Receives the raw draft text. Parsing happens in one place, at the
   *  caller's write. */
  onCommit: (text: string) => void | Promise<void>;
  label?: string;
}) {
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);

  const rows = expanded ? parseLyricSheet(draft) : [];
  const wordCount = rows.reduce(
    (n, r) => (r.kind === 'lyric' ? n + r.text.split(/\s+/).filter(Boolean).length : n),
    0,
  );

  const commit = async () => {
    if (draft.trim() === '') {
      setDraft('');
      return;
    }
    await onCommit(draft);
    setDraft('');
    setExpanded(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter commits; plain Enter inserts a newline, since the
    // user is typing a multi-line verse.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void commit();
    }
  };

  if (!expanded) {
    return (
      <SectionToggle
        label={label}
        expanded={false}
        onToggle={() => setExpanded(true)}
        hint={
          draft.trim() !== ''
            ? `${wordCount} word${wordCount === 1 ? '' : 's'} staged`
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      <SectionToggle label={label} expanded onToggle={() => setExpanded(false)} />
      <textarea
        autoFocus
        rows={4}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        /* Shows BOTH header forms. The bracketed one was the only
           example, so the bare form — the one people actually type —
           looked unsupported. */
        placeholder={'paste a verse, one line each\nChorus\n[Verse 2]'}
        className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-[11px]"
      />
      {rows.length > 0 && (
        <div className="space-y-1" data-paste-preview="">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500">
            preview — {rows.filter(r => r.kind === 'lyric').length} lines,{' '}
            {rows.filter(r => r.kind === 'header').length} headers
          </div>
          {/* Deliberately a light-weight echo rather than real rows:
              building committed-shape lines on every keystroke would
              mint ids for text that may never be committed. */}
          {rows.map((r, i) =>
            r.kind === 'header' ? (
              <div
                key={i}
                data-preview-header=""
                className="px-2 py-1 rounded text-[11px] uppercase tracking-wide bg-neutral-200/70 dark:bg-neutral-700/60 text-neutral-600 dark:text-neutral-300"
              >
                {r.text}
              </div>
            ) : (
              <div
                key={i}
                data-preview-lyric=""
                className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[11px] text-neutral-900 dark:text-neutral-100 truncate"
              >
                {r.text}
              </div>
            ),
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void commit()}
          disabled={draft.trim() === ''}
          className="px-2 py-0.5 text-[11px] rounded-full border border-fluent bg-fluent/10 text-fluent hover:bg-fluent/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          add lines
        </button>
        <button
          type="button"
          onClick={() => setDraft('')}
          className="px-2 py-0.5 text-[11px] rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent"
        >
          clear
        </button>
        <span className="text-[10px] text-neutral-400 hidden sm:inline">
          cmd/ctrl + enter
        </span>
      </div>
    </div>
  );
}
