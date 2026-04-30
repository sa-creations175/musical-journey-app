/**
 * Phase 2 step 7d — pure-helper tests for the collapsed
 * feasibility pill. Component rendering itself is verified by
 * manual smoke; these tests pin the status → display mapping
 * and the umbrella rollup → effective-status resolution.
 */
import { describe, it, expect } from 'vitest';
import {
  pillConfig,
  resolveUmbrellaStatus,
} from '../FeasibilityPill';

describe('pillConfig', () => {
  it('on_track maps to a green ✓ pill labeled "On track"', () => {
    const cfg = pillConfig('on_track')!;
    expect(cfg.icon).toBe('✓');
    expect(cfg.label).toBe('On track');
    expect(cfg.textClass).toContain('fluent');
    expect(cfg.borderClass).toContain('fluent');
  });

  it('at_risk maps to a developing-orange ⚠ pill', () => {
    const cfg = pillConfig('at_risk')!;
    expect(cfg.icon).toBe('⚠');
    expect(cfg.label).toBe('At risk');
    expect(cfg.textClass).toContain('developing');
    expect(cfg.borderClass).toContain('developing');
  });

  it('critical maps to a needswork-red ✗ pill', () => {
    const cfg = pillConfig('critical')!;
    expect(cfg.icon).toBe('✗');
    expect(cfg.label).toBe('Critical');
    expect(cfg.textClass).toContain('needswork');
    expect(cfg.borderClass).toContain('needswork');
  });

  it('unrecoverable maps to a neutral-gray ⊘ pill', () => {
    const cfg = pillConfig('unrecoverable')!;
    expect(cfg.icon).toBe('⊘');
    expect(cfg.label).toBe('Unrecoverable');
    expect(cfg.textClass).toContain('neutral');
    expect(cfg.borderClass).toContain('neutral');
  });

  it('null returns null (caller renders the inert dashed slot)', () => {
    expect(pillConfig(null)).toBeNull();
  });
});

describe('resolveUmbrellaStatus', () => {
  const empty = { on_track: 0, at_risk: 0, critical: 0, unrecoverable: 0 };

  it('forwards an actionable rollup status unchanged', () => {
    expect(
      resolveUmbrellaStatus({
        status: 'at_risk',
        breakdown: { ...empty, on_track: 2, at_risk: 1 },
      }),
    ).toBe('at_risk');
  });

  it('null status with unrecoverable count → unrecoverable', () => {
    // All measurable children unrecoverable: rollup.status is
    // null but the umbrella reads as unrecoverable per the
    // 6h.2 sign-off (one unified message at umbrella level).
    expect(
      resolveUmbrellaStatus({
        status: null,
        breakdown: { ...empty, unrecoverable: 3 },
      }),
    ).toBe('unrecoverable');
  });

  it('null status with no breakdown counts → null (inert)', () => {
    // No measurable children — caller renders the inert dashed
    // pill, no status to communicate.
    expect(
      resolveUmbrellaStatus({ status: null, breakdown: empty }),
    ).toBeNull();
  });

  it('actionable status wins over an unrecoverable count in the breakdown', () => {
    // Mixed umbrella with at_risk + unrecoverable — rollup
    // already excludes unrecoverable from worst-case, so the
    // resolved status is at_risk regardless.
    expect(
      resolveUmbrellaStatus({
        status: 'at_risk',
        breakdown: { ...empty, at_risk: 1, unrecoverable: 1 },
      }),
    ).toBe('at_risk');
  });

  it('on_track with no unrecoverables stays on_track', () => {
    expect(
      resolveUmbrellaStatus({
        status: 'on_track',
        breakdown: { ...empty, on_track: 4 },
      }),
    ).toBe('on_track');
  });
});
