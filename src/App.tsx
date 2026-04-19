// Future feature ideas live in /ROADMAP.md at the project root.
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './modules/dashboard/Dashboard';
import EarTraining from './modules/ear-training/EarTraining';
import Intervals from './modules/ear-training/intervals/Intervals';
import IntervalsCalendar from './modules/ear-training/intervals/IntervalsCalendar';
import ChordsShapes from './modules/chords-shapes/ChordsShapes';
import Repertoire from './modules/repertoire/Repertoire';
import Production from './modules/production/Production';
import SessionLog from './modules/session-log/SessionLog';
import { InstrumentProvider } from './lib/instrumentContext';

export default function App() {
  return (
    <InstrumentProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="ear-training" element={<EarTraining />} />
            <Route path="ear-training/intervals" element={<Intervals />} />
            <Route path="ear-training/intervals/calendar" element={<IntervalsCalendar />} />
            <Route path="chords-shapes" element={<ChordsShapes />} />
            <Route path="repertoire" element={<Repertoire />} />
            <Route path="production" element={<Production />} />
            <Route path="session-log" element={<SessionLog />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </InstrumentProvider>
  );
}
