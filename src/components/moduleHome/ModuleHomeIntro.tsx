/**
 * The "About <module>" block at the top of a module home.
 *
 * =====================================================================
 * COLLAPSED MEANS COLLAPSED. THE ROW IS THE LABEL AND THE CONTROL.
 *
 * Not the label and a sentence. Not the label and a subtitle. The whole
 * reason this block exists in its collapsed form is the vertical space
 * at the top of the page — a module home leads with its cards — and a
 * sentence visible before expanding spends exactly the space the
 * collapse was for.
 *
 * So the sentence lives in the EXPANDED state, with whatever bullets
 * the module already had, and the collapsed row carries nothing else.
 *
 * WHY NOT `ModuleIntro`. That component is the learn-more card on seven
 * drill pages, where the headline and description are meant to be read
 * on arrival. Teaching it a mode where its own headline disappears
 * would make one component answer two opposite questions. This is the
 * module-home block; that one is the drill-page card.
 * =====================================================================
 *
 * THE LABEL IS DERIVED. `moduleMeta` holds the name and the accent, so
 * nothing here is typed per module and nothing carries a colour
 * literal. "About" stays neutral; the module's name takes its own hue,
 * which is the same hue its cards are tinted with two rows below.
 */
import { useState, type ReactNode } from 'react';
import { moduleMetaById } from '../../lib/moduleMeta';

export interface ModuleHomeIntroProps {
  /** The module whose name and accent title this block. */
  moduleId: string;
  /** The one line, shown only once expanded. Authored, never generated. */
  description: string;
  /** Whatever expanded content the module already had. */
  bullets?: readonly string[];
}

/** `**bold**` spans, the same inline convention `ModuleIntro` reads. */
function formatInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} className="font-medium">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function ModuleHomeIntro({
  moduleId, description, bullets,
}: ModuleHomeIntroProps) {
  // ALWAYS CLOSED ON ARRIVAL. Not persisted: a module home that opened
  // holding a block the reader expanded last week would be back to
  // spending the space this exists to save.
  const [expanded, setExpanded] = useState(false);
  const meta = moduleMetaById(moduleId);

  return (
    <div
      data-testid="module-home-intro"
      data-expanded={expanded ? 'true' : 'false'}
      className="rounded-xl border border-black/[0.07] bg-white dark:bg-neutral-900"
    >
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        data-testid="module-home-intro-toggle"
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="text-sm">
          <span className="text-neutral-500">About </span>
          {/* The module's own accent, from `moduleMeta` — the same hex
              its cards are tinted with. */}
          <span
            className="font-medium"
            style={meta === undefined ? undefined : { color: meta.accentHex }}
            data-testid="module-home-intro-name"
          >
            {meta?.label ?? moduleId}
          </span>
        </span>
        <span aria-hidden className="text-xs text-neutral-400 shrink-0">
          {expanded ? '−' : '+'}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2" data-testid="module-home-intro-body">
          <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-snug">
            {formatInline(description)}
          </p>
          {bullets !== undefined && bullets.length > 0 && (
            <ul className="space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
              {bullets.map((b, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="text-neutral-400">·</span>
                  <span>{formatInline(b)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
