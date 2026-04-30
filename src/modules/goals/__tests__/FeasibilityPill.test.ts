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
  it('on_track → "On track" with green palette', () => {
    expect(pillConfig('on_track')).toEqual({
      label: 'On track',
      bg: '#EAF3DE',
      text: '#3B6D11',
    });
  });

  it('at_risk → "Pick up pace" with yellow/amber palette', () => {
    expect(pillConfig('at_risk')).toEqual({
      label: 'Pick up pace',
      bg: '#FAEEDA',
      text: '#854F0B',
    });
  });

  it('critical → "Act now" with orange palette', () => {
    expect(pillConfig('critical')).toEqual({
      label: 'Act now',
      bg: '#FAECE7',
      text: '#993C1D',
    });
  });

  it('unrecoverable → "Unrecoverable" with neutral gray palette', () => {
    expect(pillConfig('unrecoverable')).toEqual({
      label: 'Unrecoverable',
      bg: '#F1EFE8',
      text: '#5F5E5A',
    });
  });

  it('no red anywhere in the palette (no #E2 / #DC / #B9 hex roots)', () => {
    // Sweep all four configs — guards against a regression that
    // reintroduces red. The new design uses orange for urgency
    // and gray for past — red reads as too final.
    const statuses = ['on_track', 'at_risk', 'critical', 'unrecoverable'] as const;
    for (const s of statuses) {
      const cfg = pillConfig(s)!;
      expect(cfg.bg.toLowerCase()).not.toMatch(/^#(e[0-3]|dc|b9)/);
      expect(cfg.text.toLowerCase()).not.toMatch(/^#(e[0-3]|dc|b9)/);
    }
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
