// @vitest-environment jsdom
/**
 * Phase B Commit 2 — buildBlockTimeNeeds.
 *
 * Translates the per-module session-need map (output of
 * computeSessionNeedByModule) into the per-block time-need map the
 * allocators consume. The interesting logic is the even split of a
 * module need across multiple blocks (ET fans out into several
 * sub-module blocks) and the over-practice / no-goal exclusions.
 */
import { describe, it, expect } from 'vitest';
import { buildBlockTimeNeeds } from '../sessionGenerator';
import type { AlgorithmBlock } from '../../../lib/sessionAlgorithm/timeAllocation';
import type { ModuleSessionNeed } from '../../../lib/sessionAlgorithm/sessionNeed';
import type { GoalFlowModuleId } from '../../goals/goalVocabulary';

function block(id: string, moduleRef: string): AlgorithmBlock {
  return {
    id,
    moduleRef,
    memoryType: 'declarative',
    itemRefs: ['x'],
    weight: 1,
    hasAcquiringItems: false,
    isKeyboardRequired: false,
  };
}

function need(
  timeNeededSeconds: number,
  isOverPractice = false,
): ModuleSessionNeed {
  return {
    attemptsToday: Math.round(timeNeededSeconds / 30),
    timeNeededSeconds,
    isOverPractice,
  };
}

describe('buildBlockTimeNeeds', () => {
  it('maps a single-block module straight through', () => {
    const blocks = [block('hf-1', 'harmonic-fluency')];
    const byModule = new Map<GoalFlowModuleId, ModuleSessionNeed>([
      ['harmonic-fluency', need(600)],
    ]);
    const out = buildBlockTimeNeeds(blocks, byModule);
    expect(out.get('hf-1')).toBe(600);
    expect(out.size).toBe(1);
  });

  it('splits a module need evenly across its blocks (ET sub-modules)', () => {
    // Ear Training fans out into per-sub-module blocks. The 900 s ET
    // need splits 300 / 300 / 300 across them.
    const blocks = [
      block('et-int', 'intervals'),
      block('et-cr', 'chord-recognition'),
      block('et-cp', 'chord-progressions'),
    ];
    const byModule = new Map<GoalFlowModuleId, ModuleSessionNeed>([
      ['ear-training', need(900)],
    ]);
    const out = buildBlockTimeNeeds(blocks, byModule);
    expect(out.get('et-int')).toBe(300);
    expect(out.get('et-cr')).toBe(300);
    expect(out.get('et-cp')).toBe(300);
  });

  it('excludes over-practice modules entirely', () => {
    const blocks = [block('hf-1', 'harmonic-fluency')];
    const byModule = new Map<GoalFlowModuleId, ModuleSessionNeed>([
      ['harmonic-fluency', need(0, /* isOverPractice */ true)],
    ]);
    const out = buildBlockTimeNeeds(blocks, byModule);
    expect(out.size).toBe(0);
  });

  it('excludes modules with a zero / non-positive time need', () => {
    const blocks = [block('hf-1', 'harmonic-fluency')];
    const byModule = new Map<GoalFlowModuleId, ModuleSessionNeed>([
      ['harmonic-fluency', need(0)],
    ]);
    expect(buildBlockTimeNeeds(blocks, byModule).size).toBe(0);
  });

  it('leaves blocks with no module session-need untouched', () => {
    // S&P + Repertoire blocks present, but only HF has Phase B data.
    const blocks = [
      block('hf-1', 'harmonic-fluency'),
      block('sp-1', 'shapes-and-patterns'),
      block('rep-1', 'repertoire'),
    ];
    const byModule = new Map<GoalFlowModuleId, ModuleSessionNeed>([
      ['harmonic-fluency', need(450)],
    ]);
    const out = buildBlockTimeNeeds(blocks, byModule);
    expect(out.get('hf-1')).toBe(450);
    expect(out.has('sp-1')).toBe(false);
    expect(out.has('rep-1')).toBe(false);
  });

  it('ignores blocks whose moduleRef does not resolve to a GoalFlowModuleId', () => {
    // mental-viz has no GoalFlowModuleId mapping.
    const blocks = [block('mv-1', 'mental-viz')];
    const byModule = new Map<GoalFlowModuleId, ModuleSessionNeed>([
      ['harmonic-fluency', need(600)],
    ]);
    expect(buildBlockTimeNeeds(blocks, byModule).size).toBe(0);
  });

  it('empty inputs → empty map', () => {
    expect(buildBlockTimeNeeds([], new Map()).size).toBe(0);
  });
});
