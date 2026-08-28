import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  db,
  type Song,
  type SongCell,
  type SongKey,
  type SongKeyRunThrough,
  type SongMatrixSection,
  type SongPracticeLog,
  type SongSection,
} from '../../lib/db';
import {
  STAGES,
  deriveStage,
  freshnessFor,
  humanAgo,
} from './stage';
import { CardGrid, NO_MODULE_ACCENT } from '../../components/moduleHome/cardShell';
import { moduleMetaById } from '../../lib/moduleMeta';
import SongCard, { formatAddedDate, type SongCardProps } from './SongCard';
import AddSongModal from './AddSongModal';
import { getPref, setPref } from '../../lib/userPrefs';
import { dueByKeyId } from './matrix/proveKey';
import { songRetestState } from './songRetestState';
import {
  PRACTICE_WINDOW_DEFAULTS,
  getPracticeWindows,
  practiceIsStale,
  type PracticeWindows,
} from './practiceWindowPrefs';
import {
  SPACING_DEFAULTS,
  getSpacingSettings,
  windowsFrom,
  type SongKeySpacingSettings,
} from './spacingPrefs';
import { resolveSpelling } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';

interface Props {
  songs: Song[];
  onOpenSong: (songId: string) => void;
  /** Opens the song page at its chart rather than at the top. */
  onOpenLeadSheet: (songId: string) => void;
  /** Opens the want-to-learn backlog. It stopped being a tab when the
   *  ribbon went; Add Song is how it is reached now. */
  onOpenWantToLearn: () => void;
}

type SortMode =
  | 'learning-order'
  | 'date-added'
  | 'recent-practice'
  | 'alphabetical'
  | 'by-stage'
  | 'by-freshness';

const SORT_OPTIONS: Array<{ id: SortMode; label: string }> = [
  // learning-order is the canonical study sequence; drag-to-reorder
  // is enabled only in this mode (other modes use a non-draggable
  // 3-col grid so the user can browse without authoring the order).
  { id: 'learning-order',   label: 'Learning Order (Drag to Reorder)' },
  { id: 'date-added',       label: 'Date Added (Oldest First)' },
  { id: 'recent-practice',  label: 'Recently Practiced' },
  { id: 'alphabetical',     label: 'Alphabetical (A–Z)' },
  { id: 'by-stage',         label: 'By Stage' },
  { id: 'by-freshness',     label: 'By Freshness (Stalest First)' },
];

/** The module this home belongs to — its accent tints the cards. */
const MODULE_ID = 'repertoire';

const PREF_SORT_MODE = 'repertoireSortMode';
// One-time flag — flipped true the first time we land an existing user
// in learning-order mode after the v21 introduction. Without this, an
// older saved PREF_SORT_MODE (e.g. 'date-added') would overwrite the
// new default and hide the drag UI on refresh.
const PREF_LEARNING_ORDER_INTRODUCED = 'repertoireSortMode.learningOrderIntroduced';

// Rank used by the by-freshness sort — lower = shows earlier.
const FRESHNESS_RANK: Record<ReturnType<typeof freshnessFor>, number> = {
  stale: 0,
  aging: 1,
  recent: 2,
  fresh: 3,
};

