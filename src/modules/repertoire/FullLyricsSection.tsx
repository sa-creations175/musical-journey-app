import { useEffect, useState } from 'react';
import type { Song } from '../../lib/db';

interface Props {
  song: Song;
  onSave: (fullLyrics: string) => Promise<void>;
}

/**
 * Full-song lyrics reference. Collapsible, default collapsed. Shows
 * the whole song as flowing text with [Section] markers so the user
 * can paste from it into section phrase lines below.
 *
 * Read-only while collapsed; click "edit" to swap in a textarea.
 * Seeded content comes from seedSongs.ts; user-added songs start
 * empty and prompt the user to paste their reference.
 */
export default function FullLyricsSection({ song, onSave }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(song.fullLyrics ?? '');

  useEffect(() => {
    setDraft(song.fullLyrics ?? '');
    setEditing(false);
  }, [song.id, song.fullLyrics]);

  const content = song.fullLyrics ?? '';
  const hasContent = content.trim().length > 0;

  const save = async () => {
    await onSave(draft);
    setEditing(false);
  };

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-2 text-sm"
        aria-expanded={expanded}
      >
        <span className="inline-flex items-center gap-2 font-medium">
          <span aria-hidden>📝</span>
          full lyrics
          {!hasContent && (
            <span className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-developing/40 bg-developing/10 text-developing font-normal">
              empty
            </span>
          )}
        </span>
        <span className="text-xs text-neutral-500">
          {expanded ? '▴ hide' : '▸ show'}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-neutral-500">
              a reference for the whole song. paste lines into the lead-sheet sections below as you learn.
            </p>
            {!editing && (
              <button
                onClick={() => { setDraft(content); setEditing(true); }}
                className="text-xs text-neutral-500 hover:text-fluent"
              >
                edit
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-2">
              <textarea
                rows={Math.max(8, Math.min(24, content.split('\n').length + 2))}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={'paste the full lyrics here. use [Section] markers between stanzas if you like.'}
                className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm leading-relaxed font-serif"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={save}
                  className="px-3 py-1.5 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90"
                >
                  save
                </button>
                <button
                  onClick={() => { setDraft(content); setEditing(false); }}
                  className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs"
                >
                  cancel
                </button>
              </div>
            </div>
          ) : hasContent ? (
            <pre className="rounded-md bg-neutral-50 dark:bg-neutral-900/60 p-3 text-sm leading-relaxed whitespace-pre-wrap font-serif">
              {content}
            </pre>
          ) : (
            <p className="text-xs text-neutral-500 italic">
              no full lyrics on file yet. click <em>edit</em> above to paste them in — or leave blank and let the phrase-line editor below
              accumulate lyrics over time.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
