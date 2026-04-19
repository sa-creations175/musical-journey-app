import { useState, type ReactNode } from 'react';

export type ModuleIntroAccent = 'green' | 'blue' | 'amber';

interface Props {
  headline: string;
  description: string;
  bullets: string[];
  accent?: ModuleIntroAccent;
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

export default function ModuleIntro({ headline, description, bullets, accent = 'green' }: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`rounded-card border border-neutral-200 dark:border-neutral-800 border-l-4 ${accentBorder[accent]} bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{formatInline(headline)}</div>
          <div className="text-sm text-neutral-500 mt-1">{formatInline(description)}</div>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
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
