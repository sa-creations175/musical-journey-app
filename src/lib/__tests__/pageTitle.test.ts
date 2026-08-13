/**
 * Pathname → header title and tagline.
 *
 * These exist because a missing entry is INVISIBLE IN CODE and only
 * shows up as the wrong words in the pinned header. Reading shipped
 * its route with no entry and fell back to "Musical Journey" — the
 * header component was fine, the map was short. Asserted against the
 * route table so the next module cannot repeat it.
 *
 * Asserts the resolver, not the rendered header: the map is the
 * mechanism, and a class-name assertion would break on restyling
 * while missing exactly this bug.
 */
import { describe, expect, it } from 'vitest';
import { taglineForPath, titleForPath } from '../pageTitle';
import { MODULE_ORDER } from '../moduleMeta';

describe('titleForPath', () => {
  it('names every live module route', () => {
    // MODULE_ORDER is the app's own list of what a module is, so a
    // module added there without a header entry fails here rather
    // than silently rendering the fallback.
    for (const meta of MODULE_ORDER) {
      if (meta.status !== 'live') continue;
      expect(titleForPath(meta.route), meta.route).not.toBe('Musical Journey');
    }
  });

  it('resolves Reading — the one that was missing', () => {
    expect(titleForPath('/reading')).toBe('Reading');
    expect(titleForPath('/reading/preview')).toBe('Reading · Notation Preview');
  });

  it('keeps the parent visible on a nested route', () => {
    expect(titleForPath('/reading/preview')).toContain('Reading');
    expect(titleForPath('/ear-training/intervals/calendar')).toBe('Intervals · Calendar');
  });

  it('falls back rather than blanking, so a gap is visible', () => {
    expect(titleForPath('/no-such-route')).toBe('Musical Journey');
  });
});

describe('taglineForPath', () => {
  it('gives every live module a one-line description', () => {
    for (const meta of MODULE_ORDER) {
      if (meta.status !== 'live') continue;
      expect(taglineForPath(meta.route), meta.route).toBeTruthy();
    }
  });

  it('Reading says what the module is FOR, not what it contains', () => {
    // Matching the register of the others — Shapes is "where the hands
    // catch up with what the rest of the app teaches", not a list of
    // its drills. Pinned loosely: the wording is the user's call, the
    // shape of it is the convention.
    const tagline = taglineForPath('/reading');
    expect(tagline).toBeTruthy();
    expect(tagline!).toBe('decoding the page fast enough to play from it');
    expect(tagline!).toBe(tagline!.toLowerCase());
    expect(tagline!).not.toMatch(/\.$/);
  });

  it('returns null rather than empty string for a page with no tagline', () => {
    expect(taglineForPath('/no-such-route')).toBeNull();
  });
});
