/**
 * Reference-counted pull lock. Write hooks check `isPulling()` and
 * skip enqueueing while any pull is in progress, so cloud rows being
 * written INTO Dexie don't echo back OUT to the cloud.
 *
 * We use a counter (not a boolean) because multiple pulls can run
 * concurrently — e.g. the initial sign-in pull overlapping with a
 * tab-focus refresh. A boolean flag would flip to `false` when the
 * inner pull called `endPull`, even though the outer pull is still
 * writing rows, and the outer's bulkPut hooks would start echoing.
 * The counter goes to zero only when ALL pulls have finished.
 *
 * beginPull/endPull always come in pairs; endPull is clamped at zero
 * so a bug in caller bookkeeping can't drive it negative.
 */
let activeCount = 0;

export function beginPull(): void {
  activeCount += 1;
}

export function endPull(): void {
  activeCount = Math.max(0, activeCount - 1);
}

export function isPulling(): boolean {
  return activeCount > 0;
}
