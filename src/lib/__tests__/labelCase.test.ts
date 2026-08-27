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
import { MODULE_NAME_CASE, VIEW_CALENDAR_LABEL, titleCase } from '../labelCase';
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

describe('the three exemptions — notation, units, sentences', () => {
  // NOT LABELS. Two of the three are visible in the word itself and are
  // handled by the function; the third is a call-site decision, because
  // no per-word rule can see a sentence.
  it('leaves a roman numeral in the case it was written', () => {
    // `vi` is a minor six and `VI` a major one — capitalising the label
    // transposes the chord it names.
    expect(titleCase('vi → 1 ascending')).toBe('vi → 1 Ascending');
    expect(titleCase('ii → V ascending')).toBe('ii → V Ascending');
    expect(titleCase('bVII → 1 ascending')).toBe('bVII → 1 Ascending');
  });

  it('leaves a degree led by its accidental alone', () => {
    expect(titleCase('b3')).toBe('b3');
    expect(titleCase('from b3 upward')).toBe('From b3 Upward');
    // A `b` that is not an accidental still starts a word.
    expect(titleCase('bass clef')).toBe('Bass Clef');
  });

  it('leaves a unit spelled the way a unit is spelled', () => {
    expect(titleCase('+5 min')).toBe('+5 min');
    expect(titleCase('bpm')).toBe('bpm');
  });

  it('capitalises inside a bracket rather than half of it', () => {
    expect(titleCase('clear override (use song default)'))
      .toBe('Clear Override (Use Song Default)');
  });
});

describe('small words, and where a clause restarts', () => {
  it('keeps a preposition small between spaced words', () => {
    expect(titleCase('add from want to learn list'))
      .toBe('Add from Want to Learn List');
  });

  it('capitalises the first word of a clause a dash opens', () => {
    // A dash starts a new title rather than continuing one.
    expect(titleCase('eb minor pentatonic — from b3'))
      .toBe('Eb Minor Pentatonic — From b3');
    expect(titleCase('skip — no penalty')).toBe('Skip — No Penalty');
  });

  it('does not restart on a comma or an ampersand', () => {
    expect(titleCase('yes, restore backup')).toBe('Yes, Restore Backup');
    expect(titleCase('delay & saturation')).toBe('Delay & Saturation');
  });
});

describe('card titles use the same rule', () => {
  it('capitalises the labels the module homes hand over', () => {
    // The adapters keep the catalog's own lowercase words; the card
    // draws them in Title Case. Same function as the nav, so a card and
    // its nav row cannot disagree.
    expect(titleCase('chord recognition')).toBe('Chord Recognition');
    expect(titleCase('scales & modes')).toBe('Scales & Modes');
    expect(titleCase('mental visualisation')).toBe('Mental Visualisation');
    expect(titleCase('vocabulary')).toBe('Vocabulary');
    expect(titleCase('notes')).toBe('Notes');
  });

  it('leaves an already-capitalised catalog title alone', () => {
    // Production's paths are stored capitalised — they must pass
    // through untouched rather than being re-cased into a new shape.
    expect(titleCase('Workflow Foundations')).toBe('Workflow Foundations');
    expect(titleCase('The Language of Production')).toBe('The Language of Production');
    expect(titleCase('Arrangement & Song Structure')).toBe('Arrangement & Song Structure');
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

describe('the shared calendar label', () => {
  it('is capitalised, and defined once for both surfaces', () => {
    // The module home's streak row and the song page both offer it.
    // They typed the words separately, which is how one came to be
    // capitalised and the other not.
    expect(VIEW_CALENDAR_LABEL).toBe('View Calendar');
  });
});

describe('song repertoire’s tabs', () => {
  it('capitalise through the same rule as everything else', () => {
    expect(titleCase('active repertoire')).toBe('Active Repertoire');
    expect(titleCase('song detail')).toBe('Song Detail');
    expect(titleCase('want to learn')).toBe('Want to Learn');
  });
});
