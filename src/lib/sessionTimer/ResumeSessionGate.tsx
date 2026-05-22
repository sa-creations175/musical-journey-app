/**
 * Refresh / crash recovery prompt (prep-flow redesign, Part 1).
 *
 * Mounts in Layout (inside SessionTimerProvider). On app load it checks
 * Dexie for an in-progress session draft; if one exists and there's no
 * live session in memory, it offers to resume. Resuming rebases the
 * saved state to "now" (offline time excluded) and routes to the active
 * session screen; dismissing abandons + clears the draft.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { ActiveSessionDraft } from '../db';
import { moduleMetaById } from '../moduleMeta';
import { readableItemRefLabel } from '../../modules/practice/readableItemLabel';
import { useSessionTimer } from './SessionTimerContext';
import type { SessionBlock } from './types';
import {
  clearActiveSessionDraft,
  draftToSessionState,
  readActiveSessionDraft,
} from './activeSessionDraft';

const PRACTICE_SESSIONS_ACTIVE_ROUTE = '/practice-sessions/active';

/**
 * Human-readable "currently on" text for the resume prompt.
 *
 * Prefers "<module> · <first item>" when the block's first itemRef
 * resolves to readable content (e.g. "production · The Logic Pro Main
 * Window", "chord recognition · Minor"). Falls back to the block's
 * activityDescription — which is already context-bearing for blocks
 * whose items can't resolve sync ("repertoire · 2 songs") or have none
 * ("Flashcard review — terms and concepts") — then the module name,
 * then a generic word. Never the raw "lessons · 9 lessons" count.
 */
function describeResumeBlock(block: SessionBlock | undefined): string {
  if (!block) return 'session';
  const moduleLabel = moduleMetaById(block.moduleRef)?.label ?? block.moduleRef;
  const firstRef = block.itemRefs?.[0];
  if (firstRef) {
    const resolved = readableItemRefLabel(block.moduleRef, firstRef);
    // resolved === firstRef means no labeler beat the raw id (e.g. a
    // repertoire songId) — fall through to the activityDescription.
    if (resolved !== firstRef) return `${moduleLabel} · ${resolved}`;
  }
  return block.label ?? moduleLabel;
}

export function ResumeSessionGate() {
  const { state, restoreSession } = useSessionTimer();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ActiveSessionDraft | null>(null);

  // Read the persisted draft once on mount. Only relevant when there's
  // no live session in memory (a fresh page load starts idle).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await readActiveSessionDraft();
      if (!cancelled && found) setDraft(found);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Only prompt while genuinely idle — if a session is already live
  // (or the user started a fresh one), the draft is moot.
  const show = draft !== null && state.status === 'idle';
  if (!show) return null;

  const blocks = draft.state.blocks;
  const total = blocks.length;
  const idx = draft.state.currentBlockIndex ?? 0;
  const currentBlock = blocks[idx];
  const currentLabel = describeResumeBlock(currentBlock);
  const minutesIn = Math.max(1, Math.round(draft.savedSessionActiveMs / 60000));

  const handleResume = () => {
    restoreSession(draftToSessionState(draft, Date.now()));
    setDraft(null);
    navigate(PRACTICE_SESSIONS_ACTIVE_ROUTE);
  };

  const handleDismiss = () => {
    void clearActiveSessionDraft();
    setDraft(null);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="resume practice session"
    >
      <div className="bg-white dark:bg-neutral-900 rounded-card border border-fluent shadow-xl w-full max-w-md flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="text-[11px] uppercase tracking-wider font-medium mb-1 text-fluent">
            Practice session
          </div>
          <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-100">
            Resume your session?
          </h3>
        </header>

        <div className="px-5 py-4 space-y-2">
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            You have a session in progress — currently on{' '}
            <span className="font-medium">{currentLabel}</span>.
          </p>
          <p className="text-[12px] text-neutral-500">
            Block {idx + 1} of {total} · ~{minutesIn} min in
          </p>
        </div>

        <footer className="px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-4 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-600 dark:text-neutral-300 hover:border-needswork hover:text-needswork"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleResume}
            data-autofocus
            className="px-4 py-2 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
          >
            Resume
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
