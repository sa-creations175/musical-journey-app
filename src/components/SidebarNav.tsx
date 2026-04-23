import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getPref, setPref } from '../lib/userPrefs';

// Sidebar navigation tree. Modules that have multiple sub-destinations
// get an expand/collapse affordance; simple single-page modules remain
// plain links. Sub-item `to` is the full path including query string so
// the URL-sync hooks in each module can land the user on the right tab.
//
// If a module's sub-tree is still in flux (Practice Sessions, Production),
// mark `placeholder: true` on the parent — we still render it but
// without children until the build catches up.

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

const PREF_EXPANDED = 'sidebarExpandedGroups';

const NAV_TREE: NavItem[] = [
  { id: 'dashboard', label: 'dashboard', to: '/', end: true },
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
      { id: 'scales-modes',      label: 'scales & modes',    to: '/ear-training/scales-modes' },
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
    id: 'shapes-and-patterns',
    label: 'shapes & patterns',
    to: '/shapes-and-patterns',
    children: [
      { label: 'chord shape drills',  to: '/shapes-and-patterns?tab=chord-shapes' },
      { label: 'scale drills',        to: '/shapes-and-patterns?tab=scales' },
      { label: 'voice-leading drills',to: '/shapes-and-patterns?tab=voice-leading' },
      { label: 'mental visualisation',to: '/shapes-and-patterns?tab=mental-viz' },
    ],
  },
  { id: 'production', label: 'production', to: '/production' },
  { id: 'session-log', label: 'session log', to: '/session-log' },
];

export default function SidebarNav() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const location = useLocation();

  // Hydrate expansion state from prefs.
  useEffect(() => {
    (async () => {
      const stored = await getPref<Record<string, boolean>>(PREF_EXPANDED, {});
      setExpanded(stored && typeof stored === 'object' ? stored : {});
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

  return (
    <nav className="px-2 pb-4 flex flex-col gap-0.5 md:gap-1 overflow-x-auto md:overflow-x-visible">
      {NAV_TREE.map(item => (
        <NavItemRow
          key={item.id}
          item={item}
          expanded={expanded}
          onToggle={toggle}
          currentPath={location.pathname + location.search}
        />
      ))}
    </nav>
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

  // Simple module — just a NavLink.
  if (!hasChildren) {
    return (
      <NavLink
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          `px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${
            isActive
              ? 'bg-fluent/10 text-fluent'
              : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`
        }
      >
        {item.label}
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
            `flex-1 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${
              isActive
                ? 'bg-fluent/10 text-fluent'
                : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`
          }
        >
          {item.label}
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
