/**
 * MatrixSnapshot — read-only post-block "where this stands" view.
 *
 * Rendered after a Shapes & Patterns block finishes (scales, chord
 * shapes, or voice leading). It takes the block's drilled itemRefs,
 * derives which SKILL ROWS were touched (scale kind, chord quality,
 * or VL pattern rows), and lays each row out across all 12 keys in
 * circle-of-fourths order so the user sees the whole skill — not just
 * the keys they drilled this session.
 *
 * The keys actually drilled this session ("session keys") are
 * highlighted (fluent ring/underline on the column header + a subtle
 * column tint) to distinguish them from the surrounding context.
 *
 * Cells reflect live db.spacingState acquisition stages. The view is
 * READ-ONLY: cells are not clickable; the only interactive element is
 * the "Continue →" button. Scales + chord shapes use the shared
 * three-band (L/R/Both) cell; voice leading uses a single-fill cell
 * (it's two-handed by nature).
 */
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SpacingState, type AcquisitionStage } from '../../lib/db';
import { CIRCLE_OF_FOURTHS } from '../shapes-and-patterns/spTiers';
import ThreeBandCell, { type BandStage } from '../shapes-and-patterns/ThreeBandCell';
import {
  parseScaleItemRef,
  itemRefForScale,
  type PentStartingPoint,
} from '../shapes-and-patterns/scaleSkills';
import { parseShapesItemRef } from '../shapes-and-patterns/drillModel';
import { CHORD_QUALITY_BY_ID } from '../shapes-and-patterns/catalog';
import {
  parseVoiceLeadingItemRef,
  VOICE_LEADING_PATTERN_BY_ID,
  voiceLeadingGridRows,
} from '../shapes-and-patterns/catalog';

interface Props {
  /** The drilled itemRefs from the block (e.g. ['scale:major:C','scale:major:F'] or
   *  ['chord-shape:maj7:C:root', ...] or ['vl:major-251:guide-tones:A:C', ...]). */
  itemRefs: readonly string[];
  onContinue: () => void;
}

type Activity = 'scales' | 'chord-shapes' | 'voice-leading';

/** Per-hand stages a three-band cell needs (scales — single fill). */
interface BandTriple {
  left: BandStage;
  right: BandStage;
  both: BandStage;
}

/** Per-(hand × style) stages a six-slot chord-shape cell needs. */
interface BandSextet extends BandTriple {
  leftArp: BandStage;
  rightArp: BandStage;
  bothArp: BandStage;
}

/** One skill row across all 12 keys. `cells` maps keyName → cell. */
interface BandRow {
  kind: 'band';
  rowKey: string;
  label: string;
  cellRefByKey: Map<string, string>; // keyName → itemRef
}
interface SingleRow {
  kind: 'single';
  rowKey: string;
  label: string;
  cellRefByKey: Map<string, string>; // keyName → itemRef
}
type SnapshotRow = BandRow | SingleRow;

// --- Single-fill (voice-leading) palette — mirrors ThreeBandCell ----
type Bucket = 'empty' | 'acquiring' | 'acquired';
function bucketFor(stage: AcquisitionStage | null): Bucket {
  if (stage === 'acquired' || stage === 'consolidated' || stage === 'mastered') return 'acquired';
  if (stage === 'acquiring') return 'acquiring';
  return 'empty';
}
const BUCKET_BG: Readonly<Record<Bucket, string>> = {
  acquired:  'bg-mastered/35',
  acquiring: 'bg-developing/25',
  empty:     'bg-neutral-100 dark:bg-neutral-800',
};

function activityFor(firstRef: string | undefined): Activity | null {
  if (!firstRef) return null;
  if (firstRef.startsWith('scale:')) return 'scales';
  if (firstRef.startsWith('chord-shape:')) return 'chord-shapes';
  if (firstRef.startsWith('vl:')) return 'voice-leading';
  return null;
}

const ACTIVITY_SUBTITLE: Record<Activity, string> = {
  'scales':        'Scales across all 12 keys',
  'chord-shapes':  'Chord shapes across all 12 keys',
  'voice-leading': 'Voice leading across all 12 keys',
};

