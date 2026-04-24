import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ReferenceTrack } from '../../lib/db';
import { useToast } from '../../components/Toaster';
import { unlinkTrackFromLesson, linkTracksToLesson } from './data';
import LibraryPickerModal from './LibraryPickerModal';
import { BrowsePoolsModal } from './ReferenceTracksView';

interface Props {
  lessonId: string;
}

/**
 * Per-lesson reference-track curator. Replaces the old content-authored
 * `referenceTracks: [...]` auto-display with a user-driven picker:
 *
 *   - Empty state: two CTAs ("Add from Your Library", "Browse Suggestions").
 *   - Populated state: each linked track shows title/artist/producer,
 *     Spotify + YouTube links, and a "Remove from lesson" action that
 *     severs the association (track stays in the library).
 *
 * For Genre Productions lessons (gen-01…gen-11), Browse Suggestions
 * opens the pool browser pre-selected to the arc's matching genre so
 * the user skips the pool picker. Other lessons get the general picker.
 */
export default function LessonReferenceSection({ lessonId }: Props) {
  const { toast } = useToast();
  const [openLibraryPicker, setOpenLibraryPicker] = useState(false);
  const [openBrowsePools, setOpenBrowsePools] = useState(false);

  const linkedTracks = useLiveQuery(
    async () => {
      const links = await db.lessonReferenceTracks
        .where('lessonId')
        .equals(lessonId)
        .toArray();
      links.sort((a, b) => a.addedAt - b.addedAt);
      const trackIds = links.map(l => l.trackId);
      if (trackIds.length === 0) return [] as ReferenceTrack[];
      const tracks = await db.referenceTracks.bulkGet(trackIds);
      // bulkGet returns undefined for missing ids; filter those out
      // defensively so a stale link (should be impossible with cascade
      // delete, but belt-and-braces) never crashes the render.
      return tracks.filter((t): t is ReferenceTrack => t !== undefined);
    },
    [lessonId],
  );

  const linkedIds = useMemo(
    () => (linkedTracks ?? []).map(t => t.id),
    [linkedTracks],
  );

  const unlink = async (trackId: string) => {
    await unlinkTrackFromLesson(lessonId, trackId);
    toast({
      message: 'Removed from lesson. Still in your library.',
      variant: 'warning',
      duration: 1800,
    });
  };

  const preselectedPoolId = poolIdForLesson(lessonId);

  // Auto-link the tracks the user just added from a pool to this lesson.
  const linkNewlyAddedPoolTracks = async (newTrackIds: string[]) => {
    if (newTrackIds.length === 0) return;
    await linkTracksToLesson(lessonId, newTrackIds);
  };

  return (
    <>
      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium">
            reference tracks for this lesson
          </div>
          <Link
            to="/production?view=reference-tracks"
            className="text-[11px] text-production hover:underline"
          >
            open full library →
          </Link>
        </div>

        {linkedTracks === undefined ? (
          <p className="text-sm text-neutral-500 italic">loading…</p>
        ) : linkedTracks.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500">
              Pick the songs you want to study alongside this lesson. Add ones you already
              have in your library, or browse curated suggestions for this genre.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setOpenLibraryPicker(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border-2 border-production text-production text-sm font-medium hover:bg-production/10"
              >
                <span aria-hidden>＋</span> Add from Your Library
              </button>
              <button
                onClick={() => setOpenBrowsePools(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border-2 border-production text-production text-sm font-medium hover:bg-production/10"
              >
                <span aria-hidden>＋</span> Browse Suggestions
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <ul className="space-y-2">
              {linkedTracks.map(t => (
                <LinkedTrackRow
                  key={t.id}
                  track={t}
                  onRemove={() => unlink(t.id)}
                />
              ))}
            </ul>
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button
                onClick={() => setOpenLibraryPicker(true)}
                className="text-[11px] px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-production hover:text-production"
              >
                ＋ Add from Your Library
              </button>
              <button
                onClick={() => setOpenBrowsePools(true)}
                className="text-[11px] px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-production hover:text-production"
              >
                ＋ Browse Suggestions
              </button>
            </div>
          </div>
        )}
      </section>

      {openLibraryPicker && (
        <LibraryPickerModal
          lessonId={lessonId}
          alreadyLinkedTrackIds={linkedIds}
          onClose={() => setOpenLibraryPicker(false)}
        />
      )}

      {openBrowsePools && (
        <BrowsePoolsModal
          onClose={() => setOpenBrowsePools(false)}
          preselectedPoolId={preselectedPoolId}
          onAfterSave={linkNewlyAddedPoolTracks}
        />
      )}
    </>
  );
}

// -------------------------------------------------------------------

function LinkedTrackRow({
  track,
  onRemove,
}: {
  track: ReferenceTrack;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-card border border-neutral-200 dark:border-neutral-800 p-3 space-y-1">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-sm">
            <span aria-hidden className="mr-1">🎵</span>
            <span className="font-medium">{track.title}</span>
            <span className="text-neutral-500"> — {track.artist}</span>
          </div>
          {track.producer && track.producer.trim() !== '' && (
            <div className="text-xs text-neutral-500 mt-0.5">
              <span className="text-neutral-400">Produced by</span> {track.producer}
            </div>
          )}
          <div className="text-[11px] text-neutral-500 mt-1 flex items-center gap-2 flex-wrap">
            {track.spotifyLink && (
              <a
                href={track.spotifyLink}
                target="_blank"
                rel="noreferrer noopener"
                className="text-production hover:underline"
              >
                Spotify
              </a>
            )}
            {track.youtubeLink && (
              <a
                href={track.youtubeLink}
                target="_blank"
                rel="noreferrer noopener"
                className="text-production hover:underline"
              >
                YouTube
              </a>
            )}
          </div>
        </div>
        <button
          onClick={onRemove}
          className="text-[11px] px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-needswork hover:border-needswork"
        >
          Remove from lesson
        </button>
      </div>
    </li>
  );
}

// -------------------------------------------------------------------
// Pool mapping: Genre Productions arcs → pre-selected suggestion pool.
// Only the 11 Genre arcs have a matching pool; everything else opens
// the picker with no preselection.

const GENRE_ARC_POOLS: Record<string, string> = {
  '01': 'gospel-6-8',
  '02': 'gospel-choir-90s',
  '03': 'rnb-ballads-90s',
  '04': 'rnb-2000s',
  '05': 'lofi-indie',
  '06': 'modern-minimal-rnb',
  '07': '80s-pop-ballads',
  '08': 'thoughtful-hip-hop',
  '09': 'dance-rnb',
  '10': 'soul-funk-70s',
  '11': 'neo-soul',
};

function poolIdForLesson(lessonId: string): string | undefined {
  const match = /^gen-(\d+)[a-z]?$/.exec(lessonId);
  if (!match) return undefined;
  return GENRE_ARC_POOLS[match[1]];
}
