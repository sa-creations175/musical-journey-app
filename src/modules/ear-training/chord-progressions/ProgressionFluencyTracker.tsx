import { createContext, useContext, useMemo, useState } from 'react';
import { type AttemptRecord } from '../../../lib/db';
import { ROLLING_WINDOW_SIZE } from '../../../lib/adaptiveSelection';
import ProgressBar from '../../../components/ProgressBar';
import { barSegments, unratedLabel } from '../../../lib/progressBar';
import {
  spacingIntervalFor, useSpacingIntervals,
} from '../../../lib/useSpacingIntervals';
import { daysBetween, localDayKey } from '../../../lib/dailyGoal';
import {
  TIER_BADGE_CLASS,
  TIER_LABEL,
  TIER_TEXT_CLASS,
  computeTier,
  type Tier,
} from '../../../lib/tier';
import { PROGRESSIONS, TIER_NAMES, type Progression } from './catalog';
import { feelOfAttempt } from '../../../lib/earTraining/heardFeel';
import { KEYS, containsSlashChords } from './progressionTheory';
import EtItemCurationButton from '../EtItemCurationButton';
import EtItemStatus from '../EtItemStatus';
import EtRowCheckbox from '../EtRowCheckbox';
import EtBulkActionBar from '../EtBulkActionBar';
import EtSelectToggle from '../EtSelectToggle';
import { useEtCurationsLive } from '../useEtCurations';
import { useEtSelection, type EtSelectionState } from '../useEtSelection';
import type { EtItemCuration } from '../../../lib/db';
import {
  ALL_MOTIONS, INTERVAL_NAME, distanceLabel, parseMotionId, type Distance,
} from './chordMotionPool';
import { motionName } from './motionDegrees';
import { useProgressionSpelling } from '../../../lib/progressionSpelling';
import AssociationsEditor from './AssociationsEditor';
import ProgressTrackerBand from '../../../components/moduleHome/ProgressTrackerBand';
import { PROGRESS_TRACKER_LABEL } from '../../../components/moduleHome/cardShell';

const MODULE_ID = 'chord-progressions';

/**
 * The shared-list entry an ear-training progression is, where the two
 * lists spell it differently.
 *
 * SEVEN OF THE EIGHT SHARE AN ID. The 2 5 1 does not: the catalog calls
 * it `2-5-1` and the Chord Movements & Passes grid — which is what the
 * shared list IS — calls it `major-251`, because that grid also has a
 * minor one. One line rather than a rename, because both ids are in
 * stored history.
 */
const SHARED_LIST_ID: Readonly<Record<string, string>> = { '2-5-1': 'major-251' };

/** Where the Full Progression card files its attempts for a
 *  progression — one per position, so a row reads the prefix. */
/** The progression was named right, whatever the position. Struggled is
 *  the only step that means it was not. */
const NAMED_IT = (a: { correct: boolean; feelRating?: 1 | 2 | 3 | 4 }) =>
  feelOfAttempt(a) > 1;

function fullProgressionRef(progressionId: string): string {
  return `full-progression:${SHARED_LIST_ID[progressionId] ?? progressionId}:`;
}
type ViewMode = 'full-progression' | 'key-detection' | 'chord-motion' | 'must-knows';

interface RollingStats {
  /** The item this window belongs to, carried WITH the stats so a
   *  caller cannot pair one item's numbers with another's interval.
   *  Six call sites across four views; threading the id separately is
   *  how one of them ends up out of step. */
  itemId: string;
  /** The window's own rows — what the strip draws. */
  window: AttemptRecord[];
  correct: number;
  total: number;
  percent: number;
  tier: Tier;
}

