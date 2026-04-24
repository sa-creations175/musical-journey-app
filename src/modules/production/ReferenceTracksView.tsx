import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ReferenceTrack } from '../../lib/db';
import { useToast } from '../../components/Toaster';
import {
  addReferenceTrack,
  archiveReferenceTrack,
  deleteReferenceTrack,
  updateReferenceTrack,
} from './data';

type Filter = 'active' | 'archived';

/**
 * Reference Track Library view. A producer's running notebook of
 * songs to study — each with sonic notes (what to listen for) and
 * free-form tags. Users can add their own tracks, edit any entry,
 * archive the starter ones that don't match their taste, and
 * filter by tag.
 */
export default function ReferenceTracksView() {
  const [filter, setFilter] = useState<Filter>('active');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ReferenceTrack | null>(null);
  const [adding, setAdding] = useState(false);

  const rawTracks = useLiveQuery(
    async () => db.referenceTracks.toArray(),
    [],
  );
  const tracks = useMemo(() => rawTracks ?? [], [rawTracks]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const t of tracks) for (const tag of t.tags) s.add(tag);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [tracks]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tracks
      .filter(t => (filter === 'archived' ? t.archived : !t.archived))
      .filter(t => (tagFilter ? t.tags.includes(tagFilter) : true))
      .filter(t => {
        if (!q) return true;
        return (
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.genre.toLowerCase().includes(q) ||
          t.sonicNotes.toLowerCase().includes(q) ||
          t.tags.some(tag => tag.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.addedAt - a.addedAt);
  }, [tracks, filter, tagFilter, query]);

  return (
    <div className="space-y-4 max-w-4xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-medium tracking-tight">Reference Track Library</h1>
        <p className="text-sm text-neutral-500">
          The songs you study when you want to hear what great sounds like. Add your own, edit the seeds, mark the ones you've outgrown.
        </p>
      </header>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="search title, artist, genre, notes, tags…"
          className="flex-1 min-w-[220px] rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm"
        />
        <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
          {(['active', 'archived'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded transition ${
                filter === f
                  ? 'bg-production text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAdding(true)}
          className="px-3 py-1.5 rounded-md bg-production text-white text-sm font-medium hover:opacity-90"
        >
          + add track
        </button>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 pr-1">tags</span>
          <button
            onClick={() => setTagFilter(null)}
            className={`px-2 py-0.5 rounded-full text-[11px] border ${
              tagFilter === null
                ? 'bg-production text-white border-production'
                : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-production/60'
            }`}
          >
            all
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setTagFilter(tag === tagFilter ? null : tag)}
              className={`px-2 py-0.5 rounded-full text-[11px] border ${
                tag === tagFilter
                  ? 'bg-production text-white border-production'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-production/60'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-neutral-500 italic">
          {filter === 'archived'
            ? 'no archived tracks yet.'
            : query || tagFilter
              ? 'no tracks match these filters.'
              : 'no reference tracks yet. add one to get started.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(t => (
            <li
              key={t.id}
              className="rounded-card border border-neutral-200 dark:border-neutral-800 p-4 space-y-2"
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {t.title}
                    <span className="text-neutral-500 font-normal"> — {t.artist}</span>
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">
                    {t.genre}
                    {t.isStarter && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-production/70">starter</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEditing(t)}
                    className="text-[11px] px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-production hover:border-production/60"
                  >
                    edit
                  </button>
                  <button
                    onClick={() => archiveReferenceTrack(t.id, !t.archived)}
                    className="text-[11px] px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                  >
                    {t.archived ? 'unarchive' : 'archive'}
                  </button>
                </div>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {t.sonicNotes}
              </p>
              {t.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {t.tags.map(tag => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-0.5 rounded-full border border-production/30 text-production/80"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {(editing || adding) && (
        <TrackEditor
          existing={editing ?? undefined}
          onClose={() => { setEditing(null); setAdding(false); }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------

interface EditorProps {
  existing?: ReferenceTrack;
  onClose: () => void;
}

function TrackEditor({ existing, onClose }: EditorProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [artist, setArtist] = useState(existing?.artist ?? '');
  const [genre, setGenre] = useState(existing?.genre ?? '');
  const [sonicNotes, setSonicNotes] = useState(existing?.sonicNotes ?? '');
  const [tagsInput, setTagsInput] = useState(existing?.tags.join(', ') ?? '');

  const parseTags = (raw: string) =>
    raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const save = async () => {
    if (!title.trim() || !artist.trim()) {
      toast({ message: 'title and artist are required.', variant: 'warning', duration: 1600 });
      return;
    }
    const tags = parseTags(tagsInput);
    if (existing) {
      await updateReferenceTrack(existing.id, {
        title: title.trim(),
        artist: artist.trim(),
        genre: genre.trim(),
        sonicNotes: sonicNotes.trim(),
        tags,
      });
      toast({ message: 'track updated.', variant: 'success', duration: 1400 });
    } else {
      await addReferenceTrack({
        title: title.trim(),
        artist: artist.trim(),
        genre: genre.trim(),
        sonicNotes: sonicNotes.trim(),
        tags,
      });
      toast({ message: 'track added.', variant: 'success', duration: 1400 });
    }
    onClose();
  };

  const destroy = async () => {
    if (!existing) return;
    if (!window.confirm(`Delete "${existing.title}"? This can't be undone.`)) return;
    await deleteReferenceTrack(existing.id);
    toast({ message: 'track deleted.', variant: 'warning', duration: 1400 });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium">
          {existing ? 'Edit reference track' : 'Add reference track'}
        </h3>
        <div className="space-y-2">
          <Field label="title">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="artist">
            <input
              value={artist}
              onChange={e => setArtist(e.target.value)}
              className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="genre">
            <input
              value={genre}
              onChange={e => setGenre(e.target.value)}
              placeholder="e.g. neo-soul, gospel, R&B ballad"
              className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="sonic notes">
            <textarea
              value={sonicNotes}
              onChange={e => setSonicNotes(e.target.value)}
              rows={5}
              placeholder="What should a producer listen for? Vocal chain, reverb, drums, arrangement — whatever stands out."
              className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm leading-relaxed"
            />
          </Field>
          <Field label="tags (comma-separated)">
            <input
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              placeholder="vocal-compression, plate-reverb, gospel"
              className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
            />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <div>
            {existing && (
              <button
                onClick={destroy}
                className="text-[11px] px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-needswork hover:border-needswork"
              >
                delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
            >
              cancel
            </button>
            <button
              onClick={save}
              className="px-3 py-1.5 rounded-md bg-production text-white text-sm font-medium hover:opacity-90"
            >
              save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5">{label}</span>
      {children}
    </label>
  );
}
