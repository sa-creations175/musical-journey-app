/**
 * Phase 3 Step 5a/5b — Active session execution screen.
 *
 * One block at a time, full-screen focus. Reads from the global
 * timer; doesn't start sessions itself (proposal acceptance does
 * that, supplying the block list).
 *
 * Subsequent substeps add:
 *   5c — Flying / Cruising / Crawling rating at block end
 *   5d — between-blocks "Ready for next?" screen
 *
 * activeModuleRef wiring (per the 1b design call, model b):
 *   - While on this screen, activeModuleRef = 'practice-sessions'.
 *   - On quick-launch, set activeModuleRef = block.moduleRef
 *     before navigating.
 *   - On return, the on-mount effect resets to 'practice-sessions'.
 *
 * Soft-block vs hard-block (5b):
 *   - Soft (default): on countdown reaching 0, extend pills appear
 *     (+2 / +5 / +10 min). User taps end manually to move on. Block
 *     time can run over without penalty — the timer records actual
 *     active ms regardless.
 *   - Hard (opt-in via prop, future session config): on countdown
 *     reaching 0, a 5-second grace begins; system auto-advances at
 *     grace end. User can interrupt by extending (resets grace) or
 *     manually ending.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { moduleMetaById } from '../../lib/moduleMeta';
import {
  useSessionTimer,
  useSessionTimes,
} from '../../lib/sessionTimer/SessionTimerContext';
import { formatActiveTime } from '../../lib/sessionTimer/formatActiveTime';

const PRACTICE_SESSIONS_REF = 'practice-sessions';
const PRACTICE_SESSIONS_HOME_ROUTE = '/practice-sessions';

export const HARD_BLOCK_GRACE_MS = 5000;
const EXTEND_OPTIONS_MIN: ReadonlyArray<number> = [2, 5, 10];

interface Props {
  /** Hard-block mode: auto-advance after a 5-second grace once the
   *  countdown reaches 0. Defaults to soft (extend / manual end).
   *  Future session config will drive this; hardcoded false for now. */
  hardBlock?: boolean;
}

