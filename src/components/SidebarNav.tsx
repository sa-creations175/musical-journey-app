import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getPref, setPref } from '../lib/userPrefs';
import { moduleMetaById, CREATIVE_SESSIONS_ACCENT_HEX } from '../lib/moduleMeta';
import ModuleGlyph from './ModuleGlyph';

/** Per-group accent colour used on the group header so Creative
 *  Sessions (gold) reads distinctly from the neutral learning groups. */
const GROUP_ACCENT: Record<string, string | undefined> = {
  'creative-sessions': CREATIVE_SESSIONS_ACCENT_HEX,
};

// Sidebar navigation tree. Organised into three top-level groups
// (Overview / Structured Learning / Creative Tools) each with its own
// collapse toggle. Within each group, modules with multiple
// sub-destinations get their own expand/collapse affordance; simple
// single-page modules remain plain links. Sub-item `to` is the full
// path including query string so the URL-sync hooks in each module
// can land the user on the right tab.

export interface NavSubItem {
  label: string;
  to: string;
}

export interface NavItem {
  id: string;
  label: string;
  to: string;
  /** Use `end: true` for items like "/" that otherwise match every
   *  route. */
  end?: boolean;
  children?: NavSubItem[];
  /** Nested children with their own disclosure (one level deep) —
   *  used by Ear Training → Chord Progressions tabs. */
  nestedChildren?: Array<{
    id: string;
    label: string;
    to: string;
    children?: NavSubItem[];
  }>;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const PREF_EXPANDED = 'sidebarExpandedGroups';

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'overview',
    items: [
      // Goals leads the Overview group: it's the meta-layer that
      // shapes everything the dashboard reflects.
      {
        id: 'goals',
        label: 'goals',
        to: '/goals',
      },
      // Skills Catalogue sits under Dashboard as a child — it's the
      // detail companion to the Dashboard's top-level summary.
      {
        id: 'dashboard',
        label: 'dashboard',
        to: '/',
        end: true,
        children: [
          { label: 'skills catalogue', to: '/skills-catalogue' },
        ],
      },
      // Practice Sessions is the action-layer companion to Goals —
      // Goals defines intent, Practice Sessions executes against it.
      // Phase 1 ships placeholder + manual logging; the session
      // generator + timer ship in later phases.
      {
        id: 'practice-sessions',
        label: 'practice sessions',
        to: '/practice-sessions',
      },
    ],
  },
  {
    id: 'structured-learning',
    label: 'structured learning',
    items: [
      {
        id: 'harmonic-fluency',
        label: 'harmonic fluency',
        to: '/harmonic-fluency',
        children: [
          { label: 'scale degree math',        to: '/harmonic-fluency?category=scale-degree-math' },
          { label: 'named notes',              to: '/harmonic-fluency?category=named-notes' },
          { label: 'diatonic chord qualities', to: '/harmonic-fluency?category=diatonic-qualities' },
          { label: 'functional harmony',       to: '/harmonic-fluency?category=functional-harmony' },
          { label: 'key signatures',           to: '/harmonic-fluency?category=key-signatures' },
          { label: 'reverse key pivots',       to: '/harmonic-fluency?category=reverse-key-pivots' },
          { label: 'modes',                    to: '/harmonic-fluency?category=modes' },
          { label: 'intervals',                to: '/harmonic-fluency?category=intervals' },
          { label: 'chord construction',       to: '/harmonic-fluency?category=chord-construction' },
          { label: 'progression vocabulary',   to: '/harmonic-fluency?category=progressions' },
          { label: 'slash chords',             to: '/harmonic-fluency?category=slash-chords' },
          { label: 'ear-theory crossover',     to: '/harmonic-fluency?category=ear-theory' },
          // Dual-homed: the diary is the emotional companion to
          // harmonic fluency's theoretical side, so it also lives
          // here as well as under Creative Sessions.
          { label: 'harmonic diary',           to: '/harmonic-diary' },
        ],
      },
      {
        id: 'ear-training',
        label: 'ear training',
        to: '/ear-training',
        nestedChildren: [
          { id: 'intervals',         label: 'intervals',         to: '/ear-training/intervals' },
          { id: 'chord-recognition', label: 'chord recognition', to: '/ear-training/chord-recognition' },
          {
            id: 'chord-progressions',
            label: 'chord progressions',
            to: '/ear-training/chord-progressions',
            children: [
              { label: 'key detection',     to: '/ear-training/chord-progressions?tab=key-detection' },
              { label: 'chord motion',      to: '/ear-training/chord-progressions?tab=chord-motion' },
              { label: 'full progression',  to: '/ear-training/chord-progressions?tab=full-progression' },
            ],
          },
          { id: 'chord-progression-quiz', label: 'progression quiz', to: '/ear-training/chord-progression-quiz' },
          { id: 'scales-modes',      label: 'scales & modes',    to: '/ear-training/scales-modes' },
        ],
      },
      // Pedagogical order: theory (Harmonic Fluency) → sound (Ear
      // Training) → body (Shapes & Patterns) → song (Repertoire) →
      // session → production. Shapes & Patterns moves AHEAD of Song
      // Repertoire so the "hands learn the vocabulary" step precedes
      // "hands apply the vocabulary to songs."
      {
        id: 'shapes-and-patterns',
        label: 'shapes & patterns',
        to: '/shapes-and-patterns',
        children: [
          { label: 'scale drills',        to: '/shapes-and-patterns?tab=scales' },
          { label: 'chord shape drills',  to: '/shapes-and-patterns?tab=chord-shapes' },
          { label: 'voice-leading drills',to: '/shapes-and-patterns?tab=voice-leading' },
          { label: 'mental visualisation',to: '/shapes-and-patterns?tab=mental-viz' },
        ],
      },
      {
        id: 'repertoire',
        label: 'song repertoire',
        to: '/repertoire',
        children: [
          { label: 'active repertoire', to: '/repertoire?tab=active' },
          { label: 'want to learn',     to: '/repertoire?tab=want-to-learn' },
        ],
      },
      {
        id: 'production',
        label: 'production',
        to: '/production',
        children: [
          { label: 'workflow foundations',     to: '/production?path=workflow-foundations' },
          { label: 'the language of production',to: '/production?path=language-of-production' },
          { label: 'vocal production',         to: '/production?path=vocal-production' },
          { label: 'genre productions',        to: '/production?path=genre-productions' },
          { label: 'arrangement',              to: '/production?path=arrangement' },
          { label: 'the business of music',    to: '/production?path=business' },
          { label: 'glossary',                 to: '/production?view=glossary' },
          { label: 'reference track library',  to: '/production?view=reference-tracks' },
        ],
      },
    ],
  },
  {
    id: 'creative-sessions',
    label: 'creative sessions',
    items: [
      { id: 'harmonic-diary', label: 'harmonic diary', to: '/harmonic-diary' },
      { id: 'session-log', label: 'session log', to: '/session-log' },
    ],
  },
];

