/**
 * How long a song may go untouched before its card says so — one
 * number per rung.
 *
 * Beside the daily goals, because it is the same kind of setting: how
 * much practice the reader is asking of themselves, in their own words
 * and their own numbers. The rules it feeds are in
 * `practiceWindowPrefs.ts`; this only shows them.
 *
 * PLAIN LANGUAGE, NEVER CONSTANT NAMES. These were going to be four
 * literals in a component, which is the class of rule nobody ever looks
 * at — naming them on screen is the whole point of storing them.
 */
import { useEffect, useState } from 'react';
import type { RepertoireStage } from '../../lib/db';
import { STAGES, STAGE_LABEL } from './stage';
import {
  getPracticeWindows,
  setPracticeWindow,
  type PracticeWindows,
} from './practiceWindowPrefs';

export default function PracticeWindowSettingsSection() {
  const [windows, setWindows] = useState<PracticeWindows | null>(null);

  useEffect(() => {
    let live = true;
    void getPracticeWindows().then(w => { if (live) setWindows(w); });
    return () => { live = false; };
  }, []);

  // Nothing rendered until the stored values are in. Showing the
  // defaults first would flash numbers the user has already changed.
  if (windows === null) return null;

  const change = (stage: RepertoireStage, raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 1) return;
    setWindows({ ...windows, [stage]: Math.round(value) });
    void setPracticeWindow(stage, value);
  };

  return (
    <section>
      <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
        how long before a song goes cold
      </h4>
      <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
        Past this, the song&apos;s card says when you last played it in amber. This
        is about neglect, not about the rung: a song can sit untouched for weeks
        with every key still safely inside its interval.
      </p>

      <div className="space-y-2" data-testid="practice-windows">
        {STAGES.map(stage => (
          <label key={stage} className="flex items-center gap-2 text-sm">
            <span className="w-28 shrink-0 text-neutral-700 dark:text-neutral-200">
              {STAGE_LABEL[stage]}
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={windows[stage]}
              onChange={e => change(stage, e.target.value)}
              aria-label={`${STAGE_LABEL[stage]} practice window`}
              data-testid="practice-window-input"
              data-stage={stage}
              className="w-16 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm tabular-nums"
            />
            <span className="text-neutral-500 text-xs">Days</span>
          </label>
        ))}
      </div>
    </section>
  );
}
