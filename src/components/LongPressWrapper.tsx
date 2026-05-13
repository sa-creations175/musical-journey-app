import type { ReactNode } from 'react';
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
    <div {...handlers} className={className}>
      {children}
    </div>
  );
}
