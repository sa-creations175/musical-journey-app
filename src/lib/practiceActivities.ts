/**
 * What a practice sitting actually WAS — one definition, for every
 * surface that asks.
 *
 * ---------------------------------------------------------------
 * THE LIST RECORDS WHAT I DID. NOT WHY, AND NOT HOW READY I FELT.
 *
 * That single rule is what decides whether a proposed entry belongs.
 * It is why "test prep" was ruled out: it names a motive, and the same
 * forty minutes would be filed differently depending on what was
 * coming up rather than on what happened at the keyboard. How ready it
 * felt is already a question — `feelRating`, on the four-step scale in
 * `fluencyScale.ts` — and asking it twice in two vocabularies would
 * give two answers that can disagree.
 *
 * The list is expected to GROW, in the user's own words, which is what
 * `other` and its free text exist for. Slugs are stable and the labels
 * are not: a label can be reworded without rewriting history, and a
 * stored `'in-time'` keeps meaning what it meant.
 * ---------------------------------------------------------------
 *
 * NOTHING HERE IS REQUIRED. `logPractice.ts` states the principle this
 * follows — duration is the record, everything else is optional — and
 * the reason is the same one: a taxonomy decision at the end of a
 * practice session is friction the session did not earn. The
 * three-clean-runs test earns its friction, because passing it is the
 * thing being proven. Naming what you did does not.
 *
 * A sitting with nothing ticked is therefore a COMPLETE record, and
 * the field is omitted rather than written as `[]` — see the write in
 * `logPractice.ts`. "No activity data" and "no activity data" are the
 * same fact whether the row predates this field or the user simply did
 * not answer, and nothing reads the field yet that could tell them
 * apart or would be entitled to.
 */

/** Stored value. Stable — labels below may be reworded, these may not. */
export type PracticeActivity =
  | 'lead-sheet'
  | 'tutorial'
  | 'under-the-fingers'
  | 'in-time'
  | 'just-playing'
  | 'other';

export interface PracticeActivityOption {
  activity: PracticeActivity;
  /** Shown as written. Lowercase on purpose — these are labels for
   *  what happened, not buttons that act. */
  label: string;
  /**
   * A second line, ONLY where the label alone could be read as
   * something the app must not record. Two of the six carry one, and
   * the absence of a hint on the other four is the signal that they
   * mean exactly what they say.
   */
  hint?: string;
  /** True for the entry that opens a free-text line. */
  freeText?: boolean;
}

/**
 * The six, in the order they are offered.
 *
 * TWO OF THESE CARRY RULES THAT OUTLIVE THE COPY.
 *
 *   `in-time` — "practising in time" is NEVER inferred from whether
 *   the metronome ran. The metronome being available does not mean it
 *   was used, and deliberately practising to a click is a distinct
 *   kind of work whose FREQUENCY is the thing worth being able to see,
 *   precisely because it is the one most often skipped. A derived
 *   value would report the frequency of the metronome being on screen.
 *   Its hint says "to a click" so it cannot be read as "I played it up
 *   to speed", which is a claim about tempo and belongs to a test.
 *
 *   `just-playing` — distinct from working on a song, and NOT a
 *   lesser grade of practice. It is a real share of the time, and a
 *   song that keeps getting just-played is alive in a way nothing else
 *   on the page shows. So it lands in the same field as the rest and
 *   nothing downgrades a sitting for carrying it. Its hint says "not
 *   working on it" for the same reason `in-time` has one: without it,
 *   the label reads as an apology.
 */
export const PRACTICE_ACTIVITY_OPTIONS: ReadonlyArray<PracticeActivityOption> = [
  { activity: 'lead-sheet',        label: 'building the lead sheet' },
  { activity: 'tutorial',          label: 'watching a tutorial' },
  { activity: 'under-the-fingers', label: 'getting it under the fingers' },
  { activity: 'in-time',           label: 'practising in time', hint: 'to a click' },
  { activity: 'just-playing',      label: 'just playing', hint: 'not working on it' },
  { activity: 'other',             label: 'something else', freeText: true },
];

const BY_ACTIVITY = new Map<PracticeActivity, PracticeActivityOption>(
  PRACTICE_ACTIVITY_OPTIONS.map(o => [o.activity, o]),
);

/** The activity that opens the free-text line. Named rather than
 *  spelled `'other'` at each call site, so the two cannot drift. */
export const FREE_TEXT_ACTIVITY: PracticeActivity = 'other';

/**
 * Label for a stored slug, or the slug itself when it is not one we
 * know.
 *
 * The fallback is deliberate and is not a defensive shrug: this list
 * is designed to grow, so a row written by a NEWER build can reach an
 * older one through sync. Showing the raw slug is worse-looking and
 * more honest than dropping the activity or captioning it "unknown" —
 * the user can still read `in-time` and know what it meant.
 */
export function practiceActivityLabel(activity: string): string {
  return BY_ACTIVITY.get(activity as PracticeActivity)?.label ?? activity;
}

/**
 * Keep only slugs this build defines, in the canonical order.
 *
 * Order comes from `PRACTICE_ACTIVITY_OPTIONS` rather than from the
 * caller, so two sittings that ticked the same things store the same
 * array and a reader can compare them without sorting. Duplicates
 * collapse.
 *
 * UNKNOWN SLUGS ARE DROPPED HERE AND NOWHERE ELSE. This runs on the
 * WRITE path only — `practiceActivityLabel` is the read path and keeps
 * them, because dropping a newer build's activity on read would make
 * it vanish from a history it is genuinely part of.
 */
export function normaliseActivities(
  raw: ReadonlyArray<string> | null | undefined,
): PracticeActivity[] {
  if (!raw || raw.length === 0) return [];
  const wanted = new Set(raw);
  return PRACTICE_ACTIVITY_OPTIONS
    .filter(o => wanted.has(o.activity))
    .map(o => o.activity);
}
