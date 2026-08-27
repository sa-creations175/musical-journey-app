/**
 * Where the tree's overrides are kept, and how a card gets its numbers.
 *
 * =====================================================================
 * ONE PREF KEY, NOT A TABLE, AND THE REASON IS THE SYNC BOUNDARY.
 *
 * The whole tree is a couple of dozen sparse objects — only what was
 * actually changed at each level is stored. That is small enough to be
 * one `userPrefs` row, which already syncs, already round-trips
 * through JSONB, and needs no schema version and no entry in
 * `sync/tables.ts`. A dedicated table would buy indexing nobody needs
 * and cost a migration on a database that holds the user's practice
 * history.
 *
 * EVERYTHING IS RE-VALIDATED ON READ. These values cross a sync
 * boundary and can arrive from another device or an older build; a
 * negative ceiling or a tally of strings would otherwise reach the
 * scheduler and put a card somewhere it can never come back from.
 * =====================================================================
 */

import { getPref, setPref } from '../userPrefs';
import { ACCURACY_BANDS, type AccuracyBand } from './bands';
import {
  DEFAULT_SPACING_SETTINGS, TALLY_DAYS, resolveSettings, effectiveInSchedule,
  type AcquiringMissPolicy, type BandGrowth, type MaintainingMissPolicy,
  type PartialSpacingSettings, type ResolvedSettings, type SettingsLevel,
  type SpacingSettings,
} from './settings';
import { chainForCard, chainForId } from './tree';

export const PREF_SPACING_TREE = 'spacingTreeSettings';

/** Node id → what that level sets. Absent ids set nothing. */
export type SpacingOverrides = Record<string, PartialSpacingSettings>;

// =====================================================================
// Validation
// =====================================================================

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** At least 1 day, whole. Zero or negative would make a card either
 *  permanently due or permanently unreachable. */
function positiveDays(v: unknown): number | undefined {
  if (!isFiniteNumber(v) || v < 1) return undefined;
  return Math.round(v);
}

/** Above 1. A factor of 1 or less never grows, so the wait would sit
 *  still or shrink forever — a sequence with no end. */
function growthFactor(v: unknown): number | undefined {
  if (!isFiniteNumber(v) || v <= 1) return undefined;
  return v;
}

function cleanTally(v: unknown): number[] | undefined {
  if (!Array.isArray(v) || v.length !== TALLY_DAYS) return undefined;
  const out = v.map(x => (isFiniteNumber(x) && x >= 0 ? Math.round(x) : 0));
  // An all-zero tally schedules nothing to acquire. The engine treats
  // it as "already past the stage", which is a real choice a reader can
  // make, so it is allowed through rather than corrected.
  return out;
}

function cleanGrowth(v: unknown): BandGrowth | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const g = v as { kind?: unknown; factor?: unknown };
  if (g.kind === 'back-to-first') return { kind: 'back-to-first' };
  if (g.kind === 'multiply') {
    const factor = growthFactor(g.factor);
    return factor === undefined ? undefined : { kind: 'multiply', factor };
  }
  return undefined;
}

const ACQUIRING_MISS = ['repeat-session', 'add-to-next-day', 'restart-pattern', 'nothing'];
const MAINTAINING_MISS = ['back-to-first-wait', 'halve', 'nothing'];

const oneOf = <T extends string>(v: unknown, allowed: string[]): T | undefined =>
  typeof v === 'string' && allowed.includes(v) ? (v as T) : undefined;

