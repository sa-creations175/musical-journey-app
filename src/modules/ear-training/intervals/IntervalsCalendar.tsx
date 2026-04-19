import { Link } from 'react-router-dom';
import PracticeCalendar from '../../../components/PracticeCalendar';

const MODULE_ID = 'intervals';

export default function IntervalsCalendar() {
  return (
    <div className="space-y-6">
      <div>
        <Link to="/ear-training/intervals" className="text-xs text-neutral-500 hover:text-fluent">
          ← intervals
        </Link>
        <h1 className="text-2xl font-medium tracking-tight mt-2">intervals practice calendar</h1>
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
