/**
 * The id that says which session something happened in.
 *
 * =====================================================================
 * ONE MINTING FUNCTION, BECAUSE THE RULE IS ABOUT IDENTITY.
 *
 * The test rule is three clean run-throughs in a row IN ONE TESTING
 * SESSION, and `banding.ts` decides that by comparing ids. Two minting
 * schemes would eventually produce a collision between them, and a
 * collision here does not look like a bug — it looks like a test the
 * user passed without playing three runs in a row.
 *
 * A session is not a duration and cannot be inferred from timestamps.
 * A whole song takes three or four minutes to play, and a session
 * survives a pause of any length, so there is no gap constant that
 * separates "still the same session" from "came back the next day".
 * `keyRunHistory` already tried, with sixty seconds.
 * =====================================================================
 */

/**
 * A fresh session id. Mint ONCE, when a session begins.
 *
 * Never per save, never per run, and never again on resume — a paused
 * session that came back with a new id would break the streak it was
 * pausing in the middle of, which is the one thing the id exists to
 * prevent.
 *
 * Time-prefixed so it sorts and reads usefully in a database dump.
 * The random suffix is not decoration: two sessions can begin in the
 * same millisecond in two tabs, and an id that collided would stitch
 * two sessions into one streak.
 */
export function newSessionId(now: number = Date.now()): string {
  return `ss-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
