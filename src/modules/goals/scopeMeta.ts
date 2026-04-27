import type { GoalScope } from '../../lib/db';

/**
 * Scope vocabulary + date-default helpers shared between the
 * existing GoalFormModal and the new GoalCreationFlow Step 3.
 * Extracted as part of Phase 1.6 build step 9 so both surfaces
 * source from the same constants and date math.
 */

export const SCOPE_ORDER: GoalScope[] = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'two_to_three_year',
  'lifetime',
];

export const SCOPE_LABEL: Record<GoalScope, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  two_to_three_year: '2 — 3 year',
  lifetime: 'Lifetime',
};

/** Scopes that carry no concrete measurable target — long-horizon
 *  vision goals. The existing modal hides metric / value / unit /
 *  context fields when the active scope is in this set. */
export const VISION_SCOPES = new Set<GoalScope>(['two_to_three_year', 'lifetime']);

function endOfWeek(now: number): number {
  const d = new Date(now);
  // 0=Sun, 1=Mon, ..., 6=Sat. The coming Sunday is `7 - dayOfWeek`
  // days away — except when today *is* Sunday, in which case "end of
  // this week" reads more naturally as the upcoming Sunday (7 days
  // out) rather than today, so push forward by a full week.
  const dayOfWeek = d.getDay();
  const daysToAdd = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
  d.setDate(d.getDate() + daysToAdd);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function endOfMonth(now: number): number {
  const d = new Date(now);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function endOfQuarter(now: number): number {
  const d = new Date(now);
  const q = Math.floor(d.getMonth() / 3);
  d.setMonth(q * 3 + 3, 0);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function endOfYear(now: number): number {
  const d = new Date(now);
  d.setFullYear(d.getFullYear(), 11, 31);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Sensible target-date default per scope. End-of-period for the
 *  measurable scopes; +2 years for the medium-vision scope; a fixed
 *  end-of-century anchor (Jan 1, 2100) for Lifetime so the default
 *  doesn't drift forward day-by-day with `now`. User can override
 *  via the date input on Step 3. */
export function defaultTargetDate(scope: GoalScope, now: number = Date.now()): number {
  switch (scope) {
    case 'weekly':            return endOfWeek(now);
    case 'monthly':           return endOfMonth(now);
    case 'quarterly':         return endOfQuarter(now);
    case 'yearly':            return endOfYear(now);
    case 'two_to_three_year': return now + 2 * 365 * 24 * 60 * 60 * 1000;
    case 'lifetime':          return new Date(2100, 0, 1, 23, 59, 59, 999).getTime();
  }
}

/** Render an epoch-ms timestamp into the YYYY-MM-DD shape an
 *  `<input type="date">` consumes / emits. */
export function dateInputValue(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function dateInputToMs(value: string): number | null {
  if (!value) return null;
  const parts = value.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  // End-of-day so date comparisons read intuitively.
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}
