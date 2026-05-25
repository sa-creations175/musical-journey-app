import { Link } from 'react-router-dom';
import PracticeCalendar from '../../components/PracticeCalendar';

const MODULE_ID = 'harmonic-fluency';

export default function HarmonicFluencyCalendar() {
  return (
    <div className="space-y-6">
      <div>
        <Link to="/harmonic-fluency" className="text-xs text-neutral-500 hover:text-fluent">
          ← harmonic fluency
        </Link>
        <h1 className="text-2xl font-medium tracking-tight mt-2">harmonic fluency practice calendar</h1>
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
