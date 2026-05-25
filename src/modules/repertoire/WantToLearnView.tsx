import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  type Song,
  type SongSection,
  type WantToLearnEntry,
} from '../../lib/db';
import { DEFAULT_STAGE } from './stage';
import { assignNextLearningOrder } from './seedSongs';
import { useToast } from '../../components/Toaster';
import ConfirmDialog from '../../components/ConfirmDialog';

interface Props {
  onPromoted: (songId: string) => void;
}

type Priority = WantToLearnEntry['priority'];
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const PRIORITY_BADGE: Record<Priority, string> = {
  high: 'border-needswork/40 bg-needswork/10 text-needswork',
  medium: 'border-developing/40 bg-developing/10 text-developing',
  low: 'border-info/40 bg-info/10 text-info',
};
const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

type SortMode = 'priority' | 'recent' | 'title';

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

/**
 * Want-to-Learn backlog. Add entries, edit them inline, promote to
 * active repertoire. Promotion seeds a Song with the backlog's
 * title/artist/description and a default 3-section template so the
 * user lands in a Song Detail view with enough structure to begin
 * learning.
 */
export default function WantToLearnView({ onPromoted }: Props) {
  const entries = useLiveQuery<WantToLearnEntry[]>(
    () => db.wantToLearn.toArray(),
    [],
  ) ?? [];

  const [sort, setSort] = useState<SortMode>('priority');
  const [filterTag, setFilterTag] = useState<string>('');
  const [adding, setAdding] = useState(false);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) for (const t of e.tags) set.add(t);
    return [...set].sort();
  }, [entries]);

  const sorted = useMemo(() => {
    let list = [...entries];
    if (filterTag !== '') list = list.filter(e => e.tags.includes(filterTag));
    switch (sort) {
      case 'priority':
        list.sort((a, b) => {
          const pa = PRIORITY_RANK[a.priority];
          const pb = PRIORITY_RANK[b.priority];
          if (pa !== pb) return pa - pb;
          return b.addedDate - a.addedDate;
        });
        break;
      case 'recent':
        list.sort((a, b) => b.addedDate - a.addedDate);
        break;
      case 'title':
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }
    return list;
  }, [entries, sort, filterTag]);

  const promote = async (entry: WantToLearnEntry) => {
    const now = Date.now();
    const songId = uid('song');
    const learningOrder = await assignNextLearningOrder();
    const song: Song = {
      id: songId,
      title: entry.title,
      artist: entry.artist,
      description: entry.why,
      stage: DEFAULT_STAGE,
      audioLinks: entry.link ? [entry.link] : [],
      youtubeLink: entry.link?.includes('youtube') ? entry.link : undefined,
      spotifyLink: entry.link?.includes('spotify') ? entry.link : undefined,
      addedDate: now,
      learningOrder,
    };
    const sections: SongSection[] = ['Verse', 'Chorus', 'Bridge'].map((name, idx) => ({
      id: uid('section'),
      songId,
      name,
      order: idx,
      lyrics: '',
    }));
    await db.transaction('rw', [db.songs, db.songSections, db.wantToLearn], async () => {
      await db.songs.add(song);
      await db.songSections.bulkAdd(sections);
      await db.wantToLearn.delete(entry.id);
    });
    onPromoted(songId);
  };

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-medium tracking-tight">want to learn</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            songs that haven't made it into active repertoire yet. promote one when you're ready to start.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="px-3 py-1.5 rounded-md border border-fluent text-fluent text-xs font-medium hover:bg-fluent/10"
        >
          + add
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <label className="inline-flex items-center gap-1 text-neutral-500">
          sort:
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortMode)}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1.5 py-0.5"
          >
            <option value="priority">priority</option>
            <option value="recent">recently added</option>
            <option value="title">title A–Z</option>
          </select>
        </label>
        {tags.length > 0 && (
          <label className="inline-flex items-center gap-1 text-neutral-500">
            tag:
            <select
              value={filterTag}
              onChange={e => setFilterTag(e.target.value)}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1.5 py-0.5"
            >
              <option value="">any</option>
              {tags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
      </div>

      {adding && (
        <AddEntryRow
          onCancel={() => setAdding(false)}
          onSaved={() => setAdding(false)}
        />
      )}

      {sorted.length === 0 && !adding ? (
        <p className="text-sm text-neutral-500 italic">
          no backlog entries yet. jot songs here the moment you hear something you want to learn.
        </p>
      ) : (
        <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {sorted.map(e => (
            <EntryRow key={e.id} entry={e} onPromote={() => promote(e)} />
          ))}
        </div>
      )}
    </section>
  );
}

// --- Row components --------------------------------------------------

function AddEntryRow({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [why, setWhy] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [link, setLink] = useState('');
  const [tagsText, setTagsText] = useState('');

  const canSave = title.trim() !== '' && artist.trim() !== '';

  const save = async () => {
    if (!canSave) return;
    await db.wantToLearn.add({
      id: uid('wtl'),
      title: title.trim(),
      artist: artist.trim(),
      why: why.trim() || undefined,
      priority,
      link: link.trim() || undefined,
      tags: tagsText.split(',').map(t => t.trim()).filter(Boolean),
      addedDate: Date.now(),
    });
    onSaved();
  };

  return (
    <div className="rounded-lg border border-fluent/40 bg-fluent/5 p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="title" className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5" />
        <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="artist" className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5" />
      </div>
      <textarea rows={2} value={why} onChange={e => setWhy(e.target.value)} placeholder="why you want to learn it (optional)" className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <label className="inline-flex items-center gap-1 text-neutral-500">
          priority:
          <select value={priority} onChange={e => setPriority(e.target.value as Priority)} className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1.5 py-0.5">
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <input value={link} onChange={e => setLink(e.target.value)} placeholder="recording link (optional)" className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 font-mono text-[11px]" />
        <input value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="tags, comma-separated" className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1" />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={!canSave} className={`px-3 py-1 rounded-md text-xs font-medium text-white ${canSave ? 'bg-fluent hover:opacity-90' : 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'}`}>save</button>
        <button onClick={onCancel} className="px-3 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs">cancel</button>
      </div>
    </div>
  );
}

function EntryRow({ entry, onPromote }: { entry: WantToLearnEntry; onPromote: () => void }) {
  const [editing, setEditing] = useState(false);
  const [whyDraft, setWhyDraft] = useState(entry.why ?? '');
  const [priority, setPriority] = useState<Priority>(entry.priority);
  const [tagsText, setTagsText] = useState(entry.tags.join(', '));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();

  const saveEdits = async () => {
    await db.wantToLearn.update(entry.id, {
      why: whyDraft.trim() || undefined,
      priority,
      tags: tagsText.split(',').map(t => t.trim()).filter(Boolean),
    });
    setEditing(false);
  };

  // Bare entries (no note, no tags, default priority) delete with the
  // toast alone; fuller entries go through the confirm dialog first
  // since they represent actual thought-work the user invested.
  const hasUserContent =
    (entry.why ?? '').trim() !== '' ||
    entry.tags.length > 0 ||
    entry.priority !== 'medium' ||
    (entry.link ?? '').trim() !== '';

  const removeAfterConfirm = async () => {
    const snapshot = entry;
    await db.wantToLearn.delete(entry.id);
    toast({
      message: `Removed "${entry.title}" from want-to-learn.`,
      variant: 'warning',
      action: {
        label: 'Undo',
        onClick: async () => { await db.wantToLearn.add(snapshot); },
      },
    });
  };

  const remove = () => {
    if (hasUserContent) {
      setConfirmDelete(true);
    } else {
      removeAfterConfirm();
    }
  };

  return (
    <div className="py-3 first:pt-0 last:pb-0 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium text-sm">{entry.title}</div>
          <div className="text-xs text-neutral-500">{entry.artist}</div>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className={`rounded-full px-2 py-0.5 border uppercase tracking-wide text-[10px] ${PRIORITY_BADGE[entry.priority]}`}>
            {entry.priority}
          </span>
          {entry.link && (
            <a href={entry.link} target="_blank" rel="noopener noreferrer" className="text-fluent hover:underline">listen ↗</a>
          )}
          <button onClick={() => setEditing(v => !v)} className="text-neutral-500 hover:text-fluent">
            {editing ? 'done' : 'edit'}
          </button>
          <button onClick={onPromote} className="px-2.5 py-1 rounded-md border border-fluent text-fluent text-[11px] font-medium hover:bg-fluent/10">
            promote →
          </button>
          <button onClick={remove} className="text-neutral-400 hover:text-needswork">✕</button>
        </div>
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea rows={2} value={whyDraft} onChange={e => setWhyDraft(e.target.value)} placeholder="why you want to learn it" className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs" />
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <label className="inline-flex items-center gap-1 text-neutral-500">
              priority:
              <select value={priority} onChange={e => setPriority(e.target.value as Priority)} className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1.5 py-0.5">
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <input value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="tags, comma-separated" className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1" />
            <button onClick={saveEdits} className="px-2.5 py-1 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90">save</button>
          </div>
        </div>
      ) : (
        <>
          {entry.why && <p className="text-xs text-neutral-700 dark:text-neutral-200 italic">{entry.why}</p>}
          {entry.tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {entry.tags.map(t => (
                <span key={t} className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-neutral-200 dark:border-neutral-700 text-neutral-500">
                  {t}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={`Remove "${entry.title}" from want-to-learn?`}
        message={
          <>
            <p>This removes the entry and everything you've captured alongside it:</p>
            <ul className="list-disc pl-5 text-xs text-neutral-600 dark:text-neutral-300 space-y-0.5">
              {entry.why && <li>your note ("why this song")</li>}
              {entry.tags.length > 0 && <li>{entry.tags.length} tag{entry.tags.length === 1 ? '' : 's'}</li>}
              {entry.link && <li>the recording link</li>}
              <li>priority + date-added</li>
            </ul>
            <p className="text-xs text-neutral-500">You can still undo from the toast right after, but only for 10 seconds.</p>
          </>
        }
        confirmLabel="Remove entry"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await removeAfterConfirm();
        }}
      />
    </div>
  );
}
