import { useEffect, useMemo, useRef, useState } from 'react';
import type { DrillSession, DrillSkill, DrillType } from '../../lib/db';
import Modal from '../../components/Modal';
import KeyboardVisual, { type HighlightedNote } from '../../components/KeyboardVisual';
import { useToast } from '../../components/Toaster';
import {
  formatDuration,
  logSession,
} from './drillModel';
import {
  generateCardFor,
  parseCardCountFromName,
  type FlashcardCard,
} from './mentalVizEngine';

interface Props {
  skill: DrillSkill;
  drillType: DrillType;
  onClose: () => void;
  onLogged: (session: DrillSession) => void;
}

type Phase = 'setup' | 'prompt' | 'reveal' | 'summary';
type Verdict = 'missed' | 'close' | 'gotit';

const VERDICT_LABEL: Record<Verdict, string> = {
  missed: 'Missed it',
  close:  'Close but not quite',
  gotit:  'Got it',
};
const VERDICT_FEEL: Record<Verdict, DrillSession['feelRating']> = {
  missed: 1,
  close:  2,
  gotit:  4,
};

/**
 * Flashcard runner for the Mental Visualisation drills. Each card
 * shows a prompt (chord name + inversion, or source → target inversion
 * for transposition), the user self-thinks, taps Reveal, then gives a
 * 3-option verdict. At the end of the deck the whole session commits
 * to DrillSessions as one row — total elapsed time + averaged feel
 * rating. Bypasses MIN_REP_SECONDS because flashcards are legitimate
 * practice even when quick.
 */