function rollingFor(
  attempts: AttemptRecord[],
  itemId: string,
  opts: {
    /** Read every item whose ref STARTS with `itemId`, not the one that
     *  equals it. The Full Progression card files an attempt per
     *  position, and a row is about the progression. */
    prefix?: boolean;
    /** What counts as a pass. Defaults to the attempt's own verdict. */
    passed?: (a: AttemptRecord) => boolean;
  } = {},
): RollingStats {
  const matches = opts.prefix === true
    ? (a: AttemptRecord) => a.itemId.startsWith(itemId)
    : (a: AttemptRecord) => a.itemId === itemId;
  const filtered = attempts
    .filter(a => a.moduleId === MODULE_ID && matches(a))
    .sort((a, b) => b.timestamp - a.timestamp);
  const recent = filtered.slice(0, ROLLING_WINDOW_SIZE);
  const passed = opts.passed ?? ((a: AttemptRecord) => a.correct);
  const correct = recent.filter(passed).length;
  // A PREFIX IS NOT AN itemRef, AND THE STRIP FADES ON A REAL ONE. The
  // interval is looked up by exact id; handing the prefix over would
  // miss every time and fall back to the default fade with nothing on
  // screen to say so. So a prefix row reports the ref of the most
  // recent attempt it drew, which is the item whose schedule the bar is
  // actually showing.
  const reportedId = opts.prefix === true && filtered[0] !== undefined
    ? filtered[0].itemId
    : itemId;
  const total = recent.length;
  const today = localDayKey();
  const latestTs = filtered[0]?.timestamp;
  const daysSince = latestTs ? daysBetween(localDayKey(new Date(latestTs)), today) : null;
  const tier = computeTier({
    windowCorrect: correct,
    windowTotal: total,
    daysSinceLastAttempt: daysSince,
  });
  return {
    itemId: reportedId,
    window: recent,
    correct,
    total,
    percent: total === 0 ? 0 : Math.round((correct / total) * 100),
    tier,
  };
}

/**
 * The fade's two ambient facts, for a tree four views deep.
 *
 * ---------------------------------------------------------------
 * A CONTEXT WITH NO DEFAULT, DELIBERATELY.
 *
 * There are six bar call sites here across four views. Threading two
 * props to all of them is how one gets missed — and a missed one with
 * a DEFAULT renders solid ticks and looks entirely correct, which is
 * the failure mode the required `intervalDays` prop exists to prevent.
 *
 * So the context holds null and the hook throws. A view rendered
 * outside the provider fails loudly at the first render rather than
 * quietly forever.
 * ---------------------------------------------------------------
 */
interface StripFacts {
  intervals: ReadonlyMap<string, number>;
  now: number;
}
const StripContext = createContext<StripFacts | null>(null);

function useStripFacts(): StripFacts {
  const ctx = useContext(StripContext);
  if (ctx === null) {
    throw new Error('ProgressionFluencyTracker: a bar rendered outside StripContext');
  }
  return ctx;
}

interface ProgRowProps {
  progression: Progression;
  attempts: AttemptRecord[];
  curation?: EtItemCuration;
  selection?: EtSelectionState;
}

function ProgRow({ progression, attempts, curation, selection }: ProgRowProps) {
  // =====================================================================
  // THE ROW READS THE FULL PROGRESSION CARD AND NOTHING ELSE.
  //
  // It used to read three itemRefs the old quiz wrote — the bare
  // progression id for "which chord", `<id>-pattern` for the bonus
  // round and `<id>-inversion` for the slash question. That quiz asked
  // three questions; the card that replaced it asks one, in two parts,
  // and files an attempt per POSITION. So the row sums the positions
  // and splits the two parts:
  //
  //   the progression — was it named right, whatever the position
  //   the position    — were both halves right
  //
  // Both come off the four-step rating: Struggled is the progression
  // missed, and anything above it is the progression got.
  //
  // The old rows stay on disk and stop drawing. Nothing reads them.
  // =====================================================================
  const ref = fullProgressionRef(progression.id);
  const named = rollingFor(attempts, ref, {
    prefix: true, passed: a => feelOfAttempt(a) > 1,
  });
  const chord = rollingFor(attempts, ref, { prefix: true });
  const hasSlash = containsSlashChords(progression.numerals);
  const dim = curation?.hidden ? 'opacity-60' : '';

  return (
    <div className={`py-3 first:pt-0 last:pb-0 grid lg:grid-cols-[280px,1fr] gap-3 sm:gap-4 ${dim}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {selection && <EtRowCheckbox itemRef={progression.id} selection={selection} />}
          <span className="font-medium text-sm">{progression.name}</span>
          <EtItemStatus curation={curation} />
          <EtItemCurationButton
            itemRef={progression.id}
            defaultLabel={progression.name}
            itemKindLabel="Progression"
          />
          {progression.isMustKnow && (
            <span className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-fluent/40 bg-fluent/10 text-fluent">
              ★ must-know
            </span>
          )}
          {hasSlash && (
            <span
              className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-info/40 bg-info/10 text-info"
              title="Contains Slash Chords / Inversions"
            >
              inv
            </span>
          )}
          <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${TIER_BADGE_CLASS[chord.tier]}`}>
            {TIER_LABEL[chord.tier]}
          </span>
        </div>
        <div className="text-xs text-neutral-500 font-mono mt-1">{progression.numerals.join(' ')}</div>
        <div className="text-[10px] text-neutral-400 mt-0.5">
          tier {progression.tier} · {progression.tierName}
        </div>
        <div className="mt-2">
          <AssociationsEditor progressionId={progression.id} />
        </div>
      </div>
      <div className="min-w-0 space-y-2">
        <StatRow
          label="progression recognition"
          barLabel={`${progression.name} progression recognition`}
          stats={named}
          passed={NAMED_IT}
        />
        <StatRow label="position accuracy" barLabel={`${progression.name} position accuracy`} stats={chord} />
      </div>
    </div>
  );
}

