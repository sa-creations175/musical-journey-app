/**
 * The choices row that opens when a gap or a token in a progression
 * strip is tapped in edit mode.
 *
 * EXTRACTED so the per-section strip and the Progressions drawer share
 * one implementation. They write to the same stored `sequenceView`, so
 * offering "new row" in one and not the other — or wording the hide
 * differently — would make one set of data look like two features.
 *
 * Purely presentational: every action is a callback, and it holds no
 * state of its own.
 */
export interface SequenceTarget {
  kind: 'gap' | 'token';
  placementId: string;
}

/** What already sits at this gap, so the row can offer a CONVERSION
 *  rather than restating both kinds as if nothing were there. */
export type ExistingBreakKind = 'separator' | 'row' | null;

export default function SequenceChoices({
  target,
  label,
  hasBreak,
  existingKind = null,
  hidden,
  onSetBreak,
  onRemoveBreak,
  onToggleHidden,
  onClose,
}: {
  target: SequenceTarget;
  label: string;
  hasBreak: boolean;
  /** The kind already at this gap, when there is one. */
  existingKind?: ExistingBreakKind;
  hidden: boolean;
  onSetBreak: (afterPlacementId: string, kind: 'separator' | 'row') => void;
  onRemoveBreak: (afterPlacementId: string) => void;
  onToggleHidden: (placementId: string) => void;
  onClose: () => void;
}) {
  const chip =
    'px-2 py-0.5 rounded-full border border-fluent/40 text-fluent hover:bg-fluent/10';
  const current =
    'px-2 py-0.5 rounded-full border border-fluent bg-fluent/10 text-fluent';
  const plain =
    'px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent';
  return (
    <div className="basis-full mt-1 flex flex-wrap items-center gap-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 text-[11px] shadow-md">
      <span className="text-neutral-500">
        {target.kind === 'gap' ? `after ${label}` : label}
      </span>
      {target.kind === 'gap' ? (
        <>
          {/* CONVERSION IS THE COMMON CASE once a break exists — most
              often "this shouldn't have been a line break" — so the
              chip names the change rather than restating both kinds as
              though the gap were empty. The kind already in place is
              shown as current instead of being offered again, which
              would be a no-op wearing an action's clothes.

              Converting keeps the note: setBreak overrides `kind` on
              the existing break and nothing else. */}
          {existingKind === 'separator' ? (
            <span className={current}>separator</span>
          ) : (
            <button
              type="button"
              className={chip}
              onClick={() => onSetBreak(target.placementId, 'separator')}
              title={
                existingKind === 'row'
                  ? 'keeps the phrase on one line; the note stays'
                  : 'divides the phrase without starting a new line'
              }
            >
              {existingKind === 'row' ? 'make it a separator' : 'separator'}
            </button>
          )}
          {existingKind === 'row' ? (
            <span className={current}>new row</span>
          ) : (
            <button
              type="button"
              className={chip}
              onClick={() => onSetBreak(target.placementId, 'row')}
              title={
                existingKind === 'separator'
                  ? 'starts a new line here; the note stays'
                  : 'starts a new line here'
              }
            >
              {existingKind === 'separator' ? 'make it a new row' : 'new row'}
            </button>
          )}
          {hasBreak && (
            <button
              type="button"
              className={plain}
              onClick={() => onRemoveBreak(target.placementId)}
              title="the two phrases merge and their notes combine"
            >
              remove break
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          className={plain}
          onClick={() => onToggleHidden(target.placementId)}
          title="hides it from the progression view only — the chord stays in the grid"
        >
          {hidden ? 'show in progression' : 'hide from progression'}
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        className="ml-auto text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        aria-label="close"
      >
        ×
      </button>
    </div>
  );
}
