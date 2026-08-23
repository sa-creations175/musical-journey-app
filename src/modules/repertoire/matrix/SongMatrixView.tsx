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
import type { DueWindows } from './keySpacing';
import SingleRunModal from './SingleRunModal';
import CrossKeyFollowupModal from './CrossKeyFollowupModal';
import MatrixGrid from './MatrixGrid';
import WholeSongTestBanner from './WholeSongTestBanner';
import WholeSongTestModal from './WholeSongTestModal';
import { computeSolidDecayState } from './solidDecay';
import { hasCrossKeyEngagement } from './songLevelState';
import { useSongSpelling } from '../useSongSpelling';

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
  /** When true, the matrix renders inline as part of the song detail
   *  page — hides the "← song detail" back link (we're already on
   *  the song detail) and lets the parent section card own the
   *  surrounding chrome. Defaults to false for the legacy
   *  full-page replacement mode. */
  embedded?: boolean;
  /** When provided, a cell tap is delegated to the parent instead of
   *  opening this component's own modal. See `handleCellTap`. */
  onCellSelected?: (cellId: string) => void;
  /** When each key is next due to be proven, and the user's windows.
   *  Resolved by the page — the same read the stage rules use, rather
   *  than a second one that could disagree with them. */
  dueByKeyId?: ReadonlyMap<string, number | null>;
  dueWindows?: DueWindows;
  /** songKey ids where one clean at-tempo run advances something.
   *  Resolved by the page from `keysWhereRunCounts` — the same
   *  reading the criteria panel uses. */
  runCountsForKeyIds?: ReadonlySet<string>;
}

