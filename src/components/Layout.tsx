import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { taglineForPath, titleForPath } from '../lib/pageTitle';
import SettingsPanel from './SettingsPanel';
import MobileBottomNav from './MobileBottomNav';
import SidebarNav from './SidebarNav';
import SyncIndicator from './SyncIndicator';
import BackupReminderBanner from './BackupReminderBanner';
import ReturnToCatalogueBanner from './ReturnToCatalogueBanner';
import PwaUpdateBanner from './PwaUpdateBanner';
import CreativeTimeModal from '../modules/creative/CreativeTimeModal';
import {
  cleanupCarryoverGoalStartDatesIfNeeded,
  cleanupOrphanedWeeklyGoalsIfNeeded,
  cleanupRepertoireGoalContextIfNeeded,
} from '../modules/goals/cleanup';
import { getPref, setPref } from '../lib/userPrefs';
import { useDevMode } from '../lib/devMode';
import { useAutoPauseOnNavigation } from '../lib/sessionTimer/useAutoPauseOnNavigation';
import { useStartArmedSessionOnArrival } from '../lib/sessionTimer/useStartArmedSessionOnArrival';
import { GlobalSessionBanner } from '../lib/sessionTimer/GlobalSessionBanner';
import { HardPausePromptModal } from '../lib/sessionTimer/HardPausePromptModal';
import { BlockExpiryModal } from '../lib/sessionTimer/BlockExpiryModal';
import { BlockRatingOverlay } from '../lib/sessionTimer/BlockRatingOverlay';
import { ResumeSessionGate } from '../lib/sessionTimer/ResumeSessionGate';

const SIDEBAR_PREF = 'sidebarCollapsed';

export default function Layout() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creativeOpen, setCreativeOpen] = useState(false);
  // Dev Mode badge in the header — impossible to miss while practice
  // writes are being suppressed. Resets to off on refresh.
  const { devMode } = useDevMode();
  // Sidebar collapse only takes effect at md+ (CSS gates it via
  // md:w-* classes). The state is shared across all sizes so the
  // user's preference survives resize. Initial value defaults to
  // collapsed on md (768–1023px) and expanded at lg+; an explicit
  // user toggle (persisted to userPrefs) overrides the default.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !window.matchMedia('(min-width: 1024px)').matches;
  });

  useEffect(() => {
    let cancelled = false;
    void getPref<boolean | null>(SIDEBAR_PREF, null).then(stored => {
      if (cancelled || stored === null) return;
      setSidebarCollapsed(stored);
    });
    // One-shot legacy-data migration: relax repertoire goals tagged
    // 'keys' to null so the context filter doesn't drop them under
    // non-keys contexts. Also migrates any legacy 'mixed' contextTag
    // rows to null. Idempotent.
    void cleanupRepertoireGoalContextIfNeeded();
    // Remove weekly plan slices whose monthly parent was deleted —
    // dangling slices break confirmed-plan detection and re-planning
    // then duplicates the week's goals. Idempotent.
    void cleanupOrphanedWeeklyGoalsIfNeeded();
    // Re-anchor pre-fix carry-over goals (startDate=now) to their week
    // start so weeklyDerivation stops prorating their first week.
    // Idempotent.
    void cleanupCarryoverGoalStartDatesIfNeeded();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      void setPref(SIDEBAR_PREF, next);
      return next;
    });
  }, []);

  useAutoPauseOnNavigation();
  useStartArmedSessionOnArrival();

  const location = useLocation();
  const pageTitle = titleForPath(location.pathname);
  const pageTagline = taglineForPath(location.pathname);

  return (
    <div className="min-h-full flex flex-col">
    <GlobalSessionBanner />
    <div className="flex-1 flex flex-col md:flex-row">
      <aside
        className={`hidden md:block ${
          sidebarCollapsed ? 'md:w-14' : 'md:w-60'
        } md:min-h-screen md:border-r border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur transition-[width] duration-150`}
      >
        <div
          className={`flex items-center gap-2 ${
            sidebarCollapsed
              ? 'p-2 justify-end md:justify-center'
              : 'p-4 justify-between'
          }`}
        >
          <div className={sidebarCollapsed ? 'hidden' : ''}>
            <div className="text-sm font-medium tracking-tight text-fluent">musical journey</div>
            <div className="text-xs text-neutral-500 mt-0.5">practice companion</div>
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'expand sidebar' : 'collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? 'expand' : 'collapse'}
            className="inline-flex w-8 h-8 items-center justify-center rounded-md text-neutral-400 hover:text-fluent hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0"
          >
            {/* Hamburger on phone (compact bar at top) → chevron on md+
                where the sidebar is a vertical rail. CSS swap keeps a
                single button. */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              className="md:hidden"
              aria-hidden
            >
              <path
                d="M2 4h10M2 7h10M2 10h10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className={`hidden md:block transition-transform ${
                sidebarCollapsed ? '' : 'rotate-180'
              }`}
              aria-hidden
            >
              <path
                d="M3 1.5L7 5L3 8.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <SidebarNav collapsed={sidebarCollapsed} />
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        {/* Pinned app header. Sticky (not fixed) so it occupies space
            in the flow at its initial position and only "sticks" when
            the user scrolls past it — content stays visible, never
            hidden underneath. Background mirrors the dashboard hero
            band's #0f3d2e so the app reads as a single green-led
            brand surface from status bar down to page chrome.
            Safe-area-inset-top reserves the iPhone notch / status bar
            region in standalone PWA mode (viewport-fit=cover). */}
        <header
          className="sticky top-0 z-40 text-white px-4 sm:px-6 md:px-10 py-3 flex items-start justify-between gap-3"
          style={{
            backgroundColor: '#0f3d2e',
            paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))',
          }}
        >
          <div className="min-w-0">
            <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 leading-none">
              HARMONY
            </div>
            <div className="text-base sm:text-lg font-medium tracking-tight truncate mt-0.5">
              {pageTitle}
            </div>
            {pageTagline && (
              <div className="text-[11px] text-white/60 leading-snug mt-0.5 line-clamp-2">
                {pageTagline}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
            {devMode && (
              <span
                title="Dev Mode is on — practice data writes are suppressed"
                className="inline-flex items-center h-8 px-2 rounded-md bg-amber-400 text-amber-950 text-[11px] font-bold uppercase tracking-wider leading-none"
              >
                DEV
              </span>
            )}
            <SyncIndicator />
            <button
              onClick={() => setCreativeOpen(true)}
              aria-label="just play — log creative time"
              title="just play — log creative time"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-white/30 text-white hover:bg-white/10 hover:border-white/60 text-xs font-medium transition-colors"
            >
              <span aria-hidden className="text-sm leading-none">♪✧</span>
              <span className="hidden sm:inline">just play</span>
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="settings"
              title="settings"
              className="w-8 h-8 rounded-md border border-white/30 text-white hover:bg-white/10 hover:border-white/60 text-base leading-none"
            >
              ⚙
            </button>
          </div>
        </header>
        <BackupReminderBanner />
        <ReturnToCatalogueBanner />
        <main className="flex-1 px-4 py-6 md:p-10 pb-24 md:pb-10 max-w-5xl w-full">
          <Outlet />
        </main>
      </div>
    </div>
    <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    <CreativeTimeModal open={creativeOpen} onClose={() => setCreativeOpen(false)} />
    <HardPausePromptModal />
    <BlockExpiryModal />
    <BlockRatingOverlay />
    <ResumeSessionGate />
    <MobileBottomNav />
    <PwaUpdateBanner />
    </div>
  );
}
