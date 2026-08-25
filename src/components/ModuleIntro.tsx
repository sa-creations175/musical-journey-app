import { useEffect, useState, type ReactNode } from 'react';
import { getPref, setPref } from '../lib/userPrefs';

export type ModuleIntroAccent = 'green' | 'blue' | 'amber';

interface Props {
  headline: string;
  description: string;
  bullets: string[];
  accent?: ModuleIntroAccent;
  /**
   * Hide the description behind the toggle too, leaving the headline
   * alone when collapsed.
   *
   * OPT-IN so the six other modules that render this card are not
   * changed by a request about one of them. Harmonic fluency's home now
   * leads with fifteen category cards, and four blocks of prose above
   * them pushed the thing the page is for below the fold.
   */
  compact?: boolean;
  /**
   * Remember the open state under this key, the way the song page's
   * criteria panel does. Absent means the card opens closed every
   * visit, which is the existing behaviour everywhere else.
   */
  persistKey?: string;
}

const accentBorder: Record<ModuleIntroAccent, string> = {
  green: 'border-l-fluent',
  blue: 'border-l-info',
  amber: 'border-l-developing',
};

const accentText: Record<ModuleIntroAccent, string> = {
  green: 'text-fluent',
  blue: 'text-info',
  amber: 'text-developing',
};

// Inline formatter: **bold** and `mono`. Splits while preserving order.
function formatInline(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return tokens.map((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**')) {
      return <strong key={i} className="font-semibold">{tok.slice(2, -2)}</strong>;
    }
    if (tok.startsWith('`') && tok.endsWith('`')) {
      return (
        <code key={i} className="font-mono text-[0.85em] px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
          {tok.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{tok}</span>;
  });
}

export default function ModuleIntro({
  headline, description, bullets, accent = 'green', compact = false, persistKey,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  // Hydrate once. Writes go through the toggle below, so a reader who
  // opens the card and leaves immediately still has it remembered.
  useEffect(() => {
    if (persistKey === undefined) return;
    let live = true;
    void getPref<boolean>(persistKey, false).then(v => { if (live) setExpanded(v); });
    return () => { live = false; };
  }, [persistKey]);

  const toggle = () => {
    setExpanded(v => {
      const next = !v;
      if (persistKey !== undefined) void setPref(persistKey, next);
      return next;
    });
  };
  return (
    <div
      className={`rounded-2xl border border-black/[0.07] border-l-4 ${accentBorder[accent]} bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-4`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{formatInline(headline)}</div>
          {(!compact || expanded) && (
            <div className="text-sm text-neutral-500 mt-1">{formatInline(description)}</div>
          )}
        </div>
        <button
          onClick={toggle}
          aria-expanded={expanded}
          className={`shrink-0 inline-flex items-center gap-1 text-xs ${accentText[accent]} hover:opacity-80`}
        >
          {expanded ? 'less' : 'learn more'}
          <span
            aria-hidden="true"
            className={`inline-block transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </button>
      </div>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          expanded ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <ul className="list-disc pl-5 text-sm text-neutral-600 dark:text-neutral-300 space-y-1.5">
            {bullets.map((b, i) => (
              <li key={i}>{formatInline(b)}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
