/**
 * Full-set answer picker — the shared one.
 *
 * ---------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * Ear Training has four hand-rolled answer models and no shared
 * picker: a 13-column interval timeline, a 2/3/4-column chord grid, a
 * four-option decoy grid, and a slot-tap progression composer. They
 * agree on nothing except the verdict colours, which `AnswerVerdict`
 * already owns. Adding a fifth one-off for Reading would have made
 * that five.
 *
 * This is that pattern extracted from `InversionPicker` in
 * ChordRecognitionQuiz.tsx — the closest thing ET had to a reusable
 * picker, trapped inside an 1149-line file. The states and the exact
 * class strings come from there unchanged, so nothing that already
 * ships changes appearance when a caller migrates to this.
 * ---------------------------------------------------------------
 *
 * FULL SET, NOT MULTIPLE CHOICE. Every legal answer is on screen.
 * Four options out of a set of seven give the answer away by
 * elimination; Reading's answer sets are small and predictable enough
 * that showing all of them is the honest question.
 *
 * Rendering only. This component holds no state, scores nothing, and
 * writes nothing — the caller owns the selection and the verdict.
 */

export interface PickerOption {
  id: string;
  label: string;
  /** Native tooltip. Never required to answer — a picker whose
   *  options need explaining is the wrong vocabulary. */
  hint?: string;
}

export interface FullSetPickerProps {
  options: ReadonlyArray<PickerOption>;
  /** The right answer. Only consulted once `locked` — before that the
   *  buttons are deliberately uniform, so nothing on screen can hint. */
  correctId: string | null;
  selectedId: string | null;
  /** Answered: freeze input and reveal right/wrong. */
  locked: boolean;
  onPick: (id: string) => void;
  /** Small heading above the row. Omit for a bare picker. */
  title?: string;
  /** Tailwind grid-template class. Defaults to a wrapping flex row,
   *  which suits small sets; large sets pass a grid. */
  gridClassName?: string;
  /** Disable before the card is ready (nothing to answer yet). */
  disabled?: boolean;
}

export default function FullSetPicker({
  options,
  correctId,
  selectedId,
  locked,
  onPick,
  title,
  gridClassName,
  disabled = false,
}: FullSetPickerProps) {
  const layout = gridClassName ?? 'flex justify-center gap-2 flex-wrap';

  return (
    <div className="space-y-1.5">
      {title && (
        <div className="text-[10px] uppercase tracking-wide text-neutral-500 text-center">
          {title}
        </div>
      )}
      <div className={layout}>
        {options.map(opt => {
          const isCorrect = opt.id === correctId;
          const isSelected = opt.id === selectedId;
          const base =
            'px-3 py-2 rounded-lg border text-xs font-medium transition';
          let cls: string;
          if (!locked) {
            // Selected-but-not-submitted needs its own state here that
            // InversionPicker never needed: chord identification holds
            // three picks before submitting, so a pick has to read as
            // made without reading as judged.
            cls = isSelected
              ? `${base} border-fluent text-fluent bg-fluent/5 cursor-pointer`
              : `${base} border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-fluent hover:text-fluent cursor-pointer`;
          } else if (isCorrect) {
            cls = `${base} border-fluent bg-fluent/10 text-fluent cursor-default`;
          } else if (isSelected) {
            cls = `${base} border-needswork bg-needswork/10 text-needswork cursor-default`;
          } else {
            cls = `${base} border-neutral-200 dark:border-neutral-700 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] text-neutral-400 opacity-60 cursor-default`;
          }
          return (
            <button
              key={opt.id}
              type="button"
              disabled={locked || disabled}
              onClick={() => onPick(opt.id)}
              className={`${cls} disabled:cursor-default`}
              title={opt.hint}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
