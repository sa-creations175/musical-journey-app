/**
 * Phase 3 Step 1c — Clock-style time formatter for the global banner.
 *
 * Distinct from `formatDuration` in shapes drillModel.ts — that one
 * renders a human label ("12m 30s"), this one renders a running clock
 * ("12:30") suitable for a live timer surface. mm:ss under 1 hour,
 * h:mm:ss otherwise. Negative or non-finite inputs floor to "0:00".
 */
export function formatActiveTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${pad2(m)}:${pad2(s)}`;
  }
  return `${m}:${pad2(s)}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