export default function SongMatrixView({
  song, onClose, embedded, onCellSelected, dueByKeyId, dueWindows,
  runCountsForKeyIds,
}: Props) {
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

  // Resolved ONCE for the whole page. Passed to the grid and the banner
  // rather than each reading the setting themselves — twelve rows and a
  // banner disagreeing about one key's name is precisely the failure
  // this seam exists to prevent, and it would look like a render bug.
  // The modals below take `song` already and call the same resolver.
  const spelling = useSongSpelling(song);

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

  // Cross-key follow-up modal — auto-fires once per mount when the
  // song was migrated from legacy `stage: 'cross-key'`, sections
  // exist, and no non-original songKeys rows exist yet. Same close-
  // handler memoization rationale as the other modal closers.
  const [crossKeyOpen, setCrossKeyOpen] = useState(false);
  const [crossKeyAutoFired, setCrossKeyAutoFired] = useState(false);
  const closeCrossKey = useCallback(() => setCrossKeyOpen(false), []);

  // Cell interaction modal — opens on cell tap. The ID-only state
  // lets the parent stay agnostic about cell internals; the modal
  // resolves cell + songKey + section + siblings from props passed
  // by this component below. handleCellTap memoized for stable
  // reference passed down through MatrixGrid → KeyRow → CellSquare.
  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  // ---------------------------------------------------------------
  // THE PANEL IS OWNED BY THE PAGE, NOT BY THE MATRIX.
  //
  // Practice mode collapses to a bar pinned at the top of the SCREEN
  // and opens the lead sheet beneath it — a layout the matrix cannot
  // reach from inside its own card. So when the parent offers
  // `onCellSelected`, the tap is delegated and this component opens
  // nothing.
  //
  // The old modal stays reachable for callers that pass no handler,
  // which is what keeps this file a small change rather than a
  // rewrite while another session is working in the same tree.
  // ---------------------------------------------------------------
  const handleCellTap = useCallback(
    (cellId: string) => {
      if (onCellSelected) { onCellSelected(cellId); return; }
      setActiveCellId(cellId);
    },
    [onCellSelected],
  );
  const closeCellModal = useCallback(() => setActiveCellId(null), []);

  // Whole-song test modal — same ID-only pattern. The banner and
  // each KeyStrip's "Run test" button both call handleRunTest. Modal
  // resolves songKey + sibling cells + starting streak from
  // already-loaded data below.
  const [activeTestKeyId, setActiveTestKeyId] = useState<string | null>(null);
  const handleRunTest = useCallback((keyId: string) => setActiveTestKeyId(keyId), []);
  const closeTestModal = useCallback(() => setActiveTestKeyId(null), []);

  // Single-run modal — same ID-only pattern. Separate state from the
  // test modal on purpose: they are different events, and sharing one
  // slot would make "which modal is open" a derived question.
  const [activeRunKeyId, setActiveRunKeyId] = useState<string | null>(null);
  const handleLogRun = useCallback((keyId: string) => setActiveRunKeyId(keyId), []);
  const closeRunModal = useCallback(() => setActiveRunKeyId(null), []);


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
  // DELIBERATE PATCH, not a fix — CrossKeyFollowupModal is deferred to
  // a later repair and this keeps its prompt alive in the meantime.
  //
  // The guard used to be `songKeys.length === 1`, i.e. "only the
  // original key row exists". That read row existence as intent, which
  // was true while keys were created one at a time by choosing them.
  // Now that all 12 are materialised up front it is never true, and the
  // prompt would simply never fire again — the modal would join
  // the section-setup modal as unreachable-by-construction, which is the
  // failure this whole repair exists to undo.
  //
  // Same substitution as the state machine: ask whether any non-original
  // key has been PLAYED, not whether its row exists.
  const eligibleForCrossKey =
    song.stage === 'cross-key'
    && visibleSections.length > 0
    && !hasCrossKeyEngagement(songKeys, songCells);

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
  // `testSummariesByKeyId` lived here and is gone with the per-key
  // strip that displayed it. Its two counters — "Tested N×" and "N
  // runs" — are not lost: the whole-song test modal's 30-day history
  // says the same thing and more, grouped by sitting, which is the
  // form the counts were a worse summary of.

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
  const activeRunKey = activeRunKeyId
    ? songKeys.find(k => k.id === activeRunKeyId) ?? null
    : null;
  const activeRunSiblingCells = useMemo(
    () => activeRunKey
      ? songCells.filter(c => c.songKeyId === activeRunKey.id)
      : [],
    [activeRunKey, songCells],
  );

  // Every run-through recorded against the key under test, for the
  // modal's 30-day history. Filtered from the query the strip
  // counters already use rather than subscribing again.
  const activeTestPastRuns = useMemo(
    () => activeTestKey
      ? songKeyRunThroughs.filter(r => r.songKeyId === activeTestKey.id)
      : [],
    [activeTestKey, songKeyRunThroughs],
  );

  // Retest semantics: if the active key is currently lapsed, this is
  // a retest. Pass-through to the modal for title/copy/audit-flag.
  const activeTestIsRetest = activeTestKey !== null
    && computeSolidDecayState(activeTestKey, now) === 'lapsed';

  return (
    <section className="space-y-4">
      {!embedded && (
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-neutral-500 hover:text-fluent inline-flex items-center gap-1"
        >
          ← song detail
        </button>
      )}

      {/* ---------------------------------------------------------------
          NO HEADER. This component renders a grid, not a page.

          It used to open with a bordered sub-card carrying the title,
          the artist, the original key, the tempo, the section count
          and a state pill — every one of which the song page already
          shows, three inches above, in the metadata card and the
          matrix card's own status badge. The pill was the worst of it:
          "Learning" in green from `songLevelState`, directly beneath
          "Learning" in red from `deriveStage`. Two vocabularies, two
          colours, and nothing on screen to say they were describing
          the same song from two different rules.

          Removing the duplicated-status problem was the point of this
          redesign; it survived here because this component used to be
          a full-page view of its own. It has exactly one caller now —
          SongDetailView, always `embedded` — so there is no second
          usage that needs a header, and none is left conditional for
          a caller that does not exist.

          The one fact that was NOT a duplicate, "N% original", moved
          up beside the stage badge. See SongDetailView.
          --------------------------------------------------------------- */}

      <WholeSongTestBanner
        spelling={spelling}
        eligibleKeys={eligibleTestKeys}
        onRunTest={handleRunTest}
      />

      <MatrixGrid
        spelling={spelling}
        sections={sections}
        songKeys={songKeys}
        songCells={songCells}
        dueByKeyId={dueByKeyId}
        dueWindows={dueWindows}
        now={now}
        onCellTap={handleCellTap}
        onRunTest={handleRunTest}
        onLogRun={handleLogRun}
        runCountsForKeyIds={runCountsForKeyIds}
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

      {activeRunKey && (
        <SingleRunModal
          key={activeRunKey.id}
          open={true}
          onClose={closeRunModal}
          onSaved={bumpRefresh}
          songKey={activeRunKey}
          song={song}
          siblingCells={activeRunSiblingCells}
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
          pastRuns={activeTestPastRuns}
          isRetest={activeTestIsRetest}
        />
      )}
    </section>
  );
}
