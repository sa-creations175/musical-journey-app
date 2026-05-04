import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  DASHBOARD_META,
  GOALS_META,
  MODULE_ORDER,
  PRACTICE_SESSIONS_META,
  CREATIVE_SESSIONS_ACCENT_HEX,
  type ModuleMeta,
} from '../lib/moduleMeta';
import ModuleGlyph from './ModuleGlyph';

/**
 * Mobile-only bottom tab bar — Goals · Dashboard · Practice · Modules.
 * Modules opens a bottom sheet (not a screen) listing all learning
 * modules + Skills Catalogue + Creative Sessions destinations. The
 * three direct tabs use NavLink for active-state highlighting; the
 * Modules tab highlights when the current path isn't on any of the
 * other three.
 *
 * Sidebar nav stays the source of truth at md+; this component is
 * `md:hidden`. Layout adds bottom padding to the main scroll area
 * so content isn't hidden under the fixed bar.
 */

interface DirectTab {
  meta: ModuleMeta;
  to: string;
  shortLabel: string;
  /** Returns true when the current pathname should activate this tab.
   *  Decision: Modules tab owns /skills-catalogue (decision 3 from
   *  the polish-sprint nav call), so Dashboard activates ONLY at /. */
  isActive: (pathname: string) => boolean;
}

const BOTTOM_TAB_META: DirectTab[] = [
  {
    meta: DASHBOARD_META,
    to: '/',
    shortLabel: 'dashboard',
    isActive: p => p === '/',
  },
  {
    meta: GOALS_META,
    to: '/goals',
    shortLabel: 'goals',
    isActive: p => p === '/goals' || p.startsWith('/goals/'),
  },
  {
    meta: PRACTICE_SESSIONS_META,
    to: '/practice-sessions',
    shortLabel: 'practice',
    isActive: p => p === '/practice-sessions' || p.startsWith('/practice-sessions/'),
  },
];

/** Modules-tab accent — reuses Harmonic Fluency's purple as a neutral
 *  "more / picker" color since Modules isn't a single module. */
const MODULES_ACCENT_HEX = '#7a5aa8';

const TAB_CLASS_BASE =
  'flex flex-col items-center justify-center pt-2 pb-1 gap-0.5 select-none transition-colors';
const TAB_CLASS_INACTIVE =
  'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200';

/** Active-state visuals — uses the module's accent for both text and
 *  a tinted background so the signal is unmistakable on a small target. */
function activeStyle(accentHex: string): React.CSSProperties {
  return {
    color: accentHex,
    backgroundColor: `${accentHex}14`, // ~8% alpha, matches SessionBlock tint
  };
}

