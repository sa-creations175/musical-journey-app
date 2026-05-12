import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Song } from '../../lib/db';
import ModuleIntro from '../../components/ModuleIntro';
import { getPref, setPref } from '../../lib/userPrefs';
import { useUrlTabSync } from '../../lib/useUrlTabSync';
import { migrateSongsToMatrixIfNeeded } from './matrixMigration';
import { seedRepertoireIfNeeded } from './seedSongs';
import ActiveRepertoireView from './ActiveRepertoireView';
import SongDetailView from './SongDetailView';
import WantToLearnView from './WantToLearnView';
// Side-effect import: registers `__inspectSongKeys(songId)` on
// `window` so the matrix's original-key state can be inspected from
// the browser console without a module import path.
import './devInspectSongKeys';

type TabId = 'active' | 'detail' | 'want-to-learn';

function isTabId(v: string): v is TabId {
  return v === 'active' || v === 'detail' || v === 'want-to-learn';
}

const PREF_ACTIVE_TAB = 'repertoireActiveTab';
const PREF_SELECTED_SONG = 'repertoireSelectedSongId';

const TABS: Array<{ id: TabId; label: string; hint: string }> = [
  { id: 'active',        label: 'active repertoire',  hint: 'songs you\'re working on' },
  { id: 'detail',        label: 'song detail',         hint: 'open a single song' },
  { id: 'want-to-learn', label: 'want to learn',       hint: 'your backlog of future songs' },
];

export default function Repertoire() {
  const [tab, setTab] = useState<TabId>('active');
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Seed the 7 starter songs on first load (idempotent — guards on
  // both a pref marker and an existing-songs-count check). Runs in
  // the background; Active view will live-update when songs arrive.
  useEffect(() => {
    seedRepertoireIfNeeded().catch(err => {
      console.error('[repertoire] seed failed', err);
    });
  }, []);

  // Phase 1.5 step 2 — auto-populate songKeys for every existing
  // song so the section × key matrix has a starting state.
  // Idempotent: re-runs are no-ops once every song has its
  // original-key row. Lifecycle-aware: the helper awaits sync-ready
  // before writing. See src/modules/repertoire/matrixMigration.ts.
  useEffect(() => {
    void migrateSongsToMatrixIfNeeded().catch(err => {
      console.warn('[repertoire] matrix migration failed', err);
    });
  }, []);

  useEffect(() => {
    (async () => {
      const t = await getPref<TabId>(PREF_ACTIVE_TAB, 'active');
      if (isTabId(t)) {
        setTab(t);
      }
      const s = await getPref<string | null>(PREF_SELECTED_SONG, null);
      if (typeof s === 'string' && s.length > 0) setSelectedSongId(s);
      setPrefsLoaded(true);
    })();
  }, []);

  // Sidebar sub-items land here as /repertoire?tab=want-to-learn.
  useUrlTabSync<TabId>('tab', isTabId, setTab);

  useEffect(() => { if (prefsLoaded) setPref(PREF_ACTIVE_TAB, tab); }, [tab, prefsLoaded]);
  useEffect(() => {
    if (!prefsLoaded) return;
    setPref(PREF_SELECTED_SONG, selectedSongId);
  }, [selectedSongId, prefsLoaded]);

  // Pre-sort by learningOrder so any consumer that doesn't apply its
  // own sort (e.g. SongDetailView's jump-to dropdown) ends up in study
  // sequence by default. ActiveRepertoireView re-sorts based on its
  // own sort-mode pref, so the order here doesn't matter for that view.
  const songs = useLiveQuery<Song[]>(
    () => db.songs
      .toArray()
      .then(rows => rows.sort(
        (a, b) =>
          (a.learningOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.learningOrder ?? Number.MAX_SAFE_INTEGER),
      )),
    [],
  ) ?? [];

  const openSong = (songId: string) => {
    setSelectedSongId(songId);
    setTab('detail');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">song repertoire</h1>
        <p className="text-neutral-500 text-sm">
          songs you're learning, maintaining, and stretching across 12 keys.
        </p>
      </div>

      {/* Module-level explainer only on the Active tab — when the
          user has drilled into a single song or is browsing the
          want-to-learn list, the broad context isn't useful. */}
      {tab === 'active' && (
        <ModuleIntro
          accent="green"
          headline="Your song repertoire — where theory meets practice."
          description="Track each song's stage, keep it fresh across weeks, and stretch its sections through 12 keys. The lead sheet is your working canvas; the practice log is your diary."
          bullets={[
            'Five **learning stages** with coaching guidance',
            'Per-section **cross-key** mastery across all 12 keys',
            'Lead sheets with **chord parsing** that surfaces known progressions',
            '**Practice session log** — freshness, feel ratings, notes',
          ]}
        />
      )}

      <nav
        className="flex items-center gap-1 p-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur flex-wrap"
        aria-label="repertoire view"
      >
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            title={t.hint}
            className={`flex-1 min-w-[150px] px-3 py-2 rounded-md text-sm transition text-center ${
              tab === t.id
                ? 'bg-fluent text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <div className="font-medium">{t.label}</div>
            <div className={`text-[10px] mt-0.5 ${tab === t.id ? 'text-white/80' : 'text-neutral-500'}`}>
              {t.hint}
            </div>
          </button>
        ))}
      </nav>

      {tab === 'active' && (
        <ActiveRepertoireView
          songs={songs}
          onOpenSong={openSong}
        />
      )}
      {tab === 'detail' && (
        <SongDetailView
          songId={selectedSongId}
          songs={songs}
          onSelectSong={setSelectedSongId}
          onBackToActive={() => setTab('active')}
        />
      )}
      {tab === 'want-to-learn' && (
        <WantToLearnView
          onPromoted={(songId) => {
            setSelectedSongId(songId);
            setTab('detail');
          }}
        />
      )}
    </div>
  );
}
