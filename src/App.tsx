// Future feature ideas live in /ROADMAP.md at the project root.
import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './modules/dashboard/Dashboard';
import HarmonicFluency from './modules/harmonic-fluency/HarmonicFluency';
import HarmonicFluencyCalendar from './modules/harmonic-fluency/HarmonicFluencyCalendar';
import EarTraining from './modules/ear-training/EarTraining';
import Intervals from './modules/ear-training/intervals/Intervals';
import IntervalsCalendar from './modules/ear-training/intervals/IntervalsCalendar';
import ChordRecognition from './modules/ear-training/chord-recognition/ChordRecognition';
import ChordRecognitionCalendar from './modules/ear-training/chord-recognition/ChordRecognitionCalendar';
import ChordProgressions from './modules/ear-training/chord-progressions/ChordProgressions';
import ChordProgressionsCalendar from './modules/ear-training/chord-progressions/ChordProgressionsCalendar';
import ChordProgressionQuiz from './modules/ear-training/chord-progression-quiz/ChordProgressionQuiz';
import ScalesModes from './modules/ear-training/scales-modes/ScalesModes';
import ScalesModesCalendar from './modules/ear-training/scales-modes/ScalesModesCalendar';
import Repertoire from './modules/repertoire/Repertoire';
import SongPracticeCalendar from './modules/repertoire/SongPracticeCalendar';
import ShapesAndPatterns from './modules/shapes-and-patterns/ShapesAndPatterns';
import ShapesAndPatternsCalendar from './modules/shapes-and-patterns/ShapesAndPatternsCalendar';
import Production from './modules/production/Production';
import SessionLog from './modules/session-log/SessionLog';
import SkillsCatalogue from './modules/skills/SkillsCatalogue';
import HarmonicDiary from './modules/harmonic-diary/HarmonicDiary';

// LAZY — the app's first code-split routes. VexFlow plus one music
// font is ~1 MB, so neither Reading surface may ride in the initial
// bundle. See ReadingStaff.tsx for why the bravura subpath is used.
// Reading is no longer dev-only (the drills landed in step 4), so the
// lazy boundary now carries real weight rather than merely deferring
// a page nobody could reach.
const Reading = lazy(() => import('./modules/reading/Reading'));
const ReadingPreview = lazy(() => import('./modules/reading/ReadingPreview'));
import DashboardScreen from './modules/dashboard/DashboardScreen';
import Goals from './modules/goals/Goals';
import PracticeSessions from './modules/practice/PracticeSessions';
import ActiveSessionScreen from './modules/practice/ActiveSessionScreen';
import { InstrumentProvider } from './lib/instrumentContext';
import { Toaster } from './components/Toaster';
import RedirectPreservingSearch from './components/RedirectPreservingSearch';
import DbUpgradeOverlay from './components/DbUpgradeOverlay';
import { AuthProvider } from './lib/auth/AuthContext';
import AuthGate from './lib/auth/AuthGate';
import { SyncProvider } from './lib/sync/SyncContext';
import { SessionTimerProvider } from './lib/sessionTimer/SessionTimerContext';

export default function App() {
  return (
    <AuthProvider>
    <AuthGate>
    <SyncProvider>
    <InstrumentProvider>
    <SessionTimerProvider>
      <Toaster>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* THE HOME SCREEN. Swapped 20 Aug 2026 — step 8.
                Everything else that means "home" already resolved to
                `/`: the sidebar, the mobile tab bar, DASHBOARD_META,
                the page-title map and the PWA start_url. `homeRoute`
                pins that, because a swap leaving three paths on the old
                screen is worse than no swap. */}
            <Route index element={<DashboardScreen />} />
            {/* The old dashboard, still reachable for comparison.
                TEMPORARY: this route and `modules/dashboard/Dashboard`
                come out in a separate commit once the new screen has
                been used properly — the same way PracticeLogModal was
                retired. Deleting it in the swap commit would remove the
                thing the swap is meant to be checked against. */}
            <Route path="dashboard-old" element={<Dashboard />} />
            {/* Bookmarked and sitting open in tabs, so it redirects
                rather than 404s. The search is carried across because
                the dashboard's filters and sort live in the URL — a
                saved view has to arrive as itself. */}
            <Route
              path="dashboard-next"
              element={<RedirectPreservingSearch to="/" />}
            />
            <Route path="goals" element={<Goals />} />
            <Route path="practice-sessions" element={<PracticeSessions />} />
            <Route path="practice-sessions/active" element={<ActiveSessionScreen />} />
            <Route path="harmonic-fluency" element={<HarmonicFluency />} />
            <Route path="harmonic-fluency/calendar" element={<HarmonicFluencyCalendar />} />
            <Route path="ear-training" element={<EarTraining />} />
            <Route path="ear-training/intervals" element={<Intervals />} />
            <Route path="ear-training/intervals/calendar" element={<IntervalsCalendar />} />
            <Route path="ear-training/chord-recognition" element={<ChordRecognition />} />
            <Route path="ear-training/chord-recognition/calendar" element={<ChordRecognitionCalendar />} />
            <Route path="ear-training/chord-progressions" element={<ChordProgressions />} />
            <Route path="ear-training/chord-progressions/calendar" element={<ChordProgressionsCalendar />} />
            <Route path="ear-training/chord-progression-quiz" element={<ChordProgressionQuiz />} />
            <Route path="ear-training/scales-modes" element={<ScalesModes />} />
            <Route path="ear-training/scales-modes/calendar" element={<ScalesModesCalendar />} />
            <Route path="repertoire" element={<Repertoire />} />
            {/* Song-scoped, via the ?songId= convention Repertoire
                already reads. A second way to name a song in a URL
                would be a second thing to keep in step with the
                first. */}
            <Route path="repertoire/calendar" element={<SongPracticeCalendar />} />
            <Route path="shapes-and-patterns" element={<ShapesAndPatterns />} />
            <Route path="shapes-and-patterns/calendar" element={<ShapesAndPatternsCalendar />} />
            <Route path="production" element={<Production />} />
            <Route path="session-log" element={<SessionLog />} />
            <Route path="skills-catalogue" element={<SkillsCatalogue />} />
            <Route path="harmonic-diary" element={<HarmonicDiary />} />
            <Route
              path="reading"
              element={
                <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading notation…</div>}>
                  <Reading />
                </Suspense>
              }
            />
            {/* DEV ONLY, and STAYS dev-only now that /reading ships.
                The preview is the standing notation check — a fixed
                21-card set to re-verify against an outside reference
                when the key overlay lands — not a user surface.
                `import.meta.env.DEV` is a compile-time constant, so
                this subtree is dropped from a production build rather
                than merely being unreachable. */}
            {import.meta.env.DEV && (
              <Route
                path="reading/preview"
                element={
                  <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading notation…</div>}>
                    <ReadingPreview />
                  </Suspense>
                }
              />
            )}
          </Route>
        </Routes>
        {/* Inside the router (needs the route) and inside the session
            provider (needs session state) — both feed the idle probe
            that decides auto-reload vs overlay on a cross-tab upgrade. */}
        <DbUpgradeOverlay />
      </BrowserRouter>
      </Toaster>
    </SessionTimerProvider>
    </InstrumentProvider>
    </SyncProvider>
    </AuthGate>
    </AuthProvider>
  );
}
