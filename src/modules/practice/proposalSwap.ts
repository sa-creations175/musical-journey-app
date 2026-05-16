/**
 * Pure helpers for the proposal-screen block-swap flow (Step 2 of
 * the Flexible Session Proposal build).
 *
 * Three responsibilities:
 *
 *   · submoduleKeyForBlock — derive a granular submodule id from a
 *     ProposalBlock. For most modules this is just moduleRef; S&P
 *     splits into three sub-types (chord-shape / scale / vl) based
 *     on itemRef prefix.
 *
 *   · sameSubmoduleAlternatives / differentSubmoduleAlternatives —
 *     compute the two sections of the swap picker from a snapshot
 *     of spacingState rows + db.songs. Pure: no DB, no React.
 *
 *   · applySwap — replace a block's items / module metadata with a
 *     chosen alternative, preserving plannedSeconds, position, and
 *     id. Returns a fresh blocks array.
 *
 * Sorting: items are ranked by `nextDueAt` ascending (smaller =
 * more overdue). Items with `null` nextDueAt (untouched) sort last
 * — per the design call, "due" is the primary lens here; cold-start
 * lives in the algorithm's own pipeline, not this manual-pick flow.
 *
 * Exclusion: items already present in any block in the current
 * proposal are filtered out so the picker never suggests a swap
 * that duplicates an existing item.
 */

import type { ProposalBlock } from './proposalTypes';
import type { Song, SpacingState } from '../../lib/db';
import { isModuleAllowedForContext } from '../../lib/sessionAlgorithm/contextWeighting';
import { moduleMetaById } from '../../lib/moduleMeta';
import { cardById } from '../harmonic-fluency/catalog';
import { labelForShapesItemRef } from '../shapes-and-patterns/drillModel';
import { INTERVAL_SEEDS } from '../ear-training/intervals/seed';
import { CHORD_SEEDS } from '../ear-training/chord-recognition/seed';
import { PROGRESSIONS } from '../ear-training/chord-progressions/catalog';
import { MODES } from '../ear-training/scales-modes/catalog';
import { PRODUCTION_PATHS } from '../production/content/paths';
import { lessonsByPath } from '../production/content/lessons';
import type { PracticeSessionContext } from '../../lib/db';

// =====================================================================
// Types
// =====================================================================

/** Picker option in the "Different focus, same module" section. */
export interface SameSubmoduleOption {
  itemRef: string;
  label: string;
  /** ms-overdue: positive = overdue by this many ms, negative = not
   *  yet due by |x| ms, null = untouched (no spacingState row). */
  urgencyMs: number | null;
}

/** Picker option in the "Different module" section. Each row represents
 *  one alternative submodule; the top 1-3 most-due items are nested for
 *  the expand-then-pick UX. */
export interface DifferentSubmoduleOption {
  submoduleKey: string;
  moduleRef: string;
  submoduleLabel: string;
  /** 1-3 items in this submodule, most-due first (already sorted). */
  topItems: SameSubmoduleOption[];
  /** Min urgencyMs across topItems — used to sort submodules among
   *  themselves. null = no items have spacing data. */
  topUrgencyMs: number | null;
}

export interface SwapAlternatives {
  sameSubmodule: SameSubmoduleOption[];
  differentSubmodule: DifferentSubmoduleOption[];
}

/** Caller's chosen alternative. */
export type SwapChoice =
  | {
      kind: 'same-submodule';
      itemRef: string;
      label: string;
    }
  | {
      kind: 'different-submodule';
      submoduleKey: string;
      moduleRef: string;
      itemRef: string;
      label: string;
    };

// =====================================================================
// Constants
// =====================================================================

/** Same-submodule items list cap. Sessions never have more than ~10
 *  surviving items in one submodule, but a long-tail catalog like
 *  HF can produce hundreds of candidates — cap keeps the picker
 *  scannable. */
export const SAME_SUBMODULE_LIMIT = 20;

/** Top-N items shown when a "Different module" row is expanded. */
export const DIFFERENT_SUBMODULE_TOP_N = 3;

/** Special submodule-key prefix for S&P (since one moduleRef covers
 *  three behaviour-distinct sub-types). */
const SP_PREFIX = 'shapes-and-patterns';

// =====================================================================
// Submodule classification
// =====================================================================

/**
 * Granular submodule id for a block. S&P gets a sub-classification by
 * itemRef prefix; every other module returns its moduleRef unchanged.
 *
 * Returns a stable string usable as a map / set key. The format is
 * `moduleRef` OR `moduleRef:subkind` (only used for S&P today; future
 * modules can extend if they need similar splits).
 */