export default function ActiveRepertoireView({
  songs, onOpenSong, onOpenLeadSheet, onOpenWantToLearn,
}: Props) {
  // THE MODULE'S OWN ACCENT, read the way every other module home reads
  // it. A song card is tinted by repertoire, not by a hex written here.
  const accentHex = moduleMetaById(MODULE_ID)?.accentHex ?? NO_MODULE_ACCENT;
  const [globalSpelling] = useSpelling();
  const [showAdd, setShowAdd] = useState(false);
  /** The Add Song menu, open or not. */
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('learning-order');
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const introduced = await getPref<boolean>(PREF_LEARNING_ORDER_INTRODUCED, false);
      if (!introduced) {
        // First open since the learning-order mode shipped — land the
        // user in it regardless of any stale saved sort pref, then
        // flip the flag so future loads honour whatever they pick.
        setSortMode('learning-order');
        await setPref(PREF_LEARNING_ORDER_INTRODUCED, true);
        await setPref(PREF_SORT_MODE, 'learning-order');
      } else {
        const s = await getPref<SortMode>(PREF_SORT_MODE, 'learning-order');
        if (SORT_OPTIONS.some(o => o.id === s)) setSortMode(s);
      }
      setPrefsLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (prefsLoaded) setPref(PREF_SORT_MODE, sortMode);
  }, [sortMode, prefsLoaded]);

  const logs = useLiveQuery<SongPracticeLog[]>(
    () => db.songPracticeLog.orderBy('timestamp').reverse().toArray(),
    [],
  ) ?? [];

  // Every song's key rows in one read, for the stage rules. This view
  // evaluates advancement for the whole active list, so a per-song
  // query would be one round trip per card; grouped below exactly
  // like `logs` and `crossKey`.
  const matrixKeys = useLiveQuery<SongKey[]>(
    () => db.songKeys.toArray(),
    [],
  ) ?? [];
  const keyRunThroughs = useLiveQuery<SongKeyRunThrough[]>(
    () => db.songKeyRunThroughs.toArray(),
    [],
  ) ?? [];
  // The three reads behind the section chips, grouped by song below in
  // the same shape as `logs` and `matrixKeys`. Whole-table like its
  // neighbours: this list already renders every song, so a per-song
  // query would be three round trips per card.
  //
  // ALL THREE, BECAUSE A CHIP SPANS ALL THREE. The tick is on the
  // lead-sheet section, the cell test is on `songCells`, and only
  // `songMatrixSections` knows which cell belongs to which section.
  const leadSheetSections = useLiveQuery<SongSection[]>(
    () => db.songSections.toArray(),
    [],
  ) ?? [];
  const matrixSections = useLiveQuery<SongMatrixSection[]>(
    () => db.songMatrixSections.toArray(),
    [],
  ) ?? [];
  const cells = useLiveQuery<SongCell[]>(
    () => db.songCells.toArray(),
    [],
  ) ?? [];
  // See SongDetailView: captured once, not read during render.
  const [advancementNow] = useState(() => Date.now());
  // See SongDetailView: async, and defaulting to never-proven holds
  // every rung rather than briefly dropping one on first paint.
  const [dueMap, setDueMap] = useState<ReadonlyMap<string, number | null>>(new Map());
  const [spacing, setSpacing] = useState<SongKeySpacingSettings>(SPACING_DEFAULTS);
  useEffect(() => {
    let live = true;
    void getSpacingSettings().then(s => { if (live) setSpacing(s); });
    return () => { live = false; };
  }, []);
  // How long each rung may go untouched. Read the same way the spacing
  // settings beside it are, and defaulting to the shipped values so the
  // first paint says what a reader who has never opened settings would
  // see anyway.
  const [practiceWindows, setPracticeWindows] =
    useState<PracticeWindows>(PRACTICE_WINDOW_DEFAULTS);
  useEffect(() => {
    let live = true;
    void getPracticeWindows().then(w => { if (live) setPracticeWindows(w); });
    return () => { live = false; };
  }, []);
  const allKeyIds = useMemo(() => matrixKeys.map(k => k.id).join(','), [matrixKeys]);
  useEffect(() => {
    let live = true;
    const ids = allKeyIds === '' ? [] : allKeyIds.split(',');
    void dueByKeyId(ids).then(m => { if (live) setDueMap(m); });
    return () => { live = false; };
  }, [allKeyIds]);

  const logsBySong = useMemo(() => {
    const m = new Map<string, SongPracticeLog[]>();
    for (const l of logs) {
      const arr = m.get(l.songId) ?? [];
      arr.push(l);
      m.set(l.songId, arr);
    }
    return m;
  }, [logs]);

  const keysBySong = useMemo(() => {
    const m = new Map<string, SongKey[]>();
    for (const k of matrixKeys) {
      const arr = m.get(k.songId) ?? [];
      arr.push(k);
      m.set(k.songId, arr);
    }
    return m;
  }, [matrixKeys]);

  const runsBySong = useMemo(() => {
    const m = new Map<string, SongKeyRunThrough[]>();
    for (const r of keyRunThroughs) {
      const arr = m.get(r.songId) ?? [];
      arr.push(r);
      m.set(r.songId, arr);
    }
    return m;
  }, [keyRunThroughs]);

  // Lead-sheet order is `order`, and it is sorted here rather than
  // relied on: `toArray()` gives Dexie's primary-key order, which is
  // the section id.
  const sectionsBySong = useMemo(() => {
    const m = new Map<string, SongSection[]>();
    for (const s of leadSheetSections) {
      const arr = m.get(s.songId) ?? [];
      arr.push(s);
      m.set(s.songId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.order - b.order);
    return m;
  }, [leadSheetSections]);

  const matrixSectionsBySong = useMemo(() => {
    const m = new Map<string, SongMatrixSection[]>();
    for (const s of matrixSections) {
      const arr = m.get(s.songId) ?? [];
      arr.push(s);
      m.set(s.songId, arr);
    }
    return m;
  }, [matrixSections]);

  const cellsBySong = useMemo(() => {
    const m = new Map<string, SongCell[]>();
    for (const c of cells) {
      const arr = m.get(c.songId) ?? [];
      arr.push(c);
      m.set(c.songId, arr);
    }
    return m;
  }, [cells]);

  // The songCrossKeyProgress query and its grouping are gone as of
  // 21 Aug 2026 — no advancement rule reads that @deprecated table.

  // Per-song freshness/advancement derived once so the dashboard
  // header and the cards share the same computation.
  const perSong = useMemo(() => {
    return songs.map(song => {
      const songLogs = logsBySong.get(song.id) ?? [];
      const lastPractisedAt = songLogs[0]?.timestamp ?? null;
      const freshness = freshnessFor(lastPractisedAt);
      // DERIVED here too. The list and the song page must agree about
      // what rung a song is on, and they can only do that by computing
      // it from the same evidence rather than by reading a value one
      // of them wrote.
      const derivedStage = deriveStage({
        songKeys: keysBySong.get(song.id) ?? [],
        keyRunThroughs: runsBySong.get(song.id) ?? [],
        performanceTempo: song.tempo ?? null,
        now: advancementNow,
        dueByKeyId: dueMap,
        dueWindows: windowsFrom(spacing),
        spelling: resolveSpelling(song.spelling, globalSpelling),
      });
      // Rolled up from the SAME dueMap the stage rules just read, so
      // the rung and the state appended to it cannot disagree about
      // whether a key is late.
      const retest = songRetestState(
        derivedStage,
        keysBySong.get(song.id) ?? [],
        dueMap,
        advancementNow,
        windowsFrom(spacing),
      );
      // NEGLECT, NOT DECAY — see `practiceWindowPrefs`. Derived beside
      // `retest` and deliberately not from it: a song whose keys are
      // all comfortably inside their intervals can still have been left
      // alone for a month.
      const practiceStale = practiceIsStale(
        lastPractisedAt, derivedStage, advancementNow, practiceWindows,
      );
      return {
        song, lastPractisedAt, freshness, derivedStage, retest, practiceStale,
        spelling: resolveSpelling(song.spelling, globalSpelling),
      };
    });
  }, [
    songs, logsBySong, keysBySong, runsBySong, advancementNow, globalSpelling,
    sectionsBySong, matrixSectionsBySong, cellsBySong, practiceWindows,
  ]);

  const sortedSongs = useMemo(() => {
    const rows = [...perSong];
    const byDateAdded = (a: Song, b: Song) => a.addedDate - b.addedDate;
    const byLearningOrder = (a: Song, b: Song) =>
      (a.learningOrder ?? Number.MAX_SAFE_INTEGER) -
      (b.learningOrder ?? Number.MAX_SAFE_INTEGER);
    switch (sortMode) {
      case 'learning-order':
        // Defensive fallback: rows without a learningOrder sort to
        // the end (shouldn't happen post-v21-upgrade, but defensive
        // in case sync delivers a pre-backfill row).
        rows.sort((a, b) => {
          const cmp = byLearningOrder(a.song, b.song);
          return cmp !== 0 ? cmp : byDateAdded(a.song, b.song);
        });
        break;
      case 'date-added':
        rows.sort((a, b) => byDateAdded(a.song, b.song));
        break;
      case 'recent-practice':
        rows.sort((a, b) => (b.lastPractisedAt ?? 0) - (a.lastPractisedAt ?? 0));
        break;
      case 'alphabetical':
        rows.sort((a, b) => a.song.title.localeCompare(b.song.title));
        break;
      case 'by-stage':
        rows.sort((a, b) => {
          const sa = STAGES.indexOf(a.derivedStage);
          const sb = STAGES.indexOf(b.derivedStage);
          if (sa !== sb) return sa - sb;
          return byDateAdded(a.song, b.song);
        });
        break;
      case 'by-freshness':
        rows.sort((a, b) => {
          const ra = FRESHNESS_RANK[a.freshness];
          const rb = FRESHNESS_RANK[b.freshness];
          if (ra !== rb) return ra - rb;
          return (a.lastPractisedAt ?? 0) - (b.lastPractisedAt ?? 0);
        });
        break;
    }
    return rows;
  }, [perSong, sortMode]);

  /**
   * One card's props, built in ONE place.
   *
   * Both branches below render the same card from the same row; two
   * hand-written prop lists is how the sortable one comes to be missing
   * the field the other just gained.
   */
  const cardProps = (row: typeof perSong[number]): SongCardProps => ({
    song: row.song,
    lastPractisedAt: row.lastPractisedAt,
    lastPractisedLabel: humanAgo(row.lastPractisedAt),
    addedLabel: formatAddedDate(row.song.addedDate),
    freshness: row.freshness,
    stage: row.derivedStage,
    retest: row.retest,
    practiceStale: row.practiceStale,
    accentHex,
    onOpen: () => onOpenSong(row.song.id),
    onOpenLeadSheet: () => onOpenLeadSheet(row.song.id),
  });

  // Drag-to-reorder — only active in learning-order mode. dnd-kit
  // sensors: pointer (5px activation distance prevents accidental
  // drags from intentional taps) + keyboard (accessibility — Space
  // picks up, arrows move, Space drops).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedSongs.findIndex(s => s.song.id === active.id);
    const newIndex = sortedSongs.findIndex(s => s.song.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(sortedSongs, oldIndex, newIndex);
    // Rewrite every row's learningOrder in one transaction. The
    // useLiveQuery on songs re-fires after commit, refreshing this
    // view with the new order.
    await db.transaction('rw', db.songs, async () => {
      for (let i = 0; i < newOrder.length; i++) {
        await db.songs.update(newOrder[i].song.id, { learningOrder: i + 1, updatedAt: Date.now() });
      }
    });
  };

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-4 sm:p-6 space-y-4">
      {/* THE COUNT BLOCK IS GONE, and with it the stage tally and the
          "N songs need attention" callout.

          It was a summary of the list directly beneath it: a hero
          number that counted the cards you could see, a stage line that
          re-totalled the badges on them, and an attention count that
          re-read the freshness dot each card already wears. Three
          answers to questions the cards answer per song, costing a band
          of vertical space above the thing the page is for. The stage
          counts live on the cards now, and due lives on the badges. */}
      <hr className="border-neutral-200 dark:border-neutral-800" />

      {/* Sort control */}
      <div className="flex items-center justify-end gap-2 flex-wrap text-xs">
        <label className="inline-flex items-center gap-1 text-neutral-500">
          sort by:
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* ONE GRID, EVERY SORT MODE. It used to be a full-width vertical
          list in learning-order and a hand-written 3-column grid in
          every other mode — two layouts for one list, and neither the
          one the other module homes use. `CardGrid` is that one, so a
          song card is the same object as a category card and the sort
          control no longer changes what the page looks like, only what
          order it is in.

          Reordering still belongs to learning-order alone; what changed
          is that the grip rides the card rather than a rail beside it,
          because a grid has no left-hand gutter to put one in. */}
      {sortedSongs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 p-8 text-center text-sm text-neutral-500">
          no songs yet. starter songs seed automatically — if you've cleared your data, click
          "add song" below.
        </div>
      ) : sortMode === 'learning-order' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedSongs.map(s => s.song.id)}
            strategy={rectSortingStrategy}
          >
            <CardGrid>
              {sortedSongs.map(row => (
                <SortableSongCard key={row.song.id} {...cardProps(row)} />
              ))}
            </CardGrid>
          </SortableContext>
        </DndContext>
      ) : (
        <CardGrid>
          {sortedSongs.map(row => (
            <SongCard key={row.song.id} {...cardProps(row)} />
          ))}
        </CardGrid>
      )}

      {/* =================================================================
          ADD SONG, AND THE TWO WAYS A SONG ARRIVES.

          The want-to-learn backlog used to be a tab, which put "the
          songs I might learn" beside "the songs I am learning" as
          though they were two views of one thing. They are not: the
          backlog is where a song comes FROM. So it is offered here,
          beside the other way one arrives, at the moment the reader is
          adding one.

          Both options do what they already did — the modal is
          unchanged and the backlog view is unchanged. Only the way in
          moved.
          ================================================================= */}
      <div className="flex justify-center">
        <div className="relative">
          <button
            onClick={() => setAddMenuOpen(o => !o)}
            aria-expanded={addMenuOpen}
            aria-haspopup="menu"
            data-testid="add-song"
            className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
          >
            Add Song
          </button>
          {addMenuOpen && (
            <div
              role="menu"
              data-testid="add-song-menu"
              className="absolute left-1/2 -translate-x-1/2 mt-1 z-20 min-w-[15rem] rounded-lg border border-black/[0.07] bg-white dark:bg-neutral-900 shadow-[0_4px_16px_rgba(0,0,0,0.12)] p-1"
            >
              <button
                role="menuitem"
                data-testid="add-song-from-backlog"
                onClick={() => { setAddMenuOpen(false); onOpenWantToLearn(); }}
                className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Add from Want to Learn List
              </button>
              <button
                role="menuitem"
                data-testid="add-song-new"
                onClick={() => { setAddMenuOpen(false); setShowAdd(true); }}
                className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Add New Song
              </button>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <AddSongModal
          onClose={() => setShowAdd(false)}
          onAdded={(songId) => { setShowAdd(false); onOpenSong(songId); }}
        />
      )}
    </section>
  );
}

/**
 * A song card that can be dragged, in the grid it already sits in.
 *
 * THE GRIP RIDES THE CARD. It used to be a rail to the left of a
 * full-width row, which a grid has no room for — so the handle is
 * handed to `SongCard` as its title line's leading element, where it
 * reads as part of the card rather than as furniture around it.
 *
 * Props are `SongCardProps` exactly, derived rather than restated: a
 * hand-copied list meant adding a field to the card broke this in a
 * second place, and could as easily have gone unnoticed until the
 * wrapper silently stopped forwarding it.
 */
function SortableSongCard(props: SongCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.song.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex">
      <div className="flex-1 min-w-0">
        <SongCard
          {...props}
          dragHandle={(
            <button
              type="button"
              aria-label={`drag to reorder ${props.song.title}`}
              {...attributes}
              {...listeners}
              className="float-left mr-1.5 mt-0.5 px-1 rounded text-neutral-400 hover:text-neutral-700 cursor-grab active:cursor-grabbing touch-none"
            >
              <span aria-hidden className="font-mono text-xs leading-none">⋮⋮</span>
            </button>
          )}
        />
      </div>
    </div>
  );
}
