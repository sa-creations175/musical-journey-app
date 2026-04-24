/**
 * Module-level flag set while the sync engine is writing rows that
 * came FROM the cloud INTO Dexie. Write hooks check this and skip
 * enqueueing when true, so we don't echo cloud pulls back to cloud.
 *
 * Deliberately simple — no nesting, no async re-entrancy. The pull
 * path is a single sequential loop; set → run → unset.
 */
let active = false;

export function beginPull(): void {
  active = true;
}

export function endPull(): void {
  active = false;
}

export function isPulling(): boolean {
  return active;
}
