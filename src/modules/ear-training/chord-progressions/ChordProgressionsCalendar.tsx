import { Link } from 'react-router-dom';
import PracticeCalendar from '../../../components/PracticeCalendar';

const MODULE_ID = 'chord-progressions';

export default function ChordProgressionsCalendar() {
  return (
    <div className="space-y-6">
      <div>
        <Link to="/ear-training/chord-progressions" className="text-xs text-neutral-500 hover:text-fluent">
          ← chord progressions
        </Link>
        <h1 className="text-2xl font-medium tracking-tight mt-2">chord progressions practice calendar</h1>
        <p className="text-neutral-500 text-sm">
          each cell is one day. color tracks how close you came to your daily goal.
        </p>
      </div>

      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5">
        <PracticeCalendar moduleId={MODULE_ID} />
      </section>
    </div>
  );
}
