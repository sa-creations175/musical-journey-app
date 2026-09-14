/**
 * The chord-shape grid, wearing the face the scales grid wears.
 *
 * =====================================================================
 * A CELL NAMES ITS STATUS. It was a square SHADED BY TIME INVESTED,
 * which told you something had happened without saying what — a cell
 * with one Mastered target and eleven untouched looked much like a cell
 * with twelve Developing ones. The six words exist precisely so a
 * reader never has to translate a colour into a claim.
 *
 * A chord cell holds TWELVE targets: four inversion states across three
 * hands. Its status is the roll-up of the ones still in the score,
 * furthest by default, and the count beside the word says how many of
 * them are at least that far.
 *
 * =====================================================================
 * AND CLICKING ONE OPENS NOTHING.
 *
 * It opened `InversionBreakdownPanel`, a modal that drew the same table
 * Progress Details draws — two places, one job, as the walked prototype
 * says in its own note. The detail stands under the grid now, the grid
 * never moves, and the only modal left is the session, which takes
 * over because a session takes over.
 *
 * The prototype draws the twelve as a compact shapes × hands table.
 * They are ROWS here, each opening its own logs with a Drill button
 * above them — the scales chain, twelve rows instead of three, which is
 * what makes this the same page rather than a similar one.
 * =====================================================================
 */
import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db, type DrillSession, type DrillSkill, type DrillType,
  type InversionState, type SpacingState,
} from '../../lib/db';
import {
  CHORD_QUALITIES,
  CHORD_QUALITY_BY_ID,
  CIRCLE_KEY,
  CIRCLE_LABEL,
  KEYS_CIRCLE_OF_FOURTHS,
  inversionStateLabel,
  type QualityKind,
} from './catalog';
import { spellKey } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';
import { bandCellClasses, GRID_CELL_MIN } from './BandCell';
import KeyedGrid, {
  DEFAULT_LAYOUT, LayoutToggle, type Layout,
} from './KeyedGrid';
import { useSectionScroll } from '../../lib/scrollSectionToTop';
import {
  chordCellTargets, countFluentPlusTargets, rowsByRefHand, sectionTargets,
  targetKey, targetsAcrossKeys, verdictForTargets, type CellTarget,
} from './cellTargets';
import { cellProgress, sessionSecondsById } from './handProgress';
import { sessionsByTarget } from './timeInvested';
import ChordCellPlayer from './ChordCellPlayer';
import CellProgressDetails, {
  HAND_ROW_LABEL, type DetailTarget,
} from './CellProgressDetails';
import PracticeTestPanel from './practiceTest/PracticeTestPanel';
import { chordShapeSurface } from './practiceTest/makeSurfaces';
import { findAllChordShapeSkillsForCell } from './drillModel';
import { NOT_STARTED, bandVerdictLabel, type BandVerdict } from '../../lib/spacing/banding';
import { bandVerdictForRow } from '../../lib/spacing/row';

interface Props {
  scope: QualityKind | 'all';
  onScopeChange: (scope: QualityKind | 'all') => void;
}

const KIND_LABEL: Record<QualityKind | 'all', string> = {
  all:        'all qualities',
  triad:      'triads only',
  seventh:    'seventh chords',
  extension:  'extensions',
  special:    'specials (6, 6/9, etc.)',
};
// 'extension' and 'special' are gone with the 20 Aug 2026 catalog cut —
// selecting either rendered an empty grid. Derived from the catalog
// rather than hardcoded so a kind reappears here the moment a quality
// carrying it is added back.
const KIND_OPTIONS: Array<QualityKind | 'all'> = [
  'all',
  ...Array.from(new Set(CHORD_QUALITIES.map(q => q.kind))),
];

type RollupRule = 'furthest' | 'lowest';

/**
 * The grid's thirteen columns: the twelve keys by fourths, then the
 * Circle of 4ths cell (Silas, 14 Sep 2026), which drills the shape
 * through all twelve and rates on its own targets.
 */
const GRID_KEYS: readonly string[] = [...KEYS_CIRCLE_OF_FOURTHS, CIRCLE_KEY];

interface SelectedCell {
  quality: string;
  keyName: string;
}