/** Drop anything unrecognised rather than carrying it forward. */
export function cleanPartial(raw: unknown): PartialSpacingSettings {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, any>;
  const out: PartialSpacingSettings = {};

  if (typeof r.inSchedule === 'boolean') out.inSchedule = r.inSchedule;

  const tally = cleanTally(r.acquiring?.tally);
  const acqMiss = oneOf<AcquiringMissPolicy>(r.acquiring?.onWrong, ACQUIRING_MISS);
  if (tally !== undefined || acqMiss !== undefined) {
    out.acquiring = {
      ...(tally !== undefined ? { tally } : {}),
      ...(acqMiss !== undefined ? { onWrong: acqMiss } : {}),
    };
  }

  const first = positiveDays(r.maintaining?.firstWaitDays);
  const minimum = positiveDays(r.maintaining?.minimumDays);
  const mainMiss = oneOf<MaintainingMissPolicy>(r.maintaining?.onWrong, MAINTAINING_MISS);
  const perBand: Partial<Record<AccuracyBand, { growth?: BandGrowth; ceilingDays?: number }>> = {};
  for (const band of ACCURACY_BANDS) {
    const rule = r.maintaining?.perBand?.[band.id];
    if (rule === undefined || rule === null) continue;
    const growth = cleanGrowth(rule.growth);
    const ceiling = positiveDays(rule.ceilingDays);
    if (growth !== undefined || ceiling !== undefined) {
      perBand[band.id] = {
        ...(growth !== undefined ? { growth } : {}),
        ...(ceiling !== undefined ? { ceilingDays: ceiling } : {}),
      };
    }
  }
  if (first !== undefined || minimum !== undefined || mainMiss !== undefined
      || Object.keys(perBand).length > 0) {
    out.maintaining = {
      ...(first !== undefined ? { firstWaitDays: first } : {}),
      ...(minimum !== undefined ? { minimumDays: minimum } : {}),
      ...(mainMiss !== undefined ? { onWrong: mainMiss } : {}),
      ...(Object.keys(perBand).length > 0 ? { perBand } : {}),
    };
  }

  const grace = positiveDays(r.stale?.graceDays);
  const dueSoon = positiveDays(r.stale?.dueSoonDays);
  if (grace !== undefined || dueSoon !== undefined) {
    out.stale = {
      ...(dueSoon !== undefined ? { dueSoonDays: dueSoon } : {}),
      ...(grace !== undefined ? { graceDays: grace } : {}),
    };
  }

  return out;
}

// =====================================================================
// Read and write
// =====================================================================

export async function loadOverrides(): Promise<SpacingOverrides> {
  const raw = await getPref<unknown>(PREF_SPACING_TREE, {});
  if (typeof raw !== 'object' || raw === null) return {};
  const out: SpacingOverrides = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const cleaned = cleanPartial(value);
    if (Object.keys(cleaned).length > 0) out[id] = cleaned;
  }
  return out;
}

export async function saveOverrides(overrides: SpacingOverrides): Promise<void> {
  await setPref(PREF_SPACING_TREE, overrides);
}

/**
 * Replace what one level sets. An empty partial removes the level
 * entirely, which is how "reset to inherited" is expressed — storing
 * an empty object would leave a row claiming to set nothing.
 */
export async function setNodeSettings(
  nodeId: string,
  partial: PartialSpacingSettings,
): Promise<SpacingOverrides> {
  const overrides = await loadOverrides();
  const cleaned = cleanPartial(partial);
  if (Object.keys(cleaned).length === 0) delete overrides[nodeId];
  else overrides[nodeId] = cleaned;
  await saveOverrides(overrides);
  return overrides;
}

// =====================================================================
// Resolution
// =====================================================================

/** The chain as the resolver wants it, with each level's own overrides. */
export function levelsFor(
  chain: ReadonlyArray<{ id: string; label: string }>,
  overrides: SpacingOverrides,
): SettingsLevel[] {
  return chain.map(n => ({
    id: n.id,
    label: n.label,
    settings: overrides[n.id] ?? {},
  }));
}

/** Full resolution for a tree node — value plus where each field came
 *  from. This is what the settings screen renders. */
export function resolveForNode(
  nodeId: string,
  overrides: SpacingOverrides,
): ResolvedSettings & { inSchedule: boolean } {
  const chain = chainForId(nodeId);
  if (chain === null) {
    return {
      ...resolveSettings([]),
      inSchedule: DEFAULT_SPACING_SETTINGS.inSchedule,
    };
  }
  const levels = levelsFor(chain, overrides);
  const resolved = resolveSettings(levels);
  // The switch is an AND down the chain, not last-writer-wins, so it is
  // computed separately and then written onto the value the scheduler
  // will actually read.
  const on = effectiveInSchedule(levels);
  resolved.value.inSchedule = on;
  return { ...resolved, inSchedule: on };
}

/** The settings one card is scheduled by. What the engine gets. */
export function settingsForCard(
  moduleRef: string,
  itemRef: string,
  overrides: SpacingOverrides,
): SpacingSettings {
  const chain = chainForCard(moduleRef, itemRef);
  const levels = levelsFor(chain, overrides);
  const resolved = resolveSettings(levels);
  resolved.value.inSchedule = effectiveInSchedule(levels);
  return resolved.value;
}

/** The same, reading the pref itself. The per-answer path. */
export async function loadSettingsForCard(
  moduleRef: string,
  itemRef: string,
): Promise<SpacingSettings> {
  return settingsForCard(moduleRef, itemRef, await loadOverrides());
}
