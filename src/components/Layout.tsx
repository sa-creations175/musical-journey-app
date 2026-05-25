import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import SettingsPanel from './SettingsPanel';
import MobileBottomNav from './MobileBottomNav';
import SidebarNav from './SidebarNav';
import SyncIndicator from './SyncIndicator';
import BackupReminderBanner from './BackupReminderBanner';
import ReturnToCatalogueBanner from './ReturnToCatalogueBanner';
import PwaUpdateBanner from './PwaUpdateBanner';
import CreativeTimeModal from '../modules/creative/CreativeTimeModal';
import { cleanupRepertoireGoalContextIfNeeded } from '../modules/goals/cleanup';
import { getPref, setPref } from '../lib/userPrefs';
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
        <header className="relative z-40 border-b border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur px-6 md:px-10 py-3 flex items-center justify-end gap-3">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <SyncIndicator />
            <button
              onClick={() => setCreativeOpen(true)}
              aria-label="just play — log creative time"
              title="just play — log creative time"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-fluent/30 text-fluent hover:bg-fluent/10 hover:border-fluent text-xs font-medium transition-colors"
            >
              <span aria-hidden className="text-sm leading-none">♪✧</span>
              <span className="hidden sm:inline">just play</span>
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="settings"
              title="settings"
              className="w-8 h-8 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-fluent hover:border-fluent text-base leading-none"
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
