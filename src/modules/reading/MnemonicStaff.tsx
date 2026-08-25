/**
 * The mnemonic, drawn as a staff rather than written as a sentence.
 *
 * "E G B D F — Every Good Boy Does Fine" is a sentence you have to
 * decode into a picture of the staff before it helps. Laid against
 * five lines with a real clef, "Every" level with the bottom line and
 * "Fine" with the top, it IS the picture and there is nothing to
 * decode. The CLEF is what triggers the recall while reading — the
 * words "bass clef" are not what you see on a page — so it is drawn,
 * not just named. The text label stays as well.
 *
 * ---------------------------------------------------------------
 * THIS REVERSES A POSITION I TOOK ONE STEP AGO, deliberately.
 *
 * 4.4 hand-drew five lines and argued that aligning to VexFlow "would
 * mean measuring its internal stave geometry and would break silently
 * the first time that moved". That concern was about MEASURING
 * GLYPHS. `getYForLine(n)` is not measurement — it is the public
 * accessor for where a stave line is, it is pure arithmetic over the
 * stave's own options, and it needs no canvas. Using it is what makes
 * a real clef possible AND keeps the words on the lines the clef
 * actually defines, which hand-drawn lines could only approximate.
 * ---------------------------------------------------------------
 *
 * VexFlow indexes lines TOP-DOWN (0 is the top line) while everything
 * else in this module counts bottom-up from the staff's bottom line.
 * `vexLinesForItem` is the single place that conversion happens, and
 * it is pure so a test can pin it — an inverted mnemonic is the one
 * error here that would look entirely plausible.
 */

import { useEffect, useRef, useState } from 'react';
import { loadVexFlow } from './ReadingStaff';
import type { StaffMnemonic } from './answerModels';

/**
 * =====================================================================
 * TWO ARITHMETIC BUGS LIVED HERE, AND NEITHER WAS A FONT PROBLEM.
 *
 * Measured on the bass-clef line mnemonic at the old constants
 * (WIDTH 260, HEIGHT 92, STAVE_Y 14, default spacing, size 13):
 *
 *   1. THE STAFF WAS DRAWN OUTSIDE THE SVG. `STAVE_Y` is not the top
 *      line — VexFlow adds `spaceAboveStaffLn` (four line-spaces, 40px
 *      at the default 10) above it. So the lines landed at y 54…94 in
 *      a 92px viewport, and the bottom row's text baseline was 98 with
 *      its backing box reaching 102. "Good Boys" was clipped away
 *      entirely, at every width.
 *
 *   2. THE TEXT WAS TALLER THAN THE GAP IT SAT IN. Default line
 *      spacing is 10px; the letter was 13px and its knockout box 16px.
 *      Every box overlapped its neighbours by 6px, and because the
 *      boxes are appended bottom-to-top each one painted over the row
 *      below it. That is the stack of overlapping white rectangles,
 *      and the fragments showing through are the parts of each word
 *      the next box up did not reach.
 *
 * THE FIX IS THAT THE GEOMETRY IS DERIVED. The line spacing is chosen
 * to clear the text rather than the text shrunk to fit an inherited
 * spacing, the SVG height is read back off the stave instead of being
 * written down, and `KNOCKOUT` / `svgHeightFor` are pure so a test can
 * assert the two invariants that were broken: boxes do not overlap,
 * and nothing is drawn past the bottom edge. Nudging numbers until it
 * looked right at one width is what produced the previous version.
 * =====================================================================
 */

/** Wider than the words need, so a long phrase ("All Cows Eat Grass")
 *  has room without the stave being cropped. The SVG scales down with
 *  `max-w-full` on narrow screens. */
const WIDTH = 340;
const STAVE_X = 4;
const STAVE_Y = 4;

/**
 * Distance between staff lines, and therefore the vertical budget for
 * one mnemonic row.
 *
 * MUST EXCEED `knockoutHeight(LETTER_SIZE)` or the rows collide — this
 * is the invariant that was violated, and `mnemonicStaff.test` pins it
 * against these very constants rather than against a copy.
 */
const LINE_SPACING = 22;
const LETTER_SIZE = 14;
const WORD_SIZE = 12;

/**
 * `spacingBetweenLinesPx` IS CAMELCASE IN VEXFLOW 5. The legacy
 * `spacing_between_lines_px` is accepted by the type as an arbitrary
 * option and then silently ignored — it leaves the stave at its 10px
 * default, which is exactly the failure this is fixing. Verified by
 * reading `getYForLine` back: the snake_case form returns spacing 10,
 * the camelCase form returns 22.
 *
 * The above/below padding is trimmed to one line-space because the
 * default four is what pushed the staff out of the old viewport.
 */
const STAVE_OPTIONS = {
  spacingBetweenLinesPx: LINE_SPACING,
  spaceAboveStaffLn: 1,
  spaceBelowStaffLn: 1,
};