export default function ChordShapeDrills({ scope, onScopeChange }: Props) {
  const [spelling] = useSpelling();
  const [rule, setRule] = useState<RollupRule>('furthest');
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [notCounted, setNotCounted] = useState<ReadonlySet<string>>(new Set());
  const [drilling, setDrilling] = useState<DetailTarget | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  /** Scrolls the band to the top once the pick has rendered — see
   *  `useSectionScroll` for why it cannot be done in the handler. */
  const askForScroll = useSectionScroll(detailRef);
  const [now] = useState(() => Date.now());

  const qualities = useMemo(
    () => scope === 'all' ? CHORD_QUALITIES : CHORD_QUALITIES.filter(q => q.kind === scope),
    [scope],
  );

  const spacingRows = useLiveQuery<SpacingState[]>(
    () => db.spacingState
      .where('moduleRef').equals('shapes-and-patterns')
      .toArray(),
    [],
  ) ?? [];
  const sessions = useLiveQuery<DrillSession[]>(
    () => db.drillSessions.toArray(),
    [],
  ) ?? [];
  const drillSkills = useLiveQuery<DrillSkill[]>(
    () => db.drillSkills.toArray(),
    [],
  ) ?? [];
  const drillTypes = useLiveQuery<DrillType[]>(
    () => db.drillTypes.toArray(),
    [],
  ) ?? [];

  const byRefHand = useMemo(() => rowsByRefHand(spacingRows), [spacingRows]);
  /** THE ONE WALK, shared with the card and the scales page. */
  const byTarget = useMemo(
    () => sessionsByTarget(sessions, drillSkills),
    [sessions, drillSkills],
  );

  /** A target is out of the score by itemRef AND hand — the four
   *  inversion states share a cell, and a key on the cell alone would
   *  take all twelve out at once. */
  const countedTargets = (quality: string, keyName: string) =>
    chordCellTargets(quality, keyName)
      .filter(t => !notCounted.has(targetKey(t.itemRef, t.hand)));

  /**
   * A cell's status: the roll-up of the targets still counted.
   *
   * `verdictForTargets` is the furthest of them, which is the default
   * and the shared reader. Lowest asks the same rows the other way
   * round rather than through a second index.
   */
  const cellVerdict = (quality: string, keyName: string): BandVerdict => {
    const targets = countedTargets(quality, keyName);
    if (targets.length === 0) return NOT_STARTED;
    return verdictForTargets(targets, byRefHand, rule);
  };

  /**
   * How many of the cell's counted targets are at least at its word.
   *
   * The prototype's `7/12`, and what makes taking one out read as
   * `7/9`: both halves move, because both count what is still in the
   * score.
   */
  const cellCount = (quality: string, keyName: string) => {
    const targets = countedTargets(quality, keyName);
    const verdict = cellVerdict(quality, keyName);
    if (verdict.kind === 'not-started') return null;
    const at = targets.filter(t => rank(verdictOf(t, byRefHand)) >= rank(verdict)).length;
    return `${at}/${targets.length}`;
  };

  const totals = useMemo(
    () => countFluentPlusTargets(sectionTargets('chord-shapes', notCounted), byRefHand),
    [byRefHand, notCounted],
  );

  const pickCell = (quality: string, keyName: string) => {
    setSelected({ quality, keyName });
    // MATERIALISE THE CELL'S SKILL ROWS, because a chord-shape drill
    // hangs off a real skill and a real drill type — see the note on
    // `sessionsByTarget`. The panel needs them the moment a target is
    // opened, so the read starts with the click rather than with it.
    void findAllChordShapeSkillsForCell(keyName, quality);
    // THE ANSWER GOES WHERE YOU ARE LOOKING — at the TOP of the screen,
    // clear of the sticky header, and asked for AFTER the pick above
    // has rendered. Called here it landed before the panel had reserved
    // its room, and on this page's tall grid that meant the page did
    // not move at all. See `useSectionScroll`.
    askForScroll();
  };

  /** The cell's twelve, as the detail section takes them. */
  const selectedTargets: DetailTarget[] = useMemo(() => {
    if (!selected) return [];
    const targets = chordCellTargets(selected.quality, selected.keyName);
    const progress = cellProgress(targets, spacingRows, byTarget);
    return targets.map((t, i) => ({
      key: targetKey(t.itemRef, t.hand),
      // THE SHAPE AND THE HAND. A chord row's hand is only half of
      // what it is; the scales row's hand is the whole of it.
      label: `${inversionStateLabel(inversionOf(t.itemRef))} · ${HAND_ROW_LABEL[t.hand]}`,
      hand: t.hand,
      progress: progress[i],
    }));
  }, [selected, spacingRows, byTarget]);

  const cellLabel = selected
    ? chordCellLabel(selected.quality, selected.keyName, spelling)
    : null;

  /** The skill + drill type behind one target, for the session panel. */
  const surfaceFor = (target: DetailTarget) => {
    const state = inversionOf(refOf(target.key));
    const skill = drillSkills.find(
      s => s.kind === 'chord-shape'
        && s.quality === selected?.quality
        && s.keyName === selected?.keyName
        && (s.inversionState ?? null) === state,
    );
    const drillType = skill
      ? drillTypes.filter(t => t.skillId === skill.id).sort((a, b) => a.order - b.order)[0]
      : undefined;
    if (!skill || !drillType) return null;
    return chordShapeSurface({
      cellLabel: cellLabel ?? '',
      skillLabel: target.label,
      skill,
      drillType,
      hand: target.hand,
    });
  };

  const drillSurface = drilling ? surfaceFor(drilling) : null;

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="space-y-1">
          <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
            chord shape drills
          </h3>
          {/* THE PROTOTYPE'S OWN SUBTITLE for the faced grid. What it
              replaced said "cells darken with time invested and fade as
              they go stale", which described a grid that no longer
              exists. */}
          <p className="text-xs text-neutral-500 leading-snug">
            tap a cell to drill that chord in that key. each cell reads its
            twelve targets — four shapes across three hands.
          </p>
          <p className="text-xs text-neutral-500">
            Progress — {totals.fluentPlus} of {totals.total} Fluent+
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-neutral-500">
          scope:
          <select
            value={scope}
            onChange={e => onScopeChange(e.target.value as QualityKind | 'all')}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
          >
            {KIND_OPTIONS.map(o => <option key={o} value={o}>{KIND_LABEL[o]}</option>)}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <span className="uppercase tracking-wider font-semibold text-neutral-400">
          Cell reads as
        </span>
        {(['furthest', 'lowest'] as const).map(r => (
          <Toggle key={r} on={rule === r} onClick={() => setRule(r)}>
            {r === 'furthest' ? 'Furthest' : 'Lowest'}
          </Toggle>
        ))}
        <span className="ml-2 inline-flex items-center gap-2 flex-wrap">
          <LayoutToggle layout={layout} onChange={setLayout} />
        </span>
      </div>

      <KeyedGrid
        rows={qualities.map(q => ({
          rowKey: q.id,
          label: q.suffix ? `${q.label} (${q.suffix})` : q.label,
        }))}
        keys={GRID_KEYS}
        layout={layout}
        spelling={spelling}
        keyLabel={keyName => (keyName === CIRCLE_KEY
          // GREEN AND HEAVIER, as the walked prototype draws the row.
          ? <span className="text-fluent font-semibold">{CIRCLE_LABEL}</span>
          : spellKey(keyName, spelling))}
        renderCell={(rowKey, keyName, showKeyLabel) => {
          const q = qualities.find(x => x.id === rowKey);
          if (!q) return null;
          const verdict = cellVerdict(q.id, keyName);
          return (
            <StatusCell
              verdict={verdict}
              count={cellCount(q.id, keyName)}
              keyLabel={showKeyLabel
                ? (keyName === CIRCLE_KEY ? CIRCLE_LABEL : spellKey(keyName, spelling))
                : undefined}
              selected={selected?.quality === q.id && selected?.keyName === keyName}
              title={`${q.label} · ${keyName === CIRCLE_KEY
                ? CIRCLE_LABEL
                : `the key of ${spellKey(keyName, spelling)}`} — ${bandVerdictLabel(verdict)}`}
              onPick={() => pickCell(q.id, keyName)}
            />
          );
        }}
      />

      {/* HEAR IT BEFORE YOU DRILL IT — one chord, as the catalog
          spells it, with the inversions one tap away. A reference:
          nothing here is rated. */}
      {selected !== null && (
        <ChordCellPlayer
          key={`${selected.quality}:${selected.keyName}`}
          quality={selected.quality}
          /* THE CIRCLE OF 4THS CELL plays its shape in C, the first
             key, and nothing more (14 Sep 2026). */
          keyName={selected.keyName === CIRCLE_KEY ? KEYS_CIRCLE_OF_FOURTHS[0] : selected.keyName}
        />
      )}

      <CellProgressDetails
        ref={detailRef}
        cellLabel={cellLabel}
        targets={selectedTargets}
        verdict={selected ? cellVerdict(selected.quality, selected.keyName) : NOT_STARTED}
        /* NO NOUN. The walked prototype's own sentence reads "the
           furthest of the 12" — the twelve are shapes across hands and
           there is no one word for them that is not invented. */
        rollup={{ ruleWord: rule, unitLabel: null }}
        notCounted={notCounted}
        sessionSeconds={sessionSecondsById(sessions)}
        onToggleCounted={key => setNotCounted(prev => toggled(prev, key))}
        /* THE WIDER GESTURE, spelled the same way the narrow one is:
           a set of target keys, written all at once. See
           `applyAcrossKeys` — twelve exclusions, not a rule. */
        onApplyToEveryKey={(key, nowOut) =>
          setNotCounted(prev => applyAcrossKeys(prev, key, nowOut))}
        onDrill={key => {
          const target = selectedTargets.find(t => t.key === key);
          if (target) setDrilling(target);
        }}
        now={now}
      />

      {drilling && drillSurface && (
        /* THE SAME PANEL EVERY OTHER SURFACE OPENS. It asks Practice or
           Test, then runs the session — drill settings and rating on
           one screen, the run ended before it is rated. */
        <PracticeTestPanel
          key={drilling.key}
          surface={drillSurface}
          onClose={() => setDrilling(null)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------

/** The inversion state a chord-shape itemRef names, or null for the
 *  kinds that have none. */
function inversionOf(itemRef: string): InversionState | null {
  const parts = itemRef.split(':');
  return parts.length >= 4 ? (parts[3] as InversionState) : null;
}

/** The itemRef inside a `targetKey`. The key is `${itemRef} ${hand}`
 *  and an itemRef never contains a space. */
function refOf(key: string): string {
  return key.slice(0, key.lastIndexOf(' '));
}

function chordCellLabel(quality: string, keyName: string, spelling: Parameters<typeof spellKey>[1]): string {
  const entry = CHORD_QUALITY_BY_ID.get(quality);
  const suffix = entry?.suffix ?? '';
  const label = entry?.label ?? quality;
  // "Circle of 4ths (Major)": the row's name stands where a key would.
  if (keyName === CIRCLE_KEY) return `${CIRCLE_LABEL} (${label})`;
  return `${spellKey(keyName, spelling)}${suffix} (${label})`;
}

function verdictOf(
  target: CellTarget, byRefHand: ReadonlyMap<string, SpacingState>,
): BandVerdict {
  const row = byRefHand.get(targetKey(target.itemRef, target.hand));
  return row ? bandVerdictForRow(row) : NOT_STARTED;
}

/** Where a verdict sits, for the lowest-of rule and the count. */
function rank(v: BandVerdict): number {
  if (v.kind === 'not-started') return 0;
  if (v.kind === 'started') return 1;
  return { 'needs-work': 2, developing: 3, fluent: 4, mastered: 5 }[v.band];
}

/** In or out of the score, by target key. Nothing is deleted. */
function toggled(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

/**
 * The same change, to the same target, in every key of its row.
 *
 * =====================================================================
 * TWELVE EXCLUSIONS, NOT A RULE.
 *
 * It writes exactly what twelve clicks would have written, into the
 * same set every counting surface already reads. Nothing new is
 * stored and nothing new has to be consulted: the card, the grid,
 * every goal denominator and the session generator's scope all take a
 * set of target keys today, and they take this one.
 *
 * WHAT THAT COSTS, stated because it is real: a key added to the
 * catalog later does NOT inherit the change. There are twelve and
 * there have always been twelve, so the cost is theoretical — and
 * what it buys is that afterwards this is per cell again, so ONE key
 * can be put back without unpicking anything.
 *
 * SET, NOT TOGGLE. Every sibling ends up in the state the one you
 * clicked ended up in, so a row that was already half out comes out
 * whole rather than inverting into a stripe.
 * =====================================================================
 */
function applyAcrossKeys(
  set: ReadonlySet<string>, key: string, nowOut: boolean,
): ReadonlySet<string> {
  const next = new Set(set);
  for (const sibling of targetsAcrossKeys(key)) {
    if (nowOut) next.add(sibling); else next.delete(sibling);
  }
  return next;
}

function Toggle({ on, onClick, children }: {
  on: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={[
        'px-2 py-1 rounded-md border',
        on
          ? 'bg-fluent text-white border-fluent font-semibold'
          : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/**
 * One cell, naming its status and how much of it is there.
 *
 * THE WORD IS ON THE TILE, not only in a legend. A grid of colours asks
 * the reader to hold a key in their head while they scan it; the six
 * words are short enough to print. The count under it is the
 * prototype's, and it is the half of the cell that Edit what counts
 * moves.
 */
function StatusCell({ verdict, count, keyLabel, selected, title, onPick }: {
  verdict: BandVerdict;
  count: string | null;
  /** Set in the ACROSS layouts, where the key is not written down the
   *  side and the tile is the only place it can go. */
  keyLabel?: string;
  selected: boolean;
  title: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      title={title}
      aria-label={title}
      data-testid="chord-shape-cell"
      // NO `border` HERE. The fill is solid and an outline round it
      // would draw a grey ring on every painted cell; Not Started
      // brings its own dashed one from `bandCellClasses`.
      className={[
        // THE SHARED FLOOR, so a status word cannot be squeezed narrow
        // enough to break — see `GRID_CELL_MIN`.
        `w-full px-1 py-1 rounded-md text-[10px] leading-tight text-center ${GRID_CELL_MIN}`,
        bandCellClasses(verdict),
        selected ? 'ring-2 ring-fluent ring-offset-1' : '',
      ].join(' ')}
    >
      {keyLabel && <span className="block font-mono opacity-70">{keyLabel}</span>}
      <span className="block font-medium">{bandVerdictLabel(verdict)}</span>
      {count !== null && (
        <span className="block font-mono opacity-70">{count}</span>
      )}
    </button>
  );
}
