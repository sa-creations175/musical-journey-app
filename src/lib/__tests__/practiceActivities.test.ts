/**
 * The activity vocabulary.
 *
 * Pure — no db, no render. What is asserted here is the SHAPE of the
 * list and the two rules that outlive any wording: the write path
 * drops what it does not know, and the read path does not.
 */
import { describe, expect, it } from 'vitest';
import {
  FREE_TEXT_ACTIVITY,
  PRACTICE_ACTIVITY_OPTIONS,
  normaliseActivities,
  practiceActivityLabel,
  type PracticeActivity,
} from '../practiceActivities';

describe('the six', () => {
  it('offers exactly the settled vocabulary, in order', () => {
    // Pinned so a seventh cannot arrive without this test being read,
    // and with it the rule above the list: the list records what I
    // did, not why I did it or how ready I felt.
    expect(PRACTICE_ACTIVITY_OPTIONS.map(o => o.label)).toEqual([
      'building the lead sheet',
      'watching a tutorial',
      'getting it under the fingers',
      'practising in time',
      'just playing',
      'something else',
    ]);
  });

  it('hints only where the label alone could be misread', () => {
    // Two of the six, and the absence of a hint on the other four is
    // the signal that they mean exactly what they say. "to a click"
    // stops "practising in time" reading as a claim about tempo, which
    // would belong to a test; "not working on it" stops "just playing"
    // reading as an apology.
    const hinted = PRACTICE_ACTIVITY_OPTIONS
      .filter(o => o.hint !== undefined)
      .map(o => [o.activity, o.hint]);
    expect(hinted).toEqual([
      ['in-time', 'to a click'],
      ['just-playing', 'not working on it'],
    ]);
  });

  it('opens a free-text line on exactly one entry', () => {
    const free = PRACTICE_ACTIVITY_OPTIONS.filter(o => o.freeText);
    expect(free.map(o => o.activity)).toEqual([FREE_TEXT_ACTIVITY]);
  });
});

describe('normalising on the way in', () => {
  it('stores the canonical order, not the tapping order', () => {
    // So two sittings that ticked the same things produce identical
    // arrays and a reader can compare them without sorting.
    const tapped: PracticeActivity[] = ['just-playing', 'lead-sheet', 'in-time'];
    expect(normaliseActivities(tapped)).toEqual([
      'lead-sheet', 'in-time', 'just-playing',
    ]);
  });

  it('collapses duplicates', () => {
    expect(normaliseActivities(['tutorial', 'tutorial'])).toEqual(['tutorial']);
  });

  it('drops a slug this build does not define', () => {
    expect(normaliseActivities(['lead-sheet', 'transcribing'])).toEqual(['lead-sheet']);
  });

  it('treats nothing, null and [] the same', () => {
    expect(normaliseActivities([])).toEqual([]);
    expect(normaliseActivities(null)).toEqual([]);
    expect(normaliseActivities(undefined)).toEqual([]);
  });
});

describe('reading back', () => {
  it('labels a known slug', () => {
    expect(practiceActivityLabel('in-time')).toBe('practising in time');
  });

  it('KEEPS an unknown slug rather than dropping it', () => {
    // The mirror of the write path, and deliberately not symmetrical
    // with it. This list is designed to grow, so a row written by a
    // newer build reaches an older one through sync. Showing the raw
    // slug looks worse and is more honest than dropping the activity
    // or captioning it "unknown" — `transcribing` still reads.
    expect(practiceActivityLabel('transcribing')).toBe('transcribing');
  });
});
