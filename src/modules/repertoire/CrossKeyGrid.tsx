import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SongCrossKeyProgress, type SongSection } from '../../lib/db';
import { humanAgo } from './stage';

// Fixed 12-key order matching the app's common KEYS convention: sharps
// and flats mixed for a pianist-familiar layout.
const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

interface Props {
  songId: string;
  section: SongSection;
  originalKey?: string;
}

function progressId(songId: string, sectionId: string, keyName: string): string {
  return `${songId}:${sectionId}:${keyName}`;
}

/**
 * Per-section 12-key practice grid. Clicking a key logs a quick
 * practice event (bumps sessionCount + lastPracticed). Long-press /
 * right-click toggles the "mastered" flag — explicit user action,
 * never auto-promoted.
 */
export default function CrossKeyGrid({ songId, section, originalKey }: Props) {
  const rows = useLiveQuery<SongCrossKeyProgress[]>(
    () => db.songCrossKeyProgress
      .where('[songId+sectionId]').equals([songId, section.id])
      .toArray(),
    [songId, section.id],
  ) ?? [];

  const byKey = new Map(rows.map(r => [r.keyName, r]));

  const bumpKey = async (keyName: string) => {
    const id = progressId(songId, section.id, keyName);
    const existing = await db.songCrossKeyProgress.get(id);
    const now = Date.now();
    if (existing) {
      await db.songCrossKeyProgress.put({
        ...existing,
        sessionCount: existing.sessionCount + 1,
        lastPracticed: now,
      });
    } else {
      await db.songCrossKeyProgress.add({
        id,
        songId,
        sectionId: section.id,
        keyName,
        sessionCount: 1,
        lastPracticed: now,
        mastered: false,
      });
    }
  };

  const toggleMastered = async (keyName: string) => {
    const id = progressId(songId, section.id, keyName);
    const existing = await db.songCrossKeyProgress.get(id);
    const now = Date.now();
    if (existing) {
      await db.songCrossKeyProgress.put({ ...existing, mastered: !existing.mastered });
    } else {
      await db.songCrossKeyProgress.add({
        id,
        songId,
        sectionId: section.id,
        keyName,
        sessionCount: 0,
        lastPracticed: now,
        mastered: true,
      });
    }
  };

  // Most-recent practice line — shown under the grid as a rolling
  // "last time you touched X in Y" line.
  const mostRecent = rows.reduce<SongCrossKeyProgress | null>((acc, row) => {
    if (!acc || row.lastPracticed > acc.lastPracticed) return row;
    return acc;
  }, null);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
        {KEYS.map(k => {
          const row = byKey.get(k);
          const isOriginal = originalKey === k;
          const started = row !== undefined && row.sessionCount > 0;
          const mastered = row?.mastered === true;
          return (
            <button
              key={k}
              onClick={() => bumpKey(k)}
              onContextMenu={e => { e.preventDefault(); toggleMastered(k); }}
              title={
                (row === undefined
                  ? 'not practised yet — click to log a pass'
                  : `${row.sessionCount} session${row.sessionCount === 1 ? '' : 's'} · last ${humanAgo(row.lastPracticed)}`) +
                '\nright-click to toggle mastered'
              }
              className={`relative rounded-md border px-1 py-1.5 text-xs font-mono transition ${
                mastered
                  ? 'border-mastered bg-mastered/10 text-mastered'
                  : started
                    ? 'border-fluent/40 bg-fluent/5 text-fluent'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-400 hover:border-fluent hover:text-fluent'
              }`}
            >
              <span>{k}</span>
              {row && row.sessionCount > 0 && (
                <span className="absolute top-0.5 right-0.5 text-[8px] font-mono tabular-nums opacity-70">
                  {row.sessionCount}
                </span>
              )}
              {mastered && (
                <span aria-hidden className="absolute bottom-0.5 right-1 text-[8px]">✓</span>
              )}
              {isOriginal && (
                <span aria-hidden className="absolute top-0.5 left-0.5 text-[8px] opacity-60" title="original key">★</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-neutral-500">
        {mostRecent === null
          ? 'no cross-key practice yet. tap a key above or log a full session to track progress.'
          : `last practised ${section.name} in ${mostRecent.keyName} ${humanAgo(mostRecent.lastPracticed)}`}
      </p>
      <p className="text-[10px] text-neutral-400">
        click a key to log a quick pass · right-click to toggle mastered · ★ = original key
      </p>
    </div>
  );
}
