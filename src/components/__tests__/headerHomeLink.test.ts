/**
 * The HARMONY eyebrow is the way home, from everywhere.
 *
 * =====================================================================
 * SOURCE, NOT A RENDER, AND THE PRECEDENT IS `homeRoute.test.tsx`.
 *
 * Rendering `Layout` pulls the whole app shell — Dexie prefs, the sync
 * indicator, the sidebar, the creative-time modal — to look at six
 * lines of markup. That test reads its nav files as text for the same
 * reason. What matters here is what the header DECLARES.
 *
 * TWO THINGS ARE BEING GUARDED, AND ONLY ONE IS ABOUT NAVIGATION.
 *
 * The second is layout. This header is measured at runtime by the lead
 * sheet's cell-anchored overlays — it carries `data-app-chrome="top"`
 * and a comment saying the height is genuinely variable, so it is
 * measured rather than declared. A link that went `block`, or grew
 * padding to make a friendlier tap target, would change that measured
 * height and move overlays on a page that has nothing to do with this
 * one. The failure would appear somewhere else entirely, which is
 * exactly the kind that survives a manual check.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import layoutSource from '../Layout.tsx?raw';

/** The eyebrow's markup — from the wrapper that sizes it to its close. */
function eyebrowMarkup(): string {
  const start = layoutSource.indexOf('tracking-[0.18em]');
  expect(start, 'no eyebrow wrapper found in Layout.tsx').toBeGreaterThan(-1);
  const end = layoutSource.indexOf('{pageTitle}', start);
  expect(end, 'no page title after the eyebrow').toBeGreaterThan(start);
  return layoutSource.slice(start, end);
}

describe('the HARMONY eyebrow links home', () => {
  it('wraps the word in a link to the dashboard', () => {
    const markup = eyebrowMarkup();
    expect(markup).toMatch(/<Link\b[\s\S]*to="\/"[\s\S]*HARMONY[\s\S]*<\/Link>/);
  });

  it('imports Link from the router rather than using a bare anchor', () => {
    // A bare <a href="/"> is a full page reload: the service worker
    // re-boots, Dexie re-opens, and a running timer's tick is lost.
    expect(layoutSource).toMatch(/import \{[^}]*\bLink\b[^}]*\} from 'react-router-dom';/);
    expect(eyebrowMarkup()).not.toMatch(/<a\s/);
  });

  it('is on every page — no route condition around it', () => {
    // Including the dashboard itself and an active session. A
    // `{pathname !== '/' && ...}` here is the special case this must
    // not grow.
    const markup = eyebrowMarkup();
    expect(markup).not.toMatch(/pathname/);
    expect(markup).not.toMatch(/location/);
    expect(markup).not.toMatch(/&&/);
    expect(markup).not.toMatch(/\?\s/);
  });

  it('asks nothing and blocks nothing on the way out', () => {
    // Leaving an active session auto-pauses it, the pause resumes on
    // return, and the global banner stays on screen — so there is
    // nothing to lose and nothing to confirm.
    const markup = eyebrowMarkup();
    expect(markup).not.toMatch(/confirm|useBlocker|preventDefault|onClick/);
  });

  it('stays inline, so the measured header height does not move', () => {
    // The utilities that would change it. Checked on the link itself,
    // not the file, because the header legitimately uses flex and
    // padding elsewhere.
    const link = /<Link\b([\s\S]*?)>/.exec(eyebrowMarkup());
    expect(link, 'no <Link> in the eyebrow').not.toBeNull();
    const attrs = link![1];
    for (const utility of [
      'block', 'inline-block', 'flex', 'inline-flex', 'grid',
      'p-', 'px-', 'py-', 'pt-', 'pb-', 'm-', 'my-', 'mt-', 'mb-',
      'h-', 'min-h-', 'leading-',
    ]) {
      expect(attrs, `the eyebrow link must not carry "${utility}"`)
        .not.toMatch(new RegExp(`(^|["\\s])${utility.replace('-', '\\-')}`));
    }
  });

  it('keeps the header measurable — the hook the overlays read', () => {
    // If this attribute goes, the link's inline-ness stops mattering
    // and this test starts guarding nothing.
    expect(layoutSource).toContain('data-app-chrome="top"');
  });
});
