import { sortModes, type ModeSortOrder } from './catalog';
import ModeReferenceCard from './ModeReferenceCard';

interface Props {
  sort: ModeSortOrder;
}

export default function ModeReferenceSection({ sort }: Props) {
  const modes = sortModes(sort);
  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-base sm:text-lg font-medium tracking-tight">mode reference</h2>
        <p className="text-[11px] text-neutral-500">
          {sort === 'brightness' ? 'sorted brightest to darkest' : 'sorted by parent-scale position'}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {modes.map(mode => (
          <ModeReferenceCard key={mode.id} mode={mode} />
        ))}
      </div>
    </section>
  );
}
