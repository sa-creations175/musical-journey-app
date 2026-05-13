import type { CSSProperties, ReactNode } from 'react';
import { useLongPress } from '../lib/useLongPress';

interface Props {
  onLongPress: () => void;
  /** When false, no long-press detection is attached and the wrapper
   *  is functionally transparent. Used to gate long-press by
   *  viewport (e.g. mobile-only). */
  enabled?: boolean;
  children: ReactNode;
  className?: string;
}

// iOS Safari fires its own gestures around the same 500ms window
// where we detect a long-press: text-selection magnifier, touch
// callout, context preview. Without these CSS defences, the system
// gesture wins (cancelling our pointer sequence) or overlays on top
// of the menu we open. `touch-action: pan-y` keeps vertical scroll
// alive so a press inside a scrollable view still scrolls — only
// horizontal pan / pinch is suppressed, which we don't need here.
const LONG_PRESS_STYLE: CSSProperties = {
  touchAction: 'pan-y',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
};

/**
 * Thin wrapper that attaches `useLongPress` handlers to a div around
 * its children. The hook can't be called from inside a `.map()` —
 * extracting the wrapper keeps hook order stable across renders
 * while letting callers spread long-press over arbitrary JSX.
 */
export default function LongPressWrapper({
  onLongPress,
  enabled = true,
  children,
  className,
}: Props) {
  const handlers = useLongPress(onLongPress, { enabled });
  return (
    <div {...handlers} className={className} style={LONG_PRESS_STYLE}>
      {children}
    </div>
  );
}
