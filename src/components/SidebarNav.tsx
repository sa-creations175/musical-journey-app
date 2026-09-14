import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getPref, setPref } from '../lib/userPrefs';
import { MODULE_NAME_CASE, titleCase } from '../lib/labelCase';
import { isLearningModule, moduleMetaById, CREATIVE_SESSIONS_ACCENT_HEX } from '../lib/moduleMeta';
import ModuleGlyph from './ModuleGlyph';
import { MODULE_HOME_STATE } from '../lib/useEndOnModuleHome';
import type { NavLabel, NavRowKind } from '../lib/sidebarWidth';
import { READING_SKILL_LABELS, READING_SKILL_ORDER } from '../modules/reading/homeCards';
import { readingSkillPath } from '../modules/reading/skillRoutes';

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
      // Dashboard leads the Overview group — it is where the app opens,
      // and the nav reads in the order the app is used.
      //
      // Skills Catalogue sits under it as a child: the detail companion
      // to the Dashboard's top-level summary.
      {
        id: 'dashboard',
        label: 'dashboard',
        to: '/',
        end: true,
        children: [
          { label: 'skills catalogue', to: '/skills-catalogue' },
        ],
      },
      // Goals is the meta-layer that shapes what the dashboard
      // reflects, and reads after it.
      {
        id: 'goals',
        label: 'goals',
        to: '/goals',
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
          { label: 'scale degree math',        to: '/harmonic-fluency/scale-degree-math' },
          { label: 'degrees and notes',        to: '/harmonic-fluency/degree-notes' },
          { label: 'diatonic chord qualities', to: '/harmonic-fluency/diatonic-qualities' },
          { label: 'functional harmony',       to: '/harmonic-fluency/functional-harmony' },
          { label: 'key signatures',           to: '/harmonic-fluency/key-signatures' },
          { label: 'scales and modes',         to: '/harmonic-fluency/modes' },
          { label: 'intervals',                to: '/harmonic-fluency/intervals' },
          { label: 'chord construction',       to: '/harmonic-fluency/chord-construction' },
          { label: 'progression vocabulary',   to: '/harmonic-fluency/progressions' },
          { label: 'slash chords',             to: '/harmonic-fluency/slash-chords' },
          // NO HARMONIC DIARY HERE. It was dual-homed — listed under
          // harmonic fluency as well as under Creative Sessions — and
          // one page in two places in one nav makes the reader work out
          // whether they are two pages. It keeps its home under
          // Creative Sessions, where it is not deleted, only single.
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
      // Pedagogical order: theory (Harmonic Fluency) → sound (Ear
      // Training) → body (Shapes & Patterns) → song (Repertoire) →
      // session → production. Shapes & Patterns moves AHEAD of Song
      // Repertoire so the "hands learn the vocabulary" step precedes
      // "hands apply the vocabulary to songs."
      {
        id: 'reading',
        label: 'reading',
        to: '/reading',
        // The four skills its module home already leads with. Reading
        // was the one module whose sections could not be reached from
        // the nav at all, because it had no expand control.
        //
        // DERIVED, NOT RETYPED. These were four literals that happened
        // to match the module's own labels, and "happened to match" is
        // how the nav ends up calling a skill something the page it
        // opens does not. Both the word and the address now come from
        // Reading's own tables.
        children: READING_SKILL_ORDER.map(skill => ({
          label: READING_SKILL_LABELS[skill],
          to: readingSkillPath(skill),
        })),
      },
      {
        id: 'shapes-and-patterns',
        label: 'shapes & patterns',
        to: '/shapes-and-patterns',
        children: [
          { label: 'scale drills',        to: '/shapes-and-patterns/scales' },
          { label: 'chord shape drills',  to: '/shapes-and-patterns/chord-shapes' },
          // ONE ENTRY, NOT TWO (ruling 19). The voice-leading page IS
          // the movements page; there was never anything to nest.
          { label: 'chord movements & passes', to: '/shapes-and-patterns/movements' },
          { label: 'mental visualisation',to: '/shapes-and-patterns/mental-viz' },
        ],
      },
      {
        id: 'repertoire',
        label: 'song repertoire',
        to: '/repertoire',
        children: [
          { label: 'active repertoire', to: '/repertoire?tab=active' },
          { label: 'want to learn',     to: '/repertoire?tab=want-to-learn' },
          // PROGRESSION QUIZ LISTS HERE, NOT UNDER EAR TRAINING. It
          // drills the progressions from THIS repertoire — the charts
          // on these songs are where its cards come from — so this is
          // the module it belongs to.
          //
          // The route is unchanged. Where a page lives in the nav and
          // where it lives in the URL are different questions, and
          // moving the second would break every link that already
          // points at it.
          { label: 'progression quiz',  to: '/ear-training/chord-progression-quiz' },
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

/**
 * Every word the sidebar draws, with the row it sits on.
 *
 * =====================================================================
 * THE THRESHOLD FOR SHOWING LABELS IS COMPUTED FROM THIS.
 *
 * The sidebar goes to the rail at any width where a word would be cut,
 * and the only way to know that width is to know the words. Derived
 * from `NAV_GROUPS` rather than listed, so renaming a module or adding
 * one carries the threshold with it — a longer name tomorrow makes the
 * sidebar collapse a little earlier instead of starting to chop.
 *
 * THE KIND MATTERS AS MUCH AS THE TEXT. A module name is drawn in caps
 * at 14px beside an icon; a sub-item is Title Case at 12px, indented
 * twice, with no icon. Same number of characters, different width and
 * different room to put it in — see `ROW_METRICS`.
 * =====================================================================
 */
export const NAV_LABELS: ReadonlyArray<NavLabel> = NAV_GROUPS.flatMap(group => [
  { text: group.label, kind: 'group' as const },
  ...group.items.flatMap(item => [
    // `isLearningModule` is what decides caps on screen, so it decides
    // which width model applies here — see the row's own className.
    { text: item.label, kind: (isLearningModule(item.id) ? 'module' : 'plain-module') as NavRowKind },
    ...(item.children ?? []).map(child => ({ text: child.label, kind: 'sub' as const })),
    ...(item.nestedChildren ?? []).flatMap(nested => [
      { text: nested.label, kind: 'sub' as const },
      ...(nested.children ?? []).map(leaf => ({ text: leaf.label, kind: 'nested' as const })),
    ]),
  ]),
]);

/** All group ids — used to seed the default-open state so the first
 *  visit shows everything expanded. */
const ALL_GROUP_IDS = NAV_GROUPS.map(g => g.id);

/** Group-state keys use a `group:` prefix to avoid colliding with
 *  module-state keys in the same expansion map. */
const groupKey = (id: string) => `group:${id}`;

/**
 * =====================================================================
 * FOLDING EVERY OPEN MODULE AT ONCE.
 *
 * Six modules in Structured Learning, each opening into a list of its
 * own, and closing them was one press per module. This is the one
 * press for all of them.
 *
 * IT FOLDS MODULES, NOT GROUPS. A group header is the section the
 * modules live in — Overview is forced open on every load already —
 * and folding those would empty the nav rather than tidy it.
 *
 * DERIVED FROM `NAV_GROUPS`, NEVER LISTED. A hand-written list of
 * expandable ids is a list that silently stops covering the module
 * added after it.
 * =====================================================================
 */
function collapsibleIds(): string[] {
  const out: string[] = [];
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const nested = item.nestedChildren ?? [];
      if ((item.children?.length ?? 0) > 0 || nested.length > 0) out.push(item.id);
      // One level deeper — Ear Training's Chord Progressions has its
      // own disclosure and its own key in the same expansion map.
      for (const n of nested) {
        if ((n.children?.length ?? 0) > 0) out.push(n.id);
      }
    }
  }
  return out;
}

const COLLAPSIBLE_IDS = collapsibleIds();

/**
 * =====================================================================
 * THE MODULE YOU ARE INSIDE FOLDS WITH THE REST — a judgement call,
 * and this is the reasoning, because the other answer is defensible.
 *
 * The case for exempting it: the nav is the one thing on screen that
 * says where you are, and folding the module you are standing in hides
 * the sibling pages you are navigating by.
 *
 * It loses on three counts.
 *
 *   1. WHERE YOU ARE IS NOT LOST. The module's own row keeps its
 *      active fill whether it is open or shut, so the nav still says
 *      where you are; what folds is its list, one press from back.
 *   2. PRESSING A MODULE NAME NAVIGATES AS WELL AS EXPANDS — see
 *      `NavItemRow`. So the module you are inside is normally the LAST
 *      one you opened, and an exemption would most often leave open
 *      exactly the one the reader had just asked to fold.
 *   3. A control called "Collapse all" that leaves one open reads as
 *      broken, and the reason it left that one open is invisible.
 *
 * To reverse it, filter `foldable` by the ids on `location.pathname`.
 * =====================================================================
 */

/**
 * UNAPPROVED COPY. Silas's own words for the control, taken from the
 * request that asked for it; it has never been ruled on. Listed in the
 * report — see docs/WHOLE_SONG_TEST_COPY.md for where approved strings
 * live, and this is not in it yet.
 */
export const COLLAPSE_ALL_LABEL = 'Collapse all';

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
  //
  // OVERVIEW is forced open on every load (its stored collapse, if any,
  // is overridden): it's the primary section (Goals / Dashboard /
  // Practice Sessions) and should always be immediately visible without
  // an extra tap. A stale collapsed pref from a prior session would
  // otherwise hide it on first paint.
  useEffect(() => {
    (async () => {
      const stored = await getPref<Record<string, boolean>>(PREF_EXPANDED, {});
      const base: Record<string, boolean> = {};
      for (const gid of ALL_GROUP_IDS) base[groupKey(gid)] = true;
      setExpanded({
        ...base,
        ...(stored && typeof stored === 'object' ? stored : {}),
        [groupKey('overview')]: true,
      });
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

  // What one press would fold. Empty means the control has nothing to
  // do, and it is not drawn — the same call `AxisViewToggle` makes when
  // an axis has one ordering.
  const foldable = COLLAPSIBLE_IDS.filter(id => expanded[id] === true);

  const collapseAll = () => {
    setExpanded(prev => {
      const next = { ...prev };
      for (const id of foldable) next[id] = false;
      return next;
    });
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
        {/* NAV-LEVEL, ABOVE THE GROUPS, because it acts on all of them.
            Put inside Structured Learning it would read as that
            group's own control and leave the reader looking for a
            second one. */}
        {foldable.length > 0 && (
          <div className="flex justify-end -mb-1">
            <button
              type="button"
              onClick={collapseAll}
              data-testid="nav-collapse-all"
              className="px-2 py-1 rounded text-[10px] uppercase tracking-wide text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              {COLLAPSE_ALL_LABEL}
            </button>
          </div>
        )}
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
                  {group.items.map((item, i) => (
                    <NavItemRow
                      key={item.id}
                      item={item}
                      expanded={expanded}
                      onToggle={toggle}
                      currentPath={currentPath}
                      ruled={group.id === 'structured-learning' && i > 0}
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
      state={MODULE_HOME_STATE}
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
  /**
   * Draw a rule above this row.
   *
   * Structured Learning holds six modules, each of which opens into a
   * list of its own, and at rest they read as one undifferentiated
   * column. The rule says where one module ends and the next begins.
   *
   * A RULE RATHER THAN A TINT. The other candidate was a wash of each
   * module's own accent behind its row, and it loses twice: the accent
   * is already on the icon, so a second copy behind the words competes
   * with it; and the wash lands at the same weight as `bg-fluent/10`,
   * which is how an ACTIVE row is drawn — so the row you are on stops
   * being the one that looks different. Reading, Shapes & Patterns and
   * Song Repertoire also tint to nearly the same warm beige at that
   * opacity, which separates less than a line does anyway.
   */
  ruled?: boolean;
}

function NavItemRow({ item, expanded, onToggle, currentPath, ruled = false }: RowProps) {
  const hasChildren = Boolean((item.children && item.children.length > 0) || (item.nestedChildren && item.nestedChildren.length > 0));
  const isOpen = hasChildren && expanded[item.id] === true;
  // Central module meta provides the icon + accent colour so the
  // sidebar's visual language matches the Skills Catalogue /
  // Dashboard "Modules at a glance" cards.
  const meta = moduleMetaById(item.id);

  // Sits ABOVE the row, so the first module in the group has none and
  // the group header keeps its own spacing.
  const rule = ruled
    ? 'border-t border-neutral-200/70 dark:border-neutral-800/70 pt-1 mt-0.5'
    : '';

  // Simple module — just a NavLink.
  if (!hasChildren) {
    return (
      <NavLink
        to={item.to}
        end={item.end}
        state={MODULE_HOME_STATE}
        className={({ isActive }) =>
          `px-3 py-2 rounded-lg text-sm transition inline-flex items-center gap-2 min-w-0 ${rule} ${
            isActive
              ? 'bg-fluent/10 text-fluent'
              : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`
        }
      >
        {meta && <ModuleIcon meta={meta} />}
        {/* A MODULE SHOUTS; EVERYTHING ELSE IS TITLE CASE.
            `isLearningModule`, not `meta` — Dashboard, Goals and
            Practice Sessions all have meta so they can carry an icon,
            and they are top-level items, not modules. */}
        <span className={isLearningModule(item.id) ? MODULE_NAME_CASE : undefined}>
          {isLearningModule(item.id) ? item.label : titleCase(item.label)}
        </span>
      </NavLink>
    );
  }

  // Module with children — PRESSING THE NAME toggles the group, and
  // still navigates to the module's base route. The name was the
  // obvious place to press and did not open anything; the mark beside
  // it was a separate button for what reads as one action.
  return (
    <div className={rule}>
      <div className="flex items-center gap-0.5">
        <NavLink
          to={item.to}
          end={item.end}
          /* THE NAME MEANS "TAKE ME TO THE MODULE HOME", and says so.
             A module home that is mid-drill reads this and ends the
             run — see `useEndOnModuleHome`. It has to be carried
             rather than inferred, because a link to the URL already on
             screen is a replace and there is no route change to
             notice. */
          state={MODULE_HOME_STATE}
          onClick={() => onToggle(item.id)}
          aria-expanded={isOpen}
          data-testid="module-nav-name"
          data-module={item.id}
          className={({ isActive }) =>
            `flex-1 min-w-0 px-3 py-2 rounded-lg text-sm transition inline-flex items-center gap-2 ${
              isActive
                ? 'bg-fluent/10 text-fluent'
                : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`
          }
        >
          {meta && <ModuleIcon meta={meta} />}
          <span className={isLearningModule(item.id) ? MODULE_NAME_CASE : undefined}>
            {isLearningModule(item.id) ? item.label : titleCase(item.label)}
            <DisclosureMark open={isOpen} size={8} />
          </span>
        </NavLink>
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


/**
 * The disclosure mark, sitting with the label rather than beside it.
 *
 * =====================================================================
 * PART OF THE WORD, NOT A CONTROL OF ITS OWN.
 *
 * It used to be a right-aligned button at the row's far edge, which
 * formed a ragged column down the sidebar and read as a separate thing
 * to press. It is inline after the label's last word now, with a small
 * fixed gap — so when a label wraps, it follows the last word onto the
 * second line, because it IS in the text flow rather than positioned
 * against the box.
 *
 * LIGHTER AND SMALLER than the label. It says "this opens"; it should
 * not compete with the word that says what opens.
 *
 * NOT A BUTTON ANY MORE. Pressing the name toggles the group, so the
 * mark sits inside that control — and a button inside a link is
 * invalid markup, which is how a tap meant for one lands on the other.
 * =====================================================================
 */
function DisclosureMark({ open, size }: { open: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      aria-hidden
      className={`inline-block shrink-0 ml-1 text-neutral-400/70 transition-transform ${
        open ? 'rotate-90' : ''
      }`}
    >
      <path d="M3 1.5L7 5L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
        <SubNavLink
          to={nested.to}
          label={nested.label}
          currentPath={currentPath}
          onPress={() => onToggle(nested.id)}
          disclosureOpen={isOpen}
        />
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
 *
 * A LINK WITH NO SEARCH PART COMPARES PATHNAMES ONLY, and that follows
 * from the link rather than from a flag anyone has to remember. The
 * category and skill sub-items are plain paths now, and the page they
 * land on writes `?also=` as the reader lights chips — compared against
 * path+search, the item for the page you are looking at would go dark
 * the moment you lit a second category.
 */
function SubNavLink({
  to,
  label,
  currentPath,
  currentPathCompare = 'equal',
  onPress,
  disclosureOpen,
}: {
  to: string;
  label: string;
  currentPath: string;
  currentPathCompare?: 'equal' | 'prefix';
  /** Set on a row that has children — pressing the word opens them. */
  onPress?: () => void;
  /** Present on a row with children; drives the mark after the label. */
  disclosureOpen?: boolean;
}) {
  const active = currentPathCompare === 'prefix'
    ? currentPath.startsWith(to.split('?')[0])
    : to.includes('?')
      ? currentPath === to
      : currentPath.split('?')[0] === to;
  return (
    <NavLink
      to={to}
      {...(onPress !== undefined ? { onClick: onPress } : {})}
      {...(disclosureOpen !== undefined ? { 'aria-expanded': disclosureOpen } : {})}
      className={`flex-1 min-w-0 px-3 py-1.5 rounded-md text-[12px] transition ${
        active
          ? 'bg-fluent/10 text-fluent'
          : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
      }`}
    >
      {/* Nested under a module — Title Case, computed from the
          canonical label rather than typed a second time. */}
      {titleCase(label)}
      {disclosureOpen !== undefined && <DisclosureMark open={disclosureOpen} size={7} />}
    </NavLink>
  );
}

/** Small rounded glyph rendered beside a module's label. Sidebar
 *  uses a compact 20px variant of the shared `ModuleGlyph`. */
function ModuleIcon({ meta }: { meta: NonNullable<ReturnType<typeof moduleMetaById>> }) {
  return <ModuleGlyph meta={meta} size={20} fontSize={11} />;
}
