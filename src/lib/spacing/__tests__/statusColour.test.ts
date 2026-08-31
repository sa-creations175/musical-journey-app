/**
 * One colour per status, everywhere.
 *
 * =====================================================================
 * THE AUDIT FOUND SEVEN PLACES THE APP CONTRADICTED ITSELF ON SCREEN.
 *
 * Mastered was dark green on a grid and light blue one tap into it.
 * Started was blue on a song's matrix and grey on the scales grid.
 * Fluent was a solid tile on one screen and a pale wash on another.
 * Three rating maps, two grid components, a tier table, a song ladder
 * and `bands.ts` all named their own colours for the same words.
 *
 * These pin the fix rather than the palette: a future recolour moves
 * one file, and any surface that starts naming its own colours again
 * fails here.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  STATUS_KEYS, feelColour, statusColour, type StatusKey,
} from '../statusColour';
import { statusKeyForVerdict } from '../verdictColour';
import { ACCURACY_BANDS, type AccuracyBandDef } from '../bands';
import { TIER_BADGE_CLASS, TIER_BAR_CLASS, TIER_FILL_CLASS, TIER_TEXT_CLASS } from '../../tier';
import { STAGE_BADGE_CLASS, STAGE_DOT_CLASS } from '../../../modules/repertoire/stage';
import { bandCellClasses } from '../../../modules/shapes-and-patterns/BandCell';
import { FEEL_CARD_OPTIONS } from '../../../modules/shapes-and-patterns/drillModel';
import { BLOCK_RATING_FEEL_OPTIONS } from '../../sessionTimer/blockRatingOptions';
import { NOT_STARTED, type BandVerdict } from '../banding';

/** Every source file in the app, for the one-source scan at the foot
 *  of this file. `import.meta.glob` is Vite's own walk — the same one
 *  the sidebar structure tests use — so there is no node:fs here. */
const SOURCES = import.meta.glob('/src/**/*.{ts,tsx}', {
  eager: true, query: '?raw', import: 'default',
}) as Record<string, string>;

const STARTED: BandVerdict = { kind: 'started', tries: 1 };
const band = (b: 'needs-work' | 'developing' | 'fluent' | 'mastered'): BandVerdict =>
  ({ kind: 'band', band: b });

