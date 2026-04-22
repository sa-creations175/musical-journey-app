import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MODES } from './catalog';

/**
 * Render text that may mention mode names, turning each mention into a
 * link to that mode's reference card (same-page anchor when already on
 * the scales-modes page, otherwise routes to the module page plus hash).
 *
 * Used in Chord Progressions reveal theory notes and Harmonic Fluency
 * flashcard explanations. Case-insensitive; first mention per mode name
 * per text gets linked (subsequent mentions are plain text to avoid
 * visual noise).
 */

interface Props {
  text: string;
  /** When true, use a plain <a href="#..."> so clicks on the same page
   *  jump without a route change. Defaults to false (uses <Link>). */
  anchorsOnly?: boolean;
}

// Build a regex that matches any mode name. Ordered longest-first so
// "Harmonic minor" is preferred over "minor" as a standalone token, etc.
const MODE_NAMES = [...MODES]
  .map(m => m.name)
  .sort((a, b) => b.length - a.length);

const MODE_REGEX = new RegExp(
  `\\b(${MODE_NAMES.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i',
);

function modeIdFor(display: string): string | null {
  const lower = display.toLowerCase();
  const m = MODES.find(mode => mode.name.toLowerCase() === lower);
  return m?.id ?? null;
}

export default function ModeLinkify({ text, anchorsOnly = false }: Props) {
  const out: ReactNode[] = [];
  let remaining = text;
  const linked = new Set<string>();
  let key = 0;

  while (remaining.length > 0) {
    const match = MODE_REGEX.exec(remaining);
    if (!match) {
      out.push(<Fragment key={key++}>{remaining}</Fragment>);
      break;
    }
    const before = remaining.slice(0, match.index);
    const display = match[0];
    const rest = remaining.slice(match.index + display.length);
    if (before) out.push(<Fragment key={key++}>{before}</Fragment>);

    const modeId = modeIdFor(display);
    if (modeId && !linked.has(modeId)) {
      linked.add(modeId);
      if (anchorsOnly) {
        out.push(
          <a
            key={key++}
            href={`#mode-card-${modeId}`}
            className="text-fluent underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {display}
          </a>,
        );
      } else {
        out.push(
          <Link
            key={key++}
            to={`/ear-training/scales-modes#mode-card-${modeId}`}
            className="text-fluent underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {display}
          </Link>,
        );
      }
    } else {
      out.push(<Fragment key={key++}>{display}</Fragment>);
    }

    remaining = rest;
  }

  return <>{out}</>;
}
