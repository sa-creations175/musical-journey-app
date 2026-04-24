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
  | 'dashboard'
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
export type NamedIcon = 'ear' | 'brain' | 'shapes' | 'song' | 'studio' | 'calendar';

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
  /** Legacy Tailwind token — kept for the small number of places
   *  that still reach for it. New surfaces should use the hex + its
   *  derived light/dark variants instead. */
  accentToken: 'fluent' | 'developing' | 'needswork' | 'mastered' | 'amber' | 'rose' | 'violet' | 'teal';
  /** Canonical hex for the module's accent colour. Used directly
   *  in sidebar, cards, module headers, catalogue chips. */
  accentHex: string;
  /** Status for nav rendering: 'live' modules have routes, 'planned'
   *  modules surface as placeholders. */
  status: 'live' | 'planned';
}

/**
 * Pedagogical order — theory → sound → body → song → session →
 * production. Anywhere the app renders "all modules" should consume
 * this list to keep ordering synchronised.
 *
 * Palette (per latest design pass):
 *   Dashboard          #4a6b8a (warm slate blue)
 *   Harmonic Fluency   #7a5aa8 (deep purple)
 *   Ear Training       #5a8752 (forest green)
 *   Shapes & Patterns  #d4885a (warm amber)
 *   Song Repertoire    #a8556b (deep rose)
 *   Practice Sessions  #4a9088 (teal)
 *   Production         #3a4875 (deep indigo)
 */
export const MODULE_ORDER: ModuleMeta[] = [
  {
    id: 'harmonic-fluency',
    label: 'harmonic fluency',
    route: '/harmonic-fluency',
    icon: '♯',
    iconName: 'brain',
    accentToken: 'violet',
    accentHex: '#7a5aa8',
    status: 'live',
  },
  {
    id: 'ear-training',
    label: 'ear training',
    route: '/ear-training',
    icon: '♪',
    iconName: 'ear',
    accentToken: 'teal',
    accentHex: '#5a8752',
    status: 'live',
  },
  {
    id: 'shapes-and-patterns',
    label: 'shapes & patterns',
    route: '/shapes-and-patterns',
    icon: '◇',
    iconName: 'shapes',
    accentToken: 'amber',
    accentHex: '#d4885a',
    status: 'live',
  },
  {
    id: 'repertoire',
    label: 'song repertoire',
    route: '/repertoire',
    icon: '♫',
    iconName: 'song',
    accentToken: 'rose',
    accentHex: '#a8556b',
    status: 'live',
  },
  {
    id: 'practice-sessions',
    label: 'practice sessions',
    route: '/practice-sessions',
    icon: '◐',
    iconName: 'calendar',
    accentToken: 'teal',
    accentHex: '#4a9088',
    status: 'planned',
  },
  {
    id: 'production',
    label: 'production & logic pro',
    route: '/production',
    icon: '▤',
    iconName: 'studio',
    accentToken: 'fluent',
    accentHex: '#3a4875',
    status: 'live',
  },
];

/**
 * Dashboard sits outside `MODULE_ORDER` (it isn't a learning module
 * in the Catalogue sense) but it still needs visual identity in the
 * sidebar. Exposed as its own meta so the sidebar can render an icon
 * chip without branching.
 */
export const DASHBOARD_META: ModuleMeta = {
  id: 'dashboard',
  label: 'dashboard',
  route: '/',
  icon: '◉',
  accentToken: 'fluent',
  accentHex: '#4a6b8a',
  status: 'live',
};

/**
 * Accent for the "Creative Sessions" sidebar group (Just Play, Just
 * Produce, Harmonic Diary). Not a module — a nav group — so it
 * doesn't live in MODULE_ORDER, but sharing the export keeps the
 * palette in one place.
 */
export const CREATIVE_SESSIONS_ACCENT_HEX = '#c4a05a';

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
    accentHex: '#5a8752',
    status: 'live',
  },
  {
    id: 'chord-recognition',
    label: 'chord recognition',
    route: '/ear-training/chord-recognition',
    icon: '♪',
    iconName: 'ear',
    accentToken: 'teal',
    accentHex: '#5a8752',
    status: 'live',
  },
  {
    id: 'chord-progressions',
    label: 'chord progressions',
    route: '/ear-training/chord-progressions',
    icon: '♪',
    iconName: 'ear',
    accentToken: 'teal',
    accentHex: '#5a8752',
    status: 'live',
  },
  {
    id: 'scales-modes',
    label: 'scales & modes',
    route: '/ear-training/scales-modes',
    icon: '♪',
    iconName: 'ear',
    accentToken: 'teal',
    accentHex: '#5a8752',
    status: 'live',
  },
];

// Lookup table — includes Dashboard + top-level modules + the
// ear-training submodules so any call site can resolve a moduleId
// to its visual identity without having to know whether the id is
// a top-level module, a submodule, or the Dashboard.
const BY_ID = new Map<string, ModuleMeta>([
  [DASHBOARD_META.id, DASHBOARD_META],
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
