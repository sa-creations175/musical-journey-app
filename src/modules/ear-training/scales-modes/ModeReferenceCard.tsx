import { useState } from 'react';
import type { Mode } from './catalog';
import ModeAssociationsEditor from './ModeAssociationsEditor';
import { songSearchUrl } from './shared';

interface Props {
  mode: Mode;
}

/**
 * Single mode reference card. Always anchored with id `mode-card-{modeId}`
 * so reveal cards in either tab can jump straight to the right mode.
 * Click anywhere on the header to expand the full reference.
 */
export default function ModeReferenceCard({ mode }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      id={`mode-card-${mode.id}`}
      className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 p-3 sm:p-4 space-y-2 scroll-mt-24"
    >
      <button
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="w-full flex items-start justify-between gap-2 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{mode.name}</span>
            <span className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-neutral-200 dark:border-neutral-700 text-neutral-500">
              bright {mode.brightnessRank}/9
            </span>
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">{mode.quickDefinition}</div>
        </div>
        <span
          aria-hidden
          className={`text-fluent text-xs shrink-0 mt-1 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>

      <div className="text-[11px] flex flex-wrap gap-x-3 gap-y-1 text-neutral-500">
        <span>
          <span className="uppercase tracking-wide mr-1">alt:</span>
          <span className="text-neutral-700 dark:text-neutral-300">{mode.signatureAlteration}</span>
        </span>
        <span>
          <span className="uppercase tracking-wide mr-1">chords:</span>
          <span className="font-mono text-neutral-700 dark:text-neutral-300">{mode.characteristicChords.join(' · ')}</span>
        </span>
      </div>

      {expanded && (
        <div className="space-y-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            {mode.starterDescription}
          </p>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">scale formula</div>
            <div className="font-mono text-xs text-neutral-700 dark:text-neutral-300">
              {mode.scaleIntervals.map(st => st).join(' - ')} <span className="text-neutral-400">semitones from tonic</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">modal vamp</div>
            <p className="text-xs text-neutral-700 dark:text-neutral-300">{mode.vamp.description}</p>
          </div>

          {mode.songExamples.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">song examples</div>
              <ul className="space-y-1 text-xs">
                {mode.songExamples.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 flex-wrap">
                    <span>
                      <span className="font-medium">{s.title}</span>
                      <span className="text-neutral-500"> — {s.artist}</span>
                      {s.year && <span className="text-neutral-400 font-mono"> ({s.year})</span>}
                    </span>
                    <a href={songSearchUrl('spotify', s.title, s.artist)} target="_blank" rel="noopener noreferrer"
                       className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-[10px] hover:border-fluent hover:text-fluent">spotify</a>
                    <a href={songSearchUrl('youtube', s.title, s.artist)} target="_blank" rel="noopener noreferrer"
                       className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-[10px] hover:border-fluent hover:text-fluent">youtube</a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ModeAssociationsEditor modeId={mode.id} />
        </div>
      )}

      {!expanded && <ModeAssociationsEditor modeId={mode.id} />}
    </div>
  );
}
