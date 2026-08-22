import { useEffect, useState } from 'react';
import {
  PREF_DUE_SOON_DAYS,
  PREF_FIRST_INTERVAL_DAYS,
  PREF_GRACE_DAYS,
  PREF_LONGEST_INTERVAL_DAYS,
  SPACING_DEFAULTS,
  getSpacingSettings,
  intervalSequence,
  setSpacingSetting,
  type SongKeySpacingSettings,
} from './spacingPrefs';

/**
 * How often a song key has to be proven again — four numbers that
 * used to be constants nobody had seen.
 *
 * ---------------------------------------------------------------
 * THE SEQUENCE IS THE POINT, NOT THE FOUR FIELDS.
 *
 * "First interval: 2 days" in isolation says nothing about what is
 * being agreed to. "2 → 4 → 8 → 16 → 30 days" says all of it: how
 * fast it stretches, how many passes to reach the ceiling, and what
 * the ceiling costs. So the sequence renders live, derived from the
 * two ends by the same doubling the engine walks — it cannot show one
 * thing and the engine do another.
 * ---------------------------------------------------------------
 *
 * Plain language, never constant names. `MAX_INTERVAL_BY_MEMORY_TYPE`
 * decided this for every module and nobody ever looked at it; naming
 * it here would move the problem rather than fix it.
 */

interface Field {
  key: string;
  label: string;
  help: string;
  read: (s: SongKeySpacingSettings) => number;
  apply: (s: SongKeySpacingSettings, v: number) => SongKeySpacingSettings;
}

const FIELDS: Field[] = [
  {
    key: PREF_FIRST_INTERVAL_DAYS,
    label: 'first interval',
    help: 'how long after proving a key for the first time before it comes due again',
    read: s => s.firstIntervalDays,
    apply: (s, v) => ({ ...s, firstIntervalDays: v }),
  },
  {
    key: PREF_LONGEST_INTERVAL_DAYS,
    label: 'longest interval',
    help: 'the most time that can ever pass between provings, however many times you have passed',
    read: s => s.longestIntervalDays,
    apply: (s, v) => ({ ...s, longestIntervalDays: v }),
  },
  {
    key: PREF_DUE_SOON_DAYS,
    label: 'due soon warning',
    help: 'how long before a key is due that it starts warning you, so the work can happen first',
    read: s => s.dueSoonDays,
    apply: (s, v) => ({ ...s, dueSoonDays: v }),
  },
  {
    key: PREF_GRACE_DAYS,
    label: 'grace before demotion',
    help: 'how long a key can stay overdue before it stops counting and the song drops a rung',
    read: s => s.graceDays,
    apply: (s, v) => ({ ...s, graceDays: v }),
  },
];

export default function SpacingSettingsSection() {
  const [settings, setSettings] = useState<SongKeySpacingSettings | null>(null);

  useEffect(() => {
    let live = true;
    void getSpacingSettings().then(s => { if (live) setSettings(s); });
    return () => { live = false; };
  }, []);

  // Nothing rendered until the stored values are in. Showing the
  // defaults first would flash numbers the user has already changed.
  if (settings === null) return null;

  const change = (field: Field, raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 1) return;
    setSettings(field.apply(settings, Math.round(value)));
    void setSpacingSetting(field.key, value);
  };

  const sequence = intervalSequence(settings);

  return (
    <section>
      <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
        how often songs come back
      </h4>
      <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
        a key you have proven stays proven for a while, and the gap gets longer
        each time you pass. these decide how much longer, and how much slack you
        get before a song drops a rung.
      </p>

      <div className="rounded-md border border-black/[0.07] bg-neutral-50 dark:bg-neutral-900 px-3 py-2.5 mb-3">
        <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">
          your sequence
        </div>
        <div className="text-sm font-mono tabular-nums text-neutral-800 dark:text-neutral-100">
          {sequence.join(' → ')} days
        </div>
        <div className="text-[11px] text-neutral-500 mt-1">
          {sequence.length === 1
            ? 'one interval — the first and longest are the same.'
            : `${sequence.length} passes to reach the longest interval, doubling each time.`}
        </div>
      </div>

      <div className="space-y-3">
        {FIELDS.map(field => (
          <label key={field.key} className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
              {field.label}
              <input
                type="number"
                min={1}
                step={1}
                value={field.read(settings)}
                onChange={e => change(field, e.target.value)}
                className="w-16 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm tabular-nums"
              />
              <span className="text-neutral-500 text-xs">days</span>
            </span>
            <span className="text-[11px] text-neutral-500 leading-snug">
              {field.help}
            </span>
          </label>
        ))}
      </div>

      <p className="text-[11px] text-neutral-500 mt-3 leading-snug">
        defaults are {SPACING_DEFAULTS.firstIntervalDays}, {SPACING_DEFAULTS.longestIntervalDays},{' '}
        {SPACING_DEFAULTS.dueSoonDays} and {SPACING_DEFAULTS.graceDays} days — the values the app
        already used before these were adjustable.
      </p>
    </section>
  );
}
