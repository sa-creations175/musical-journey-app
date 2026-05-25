import { useState } from 'react';
import {
  db,
  type PracticeBlock,
  type PracticeSession,
  type PracticeSessionContext,
} from '../../lib/db';
import { MODULE_ORDER, moduleMetaById } from '../../lib/moduleMeta';
import { timeOfDayFor } from './timeOfDay';

/**
 * Manual session logging — Phase 1's only write surface for
 * `practiceSessions`. The session generator + timer ship later;
 * this form lets the user record practice that already happened
 * (or is happening) so the session history exists and the schema
 * round-trips end-to-end.
 *
 * Data shape:
 *   - One `practiceSessions` row per submission.
 *   - One `practiceBlocks` row per module the user said they
 *     touched, with the session's duration evenly divided. If no
 *     modules were picked, no blocks are created (the session
 *     still records duration, context, and notes).
 *
 * Closed-by-default — most visits to Practice Sessions home are
 * for review, not logging. The page renders a single trigger
 * button; expanding shows the full form inline.
 */

const CONTEXT_OPTIONS: ReadonlyArray<{ value: PracticeSessionContext; label: string }> = [
  { value: 'keys',   label: 'At the keyboard' },
  { value: 'laptop', label: 'On my laptop' },
  { value: 'phone',  label: 'On my phone' },
];

interface FormState {
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM (24h)
  durationMin: string;
  modules: string[];
  context: PracticeSessionContext;
  notes: string;
}

function freshFormState(): FormState {
  const now = new Date();
  return {
    date: dateInputValue(now),
    time: timeInputValue(now),
    durationMin: '',
    modules: [],
    context: 'keys',
    notes: '',
  };
}

