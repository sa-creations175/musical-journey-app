/**
 * Renders one Reading card's notation with VexFlow.
 *
 * ---------------------------------------------------------------
 * FIRST LAZY-LOADED THING IN THE APP — the pattern matters
 *
 * Nothing else in this codebase code-splits: App.tsx imports every
 * screen eagerly. VexFlow is where that stops being reasonable — the
 * library plus one music font is roughly a megabyte, and Reading is
 * dev-only, so an eager import would put it in every user's first
 * load to serve a page they cannot reach.
 *
 * Two decisions worth copying next time:
 *
 *   · Import `vexflow/bravura`, NOT `vexflow`. The default entry
 *     bundles all five fonts (784 KB); the bravura subpath takes the
 *     one font we render with (330 KB) and drops Petaluma, Gonville
 *     and Academico.
 *   · The dynamic import is MODULE-LEVEL and memoised, not per
 *     component. Twenty-one cards on a page must trigger one fetch,
 *     not twenty-one — `import()` dedupes, but memoising the promise
 *     makes that explicit rather than relying on it.
 * ---------------------------------------------------------------
 *
 * Rendering only. No answering, no scoring, no attempt writing.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReadingStaffSpec } from './renderCard';

type VexModule = typeof import('vexflow/bravura');

let vexPromise: Promise<VexModule> | null = null;

/** Load VexFlow once per session, on first card render. Exported so
 *  MnemonicStaff shares this promise rather than starting a second
 *  load of the same 330 KB font. */
export function loadVexFlow(): Promise<VexModule> {
  vexPromise ??= import('vexflow/bravura');
  return vexPromise;
}

interface Props {
  spec: ReadingStaffSpec;
  /** Overrides the size chosen from the spec. Rarely needed. */
  width?: number;
  height?: number;
}

/**
 * WHY SIGNATURE CARDS GET A WIDER STAVE.
 *
 * The report was that key-signature accidentals read as "scattered
 * wide" rather than as one cluster. The gaps are not the cause and
 * cannot be: VexFlow's KeySignature.convertToGlyph places each
 * accidental at `previous.xShift + previous.getWidth() + 1`, so they
 * already sit one pixel apart at the font's own advance width. There
 * is no spacing parameter to turn down — the `+1` is hardcoded and the
 * rest is Bravura's metrics, measured at runtime.
 *
 * What was actually wrong is the RATIO. Six sharps plus a clef nearly
 * filled a 180px stave, so the cluster had no empty staff after it to
 * be a silhouette against — it read as a wall of accidentals rather
 * than as a signature at the head of a system, which is the shape
 * engraved music teaches you to recognise. Widening the stave leaves
 * the glyphs and their spacing untouched and restores that contrast.
 *
 * MEASUREMENT CAVEAT, stated because it matters: this could not be
 * verified numerically. jsdom has no canvas, so every VexFlow glyph
 * measures as zero width in tests and the accidentals collapse to
 * x = 15,16,17,18,19,20. The ratio argument is sound but the result
 * is an eyeball check, not an asserted one.
 */
const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 130;
const SIGNATURE_WIDTH = 300;
/**
 * Extra room between the clef and a lone notehead, applied to NOTE
 * cards only.
 *
 * A chord card fills that space with its accidentals, and a signature
 * card with its accidentals, so only a single notehead sits with
 * nothing between it and the clef. `spec.keys.length === 1` is exactly
 * the note-card case and cannot drift: no chord quality in the catalog
 * has fewer than two tones (the smallest are the octave and the
 * root-fifth, both two), and a signature card draws no notes at all.
 * A test pins that invariant.
 *
 * Deliberately NOT centring — just enough that the note is not jammed
 * against the clef.
 */
const NOTE_CLEF_GAP = 14;
/** Grand staff needs room for two staves plus the gap between them. */
const GRAND_HEIGHT = 200;
const GRAND_STAVE_GAP = 80;

