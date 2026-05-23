// @vitest-environment jsdom
/**
 * Phase 4 Step 5 — contextWeighting.ts unit tests.
 *
 * Pure helpers — locks the per-(context, module) hard filter +
 * weight tables so refactors can't quietly drift the constants.
 */
import { describe, expect, it } from 'vitest';
import {
  contextFactorForModule,
  isModuleAllowedForContext,
} from '../contextWeighting';

describe('isModuleAllowedForContext — keys allowlist', () => {
  it('keys passes only Shapes + Repertoire', () => {
    const ctx = 'keys' as const;
    expect(isModuleAllowedForContext('shapes-and-patterns', ctx)).toBe(true);
    expect(isModuleAllowedForContext('repertoire', ctx)).toBe(true);
    expect(isModuleAllowedForContext('harmonic-fluency', ctx)).toBe(false);
    expect(isModuleAllowedForContext('intervals', ctx)).toBe(false);
    expect(isModuleAllowedForContext('chord-recognition', ctx)).toBe(false);
    expect(isModuleAllowedForContext('chord-progressions', ctx)).toBe(false);
    expect(isModuleAllowedForContext('scales-modes', ctx)).toBe(false);
    expect(isModuleAllowedForContext('production', ctx)).toBe(false);
  });

  it('laptop + phone drop Shapes; everything else passes', () => {
    for (const ctx of ['laptop', 'phone'] as const) {
      expect(isModuleAllowedForContext('shapes-and-patterns', ctx)).toBe(false);
      expect(isModuleAllowedForContext('harmonic-fluency', ctx)).toBe(true);
      expect(isModuleAllowedForContext('chord-progressions', ctx)).toBe(true);
      expect(isModuleAllowedForContext('repertoire', ctx)).toBe(true);
      expect(isModuleAllowedForContext('production', ctx)).toBe(true);
    }
  });
});

describe('contextFactorForModule — per-context weight tables', () => {
  it('keys: Shapes + Repertoire neutral; defaults stay neutral', () => {
    const ctx = 'keys' as const;
    expect(contextFactorForModule('shapes-and-patterns', ctx)).toBe(1.0);
    expect(contextFactorForModule('repertoire', ctx)).toBe(1.0);
    // Excluded-by-filter modules still get a neutral default
    // factor at this layer — the hard filter does the gating.
    expect(contextFactorForModule('harmonic-fluency', ctx)).toBe(1.0);
  });

  it('laptop: HF 1.2, chord-progressions 1.6, other ET 1.0, Production 1.5', () => {
    expect(contextFactorForModule('harmonic-fluency', 'laptop')).toBe(1.2);
    expect(contextFactorForModule('chord-progressions', 'laptop')).toBe(1.6);
    expect(contextFactorForModule('intervals', 'laptop')).toBe(1.0);
    expect(contextFactorForModule('chord-recognition', 'laptop')).toBe(1.0);
    expect(contextFactorForModule('scales-modes', 'laptop')).toBe(1.0);
    expect(contextFactorForModule('production', 'laptop')).toBe(1.5);
    expect(contextFactorForModule('repertoire', 'laptop')).toBe(1.0);
  });

  it('phone: all HF/ET subs at 1.4, Production 1.0, Repertoire 1.0', () => {
    expect(contextFactorForModule('harmonic-fluency', 'phone')).toBe(1.4);
    expect(contextFactorForModule('intervals', 'phone')).toBe(1.4);
    expect(contextFactorForModule('chord-recognition', 'phone')).toBe(1.4);
    expect(contextFactorForModule('chord-progressions', 'phone')).toBe(1.4);
    expect(contextFactorForModule('scales-modes', 'phone')).toBe(1.4);
    expect(contextFactorForModule('production', 'phone')).toBe(1.0);
    expect(contextFactorForModule('repertoire', 'phone')).toBe(1.0);
  });

  it('unrecognised moduleRef → neutral 1.0 (defensive default)', () => {
    expect(contextFactorForModule('unknown-future-module', 'phone')).toBe(1.0);
    expect(contextFactorForModule('unknown-future-module', 'laptop')).toBe(1.0);
  });

  it('chord-progression-quiz is active (neutral weight) on phone + laptop', () => {
    // Feature shipped — weight flipped 0 → neutral (CHORD_PROGRESSION_QUIZ
    // _PHONE_LAPTOP_FACTOR in sessionDesign.ts).
    expect(contextFactorForModule('chord-progression-quiz', 'laptop')).toBe(1.0);
    expect(contextFactorForModule('chord-progression-quiz', 'phone')).toBe(1.0);
  });

  it("'full' context: keyboard modules neutral, cognitive modules carry laptop weights", () => {
    // Mixes keys-context weights (neutral) for keyboard modules
    // with laptop-context weights for cognitive modules.
    expect(contextFactorForModule('shapes-and-patterns', 'full')).toBe(1.0);
    expect(contextFactorForModule('repertoire', 'full')).toBe(1.0);
    expect(contextFactorForModule('harmonic-fluency', 'full')).toBe(1.2);
    expect(contextFactorForModule('chord-progressions', 'full')).toBe(1.6);
    expect(contextFactorForModule('intervals', 'full')).toBe(1.0);
    expect(contextFactorForModule('chord-recognition', 'full')).toBe(1.0);
    expect(contextFactorForModule('scales-modes', 'full')).toBe(1.0);
    expect(contextFactorForModule('production', 'full')).toBe(1.5);
  });
});

describe('isModuleAllowedForContext — full context', () => {
  it("'full' passes EVERY module (no hard filter; user has keyboard + device)", () => {
    const ctx = 'full' as const;
    expect(isModuleAllowedForContext('shapes-and-patterns', ctx)).toBe(true);
    expect(isModuleAllowedForContext('repertoire', ctx)).toBe(true);
    expect(isModuleAllowedForContext('harmonic-fluency', ctx)).toBe(true);
    expect(isModuleAllowedForContext('intervals', ctx)).toBe(true);
    expect(isModuleAllowedForContext('chord-recognition', ctx)).toBe(true);
    expect(isModuleAllowedForContext('chord-progressions', ctx)).toBe(true);
    expect(isModuleAllowedForContext('scales-modes', ctx)).toBe(true);
    expect(isModuleAllowedForContext('production', ctx)).toBe(true);
  });
});
