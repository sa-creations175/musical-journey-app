import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  type Song,
  type SongCell,
  type SongKey,
  type SongMatrixSection,
} from '../../../lib/db';
import MatrixGrid from './MatrixGrid';
import { computeSongLevelState, songLevelStateLabel } from './songLevelState';

/**
 * Section × key matrix view for a single song. Step 3a ships this
 * read-only — the cell-interaction modal, whole-song test modal,
 * and section-mutation flows land in subsequent steps.
 *
 * Layout top-to-bottom:
 *
 *   ← Song detail            (back affordance)
 *   header                   title, original key, tempo, section
 *                            count, song-level state pill, %% pills
 *   section-setup placeholder  (when no sections exist)
 *   matrix grid              12 key rows × N section columns,
 *                            inline strip beneath each row
 *
 * Migrated songs land here with songKeys already populated (step 2)
 * but no songMatrixSections yet — the placeholder banner is the
 * default landing state. Step 3b replaces the placeholder with the
 * live setup flow.
 */

interface Props {
  song: Song;
  onClose: () => void;
}

export default function SongMatrixView({ song, onClose }: Props) {
  const sections = useLiveQuery(
    () => db.songMatrixSections.where('songId').equals(song.id).sortBy('displayOrder'),
    [song.id],
    [] as SongMatrixSection[],
  );
  const songKeys = useLiveQuery(
    () => db.songKeys.where('songId').equals(song.id).toArray(),
    [song.id],
    [] as SongKey[],
  );
  const songCells = useLiveQuery(
    () => db.songCells.where('songId').equals(song.id).toArray(),
    [song.id],
    [] as SongCell[],
  );

  const visibleSections = useMemo(
    () => sections.filter(s => !s.isArchived),
    [sections],
  );
  const originalKey = useMemo(
    () => songKeys.find(k => k.isOriginalKey) ?? null,
    [songKeys],
  );
  const songLevelState = useMemo(
    () => computeSongLevelState(songKeys, songCells, visibleSections.length),
    [songKeys, songCells, visibleSections.length],
  );

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-neutral-500 hover:text-fluent inline-flex items-center gap-1"
      >
        ← song detail
      </button>

      <Header
        song={song}
        originalKey={originalKey?.keyName ?? null}
        sectionCount={visibleSections.length}
        stateName={songLevelState.state}
        learningPercent={songLevelState.learningPercent}
        crossKeyPercent={songLevelState.crossKeyPercent}
        solidKeyCount={songLevelState.solidKeyCount}
      />

      {visibleSections.length === 0 && (
        <SectionSetupPlaceholder />
      )}

      <MatrixGrid
        sections={sections}
        songKeys={songKeys}
        songCells={songCells}
      />
    </section>
  );
}

// -------------------------------------------------------------------

interface HeaderProps {
  song: Song;
  originalKey: string | null;
  sectionCount: number;
  stateName: ReturnType<typeof computeSongLevelState>['state'];
  learningPercent: number;
  crossKeyPercent: number;
  solidKeyCount: number;
}

const STATE_PILL_CLASS: Record<HeaderProps['stateName'], string> = {
  learning:     'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700',
  comfortable:  'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/40 dark:text-teal-200 dark:border-teal-700',
  solid:        'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700',
  cross_key:    'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-700',
  internalized: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700',
};

function Header({
  song,
  originalKey,
  sectionCount,
  stateName,
  learningPercent,
  crossKeyPercent,
  solidKeyCount,
}: HeaderProps) {
  const tempoText = song.tempoLabel
    ? song.tempoLabel
    : song.tempo
      ? `♩ = ${song.tempo}`
      : null;
  // Cross-key %% rendered alongside Learning state too, when any
  // non-original cells exist (per spec line 283). The pill itself
  // names the dominant state; the %% pill carries the secondary
  // dimension.
  const showCrossKeyPill = stateName === 'cross_key'
    || (stateName === 'learning' && crossKeyPercent > 0);

  return (
    <header className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 px-4 py-3">
      <div className="flex-1 min-w-0">
        <h2 className="text-base sm:text-lg font-medium tracking-tight truncate">
          {song.title}
          {song.artist && (
            <span className="text-neutral-500 dark:text-neutral-400 font-normal"> — {song.artist}</span>
          )}
        </h2>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {originalKey && (
            <span>original key: <span className="text-neutral-700 dark:text-neutral-200 font-medium">{originalKey}</span></span>
          )}
          {tempoText && (
            <span>{tempoText}</span>
          )}
          <span>{sectionCount === 0 ? 'no sections yet' : `${sectionCount} section${sectionCount === 1 ? '' : 's'}`}</span>
          {solidKeyCount > 0 && (
            <span>{solidKeyCount} key{solidKeyCount === 1 ? '' : 's'} at Solid</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${STATE_PILL_CLASS[stateName]}`}>
          {songLevelStateLabel(stateName)}
        </span>
        {stateName === 'learning' && sectionCount > 0 && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 tabular-nums">
            {learningPercent}% original
          </span>
        )}
        {showCrossKeyPill && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] bg-purple-100/60 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 tabular-nums">
            {crossKeyPercent}% cross-key
          </span>
        )}
      </div>
    </header>
  );
}

// -------------------------------------------------------------------

function SectionSetupPlaceholder() {
  return (
    <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Set up sections to start using this song's matrix.
        </div>
        <div className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
          The matrix tracks progress per section per key. Define your sections
          (verse, chorus, bridge, etc.) once and the grid fills in as you
          practise.
        </div>
      </div>
      <button
        type="button"
        disabled
        title="The section setup flow ships in the next update."
        className="shrink-0 px-3 py-1.5 text-xs rounded-md border border-amber-700/60 dark:border-amber-300/60 text-amber-900/70 dark:text-amber-100/70 cursor-not-allowed"
      >
        Set up sections →
      </button>
    </div>
  );
}
