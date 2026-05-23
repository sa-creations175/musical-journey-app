// Shared correct/incorrect answer-verdict badge for drill + flashcard reveal
// screens, so the "did I get it right" cue reads clearly and identically
// everywhere. Bold text + ✓/✗ icon on a soft tinted pill in the app's
// semantic colors (fluent = correct/green, needswork = incorrect/red,
// developing = partial/half-credit). Tune the look here once.
//
// Two sizes:
//   · md (default): a wide, prominent pill CENTERED on its own line — the
//     primary "did I pass" verdict on a reveal screen.
//   · sm: a compact inline chip for secondary sub-verdicts (inversion,
//     pattern, per-box / per-note). Pass label='' for an icon-only chip.

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
  /** Override the default word. Pass '' for an icon-only chip (sm sub-verdicts). */
  label?: string;
  size?: 'md' | 'sm';
  className?: string;
}) {
  const v = VERDICT[state];
  const text = label === undefined ? v.label : label;

  if (size === 'sm') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${v.cls} ${className}`}
      >
        <span aria-hidden className="leading-none">{v.icon}</span>
        {text !== '' && <span>{text}</span>}
      </span>
    );
  }

  // md — prominent primary verdict, centered on its own line.
  return (
    <div className={`flex justify-center ${className}`}>
      <span
        className={`inline-flex items-center gap-2 rounded-full px-5 py-1.5 text-base font-bold ${v.cls}`}
      >
        <span aria-hidden className="text-base leading-none">{v.icon}</span>
        {text !== '' && <span>{text}</span>}
      </span>
    </div>
  );
}