export default function MatrixSnapshot({ itemRefs, onContinue }: Props) {
  const spacingRows = useLiveQuery<SpacingState[]>(
    () => db.spacingState.where('moduleRef').equals('shapes-and-patterns').toArray(), []) ?? [];

  const activity = activityFor(itemRefs[0]);

  /** O(1) per-hand stage lookup: `${itemRef} ${hand}` → acquisitionStage. */
  const stageByRefHand = useMemo(() => {
    const m = new Map<string, AcquisitionStage>();
    for (const r of spacingRows) m.set(`${r.itemRef} ${r.hand}`, r.acquisitionStage);
    return m;
  }, [spacingRows]);

  /** All spacing rows whose itemRef starts with a given prefix — used
   *  by the chord-shape inversion aggregation. */
  const rowsByItemRef = useMemo(() => {
    const m = new Map<string, SpacingState[]>();
    for (const r of spacingRows) {
      const arr = m.get(r.itemRef);
      if (arr) arr.push(r); else m.set(r.itemRef, [r]);
    }
    return m;
  }, [spacingRows]);

  /** The keys drilled this session (highlighted columns). */
  const sessionKeys = useMemo(() => {
    const s = new Set<string>();
    for (const ref of itemRefs) {
      const keyName = keyNameForItemRef(ref, activity);
      if (keyName) s.add(keyName);
    }
    return s;
  }, [itemRefs, activity]);

  /** The skill rows touched this block, each spanning all 12 keys. */
  const rows = useMemo<SnapshotRow[]>(() => {
    if (activity === 'scales') return buildScaleRows(itemRefs);
    if (activity === 'chord-shapes') return buildChordRows(itemRefs);
    if (activity === 'voice-leading') return buildVoiceLeadingRows(itemRefs);
    return [];
  }, [itemRefs, activity]);

  // --- Per-cell stage resolution -----------------------------------
  const bandFor = (itemRef: string): BandTriple => ({
    left: stageByRefHand.get(`${itemRef} left`) ?? null,
    right: stageByRefHand.get(`${itemRef} right`) ?? null,
    both: stageByRefHand.get(`${itemRef} both`) ?? null,
  });

  /** Chord-shape band: aggregate across the cell's inversion rows, per
   *  (hand × style) slot for the 6-slot split display. */
  const chordBandFor = (baseRef: string): BandSextet => {
    const matched: SpacingState[] = [];
    const exact = rowsByItemRef.get(baseRef);
    if (exact) matched.push(...exact);
    const prefix = `${baseRef}:`;
    for (const [ref, arr] of rowsByItemRef) {
      if (ref.startsWith(prefix)) matched.push(...arr);
    }
    return {
      left: aggregateHand(matched, 'left', 'solid'),
      leftArp: aggregateHand(matched, 'left', 'arpeggiated'),
      right: aggregateHand(matched, 'right', 'solid'),
      rightArp: aggregateHand(matched, 'right', 'arpeggiated'),
      both: aggregateHand(matched, 'both', 'solid'),
      bothArp: aggregateHand(matched, 'both', 'arpeggiated'),
    };
  };

  const singleBucketFor = (itemRef: string): Bucket =>
    bucketFor(stageByRefHand.get(`${itemRef} both`) ?? null);

  if (!activity || rows.length === 0) {
    return (
      <div className="p-4">
        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          Nothing to show for this block.
        </div>
        <ContinueButton onContinue={onContinue} />
      </div>
    );
  }

  const isVL = activity === 'voice-leading';
  const keys = CIRCLE_OF_FOURTHS;

  return (
    <div className="p-4">
      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
        Progress snapshot
      </h2>
      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
        {ACTIVITY_SUBTITLE[activity]}
        <span className="ml-1">· highlighted keys were drilled this session</span>
      </p>

      <div className="mt-3 overflow-x-auto pb-4">
        <div
          className="grid items-center"
          style={{ gridTemplateColumns: `minmax(150px, 190px) repeat(12, minmax(40px, 56px))` }}
        >
          {/* Header row */}
          <div aria-hidden />
          {keys.map((k) => {
            const on = sessionKeys.has(k);
            return (
              <div
                key={`h-${k}`}
                className={
                  'text-center font-mono text-[10px] uppercase pb-1 ' +
                  (on
                    ? 'text-fluent font-semibold border-b-2 border-fluent'
                    : 'text-neutral-500 dark:text-neutral-400 border-b border-transparent')
                }
              >
                {k}
              </div>
            );
          })}

          {/* Skill rows */}
          {rows.map((row) => (
            <RowFragment key={row.rowKey}>
              <div className="text-xs pr-2 text-neutral-700 dark:text-neutral-300">
                {row.label}
              </div>
              {keys.map((k) => {
                const itemRef = row.cellRefByKey.get(k);
                const on = sessionKeys.has(k);
                // Drilled-this-session keys: a stronger ring + light fill
                // so the practiced column reads at a glance (a thin outline
                // alone was too subtle).
                const wrap = on ? 'ring-2 ring-fluent rounded-sm bg-fluent/10' : '';
                if (!itemRef) {
                  return <div key={`${row.rowKey}-${k}`} className={wrap} />;
                }
                if (isVL) {
                  const bucket = singleBucketFor(itemRef);
                  return (
                    <div key={`${row.rowKey}-${k}`} className={wrap}>
                      <div
                        title={itemRef}
                        className={
                          'aspect-square mx-0.5 my-0.5 rounded-sm border ' +
                          'border-neutral-300/70 dark:border-neutral-700 ' +
                          BUCKET_BG[bucket]
                        }
                      />
                    </div>
                  );
                }
                if (activity === 'chord-shapes') {
                  const band = chordBandFor(itemRef);
                  return (
                    <div key={`${row.rowKey}-${k}`} className={wrap}>
                      <ThreeBandCell
                        split
                        left={band.left}
                        leftArp={band.leftArp}
                        right={band.right}
                        rightArp={band.rightArp}
                        both={band.both}
                        bothArp={band.bothArp}
                        title={itemRef}
                      />
                    </div>
                  );
                }
                const band = bandFor(itemRef);
                return (
                  <div key={`${row.rowKey}-${k}`} className={wrap}>
                    <ThreeBandCell
                      left={band.left}
                      right={band.right}
                      both={band.both}
                      title={itemRef}
                    />
                  </div>
                );
              })}
            </RowFragment>
          ))}
        </div>
      </div>

      <ContinueButton onContinue={onContinue} />
    </div>
  );
}

