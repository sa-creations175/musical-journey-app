import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  isChordShapeRunnerBlock,
  resolveChordShapeRunnerItems,
} from '../inSessionChordShapeRunner';

describe('isChordShapeRunnerBlock', () => {
  it('true when the first item is a chord-shape itemRef', () => {
    expect(
      isChordShapeRunnerBlock([{ itemRef: 'chord-shape:maj7:C:inv1', seconds: 90 }]),
    ).toBe(true);
  });

  it('false for scale / voice-leading / empty / null', () => {
    expect(isChordShapeRunnerBlock([{ itemRef: 'scale:major:C', seconds: 60 }])).toBe(false);
    expect(isChordShapeRunnerBlock([{ itemRef: 'vl:aba-251:Bb', seconds: 60 }])).toBe(false);
    expect(isChordShapeRunnerBlock([])).toBe(false);
    expect(isChordShapeRunnerBlock(null)).toBe(false);
  });
});

describe('resolveChordShapeRunnerItems', () => {
  it('resolves chord-shape items to skill + drillType, dropping non-chord-shapes', async () => {
    const items = [
      { itemRef: 'chord-shape:maj7:C:root', seconds: 90 },
      { itemRef: 'scale:major:C', seconds: 60 }, // dropped — not a chord shape
      { itemRef: 'chord-shape:min7:F:root', seconds: 120 },
    ];
    const resolved = await resolveChordShapeRunnerItems(items);
    expect(resolved.map(r => r.itemRef)).toEqual([
      'chord-shape:maj7:C:root',
      'chord-shape:min7:F:root',
    ]);
    expect(resolved[0].seconds).toBe(90);
    expect(resolved[0].skill.kind).toBe('chord-shape');
    // A drillType is materialised for the skill and points back at it.
    expect(resolved[0].drillType).toBeTruthy();
    expect(resolved[0].drillType.skillId).toBe(resolved[0].skill.id);
  });
});