/** The backing box that stops a staff line striking through a letter.
 *  Height is the whole reason a row needs vertical room. */
export function knockoutHeight(size: number): number {
  return size + 4;
}

/** The box drawn behind a text run at `baseline`. */
export function knockoutBox(
  baseline: number,
  size: number,
  chars: number,
): { y: number; height: number; width: number } {
  return {
    y: baseline - size,
    height: knockoutHeight(size),
    width: chars * size * 0.62 + 6,
  };
}

/**
 * The SVG height needed to contain a stave whose bottom line is at
 * `bottomLineY`, with the lowest knockout box fully inside.
 *
 * DERIVED, NOT DECLARED. The previous constant was a guess about where
 * VexFlow would put the staff, and it was wrong by 10px in the
 * direction that clips.
 */
export function svgHeightFor(bottomLineY: number): number {
  const lowest = knockoutBox(bottomLineY + 5, LETTER_SIZE, 1);
  return Math.ceil(lowest.y + lowest.height + 6);
}

/**
 * Which VexFlow line index (or pair, for a space) an item sits on.
 *
 * `items` run BOTTOM TO TOP; VexFlow counts lines TOP-DOWN across five
 * lines, so the bottom line is index 4. A space sits between the two
 * lines either side of it and is drawn at their midpoint.
 */
export function vexLinesForItem(kind: 'line' | 'space', i: number): number[] {
  return kind === 'line' ? [4 - i] : [4 - i, 3 - i];
}

export default function MnemonicStaff({
  mnemonic,
  accentHex = '#6f4a2f',
}: {
  mnemonic: StaffMnemonic;
  accentHex?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    void loadVexFlow().then(VF => {
      if (cancelled || !hostRef.current) return;
      const el = hostRef.current;
      el.innerHTML = '';
      try {
        const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
        const ctx = renderer.getContext();

        // Built before the resize so the height can be read off the
        // stave the resize has to contain, rather than guessed at.
        const stave = new VF.Stave(
          STAVE_X, STAVE_Y, WIDTH - STAVE_X * 2, STAVE_OPTIONS,
        );
        stave.addClef(mnemonic.clef);
        renderer.resize(WIDTH, svgHeightFor(stave.getYForLine(4)));
        stave.setContext(ctx).draw();

        const svg = el.querySelector('svg');
        if (!svg) return;

        // Where the notes would start — i.e. clear of the clef. In
        // jsdom this collapses to the stave's own x because glyphs
        // measure zero without canvas; that affects this preview only,
        // never a test assertion.
        const textX = Math.max(stave.getNoteStartX(), STAVE_X + 40);

        mnemonic.items.forEach((item, i) => {
          const lines = vexLinesForItem(mnemonic.kind, i);
          const y = lines.reduce((sum, n) => sum + stave.getYForLine(n), 0)
            / lines.length;
          const baseline = y + 5;
          appendText(svg, {
            x: textX, y: baseline, text: item.letter,
            fill: accentHex, size: LETTER_SIZE, weight: '700', knockout: true,
          });
          if (item.word) {
            appendText(svg, {
              x: textX + LETTER_SIZE + 8, y: baseline, text: item.word,
              fill: '#6b6b6b', size: WORD_SIZE, weight: '400', knockout: true,
            });
          }
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    }).catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
  }, [mnemonic, accentHex]);

  return (
    <figure className="space-y-1">
      <figcaption className="text-[10px] uppercase tracking-wide text-neutral-500 text-center">
        {mnemonic.label}
      </figcaption>
      <div
        ref={hostRef}
        className="flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
        role="img"
        aria-label={`${mnemonic.label}: ${mnemonic.phrase}`}
      />
      {/* The phrase is the fallback, not decoration: if the font fails
          to load there must still be a mnemonic on the card. */}
      {failed && (
        <p className="text-center text-xs text-neutral-500">{mnemonic.phrase}</p>
      )}
    </figure>
  );
}

/** A text run with a knocked-out backing, so a staff line does not
 *  strike through the letter sitting on it. */
function appendText(
  svg: SVGElement,
  o: { x: number; y: number; text: string; fill: string; size: number; weight: string; knockout: boolean },
) {
  const NS = 'http://www.w3.org/2000/svg';
  if (o.knockout) {
    const box = knockoutBox(o.y, o.size, o.text.length);
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(o.x - 3));
    rect.setAttribute('y', String(box.y));
    rect.setAttribute('width', String(box.width));
    rect.setAttribute('height', String(box.height));
    rect.setAttribute('data-knockout', '');
    rect.setAttribute('class', 'fill-white dark:fill-neutral-900');
    svg.appendChild(rect);
  }
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', String(o.x));
  text.setAttribute('y', String(o.y));
  text.setAttribute('font-size', String(o.size));
  text.setAttribute('font-weight', o.weight);
  text.setAttribute('fill', o.fill);
  text.textContent = o.text;
  svg.appendChild(text);
}
