// Centralised module metadata. Every surface that needs to render a
// module — sidebar nav, Dashboard "Modules at a glance" preview,
// Skills Catalogue summary cards, module drill-ins — reads from this
// table so the visual language (order, icon, accent colour, name)
// stays consistent across the app.
//
// Sidebar groups still own the grouping structure (Overview /
// Structured Learning / Creative Sessions) — this list is the flat
// pedagogical ordering within the "structured learning" lane.

export type ModuleId =
  | 'harmonic-fluency'
  | 'ear-training'
  | 'intervals'
  | 'chord-recognition'
  | 'chord-progressions'
  | 'scales-modes'
  | 'shapes-and-patterns'
  | 'repertoire'
  | 'practice-sessions'
  | 'production';

/** Named inline-SVG icons for modules that need more semantic
 *  representation than a typographic glyph. Keep this list tiny —
 *  the glyph approach stays the default so new modules can be
 *  added without adding svg assets. */
export type NamedIcon = 'ear';

export interface ModuleMeta {
  id: ModuleId;
  label: string;
  route: string;
  /** Fallback single-glyph icon — used when `iconName` is absent.
   *  Typographic symbol (no emoji/image deps) so the look stays
   *  cohesive with the app's palette. */
  icon: string;
  /** Optional named SVG icon — takes precedence over `icon` at
   *  render time. See `<ModuleGlyph>` in SidebarNav for the
   *  concrete SVG. */
  iconName?: NamedIcon;
  /** Tailwind token for the accent colour used in cards / badges.
   *  Pairs with `accentHex` for inline SVG + background tinting. */
  accentToken: 'fluent' | 'developing' | 'needswork' | 'mastered' | 'amber' | 'rose' | 'violet' | 'teal';
  /** Hex value of the accent — for inline styles where the Tailwind
   *  class can't reach (radial gradients, svg fills). */
  accentHex: string;
  /** Status for nav rendering: 'live' modules have routes, 'planned'
   *  modules surface as placeholders. */
  status: 'live' | 'planned';
}

/**
 * Pedagogical order — theory → sound → body → song → session →
 * production. Anywhere the app renders "all modules" should consume
 * this list to keep ordering synchronised.
 */
export const MODULE_ORDER: ModuleMeta[] = [
  {
    id: 'harmonic-fluency',
    label: 'harmonic fluency',
    route: '/harmonic-fluency',
    icon: '♯',
    accentToken: 'fluent',
    accentHex: '#378ADD',
    status: 'live',
  },
  {
    id: 'ear-training',
    label: 'ear training',
    route: '/ear-training',
    icon: '♪',
    iconName: 'ear',
    accentToken: 'teal',
    accentHex: '#1D9E75',
    status: 'live',
  },
  {
    id: 'shapes-and-patterns',
    label: 'shapes & patterns',
    route: '/shapes-and-patterns',
    icon: '◇',
    accentToken: 'developing',
    accentHex: '#D08A2B',
    status: 'live',
  },
  {
    id: 'repertoire',
    label: 'song repertoire',
    route: '/repertoire',
    icon: '♫',
    accentToken: 'amber',
    accentHex: '#E3A54A',
    status: 'live',
  },
  {
    id: 'practice-sessions',
    label: 'practice sessions',
    route: '/practice-sessions',
    icon: '◐',
    accentToken: 'violet',
    accentHex: '#8B5CF6',
    status: 'planned',
  },
  {
    id: 'production',
    label: 'production & logic pro',
    route: '/production',
    icon: '▤',
    accentToken: 'rose',
    accentHex: '#C98478',
    status: 'live',
  },
];

/**
 * Ear Training groups four ear-quiz submodules into a single
 * pedagogical lane. Callers that aggregate ear-training data should
 * use this list; callers that link into a specific quiz use the
 * submodule metadata directly. All four inherit the ear icon +
 * teal accent so they read as siblings of the parent.
 */
export const EAR_TRAINING_SUBMODULES: ModuleMeta[] = [
  {
    id: 'intervals',
    label: 'intervals',
    route: '/ear-training/intervals',
    icon: '♪',
    iconName: 'ear',
    accentToken: 'teal',
    accentHex: '#1D9E75',
    status: 'live',
  },
  {
    id: 'chord-recognition',
    label: 'chord recognition',
    route: '/ear-training/chord-recognition',
    icon: '♪',
    iconName: 'ear',
    accentToken: 'teal',
    accentHex: '#1D9E75',
    status: 'live',
  },
  {
    id: 'chord-progressions',
    label: 'chord progressions',
    route: '/ear-training/chord-progressions',
    icon: '♪',
    iconName: 'ear',
    accentToken: 'teal',
    accentHex: '#1D9E75',
    status: 'live',
  },
  {
    id: 'scales-modes',
    label: 'scales & modes',
    route: '/ear-training/scales-modes',
    icon: '♪',
    iconName: 'ear',
    accentToken: 'teal',
    accentHex: '#1D9E75',
    status: 'live',
  },
];

// Lookup table — includes both top-level modules and the ear-training
// submodules so any call site can resolve a moduleId to its visual
// identity without having to know whether the id is a top-level
// module or a submodule.
const BY_ID = new Map<string, ModuleMeta>([
  ...MODULE_ORDER.map(m => [m.id, m] as const),
  ...EAR_TRAINING_SUBMODULES.map(m => [m.id, m] as const),
]);

export function moduleMetaById(id: string): ModuleMeta | undefined {
  return BY_ID.get(id);
}

/** Quick lookup: is this moduleId one of the four ear-training quizzes? */
export function isEarTrainingSubmodule(id: string): boolean {
  return EAR_TRAINING_SUBMODULES.some(m => m.id === id);
}
