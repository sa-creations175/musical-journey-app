import { useInstrument } from '../lib/instrumentContext';
import type { Instrument } from '../lib/audio';

const options: { id: Instrument; label: string }[] = [
  { id: 'piano',   label: 'Piano' },
  { id: 'rhodes',  label: 'Rhodes' },
  { id: 'strings', label: 'Strings' },
  { id: 'voice',   label: 'Voice' },
  { id: 'organ',   label: 'Organ' },
];

export default function InstrumentSelector() {
  const { currentInstrument, setCurrentInstrument } = useInstrument();
  return (
    <div
      role="radiogroup"
      aria-label="instrument"
      title="Instrument"
      className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs"
    >
      {options.map(opt => {
        const active = currentInstrument === opt.id;
        return (
          <button
            key={opt.id}
            role="radio"
            aria-checked={active}
            onClick={() => setCurrentInstrument(opt.id)}
            className={`px-3 py-1.5 rounded-md transition ${
              active
                ? 'bg-fluent text-white'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
