/**
 * Chord Movements & Passes — everything captured so far, and a way to
 * capture another.
 *
 * =====================================================================
 * THIS PAGE IS NOT IN THE PROTOTYPE, AND IT IS AS PLAIN AS IT COULD BE
 * MADE ON PURPOSE.
 *
 * The signed-off prototype is ONE movement's screen; it says nothing
 * about how a movement is reached or made. Rather than design a screen
 * nobody has walked, this is a list and the app's existing
 * section-setup gesture: the same six time-signature presets a song
 * section offers, pressed once to create and open.
 *
 * Ruling 6 is that a movement's time signature comes "from the same
 * presets a song section uses", so `SECTION_TIME_SIGNATURE_PRESETS`
 * moved out of `BarGridView.tsx` and is read here. One list or the
 * sentence is not true.
 *
 * =====================================================================
 * NO PROGRESS DETAILS SECTION, and that is a decision rather than an
 * omission. It is a standing section on every other module; a movement
 * has no rating yet, and filling it with something invented would be
 * worse than leaving it out. Named as open in the report and in
 * `docs/CHORD_MOVEMENTS_DECISIONS.md`.
 *
 * NO COUNTS ANYWHERE. Movements are not a `SHAPES_SECTIONS` entry —
 * that list is what `shapesCards` computes coverage over, and a
 * movement has no targets to be a fraction of.
 * =====================================================================
 */
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../lib/db';
import { useSpelling } from '../../../lib/spellingPref';
import { spellKey } from '../../../lib/spelling';
import { SECTION_TIME_SIGNATURE_PRESETS } from '../../repertoire/barGrid';
import { movementPath } from '../sectionRoutes';
import { createMovement } from './movementStore';

/** What an unnamed movement is called in a list. Silas names them
 *  himself (ruling 4); this is the list saying so, not a name. */
const UNNAMED = 'Unnamed movement';

export default function MovementsList() {
  const navigate = useNavigate();
  const [spelling] = useSpelling();
  const movements = useLiveQuery(
    async () => (await db.chordMovements.toArray())
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [],
    [],
  );

  const create = (timeSignature: string) => {
    void (async () => {
      const made = await createMovement(timeSignature);
      navigate(movementPath(made.id));
    })();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">
        <Link to="/shapes-and-patterns" className="hover:text-fluent">Shapes &amp; Patterns</Link>
        <span className="mx-1.5">›</span>
        <span className="text-neutral-800 dark:text-neutral-100 font-semibold">
          Chord Movements &amp; Passes
        </span>
      </div>

      <h1 className="text-2xl font-semibold">Chord Movements &amp; Passes</h1>

      <div className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">
          New movement
        </p>
        <div className="flex flex-wrap gap-2" data-testid="new-movement-presets">
          {SECTION_TIME_SIGNATURE_PRESETS.map(preset => (
            <button
              key={preset}
              type="button"
              data-testid={`new-movement-${preset}`}
              onClick={() => create(preset)}
              className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm font-mono tabular-nums hover:border-fluent hover:text-fluent"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {movements.length === 0 ? (
        <p className="text-sm text-neutral-500" data-testid="movements-empty">
          Nothing captured yet.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="movements-list">
          {movements.map(m => (
            <li key={m.id}>
              <Link
                to={movementPath(m.id)}
                data-testid={`movement-row-${m.id}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 hover:border-fluent"
              >
                <span className={m.name ? 'text-base font-semibold' : 'text-base font-semibold text-neutral-400 italic'}>
                  {m.name || UNNAMED}
                </span>
                <span className="text-[13px] text-neutral-500 font-mono tabular-nums">
                  {m.timeSignature}
                </span>
                <span className="text-[13px] text-neutral-500">
                  {m.key ? spellKey(m.key, spelling) : 'no key'}
                </span>
                {m.description && (
                  <span className="w-full text-[13px] text-neutral-500 line-clamp-2">
                    {m.description}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
