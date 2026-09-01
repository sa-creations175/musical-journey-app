/**
 * The sidebar's bounds, and where they come from.
 *
 * =====================================================================
 * DRAGGING NARROW NOW REACHES THE ICON PRESENTATION, DELIBERATELY.
 *
 * It used to be forbidden: the floor sat clear of the rail so a drag
 * could not imitate a collapse. Narrow now shows icons instead — the
 * same presentation the button reaches, arrived at a different way, and
 * the two stay distinct because the button switches a STATE that
 * persists while this is only a consequence of the current width.
 * Dragging back out restores the labels, since nothing was switched.
 *
 * The ceiling is unchanged: what the sidebar is today. Dragging
 * reclaims space, it never takes more.
 * =====================================================================
 *
 * Both bounds are asserted RELATIVE to the widths that already existed,
 * never against a pixel figure written here — a literal would pass just
 * as happily on a wrong-but-matching value.
 */
import { describe, expect, it } from 'vitest';
import {
  SIDEBAR_DEFAULT_REM,
  SIDEBAR_MAX_REM,
  SIDEBAR_MIN_REM,
  SIDEBAR_RAIL_REM,
  clampSidebarWidth,
  labelsMinRem,
  longestWord,
  showsLabels,
  type NavLabel,
} from '../sidebarWidth';
import { NAV_LABELS } from '../../components/SidebarNav';

describe('the bounds derive from what exists', () => {
  it('never opens wider than the sidebar is today', () => {
    expect(SIDEBAR_MAX_REM).toBe(SIDEBAR_DEFAULT_REM);
  });

  it('floors at an icon column, and no narrower', () => {
    // The rail IS an icon and its padding, so there is nothing to show
    // below it.
    expect(SIDEBAR_MIN_REM).toBe(SIDEBAR_RAIL_REM);
  });

  it('leaves a real range to drag through', () => {
    expect(SIDEBAR_MAX_REM).toBeGreaterThan(SIDEBAR_MIN_REM);
  });

  it('starts at the width it has always started at', () => {
    expect(SIDEBAR_DEFAULT_REM).toBe(SIDEBAR_MAX_REM);
  });
});

describe('clamping', () => {
  it('holds a width inside the bounds', () => {
    const middle = (SIDEBAR_MIN_REM + SIDEBAR_MAX_REM) / 2;
    expect(clampSidebarWidth(middle)).toBe(middle);
  });

  it('refuses to go past either end', () => {
    expect(clampSidebarWidth(SIDEBAR_MAX_REM + 10)).toBe(SIDEBAR_MAX_REM);
    expect(clampSidebarWidth(SIDEBAR_MIN_REM - 10)).toBe(SIDEBAR_MIN_REM);
  });

  it('can never produce anything under an icon column', () => {
    for (const attempt of [0, -50, SIDEBAR_RAIL_REM - 1]) {
      expect(clampSidebarWidth(attempt), String(attempt))
        .toBeGreaterThanOrEqual(SIDEBAR_RAIL_REM);
    }
  });

  it('falls back to today’s width for anything unusable', () => {
    for (const bad of [null, undefined, 'wide', {}, Number.NaN, Infinity]) {
      expect(clampSidebarWidth(bad), String(bad)).toBe(SIDEBAR_DEFAULT_REM);
    }
  });
});

// =====================================================================
// Where the labels give out
// =====================================================================

/**
 * THE THRESHOLD USED TO BE TWICE THE RAIL, and that number came from
 * the icon column rather than from the words. SONG REPERTOIRE and
 * SHAPES & PATTERNS are far longer than it allowed, so between seven
 * rem and about eleven and a half the sidebar claimed it could show
 * labels and visibly could not — HARMON FLUENCY, SHAPES & PATTERN.
 *
 * What is asserted here is the RULE, never a figure: no width shows a
 * word that does not fit, and the threshold moves with the words.
 */

/** The width a single label needs before it can be drawn uncut. */
const needs = (label: NavLabel) => labelsMinRem([label]);

const THRESHOLD = labelsMinRem(NAV_LABELS);

describe('the nav is surveyed, not sampled', () => {
  it('carries every kind of row', () => {
    // A whole level dropping out of the survey is how the threshold
    // goes quietly wrong: sub-items are clipped by the same band.
    const kinds = new Set(NAV_LABELS.map(l => l.kind));
    expect([...kinds].sort())
      .toEqual(['group', 'module', 'nested', 'plain-module', 'sub']);
  });

  it('carries the labels a reader actually sees', () => {
    const texts = NAV_LABELS.map(l => l.text);
    for (const expected of [
      'song repertoire', 'shapes & patterns', 'harmonic fluency',
      'reference track library', 'mental visualisation', 'Chord Identification',
    ]) {
      expect(texts, expected).toContain(expected);
    }
  });
});

