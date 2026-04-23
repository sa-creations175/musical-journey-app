import { useMemo } from 'react';
import HeatGrid from './HeatGrid';
import {
  CHORD_QUALITIES,
  KEYS,
  type QualityKind,
} from './catalog';

interface Props {
  scope: QualityKind | 'all';
  onScopeChange: (scope: QualityKind | 'all') => void;
}

const KIND_LABEL: Record<QualityKind | 'all', string> = {
  all:        'all qualities',
  triad:      'triads only',
  seventh:    'seventh chords',
  extension:  'extensions',
  special:    'specials (6, 6/9, etc.)',
};
const KIND_OPTIONS: Array<QualityKind | 'all'> = ['all', 'triad', 'seventh', 'extension', 'special'];

/**
 * Chord Shape Drills activity area — 12×N heat grid where N varies
 * with the chosen quality scope. Row gutter shows the chord suffix so
 * users can scan the vocabulary at a glance.
 */
export default function ChordShapeDrills({ scope, onScopeChange }: Props) {
  const qualities = useMemo(
    () => scope === 'all' ? CHORD_QUALITIES : CHORD_QUALITIES.filter(q => q.kind === scope),
    [scope],
  );

  // Row label shows the long-form quality name plus the shorthand in
  // parens for chords whose suffix isn't already obvious. Major triads
  // omit the parens entirely (root alone is the standard notation).
  const rows = useMemo(() => qualities.map(q => ({
    id: q.id,
    label: q.suffix
      ? `${q.label} (${q.suffix})`
      : q.label,
    descriptorFor: (keyName: string) => ({ kind: 'chord-shape' as const, keyName, quality: q.id }),
  })), [qualities]);

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
            chord shape drills
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            tap a cell to drill that chord in that key. cells darken with time invested and fade as they go stale.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-neutral-500">
          scope:
          <select
            value={scope}
            onChange={e => onScopeChange(e.target.value as QualityKind | 'all')}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
          >
            {KIND_OPTIONS.map(o => <option key={o} value={o}>{KIND_LABEL[o]}</option>)}
          </select>
        </label>
      </div>

      <HeatGrid
        rows={rows}
        keyList={KEYS}
      />
    </section>
  );
}