export default function ManualLogForm() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(freshFormState);
  const [busy, setBusy] = useState(false);

  const durationNumeric = Number(form.durationMin);
  const validDuration = form.durationMin.trim() !== ''
    && Number.isFinite(durationNumeric)
    && durationNumeric > 0;
  const startedAt = composeDateTime(form.date, form.time);
  const canSave = validDuration && startedAt !== null;

  const handleSave = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const now = Date.now();
      const sessionId = `session-${Math.random().toString(36).slice(2, 8)}-${now.toString(36)}`;
      const endedAt = startedAt + durationNumeric * 60 * 1000;
      const session: PracticeSession = {
        id: sessionId,
        startedAt,
        endedAt,
        plannedDurationMin: durationNumeric,
        actualDurationMin: durationNumeric,
        context: form.context,
        timeOfDay: timeOfDayFor(startedAt),
        sessionRole: 'only',
        sessionIntent: null,
        hardBlocks: false,
        energyFocus: null,
        energyMotivation: null,
        energyInspiration: null,
        dayProfileUsed: null,
        reasoningSnapshot: null,
        notes: form.notes.trim() === '' ? null : form.notes.trim(),
        lastEngagedAt: now,
        sessionRating: null,
        affirmation: null,
      };

      const blocks = buildBlocks(sessionId, form.modules, durationNumeric);

      // Two rows in two tables. The Dexie sync hooks fire per write
      // and queue cloud upserts; per-table writes are atomic enough
      // for Phase 1 (no cross-row invariants users can observe).
      await db.practiceSessions.put(session);
      if (blocks.length > 0) {
        await db.practiceBlocks.bulkPut(blocks);
      }

      setForm(freshFormState());
      setOpen(false);
    } catch (err) {
      console.warn('[practice] manual log save failed', err);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 text-sm rounded-md bg-fluent text-white hover:bg-fluent/90"
        >
          + Log a session
        </button>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          Record a session that already happened.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-black/[0.07] px-4 py-3 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          Log a session
        </h3>
        <button
          type="button"
          onClick={() => { setOpen(false); setForm(freshFormState()); }}
          className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          Cancel
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Date" required>
          <input
            type="date"
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            className={inputClass()}
          />
        </Field>
        <Field label="Start time" required>
          <input
            type="time"
            value={form.time}
            onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
            className={inputClass()}
          />
        </Field>
        <Field label="Duration" required>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={5}
              value={form.durationMin}
              onChange={e => setForm(f => ({ ...f, durationMin: e.target.value }))}
              placeholder="e.g. 45"
              className={`${inputClass()} flex-1`}
            />
            <span className="text-xs text-neutral-500 dark:text-neutral-400">min</span>
          </div>
        </Field>
      </div>

      <Field label="Where" required>
        <select
          value={form.context}
          onChange={e => setForm(f => ({ ...f, context: e.target.value as PracticeSessionContext }))}
          className={inputClass()}
        >
          {CONTEXT_OPTIONS.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </Field>

      <Field label="What did you touch?" optional>
        <ModuleChips
          selected={form.modules}
          onChange={modules => setForm(f => ({ ...f, modules }))}
        />
      </Field>

      <Field label="Notes" optional>
        <textarea
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={2}
          placeholder="Anything you want to remember about this session…"
          className={inputClass()}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave || busy}
          className="px-3 py-1.5 text-sm rounded-md bg-fluent text-white hover:bg-fluent/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save session
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------

function buildBlocks(
  sessionId: string,
  modules: string[],
  totalMinutes: number,
): PracticeBlock[] {
  if (modules.length === 0) return [];
  const baseSlice = Math.floor(totalMinutes / modules.length);
  const remainder = totalMinutes - baseSlice * modules.length;
  const now = Date.now();
  return modules.map((moduleId, index) => {
    // Distribute the rounding remainder onto the first N blocks so
    // the sum across blocks always equals the session's total
    // duration — no minutes lost to rounding.
    const minutes = baseSlice + (index < remainder ? 1 : 0);
    return {
      id: `block-${sessionId}-${index}-${now.toString(36)}`,
      sessionId,
      orderIndex: index,
      moduleRef: moduleId,
      subModuleRef: null,
      itemRefs: [],
      plannedMinutes: minutes,
      actualMinutes: minutes,
      completionStatus: 'completed',
      performanceRating: null,
      blockColor: null,
      notes: null,
    };
  });
}

function ModuleChips({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const set = new Set(selected);
  const toggle = (id: string) => {
    if (set.has(id)) onChange(selected.filter(v => v !== id));
    else onChange([...selected, id]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {MODULE_ORDER.map(m => {
        const meta = moduleMetaById(m.id);
        const accent = meta?.accentHex ?? '#9ca3af';
        const isSelected = set.has(m.id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.id)}
            className="text-xs px-2 py-1 rounded-md border transition"
            style={{
              borderColor: isSelected ? accent : 'transparent',
              backgroundColor: isSelected ? `${accent}1a` : 'transparent',
              color: isSelected ? accent : '#6b7280',
            }}
          >
            {isSelected ? '✓ ' : '+ '}{m.label}
          </button>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------

function dateInputValue(d: Date): string {
  return [
    d.getFullYear().toString().padStart(4, '0'),
    (d.getMonth() + 1).toString().padStart(2, '0'),
    d.getDate().toString().padStart(2, '0'),
  ].join('-');
}

function timeInputValue(d: Date): string {
  return [
    d.getHours().toString().padStart(2, '0'),
    d.getMinutes().toString().padStart(2, '0'),
  ].join(':');
}

function composeDateTime(date: string, time: string): number | null {
  const dParts = date.split('-');
  const tParts = time.split(':');
  if (dParts.length !== 3 || tParts.length < 2) return null;
  const [y, m, d] = dParts.map(Number);
  const [h, min] = tParts.map(Number);
  if (![y, m, d, h, min].every(Number.isFinite)) return null;
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

function Field({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
        {label}
        {required && <span className="text-needswork"> *</span>}
        {optional && <span className="text-neutral-400 font-normal"> (optional)</span>}
      </span>
      {children}
    </label>
  );
}

function inputClass(): string {
  return 'w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-fluent/40';
}
