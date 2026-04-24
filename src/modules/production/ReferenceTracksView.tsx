import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ReferenceTrack } from '../../lib/db';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import TagPicker from '../skills/TagPicker';
import {
  generateReferenceTracks,
  getApiKey,
  type GeneratedTrack,
} from '../../lib/claudeClient';
import {
  addReferenceTrack,
  archiveReferenceTrack,
  deleteReferenceTrack,
  updateReferenceTrack,
} from './data';

type Filter = 'active' | 'archived';

/**
 * Reference Track Library view. A producer's running notebook of
 * songs to study — each with guided-listening prompts, personal
 * notes, and optional Spotify / YouTube links. Two ways to add:
 * manual entry or Claude-powered generation from a genre prompt.
 */
export default function ReferenceTracksView() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('active');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ReferenceTrack | null>(null);
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ReferenceTrack | null>(null);

  const rawTracks = useLiveQuery(async () => db.referenceTracks.toArray(), []);
  const tracks = useMemo(() => rawTracks ?? [], [rawTracks]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const t of tracks) for (const tag of t.tags) s.add(tag);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [tracks]);

  const allGenres = useMemo(() => {
    const s = new Set<string>();
    for (const t of tracks) if (t.genre.trim()) s.add(t.genre.trim());
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
          (t.whatToListenFor ?? '').toLowerCase().includes(q) ||
          (t.myListeningNotes ?? '').toLowerCase().includes(q) ||
          t.tags.some(tag => tag.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.addedAt - a.addedAt);
  }, [tracks, filter, tagFilter, query]);

  const performDelete = async (track: ReferenceTrack) => {
    const snapshot: ReferenceTrack = { ...track, tags: [...track.tags] };
    await deleteReferenceTrack(track.id);
    toast({
      message: `Track removed.`,
      variant: 'warning',
      action: {
        label: 'Undo',
        onClick: async () => { await db.referenceTracks.add(snapshot); },
      },
      duration: 5000,
    });
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-medium tracking-tight">Reference Track Library</h1>
        <p className="text-sm text-neutral-500">
          The songs you study when you want to hear what great sounds like. Add your own, generate by style, and grow your listening notes over time.
        </p>
      </header>

      {/* Primary actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setAdding(true)}
          className="px-4 py-2 rounded-md bg-production text-white text-sm font-medium hover:opacity-90 shadow-sm"
        >
          + Add Track
        </button>
        <button
          onClick={() => setGenerating(true)}
          className="px-4 py-2 rounded-md border border-production text-production text-sm font-medium hover:bg-production/5"
        >
          + Generate Tracks from Genre
        </button>
      </div>

      {/* Filters */}
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
            <TrackRow
              key={t.id}
              track={t}
              onEdit={() => setEditing(t)}
              onArchive={() => archiveReferenceTrack(t.id, !t.archived)}
              onDelete={() => setConfirmDelete(t)}
            />
          ))}
        </ul>
      )}

      {(adding || editing !== null) && (
        <TrackEditorModal
          key={editing?.id ?? 'new'}
          existing={editing ?? undefined}
          genres={allGenres}
          onClose={() => { setEditing(null); setAdding(false); }}
        />
      )}

      {generating && (
        <GenerateTracksModal
          onClose={() => setGenerating(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remove reference track?"
        message={(
          <p>
            Remove <strong>{confirmDelete?.title}</strong> from your Reference Track Library? This can be undone from the toast that appears after you confirm.
          </p>
        )}
        confirmLabel="Remove"
        onConfirm={async () => {
          const t = confirmDelete;
          setConfirmDelete(null);
          if (t) await performDelete(t);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// -------------------------------------------------------------------

interface RowProps {
  track: ReferenceTrack;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function TrackRow({ track, onEdit, onArchive, onDelete }: RowProps) {
  return (
    <li className="rounded-card border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {track.title}
            <span className="text-neutral-500 font-normal"> — {track.artist}</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
            <span>{track.genre}</span>
            {track.source === 'starter' || track.isStarter ? (
              <span className="text-[10px] uppercase tracking-wide text-production/70">starter</span>
            ) : track.source === 'generated' ? (
              <span className="text-[10px] uppercase tracking-wide text-production/70">generated</span>
            ) : null}
            {(track.spotifyLink || track.youtubeLink) && (
              <span className="inline-flex items-center gap-1.5">
                {track.spotifyLink && (
                  <a
                    href={track.spotifyLink}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label="open in Spotify"
                    title="Spotify"
                    className="text-neutral-400 hover:text-[#1db954]"
                  >
                    <SpotifyIcon />
                  </a>
                )}
                {track.youtubeLink && (
                  <a
                    href={track.youtubeLink}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label="open on YouTube"
                    title="YouTube"
                    className="text-neutral-400 hover:text-[#ff0000]"
                  >
                    <YouTubeIcon />
                  </a>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="text-[11px] px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-production hover:border-production/60"
          >
            edit
          </button>
          <button
            onClick={onArchive}
            className="text-[11px] px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            {track.archived ? 'unarchive' : 'archive'}
          </button>
          <button
            onClick={onDelete}
            className="text-[11px] px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-needswork hover:border-needswork"
          >
            delete
          </button>
        </div>
      </div>
      {track.whatToListenFor && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5">what to listen for</div>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
            {track.whatToListenFor}
          </p>
        </div>
      )}
      {track.myListeningNotes && track.myListeningNotes.trim() !== '' && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-production/70 mb-0.5">my listening notes</div>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed italic">
            {track.myListeningNotes}
          </p>
        </div>
      )}
      {track.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {track.tags.map(tag => (
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
  );
}

// -------------------------------------------------------------------

interface EditorProps {
  existing?: ReferenceTrack;
  genres: string[];
  onClose: () => void;
}

function TrackEditorModal({ existing, genres, onClose }: EditorProps) {
  const { toast } = useToast();

  const [title, setTitle] = useState(existing?.title ?? '');
  const [artist, setArtist] = useState(existing?.artist ?? '');
  const [genre, setGenre] = useState(existing?.genre ?? '');
  const [whatToListenFor, setWhatToListenFor] = useState(
    existing?.whatToListenFor ?? existing?.sonicNotes ?? '',
  );
  const [myListeningNotes, setMyListeningNotes] = useState(existing?.myListeningNotes ?? '');
  const [spotifyLink, setSpotifyLink] = useState(existing?.spotifyLink ?? '');
  const [youtubeLink, setYoutubeLink] = useState(existing?.youtubeLink ?? '');
  const [tags, setTags] = useState<string[]>(existing ? [...existing.tags] : []);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    if (!title.trim() || !artist.trim()) {
      toast({ message: 'title and artist are required.', variant: 'warning', duration: 1600 });
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await updateReferenceTrack(existing.id, {
          title: title.trim(),
          artist: artist.trim(),
          genre: genre.trim(),
          whatToListenFor: whatToListenFor.trim(),
          myListeningNotes: myListeningNotes.trim(),
          spotifyLink: spotifyLink.trim() || undefined,
          youtubeLink: youtubeLink.trim() || undefined,
          tags,
        });
        toast({ message: 'Track updated.', variant: 'success', duration: 1400 });
      } else {
        await addReferenceTrack({
          title: title.trim(),
          artist: artist.trim(),
          genre: genre.trim(),
          whatToListenFor: whatToListenFor.trim(),
          myListeningNotes: myListeningNotes.trim(),
          spotifyLink: spotifyLink.trim() || undefined,
          youtubeLink: youtubeLink.trim() || undefined,
          tags,
          source: 'user',
        });
        toast({ message: 'Track added.', variant: 'success', duration: 1400 });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? 'Edit reference track' : 'Add reference track'}
      description={existing ? 'update notes, genre, or tags' : 'a new song to study'}
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 rounded-md bg-production text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    >
      <div className="space-y-3">
        <Field label="title">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            data-autofocus
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
            list="ref-genre-options"
            className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
          />
          <datalist id="ref-genre-options">
            {genres.map(g => <option key={g} value={g} />)}
          </datalist>
        </Field>
        <Field label="what to listen for">
          <textarea
            value={whatToListenFor}
            onChange={e => setWhatToListenFor(e.target.value)}
            rows={5}
            placeholder="Guided listening. What should a producer notice? Balance, space, arrangement contrast, how voices blend. Avoid guessing at specific gear or ratios."
            className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm leading-relaxed"
          />
        </Field>
        <Field label="my listening notes">
          <textarea
            value={myListeningNotes}
            onChange={e => setMyListeningNotes(e.target.value)}
            rows={4}
            placeholder="Your own observations. Grows over time as you listen while studying specific lessons."
            className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm leading-relaxed"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="spotify link">
            <input
              value={spotifyLink}
              onChange={e => setSpotifyLink(e.target.value)}
              placeholder="https://open.spotify.com/…"
              className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="youtube link">
            <input
              value={youtubeLink}
              onChange={e => setYoutubeLink(e.target.value)}
              placeholder="https://www.youtube.com/…"
              className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
            />
          </Field>
        </div>
        <Field label="tags">
          <TagChipEditor
            tags={tags}
            onChange={setTags}
          />
        </Field>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------------

/**
 * Editable list of tag chips + a typeahead picker for adding more.
 * Kept as its own component so remove-by-index is a pure local
 * operation — the X button's onClick captures the chip's index via
 * a stable closure, eliminating the earlier "clicking X removes
 * multiple tags" bug caused by matching on tag-value equality.
 */
function TagChipEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  const removeAt = (idx: number) => {
    const next = tags.slice();
    next.splice(idx, 1);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, idx) => (
            <span
              key={`${tag}-${idx}`}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-production/30 text-production/80 bg-production/5"
            >
              {tag}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  removeAt(idx);
                }}
                aria-label={`remove ${tag}`}
                className="text-production/60 hover:text-needswork leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <TagPicker
        existing={tags}
        onAdd={tag => { if (!tags.includes(tag)) onChange([...tags, tag]); }}
        placeholder="search existing tags or type a new one…"
      />
    </div>
  );
}

// -------------------------------------------------------------------

interface GenerateProps {
  onClose: () => void;
}

interface PreviewTrack extends GeneratedTrack {
  uid: string;
  selected: boolean;
}

/**
 * "Generate tracks from genre" flow. Takes a free-form style prompt,
 * calls Claude, shows each suggestion with a checkbox + editable
 * fields, then adds the selected set to the library tagged as
 * `source: 'generated'` for provenance.
 */
function GenerateTracksModal({ onClose }: GenerateProps) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewTrack[] | null>(null);
  const [saving, setSaving] = useState(false);

  const EXAMPLES = [
    '90s R&B ballads produced by Babyface',
    'Modern indie R&B in the H.E.R. vein',
    'Classic gospel choir arrangements',
    'Dilla-era soulful hip-hop',
  ];

  const generate = async () => {
    setError(null);
    setLoading(true);
    try {
      const key = await getApiKey();
      if (!key) {
        setError('No Anthropic API key configured. Open Settings → API key to add one.');
        setLoading(false);
        return;
      }
      const result = await generateReferenceTracks(prompt);
      setPreview(
        result.tracks.map(t => ({
          ...t,
          uid: `gen-${Math.random().toString(36).slice(2, 8)}`,
          selected: true,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const patchPreview = (uid: string, patch: Partial<PreviewTrack>) => {
    setPreview(prev => prev?.map(p => (p.uid === uid ? { ...p, ...patch } : p)) ?? prev);
  };

  const saveSelected = async () => {
    if (!preview) return;
    const chosen = preview.filter(p => p.selected);
    if (chosen.length === 0) {
      toast({ message: 'Select at least one track to add.', variant: 'warning', duration: 1600 });
      return;
    }
    setSaving(true);
    try {
      for (const t of chosen) {
        await addReferenceTrack({
          title: t.title.trim(),
          artist: t.artist.trim(),
          genre: t.genre.trim(),
          whatToListenFor: t.whatToListenFor.trim(),
          myListeningNotes: '',
          spotifyLink: t.spotifyLink?.trim() || undefined,
          youtubeLink: t.youtubeLink?.trim() || undefined,
          tags: t.tags.map(x => x.trim()).filter(Boolean),
          source: 'generated',
        });
      }
      toast({
        message: `Added ${chosen.length} track${chosen.length === 1 ? '' : 's'}.`,
        variant: 'success',
        duration: 1800,
      });
      onClose();
    } catch {
      toast({ message: 'Failed to save generated tracks.', variant: 'danger', duration: 2400 });
    } finally {
      setSaving(false);
    }
  };

  const canSave = preview?.some(p => p.selected) ?? false;

  return (
    <Modal
      open
      onClose={onClose}
      title="Generate tracks from genre"
      description="describe the genre, era, or style you want tracks for"
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            {preview ? 'Close' : 'Cancel'}
          </button>
          {preview ? (
            <button
              onClick={saveSelected}
              disabled={!canSave || saving}
              className="px-4 py-1.5 rounded-md bg-production text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {saving ? 'Saving…' : `Add selected`}
            </button>
          ) : (
            <button
              onClick={generate}
              disabled={loading || prompt.trim() === ''}
              className="px-4 py-1.5 rounded-md bg-production text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {loading ? 'Generating…' : 'Generate'}
            </button>
          )}
        </div>
      )}
    >
      {!preview ? (
        <div className="space-y-3">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={3}
            data-autofocus
            placeholder="e.g. 90s R&B ballads produced by Babyface"
            className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm leading-relaxed"
          />
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-neutral-500 self-center pr-1">try:</span>
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-production/30 text-production/80 hover:bg-production/5"
              >
                {ex}
              </button>
            ))}
          </div>
          {error && (
            <div className="rounded-md border border-needswork/40 bg-needswork/10 px-3 py-2 text-xs text-needswork">
              {error}
            </div>
          )}
          <p className="text-[11px] text-neutral-500 italic">
            Generates 3–5 real songs with guided-listening prompts — real-listening pointers, not invented technical analysis. You'll get to edit or deselect each one before saving.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500">
            Review each suggestion. Uncheck tracks you don't want, edit fields inline, then add the selected ones.
          </p>
          {preview.map(p => (
            <div
              key={p.uid}
              className={`rounded-card border p-3 space-y-2 ${
                p.selected
                  ? 'border-production/40 bg-production/5'
                  : 'border-neutral-200 dark:border-neutral-800 opacity-70'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={p.selected}
                  onChange={e => patchPreview(p.uid, { selected: e.target.checked })}
                  className="shrink-0"
                />
                <input
                  value={p.title}
                  onChange={e => patchPreview(p.uid, { title: e.target.value })}
                  className="flex-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm font-medium"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                <input
                  value={p.artist}
                  onChange={e => patchPreview(p.uid, { artist: e.target.value })}
                  placeholder="artist"
                  className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                />
                <input
                  value={p.genre}
                  onChange={e => patchPreview(p.uid, { genre: e.target.value })}
                  placeholder="genre"
                  className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                />
              </div>
              <textarea
                value={p.whatToListenFor}
                onChange={e => patchPreview(p.uid, { whatToListenFor: e.target.value })}
                rows={4}
                className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm leading-relaxed ml-6 max-w-[calc(100%-1.5rem)]"
              />
              <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={p.spotifyLink ?? ''}
                  onChange={e => patchPreview(p.uid, { spotifyLink: e.target.value })}
                  placeholder="spotify link"
                  className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
                />
                <input
                  value={p.youtubeLink ?? ''}
                  onChange={e => patchPreview(p.uid, { youtubeLink: e.target.value })}
                  placeholder="youtube link"
                  className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
                />
              </div>
              {p.tags.length > 0 && (
                <div className="pl-6 flex flex-wrap gap-1">
                  {p.tags.map(tag => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-0.5 rounded-full border border-production/30 text-production/80"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// -------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5">{label}</span>
      {children}
    </label>
  );
}

function SpotifyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm5.5 17.4a.7.7 0 0 1-1 .2c-2.8-1.7-6.3-2-10.4-1.1a.7.7 0 0 1-.3-1.4c4.5-1 8.4-.6 11.5 1.3.3.2.4.7.2 1zm1.5-3.3a.9.9 0 0 1-1.2.3c-3.2-2-8.1-2.5-11.9-1.4a.9.9 0 0 1-.5-1.7c4.4-1.3 9.8-.7 13.4 1.5.4.3.5.9.2 1.3zm.1-3.4c-3.8-2.3-10.2-2.5-13.9-1.4a1.1 1.1 0 0 1-.6-2.1c4.2-1.2 11.2-1 15.6 1.6a1.1 1.1 0 0 1-1.1 1.9z" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
    </svg>
  );
}
