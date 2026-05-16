import { useMemo, useState } from 'react';
import { db, type AttemptRecord, type ChordData } from '../../../lib/db';
import EtItemCurationButton from '../EtItemCurationButton';
import { ROLLING_WINDOW_SIZE } from '../../../lib/adaptiveSelection';
import { daysBetween, localDayKey } from '../../../lib/dailyGoal';
import {
  MIN_ATTEMPTS_FOR_TIER,
  TIER_BADGE_CLASS,
  TIER_BAR_CLASS,
  TIER_LABEL,
  TIER_TEXT_CLASS,
  computeTier,
  type Tier,
} from '../../../lib/tier';
import {
  INVERSION_EXCLUDED_CHORD_IDS,
  INVERSION_LABEL,
  inversionsForIntervalCount,
  parseAttemptItemId,
  type Inversion,
} from './inversionUtils';

const MODULE_ID = 'chord-recognition';
const DESC_MAX = 300;

type ViewMode = 'tier' | 'family';

const TIER_ORDER: ChordData['tier'][] = ['foundational', 'seventh', 'dominant', 'extensions'];
const TIER_SECTION_LABEL: Record<ChordData['tier'], string> = {
  foundational: 'Foundational Triads',
  seventh: 'Seventh Chords',
  dominant: 'Dominant Variations',
  extensions: 'Extensions & Colors',
};

const FAMILY_ORDER: ChordData['family'][] = ['major', 'minor', 'dom', 'sus', 'dim', 'aug'];
const FAMILY_SECTION_LABEL: Record<ChordData['family'], string> = {
  major: 'Major family',
  minor: 'Minor family',
  dom: 'Dominant family',
  sus: 'Sus family',
  dim: 'Diminished family',
  aug: 'Augmented family',
};

const FAMILY_BADGE: Record<ChordData['family'], string> = {
  major: 'bg-family-major-50 text-family-major-700 border-family-major-500/40',
  minor: 'bg-family-minor-50 text-family-minor-700 border-family-minor-500/40',
  dom:   'bg-family-dom-50 text-family-dom-700 border-family-dom-500/40',
  sus:   'bg-family-sus-50 text-family-sus-700 border-family-sus-500/40',
  dim:   'bg-family-dim-50 text-family-dim-700 border-family-dim-500/40',
  aug:   'bg-family-aug-50 text-family-aug-700 border-family-aug-500/40',
};
const FAMILY_LABEL: Record<ChordData['family'], string> = {
  major: 'major',
  minor: 'minor',
  dom: 'dom',
  sus: 'sus',
  dim: 'dim',
  aug: 'aug',
};

interface RollingStats {
  correct: number;
  total: number;
  percent: number;
  tier: Tier;
}

// Filter rolling-window stats by chord id (any inversion) or by a
// specific (chord, inversion) pair. Pre-build attempts logged as bare
// 'maj' parse to inversion 0 via parseAttemptItemId, so legacy data
// surfaces in the root-position drill-down without a migration race.
function rollingFor(
  attempts: AttemptRecord[],
  chordId: string,
  inversion?: Inversion,
): RollingStats {
  const filtered = attempts
    .filter(a => {
      if (a.moduleId !== MODULE_ID) return false;
      const parsed = parseAttemptItemId(a.itemId);
      if (parsed.chordId !== chordId) return false;
      if (inversion !== undefined && parsed.inversion !== inversion) return false;
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp);
  const recent = filtered.slice(0, ROLLING_WINDOW_SIZE);
  const correct = recent.filter(a => a.correct).length;
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
    correct,
    total,
    percent: total === 0 ? 0 : Math.round((correct / total) * 100),
    tier,
  };
}

interface DescriptionEditorProps { chord: ChordData; }

function DescriptionEditor({ chord }: DescriptionEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chord.soundCustom ?? '');
  const active = chord.soundCustom ?? chord.soundDefault;
  const isCustom = Boolean(chord.soundCustom);

  const open = () => { setDraft(chord.soundCustom ?? ''); setEditing(true); };
  const save = async () => {
    const trimmed = draft.trim().slice(0, DESC_MAX);
    await db.chordQualities.update(chord.id, {
      soundCustom: trimmed.length ? trimmed : undefined,
    });
    setEditing(false);
  };
  const resetToDefault = async () => {
    await db.chordQualities.update(chord.id, { soundCustom: undefined });
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex items-start gap-2 text-xs">
        <span className={`text-neutral-600 dark:text-neutral-300 ${isCustom ? 'italic' : ''}`}>
          {active}
          {isCustom && <span className="ml-1 not-italic text-neutral-500">(your note)</span>}
        </span>
        <button
          onClick={open}
          aria-label="edit sound description"
          className="text-neutral-400 hover:text-fluent shrink-0"
          title="edit sound description"
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      <textarea
        value={draft}
        maxLength={DESC_MAX}
        onChange={e => setDraft(e.target.value.slice(0, DESC_MAX))}
        rows={3}
        className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 focus:outline-none focus:border-fluent"
        placeholder={chord.soundDefault}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={save} className="px-2 py-1 rounded-md bg-fluent text-white hover:opacity-90">save</button>
        <button onClick={() => setEditing(false)} className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700">cancel</button>
        {isCustom && (
          <button onClick={resetToDefault} className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-500">use default</button>
        )}
        <span className="ml-auto text-neutral-400">{draft.length}/{DESC_MAX}</span>
      </div>
    </div>
  );
}

interface ChordRowProps { chord: ChordData; attempts: AttemptRecord[]; }