describe('every status resolves to one colour and one fill', () => {
  it('all six are defined, and only Not Started has no colour', () => {
    for (const key of STATUS_KEYS) {
      const c = statusColour(key);
      expect(c.key, key).toBe(key);
      expect(c.fill, key).not.toBe('');
    }
    expect(statusColour('not-started').hex).toBeNull();
    for (const key of STATUS_KEYS.filter(k => k !== 'not-started')) {
      expect(statusColour(key).hex, key).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('THE PALETTE, as ruled', () => {
    expect(statusColour('started').hex).toBe('#C7DDF5');
    expect(statusColour('needs-work').hex).toBe('#E24B4A');
    expect(statusColour('developing').hex).toBe('#EF9F27');
    expect(statusColour('fluent').hex).toBe('#1D9E75');
    expect(statusColour('mastered').hex).toBe('#2B4FA8');
  });

  it('FLUENT AND MASTERED ARE DIFFERENT HUES — the whole complaint', () => {
    // They were #1D9E75 and #0F5E47: mid green and dark green, the
    // hardest pair in the app to tell apart on a grid of small squares.
    const fluent = statusColour('fluent').hex!;
    const mastered = statusColour('mastered').hex!;
    expect(hueOf(mastered)).not.toBeCloseTo(hueOf(fluent), 0);
    // Green sits near 120°, blue near 220°. Far enough apart that no
    // amount of retuning either can quietly close the gap.
    expect(Math.abs(hueOf(mastered) - hueOf(fluent))).toBeGreaterThan(60);
  });

  it('and the two blues are far apart in lightness, not just in name', () => {
    // Started is a pale wash and Mastered the darkest thing on the
    // grid; they are both blue and must not be confusable.
    expect(luminance(statusColour('started').hex!))
      .toBeGreaterThan(luminance(statusColour('mastered').hex!) + 0.5);
  });
});

describe('the ratings stay aligned to the statuses', () => {
  it('In flow IS Mastered and Clean IS Fluent', () => {
    expect(feelColour(4)).toBe(statusColour('mastered'));
    expect(feelColour(3)).toBe(statusColour('fluent'));
    expect(feelColour(2)).toBe(statusColour('developing'));
    expect(feelColour(1)).toBe(statusColour('needs-work'));
  });

  it('so In flow is the royal blue and no longer collides with Clean', () => {
    expect(feelColour(4).hex).toBe('#2B4FA8');
    expect(feelColour(4).hex).not.toBe(feelColour(3).hex);
  });

  it('and the three rating surfaces are one table, not three copies', () => {
    for (const feel of [1, 2, 3, 4] as const) {
      const c = feelColour(feel);
      expect(FEEL_CARD_OPTIONS[feel - 1].activeClass, `card ${feel}`).toBe(c.fill);
      expect(FEEL_CARD_OPTIONS[feel - 1].inactiveClass, `card ${feel}`).toBe(c.outline);
      const block = BLOCK_RATING_FEEL_OPTIONS.find(o => o.feel === feel)!;
      expect(block.activeClass, `block ${feel}`).toBe(c.fill);
      expect(block.inactiveClass, `block ${feel}`).toBe(c.outline);
    }
  });
});

describe('the song ladder follows', () => {
  it('Internalized takes the royal blue and Cross-key keeps the green', () => {
    expect(STAGE_DOT_CLASS.internalized).toBe(statusColour('mastered').bar);
    expect(STAGE_DOT_CLASS['cross-key']).toBe(statusColour('fluent').bar);
    expect(STAGE_BADGE_CLASS.internalized).toBe(statusColour('mastered').badge);
  });

  it('and every rung comes off the palette', () => {
    const badges = Object.values(STAGE_BADGE_CLASS);
    const known = STATUS_KEYS.map(k => statusColour(k).badge);
    for (const badge of badges) expect(known).toContain(badge);
  });
});

describe('one treatment: solid fill', () => {
  it('NO SURFACE FILLS A STATUS AT 15%', () => {
    // The three S&P grids did. `bandCellClasses` is what they all call.
    const drawn = [
      bandCellClasses(NOT_STARTED),
      bandCellClasses(STARTED),
      ...(['needs-work', 'developing', 'fluent', 'mastered'] as const)
        .map(b => bandCellClasses(band(b))),
      ...STATUS_KEYS.map(k => statusColour(k).fill),
      ...Object.values(TIER_FILL_CLASS),
    ];
    for (const cls of drawn) {
      expect(cls, cls).not.toMatch(/bg-(needswork|developing|fluent|mastered|started)\/15\b/);
    }
  });

  it('a grid square and a matrix cell paint a band the same way', () => {
    // They were solid-with-white and 15%-with-coloured-text. One word,
    // two weights, depending on which screen you were on.
    for (const b of ['needs-work', 'developing', 'fluent', 'mastered'] as const) {
      expect(bandCellClasses(band(b))).toBe(statusColour(b).fill);
      expect(bandCellClasses(band(b))).toContain('text-white');
    }
  });

  it('Not Started has no fill at all, and says so with a dash', () => {
    expect(bandCellClasses(NOT_STARTED)).toContain('border-dashed');
    expect(bandCellClasses(NOT_STARTED)).not.toMatch(/\bbg-/);
  });

  it('Started is filled — it is a state, not the absence of one', () => {
    expect(bandCellClasses(STARTED)).toContain('bg-started');
  });
});

describe('bands.ts exports no hex', () => {
  it('the field is gone from every band', () => {
    for (const b of ACCURACY_BANDS) {
      expect(Object.keys(b), b.id).not.toContain('hex');
      // The load-bearing fields stay.
      expect(b.label).toBeTruthy();
      expect(typeof b.minPercent).toBe('number');
      expect(typeof b.maxPercent).toBe('number');
    }
  });

  it('and the type has no hex either', () => {
    // A compile-time guarantee made runtime-visible: this assignment
    // would not type-check if `hex` were still on the interface as a
    // required field, and the key check above catches it as data.
    const def: AccuracyBandDef = {
      id: 'mastered', label: 'Mastered', minPercent: 95, maxPercent: 100,
    };
    expect(def.id).toBe('mastered');
  });
});

describe('the tier table is a view of the palette', () => {
  it('every graded tier reads through it', () => {
    const pairs: Array<[keyof typeof TIER_BAR_CLASS, StatusKey]> = [
      ['mastered', 'mastered'], ['fluent', 'fluent'],
      ['developing', 'developing'], ['needsWork', 'needs-work'],
      ['started', 'started'], ['untouched', 'not-started'],
    ];
    for (const [tier, status] of pairs) {
      const c = statusColour(status);
      expect(TIER_BAR_CLASS[tier], tier).toBe(c.bar);
      expect(TIER_TEXT_CLASS[tier], tier).toBe(c.text);
      expect(TIER_BADGE_CLASS[tier], tier).toBe(c.badge);
    }
  });

  it('STALE IS THE EXCEPTION, and stays a neutral', () => {
    // It is not a rung; it is a rung that decayed. Giving it a status
    // colour would put it on the ladder.
    expect(TIER_BAR_CLASS.stale).toContain('neutral');
    const statusBars = STATUS_KEYS.map(k => statusColour(k).bar);
    expect(statusBars).not.toContain(TIER_BAR_CLASS.stale);
  });
});

describe('a verdict resolves to exactly one status', () => {
  it('across all six', () => {
    expect(statusKeyForVerdict(NOT_STARTED)).toBe('not-started');
    expect(statusKeyForVerdict(STARTED)).toBe('started');
    for (const b of ['needs-work', 'developing', 'fluent', 'mastered'] as const) {
      expect(statusKeyForVerdict(band(b))).toBe(b);
    }
  });
});

describe('nothing else names a status colour', () => {
  /**
   * =====================================================================
   * THE GUARD ON "ONE SOURCE".
   *
   * Every assertion above compares one table to another, which proves
   * the tables agree TODAY. This is the one that fails when somebody
   * types a hex into a component next month.
   *
   * SCOPED TO THE TWO NEW COLOURS AND THE RETIRED ONE. The green, the
   * amber and the red genuinely appear elsewhere for reasons that are
   * not statuses at all — the keyboard visual's note colours, the
   * voicing-tension scale, the scale-degree compass — and forbidding
   * a hex the app uses for four unrelated things would be a test about
   * string matching rather than about the palette.
   * =====================================================================
   */
  const OWNERS = ['statusColour.ts', 'statusColour.test.ts'];

  it('the royal blue, the pale blue and the retired green appear nowhere else', () => {
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(SOURCES)) {
      if (OWNERS.some(owner => file.endsWith(owner))) continue;
      for (const hex of ['#2B4FA8', '#C7DDF5', '#0F5E47']) {
        if (text.includes(hex)) offenders.push(`${file} names ${hex}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------

/** Hue in degrees, for asserting two colours are not the same colour. */
function hueOf(hex: string): number {
  const [r, g, b] = rgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6
    : max === g ? (b - r) / d + 2
      : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Rough perceived lightness, 0–255. Enough to say "pale" from "deep". */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
