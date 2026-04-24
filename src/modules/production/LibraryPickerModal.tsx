import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ReferenceTrack } from '../../lib/db';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toaster';
import { linkTracksToLesson } from './data';

interface Props {
  lessonId: string;
  /** Track ids already associated with this lesson — pre-hidden from
   *  the picker so the user can't double-link a pair. */
  alreadyLinkedTrackIds: string[];
  onClose: () => void;
  onLinked?: (trackIds: string[]) => void;
}

/**
 * Picker that lets the user select one or more reference tracks from
 * their existing (non-archived) library and associate them with the
 * current lesson. Archived tracks are deliberately excluded — if the
 * user has archived something they presumably don't want it surfaced
 * as a lesson reference.
 *
 * Uses checkbox selection + "Add Selected" rather than click-to-link
 * so the user can review choices before committing, matching the
 * BrowsePoolsModal pattern.
 */
export default function LibraryPickerModal({
  lessonId,
  alreadyLinkedTrackIds,
  onClose,
  onLinked,
}: Props) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const alreadyLinkedSet = useMemo(
    () => new Set(alreadyLinkedTrackIds),
    [alreadyLinkedTrackIds],
  );

  const tracks = useLiveQuery(
    async () => {
      const rows = await db.referenceTracks.toArray();
      return rows
        .filter(t => !t.archived)
        .filter(t => !alreadyLinkedSet.has(t.id))
        .sort((a, b) => b.addedAt - a.addedAt);
    },
    [alreadyLinkedTrackIds.join(',')],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tracks ?? [];
    return (tracks ?? []).filter(
      t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.producer ?? '').toLowerCase().includes(q) ||
        t.genre.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q)),
    );
  }, [tracks, query]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSave = selected.size > 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const ids = [...selected];
      await linkTracksToLesson(lessonId, ids);
      toast({
        message: `Linked ${ids.length} track${ids.length === 1 ? '' : 's'} to this lesson.`,
        variant: 'success',
        duration: 1600,
      });
      if (onLinked) onLinked(ids);
      onClose();
    } catch {
      toast({ message: 'Failed to link tracks.', variant: 'danger', duration: 2400 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add from Your Library"
      description={
        tracks === undefined
          ? 'loading…'
          : `${selected.size} of ${filtered.length} selected`
      }
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
            disabled={!canSave || saving}
            className="px-4 py-1.5 rounded-md bg-production text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {saving
              ? 'Saving…'
              : `Add Selected${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      )}
    >
      <div className="space-y-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          data-autofocus
          placeholder="search your library…"
          className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm"
        />
        {tracks === undefined ? (
          <div className="py-10 text-center text-sm text-neutral-500 italic">loading…</div>
        ) : (tracks.length === 0) ? (
          <EmptyLibrary />
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-neutral-500 italic">
            no tracks match your search.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map(t => (
              <LibraryRow
                key={t.id}
                track={t}
                selected={selected.has(t.id)}
                onToggle={() => toggle(t.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function EmptyLibrary() {
  return (
    <div className="py-8 text-center text-sm text-neutral-500 space-y-2">
      <p>Your library is empty (or everything is already linked to this lesson).</p>
      <p className="text-xs">
        Close this dialog and use <span className="font-medium">Browse Suggestions</span> to
        pull from a genre pool instead.
      </p>
    </div>
  );
}

function LibraryRow({
  track,
  selected,
  onToggle,
}: {
  track: ReferenceTrack;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={`rounded-card border p-3 ${
        selected
          ? 'border-production/40 bg-production/5'
          : 'border-neutral-200 dark:border-neutral-800'
      }`}
    >
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-0.5 shrink-0 w-4 h-4"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{track.title}</div>
          <div className="text-xs text-neutral-500">by {track.artist}</div>
          {track.producer && track.producer.trim() !== '' && (
            <div className="text-xs text-neutral-500">
              <span className="text-neutral-400">Produced by</span> {track.producer}
            </div>
          )}
          <div className="text-[11px] text-neutral-500 mt-1 flex items-center gap-2 flex-wrap">
            <span>{track.genre}</span>
            {track.tags.slice(0, 4).map(tag => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded-full border border-production/30 text-production/80"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </label>
    </li>
  );
}