function ChordRow({ chord, attempts }: ChordRowProps) {
  const [expanded, setExpanded] = useState(false);
  const rolling = rollingFor(attempts, chord.id);
  const isUntouched = rolling.tier === 'untouched';

  // Per-inversion drill-down — only meaningful for foundational triads
  // where inversion training is enabled. Sevenths could expand later;
  // for now the affordance is foundational-only to match where the
  // settings live. Sus2 / Sus4 are excluded — they never get inversion
  // training so the drill-down would surface mostly empty data.
  const supportsDrillDown =
    chord.tier === 'foundational' && !INVERSION_EXCLUDED_CHORD_IDS.has(chord.id);
  const inversions = supportsDrillDown
    ? inversionsForIntervalCount(chord.intervals.length)
    : [];

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="grid lg:grid-cols-[280px,1fr] gap-3 sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{chord.name}</span>
            <EtItemCurationButton
              itemRef={chord.id}
              defaultLabel={chord.name}
              itemKindLabel="Chord"
            />
            <span className={`text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 border ${FAMILY_BADGE[chord.family]}`}>
              {FAMILY_LABEL[chord.family]}
            </span>
            <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${TIER_BADGE_CLASS[rolling.tier]}`}>
              {TIER_LABEL[rolling.tier]}
            </span>
          </div>
          <div className="text-xs text-neutral-500 font-mono mt-1">{chord.formula}</div>
          <div className="mt-2">
            <DescriptionEditor chord={chord} />
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline justify-between text-xs text-neutral-500 mb-1 gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <span>rolling window</span>
              {supportsDrillDown && (
                <button
                  type="button"
                  onClick={() => setExpanded(v => !v)}
                  aria-expanded={expanded}
                  aria-label={expanded ? 'hide per-inversion breakdown' : 'show per-inversion breakdown'}
                  className="text-neutral-400 hover:text-fluent text-[10px]"
                >
                  {expanded ? '▾ inversions' : '▸ inversions'}
                </button>
              )}
            </span>
            <span className="font-mono">
              {isUntouched ? (
                <span className="text-neutral-400">
                  no data yet — needs {MIN_ATTEMPTS_FOR_TIER} ({rolling.total}/{MIN_ATTEMPTS_FOR_TIER})
                </span>
              ) : (
                <>
                  {rolling.correct}/{rolling.total}
                  <span className="ml-1">· {rolling.percent}%</span>
                  <span className={`ml-1 ${TIER_TEXT_CLASS[rolling.tier]}`}>— {TIER_LABEL[rolling.tier]}</span>
                </>
              )}
            </span>
          </div>
          <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
            <div
              className={`h-full ${TIER_BAR_CLASS[rolling.tier]} transition-all`}
              style={{ width: rolling.total === 0 ? 0 : `${Math.max(4, rolling.percent)}%` }}
            />
          </div>

          {expanded && supportsDrillDown && (
            <div className="mt-3 space-y-2 pl-3 border-l border-neutral-200 dark:border-neutral-800">
              {inversions.map(inv => (
                <InversionStatRow
                  key={inv}
                  chordId={chord.id}
                  inversion={inv}
                  attempts={attempts}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface InversionStatRowProps {
  chordId: string;
  inversion: Inversion;
  attempts: AttemptRecord[];
}

function InversionStatRow({ chordId, inversion, attempts }: InversionStatRowProps) {
  const rolling = rollingFor(attempts, chordId, inversion);
  const isUntouched = rolling.tier === 'untouched';
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-neutral-500 mb-1 gap-2 flex-wrap">
        <span>{INVERSION_LABEL[inversion]}</span>
        <span className="font-mono">
          {isUntouched ? (
            <span className="text-neutral-400">
              no data yet ({rolling.total}/{MIN_ATTEMPTS_FOR_TIER})
            </span>
          ) : (
            <>
              {rolling.correct}/{rolling.total}
              <span className="ml-1">· {rolling.percent}%</span>
              <span className={`ml-1 ${TIER_TEXT_CLASS[rolling.tier]}`}>— {TIER_LABEL[rolling.tier]}</span>
            </>
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        <div
          className={`h-full ${TIER_BAR_CLASS[rolling.tier]} transition-all`}
          style={{ width: rolling.total === 0 ? 0 : `${Math.max(4, rolling.percent)}%` }}
        />
      </div>
    </div>
  );
}

interface Props { chords: ChordData[]; attempts: AttemptRecord[]; }

export default function ChordFluencyTracker({ chords, attempts }: Props) {
  const [view, setView] = useState<ViewMode>('tier');

  const tierGroups = useMemo(() => {
    return TIER_ORDER.map(tier => ({
      key: tier,
      title: TIER_SECTION_LABEL[tier],
      chords: chords.filter(c => c.tier === tier),
    }));
  }, [chords]);

  const familyGroups = useMemo(() => {
    return FAMILY_ORDER.map(family => ({
      key: family,
      title: FAMILY_SECTION_LABEL[family],
      chords: chords.filter(c => c.family === family),
    })).filter(g => g.chords.length > 0);
  }, [chords]);

  const groups = view === 'tier' ? tierGroups : familyGroups;

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-base sm:text-lg font-medium tracking-tight">fluency tracker</h2>
        <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
          {([
            { id: 'tier', label: 'tier view' },
            { id: 'family', label: 'family view' },
          ] as const).map(opt => (
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
      <div className="space-y-5">
        {groups.map(group => (
          <div key={group.key}>
            <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{group.title}</h3>
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {group.chords.map(chord => (
                <ChordRow key={chord.id} chord={chord} attempts={attempts} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
