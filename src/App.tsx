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
            <Route path="harmonic-fluency" element={<HarmonicFluency />} />
            <Route path="harmonic-fluency/calendar" element={<HarmonicFluencyCalendar />} />
            <Route path="ear-training" element={<EarTraining />} />
            <Route path="ear-training/intervals" element={<Intervals />} />
            <Route path="ear-training/intervals/calendar" element={<IntervalsCalendar />} />
            <Route path="ear-training/chord-recognition" element={<ChordRecognition />} />
            <Route path="ear-training/chord-recognition/calendar" element={<ChordRecognitionCalendar />} />
            <Route path="ear-training/chord-progressions" element={<ChordProgressions />} />
            <Route path="ear-training/chord-progressions/calendar" element={<ChordProgressionsCalendar />} />
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
