import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ReferenceTrack } from '../../lib/db';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import TagPicker from '../skills/TagPicker';
import { buildSpotifySearchLink, buildYouTubeProducerLink } from './searchLinks';
import { TRACK_POOLS, trackPoolById, type PoolTrack, type TrackPool } from './content/trackPools';
import {
  addReferenceTrack,
  archiveReferenceTrack,
  deleteReferenceTrack,
  updateReferenceTrack,
} from './data';

type Filter = 'active' | 'archived';

/**
 * Reference Track Library view. Two add paths at the top: manual
 * entry and a "Browse Track Suggestions" pool browser (curated
 * offline catalogs — no API, no key required). Every track ends up
 * with Spotify + YouTube search links derived from title + artist.
 */
export default function ReferenceTracksView() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('active');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ReferenceTrack | null>(null);
  const [adding, setAdding] = useState(false);
  const [browsing, setBrowsing] = useState(false);
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
          (t.producer ?? '').toLowerCase().includes(q) ||
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
      message: 'Track removed.',
      variant: 'warning',
      action: {
        label: 'Undo',
        onClick: async () => { await db.referenceTracks.add(snapshot); },
      },
      duration: 5000,
    });
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-medium tracking-tight">Reference Track Library</h1>
        <p className="text-sm text-neutral-500">
          The songs you study when you want to hear what great sounds like. Add your own, browse curated pools by genre, and grow your listening notes over time.
        </p>
      </header>

      <div className="rounded-card border border-production/30 bg-production/5 p-3 sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-production text-white text-sm font-semibold hover:opacity-90 shadow-sm"
          >
            <span aria-hidden>＋</span> Add Track
          </button>
          <button
            onClick={() => setBrowsing(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md border-2 border-production text-production text-sm font-semibold hover:bg-production/10"
          >
            <span aria-hidden>＋</span> Browse Track Suggestions
          </button>
          <span className="text-[11px] text-neutral-500 ml-1 flex-1 min-w-[140px]">
            enter a track manually, or browse curated pools by genre and pick the ones you want.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="search title, artist, producer, genre, notes, tags…"
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
          key={editing?.id ?? 'new-track'}
          existing={editing ?? undefined}
          genres={allGenres}
          onClose={() => { setEditing(null); setAdding(false); }}
        />
      )}

      {browsing && (
        <BrowsePoolsModal onClose={() => setBrowsing(false)} />
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
          <div className="text-sm font-medium">{track.title}</div>
          <div className="text-xs text-neutral-500 mt-0.5">by {track.artist}</div>
          {track.producer && track.producer.trim() !== '' && (
            <div className="text-xs text-neutral-500 mt-0.5">
              <span className="text-neutral-400">Produced by</span> {track.producer}
            </div>
          )}
          <div className="text-[11px] text-neutral-500 mt-1 flex items-center gap-2 flex-wrap">
            <span>{track.genre}</span>
            {track.source === 'starter' || (track.isStarter && !track.source) ? (
              <span className="text-[10px] uppercase tracking-wide text-production/70">starter</span>
            ) : track.source === 'generated' ? (
              <span className="text-[10px] uppercase tracking-wide text-production/70">from pool</span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              {track.spotifyLink && (
                <a
                  href={track.spotifyLink}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`search Spotify for ${track.title}`}
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
                  aria-label={`YouTube tutorials for ${track.artist}`}
                  title="YouTube"
                  className="text-neutral-400 hover:text-[#ff0000]"
                >
                  <YouTubeIcon />
                </a>
              )}
            </span>
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
// Form field layout primitives.
//
// IMPORTANT: `Field` is rendered as a <div>, NOT a <label>. Wrapping
// form content in a <label> that contains multiple labelable controls
// (button + input, multiple chip X buttons, etc.) caused the tag bugs
// we fixed in this iteration: clicking anywhere in the label whitespace
// caused the browser to synthesize a click on the first form control
// inside, which was the first tag's X button. That ghost click
// explained all three tag-interaction bugs (can't click dropdown items,
// random tag deletion when clicking other fields, X removing multiple
// tags). Using <div> with a styled label span eliminates the issue.
// The label text still associates visually with the control below it.

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5">{label}</div>
      {children}
    </div>
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
  const [producer, setProducer] = useState(existing?.producer ?? '');
  const [genre, setGenre] = useState(existing?.genre ?? '');
  const [whatToListenFor, setWhatToListenFor] = useState(
    existing?.whatToListenFor ?? existing?.sonicNotes ?? '',
  );
  const [myListeningNotes, setMyListeningNotes] = useState(existing?.myListeningNotes ?? '');
  const [tags, setTags] = useState<string[]>(existing ? [...existing.tags] : []);
  const [customiseLinks, setCustomiseLinks] = useState(
    Boolean(existing?.spotifyLink || existing?.youtubeLink),
  );
  const [spotifyLink, setSpotifyLink] = useState(existing?.spotifyLink ?? '');
  const [youtubeLink, setYoutubeLink] = useState(existing?.youtubeLink ?? '');
  const [saving, setSaving] = useState(false);

  const derivedSpotify = title && artist ? buildSpotifySearchLink(title, artist) : '';
  const derivedYouTube = artist ? buildYouTubeProducerLink(artist) : '';

  const save = async () => {
    if (saving) return;
    if (!title.trim() || !artist.trim()) {
      toast({ message: 'title and artist are required.', variant: 'warning', duration: 1600 });
      return;
    }
    setSaving(true);
    try {
      const finalSpotify = customiseLinks && spotifyLink.trim()
        ? spotifyLink.trim()
        : buildSpotifySearchLink(title, artist);
      const finalYouTube = customiseLinks && youtubeLink.trim()
        ? youtubeLink.trim()
        : buildYouTubeProducerLink(artist);
      const producerValue = producer.trim() || undefined;

      if (existing) {
        await updateReferenceTrack(existing.id, {
          title: title.trim(),
          artist: artist.trim(),
          producer: producerValue,
          genre: genre.trim(),
          whatToListenFor: whatToListenFor.trim(),
          myListeningNotes: myListeningNotes.trim(),
          spotifyLink: finalSpotify,
          youtubeLink: finalYouTube,
          tags,
        });
        toast({ message: 'Track updated.', variant: 'success', duration: 1400 });
      } else {
        await addReferenceTrack({
          title: title.trim(),
          artist: artist.trim(),
          producer: producerValue,
          genre: genre.trim(),
          whatToListenFor: whatToListenFor.trim(),
          myListeningNotes: myListeningNotes.trim(),
          spotifyLink: finalSpotify,
          youtubeLink: finalYouTube,
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
      description={existing ? 'update notes, genre, tags, producer, or links' : 'a new song to study'}
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
        <Field label="producer">
          <input
            value={producer}
            onChange={e => setProducer(e.target.value)}
            placeholder="optional — e.g. Babyface, L.A. Reid, Daryl Simmons"
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
            placeholder="Guided listening in your own words. What should a producer notice? Balance, space, arrangement contrast, how voices blend. Avoid guessing at specific gear or ratios."
            className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm leading-relaxed"
          />
        </Field>
        {existing && (
          <Field label="my listening notes">
            <textarea
              value={myListeningNotes}
              onChange={e => setMyListeningNotes(e.target.value)}
              rows={4}
              placeholder="Your own observations. Grows over time as you listen while studying specific lessons."
              className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm leading-relaxed"
            />
          </Field>
        )}
        <Field label="tags">
          <TagChipEditor tags={tags} onChange={setTags} />
        </Field>
        <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">links (auto)</span>
            <label className="text-[10px] text-neutral-500 inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={customiseLinks}
                onChange={e => setCustomiseLinks(e.target.checked)}
              />
              customise
            </label>
          </div>
          {customiseLinks ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={spotifyLink}
                onChange={e => setSpotifyLink(e.target.value)}
                placeholder={derivedSpotify || 'https://open.spotify.com/…'}
                className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
              />
              <input
                value={youtubeLink}
                onChange={e => setYoutubeLink(e.target.value)}
                placeholder={derivedYouTube || 'https://www.youtube.com/…'}
                className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
              />
            </div>
          ) : (
            <div className="text-[11px] text-neutral-500 space-y-0.5">
              <div className="truncate">
                spotify: <span className="font-mono text-neutral-600 dark:text-neutral-300">{derivedSpotify || '—'}</span>
              </div>
              <div className="truncate">
                youtube: <span className="font-mono text-neutral-600 dark:text-neutral-300">{derivedYouTube || '—'}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------------

/**
 * Tag chip editor. Uses functional setState + splice-by-index to make
 * single-tag removal bulletproof. Critically, this component is NEVER
 * rendered inside a <label> (see the note on Field above) — wrapping
 * it in a label caused the browser to synthesize clicks on the first
 * X button whenever the user clicked anywhere in the label's
 * whitespace, creating the appearance of random tag deletion.
 */
function TagChipEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const removeAt = (idx: number) => {
    onChange(prev => {
      if (idx < 0 || idx >= prev.length) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  };
  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, idx) => (
            <span
              key={`tag-${idx}-${tag}`}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-production/30 text-production/80 bg-production/5"
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeAt(idx);
                }}
                aria-label={`remove ${tag}`}
                title={`remove ${tag}`}
                className="text-production/60 hover:text-needswork leading-none px-0.5"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <TagPicker
        existing={tags}
        onAdd={tag => onChange(prev => (prev.includes(tag) ? prev : [...prev, tag]))}
        placeholder="search existing tags or type a new one…"
      />
    </div>
  );
}

// -------------------------------------------------------------------

interface BrowseProps {
  onClose: () => void;
  /** When provided, the modal opens directly into this pool instead of
   *  the genre picker. Used when a specific lesson knows which genre
   *  it wants suggestions from. */
  preselectedPoolId?: string;
  /** Fired after "Add Selected" succeeds, with the new ReferenceTrack
   *  ids that were just inserted. Lets callers (e.g. per-lesson
   *  curator) auto-associate the new tracks with their current view. */
  onAfterSave?: (addedTrackIds: string[]) => void;
}

interface PoolPreview extends PoolTrack {
  uid: string;
  selected: boolean;
}

/**
 * Pool browser: pick a genre → see 15+ curated tracks → check the
 * ones you want → "Add Selected". All content is static, shipped
 * with the app. No API key or network call involved.
 *
 * Exported so other views (LessonReferenceSection) can open the same
 * modal with a pre-selected pool and a callback for the newly added
 * track ids.
 */
export function BrowsePoolsModal({ onClose, preselectedPoolId, onAfterSave }: BrowseProps) {
  const { toast } = useToast();
  const [selectedPool, setSelectedPool] = useState<TrackPool | null>(null);
  const [preview, setPreview] = useState<PoolPreview[] | null>(null);
  const [saving, setSaving] = useState(false);

  const existingTracks = useLiveQuery(
    async () => db.referenceTracks.toArray(),
    [],
  );
  const existingKey = useMemo(() => {
    const s = new Set<string>();
    for (const t of existingTracks ?? []) {
      s.add(`${t.title.toLowerCase()}|${t.artist.toLowerCase()}`);
    }
    return s;
  }, [existingTracks]);

  const openPool = (pool: TrackPool) => {
    setSelectedPool(pool);
    // Default to unchecked for tracks that already exist in the user's
    // library; checked for new ones. Keeps the curator flow useful on
    // repeat visits without accidentally duplicating entries.
    setPreview(
      pool.tracks.map(t => ({
        ...t,
        uid: `pool-${Math.random().toString(36).slice(2, 10)}`,
        selected: !existingKey.has(`${t.title.toLowerCase()}|${t.artist.toLowerCase()}`),
      })),
    );
  };

  // Preselection: if a pool id is passed, open straight into it once
  // (and only once). Library state may not have loaded yet on first
  // render — wait for existingTracks to arrive so the "already in
  // library" checkbox defaults are correct.
  useEffect(() => {
    if (!preselectedPoolId) return;
    if (selectedPool) return;
    if (existingTracks === undefined) return;
    const pool = trackPoolById(preselectedPoolId);
    // setState inside effect is the right shape here: we can't
    // initialise `preview` on mount because `existingTracks` (live
    // query) hasn't resolved yet. The guards above ensure this runs
    // at most once per preselected-pool lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pool) openPool(pool);
    // openPool / existingKey read from closed-over state, which is fine
    // for a one-shot effect. Re-running on every dep change would
    // spuriously reset the user's checkbox edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedPoolId, existingTracks]);

  const backToPools = () => {
    // If the caller pre-selected a pool, there's no picker to go back
    // to — close instead so the user doesn't end up at a dead-end.
    if (preselectedPoolId) {
      onClose();
      return;
    }
    setSelectedPool(null);
    setPreview(null);
  };

  const patchPreview = (uid: string, patch: Partial<PoolPreview>) => {
    setPreview(prev => prev?.map(p => (p.uid === uid ? { ...p, ...patch } : p)) ?? prev);
  };

  const selectedCount = preview?.filter(p => p.selected).length ?? 0;
  const canSave = selectedCount > 0;

  const saveSelected = async () => {
    if (!preview || saving) return;
    const chosen = preview.filter(p => p.selected);
    if (chosen.length === 0) {
      toast({ message: 'Select at least one track to add.', variant: 'warning', duration: 1600 });
      return;
    }
    setSaving(true);
    try {
      const addedIds: string[] = [];
      for (const t of chosen) {
        const row = await addReferenceTrack({
          title: t.title.trim(),
          artist: t.artist.trim(),
          producer: t.producer.trim() || undefined,
          genre: t.genre.trim(),
          whatToListenFor: t.whatToListenFor.trim(),
          myListeningNotes: '',
          tags: t.tags.map(x => x.trim()).filter(Boolean),
          source: 'generated',
        });
        addedIds.push(row.id);
      }
      toast({
        message: `Added ${chosen.length} track${chosen.length === 1 ? '' : 's'}.`,
        variant: 'success',
        duration: 1800,
      });
      if (onAfterSave) onAfterSave(addedIds);
      onClose();
    } catch {
      toast({ message: 'Failed to save tracks.', variant: 'danger', duration: 2400 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={selectedPool ? selectedPool.label : 'Browse Track Suggestions'}
      description={
        selectedPool
          ? `${selectedCount} of ${preview?.length ?? 0} selected`
          : 'pick a genre to see curated tracks'
      }
      footer={(
        <div className="flex items-center justify-between gap-2">
          <div>
            {selectedPool && (
              <button
                onClick={backToPools}
                className="text-xs text-neutral-500 hover:text-production"
              >
                ← back to genres
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
            >
              {selectedPool ? 'Discard' : 'Close'}
            </button>
            {selectedPool && (
              <button
                onClick={saveSelected}
                disabled={!canSave || saving}
                className="px-4 py-1.5 rounded-md bg-production text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
              >
                {saving ? 'Saving…' : `Add Selected${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </button>
            )}
          </div>
        </div>
      )}
    >
      {!selectedPool ? (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500 mb-3">
            Each pool ships with curated tracks and guided-listening notes. Pick a genre, review the list, and check the ones you want in your library.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TRACK_POOLS.map(pool => (
              <button
                key={pool.id}
                onClick={() => openPool(pool)}
                className="text-left rounded-card border border-neutral-200 dark:border-neutral-800 p-3 hover:border-production/60 hover:bg-production/5 transition-colors"
              >
                <div className="text-sm font-medium">{pool.label}</div>
                <div className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">{pool.subtitle}</div>
                <div className="text-[10px] text-production/70 mt-1">
                  {pool.tracks.length} tracks
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500">
            {selectedPool.subtitle}. Check the tracks you want to add. Tracks already in your library start unchecked.
          </p>
          {preview?.map(p => (
            <div
              key={p.uid}
              className={`rounded-card border p-3 space-y-1.5 ${
                p.selected
                  ? 'border-production/40 bg-production/5'
                  : 'border-neutral-200 dark:border-neutral-800 opacity-60'
              }`}
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={p.selected}
                  onChange={e => patchPreview(p.uid, { selected: e.target.checked })}
                  className="mt-0.5 shrink-0 w-4 h-4"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.title}</div>
                  <div className="text-xs text-neutral-500">by {p.artist}</div>
                  <div className="text-xs text-neutral-500">
                    <span className="text-neutral-400">Produced by</span> {p.producer}
                  </div>
                </div>
              </label>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed pl-6">
                {p.whatToListenFor}
              </p>
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
              <div className="pl-6 text-[10px] text-neutral-500 truncate">
                links auto:{' '}
                <a href={buildSpotifySearchLink(p.title, p.artist)} target="_blank" rel="noreferrer noopener" className="text-production hover:underline">spotify</a>
                {' · '}
                <a href={buildYouTubeProducerLink(p.artist)} target="_blank" rel="noreferrer noopener" className="text-production hover:underline">youtube</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// -------------------------------------------------------------------

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
