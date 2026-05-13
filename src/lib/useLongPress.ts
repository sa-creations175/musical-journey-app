import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface Options {
  /** How long the user must hold before the callback fires. */
  thresholdMs?: number;
  /** If the pointer moves further than this many pixels from the
   *  initial down position, the long-press is cancelled (treated as
   *  a drag or scroll). */
  moveTolerancePx?: number;
  /** When false, the returned handlers no-op. Lets callers gate
   *  long-press by viewport (e.g. mobile-only) without conditionally
   *  attaching event listeners. */
  enabled?: boolean;
}

const DEFAULT_THRESHOLD_MS = 450;
// 15px (up from 10) absorbs the natural finger drift on touchscreens
// — a stationary thumb routinely wobbles 3–5px during a hold, and
// momentum-scroll deltas can push that higher before the OS commits
// the gesture. 10px proved too tight in real-finger testing.
const DEFAULT_MOVE_TOLERANCE_PX = 15;
const CLICK_SUPPRESS_WINDOW_MS = 1000;

/**
 * Press-and-hold detector. Returns a set of pointer-event handlers
 * to spread onto a target element. After the user holds the pointer
 * still for `thresholdMs`, `callback` fires once.
 *
 * Cancels on:
 *   · pointer move > `moveTolerancePx` (drag / scroll)
 *   · pointer up / cancel / leave before the threshold
 *
 * After the callback fires, the next synthesized `click` is
 * swallowed at the document level so any underlying tap handler
 * (e.g. a button the user happened to be over) doesn't also fire.
 * Without this, a long-press on the lead-sheet phrase row would
 * open the row context menu AND immediately close the sheet via
 * the backdrop's click (released finger over the new overlay).
 */
export function useLongPress(callback: () => void, options?: Options) {
  const enabled = options?.enabled !== false;
  const thresholdMs = options?.thresholdMs ?? DEFAULT_THRESHOLD_MS;
  const moveTolerancePx = options?.moveTolerancePx ?? DEFAULT_MOVE_TOLERANCE_PX;

  const timerRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      // Only main button for mouse; all touch / pen events accepted.
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      startPosRef.current = { x: event.clientX, y: event.clientY };
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        startPosRef.current = null;
        // Suppress the next click so the synthesized tap doesn't
        // collapse the overlay the callback opened.
        const suppress = (evt: Event) => {
          evt.preventDefault();
          evt.stopPropagation();
          document.removeEventListener('click', suppress, true);
        };
        document.addEventListener('click', suppress, true);
        window.setTimeout(
          () => document.removeEventListener('click', suppress, true),
          CLICK_SUPPRESS_WINDOW_MS,
        );
        callbackRef.current();
      }, thresholdMs);
    },
    [enabled, thresholdMs],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!startPosRef.current) return;
      const dx = event.clientX - startPosRef.current.x;
      const dy = event.clientY - startPosRef.current.y;
      if (dx * dx + dy * dy > moveTolerancePx * moveTolerancePx) cancel();
    },
    [cancel, moveTolerancePx],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
  };
}