export function submoduleKeyForBlock(block: ProposalBlock): string {
  if (block.moduleRef !== SP_PREFIX) return block.moduleRef;
  const first = block.itemRefs[0];
  if (first?.startsWith('chord-shape:')) return `${SP_PREFIX}:chord-shape`;
  if (first?.startsWith('scale:')) return `${SP_PREFIX}:scale`;
  if (first?.startsWith('vl:')) return `${SP_PREFIX}:vl`;
  // No itemRefs OR an unknown prefix — fall back to the top-level
  // moduleRef so the swap picker still surfaces something rather
  // than getting stuck on classification.
  return block.moduleRef;
}

/** Inverse: extract the top-level moduleRef from a submoduleKey. */
export function moduleRefForSubmodule(key: string): string {
  const colonIdx = key.indexOf(':');
  return colonIdx >= 0 ? key.slice(0, colonIdx) : key;
}

/** Human label for a submodule key. S&P sub-types are hand-rolled;
 *  every other key delegates to moduleMetaById. */
export function submoduleLabel(key: string): string {
  if (key === `${SP_PREFIX}:chord-shape`) return 'Chord Shapes';
  if (key === `${SP_PREFIX}:scale`) return 'Scales (S&P)';
  if (key === `${SP_PREFIX}:vl`) return 'Voice Leading';
  const meta = moduleMetaById(moduleRefForSubmodule(key));
  return meta?.label ?? key;
}

/** Classify a spacingState row into a submodule key. Mirrors
 *  submoduleKeyForBlock but operates on (moduleRef, itemRef) pair. */
function submoduleKeyForRow(moduleRef: string, itemRef: string): string {
  if (moduleRef !== SP_PREFIX) return moduleRef;
  if (itemRef.startsWith('chord-shape:')) return `${SP_PREFIX}:chord-shape`;
  if (itemRef.startsWith('scale:')) return `${SP_PREFIX}:scale`;
  if (itemRef.startsWith('vl:')) return `${SP_PREFIX}:vl`;
  return moduleRef;
}

// =====================================================================
// Item label resolution
// =====================================================================

/**
 * Resolve a human-readable label for an itemRef. Falls back to the
 * raw itemRef when the catalog lookup misses — defensive, shouldn't
 * happen in practice.
 *
 * Repertoire songs aren't in spacingState; the caller passes a
 * `songsById` map keyed by song.id so labels still resolve.
 */
export function labelForItem(
  itemRef: string,
  moduleRef: string,
  songsById: ReadonlyMap<string, Song>,
): string {
  if (moduleRef === SP_PREFIX) {
    const sp = labelForShapesItemRef(itemRef);
    if (sp) return sp;
  }
  if (moduleRef === 'harmonic-fluency') {
    return cardById(itemRef)?.question ?? itemRef;
  }
  if (moduleRef === 'intervals') {
    return INTERVAL_SEEDS.find(x => x.id === itemRef)?.name ?? itemRef;
  }
  if (moduleRef === 'chord-recognition') {
    return CHORD_SEEDS.find(x => x.id === itemRef)?.name ?? itemRef;
  }
  if (moduleRef === 'chord-progressions') {
    return PROGRESSIONS.find(x => x.id === itemRef)?.name ?? itemRef;
  }
  if (moduleRef === 'scales-modes') {
    return MODES.find(x => x.id === itemRef)?.name ?? itemRef;
  }
  if (moduleRef === 'production') {
    for (const path of PRODUCTION_PATHS) {
      const lesson = lessonsByPath(path.id).find(l => l.id === itemRef);
      if (lesson) return lesson.title;
    }
    return itemRef;
  }
  if (moduleRef === 'repertoire') {
    return songsById.get(itemRef)?.title ?? itemRef;
  }
  return itemRef;
}

// =====================================================================
// Urgency
// =====================================================================

/** ms-overdue for a spacingState row. Positive = overdue, negative =
 *  not yet due, null = untouched. */
function urgencyFromRow(
  row: SpacingState | undefined,
  now: number,
): number | null {
  if (!row) return null;
  if (row.nextDueAt === null) return null;
  return now - row.nextDueAt;
}

/** Songs have no row-level due timestamp; the existing convention
 *  uses `learningOrder` (1 = study next) as the "what's most
 *  important to practise" signal. Map it into the same urgencyMs
 *  space the spacingState-backed items use: lower order = higher
 *  priority = larger urgencyMs. Range stays positive so songs
 *  always sort ahead of "null" untouched items. Magnitude isn't
 *  comparable to spacingState ms-overdue values across modules
 *  (each submodule sorts internally), so the absolute scale is
 *  irrelevant — only intra-Repertoire ordering matters. */