// React.Fragment is fine inside a CSS grid (it adds no DOM box), so a
// label + 12 cells all become direct grid children.
function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function ContinueButton({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="mt-4 flex justify-end">
      <button
        onClick={onContinue}
        className="rounded-md bg-fluent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
      >
        Continue →
      </button>
    </div>
  );
}

// ===================================================================
// Key parsing — pick the musical key out of an itemRef per activity.
// ===================================================================
function keyNameForItemRef(itemRef: string, activity: Activity | null): string | null {
  if (activity === 'scales') {
    return parseScaleItemRef(itemRef)?.keyName ?? null;
  }
  if (activity === 'chord-shapes') {
    const d = parseShapesItemRef(itemRef);
    return d && d.kind === 'chord-shape' ? d.keyName : null;
  }
  if (activity === 'voice-leading') {
    return parseVoiceLeadingItemRef(itemRef)?.keyName ?? null;
  }
  return null;
}

// ===================================================================
// Row derivation per activity.
// ===================================================================

// Full readable names matching the scales matrix (scaleSkills.ts
// labelFor) — sans the key, which is the column here. Pents append
// "— from {startingPoint}" (e.g. "Major pentatonic — from 1").
const SCALE_KIND_LABEL: Record<string, string> = {
  'major':            'Major',
  'natural-minor':    'Natural minor',
  'major-pentatonic': 'Major pentatonic',
  'minor-pentatonic': 'Minor pentatonic',
};

/**
 * SCALES — one row per distinct scale "row identity". For major /
 * natural-minor the identity is just the kind; for pents it's the
 * kind plus its starting point (so "Major pent (1)" and "Major pent
 * (5)" are separate rows). Each row spans all 12 keys; cell itemRefs
 * are rebuilt via `itemRefForScale` for each key.
 */
function buildScaleRows(itemRefs: readonly string[]): SnapshotRow[] {
  // Preserve first-seen order while de-duping row identities.
  const seen = new Set<string>();
  const rows: SnapshotRow[] = [];
  for (const ref of itemRefs) {
    const desc = parseScaleItemRef(ref);
    if (!desc) continue;
    const sp = 'startingPoint' in desc ? desc.startingPoint : undefined;
    const rowKey = sp ? `${desc.kind}:${sp}` : desc.kind;
    if (seen.has(rowKey)) continue;
    seen.add(rowKey);

    const base = SCALE_KIND_LABEL[desc.kind] ?? desc.kind;
    const label = sp ? `${base} — from ${sp}` : base;

    const cellRefByKey = new Map<string, string>();
    for (const k of CIRCLE_OF_FOURTHS) {
      cellRefByKey.set(k, scaleItemRefForRow(desc.kind, sp, k));
    }
    rows.push({ kind: 'band', rowKey, label, cellRefByKey });
  }
  return rows;
}

