import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Song, type SongSection, type WantToLearnEntry } from '../../lib/db';
import Modal from '../../components/Modal';
import { DEFAULT_STAGE } from './stage';
import { assignNextLearningOrder } from './seedSongs';
import { useToast } from '../../components/Toaster';

interface Props {
  onClose: () => void;
  onAdded: (songId: string) => void;
}

const DEFAULT_SECTIONS = ['Verse', 'Chorus', 'Bridge'];
const PRIORITY_BADGE: Record<WantToLearnEntry['priority'], string> = {
  high: 'border-needswork/40 bg-needswork/10 text-needswork',
  medium: 'border-developing/40 bg-developing/10 text-developing',
  low: 'border-info/40 bg-info/10 text-info',
};

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

/**
 * Add-song modal with two paths:
 *   Path A — pick from Want-to-Learn (promotes the entry).
 *   Path B — add a brand-new song with a blank form.
 *
 * When the Want-to-Learn list is empty, Path A is hidden entirely and
 * the modal collapses to the blank form. Either path ends in the same
 * place: a new Song row + default sections, caller navigates to Song
 * Detail.
 */
export default function AddSongModal({ onClose, onAdded }: Props) {
  const wantToLearn = useLiveQuery<WantToLearnEntry[]>(
    () => db.wantToLearn.toArray(),
    [],
  ) ?? [];

  const { toast } = useToast();
  const hasBacklog = wantToLearn.length > 0;

  // Default to the path most users will take: picking from Want-to-Learn
  // if anything's there, otherwise straight to the blank form.
  const [path, setPath] = useState<'pick' | 'blank'>(hasBacklog ? 'pick' : 'blank');

  // Blank form state.
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [key, setKey] = useState('');
  const [tempo, setTempo] = useState('');
  const [link, setLink] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSaveBlank = title.trim() !== '' && artist.trim() !== '' && !submitting;

  const buildSong = async (opts: {
    title: string;
    artist: string;
    description?: string;
    key?: string;
    tempoLabel?: string;
    genre?: string;
    spotifyLink?: string;
    youtubeLink?: string;
    audioLinks?: string[];
  }): Promise<{ song: Song; sections: SongSection[]; songId: string }> => {
    const songId = uid('song');
    const now = Date.now();
    const learningOrder = await assignNextLearningOrder();
    const song: Song = {
      id: songId,
      title: opts.title,
      artist: opts.artist,
      stage: DEFAULT_STAGE,
      description: opts.description,
      genre: opts.genre,
      key: opts.key,
      tempoLabel: opts.tempoLabel,
      spotifyLink: opts.spotifyLink,
      youtubeLink: opts.youtubeLink,
      audioLinks: opts.audioLinks ?? [],
      addedDate: now,
      learningOrder,
    };
    const sections: SongSection[] = DEFAULT_SECTIONS.map((name, idx) => ({
      id: uid('section'),
      songId,
      name,
      order: idx,
      lyrics: '',
      phrases: [],
      arrangements: [{ id: 'basic', name: 'Basic' }],
      activeArrangementId: 'basic',
    }));
    return { song, sections, songId };
  };

  const submitBlank = async () => {
    if (!canSaveBlank) return;
    setSubmitting(true);
    try {
      const { song, sections, songId } = await buildSong({
        title: title.trim(),
        artist: artist.trim(),
        description: description.trim() || undefined,
        key: key.trim() || undefined,
        tempoLabel: tempo.trim() || undefined,
        genre: genre.trim() || undefined,
        // Guess which service the link is from by substring; drop it
        // into the appropriate slot. Anything else stays in audioLinks.
        spotifyLink: link.includes('spotify') ? link.trim() : undefined,
        youtubeLink: link.includes('youtu') ? link.trim() : undefined,
        audioLinks: link.trim() !== '' && !link.includes('spotify') && !link.includes('youtu') ? [link.trim()] : [],
      });
      await db.transaction('rw', [db.songs, db.songSections], async () => {
        await db.songs.add(song);
        await db.songSections.bulkAdd(sections);
      });
      toast({ message: `Added "${song.title}" to your repertoire.`, variant: 'success' });
      onAdded(songId);
    } finally {
      setSubmitting(false);
    }
  };

  const promoteEntry = async (entry: WantToLearnEntry) => {
    setSubmitting(true);
    try {
      const { song, sections, songId } = await buildSong({
        title: entry.title,
        artist: entry.artist,
        description: entry.why,
        spotifyLink: entry.link?.includes('spotify') ? entry.link : undefined,
        youtubeLink: entry.link?.includes('youtu') ? entry.link : undefined,
        audioLinks: entry.link && !entry.link.includes('spotify') && !entry.link.includes('youtu')
          ? [entry.link]
          : [],
      });
      await db.transaction(
        'rw',
        [db.songs, db.songSections, db.wantToLearn],
        async () => {
          await db.songs.add(song);
          await db.songSections.bulkAdd(sections);
          await db.wantToLearn.delete(entry.id);
        },
      );
      toast({
        message: `Promoted "${song.title}" to your repertoire.`,
        variant: 'success',
      });
      onAdded(songId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="add a song to your repertoire"
      description={hasBacklog
        ? 'pick something from your want-to-learn list, or add a brand-new song.'
        : 'fill in a title and artist — you can complete everything else in song detail.'}
      footer={path === 'blank' ? (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            cancel
          </button>
          <button
            onClick={submitBlank}
            disabled={!canSaveBlank}
            className={`px-4 py-1.5 rounded-md text-sm font-medium text-white ${
              canSaveBlank ? 'bg-fluent hover:opacity-90' : 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'
            }`}
          >
            add to repertoire
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            close
          </button>
        </div>
      )}
    >
      {hasBacklog && (
        <div className="flex items-center gap-1 p-1 rounded-lg border border-black/[0.07] bg-neutral-50 dark:bg-neutral-900 mb-4 text-xs">
          <button
            onClick={() => setPath('pick')}
            aria-pressed={path === 'pick'}
            className={`flex-1 px-3 py-1.5 rounded-md transition ${
              path === 'pick'
                ? 'bg-fluent text-white shadow-sm'
                : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            pick from want-to-learn ({wantToLearn.length})
          </button>
          <button
            onClick={() => setPath('blank')}
            aria-pressed={path === 'blank'}
            className={`flex-1 px-3 py-1.5 rounded-md transition ${
              path === 'blank'
                ? 'bg-fluent text-white shadow-sm'
                : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            add a new song
          </button>
        </div>
      )}

      {path === 'pick' && hasBacklog ? (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {wantToLearn.map(entry => (
            <button
              key={entry.id}
              onClick={() => promoteEntry(entry)}
              disabled={submitting}
              className="w-full text-left rounded-lg border border-black/[0.07] p-3 hover:border-fluent hover:bg-fluent/5 transition disabled:opacity-50"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{entry.title}</div>
                  <div className="text-xs text-neutral-500">{entry.artist}</div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 border uppercase tracking-wide text-[10px] ${PRIORITY_BADGE[entry.priority]}`}
                >
                  {entry.priority}
                </span>
              </div>
              {entry.why && (
                <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-200 italic line-clamp-2">
                  {entry.why}
                </p>
              )}
              {entry.tags.length > 0 && (
                <div className="mt-1 flex gap-1 flex-wrap">
                  {entry.tags.map(t => (
                    <span key={t} className="text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 border border-neutral-200 dark:border-neutral-700 text-neutral-500">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-neutral-500 text-xs uppercase tracking-wide">title</span>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-neutral-500 text-xs uppercase tracking-wide">artist</span>
            <input
              value={artist}
              onChange={e => setArtist(e.target.value)}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-neutral-500 text-xs uppercase tracking-wide">key</span>
              <input
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="e.g. G"
                className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-neutral-500 text-xs uppercase tracking-wide">tempo</span>
              <input
                value={tempo}
                onChange={e => setTempo(e.target.value)}
                placeholder="80 BPM or 70–85"
                className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-neutral-500 text-xs uppercase tracking-wide">genre</span>
              <input
                value={genre}
                onChange={e => setGenre(e.target.value)}
                placeholder="e.g. R&B"
                className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-neutral-500 text-xs uppercase tracking-wide">recording link (optional)</span>
            <input
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="spotify / youtube / other"
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 font-mono text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-neutral-500 text-xs uppercase tracking-wide">why this song (optional)</span>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="what drew you to it, what you want to learn from it"
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      )}
    </Modal>
  );
}