function urgencyFromLearningOrder(learningOrder: number): number {
  return -learningOrder;
}

/** Stable urgency comparator: most-overdue first; null urgency last
 *  (untouched items aren't "overdue," they're un-engaged). */
function compareByUrgency(
  a: { urgencyMs: number | null },
  b: { urgencyMs: number | null },
): number {
  const aNull = a.urgencyMs === null;
  const bNull = b.urgencyMs === null;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  // Higher urgencyMs (more overdue) first → b - a.
  return (b.urgencyMs as number) - (a.urgencyMs as number);
}

// =====================================================================
// Exclusion: items already in the proposal
// =====================================================================

/** Every itemRef across every block in the proposal. The block being
 *  swapped is included — swap-to-itself shouldn't surface. */
function allInUseItemRefs(blocks: ReadonlyArray<ProposalBlock>): Set<string> {
  const out = new Set<string>();
  for (const b of blocks) {
    for (const ref of b.itemRefs) out.add(ref);
  }
  return out;
}

// =====================================================================
// Same-submodule alternatives
// =====================================================================

/**
 * Items in the same submodule as `block`, sorted by urgency,
 * excluding anything already present in `allBlocks`. Capped at
 * SAME_SUBMODULE_LIMIT.
 *
 * Production blocks return [] for same-submodule swap — production
 * lesson sequencing has unlock semantics that don't match a flat
 * "pick another lesson" UX; v1 scopes Production to the
 * different-module path only.
 *
 * Repertoire blocks read from `songs` (filtered to learningOrder-set
 * rows = actively learning, the existing convention), not spacingState.
 */
export function sameSubmoduleAlternatives(args: {
  block: ProposalBlock;
  allBlocks: ReadonlyArray<ProposalBlock>;
  spacingRows: ReadonlyArray<SpacingState>;
  songs: ReadonlyArray<Song>;
  now: number;
}): SameSubmoduleOption[] {
  const { block, allBlocks, spacingRows, songs, now } = args;
  const submoduleKey = submoduleKeyForBlock(block);
  const excluded = allInUseItemRefs(allBlocks);
  const songsById = new Map(songs.map(s => [s.id, s]));

  // Repertoire branch: source from db.songs, not spacingState. Songs
  // don't carry their own staleness timestamp at the row level, so
  // the existing learningOrder field stands in as "what to practise
  // next" — lower order = higher priority. Treated as ms-equivalent
  // for the urgency comparator: more priority maps to a larger
  // urgencyMs value so it sorts first.
  if (block.moduleRef === 'repertoire') {
    const out: SameSubmoduleOption[] = [];
    for (const s of songs) {
      if (s.learningOrder === undefined || s.learningOrder === null) continue;
      if (excluded.has(s.id)) continue;
      out.push({
        itemRef: s.id,
        label: s.title,
        urgencyMs: urgencyFromLearningOrder(s.learningOrder),
      });
    }
    out.sort(compareByUrgency);
    return out.slice(0, SAME_SUBMODULE_LIMIT);
  }

  // Production: punt for v1 (see header).
  if (block.moduleRef === 'production') return [];

  // Everything else: spacingState rows filtered by submodule key.
  const out: SameSubmoduleOption[] = [];
  for (const row of spacingRows) {
    if (excluded.has(row.itemRef)) continue;
    if (submoduleKeyForRow(row.moduleRef, row.itemRef) !== submoduleKey) continue;
    out.push({
      itemRef: row.itemRef,
      label: labelForItem(row.itemRef, row.moduleRef, songsById),
      urgencyMs: urgencyFromRow(row, now),
    });
  }
  out.sort(compareByUrgency);
  return out.slice(0, SAME_SUBMODULE_LIMIT);
}

// =====================================================================
// Different-submodule alternatives
// =====================================================================

/**
 * One row per other submodule with at least one available item,
 * sorted by the urgency of each submodule's most-due item. Each row
 * carries the top 1-3 most-due items so the picker can expand on tap
 * and let the user pick which item lands in the swap.
 *
 * Context filter: only submodules allowed by the user's current
 * practice context surface (e.g. on a keys session, HF / ET /
 * Production are filtered out — the swap target should be something
 * the user can actually do at this session).
 *
 * Repertoire surfaces as a submodule with topItems sourced from
 * db.songs (learningOrder-set, lastEngagedAt as urgency).
 * Production surfaces with topItems from spacingState as usual.
 */
