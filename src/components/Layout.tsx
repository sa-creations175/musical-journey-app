import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import InstrumentSelector from './InstrumentSelector';
import SettingsPanel from './SettingsPanel';
import BackupReminderBanner from './BackupReminderBanner';

const links = [
  { to: '/', label: 'dashboard', end: true },
  { to: '/ear-training', label: 'ear training' },
  { to: '/chords-shapes', label: 'chords & shapes' },
  { to: '/repertoire', label: 'repertoire' },
  { to: '/production', label: 'production' },
  { to: '/session-log', label: 'session log' },
];

export default function Layout() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="min-h-full flex flex-col md:flex-row">
      <aside className="md:w-56 md:min-h-screen border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur">
        <div className="p-4">
          <div className="text-sm font-medium tracking-tight text-fluent">musical journey</div>
          <div className="text-xs text-neutral-500 mt-0.5">practice companion</div>
        </div>
        <nav className="px-2 pb-4 flex md:flex-col gap-1 overflow-x-auto">
          {links.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${
                  isActive
                    ? 'bg-fluent/10 text-fluent'
                    : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur px-6 md:px-10 py-3 flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500">instrument</span>
          <div className="flex items-center gap-2">
            <InstrumentSelector />
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
    </div>
  );
}
