import { useMemo } from 'react';
import HeatGrid from './HeatGrid';
import { KEYS, SCALES } from './catalog';

export default function ScaleDrills() {
  const rows = useMemo(() => SCALES.map(s => ({
    id: s.id,
    label: s.label,
    descriptorFor: (keyName: string) => ({ kind: 'scale' as const, keyName, scale: s.id }),
  })), []);
  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-4">
      <div>
        <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          scale drills
        </h3>
        <p className="text-xs text-neutral-500 mt-0.5">
          major + natural minor for v1. modes, harmonic minor, melodic minor, pentatonics land in a future pass.
        </p>
      </div>
      <HeatGrid rows={rows} keyList={KEYS} />
    </section>
  );
}
