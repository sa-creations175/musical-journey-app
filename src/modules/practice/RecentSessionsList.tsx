import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PracticeBlock, type PracticeSession } from '../../lib/db';
import { moduleMetaById } from '../../lib/moduleMeta';
import ConfirmDialog from '../../components/ConfirmDialog';
import { deletePracticeSession } from './deletePracticeSession';

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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId || deleting) return;
    setDeleting(true);
    try {
      await deletePracticeSession(pendingDeleteId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[recent-sessions] delete failed', err);
    } finally {
      setDeleting(false);
      setPendingDeleteId(null);
    }
  };

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
            onDelete={() => setPendingDeleteId(s.id)}
          />
        ))}
      </ul>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete this session?"
        message="This cannot be undone."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (deleting) return;
          setPendingDeleteId(null);
        }}
      />
    </div>
  );
}

// -------------------------------------------------------------------

function SessionRow({
  session,
  blocks,
  onDelete,
}: {
  session: PracticeSession;
  blocks: PracticeBlock[];
  onDelete: () => void;
}) {
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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
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
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete session"
          title="Delete session"
          className="shrink-0 -mr-1 -mt-0.5 p-1.5 rounded text-neutral-400 hover:text-needswork hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
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
    default:       return c;
  }
}
