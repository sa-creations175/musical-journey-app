import { useState } from 'react';
import { db, type Song, type SongSection } from '../../lib/db';
import Modal from '../../components/Modal';
import { DEFAULT_STAGE } from './stage';

interface Props {
  onClose: () => void;
  onAdded: (songId: string) => void;
}

// Twelve common starter-section templates. User can edit/remove/add
// once the song lands in the detail view.
const DEFAULT_SECTIONS = ['Verse', 'Chorus', 'Bridge'];

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

/**
 * Lightweight add-song form. Users fill title/artist/key/tempo, and we
 * seed a trio of default sections (Verse, Chorus, Bridge) they can
 * restructure afterwards. This keeps the critical path to "I have a
 * song in my repertoire" as short as a good note-taking app.
 */
export default function AddSongModal({ onClose, onAdded }: Props) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [key, setKey] = useState('');
  const [tempo, setTempo] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSave = title.trim().length > 0 && artist.trim().length > 0 && !submitting;

  const save = async () => {
    if (!canSave) return;
    setSubmitting(true);
    try {
      const songId = uid('song');
      const now = Date.now();
      const song: Song = {
        id: songId,
        title: title.trim(),
        artist: artist.trim(),
        key: key.trim() || undefined,
        tempoLabel: tempo.trim() || undefined,
        stage: DEFAULT_STAGE,
        description: description.trim() || undefined,
        audioLinks: [],
        addedDate: now,
      };
      const sections: SongSection[] = DEFAULT_SECTIONS.map((name, idx) => ({
        id: uid('section'),
        songId,
        name,
        order: idx,
        lyrics: '',
      }));
      await db.transaction('rw', [db.songs, db.songSections], async () => {
        await db.songs.add(song);
        await db.songSections.bulkAdd(sections);
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
      title="add a song"
      description="give it a title and artist — you can fill in the rest inside song detail."
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className={`px-4 py-1.5 rounded-md text-sm font-medium text-white ${
              canSave ? 'bg-fluent hover:opacity-90' : 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'
            }`}
          >
            add to repertoire
          </button>
        </div>
      )}
    >
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-neutral-500 text-xs uppercase tracking-wide">original key (optional)</span>
            <input
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="e.g. G or Db"
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-neutral-500 text-xs uppercase tracking-wide">tempo (optional)</span>
            <input
              value={tempo}
              onChange={e => setTempo(e.target.value)}
              placeholder="e.g. 80 BPM or 70–85"
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500 text-xs uppercase tracking-wide">why you're learning it (optional)</span>
          <textarea
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
          />
        </label>
      </div>
    </Modal>
  );
}
