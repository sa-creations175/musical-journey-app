// Shared correct/incorrect answer-verdict badge for drill + flashcard reveal
// screens, so the "did I get it right" cue reads clearly and identically
// everywhere. Bold text + ✓/✗ icon on a soft tinted pill in the app's
// semantic colors (fluent = correct/green, needswork = incorrect/red, amber
// = partial/half-credit). Tune the look here once; call sites just pass state.

type VerdictState = 'correct' | 'incorrect' | 'partial';

const VERDICT: Record<VerdictState, { cls: string; icon: string; label: string }> = {
  correct: { cls: 'bg-fluent/10 text-fluent', icon: '✓', label: 'Correct' },
  incorrect: { cls: 'bg-needswork/10 text-needswork', icon: '✗', label: 'Not quite' },
  partial: { cls: 'bg-developing/10 text-developing', icon: '~', label: 'Half credit' },
};

export default function AnswerVerdict({
  state,
  label,
  size = 'md',
  className = '',
}: {
  state: VerdictState;
  /** Override the default word. Pass '' for an icon-only chip (used by the
   *  small per-box / per-note sub-verdicts). */
  label?: string;
  size?: 'md' | 'sm';
  className?: string;
}) {
  const v = VERDICT[state];
  const text = label === undefined ? v.label : label;
  const sizing =
    size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-2.5 py-1 text-sm gap-1.5';
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold ${sizing} ${v.cls} ${className}`}
    >
      <span aria-hidden className={size === 'md' ? 'text-base leading-none' : 'leading-none'}>
        {v.icon}
      </span>
      {text !== '' && <span>{text}</span>}
    </span>
  );
}