function StatRow({
  label, stats, barLabel, passed,
}: {
  label: string;
  stats: RollingStats;
  /** What counts as right on THIS bar. Two bars can read one window
   *  two ways — see `ProgRow`. */
  passed?: (attempt: { correct: boolean }) => boolean;
  /** Announced to a screen reader. Every row has a "chord accuracy"
   *  bar, so the sub-skill alone would give identically-named bars
   *  with no way to tell which progression each belongs to. */
  barLabel: string;
}) {
  const { intervals, now } = useStripFacts();
  const seg = barSegments({
    correct: stats.correct,
    wrong: stats.total - stats.correct,
  });
  const pending = unratedLabel(seg);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-neutral-500 mb-1 gap-2 flex-wrap">
        <span>{label}</span>
        <span className="font-mono">
          {pending !== null ? (
            <span className="text-neutral-400">{pending}</span>
          ) : (
            <>
              {stats.correct}/{stats.total}
              <span className="ml-1">· {stats.percent}%</span>
              <span className={`ml-1 ${TIER_TEXT_CLASS[stats.tier]}`}>— {TIER_LABEL[stats.tier]}</span>
            </>
          )}
        </span>
      </div>
      <ProgressBar
        attempts={stats.window}
        intervalDays={spacingIntervalFor(intervals, stats.itemId)}
        now={now}
        label={barLabel}
        {...(passed === undefined ? {} : { passed })}
      />
    </div>
  );
}

// --- Reusable generic stat row ---------------------------------------