export default function MobileBottomNav() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();
  const path = location.pathname;

  const directActiveIdx = BOTTOM_TAB_META.findIndex(t => t.isActive(path));
  const modulesActive = directActiveIdx === -1;

  return (
    <>
      <nav
        aria-label="primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-neutral-900/95 backdrop-blur border-t border-neutral-200 dark:border-neutral-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-4">
          {BOTTOM_TAB_META.map((tab, idx) => {
            const active = idx === directActiveIdx;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-label={tab.meta.label}
                aria-current={active ? 'page' : undefined}
                onClick={() => setSheetOpen(false)}
                className={`${TAB_CLASS_BASE} ${active ? '' : TAB_CLASS_INACTIVE}`}
                style={active ? activeStyle(tab.meta.accentHex) : undefined}
              >
                <ModuleGlyph meta={tab.meta} size={22} fontSize={12} />
                <span className="text-[10px] mt-0.5 leading-none">
                  {tab.shortLabel}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setSheetOpen(v => !v)}
            aria-expanded={sheetOpen}
            aria-controls="modules-sheet"
            aria-current={modulesActive ? 'page' : undefined}
            className={`${TAB_CLASS_BASE} ${modulesActive ? '' : TAB_CLASS_INACTIVE}`}
            style={modulesActive ? activeStyle(MODULES_ACCENT_HEX) : undefined}
          >
            <ModulesGlyph active={modulesActive} />
            <span className="text-[10px] mt-0.5 leading-none">modules</span>
          </button>
        </div>
      </nav>

      <ModulesSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

function ModulesGlyph({ active }: { active: boolean }) {
  // Three-dot stack — semantic "more" without leaning on a specific
  // module's icon. Color flips to the active hex when Modules owns
  // the current route.
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-md shrink-0"
      style={{
        width: 22,
        height: 22,
        backgroundColor: active ? `${MODULES_ACCENT_HEX}22` : 'transparent',
        border: active ? 'none' : '1px solid currentColor',
        color: active ? MODULES_ACCENT_HEX : undefined,
        fontSize: 12,
        lineHeight: 1,
      }}
    >
      ⋯
    </span>
  );
}

// ---------------------------------------------------------------------
// Modules bottom sheet — slides up over content; tap-through navigates
// and closes. Mirrors the InputQuestionnaire portal/overlay pattern so
// the surface is consistent with other bottom sheets in the app.
// ---------------------------------------------------------------------

interface SheetEntry {
  label: string;
  to: string;
  meta?: ModuleMeta;
  /** Inline accent for non-module entries (Skills Catalogue, Creative
   *  Sessions destinations) that don't carry a ModuleMeta. */
  accentHex?: string;
}

interface SheetGroup {
  id: string;
  label: string;
  accentHex?: string;
  entries: SheetEntry[];
}

function buildGroups(): SheetGroup[] {
  return [
    {
      id: 'tools',
      label: 'tools',
      entries: [
        {
          label: 'skills catalogue',
          to: '/skills-catalogue',
          accentHex: DASHBOARD_META.accentHex,
        },
      ],
    },
    {
      id: 'structured-learning',
      label: 'structured learning',
      entries: MODULE_ORDER.map(meta => ({
        label: meta.label,
        to: meta.route,
        meta,
      })),
    },
    {
      id: 'creative-sessions',
      label: 'creative sessions',
      accentHex: CREATIVE_SESSIONS_ACCENT_HEX,
      entries: [
        {
          label: 'harmonic diary',
          to: '/harmonic-diary',
          accentHex: CREATIVE_SESSIONS_ACCENT_HEX,
        },
        {
          label: 'session log',
          to: '/session-log',
          accentHex: CREATIVE_SESSIONS_ACCENT_HEX,
        },
      ],
    },
  ];
}

function ModulesSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  if (!open) return null;

  const groups = buildGroups();

  const handleSelect = (to: string) => {
    onClose();
    navigate(to);
  };

  return createPortal(
    <div
      id="modules-sheet"
      className="md:hidden fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="modules"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-neutral-900 w-full rounded-t-card border-t border-neutral-200 dark:border-neutral-800 shadow-xl flex flex-col max-h-[85vh] focus:outline-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <header className="shrink-0 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <h3 className="text-sm font-medium tracking-tight">modules</h3>
          <button
            onClick={onClose}
            aria-label="close"
            className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 text-xl leading-none -mt-1"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {groups.map(group => (
            <div key={group.id}>
              <div
                className="px-2 pb-1 text-[10px] uppercase tracking-wide font-medium"
                style={{ color: group.accentHex ?? undefined }}
              >
                <span
                  className={
                    group.accentHex
                      ? ''
                      : 'text-neutral-500 dark:text-neutral-400'
                  }
                >
                  {group.label}
                </span>
              </div>
              <ul className="flex flex-col gap-0.5">
                {group.entries.map(entry => (
                  <li key={entry.to}>
                    <button
                      type="button"
                      onClick={() => handleSelect(entry.to)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      {entry.meta ? (
                        <ModuleGlyph meta={entry.meta} size={22} fontSize={12} />
                      ) : (
                        <span
                          aria-hidden
                          className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md shrink-0 text-[11px] font-medium"
                          style={{
                            backgroundColor: entry.accentHex
                              ? `${entry.accentHex}22`
                              : undefined,
                            color: entry.accentHex,
                          }}
                        >
                          {entry.label.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span>{entry.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
