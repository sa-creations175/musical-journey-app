import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Song } from '../../lib/db';
import ModuleIntro from '../../components/ModuleIntro';
import { getPref, setPref } from '../../lib/userPrefs';
import { seedRepertoireIfNeeded } from './seedSongs';
import ActiveRepertoireView from './ActiveRepertoireView';
import SongDetailView from './SongDetailView';
import WantToLearnView from './WantToLearnView';

type TabId = 'active' | 'detail' | 'want-to-learn';

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

  useEffect(() => {
    (async () => {
      const t = await getPref<TabId>(PREF_ACTIVE_TAB, 'active');
      if (t === 'active' || t === 'detail' || t === 'want-to-learn') {
        setTab(t);
      }
      const s = await getPref<string | null>(PREF_SELECTED_SONG, null);
      if (typeof s === 'string' && s.length > 0) setSelectedSongId(s);
      setPrefsLoaded(true);
    })();
  }, []);

  useEffect(() => { if (prefsLoaded) setPref(PREF_ACTIVE_TAB, tab); }, [tab, prefsLoaded]);
  useEffect(() => {
    if (!prefsLoaded) return;
    setPref(PREF_SELECTED_SONG, selectedSongId);
  }, [selectedSongId, prefsLoaded]);

  const songs = useLiveQuery<Song[]>(() => db.songs.toArray(), []) ?? [];

  const openSong = (songId: string) => {
    setSelectedSongId(songId);
    setTab('detail');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">repertoire</h1>
        <p className="text-neutral-500 text-sm">
          songs you're learning, maintaining, and stretching across 12 keys.
        </p>
      </div>

      <ModuleIntro
        accent="green"
        headline="Songs are where theory meets practice."
        description="Track each song's stage, keep it fresh across weeks, and stretch its sections through 12 keys. The lead sheet is your working canvas; the practice log is your diary."
        bullets={[
          'Five **learning stages** with coaching guidance',
          'Per-section **cross-key** mastery across all 12 keys',
          'Lead sheets with **chord parsing** that surfaces known progressions',
          '**Practice session log** — freshness, feel ratings, notes',
        ]}
      />

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
