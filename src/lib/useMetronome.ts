import { useEffect, useState } from 'react';
import { metronome, type MetronomeState } from './metronome';

/**
 * React binding for the global metronome singleton. Components that
 * just need the current state subscribe via this hook; to control the
 * metronome, import `metronome` directly.
 */
export function useMetronomeState(): MetronomeState {
  const [state, setState] = useState<MetronomeState>(() => ({ ...metronome.state }));
  useEffect(() => metronome.subscribe(setState), []);
  return state;
}
