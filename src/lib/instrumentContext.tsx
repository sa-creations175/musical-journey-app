import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { setInstrument as syncAudioInstrument, type Instrument } from './audio';
import { getPref, setPref } from './userPrefs';

export const PREF_INSTRUMENT = 'instrument';
const DEFAULT_INSTRUMENT: Instrument = 'piano';

interface InstrumentCtx {
  currentInstrument: Instrument;
  setCurrentInstrument: (instrument: Instrument) => void;
}

const InstrumentContext = createContext<InstrumentCtx | null>(null);

// Wrap the whole app so every audio-producing module reads the same instrument.
// We mirror the value into audio.ts's module-level activeInstrument via
// syncAudioInstrument so the (non-React) play functions stay in sync.
export function InstrumentProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Instrument>(DEFAULT_INSTRUMENT);

  useEffect(() => {
    getPref<Instrument>(PREF_INSTRUMENT, DEFAULT_INSTRUMENT).then(v => {
      setCurrent(v);
      syncAudioInstrument(v);
    });
  }, []);

  const setCurrentInstrument = (instrument: Instrument) => {
    setCurrent(instrument);
    syncAudioInstrument(instrument);
    setPref(PREF_INSTRUMENT, instrument);
  };

  return (
    <InstrumentContext.Provider value={{ currentInstrument: current, setCurrentInstrument }}>
      {children}
    </InstrumentContext.Provider>
  );
}

export function useInstrument(): InstrumentCtx {
  const ctx = useContext(InstrumentContext);
  if (!ctx) throw new Error('useInstrument must be used within InstrumentProvider');
  return ctx;
}
