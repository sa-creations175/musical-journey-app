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

const WIDTH = 260;
const HEIGHT = 92;
const STAVE_X = 4;
const STAVE_Y = 14;

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
        renderer.resize(WIDTH, HEIGHT);
        const ctx = renderer.getContext();

        const stave = new VF.Stave(STAVE_X, STAVE_Y, WIDTH - STAVE_X * 2);
        stave.addClef(mnemonic.clef);
        stave.setContext(ctx).draw();

        const svg = el.querySelector('svg');
        if (!svg) return;

        // Where the notes would start — i.e. clear of the clef. In
        // jsdom this collapses to the stave's own x because glyphs
        // measure zero without canvas; that affects this preview only,
        // never a test assertion.
        const textX = Math.max(stave.getNoteStartX(), STAVE_X + 34);

        mnemonic.items.forEach((item, i) => {
          const lines = vexLinesForItem(mnemonic.kind, i);
          const y = lines.reduce((sum, n) => sum + stave.getYForLine(n), 0)
            / lines.length;
          appendText(svg, {
            x: textX, y: y + 4, text: item.letter,
            fill: accentHex, size: 13, weight: '700', knockout: true,
          });
          if (item.word) {
            appendText(svg, {
              x: textX + 16, y: y + 4, text: item.word,
              fill: '#6b6b6b', size: 12, weight: '400', knockout: true,
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
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(o.x - 2));
    rect.setAttribute('y', String(o.y - o.size + 1));
    rect.setAttribute('width', String(o.text.length * o.size * 0.62 + 4));
    rect.setAttribute('height', String(o.size + 3));
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
