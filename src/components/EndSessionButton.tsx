/**
 * The way out of a running drill.
 *
 * =====================================================================
 * ONE CONTROL, NOT ONE PER MODULE.
 *
 * This markup lived inside `FlashcardSession`, which is why only the
 * modules built on flashcards had a way out. Reading's drill is its own
 * component, so once started the only exit was the nav — and the nav
 * leaves the page as well as the run.
 *
 * Lifted here so the second module reuses the control rather than
 * growing a second one that drifts from it.
 * =====================================================================
 */

export default function EndSessionButton({ onEnd }: { onEnd: () => void }) {
  return (
    <button
      type="button"
      onClick={onEnd}
      data-testid="end-session"
      className="text-neutral-500 hover:text-fluent"
    >
      End Session
    </button>
  );
}
