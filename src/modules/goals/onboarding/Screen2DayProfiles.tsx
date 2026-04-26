import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  type DayProfile,
  type DayProfileExpectedSessions,
  type DayProfileName,
  type DayProfileSlot,
  type PracticeSessionContext,
} from '../../../lib/db';
import {
  ONBOARDING_PROFILE_NAMES,
  PROFILE_LABELS,
  PROFILE_TAGLINES,
  SLOT_LABELS,
  buildOnboardingProfiles,
} from './defaults';

/**
 * Onboarding Screen 2 — build the three day profiles.
 *
 * The Q9 defaults pre-fill the editor. The user can edit any slot,
 * skip slots that don't apply, and the profiles persist on Next.
 *
 * Day profiles are informational signals, not prescriptive
 * commitments — the language reflects this. Custom variants are
 * built post-onboarding (not in this flow).
 */

type ProfileName = Exclude<DayProfileName, 'custom'>;
type SlotKey = keyof DayProfileExpectedSessions;
const SLOT_KEYS: ReadonlyArray<SlotKey> = ['morning', 'midday', 'evening'];
const CONTEXT_OPTIONS: PracticeSessionContext[] = ['keys', 'laptop', 'phone', 'mixed'];

export interface Screen2Handle {
  /** Persist the current draft to db.dayProfiles. Called by the
   *  parent before advancing to Screen 3 OR exiting the flow.
   *  Returns true on success; false on persistence error so the
   *  parent can hold the user on Screen 2. */
  persist: () => Promise<boolean>;
}

interface Props {
  /** Receives the persist handle so the parent's Next button can
   *  drive a save before advancing. */
  registerHandle: (handle: Screen2Handle) => void;
}

export default function Screen2DayProfiles({ registerHandle }: Props) {
  // Live db read for existing profiles. Undefined until the first
  // query resolves; treated as "loading" in the render path below.
  const existing = useLiveQuery(() => db.dayProfiles.toArray(), []);

  // User edits live in an overrides record. Once the user touches
  // any slot we stop deriving from `existing` so a late-arriving
  // live-query result can't clobber in-progress edits. Rendered
  // view = overrides ?? buildOnboardingProfiles(existing).
  const [overrides, setOverrides] = useState<Record<ProfileName, DayProfile> | null>(null);

  const draft = useMemo<Record<ProfileName, DayProfile> | null>(() => {
    if (overrides) return overrides;
    if (existing === undefined) return null;
    return buildOnboardingProfiles(existing);
  }, [overrides, existing]);

  // Register a persist handle with the parent so Next can flush.
  useEffect(() => {
    registerHandle({
      persist: async () => {
        if (!draft) return true;
        try {
          // Persist all three profiles in one pass. bulkPut covers
          // both first-write and updates; Dexie sync hooks queue
          // the cloud writes per row.
          await db.dayProfiles.bulkPut([draft.standard, draft.light, draft.deep]);
          return true;
        } catch (err) {
          console.warn('[onboarding] day profiles save failed', err);
          return false;
        }
      },
    });
  }, [draft, registerHandle]);

  if (!draft) {
    return <div className="text-sm text-neutral-500 italic">Loading day profiles…</div>;
  }

  const updateSlot = (
    name: ProfileName,
    slotKey: SlotKey,
    patch: Partial<DayProfileSlot>,
  ) => {
    setOverrides(prev => {
      const base = prev ?? buildOnboardingProfiles(existing ?? []);
      const profile = base[name];
      const nextSlot: DayProfileSlot = { ...profile.expectedSessions[slotKey], ...patch };
      const nextProfile: DayProfile = {
        ...profile,
        expectedSessions: {
          ...profile.expectedSessions,
          [slotKey]: nextSlot,
        },
      };
      return { ...base, [name]: nextProfile };
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
          What do your typical days look like?
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">
          Three day shapes the app uses to plan: a Standard day, a Light day,
          and a Deep day. These are signals, not commitments — sessions can
          shift freely once you're practicing.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {ONBOARDING_PROFILE_NAMES.map(name => (
          <ProfileCard
            key={name}
            name={name}
            profile={draft[name]}
            onChangeSlot={(slotKey, patch) => updateSlot(name, slotKey, patch)}
          />
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------

function ProfileCard({
  name,
  profile,
  onChangeSlot,
}: {
  name: ProfileName;
  profile: DayProfile;
  onChangeSlot: (slotKey: SlotKey, patch: Partial<DayProfileSlot>) => void;
}) {
  return (
    <section className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
      <header className="mb-2">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          {PROFILE_LABELS[name]} day
        </h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {PROFILE_TAGLINES[name]}
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {SLOT_KEYS.map(slotKey => (
          <SlotEditor
            key={slotKey}
            label={SLOT_LABELS[slotKey]}
            slot={profile.expectedSessions[slotKey]}
            onChange={patch => onChangeSlot(slotKey, patch)}
          />
        ))}
      </div>
    </section>
  );
}

function SlotEditor({
  label,
  slot,
  onChange,
}: {
  label: string;
  slot: DayProfileSlot;
  onChange: (patch: Partial<DayProfileSlot>) => void;
}) {
  return (
    <div className={[
      'rounded-md border px-2.5 py-2 flex flex-col gap-1.5 transition',
      slot.skip
        ? 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 opacity-70'
        : 'border-neutral-200 dark:border-neutral-800',
    ].join(' ')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
          {label}
        </span>
        <label className="text-[11px] text-neutral-500 inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={slot.skip}
            onChange={e => onChange({ skip: e.target.checked })}
          />
          Skip
        </label>
      </div>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={5}
        value={slot.skip ? '' : (slot.minutes || '')}
        onChange={e => {
          const n = Number(e.target.value);
          onChange({ minutes: Number.isFinite(n) ? n : 0 });
        }}
        disabled={slot.skip}
        placeholder="minutes"
        className={inputClass(slot.skip)}
        aria-label={`${label} minutes`}
      />
      <select
        value={slot.context}
        onChange={e => onChange({ context: e.target.value as PracticeSessionContext })}
        disabled={slot.skip}
        className={inputClass(slot.skip)}
        aria-label={`${label} context`}
      >
        {CONTEXT_OPTIONS.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}

function inputClass(disabled: boolean): string {
  return [
    'w-full px-2 py-1 rounded border text-sm',
    'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900',
    'focus:outline-none focus:ring-2 focus:ring-fluent/40',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
  ].join(' ');
}
