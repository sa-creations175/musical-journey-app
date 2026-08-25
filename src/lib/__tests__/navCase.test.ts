/**
 * How nav labels are cased.
 *
 * THE POINT IS THAT NOTHING IS RETYPED. The labels in `moduleMeta` and
 * the sidebar's item lists stay canonical and lowercase — they are what
 * the rest of the app matches on — and the style is applied where they
 * are drawn. These assertions run the rule over the REAL labels, so a
 * label added tomorrow is covered without this file changing.
 */
import { describe, expect, it } from 'vitest';
import { MODULE_NAME_CASE, titleCase } from '../navCase';
import { MODULE_ORDER, isLearningModule } from '../moduleMeta';

describe('title case', () => {
  it('capitalises each word', () => {
    expect(titleCase('scale degree math')).toBe('Scale Degree Math');
    expect(titleCase('named notes')).toBe('Named Notes');
    expect(titleCase('chord recognition')).toBe('Chord Recognition');
  });

  it('capitalises both halves of a hyphenated word', () => {
    expect(titleCase('voice-leading drills')).toBe('Voice-Leading Drills');
  });

  it('leaves the small words small, unless they lead', () => {
    expect(titleCase('want to learn')).toBe('Want to Learn');
    expect(titleCase('the business of music')).toBe('The Business of Music');
  });

  it('leaves an already-capitalised label alone', () => {
    expect(titleCase('Skills Catalogue')).toBe('Skills Catalogue');
  });

  it('does not touch the spacing it was given', () => {
    expect(titleCase('reference track library')).toBe('Reference Track Library');
    expect(titleCase('')).toBe('');
  });
});

describe('module names', () => {
  it('are uppercased by a class, so the label itself is untouched', () => {
    // A string transform here would put a second copy of every module
    // name in the app; the DOM keeps the canonical one.
    expect(MODULE_NAME_CASE).toContain('uppercase');
    for (const meta of MODULE_ORDER) {
      expect(meta.label).toBe(meta.label.toLowerCase());
    }
  });

  it('are the six learning modules, not everything with meta', () => {
    for (const meta of MODULE_ORDER) expect(isLearningModule(meta.id)).toBe(true);
    // These carry meta for their icons and accents but are top-level
    // items — Title Case, not caps.
    expect(isLearningModule('dashboard')).toBe(false);
    expect(isLearningModule('goals')).toBe(false);
    expect(isLearningModule('practice-sessions')).toBe(false);
    // A sub-module is nested under one, so it is not one either.
    expect(isLearningModule('intervals')).toBe(false);
  });
});