/** Build a scale itemRef for a row identity (kind + optional starting
 *  point) in key K, going through the canonical `itemRefForScale`. */
function scaleItemRefForRow(
  kind: string,
  startingPoint: PentStartingPoint | undefined,
  keyName: string,
): string {
  switch (kind) {
    case 'major':
    case 'natural-minor':
      return itemRefForScale({ kind, keyName });
    case 'major-pentatonic':
      return itemRefForScale({
        kind: 'major-pentatonic',
        keyName,
        startingPoint: (startingPoint ?? '1') as Extract<PentStartingPoint, '1' | '5' | '6'>,
      });
    case 'minor-pentatonic':
      return itemRefForScale({
        kind: 'minor-pentatonic',
        keyName,
        startingPoint: (startingPoint ?? '1') as Extract<PentStartingPoint, '1' | 'b3' | 'b7'>,
      });
    default:
      return `scale:${kind}:${keyName}`;
  }
}

/**
 * CHORD SHAPES — one row per distinct quality. Cell itemRef for key K
 * is the bare `chord-shape:${quality}:${K}`; the band aggregation
 * (chordBandFor) folds in all the cell's inversion rows.
 */
function buildChordRows(itemRefs: readonly string[]): SnapshotRow[] {
  const seen = new Set<string>();
  const rows: SnapshotRow[] = [];
  for (const ref of itemRefs) {
    const d = parseShapesItemRef(ref);
    if (!d || d.kind !== 'chord-shape') continue;
    if (seen.has(d.quality)) continue;
    seen.add(d.quality);

    const label = CHORD_QUALITY_BY_ID.get(d.quality)?.label ?? d.quality;
    const cellRefByKey = new Map<string, string>();
    for (const k of CIRCLE_OF_FOURTHS) {
      cellRefByKey.set(k, `chord-shape:${d.quality}:${k}`);
    }
    rows.push({ kind: 'band', rowKey: `q-${d.quality}`, label, cellRefByKey });
  }
  return rows;
}

/**
 * VOICE LEADING — for each distinct drilled pattern, its grid rows
 * (one per type/position/inversion combo) each span all 12 keys.
 * Cell itemRef = row.itemRefForKey(K). Single-fill 'both' cells.
 */
function buildVoiceLeadingRows(itemRefs: readonly string[]): SnapshotRow[] {
  const patternIds: string[] = [];
  const seenPatterns = new Set<string>();
  for (const ref of itemRefs) {
    const d = parseVoiceLeadingItemRef(ref);
    if (!d) continue;
    if (seenPatterns.has(d.patternId)) continue;
    seenPatterns.add(d.patternId);
    patternIds.push(d.patternId);
  }

  const rows: SnapshotRow[] = [];
  for (const patternId of patternIds) {
    const pattern = VOICE_LEADING_PATTERN_BY_ID.get(patternId);
    if (!pattern) continue;
    for (const gridRow of voiceLeadingGridRows(pattern)) {
      const cellRefByKey = new Map<string, string>();
      for (const k of CIRCLE_OF_FOURTHS) {
        cellRefByKey.set(k, gridRow.itemRefForKey(k));
      }
      rows.push({
        kind: 'single',
        rowKey: `${patternId}:${gridRow.rowId}`,
        label: `${pattern.label} · ${gridRow.label}`,
        cellRefByKey,
      });
    }
  }
  return rows;
}

/**
 * Aggregate a set of inversion-row spacing rows for one (hand × style)
 * slot into a single band stage. Mirrors the spec exactly:
 *   · null    when no row exists for that slot;
 *   · 'acquired' when every row for that slot is acquired+ (acquired /
 *     consolidated / mastered);
 *   · 'acquiring' otherwise.
 */
function aggregateHand(
  rows: SpacingState[],
  hand: SpacingState['hand'],
  style: SpacingState['style'],
): BandStage {
  const forSlot = rows.filter(r => r.hand === hand && r.style === style);
  if (forSlot.length === 0) return null;
  const allAcquired = forSlot.every(
    r => r.acquisitionStage === 'acquired'
      || r.acquisitionStage === 'consolidated'
      || r.acquisitionStage === 'mastered',
  );
  return allAcquired ? 'acquired' : 'acquiring';
}