export function differentSubmoduleAlternatives(args: {
  block: ProposalBlock;
  allBlocks: ReadonlyArray<ProposalBlock>;
  spacingRows: ReadonlyArray<SpacingState>;
  songs: ReadonlyArray<Song>;
  context: PracticeSessionContext;
  now: number;
}): DifferentSubmoduleOption[] {
  const { block, allBlocks, spacingRows, songs, context, now } = args;
  const currentKey = submoduleKeyForBlock(block);
  const excluded = allInUseItemRefs(allBlocks);
  const songsById = new Map(songs.map(s => [s.id, s]));

  // Group spacingState items by submodule key.
  const grouped = new Map<string, SameSubmoduleOption[]>();
  for (const row of spacingRows) {
    if (excluded.has(row.itemRef)) continue;
    const key = submoduleKeyForRow(row.moduleRef, row.itemRef);
    if (key === currentKey) continue;
    const moduleRef = moduleRefForSubmodule(key);
    if (!isModuleAllowedForContext(moduleRef, context)) continue;
    const list = grouped.get(key) ?? [];
    list.push({
      itemRef: row.itemRef,
      label: labelForItem(row.itemRef, row.moduleRef, songsById),
      urgencyMs: urgencyFromRow(row, now),
    });
    grouped.set(key, list);
  }

  // Repertoire branch: add as its own submodule if context allows
  // and there are eligible songs.
  if (
    currentKey !== 'repertoire' &&
    isModuleAllowedForContext('repertoire', context)
  ) {
    const songItems: SameSubmoduleOption[] = [];
    for (const s of songs) {
      if (s.learningOrder === undefined || s.learningOrder === null) continue;
      if (excluded.has(s.id)) continue;
      songItems.push({
        itemRef: s.id,
        label: s.title,
        urgencyMs: urgencyFromLearningOrder(s.learningOrder),
      });
    }
    if (songItems.length > 0) grouped.set('repertoire', songItems);
  }

  // Materialise per-submodule options with top N items.
  const out: DifferentSubmoduleOption[] = [];
  for (const [submoduleKey, items] of grouped) {
    items.sort(compareByUrgency);
    const topItems = items.slice(0, DIFFERENT_SUBMODULE_TOP_N);
    if (topItems.length === 0) continue;
    out.push({
      submoduleKey,
      moduleRef: moduleRefForSubmodule(submoduleKey),
      submoduleLabel: submoduleLabel(submoduleKey),
      topItems,
      topUrgencyMs: topItems[0].urgencyMs,
    });
  }

  // Sort submodules among themselves by their top item's urgency.
  out.sort((a, b) => compareByUrgency(
    { urgencyMs: a.topUrgencyMs },
    { urgencyMs: b.topUrgencyMs },
  ));
  return out;
}

// =====================================================================
// Apply
// =====================================================================

/**
 * Replace the block whose id matches `blockId` with a version
 * carrying the chosen alternative's items + label. Preserves the
 * block's position in the array, its id, and its plannedSeconds —
 * per spec, swap doesn't change session duration.
 *
 * For same-submodule swaps: moduleRef / accent / isKeyboardRequired
 * / isSongPractice / inSessionDrillKind all stay (the block IS
 * still the same submodule). Only itemRefs + activityDescription
 * change.
 *
 * For different-submodule swaps: module metadata (label, accent,
 * isKeyboardRequired) re-derives from moduleMetaById on the new
 * moduleRef. isSongPractice flips true iff swapping to Repertoire.
 * inSessionDrillKind + quickLaunchRoute drop — the original
 * modal/route was specific to the old module; the user is taken to
 * the new module's default surface instead.
 */
export function applySwap(
  blocks: ReadonlyArray<ProposalBlock>,
  blockId: string,
  choice: SwapChoice,
): ProposalBlock[] {
  return blocks.map(b => {
    if (b.id !== blockId) return b;

    if (choice.kind === 'same-submodule') {
      return {
        ...b,
        itemRefs: [choice.itemRef],
        activityDescription: choice.label,
        whySnippet: 'Swapped — most due in this submodule',
      };
    }

    // Different-submodule: re-derive module metadata.
    const meta = moduleMetaById(choice.moduleRef);
    return {
      ...b,
      moduleRef: choice.moduleRef,
      moduleLabel: meta?.label ?? choice.moduleRef,
      moduleAccentHex: meta?.accentHex ?? b.moduleAccentHex,
      itemRefs: [choice.itemRef],
      activityDescription: choice.label,
      whySnippet: 'Swapped — most due in this module',
      isWarmup: false,
      isSongPractice: choice.moduleRef === 'repertoire',
      isKeyboardRequired:
        choice.moduleRef === 'shapes-and-patterns' ||
        choice.moduleRef === 'repertoire',
      // Drop original-module-specific routing / drill modal hints —
      // the user lands on the new module's default surface.
      quickLaunchRoute: undefined,
      inSessionDrillKind: undefined,
    };
  });
}
