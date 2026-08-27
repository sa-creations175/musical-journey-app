import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Song } from '../../lib/db';
import ModuleHomeHeader from '../../components/moduleHome/ModuleHomeHeader';
import { getPref, setPref } from '../../lib/userPrefs';
import { useUrlTabSync } from '../../lib/useUrlTabSync';
import { migrateSongsToMatrixIfNeeded } from './matrixMigration';
import { materialiseAllSongs } from './matrix/materialise';
import { seedRepertoireIfNeeded } from './seedSongs';
import { seedVoicingPatternsIfNeeded } from '../shapes-and-patterns/seedVoicingPatterns';
import ActiveRepertoireView from './ActiveRepertoireView';
import SongDetailView from './SongDetailView';
import WantToLearnView from './WantToLearnView';
// Side-effect import: registers `__inspectSongKeys(songId)` on
// `window` so the matrix's original-key state can be inspected from
// the browser console without a module import path.
import './devInspectSongKeys';
import './devInspectChordDurations';
import './devInspectSlotPositions';
import './devInspectBarTiling';

/**
 * =====================================================================
 * THE TAB STRIP IS GONE. THE SONG CARDS DO ITS WORK.
 *
 * It named three things — active repertoire, song detail, want to
 * learn — and only one of them was a place. "Song detail" was a tab
 * that meant nothing until you had already opened a song from another
 * tab, and "active repertoire" named the page you were looking at. The
 * module home opens on its songs now, one card each, the way every
 * other module home opens on its categories.
 *
 * THE THREE STATES SURVIVE; only the ribbon is deleted. A card opens a
 * song, the song page comes back, and the want-to-learn list is reached
 * from Add Song. The nav's `?tab=` sub-items still land where they
 * always did, because `useUrlTabSync` still reads them.
 * =====================================================================
 */
type TabId = 'active' | 'detail' | 'want-to-learn';

function isTabId(v: string): v is TabId {
  return v === 'active' || v === 'detail' || v === 'want-to-learn';
}

const PREF_ACTIVE_TAB = 'repertoireActiveTab';
const PREF_SELECTED_SONG = 'repertoireSelectedSongId';

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
    // Seed the system voicing-pattern catalog the lead-sheet voicing
    // carousel draws from (idempotent; system rows never sync). See
    // docs/VOICING_CAROUSEL_DESIGN.md.
    seedVoicingPatternsIfNeeded().catch(err => {
      console.error('[repertoire] voicing-pattern seed failed', err);
    });
  }, []);

  // Phase 1.5 step 2 — auto-populate songKeys for every existing
  // song so the section × key matrix has a starting state.
  // Idempotent: re-runs are no-ops once every song has its
  // original-key row. Lifecycle-aware: the helper awaits sync-ready
  // before writing. See src/modules/repertoire/matrixMigration.ts.
  useEffect(() => {
    void migrateSongsToMatrixIfNeeded()
      // Then fill every song's grid: all twelve keys, every section, a
      // real cell in each intersection. Chained rather than parallel —
      // materialisation builds on the original-key row the migration
      // creates. Both are idempotent and both wait for sync-ready, so
      // the rows reach Supabase instead of being deleted as orphans by
      // the next replace-mode pull.
      .then(() => materialiseAllSongs())
      .catch(err => {
        console.warn('[repertoire] matrix materialisation failed', err);
      });
  }, []);

  // Declared above the prefs-load effect so that effect can defer to an
  // incoming deep-link songId (see below).
  const [searchParams] = useSearchParams();

  useEffect(() => {
    (async () => {
      const t = await getPref<TabId>(PREF_ACTIVE_TAB, 'active');
      if (isTabId(t)) {
        setTab(t);
      }
      // Only restore the persisted last-selected song when there's NO
      // incoming deep-link songId. This async read resolves a tick
      // after the synchronous deep-link effect below sets selectedSongId;
      // without this guard it would land later and clobber the deep-link
      // target — opening the last-opened song instead of the one a
      // session block / deep link asked for (e.g. a "Run through Mirror"
      // block opening "Can We Talk"). The deep-link effect owns the song
      // in that case.
      const incomingSongId = searchParams.get('songId');
      if (!incomingSongId) {
        const s = await getPref<string | null>(PREF_SELECTED_SONG, null);
        if (typeof s === 'string' && s.length > 0) setSelectedSongId(s);
      }
      setPrefsLoaded(true);
    })();
    // Mount-only: reads the initial songId param to decide whether to
    // restore the persisted song. Subsequent param changes are handled
    // by the deep-link effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sidebar sub-items land here as /repertoire?tab=want-to-learn.
  useUrlTabSync<TabId>('tab', isTabId, setTab);

  // Deep-link support: /repertoire?songId=<id> jumps to the named
  // song's detail view. Used by post-comfortable whole-song-run
  // session blocks so the active-session quick-launch lands on the
  // exact song. Reads the param once per URL change and applies it
  // alongside the existing tab/songId state machine.
  useEffect(() => {
    const incomingSongId = searchParams.get('songId');
    if (incomingSongId && incomingSongId.length > 0) {
      setSelectedSongId(incomingSongId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

  /**
   * A card's Lead Sheet button: the same page, arriving at the chart.
   *
   * A COUNTER rather than a flag, so pressing it twice on the same song
   * scrolls twice — see `focusLeadSheet` on SongDetailView.
   */
  const [focusLeadSheet, setFocusLeadSheet] = useState(0);
  const openLeadSheet = (songId: string) => {
    openSong(songId);
    setFocusLeadSheet(n => n + 1);
  };

  return (
    <div className="space-y-3">
      {/* ONE CALENDAR LINK ON THE PAGE, AND IT KNOWS WHERE IT IS.
          The song detail renders under this header, so a song page had
          two: this one, pointing at the all-songs calendar and
          appearing to do nothing from inside a song, and a working
          `?songId=` link on the matrix card. The header's link now
          carries the song when one is open, and the matrix has none. */}
      <ModuleHomeHeader
        moduleIds={['repertoire']}
        moduleId="repertoire"
        calendarTo={selectedSongId === null
          ? '/repertoire/calendar'
          : `/repertoire/calendar?songId=${encodeURIComponent(selectedSongId)}`}
        intro={{
          description: 'Bring songs to life by mastering each song, section by section, key by key.',
        }}
      />

      {tab === 'active' && (
        <ActiveRepertoireView
          songs={songs}
          onOpenSong={openSong}
          onOpenLeadSheet={openLeadSheet}
          onOpenWantToLearn={() => setTab('want-to-learn')}
        />
      )}
      {tab === 'detail' && (
        <SongDetailView
          songId={selectedSongId}
          songs={songs}
          onSelectSong={setSelectedSongId}
          onBackToActive={() => setTab('active')}
          focusLeadSheet={focusLeadSheet}
        />
      )}
      {tab === 'want-to-learn' && (
        <WantToLearnView
          onBack={() => setTab('active')}
          onPromoted={(songId) => {
            setSelectedSongId(songId);
            setTab('detail');
          }}
        />
      )}
    </div>
  );
}
