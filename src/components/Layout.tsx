import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import InstrumentSelector from './InstrumentSelector';
import MetronomeControl from './MetronomeControl';
import SettingsPanel from './SettingsPanel';
import SidebarNav from './SidebarNav';
import BackupReminderBanner from './BackupReminderBanner';
import CreativeTimeModal from '../modules/creative/CreativeTimeModal';

export default function Layout() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creativeOpen, setCreativeOpen] = useState(false);
  return (
    <div className="min-h-full flex flex-col md:flex-row">
      <aside className="md:w-60 md:min-h-screen border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur">
        <div className="p-4">
          <div className="text-sm font-medium tracking-tight text-fluent">musical journey</div>
          <div className="text-xs text-neutral-500 mt-0.5">practice companion</div>
        </div>
        <SidebarNav />
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur px-6 md:px-10 py-3 flex items-center justify-end gap-3">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <InstrumentSelector />
            <span className="text-neutral-300 dark:text-neutral-700">·</span>
            <MetronomeControl />
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
        <main className="flex-1 p-6 md:p-10 max-w-5xl w-full">
          <Outlet />
        </main>
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CreativeTimeModal open={creativeOpen} onClose={() => setCreativeOpen(false)} />
    </div>
  );
}
