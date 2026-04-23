import type { ModuleMeta } from '../lib/moduleMeta';

interface Props {
  meta: ModuleMeta;
  /** Outer chip size in pixels (width + height). Default 28. */
  size?: number;
  /** Font size for the glyph fallback. Matches the surrounding
   *  chip scale when tweaked for a dense row. */
  fontSize?: number;
  className?: string;
}

/**
 * Single source of truth for rendering a module's sidebar-style icon
 * chip. Uses the module's named SVG icon when present (`iconName`),
 * otherwise falls back to the typographic glyph. The chip background
 * tints to the module's accent so the visual identity is consistent
 * whether it appears in the sidebar, a Dashboard card, or a Skills
 * Catalogue row.
 */
export default function ModuleGlyph({ meta, size = 28, fontSize = 14, className }: Props) {
  const innerSize = Math.round(size * 0.6);
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-md shrink-0 ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        backgroundColor: `${meta.accentHex}22`,
        color: meta.accentHex,
        fontSize,
        lineHeight: 1,
      }}
    >
      {meta.iconName === 'ear' ? (
        <EarSvg size={innerSize} />
      ) : (
        meta.icon
      )}
    </span>
  );
}

/**
 * Simple ear icon. Outer helix traces the pinna; inner curl is the
 * antihelix; small dot marks the canal. Optimised to read at small
 * sizes (12–20px) inside a coloured chip.
 */
function EarSvg({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Pinna — outer ear */}
      <path d="M6 10a6 6 0 0 1 12 0c0 2.5-1 3.5-2.2 4.8-.9 1-1.4 1.9-1.4 3.2 0 1.4-1.1 2.5-2.5 2.5-1.1 0-2.3-.8-2.3-2.2" />
      {/* Antihelix — inner curve */}
      <path d="M9.2 10a2.8 2.8 0 0 1 5.6 0c0 1.6-.9 2.3-1.8 3.2" />
      {/* Canal */}
      <circle cx="11.7" cy="11.4" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
