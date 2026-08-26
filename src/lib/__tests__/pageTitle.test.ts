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
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../modules/harmonic-fluency/catalog';
import { READING_SKILL_LABELS, READING_SKILL_ORDER } from '../../modules/reading/homeCards';
import { readingSkillPath } from '../../modules/reading/skillRoutes';
import { SHAPES_SECTIONS } from '../../modules/shapes-and-patterns/homeCards';

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

  it('names the category a drill page is on', () => {
    // The one shape the exact-match map cannot hold: one route, fifteen
    // and four destinations. Read off the modules' own labels, so a
    // renamed category cannot leave a second name here.
    for (const category of CATEGORY_ORDER) {
      expect(titleForPath(`/harmonic-fluency/${category}`), category)
        .toBe(CATEGORY_LABELS[category]);
    }
    for (const section of SHAPES_SECTIONS) {
      const title = titleForPath(`/shapes-and-patterns/${section.id}`);
      expect(title, section.id).not.toBe('Musical Journey');
      expect(title.toLowerCase(), section.id).toBe(section.label);
    }
    for (const skill of READING_SKILL_ORDER) {
      const title = titleForPath(readingSkillPath(skill));
      expect(title, skill).not.toBe('Musical Journey');
      expect(title.toLowerCase(), skill).toBe(READING_SKILL_LABELS[skill]);
    }
  });

  it('still falls back on a slug that names nothing', () => {
    // A bad link is a bad link; the pages redirect it, and the header
    // must not invent a name for it on the way.
    expect(titleForPath('/harmonic-fluency/plagal-cadences')).toBe('Musical Journey');
    expect(titleForPath('/reading/tablature')).toBe('Musical Journey');
    expect(titleForPath('/shapes-and-patterns/arpeggios')).toBe('Musical Journey');
  });

  it('does not swallow the static siblings of a drill route', () => {
    // `/reading/calendar` and `/harmonic-fluency/calendar` share the
    // prefix the dynamic resolver claims, and the exact map wins.
    expect(titleForPath('/reading/calendar')).toBe('Reading · Calendar');
    expect(titleForPath('/harmonic-fluency/calendar'))
      .toBe('Harmonic Fluency · Calendar');
    expect(titleForPath('/shapes-and-patterns/calendar'))
      .toBe('Shapes & Patterns · Calendar');
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
