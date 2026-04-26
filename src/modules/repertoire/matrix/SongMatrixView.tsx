import { useCallback, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  type Song,
  type SongCell,
  type SongKey,
  type SongKeyRunThrough,
  type SongMatrixSection,
} from '../../../lib/db';
import CellInteractionModal from './CellInteractionModal';
import CrossKeyFollowupModal from './CrossKeyFollowupModal';
import MatrixGrid from './MatrixGrid';
import SectionSetupBanner from './SectionSetupBanner';
import SectionSetupModal from './SectionSetupModal';
import WholeSongTestBanner from './WholeSongTestBanner';
import WholeSongTestModal from './WholeSongTestModal';
import { computeSolidDecayState } from './solidDecay';
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
  // refreshKey is bumped after every save we route through this view
  // (cell save, test save). It's added to all four useLiveQuery deps
  // below so each write tears down and re-creates the live
  // subscription, guaranteeing fresh data on the next render.
  //
  // Why this is necessary: useLiveQuery's auto-refresh-on-change
  // doesn't fire reliably here — confirmed via the retest decay-
  // badge bug, where solidDecayState was correctly written to 'solid'
  // in IndexedDB but the parent's songKeys array stayed stale, so
  // KeyStrip's live-derive saw the pre-save lapsed value. Same
  // symptom and same workaround as VacationManager. Explicit
  // refresh-on-write is a small, targeted band-aid until we figure
  // out the root cause across the codebase.
  const [refreshKey, setRefreshKey] = useState(0);

  const sections = useLiveQuery(
    () => db.songMatrixSections.where('songId').equals(song.id).sortBy('displayOrder'),
    [song.id, refreshKey],
    [] as SongMatrixSection[],
  );
  const songKeys = useLiveQuery(
    () => db.songKeys.where('songId').equals(song.id).toArray(),
    [song.id, refreshKey],
    [] as SongKey[],
  );
  const songCells = useLiveQuery(
    () => db.songCells.where('songId').equals(song.id).toArray(),
    [song.id, refreshKey],
    [] as SongCell[],
  );
  // Whole-song test run-throughs — one query for all 12 keys,
  // grouped/derived once below. sortBy('createdAt') so the latest
  // row per key sits at the end of its group, ready to read for
  // the streak. Reverse-sort would also work; this matches the
  // append-only semantics of the log.
  const songKeyRunThroughs = useLiveQuery(
    () => db.songKeyRunThroughs.where('songId').equals(song.id).sortBy('createdAt'),
    [song.id, refreshKey],
    [] as SongKeyRunThrough[],
  );

  // Modal lifecycle for the section setup flow lives here so the
  // banner can stay a stateless presentational component.
  // closeSetup is memoized so the SectionSetupModal's handleClose
  // (also memoized) stays stable across re-renders — Modal's
  // focus-handling useEffect treats onClose as a dep and would
  // otherwise re-fire on every keystroke, stealing focus from the
  // modal's text inputs.
  const [setupOpen, setSetupOpen] = useState(false);
  const closeSetup = useCallback(() => setSetupOpen(false), []);

  // Cross-key follow-up modal — auto-fires once per mount when the
  // song was migrated from legacy `stage: 'cross-key'`, sections
  // exist, and no non-original songKeys rows exist yet. Same close-
  // handler memoization rationale as closeSetup.
  const [crossKeyOpen, setCrossKeyOpen] = useState(false);
  const [crossKeyAutoFired, setCrossKeyAutoFired] = useState(false);
  const closeCrossKey = useCallback(() => setCrossKeyOpen(false), []);

  // Cell interaction modal — opens on cell tap. The ID-only state
  // lets the parent stay agnostic about cell internals; the modal
  // resolves cell + songKey + section + siblings from props passed
  // by this component below. handleCellTap memoized for stable
  // reference passed down through MatrixGrid → KeyRow → CellSquare.
  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const handleCellTap = useCallback((cellId: string) => setActiveCellId(cellId), []);
  const closeCellModal = useCallback(() => setActiveCellId(null), []);

  // Whole-song test modal — same ID-only pattern. The banner and
  // each KeyStrip's "Run test" button both call handleRunTest. Modal
  // resolves songKey + sibling cells + starting streak from
  // already-loaded data below.
  const [activeTestKeyId, setActiveTestKeyId] = useState<string | null>(null);
  const handleRunTest = useCallback((keyId: string) => setActiveTestKeyId(keyId), []);
  const closeTestModal = useCallback(() => setActiveTestKeyId(null), []);

  const visibleSections = useMemo(
    () => sections.filter(s => !s.isArchived),
    [sections],
  );
  const originalKey = useMemo(
    () => songKeys.find(k => k.isOriginalKey) ?? null,
    [songKeys],
  );
  // Date.now() snapshot for live-derived decay. Captured via lazy
  // useState initializer (purity rule disallows calling Date.now()
  // during render). Re-stamped by bumpRefresh after every save so
  // the live-derive reads against current time on the next render —
  // matters when the just-saved row's lastEngagedAt is a fresh
  // timestamp and we want decay state to reflect it (otherwise
  // daysSince would be computed against a stale `now`).
  const [now, setNow] = useState(() => Date.now());

  // Mirrors VacationManager's bumpRefresh — pumps both the live-
  // query cycle (refreshKey) and the live-derive clock (now) so any
  // post-save consumer gets fresh data + fresh wall-clock reference.
  // Modals call this after their save commits, before handleClose.
  const bumpRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
    setNow(Date.now());
  }, []);

  const songLevelState = useMemo(
    () => computeSongLevelState(songKeys, songCells, visibleSections.length, now),
    [songKeys, songCells, visibleSections.length, now],
  );

  // Decay aggregates for the header pills. Walk songKeys once with
  // live-derive — 12 keys max so memoization isn't worth the cache-
  // invalidation noise (now changes every render).
  let fadingKeyCount = 0;
  let lapsedKeyCount = 0;
  for (const k of songKeys) {
    const state = computeSolidDecayState(k, now);
    if (state === 'fading') fadingKeyCount++;
    else if (state === 'lapsed') lapsedKeyCount++;
  }

  // Cross-key follow-up eligibility — fires once per mount when:
  //   - The song was migrated from legacy `stage: 'cross-key'`
  //     (the only signal we have that the user was working other
  //     keys before the matrix model existed).
  //   - Sections exist (we need them to materialize cells against).
  //   - songKeys still holds only the original-key row (defensive
  //     guard against re-firing if the user already added keys).
  //
  // Render-time setState pattern (per React docs "storing
  // information from previous renders"): once auto-fired, the
  // guard `!crossKeyAutoFired` prevents any re-trigger for the
  // rest of this mount, even if the user dismisses the modal.
  // Re-mounting (navigate away and back) re-evaluates: skipped
  // users with no non-original keys still match the eligibility,
  // so the modal re-opens — that's the intentional "give them
  // another chance" behaviour. A persistent opt-out can layer on
  // later if it becomes annoying.
  const eligibleForCrossKey =
    song.stage === 'cross-key'
    && visibleSections.length > 0
    && songKeys.length === 1
    && songKeys[0]?.isOriginalKey === true;

  if (eligibleForCrossKey && !crossKeyAutoFired) {
    setCrossKeyAutoFired(true);
    setCrossKeyOpen(true);
  }

  // Resolve the active cell + its peers from already-loaded data.
  // No additional queries — everything's in scope from the live
  // queries above. activeCell can briefly be undefined right after
  // a save closes the modal (activeCellId still set for one render
  // before closeCellModal fires); the conditional render below
  // handles both states cleanly.
  const activeCell = activeCellId
    ? songCells.find(c => c.id === activeCellId) ?? null
    : null;
  const activeSongKey = activeCell
    ? songKeys.find(k => k.id === activeCell.songKeyId) ?? null
    : null;
  const activeSection = activeCell
    ? sections.find(s => s.id === activeCell.sectionId) ?? null
    : null;
  const activeSiblingCells = useMemo(
    () => activeCell
      ? songCells.filter(c => c.songKeyId === activeCell.songKeyId)
      : [],
    [activeCell, songCells],
  );

  // Whole-song test summaries — one map keyed by songKeyId. Just a
  // total-attempt count: discrete-session semantics mean any latest
  // streak from a prior session is meaningless to surface on the
  // strip (next session resets to 0). The cumulative count tracks
  // honest effort over time.
  const testSummariesByKeyId = useMemo(() => {
    const m = new Map<string, { totalAttempts: number }>();
    for (const rt of songKeyRunThroughs) {
      const prior = m.get(rt.songKeyId);
      m.set(rt.songKeyId, {
        totalAttempts: (prior?.totalAttempts ?? 0) + 1,
      });
    }
    return m;
  }, [songKeyRunThroughs]);

  // Banner eligibility: keyState === 'comfortable' AND test never
  // passed. Sorted by lastEngagedAt desc so the most recently worked
  // key is the banner's primary action target — that's the one the
  // user is most likely thinking about. Solid keys self-exclude
  // because their wholeSongTestPassedAt is set.
  const eligibleTestKeys = useMemo(
    () => songKeys
      .filter(k => k.keyState === 'comfortable' && k.wholeSongTestPassedAt === null)
      .sort((a, b) => (b.lastEngagedAt ?? 0) - (a.lastEngagedAt ?? 0)),
    [songKeys],
  );

  // Resolve the active test target + its sibling cells. Same
  // briefly-undefined-after-save pattern as the cell modal.
  const activeTestKey = activeTestKeyId
    ? songKeys.find(k => k.id === activeTestKeyId) ?? null
    : null;
  const activeTestSiblingCells = useMemo(
    () => activeTestKey
      ? songCells.filter(c => c.songKeyId === activeTestKey.id)
      : [],
    [activeTestKey, songCells],
  );
  // Retest semantics: if the active key is currently lapsed, this is
  // a retest. Pass-through to the modal for title/copy/audit-flag.
  const activeTestIsRetest = activeTestKey !== null
    && computeSolidDecayState(activeTestKey, now) === 'lapsed';

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
        fadingKeyCount={fadingKeyCount}
        lapsedKeyCount={lapsedKeyCount}
      />

      {visibleSections.length === 0 && (
        <SectionSetupBanner onSetUp={() => setSetupOpen(true)} />
      )}

      <WholeSongTestBanner
        eligibleKeys={eligibleTestKeys}
        onRunTest={handleRunTest}
      />

      <MatrixGrid
        sections={sections}
        songKeys={songKeys}
        songCells={songCells}
        testSummariesByKeyId={testSummariesByKeyId}
        now={now}
        onCellTap={handleCellTap}
        onRunTest={handleRunTest}
      />

      <SectionSetupModal
        open={setupOpen}
        onClose={closeSetup}
        song={song}
        songKeys={songKeys}
      />

      {originalKey && (
        <CrossKeyFollowupModal
          open={crossKeyOpen}
          onClose={closeCrossKey}
          song={song}
          originalKey={originalKey.keyName}
          visibleSections={visibleSections}
        />
      )}

      {activeCell && activeSongKey && activeSection && (
        <CellInteractionModal
          key={activeCell.id}
          open={true}
          onClose={closeCellModal}
          onSaved={bumpRefresh}
          cell={activeCell}
          songKey={activeSongKey}
          section={activeSection}
          song={song}
          siblingCells={activeSiblingCells}
          totalSections={visibleSections.length}
        />
      )}

      {activeTestKey && (
        <WholeSongTestModal
          key={activeTestKey.id}
          open={true}
          onClose={closeTestModal}
          onSaved={bumpRefresh}
          songKey={activeTestKey}
          song={song}
          siblingCells={activeTestSiblingCells}
          totalSections={visibleSections.length}
          isRetest={activeTestIsRetest}
        />
      )}
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
  fadingKeyCount: number;
  lapsedKeyCount: number;
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
  fadingKeyCount,
  lapsedKeyCount,
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
        {fadingKeyCount > 0 && (
          <span
            className="inline-flex items-center px-2 py-1 rounded-full text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 tabular-nums"
            title="Solid keys past 14 days without engagement"
          >
            {fadingKeyCount} fading
          </span>
        )}
        {lapsedKeyCount > 0 && (
          <span
            className="inline-flex items-center px-2 py-1 rounded-full text-[11px] bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 tabular-nums"
            title="Solid keys past 30 days — retest recommended"
          >
            {lapsedKeyCount} lapsed
          </span>
        )}
      </div>
    </header>
  );
}