// Simple label + stats row for new-tab sections (Key Detection, Chord
// Motion). Same visual vocabulary as the full-progression rows but
// without the associations editor / slash chord badges.
function SimpleStatRow({ label, stats, extra }: { label: string; stats: RollingStats; extra?: string }) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0 grid sm:grid-cols-[160px,1fr] gap-2 items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{label}</span>
          <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${TIER_BADGE_CLASS[stats.tier]}`}>
            {TIER_LABEL[stats.tier]}
          </span>
        </div>
        {extra && <div className="text-[10px] text-neutral-400 mt-0.5">{extra}</div>}
      </div>
      <StatRow label="rolling accuracy" barLabel={`${label} rolling accuracy`} stats={stats} />
    </div>
  );
}

// --- Full progression / must-knows views -----------------------------

interface CuratableViewProps {
  attempts: AttemptRecord[];
  curations: ReadonlyMap<string, EtItemCuration>;
  selection: EtSelectionState;
}

function FullProgressionView({ attempts, curations, selection }: CuratableViewProps) {
  const tierGroups = useMemo(() => (
    Object.keys(TIER_NAMES).map(n => Number(n)).sort((a, b) => a - b).map(tier => ({
      key: String(tier),
      title: `Tier ${tier} — ${TIER_NAMES[tier]}`,
      progressions: PROGRESSIONS.filter(p => p.tier === tier),
    }))
  ), []);
  return (
    <div className="space-y-5">
      {tierGroups.map(group => (
        <div key={group.key}>
          <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{group.title}</h3>
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {group.progressions.map(prog => (
              <ProgRow
                key={prog.id}
                progression={prog}
                attempts={attempts}
                curation={curations.get(prog.id)}
                selection={selection}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MustKnowsView({ attempts, curations, selection }: CuratableViewProps) {
  const mustKnows = useMemo(() => PROGRESSIONS.filter(p => p.isMustKnow), []);
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
        must-know progressions ({mustKnows.length})
      </h3>
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {mustKnows.map(prog => (
          <ProgRow
            key={prog.id}
            progression={prog}
            attempts={attempts}
            curation={curations.get(prog.id)}
            selection={selection}
          />
        ))}
      </div>
    </div>
  );
}

// --- Key Detection view ---------------------------------------------

function KeyDetectionView({ attempts }: { attempts: AttemptRecord[] }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">accuracy per key</h3>
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {KEYS.map(k => {
          const stats = rollingFor(attempts, `key-detection:${k}`);
          return <SimpleStatRow key={k} label={`${k} major`} stats={stats} />;
        })}
      </div>
    </div>
  );
}

// --- Chord Motion view ----------------------------------------------

function ChordMotionView({ attempts }: { attempts: AttemptRecord[] }) {
  // THE CHIPS' SPELLING, so a row reads "1 → 2ø" where the card does.
  const [rowSpelling] = useProgressionSpelling();
  // Group motions by distance (2nds, 3rds, …) and show each as a
  // "startDeg → destDeg (dir)" row. Each attempt row reuses the same
  // rolling-window tier logic as the full-progression rows.
  const groups = useMemo(() => {
    const byDistance = new Map<number, Array<typeof ALL_MOTIONS[number]>>();
    for (const m of ALL_MOTIONS) {
      const list = byDistance.get(m.distance) ?? [];
      list.push(m);
      byDistance.set(m.distance, list);
    }
    return Array.from(byDistance.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([dist, motions]) => ({
        key: String(dist),
        title: `${distanceLabel(dist as Distance)} — ${motions.length} motions`,
        motions,
      }));
  }, []);

  // NO BREAKDOWN BY SCAFFOLDING. There was one — Full / Partial /
  // Minimal — read from `motion-mode:*` rows, and scaffolding retired as
  // a setting when Chord Motion moved onto the shared player (10 Sep
  // 2026). Nothing writes those rows now, so the three numbers could
  // only ever show a frozen split. The stored rows are untouched.
  return (
    <div className="space-y-5">
      {groups.map(g => (
        <div key={g.key}>
          <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{g.title}</h3>
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {g.motions.map(m => {
              const id = `motion:${m.startLabel}-${m.destLabel}-${m.direction}`;
              const parsed = parseMotionId(id);
              const stats = rollingFor(attempts, id);
              const label = motionName(m, rowSpelling);
              const extra = m.direction === 'same'
                ? `same root${m.isDiatonic ? '' : ' · chromatic'}`
                : `${m.direction === 'asc' ? 'ascending' : 'descending'} · ${parsed && parsed.distance !== 1 ? INTERVAL_NAME[parsed.distance] : ''}${m.isDiatonic ? '' : ' · chromatic'}`;
              return <SimpleStatRow key={id} label={label} stats={stats} extra={extra} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Top-level tracker ----------------------------------------------

interface Props { attempts: AttemptRecord[]; }

const VIEW_TABS: Array<{ id: ViewMode; label: string }> = [
  { id: 'full-progression', label: 'Full Progression' },
  { id: 'key-detection', label: 'Key Detection' },
  { id: 'chord-motion', label: 'Chord Motion' },
  { id: 'must-knows', label: 'Must-Knows Only' },
];

export default function ProgressionFluencyTracker({ attempts }: Props) {
  const [view, setView] = useState<ViewMode>('full-progression');
  const allRefs = useMemo(() => PROGRESSIONS.map(p => p.id), []);
  const curations = useEtCurationsLive(allRefs);
  const selection = useEtSelection();
  // Bulk select only meaningful on the progression-listing views;
  // key-detection / chord-motion don't render per-progression rows.
  const selectionApplies = view === 'full-progression' || view === 'must-knows';
  const intervals = useSpacingIntervals(MODULE_ID);
  // One instant for every strip on the screen, and one subscription for
  // every bar — a hook per StatRow would open a live query per row.
  // TAKEN AT MOUNT, not during a render, the way the S&P grids take it.
  const [now] = useState(() => Date.now());
  const stripFacts = useMemo(() => ({ intervals, now }), [intervals, now]);

  return (
    <StripContext.Provider value={stripFacts}>
      {/* THE SAME BAND AS THE OTHER THREE — see any of them for why
          the `h2` that said "Fluency Tracker" is gone. */}
      <ProgressTrackerBand label={PROGRESS_TRACKER_LABEL} />
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {selectionApplies && <EtSelectToggle selection={selection} />}
        </div>
        <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs flex-wrap">
          {VIEW_TABS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setView(opt.id)}
              className={`px-3 py-1.5 rounded-md transition ${
                view === opt.id
                  ? 'bg-fluent text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {view === 'full-progression' && (
        <FullProgressionView attempts={attempts} curations={curations} selection={selection} />
      )}
      {view === 'must-knows' && (
        <MustKnowsView attempts={attempts} curations={curations} selection={selection} />
      )}
      {view === 'key-detection' && <KeyDetectionView attempts={attempts} />}
      {view === 'chord-motion' && <ChordMotionView attempts={attempts} />}
      {selectionApplies && selection.active && (
        <EtBulkActionBar
          selected={selection.selected}
          curations={curations}
          onClear={selection.clear}
          onExit={selection.exit}
        />
      )}
    </section>
    </StripContext.Provider>
  );
}
