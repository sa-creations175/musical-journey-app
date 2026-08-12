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

function SampleCard({ sample, showLabels }: {
  sample: ReadingSample;
  showLabels: boolean;
}) {
  const card = resolveReadingCard(sample.itemRef, sample.options);

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
        <label className="flex items-center gap-2 text-[12px] shrink-0">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={e => setShowLabels(e.target.checked)}
          />
          Labels
        </label>
      </header>

      {PREVIEW_SECTIONS.map(section => (
        <section key={section.heading} className="space-y-3">
          <h2 className="text-[13px] uppercase tracking-wide font-semibold text-neutral-500">
            {section.heading}
          </h2>
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
            {section.samples.map(s => (
              <SampleCard key={s.n} sample={s} showLabels={showLabels} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
