import type { CSSProperties, ReactNode } from 'react';
import { OVERLAY_MAX_W } from './leadSheetOverlay';

/**
 * A floating message about ONE grid cell.
 *
 * Both lead-sheet overlays render through this — the refusal message
 * and the line-end prompt. See the plan doc's "feedback about a cell
 * anchors to that cell" principle: the bottom of the screen is
 * reserved for genuinely screen-level things, and a message about a
 * cell belongs at that cell.
 *
 * Extracted from inline JSX so it can be RENDER-TESTED. The geometry
 * was already pure and covered, but "given a position, does an element
 * with the message actually appear" was not — and that is exactly the
 * gap a missing-overlay regression falls through. jsdom is already a
 * devDependency and already used elsewhere via `// @vitest-environment
 * jsdom`, so this needed no new infrastructure.
 *
 * `position` is supplied by `anchoredOverlayPosition`; width is a
 * MAXIMUM so content wraps rather than truncating.
 *
 * The box ALWAYS passes taps through, so it can never block the cell
 * the user is aiming at. Controls inside it opt back in individually
 * with `pointer-events-auto`.
 */
export default function CellAnchoredMessage({
  left,
  top,
  z,
  armKeep = false,
  className = '',
  children,
}: {
  left: number;
  top: number;
  /** Stacking order. Both overlays can be up at once; the refusal
   *  message sits above the prompt. */
  z: number;
  /** Marks the box as an arming surface, so the document dismiss
   *  listener doesn't fire on the way to a control inside it —
   *  pointerdown runs before click, so without this a cancel button
   *  would be decorative. */
  armKeep?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    left,
    top,
    maxWidth: OVERLAY_MAX_W,
    zIndex: z,
  };
  return (
    <div
      role="status"
      aria-live="polite"
      data-cell-message=""
      {...(armKeep ? { 'data-lyric-arm-keep': '' } : {})}
      style={style}
      className={`fixed pointer-events-none px-2 py-1 rounded-md shadow-lg text-[11px] leading-tight bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900 ${className}`}
    >
      {children}
    </div>
  );
}