export default function ActiveSessionScreen({ hardBlock = false }: Props = {}) {
  const navigate = useNavigate();
  const { state, setActiveModuleRef, advanceBlock } = useSessionTimer();
  const times = useSessionTimes();

  // Local extension bank — accumulates +2/+5/+10 taps. Reset on
  // each block change so extensions don't carry across blocks.
  const [extensionSeconds, setExtensionSeconds] = useState(0);
  const [hardGraceStart, setHardGraceStart] = useState<number | null>(null);

  // Reset extension + grace when the current block changes.
  useEffect(() => {
    setExtensionSeconds(0);
    setHardGraceStart(null);
  }, [state.currentBlockIndex]);

  // Model (b) — keep activeModuleRef tracking the practice-sessions
  // surface while we're on this screen.
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'ended') return;
    if (state.activeModuleRef !== PRACTICE_SESSIONS_REF) {
      setActiveModuleRef(PRACTICE_SESSIONS_REF);
    }
  }, [state.status, state.activeModuleRef, setActiveModuleRef]);

  // Bounce off the screen when there's no session.
  useEffect(() => {
    if (state.status === 'idle') {
      navigate(PRACTICE_SESSIONS_HOME_ROUTE, { replace: true });
    }
  }, [state.status, navigate]);

  // Hard-block grace — schedule auto-advance once it starts. Cleanup
  // cancels the timeout if the user extends or ends manually.
  useEffect(() => {
    if (hardGraceStart === null) return;
    const id = window.setTimeout(() => {
      advanceBlock({ markStatus: 'completed' });
    }, HARD_BLOCK_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [hardGraceStart, advanceBlock]);

  if (state.status === 'idle') return null;

  const currentBlock =
    state.currentBlockIndex !== null
      ? state.blocks[state.currentBlockIndex]
      : null;
  if (!currentBlock) return null;

  const moduleMeta = moduleMetaById(currentBlock.moduleRef);
  const moduleLabel = moduleMeta?.label ?? currentBlock.moduleRef;
  const accent = moduleMeta?.accentHex ?? '#4a9088';
  const route = moduleMeta?.route ?? null;

  const elapsedSec = Math.floor(times.blockActiveMs / 1000);
  const totalSec = currentBlock.plannedSeconds + extensionSeconds;
  const remainingSec = Math.max(0, totalSec - elapsedSec);
  const isOvertime = elapsedSec >= totalSec;
  const isEnded = state.status === 'ended';

  // Start the hard-block grace timer the first tick we cross the
  // 0-mark. Idempotent: subsequent ticks see hardGraceStart already
  // non-null and skip.
  if (
    hardBlock &&
    isOvertime &&
    !isEnded &&
    hardGraceStart === null
  ) {
    queueMicrotask(() => setHardGraceStart(Date.now()));
  }

  const handleQuickLaunch = () => {
    if (!route) return;
    setActiveModuleRef(currentBlock.moduleRef);
    navigate(route);
  };

  const handleEndActivity = () => {
    advanceBlock({ markStatus: 'completed' });
  };

  const handleExtend = (mins: number) => {
    setExtensionSeconds(s => s + mins * 60);
    setHardGraceStart(null); // cancel any pending grace auto-advance
  };

  const graceRemainingSec =
    hardGraceStart !== null
      ? Math.max(
          0,
          Math.ceil((HARD_BLOCK_GRACE_MS - (Date.now() - hardGraceStart)) / 1000),
        )
      : null;

  if (isEnded) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 text-center space-y-3">
        <h2 className="text-lg font-medium">Session complete</h2>
        <p className="text-sm text-neutral-500">
          End-of-session summary lands in a later release. For now,
          tap below to return to Practice Sessions.
        </p>
        <button
          type="button"
          onClick={() => navigate(PRACTICE_SESSIONS_HOME_ROUTE)}
          className="px-4 py-2 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
        >
          done
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
      <div className="text-center text-[11px] uppercase tracking-wider text-neutral-500">
        Block {(state.currentBlockIndex ?? 0) + 1} of {state.blocks.length}
      </div>

      <section
        className="rounded-lg border p-5 sm:p-6 space-y-5"
        style={{
          backgroundColor: `${accent}14`,
          borderColor: accent,
          borderLeftWidth: 3,
        }}
      >
        <header className="space-y-1">
          <div
            className="text-[11px] uppercase tracking-wider font-medium"
            style={{ color: accent }}
          >
            {moduleLabel}
          </div>
          <h2 className="text-lg font-medium text-neutral-800 dark:text-neutral-100">
            {currentBlock.label ?? currentBlock.moduleRef}
          </h2>
        </header>

        <div className="text-center py-3">
          <div
            className="font-mono tabular-nums text-6xl"
            style={{
              color: isOvertime ? accent : undefined,
            }}
          >
            {formatActiveTime(remainingSec * 1000)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1">
            {isOvertime ? 'time’s up' : 'remaining'}
          </div>
        </div>

        {route && (
          <button
            type="button"
            onClick={handleQuickLaunch}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium hover:opacity-90"
            style={{ color: accent, borderColor: accent }}
          >
            <span aria-hidden>↗</span>
            <span>open {moduleLabel}</span>
          </button>
        )}

        {/* Soft-block extend pills surface as soon as we're at or
            past 0:00. Tapping resets any pending hard-block grace. */}
        {isOvertime && (
          <div className="flex items-center justify-center gap-1.5">
            {EXTEND_OPTIONS_MIN.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => handleExtend(m)}
                className="px-3 py-1 rounded-md border text-xs font-medium hover:opacity-90"
                style={{ color: accent, borderColor: accent }}
              >
                +{m} min
              </button>
            ))}
          </div>
        )}

        {hardBlock && graceRemainingSec !== null && (
          <p className="text-center text-[11px] italic text-neutral-500">
            auto-advancing in {graceRemainingSec}s · tap an extend pill or
            end manually to interrupt
          </p>
        )}
      </section>

      <button
        type="button"
        onClick={handleEndActivity}
        className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm font-medium hover:border-fluent hover:text-fluent"
      >
        end this activity
      </button>
    </div>
  );
}
