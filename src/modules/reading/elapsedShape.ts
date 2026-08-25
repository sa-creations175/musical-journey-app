import { db } from '../../lib/db';
import { WALK_AWAY_CEILING_MS } from '../../lib/attemptTiming';
import { READING_MODULE_REF } from '../goals/progress';

/**
 * The shape of Reading's recorded answer times. READ ONLY.
 *
 * =====================================================================
 * THE CORPUS IS CONTAMINATED AND THIS DOES NOT CLEAN IT.
 *
 * ReadingDrill sets `shownAt` once per card and never invalidates it,
 * so a card left open overnight is stored as an answer that took
 * hours. Those rows are real records of nothing, and they are mixed in
 * with genuine measurements under one field name.
 *
 * This counts them and describes what is left underneath. It deletes
 * nothing and changes nothing — the shape has to be visible before
 * anyone decides what to do about it, and a cleanup written before
 * that decision would destroy the evidence for it.
 *
 * Run from the browser console, where the data actually lives:
 *
 *     await window.__readingElapsedShape()
 * =====================================================================
 */

export interface ElapsedShape {
  attempts: number;
  withElapsed: number;
  missingElapsed: number;
  /** Above the five-minute walk-away line — the contaminated ones. */
  overCeiling: number;
  /** The worst single reading, in hours, or null when there are none. */
  worstHours: number | null;
  /** Percentiles of the readings BELOW the ceiling, in ms. */
  belowCeiling: {
    count: number;
    min: number;
    p25: number;
    median: number;
    p75: number;
    p90: number;
    p99: number;
    max: number;
  } | null;
  /** Counts per bucket, below the ceiling. */
  buckets: Array<{ label: string; count: number }>;
}

const BUCKETS: ReadonlyArray<{ label: string; upToMs: number }> = [
  { label: '<1s', upToMs: 1_000 },
  { label: '1–2s', upToMs: 2_000 },
  { label: '2–3s', upToMs: 3_000 },
  { label: '3–5s', upToMs: 5_000 },
  { label: '5–10s', upToMs: 10_000 },
  { label: '10–30s', upToMs: 30_000 },
  { label: '30s–1m', upToMs: 60_000 },
  { label: '1–5m', upToMs: WALK_AWAY_CEILING_MS },
];

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * fraction)),
  );
  return sorted[index];
}

export async function readingElapsedShape(): Promise<ElapsedShape> {
  const attempts = await db.attempts
    .where('moduleId').equals(READING_MODULE_REF).toArray();
  const readings = attempts
    .map(a => a.elapsedMs)
    .filter((ms): ms is number => typeof ms === 'number');
  const below = readings.filter(ms => ms <= WALK_AWAY_CEILING_MS).sort((a, b) => a - b);
  const over = readings.filter(ms => ms > WALK_AWAY_CEILING_MS);

  return {
    attempts: attempts.length,
    withElapsed: readings.length,
    missingElapsed: attempts.length - readings.length,
    overCeiling: over.length,
    worstHours: over.length === 0
      ? null
      : Math.round((Math.max(...over) / 3_600_000) * 10) / 10,
    belowCeiling: below.length === 0 ? null : {
      count: below.length,
      min: below[0],
      p25: percentile(below, 0.25),
      median: percentile(below, 0.5),
      p75: percentile(below, 0.75),
      p90: percentile(below, 0.9),
      p99: percentile(below, 0.99),
      max: below[below.length - 1],
    },
    buckets: BUCKETS.map((bucket, i) => ({
      label: bucket.label,
      count: below.filter(
        ms => ms <= bucket.upToMs && (i === 0 || ms > BUCKETS[i - 1].upToMs),
      ).length,
    })),
  };
}

declare global {
  interface Window {
    __readingElapsedShape?: typeof readingElapsedShape;
  }
}

if (typeof window !== 'undefined') {
  window.__readingElapsedShape = readingElapsedShape;
}
