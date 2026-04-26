// Future feature ideas live in /ROADMAP.md at the project root.
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
import ScalesModes from './modules/ear-training/scales-modes/ScalesModes';
import ScalesModesCalendar from './modules/ear-training/scales-modes/ScalesModesCalendar';
import Repertoire from './modules/repertoire/Repertoire';
import ShapesAndPatterns from './modules/shapes-and-patterns/ShapesAndPatterns';
import ShapesAndPatternsCalendar from './modules/shapes-and-patterns/ShapesAndPatternsCalendar';
import Production from './modules/production/Production';
import SessionLog from './modules/session-log/SessionLog';
import SkillsCatalogue from './modules/skills/SkillsCatalogue';
import HarmonicDiary from './modules/harmonic-diary/HarmonicDiary';
import Goals from './modules/goals/Goals';
import PracticeSessions from './modules/practice/PracticeSessions';
import { InstrumentProvider } from './lib/instrumentContext';
import { Toaster } from './components/Toaster';
import { AuthProvider } from './lib/auth/AuthContext';
import AuthGate from './lib/auth/AuthGate';
import { SyncProvider } from './lib/sync/SyncContext';

export default function App() {
  return (
    <AuthProvider>
    <AuthGate>
    <SyncProvider>
    <InstrumentProvider>
      <Toaster>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="goals" element={<Goals />} />
            <Route path="practice-sessions" element={<PracticeSessions />} />
            <Route path="harmonic-fluency" element={<HarmonicFluency />} />
            <Route path="harmonic-fluency/calendar" element={<HarmonicFluencyCalendar />} />
            <Route path="ear-training" element={<EarTraining />} />
            <Route path="ear-training/intervals" element={<Intervals />} />
            <Route path="ear-training/intervals/calendar" element={<IntervalsCalendar />} />
            <Route path="ear-training/chord-recognition" element={<ChordRecognition />} />
            <Route path="ear-training/chord-recognition/calendar" element={<ChordRecognitionCalendar />} />
            <Route path="ear-training/chord-progressions" element={<ChordProgressions />} />
            <Route path="ear-training/chord-progressions/calendar" element={<ChordProgressionsCalendar />} />
            <Route path="ear-training/scales-modes" element={<ScalesModes />} />
            <Route path="ear-training/scales-modes/calendar" element={<ScalesModesCalendar />} />
            <Route path="repertoire" element={<Repertoire />} />
            <Route path="shapes-and-patterns" element={<ShapesAndPatterns />} />
            <Route path="shapes-and-patterns/calendar" element={<ShapesAndPatternsCalendar />} />
            <Route path="production" element={<Production />} />
            <Route path="session-log" element={<SessionLog />} />
            <Route path="skills-catalogue" element={<SkillsCatalogue />} />
            <Route path="harmonic-diary" element={<HarmonicDiary />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </Toaster>
    </InstrumentProvider>
    </SyncProvider>
    </AuthGate>
    </AuthProvider>
  );
}
