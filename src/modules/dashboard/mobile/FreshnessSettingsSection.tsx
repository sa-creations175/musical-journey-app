/**
 * How long a freshness step is — the one number behind the dashboard's
 * freshness scale.
 *
 * THE SCALE RENDERS LIVE beside the field, for the same reason
 * the spacing page shows its interval sequence: "7 days" in
 * isolation says nothing about what is being agreed to, and the seven
 * rungs at the lengths they will draw say all of it. Derived from the
 * same function the dashboard draws with, so it cannot show one thing
 * and the bar do another.
 */
import { useEffect, useState } from 'react';
import FreshnessScaleStrip from './FreshnessScaleStrip';
import { getFreshnessStepDays, setFreshnessStepDays } from './freshnessPrefs';

export default function FreshnessSettingsSection() {
  const [stepDays, setStepDays] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    void getFreshnessStepDays().then(v => { if (live) setStepDays(v); });
    return () => { live = false; };
  }, []);

  // Nothing rendered until the stored value is in. Showing the default
  // first would flash a number the user has already changed.
  if (stepDays === null) return null;

  const change = (raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 1) return;
    setStepDays(Math.round(value));
    void setFreshnessStepDays(value);
  };

  return (
    <section>
      <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
        how long before a skill looks stale
      </h4>
      <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
        The dashboard&apos;s freshness bar moves down a rung each step. This is
        how long a step is; the four rungs are one, two, three and four of them.
      </p>

      <label className="flex items-center gap-2 text-sm mb-3">
        <span className="text-neutral-700 dark:text-neutral-200">Step</span>
        <input
          type="number"
          min={1}
          step={1}
          value={stepDays}
          onChange={e => change(e.target.value)}
          aria-label="freshness step"
          data-testid="freshness-step-input"
          className="w-16 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm tabular-nums"
        />
        <span className="text-neutral-500 text-xs">Days</span>
      </label>

      <FreshnessScaleStrip stepDays={stepDays} />
    </section>
  );
}
