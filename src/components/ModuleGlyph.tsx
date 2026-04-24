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
      {meta.iconName ? renderNamedIcon(meta.iconName, innerSize) : meta.icon}
    </span>
  );
}

/** Render the named SVG icons. All share the same stroke weight +
 *  geometry style so they read as a family across modules. */
function renderNamedIcon(name: NonNullable<ModuleMeta['iconName']>, size: number) {
  switch (name) {
    case 'ear':      return <EarSvg size={size} />;
    case 'brain':    return <BrainSvg size={size} />;
    case 'shapes':   return <ShapesSvg size={size} />;
    case 'song':     return <SongSvg size={size} />;
    case 'studio':   return <StudioSvg size={size} />;
    case 'calendar': return <CalendarSvg size={size} />;
  }
}

interface IconProps { size: number }

/** Shared SVG baseline — 24-unit grid, clean strokes at 1.8. Lets
 *  every icon read as part of the same family. */
const iconBase = {
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor' as const,
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Ear — pinna outline + antihelix curl + filled canal dot. */
function EarSvg({ size }: IconProps) {
  return (
    <svg width={size} height={size} {...iconBase}>
      <path d="M6 10a6 6 0 0 1 12 0c0 2.5-1 3.5-2.2 4.8-.9 1-1.4 1.9-1.4 3.2 0 1.4-1.1 2.5-2.5 2.5-1.1 0-2.3-.8-2.3-2.2" />
      <path d="M9.2 10a2.8 2.8 0 0 1 5.6 0c0 1.6-.9 2.3-1.8 3.2" />
      <circle cx="11.7" cy="11.4" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Brain — two hemispheres with a central groove, sulci hinted. */
function BrainSvg({ size }: IconProps) {
  return (
    <svg width={size} height={size} {...iconBase}>
      {/* Left hemisphere */}
      <path d="M12 5a3 3 0 0 0-3 3 3 3 0 0 0-2.5 3.3A3 3 0 0 0 4.5 14 3 3 0 0 0 6 17.5a3 3 0 0 0 3 2.5h3" />
      {/* Right hemisphere */}
      <path d="M12 5a3 3 0 0 1 3 3 3 3 0 0 1 2.5 3.3A3 3 0 0 1 19.5 14a3 3 0 0 1-1.5 3.5 3 3 0 0 1-3 2.5h-3" />
      {/* Central groove */}
      <path d="M12 5.2V20" />
      {/* Sulci hints */}
      <path d="M9 10.5h2M13 10.5h2M8 14.5h2.5M13.5 14.5h2.5" />
    </svg>
  );
}

/** Shapes — overlapping circle + square, reads as "physical forms". */
function ShapesSvg({ size }: IconProps) {
  return (
    <svg width={size} height={size} {...iconBase}>
      <circle cx="9.5" cy="13" r="4" />
      <rect x="11" y="5.5" width="8" height="8" rx="1" />
    </svg>
  );
}

/** Song — open book + musical note on its page. */
function SongSvg({ size }: IconProps) {
  return (
    <svg width={size} height={size} {...iconBase}>
      <path d="M4 6.5C6.5 5.5 9 5.5 11 7v13c-2-1.5-4.5-1.5-7-.5z" />
      <path d="M20 6.5c-2.5-1-5-1-7 .5v13c2-1.5 4.5-1.5 7-.5z" />
      <circle cx="15.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
      <path d="M16.7 13.7V9.2" />
    </svg>
  );
}

/** Studio — DAW-style mixer: slider tower with knob. */
function StudioSvg({ size }: IconProps) {
  return (
    <svg width={size} height={size} {...iconBase}>
      <path d="M6 4v16M12 4v16M18 4v16" />
      <circle cx="6" cy="9" r="1.5" fill="currentColor" />
      <circle cx="12" cy="15" r="1.5" fill="currentColor" />
      <circle cx="18" cy="11" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** Calendar — for Practice Sessions when it's built. */
function CalendarSvg({ size }: IconProps) {
  return (
    <svg width={size} height={size} {...iconBase}>
      <rect x="4" y="6" width="16" height="14" rx="1.5" />
      <path d="M4 10h16M8 4v4M16 4v4" />
      <circle cx="12" cy="14.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