export default function ReadingStaff({ spec, width, height }: Props) {
  const isGrand = spec.frame === 'grand';
  const hasSignature = spec.keySignature !== null && spec.keys.length === 0;
  const w = width ?? (hasSignature ? SIGNATURE_WIDTH : DEFAULT_WIDTH);
  const h = height ?? (isGrand ? GRAND_HEIGHT : DEFAULT_HEIGHT);
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    void loadVexFlow().then(VF => {
      if (cancelled || !hostRef.current) return;
      const el = hostRef.current;
      // Re-render from scratch on every spec change. These are small
      // static drawings; diffing them would cost more than redrawing.
      el.innerHTML = '';

      try {
        const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
        renderer.resize(w, h);
        const ctx = renderer.getContext();

        // Staves start a little in from the left so the clef is not
        // flush against the edge, and the drawable width follows.
        const stave = new VF.Stave(10, 20, w - 20);
        stave.addClef(spec.clef);
        if (spec.keySignature) stave.addKeySignature(spec.keySignature);
        stave.setContext(ctx).draw();
        if (spec.keys.length === 1) {
          // Push the note area right AFTER draw, so the staff lines and
          // clef are unaffected and only where notes start moves.
          stave.setNoteStartX(stave.getNoteStartX() + NOTE_CLEF_GAP);
        }

        if (isGrand) {
          // Piano framing: treble over bass, braced, signature on
          // both. The brace and the left barline are separate
          // connectors — the brace is the curly bracket, the line is
          // what makes the two staves read as one system.
          const lower = new VF.Stave(10, 20 + GRAND_STAVE_GAP, w - 20);
          lower.addClef(spec.clef === 'treble' ? 'bass' : 'treble');
          if (spec.keySignature) lower.addKeySignature(spec.keySignature);
          lower.setContext(ctx).draw();

          new VF.StaveConnector(stave, lower)
            .setType(VF.StaveConnector.type.BRACE)
            .setContext(ctx).draw();
          new VF.StaveConnector(stave, lower)
            .setType(VF.StaveConnector.type.SINGLE_LEFT)
            .setContext(ctx).draw();
        }

        if (spec.keys.length > 0) {
          // ONE StaveNote carrying every key — a chord is a single
          // note with several heads, not several notes. Whole-note
          // duration ('w') keeps stems off the drawing entirely, so
          // nothing about the rendering implies a rhythm the card is
          // not asking about.
          const note = new VF.StaveNote({
            keys: spec.keys,
            duration: 'w',
            clef: spec.clef,
          });

          // Accidentals are NOT automatic in VexFlow — a key string
          // like 'eb/4' places the note but draws no flat unless one
          // is attached. With no key signature on these cards, every
          // accidental in the spelling has to be written or the
          // render would silently disagree with the caption.
          spec.keys.forEach((key, i) => {
            const acc = key.split('/')[0].slice(1);
            if (acc) note.addModifier(new VF.Accidental(acc), i);
          });

          const voice = new VF.Voice({ numBeats: 4, beatValue: 4 });
          voice.addTickables([note]);
          // formatToStave, NOT format(voice, someWidth). The justify
          // width has to be the stave's own note area
          // (noteEndX - noteStartX - padding); the invented `w - 80`
          // it replaces was 120px for a stave whose note area is ~165,
          // and formatting into a width the stave does not have is
          // what left accidentals sitting away from their noteheads.
          // It also means the note-start gap above is picked up
          // automatically rather than needing a second adjustment.
          new VF.Formatter().joinVoices([voice]).formatToStave([voice], stave);
          voice.draw(ctx, stave);
        }

        if (!cancelled) setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'render failed');
        }
      }
    }).catch((e: unknown) => {
      if (!cancelled) {
        setError(e instanceof Error ? e.message : 'VexFlow failed to load');
      }
    });

    return () => { cancelled = true; };
  }, [spec, w, h, isGrand]);

  return (
    <div>
      <div ref={hostRef} aria-hidden style={{ minHeight: h }} />
      {error && (
        <p className="text-[11px] text-needswork" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
