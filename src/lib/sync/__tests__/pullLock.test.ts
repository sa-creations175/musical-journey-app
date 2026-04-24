/**
 * Verifies the pull lock supports concurrent pulls without the inner
 * `endPull` prematurely unlocking the outer. This is the race that
 * happens when a tab-focus refresh fires while the initial sign-in
 * pull is still running.
 *
 * Pre-fix (boolean flag): outer beginPull sets active=true; inner
 * beginPull leaves active=true; inner endPull flips to false; outer
 * rows written after that would trigger hook echoes. BUG.
 *
 * Post-fix (reference counter): outer sets count=1; inner sets
 * count=2; inner endPull → count=1 (still pulling); outer endPull →
 * count=0. Echo suppression stays on for the full outer pull.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { beginPull, endPull, isPulling } from '../pullLock';

// The pull-lock state is module-level; reset between tests so one
// leaking an unbalanced beginPull doesn't contaminate the next.
beforeEach(() => {
  while (isPulling()) endPull();
});

describe('pullLock (reference-counted)', () => {
  it('isPulling() starts false', () => {
    expect(isPulling()).toBe(false);
  });

  it('single pair returns to unlocked', () => {
    beginPull();
    expect(isPulling()).toBe(true);
    endPull();
    expect(isPulling()).toBe(false);
  });

  it('nested pulls stay locked until all pairs close', () => {
    beginPull();              // outer
    beginPull();              // inner
    expect(isPulling()).toBe(true);
    endPull();                // inner close — MUST NOT unlock
    expect(isPulling()).toBe(true);
    endPull();                // outer close
    expect(isPulling()).toBe(false);
  });

  it('endPull over-called clamps at zero', () => {
    endPull();
    endPull();
    endPull();
    expect(isPulling()).toBe(false);
  });

  it('deep nesting works', () => {
    for (let i = 0; i < 5; i++) beginPull();
    expect(isPulling()).toBe(true);
    for (let i = 0; i < 4; i++) {
      endPull();
      expect(isPulling()).toBe(true);
    }
    endPull();
    expect(isPulling()).toBe(false);
  });
});
