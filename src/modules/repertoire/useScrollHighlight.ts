import { useCallback, useEffect, useRef, useState } from 'react';

// Shared scroll + flash helper for Repertoire. Given a DOM id, smooth-
// scrolls it into view and sets the matching CSS class
// `repertoire-flash` on it for ~1500ms. Components render the class
// conditionally via `isHighlighted(id)`.

const FLASH_DURATION_MS = 1500;

export function useScrollHighlight() {
  const [flashed, setFlashed] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => clearTimer(), []);

  const flash = useCallback((id: string) => {
    clearTimer();
    setFlashed(id);
    // Next tick so newly-mounted elements exist before we scroll.
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    timerRef.current = window.setTimeout(() => {
      setFlashed(cur => (cur === id ? null : cur));
      timerRef.current = null;
    }, FLASH_DURATION_MS);
  }, []);

  const isHighlighted = useCallback((id: string) => flashed === id, [flashed]);

  return { flash, isHighlighted };
}