/** All group ids — used to seed the default-open state so the first
 *  visit shows everything expanded. */
const ALL_GROUP_IDS = NAV_GROUPS.map(g => g.id);

/** Group-state keys use a `group:` prefix to avoid colliding with
 *  module-state keys in the same expansion map. */
const groupKey = (id: string) => `group:${id}`;

interface SidebarNavProps {
  /** When true, render the icon-only compact list. On phone the
   *  compact view is a horizontal strip across the top of the page
   *  (so the sidebar doesn't push main content down); on md+ it's a
   *  vertical icon column. When false, the full expanded tree
   *  renders at every size. */
  collapsed?: boolean;
}

export default function SidebarNav({ collapsed = false }: SidebarNavProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const location = useLocation();

  // Hydrate expansion state from prefs. Seed group defaults to open
  // on first visit — leaves module-level defaults collapsed (modules
  // toggled by the user preserve their stored state).
  useEffect(() => {
    (async () => {
      const stored = await getPref<Record<string, boolean>>(PREF_EXPANDED, {});
      const base: Record<string, boolean> = {};
      for (const gid of ALL_GROUP_IDS) base[groupKey(gid)] = true;
      setExpanded({ ...base, ...(stored && typeof stored === 'object' ? stored : {}) });
      setHydrated(true);
    })();
  }, []);

  // Persist whenever user toggles.
  useEffect(() => {
    if (!hydrated) return;
    void setPref(PREF_EXPANDED, expanded);
  }, [expanded, hydrated]);

  const toggle = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const currentPath = location.pathname + location.search;

  // Compact (icon-only) view rendered when collapsed at every size.
  // Phone uses a horizontal scroll strip across the top so main
  // content isn't pushed down; md+ uses a vertical icon column in
  // the narrow side rail.
  const compactClass = collapsed
    ? 'flex flex-row md:flex-col gap-1 px-2 pb-2 md:pb-4 overflow-x-auto md:overflow-x-visible'
    : 'hidden';
  const expandedClass = collapsed
    ? 'hidden'
    : 'px-2 pb-4 flex flex-col gap-2 md:gap-3 overflow-x-auto md:overflow-x-visible';

  return (
    <>
      <nav className={compactClass} aria-label="modules">
        {NAV_GROUPS.flatMap(g => g.items).map(item => (
          <CompactNavLink key={item.id} item={item} />
        ))}
      </nav>
      <nav className={expandedClass}>
        {NAV_GROUPS.map(group => {
          const gKey = groupKey(group.id);
          // Default open when hydrated value is missing (covers race
          // conditions before hydration completes).
          const isGroupOpen = expanded[gKey] !== false;
          return (
            <div key={group.id} className="flex flex-col">
              <GroupHeader
                label={group.label}
                open={isGroupOpen}
                onToggle={() => toggle(gKey)}
                accentHex={GROUP_ACCENT[group.id]}
              />
              {isGroupOpen && (
                // Indent the group's items + a subtle left-line so
                // children read clearly as "inside" the group header
                // rather than peers of it.
                <div className="flex flex-col gap-0.5 md:gap-1 mt-1 ml-2 pl-2 border-l border-neutral-200 dark:border-neutral-800">
                  {group.items.map(item => (
                    <NavItemRow
                      key={item.id}
                      item={item}
                      expanded={expanded}
                      onToggle={toggle}
                      currentPath={currentPath}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );
}

/**
 * Single icon-only nav button used in the collapsed sidebar. Sub-items
 * + group headers are dropped — clicking lands on the module's base
 * route. Native title attribute provides the label tooltip on hover.
 */
function CompactNavLink({ item }: { item: NavItem }) {
  const meta = moduleMetaById(item.id);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={item.label}
      aria-label={item.label}
      className={({ isActive }) =>
        `inline-flex shrink-0 items-center justify-center w-10 h-10 rounded-md transition ${
          isActive
            ? 'bg-fluent/10 text-fluent'
            : 'text-neutral-500 hover:text-fluent hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }`
      }
    >
      {meta ? (
        <ModuleGlyph meta={meta} size={22} fontSize={12} />
      ) : (
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md border border-current text-[11px] font-medium uppercase"
        >
          {item.label.charAt(0)}
        </span>
      )}
    </NavLink>
  );
}

// -------------------------------------------------------------------

function GroupHeader({
  label,
  open,
  onToggle,
  accentHex,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  accentHex?: string;
}) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="group flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wide font-medium rounded"
      style={{ color: accentHex ?? undefined }}
    >
      <svg
        width="8"
        height="8"
        viewBox="0 0 10 10"
        className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        aria-hidden
      >
        <path d="M3 1.5L7 5L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={accentHex ? '' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}>
        {label}
      </span>
    </button>
  );
}

// -------------------------------------------------------------------

interface RowProps {
  item: NavItem;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  currentPath: string;
}

function NavItemRow({ item, expanded, onToggle, currentPath }: RowProps) {
  const hasChildren = Boolean((item.children && item.children.length > 0) || (item.nestedChildren && item.nestedChildren.length > 0));
  const isOpen = hasChildren && expanded[item.id] === true;
  // Central module meta provides the icon + accent colour so the
  // sidebar's visual language matches the Skills Catalogue /
  // Dashboard "Modules at a glance" cards.
  const meta = moduleMetaById(item.id);

  // Simple module — just a NavLink.
  if (!hasChildren) {
    return (
      <NavLink
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          `px-3 py-2 rounded-lg text-sm whitespace-nowrap transition inline-flex items-center gap-2 ${
            isActive
              ? 'bg-fluent/10 text-fluent'
              : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`
        }
      >
        {meta && <ModuleIcon meta={meta} />}
        <span>{item.label}</span>
      </NavLink>
    );
  }

  // Module with children — caret toggles expansion; the label itself
  // still navigates to the module's base route.
  return (
    <div>
      <div className="flex items-center gap-0.5">
        <NavLink
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex-1 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition inline-flex items-center gap-2 ${
              isActive
                ? 'bg-fluent/10 text-fluent'
                : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`
          }
        >
          {meta && <ModuleIcon meta={meta} />}
          <span>{item.label}</span>
        </NavLink>
        <button
          onClick={() => onToggle(item.id)}
          aria-label={isOpen ? `collapse ${item.label}` : `expand ${item.label}`}
          aria-expanded={isOpen}
          className="w-6 h-7 shrink-0 rounded-md text-neutral-400 hover:text-fluent hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-center"
          title={isOpen ? 'collapse' : 'expand'}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
            aria-hidden
          >
            <path d="M3 1.5L7 5L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {isOpen && (
        <div className="ml-3 pl-2 mt-0.5 border-l border-neutral-200 dark:border-neutral-800 flex flex-col gap-0.5">
          {item.children?.map(sub => (
            <SubNavLink key={sub.to} to={sub.to} label={sub.label} currentPath={currentPath} />
          ))}
          {item.nestedChildren?.map(nested => (
            <NestedNavRow
              key={nested.id}
              nested={nested}
              expanded={expanded}
              onToggle={onToggle}
              currentPath={currentPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NestedNavRow({
  nested,
  expanded,
  onToggle,
  currentPath,
}: {
  nested: NonNullable<NavItem['nestedChildren']>[number];
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  currentPath: string;
}) {
  const hasChildren = Boolean(nested.children && nested.children.length > 0);
  const isOpen = hasChildren && expanded[nested.id] === true;

  if (!hasChildren) {
    return <SubNavLink to={nested.to} label={nested.label} currentPath={currentPath} />;
  }

  return (
    <div>
      <div className="flex items-center gap-0.5">
        <SubNavLink to={nested.to} label={nested.label} currentPath={currentPath} />
        <button
          onClick={() => onToggle(nested.id)}
          aria-label={isOpen ? `collapse ${nested.label}` : `expand ${nested.label}`}
          aria-expanded={isOpen}
          className="w-5 h-6 shrink-0 rounded text-neutral-400 hover:text-fluent flex items-center justify-center"
          title={isOpen ? 'collapse' : 'expand'}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 10 10"
            className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
            aria-hidden
          >
            <path d="M3 1.5L7 5L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {isOpen && (
        <div className="ml-2 pl-2 mt-0.5 border-l border-neutral-200 dark:border-neutral-800 flex flex-col gap-0.5">
          {nested.children!.map(leaf => (
            <SubNavLink key={leaf.to} to={leaf.to} label={leaf.label} currentPath={currentPath} currentPathCompare="equal" />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sub-nav leaf. Uses `currentPath` (pathname + search) to decide
 * active state since NavLink alone can't compare the search part.
 * `currentPathCompare` controls whether we match on exact path+search
 * ('equal') or just the pathname prefix ('prefix').
 */
function SubNavLink({
  to,
  label,
  currentPath,
  currentPathCompare = 'equal',
}: {
  to: string;
  label: string;
  currentPath: string;
  currentPathCompare?: 'equal' | 'prefix';
}) {
  const active = currentPathCompare === 'prefix'
    ? currentPath.startsWith(to.split('?')[0])
    : currentPath === to;
  return (
    <NavLink
      to={to}
      className={`flex-1 px-3 py-1.5 rounded-md text-[12px] whitespace-nowrap transition ${
        active
          ? 'bg-fluent/10 text-fluent'
          : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
      }`}
    >
      {label}
    </NavLink>
  );
}

/** Small rounded glyph rendered beside a module's label. Sidebar
 *  uses a compact 20px variant of the shared `ModuleGlyph`. */
function ModuleIcon({ meta }: { meta: NonNullable<ReturnType<typeof moduleMetaById>> }) {
  return <ModuleGlyph meta={meta} size={20} fontSize={11} />;
}
