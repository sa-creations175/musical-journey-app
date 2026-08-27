/**
 * The tree, and where its order comes from.
 */
import { describe, expect, it } from 'vitest';
import { MODULE_ORDER } from '../../moduleMeta';
import { EAR_TRAINING_SUB_MODULES } from '../../../modules/ear-training/homeCards';
import { READING_SKILL_ORDER } from '../../../modules/reading/homeCards';
import { chainForCard, chainForId, spacingTree, walkTree } from '../tree';

describe('order is read, never redeclared', () => {
  it('takes the module order from the navbar list', () => {
    // NOT the spec mockup's order. The instruction is that the navbar
    // owns it, so a reorder there moves this screen too.
    expect(spacingTree().map(n => n.id)).toEqual(MODULE_ORDER.map(m => m.id));
  });

  it('takes ear training submodules from its own home cards', () => {
    const et = spacingTree().find(n => n.id === 'ear-training');
    expect(et?.children.map(c => c.label))
      .toEqual(EAR_TRAINING_SUB_MODULES.map(s => s.label));
  });

  it('takes reading skills from its tab strip order', () => {
    const reading = spacingTree().find(n => n.id === 'reading');
    expect(reading?.children).toHaveLength(READING_SKILL_ORDER.length);
    expect(reading?.children[0].id).toBe(`reading.${READING_SKILL_ORDER[0]}`);
  });
});

describe('three levels, expanding to the skill', () => {
  it('puts the chord progression tabs at the skill level', () => {
    const chain = chainForId('ear-training.chord-progressions.key-detection');
    expect(chain?.map(n => n.level)).toEqual(['module', 'submodule', 'skill']);
  });

  it('gives every node a unique id', () => {
    const ids: string[] = [];
    walkTree(spacingTree(), n => ids.push(n.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('finding the chain for a card', () => {
  it('picks the most specific node that claims the itemRef', () => {
    const chain = chainForCard('reading', 'sig:1s:major:name');
    expect(chain.map(n => n.id)).toEqual(['reading', 'reading.sig']);
  });

  it('separates production vocabulary from production lessons', () => {
    expect(chainForCard('production', 'prod-vocab:comp').map(n => n.id))
      .toEqual(['production', 'production.vocabulary']);
    expect(chainForCard('production', 'path-1/lesson-2').map(n => n.id))
      .toEqual(['production', 'production.lessons']);
  });

  it('falls back to the module when no child claims the ref', () => {
    // Not a failure: a module with no split, or an item that predates
    // one, is scheduled by its module's settings.
    expect(chainForCard('harmonic-fluency', 'ks-4').map(n => n.id))
      .toEqual(['harmonic-fluency']);
  });

  it('keeps mental visualisation under shapes while it writes its own ref', () => {
    const chain = chainForCard('mental-viz', 'mv:cmaj7');
    expect(chain.map(n => n.id)).toEqual(['shapes-and-patterns', 'shapes-and-patterns.mental-viz']);
  });
});
