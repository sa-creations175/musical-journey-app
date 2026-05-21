import { describe, it, expect } from 'vitest';
import { canExtendBlock } from '../blockExtendEligibility';

describe('canExtendBlock', () => {
  it('allows flashcard, S&P, and repertoire drills', () => {
    expect(canExtendBlock({ moduleRef: 'harmonic-fluency' })).toBe(true);
    expect(canExtendBlock({ moduleRef: 'ear-training' })).toBe(true);
    expect(canExtendBlock({ moduleRef: 'shapes-and-patterns' })).toBe(true);
    expect(canExtendBlock({ moduleRef: 'repertoire' })).toBe(true);
  });

  it('blocks warm-ups', () => {
    expect(
      canExtendBlock({ moduleRef: 'shapes-and-patterns', isWarmup: true }),
    ).toBe(false);
  });

  it('allows scale-drill blocks even when flagged as warm-ups', () => {
    expect(
      canExtendBlock({
        moduleRef: 'shapes-and-patterns',
        isWarmup: true,
        itemRefs: ['scale:major:C', 'scale:natural-minor:C'],
      }),
    ).toBe(true);
  });

  it('blocks mental visualization (shares the shapes moduleRef)', () => {
    expect(
      canExtendBlock({
        moduleRef: 'shapes-and-patterns',
        quickLaunchRoute: '/shapes-and-patterns?tab=mental-viz',
      }),
    ).toBe(false);
  });

  it('blocks modules not in the eligible set (e.g. production)', () => {
    expect(canExtendBlock({ moduleRef: 'production' })).toBe(false);
    expect(canExtendBlock({ moduleRef: 'dashboard' })).toBe(false);
  });
});