export default function MentalVizFlashcardModal({
  skill,
  drillType,
  onClose,
  onLogged,
}: Props) {
  const { toast } = useToast();
  const variantId = skill.variant ?? 'shape-viz';
  const initialCount = parseCardCountFromName(drillType.name, 10);

  const [targetCount, setTargetCount] = useState(initialCount);
  const [phase, setPhase] = useState<Phase>('setup');
  const [cards, setCards] = useState<FlashcardCard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const startedAtRef = useRef<number>(0);

  const current = cards[cardIndex];

  const start = () => {
    const deck = Array.from({ length: targetCount }, () => generateCardFor(variantId));
    setCards(deck);
    setCardIndex(0);
    setVerdicts([]);
    startedAtRef.current = Date.now();
    setPhase('prompt');
  };

  const reveal = () => setPhase('reveal');

  const recordVerdict = (v: Verdict) => {
    const nextVerdicts = [...verdicts, v];
    setVerdicts(nextVerdicts);
    if (nextVerdicts.length >= cards.length) {
      setPhase('summary');
    } else {
      setCardIndex(i => i + 1);
      setPhase('prompt');
    }
  };

  const elapsedSeconds = useMemo(() => {
    if (phase === 'setup' || startedAtRef.current === 0) return 0;
    return Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
  }, [phase, verdicts.length]);

  const avgFeel = useMemo((): DrillSession['feelRating'] => {
    if (verdicts.length === 0) return 3;
    const sum = verdicts.reduce((acc, v) => acc + VERDICT_FEEL[v], 0);
    const avg = Math.round(sum / verdicts.length);
    const clamped = Math.max(1, Math.min(4, avg));
    return clamped as DrillSession['feelRating'];
  }, [verdicts]);

  const save = async () => {
    const session = await logSession({
      skill,
      drillType,
      durationSeconds: elapsedSeconds,
      feelRating: avgFeel,
      notes: summariseVerdicts(verdicts),
    });
    toast({
      message: `Logged ${verdicts.length} flashcard${verdicts.length === 1 ? '' : 's'}.`,
      variant: 'success',
    });
    onLogged(session);
  };

  // Hard reset when the drill type changes while the modal is open
  // (shouldn't normally happen, but guards against stale state).
  useEffect(() => {
    setPhase('setup');
    setCards([]);
    setVerdicts([]);
    setCardIndex(0);
  }, [drillType.id]);

  return (
    <Modal
      open
      onClose={onClose}
      title={drillType.name}
      description={skill.label}
      footer={
        phase === 'summary' ? (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
            >
              cancel — don't log
            </button>
            <button
              onClick={save}
              className="px-4 py-1.5 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
            >
              save session
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
            >
              {phase === 'setup' ? 'cancel' : 'end early'}
            </button>
          </div>
        )
      }
    >
      {phase === 'setup' && (
        <div className="space-y-4 text-sm">
          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-neutral-500 uppercase tracking-wide text-xs">cards in this set</span>
              <span className="font-mono tabular-nums">{targetCount}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[5, 10, 15, 20, 30].map(n => (
                <button
                  key={n}
                  onClick={() => setTargetCount(n)}
                  className={`px-2.5 py-0.5 rounded border text-xs ${
                    targetCount === n
                      ? 'bg-fluent text-white border-fluent'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-snug">
            {variantId === 'mental-transposition'
              ? 'Each card names a chord and its bass in one inversion, then asks you to picture it in a different inversion. Tap reveal to self-check.'
              : 'Each card names a chord and a voicing. Picture the shape on a keyboard, then tap reveal to self-check.'}
          </p>
          <div className="flex items-center justify-center pt-1">
            <button
              onClick={start}
              className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
            >
              start flashcards
            </button>
          </div>
        </div>
      )}

      {(phase === 'prompt' || phase === 'reveal') && current && (
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between text-[11px] text-neutral-500 uppercase tracking-wide">
            <span>card {cardIndex + 1} of {cards.length}</span>
            <span className="font-mono tabular-nums">{formatDuration(elapsedSeconds)}</span>
          </div>

          <CardPrompt card={current} revealed={phase === 'reveal'} />

          {phase === 'prompt' ? (
            <div className="flex items-center justify-center">
              <button
                onClick={reveal}
                className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
              >
                reveal
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-neutral-500 text-center">how did you do?</div>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <VerdictButton verdict="missed" onClick={() => recordVerdict('missed')} tone="needswork" />
                <VerdictButton verdict="close"  onClick={() => recordVerdict('close')}  tone="developing" />
                <VerdictButton verdict="gotit"  onClick={() => recordVerdict('gotit')}  tone="fluent" />
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'summary' && (
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">session complete</div>
            <div className="font-mono tabular-nums text-2xl">
              {verdicts.length} card{verdicts.length === 1 ? '' : 's'}
            </div>
            <div className="text-[11px] text-neutral-500 mt-0.5">
              {formatDuration(elapsedSeconds)} · avg feel {avgFeel}/4
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <VerdictTally
              label="missed"
              count={verdicts.filter(v => v === 'missed').length}
              total={verdicts.length}
              tone="needswork"
            />
            <VerdictTally
              label="close"
              count={verdicts.filter(v => v === 'close').length}
              total={verdicts.length}
              tone="developing"
            />
            <VerdictTally
              label="got it"
              count={verdicts.filter(v => v === 'gotit').length}
              total={verdicts.length}
              tone="fluent"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

// -------------------------------------------------------------------

function CardPrompt({ card, revealed }: { card: FlashcardCard; revealed: boolean }) {
  if (card.variant === 'shape-viz') {
    const highlights: HighlightedNote[] = revealed
      ? card.notes.map(n => ({ note: n.note, octave: n.octave, color: 'blue' }))
      : [];
    return (
      <div className="space-y-3">
        <div className="text-center">
          <div className="text-2xl font-mono tracking-tight">
            {card.chordName}
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">
            {card.inversionLabel} · {card.qualityLabel.toLowerCase()}
          </div>
        </div>
        <div className="flex justify-center">
          <KeyboardVisual
            keySignature={`${card.rootKey} major`}
            highlightedNotes={highlights}
            width={360}
            octaves={2}
            startOctave={4}
          />
        </div>
        {revealed && (
          <div className="text-center font-mono text-sm tracking-tight text-neutral-700 dark:text-neutral-200">
            {card.notes.map(n => n.note).join(' · ')}
          </div>
        )}
      </div>
    );
  }

  // Mental transposition
  const highlights: HighlightedNote[] = revealed
    ? card.toNotes.map(n => ({ note: n.note, octave: n.octave, color: 'blue' }))
    : [];
  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-xl font-mono tracking-tight">
          {card.chordName}
        </div>
        <div className="text-xs text-neutral-500 mt-0.5">
          start: <strong>{card.fromInversionLabel}</strong> ({card.fromNotes.map(n => n.note).join('-')})
        </div>
        <div className="text-sm text-fluent mt-1">
          imagine <strong>{card.toInversionLabel}</strong>
        </div>
      </div>
      <div className="flex justify-center">
        <KeyboardVisual
          keySignature={`${card.rootKey} major`}
          highlightedNotes={highlights}
          width={360}
          octaves={2}
          startOctave={4}
        />
      </div>
      {revealed && (
        <div className="text-center font-mono text-sm tracking-tight text-neutral-700 dark:text-neutral-200">
          {card.toNotes.map(n => n.note).join(' · ')}
        </div>
      )}
    </div>
  );
}

function VerdictButton({
  verdict,
  onClick,
  tone,
}: {
  verdict: Verdict;
  onClick: () => void;
  tone: 'needswork' | 'developing' | 'fluent';
}) {
  const toneCls = {
    needswork:  'border-needswork text-needswork hover:bg-needswork/10',
    developing: 'border-developing text-developing hover:bg-developing/10',
    fluent:     'border-fluent text-fluent hover:bg-fluent/10',
  }[tone];
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-2 rounded-lg border text-sm font-medium ${toneCls}`}
    >
      {VERDICT_LABEL[verdict]}
    </button>
  );
}

function VerdictTally({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: 'needswork' | 'developing' | 'fluent';
}) {
  const toneCls = {
    needswork:  'text-needswork',
    developing: 'text-developing',
    fluent:     'text-fluent',
  }[tone];
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-2">
      <div className={`text-xl font-mono tabular-nums ${toneCls}`}>{count}</div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">
        {label} · {pct}%
      </div>
    </div>
  );
}

function summariseVerdicts(verdicts: Verdict[]): string {
  if (verdicts.length === 0) return '';
  const counts = {
    missed: verdicts.filter(v => v === 'missed').length,
    close:  verdicts.filter(v => v === 'close').length,
    gotit:  verdicts.filter(v => v === 'gotit').length,
  };
  return `${counts.gotit}/${verdicts.length} got it · ${counts.close} close · ${counts.missed} missed`;
}
