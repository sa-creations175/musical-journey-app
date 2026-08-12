/**
 * Reading notation preview — dev-only page.
 *
 * Renders the fixed twenty-one-card sample so the notation can be
 * checked against an outside reference, one card at a time. NOT
 * throwaway: it stays past step 4 as the standing notation check, and
 * it is where the key overlay gets re-verified when it lands.
 *
 * Every caption comes from `resolveReadingCard`. This file writes no
 * answer strings of its own, so a caption cannot drift from the
 * picture above it — the two are read off one resolved object.
 *
 * Rendering only: nothing here answers, scores, or writes an attempt.
 */

import { useState } from 'react';
import ReadingStaff from './ReadingStaff';
import { resolveReadingCard } from './renderCard';
import { PREVIEW_SECTIONS, type ReadingSample } from './previewSamples';

/** Reading's module accent — sepia ink. Literal because Reading has
 *  no moduleMeta entry yet; see moduleSectionPalette.ts for why this
 *  hue was chosen and how far it measures from every other accent. */
const SEPIA = '#6f4a2f';

function SampleCard({ sample, showLabels, grand }: {
  sample: ReadingSample;
  showLabels: boolean;
  grand: boolean;
}) {
  // The frame rides in as a render option like any other, so the
  // resolver still produces the staff spec and the caption together.
  // Only signature cards honour it; the resolver ignores it elsewhere.
  const card = resolveReadingCard(sample.itemRef, {
    ...sample.options,
    ...(grand ? { frame: 'grand' as const } : {}),
  });

  if (!card) {
    return (
      <div className="rounded-md border border-needswork/40 p-3 text-[12px]">
        <p className="text-needswork">
          Unresolvable: <code>{sample.itemRef}</code>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-[10px] text-neutral-400">
        <span className="tabular-nums">{sample.n}</span>
        {/* The itemRef is always visible, labels toggle or not — when
            a caption and a render disagree, the ref is what says which
            card you are actually looking at. */}
        <code className="truncate" title={sample.why}>{sample.itemRef}</code>
      </div>

      <ReadingStaff spec={card.staff} />

      {showLabels && (
        <p
          className="text-[13px] font-medium text-center"
          style={{ color: SEPIA }}
        >
          {card.caption}
        </p>
      )}
    </div>
  );
}

export default function ReadingPreview() {
  const [showLabels, setShowLabels] = useState(true);
  // Single staff is the DEFAULT and stays the default — the toggle
  // adds the piano framing, it does not replace what renders now.
  const [grand, setGrand] = useState(false);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium tracking-tight">
            Reading — notation preview
          </h1>
          <p className="text-[12px] text-neutral-500">
            Twenty-one fixed samples. Captions are derived from the
            itemRef, never written by hand.
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={e => setShowLabels(e.target.checked)}
            />
            Labels
          </label>
          <label
            className="flex items-center gap-2 text-[12px]"
            title="Key signature cards only — a signature appears on both staves of piano music"
          >
            <input
              type="checkbox"
              checked={grand}
              onChange={e => setGrand(e.target.checked)}
            />
            Grand staff
          </label>
        </div>
      </header>

      {PREVIEW_SECTIONS.map(section => (
        <section key={section.heading} className="space-y-3">
          <h2 className="text-[13px] uppercase tracking-wide font-semibold text-neutral-500">
            {section.heading}
          </h2>
          {/* Signature cards render on a wider stave, so their column
              is wider — otherwise the extra width would be scaled away
              by the grid and the ratio fix would do nothing. */}
          <div className={`grid gap-3 ${
            section.heading === 'Key signatures'
              ? 'grid-cols-[repeat(auto-fill,minmax(320px,1fr))]'
              : 'grid-cols-[repeat(auto-fill,minmax(210px,1fr))]'
          }`}>
            {section.samples.map(s => (
              <SampleCard
                key={s.n}
                sample={s}
                showLabels={showLabels}
                grand={grand}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
