import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PracticeBlock, type PracticeSession } from '../../lib/db';
import { moduleMetaById } from '../../lib/moduleMeta';

/**
 * Last-five sessions display for Practice Sessions home. Reads
 * `practiceSessions` and `practiceBlocks` and joins them in memory
 * to render module pills under each session row.
 *
 * Phase 1 is the only writer of these tables (manual logging), so
 * the list is short — no virtualization, no pagination. Phase 7
 * adds the full Practice History calendar.
 */

const MAX_ROWS = 5;

export default function RecentSessionsList() {
  const sessions = useLiveQuery(
    async () => {
      // Sort by startedAt desc and slice — Dexie's reverse() on the
      // startedAt index is fast even at scale.
      const all = await db.practiceSessions.orderBy('startedAt').reverse().toArray();
      return all.slice(0, MAX_ROWS);
    },
    [],
  );
  const blocks = useLiveQuery(() => db.practiceBlocks.toArray(), []);

  const blocksBySession = useMemo(() => {
    const m = new Map<string, PracticeBlock[]>();
    if (!blocks) return m;
    for (const b of blocks) {
      const arr = m.get(b.sessionId) ?? [];
      arr.push(b);
      m.set(b.sessionId, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.orderIndex - b.orderIndex);
    }
    return m;
  }, [blocks]);

  if (sessions === undefined) {
    return <div className="text-xs text-neutral-500 italic">Loading recent sessions…</div>;
  }

  if (sessions.length === 0) {
    return (
      <p className="text-xs text-neutral-500 italic">
        No sessions logged yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
        Recent sessions
      </span>
      <ul className="flex flex-col gap-2">
        {sessions.map(s => (
          <SessionRow
            key={s.id}
            session={s}
            blocks={blocksBySession.get(s.id) ?? []}
          />
        ))}
      </ul>
    </div>
  );
}

// -------------------------------------------------------------------

function SessionRow({ session, blocks }: { session: PracticeSession; blocks: PracticeBlock[] }) {
  const moduleIds = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const b of blocks) {
      if (!seen.has(b.moduleRef)) {
        seen.add(b.moduleRef);
        order.push(b.moduleRef);
      }
    }
    return order;
  }, [blocks]);

  return (
    <li className="rounded-md border border-neutral-200 dark:border-neutral-800 px-3 py-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          {formatStarted(session.startedAt)}
        </span>
        <span className="text-xs text-neutral-500">·</span>
        <span className="text-sm text-neutral-700 dark:text-neutral-200">
          {session.actualDurationMin ?? session.plannedDurationMin} min
        </span>
        <span className="text-xs text-neutral-500">·</span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {contextLabel(session.context)}
        </span>
      </div>
      {moduleIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {moduleIds.map(id => <ModulePill key={id} moduleId={id} />)}
        </div>
      )}
      {session.notes && (
        <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1.5 italic">
          {session.notes}
        </p>
      )}
    </li>
  );
}

function ModulePill({ moduleId }: { moduleId: string }) {
  const meta = moduleMetaById(moduleId);
  const accent = meta?.accentHex ?? '#9ca3af';
  const label = meta?.label ?? moduleId;
  return (
    <span
      className="text-[11px] px-1.5 py-0.5 rounded"
      style={{ backgroundColor: `${accent}1a`, color: accent }}
    >
      {label}
    </span>
  );
}

// -------------------------------------------------------------------

function formatStarted(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const datePart = sameDay
    ? 'Today'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

function contextLabel(c: string): string {
  switch (c) {
    case 'keys':   return 'at the keyboard';
    case 'laptop': return 'on laptop';
    case 'phone':  return 'on phone';
    case 'mixed':  return 'mixed';
    default:       return c;
  }
}
