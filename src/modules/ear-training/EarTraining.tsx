import { Link } from 'react-router-dom';

interface SubModule {
  to: string;
  label: string;
  description: string;
  status: 'ready' | 'coming';
}

const subModules: SubModule[] = [
  {
    to: '/ear-training/intervals',
    label: 'intervals',
    description: 'ear-train all 13 intervals with anchor songs & fluency tracking',
    status: 'ready',
  },
  {
    to: '/ear-training/chord-recognition',
    label: 'chord recognition',
    description: 'identify chord qualities by ear across four tiers from triads to extensions',
    status: 'ready',
  },
  {
    to: '/ear-training/chord-progressions',
    label: 'chord progressions',
    description: 'hear bass and harmony together — named progressions across gospel, jazz, soul, and pop',
    status: 'ready',
  },
];

export default function EarTraining() {
  return (
    <div>
      <h1 className="text-2xl font-medium tracking-tight mb-2">ear training</h1>
      <p className="text-neutral-500 text-sm mb-6">
        pick a sub-module.
      </p>
      <div className="grid md:grid-cols-2 gap-3">
        {subModules.map(mod => {
          const inner = (
            <div className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 h-full transition hover:border-fluent">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{mod.label}</span>
                {mod.status === 'coming' && (
                  <span className="text-[10px] uppercase tracking-wide text-neutral-500 border border-neutral-200 dark:border-neutral-700 rounded-full px-2 py-0.5">
                    coming soon
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-500">{mod.description}</p>
            </div>
          );
          return mod.status === 'ready' ? (
            <Link key={mod.to} to={mod.to}>{inner}</Link>
          ) : (
            <div key={mod.to} className="opacity-60 cursor-not-allowed">{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