describe('no width shows a chopped word', () => {
  it('never claims to fit a label it cannot', () => {
    // The whole complaint, as a sweep: at every width the sidebar can
    // be dragged to, if it says it is showing labels then every label
    // fits. One failure here is one visible chopped word.
    for (let w = SIDEBAR_MIN_REM; w <= SIDEBAR_MAX_REM; w += 0.05) {
      if (!showsLabels(w, NAV_LABELS)) continue;
      for (const label of NAV_LABELS) {
        expect(needs(label) <= w + 1e-9, `${label.text} at ${w.toFixed(2)}rem`)
          .toBe(true);
      }
    }
  });

  it('would have failed on the old rail-derived threshold', () => {
    // Twice the rail. Kept as a fact rather than as a constant: it is
    // the number that produced the bug, and something has to remember
    // that it was not enough.
    const oldThreshold = SIDEBAR_RAIL_REM * 2;
    expect(THRESHOLD).toBeGreaterThan(oldThreshold);
    expect(NAV_LABELS.some(label => needs(label) > oldThreshold)).toBe(true);
  });

  it('shows labels at the width the sidebar opens at', () => {
    expect(showsLabels(SIDEBAR_DEFAULT_REM, NAV_LABELS)).toBe(true);
  });

  it('shows none at the floor, and none anywhere below the threshold', () => {
    expect(showsLabels(SIDEBAR_MIN_REM, NAV_LABELS)).toBe(false);
    expect(showsLabels(THRESHOLD - 0.01, NAV_LABELS)).toBe(false);
    expect(showsLabels(THRESHOLD, NAV_LABELS)).toBe(true);
  });

  it('leaves a band to drag through with labels showing', () => {
    // If the threshold ever reached the ceiling the sidebar could never
    // show a word, which is not a state to ship silently.
    expect(THRESHOLD).toBeGreaterThan(SIDEBAR_MIN_REM);
    expect(THRESHOLD).toBeLessThan(SIDEBAR_MAX_REM);
  });
});

describe('the threshold answers to the labels, not to a number', () => {
  it('rises when a longer module name arrives', () => {
    const longer: NavLabel[] = [
      ...NAV_LABELS,
      { text: 'counterpoint', kind: 'module' },
    ];
    expect(labelsMinRem(longer)).toBeGreaterThan(THRESHOLD);
  });

  it('falls when the longest labels leave', () => {
    // Plural: SONG REPERTOIRE and PRODUCTION tie for the widest word,
    // so dropping one of them changes nothing and dropping both does.
    const without = NAV_LABELS.filter(l => needs(l) < THRESHOLD);
    expect(without.length).toBeLessThan(NAV_LABELS.length);
    expect(labelsMinRem(without)).toBeLessThan(THRESHOLD);
  });

  it('rises for a sub-item too, not only for a module name', () => {
    // Production's children are clipped by the same band, so they are
    // in the survey. Asked of the sub-items alone, because a module
    // name currently needs more room than any of them and would hide
    // the answer.
    const subs = NAV_LABELS.filter(l => l.kind === 'sub');
    const longerSub: NavLabel = { text: 'instrumentation', kind: 'sub' };
    expect(labelsMinRem([...subs, longerSub]))
      .toBeGreaterThan(labelsMinRem(subs));
  });

  it('reads the same label differently on different rows', () => {
    // A module name is caps at 14px beside an icon; a sub-item is Title
    // Case at 12px, indented twice, with no icon.
    expect(needs({ text: 'repertoire', kind: 'module' }))
      .not.toBe(needs({ text: 'repertoire', kind: 'sub' }));
  });

  it('never exceeds the width the sidebar can actually reach', () => {
    const absurd: NavLabel[] = [
      { text: 'supercalifragilisticexpialidocious', kind: 'module' },
    ];
    expect(labelsMinRem(absurd)).toBe(SIDEBAR_MAX_REM);
  });
});

describe('what counts as one word', () => {
  it('is the longest run that cannot be broken', () => {
    // A label with a space in it wraps, and a wrapped label is not a
    // chopped one. What can be clipped is a single unbreakable run.
    expect(longestWord('song repertoire')).toBe('repertoire');
    expect(longestWord('shapes & patterns')).toBe('patterns');
  });

  it('breaks after a hyphen, because a browser does', () => {
    expect(longestWord('voice-leading drills')).toBe('leading');
    expect(longestWord('ear-theory crossover')).toBe('crossover');
  });
});
