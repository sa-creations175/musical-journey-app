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

/** Load VexFlow once per session, on first card render. */
function loadVexFlow(): Promise<VexModule> {
  vexPromise ??= import('vexflow/bravura');
  return vexPromise;
}

interface Props {
  spec: ReadingStaffSpec;
  /** Rendered width in px. Height follows from the staff. */
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 130;

export default function ReadingStaff({
  spec,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: Props) {
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
        renderer.resize(width, height);
        const ctx = renderer.getContext();

        // Staves start a little in from the left so the clef is not
        // flush against the edge, and the drawable width follows.
        const stave = new VF.Stave(10, 20, width - 20);
        stave.addClef(spec.clef);
        if (spec.keySignature) stave.addKeySignature(spec.keySignature);
        stave.setContext(ctx).draw();

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
          new VF.Formatter().joinVoices([voice]).format([voice], width - 80);
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
  }, [spec, width, height]);

  return (
    <div>
      <div ref={hostRef} aria-hidden style={{ minHeight: height }} />
      {error && (
        <p className="text-[11px] text-needswork" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
