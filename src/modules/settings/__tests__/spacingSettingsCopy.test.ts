/**
 * The screen's wording, pinned.
 *
 * ---------------------------------------------------------------
 * SOURCE, NOT A RENDER. What matters here is which words the file
 * commits to, and rendering the page to read them back would pull in
 * Dexie, the router and the whole settings tree to assert a string.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import source from '../SpacingSettings.tsx?raw';

describe('the fixed vocabulary', () => {
  it('says "comes back in" and never gap, interval or spacing', () => {
    expect(source).toContain('Comes back in');
    // The words that must not appear as a name for the wait. "Spacing"
    // is allowed in the page title and in import paths, so this checks
    // the phrases a label would actually use.
    for (const banned of ['the interval', 'Interval between', 'the gap', 'Gap ']) {
      expect(source, banned).not.toContain(banned);
    }
  });

  it('names the two stages Acquiring and Maintaining', () => {
    expect(source).toContain('Acquiring');
    expect(source).toContain('Maintaining');
  });

  it('reads the tally as "5 over 4 days", never as its day offsets', () => {
    // `acquiringSummary` is the only thing that renders it, and it is
    // built from the counts rather than from `tallyExposureDays`.
    expect(source).toContain('over ${tallyDistinctDays(tally)} days');
    expect(source).not.toContain('tallyExposureDays');
  });

  it('keeps due soon next to grace, as a window before rather than a wait', () => {
    expect(source).toContain('Due soon');
    expect(source).toContain('A window before it is due');
  });

  it('says the warnings never block', () => {
    expect(source).toContain('never block, and never prevent saving');
  });

  it('marks Acquiring inert for songs rather than hiding it', () => {
    expect(source).toContain('Songs do not go through Acquiring');
  });

  it('keeps recalculation separate from normal editing', () => {
    expect(source).toContain('recalculate everything now');
    expect(source).toContain('apply from the next time you answer');
  });
});
