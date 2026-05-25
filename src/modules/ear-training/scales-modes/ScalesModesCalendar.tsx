import { Link } from 'react-router-dom';
import PracticeCalendar from '../../../components/PracticeCalendar';
import { MODULE_ID } from './shared';

export default function ScalesModesCalendar() {
  return (
    <div className="space-y-6">
      <div>
        <Link to="/ear-training/scales-modes" className="text-xs text-neutral-500 hover:text-fluent">
          ← scales &amp; modes
        </Link>
        <h1 className="text-2xl font-medium tracking-tight mt-2">scales &amp; modes practice calendar</h1>
        <p className="text-neutral-500 text-sm">
          each cell is one day. color tracks how close you came to your daily goal.
        </p>
      </div>

      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5">
        <PracticeCalendar moduleId={MODULE_ID} />
      </section>
    </div>
  );
}
