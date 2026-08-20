/**
 * Reading drill — the answering surface.
 *
 * Attempts ARE written now (4.3) — through `recordReadingAttempt`,
 * which owns the three calls. This file decides what the verdict is
 * and when the card is answered; it does not talk to Dexie directly.
 *
 * NO TIMER AND NO SPEED PRESSURE anywhere in here. Elapsed time is
 * measured from the card appearing to the answer being submitted and
 * recorded silently — nothing counts down, nothing is shown, and no
 * behaviour branches on it. That was an explicit decision, not an
 * oversight: recognition speed is close to what reading practice
 * trains, and it cannot be backfilled later.
 *
 * Every answer set comes from `answerModels.ts` and every option list
 * is derived from the catalog, so a picker cannot offer an answer the
 * card could not have, or omit one it could.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReadingStaff from './ReadingStaff';
import FullSetPicker from '../../components/FullSetPicker';
import AnswerVerdict from '../../components/AnswerVerdict';
import { resolveReadingCard } from './renderCard';
import {
  optionsForItem,
  pickCard,
  type ReadingDrillSkill,
  type PickedCard,
} from './pickCard';
import { readingSkillForItemRef } from './catalog';
import {
  SIGNATURES,
  parseReadingItemRef,
  type ChordPosition,
  type Clef,
  type SignatureId,
} from './catalog';
import {
  accidentalCountOptions,
  accidentalNameOptions,
  correctAccidentalSequence,
  countStageAfterPick,
  inversionAnswerFor,
  inversionOptions,
  judgeChord,
  judgeNote,
  judgeSignatureCount,
  keyNameOptions,
  type CountStage,
  type NoteVerdict,
  letterOptions,
  mnemonicFor,
  octaveOptions,
  qualityOptions,
  rootOptions,
  shapeOptions,
} from './answerModels';
import { pitchAtStaffPosition, withAccidentalGlyphs } from './pitch';
import MnemonicStaff from './MnemonicStaff';
import KeyboardDiagram, { type KeyboardBracket } from '../../components/KeyboardDiagram';
import { recordReadingAttempt } from './recordReadingAttempt';

const SEPIA = '#6f4a2f';

/** Answered state for every skill. One shape rather than four so the
 *  reset path is a single assignment and cannot half-clear. */
interface AnswerState {
  letter: string | null;
  octave: string | null;
  shape: string | null;
  keyName: string | null;
  count: string | null;
  sequence: string[];
  inversion: string | null;
  root: string | null;
  quality: string | null;
}

const EMPTY: AnswerState = {
  letter: null, octave: null, shape: null, keyName: null,
  count: null, sequence: [], inversion: null, root: null, quality: null,
};

interface Evaluation {
  correct: boolean;
  /** Enough answered to submit. */
  ready: boolean;
  countStage: CountStage | null;
  /** Note items only — carries which half missed, for the attempt. */
  noteVerdict?: NoteVerdict;
}

/**
 * The verdict for an answer, as a pure function of (card, answer).
 *
 * Pulled out of the render body so `submit` can judge the answer it is
 * actually recording. The count direction submits from inside its own
 * onPick handler, where component state has not yet caught up — and a
 * verdict computed from stale state would be written to the attempt
 * while a different one was shown on screen.
 */
function evaluate(
  parsed: NonNullable<ReturnType<typeof parseReadingItemRef>>,
  card: PickedCard,
  answer: AnswerState,
): Evaluation {
  if (parsed.skill === 'note') {
    const noteVerdict = judgeNote(
      parsed.clef, parsed.position, answer.letter, answer.octave,
    );
    return {
      correct: noteVerdict.correct,
      ready: answer.letter !== null && answer.octave !== null,
      countStage: null,
      noteVerdict,
    };
  }

  if (parsed.skill === 'shape') {
    return {
      correct: answer.shape === card.itemRef,
      ready: answer.shape !== null,
      countStage: null,
    };
  }

  if (parsed.skill === 'sig') {
    if (parsed.direction === 'count') {
      // Derived, not stored — a stored stage is a second source of
      // truth that can disagree with the pick that produced it.
      const countStage = answer.count !== null
        ? countStageAfterPick(parsed.signature as SignatureId, answer.count)
        : null;
      return {
        // A settled stage is already answered — a wrong kind, or
        // "none", needs no sequence to be complete.
        ready: countStage !== null
          && (countStage.stage === 'settled' || answer.sequence.length > 0),
        correct: judgeSignatureCount(
          parsed.signature as SignatureId, answer.count, answer.sequence,
        ).correct,
        countStage,
      };
    }
    if (parsed.direction === 'which') {
      const expected = correctAccidentalSequence(parsed.signature as SignatureId);
      return {
        ready: answer.sequence.length > 0 || expected.length === 0,
        correct: answer.sequence.length === expected.length
          && expected.every((a, i) => answer.sequence[i] === a),
        countStage: null,
      };
    }
    return {
      ready: answer.keyName !== null,
      correct: answer.keyName === parsed.signature,
      countStage: null,
    };
  }

  // Every chord card asks all three, open shapes included — their
  // inversion answer is 'open shape', which is a real answer.
  return {
    ready: answer.root !== null && answer.quality !== null
      && answer.inversion !== null,
    correct: judgeChord(
      {
        position: inversionAnswerFor(parsed.qualityId, parsed.position),
        rootId: card.rootId ?? '',
        qualityId: parsed.qualityId,
      },
      { position: answer.inversion, rootId: answer.root, qualityId: answer.quality },
    ).correct,
    countStage: null,
  };
}

/**
 * The bracket marking what a clef's five lines actually span —
 * DERIVED from the staff itself, so it cannot drift from the notation.
 *
 * Position 0 is the bottom line and 8 the top, so treble comes out
 * E4-F5 and bass G2-A3 without either being written down. The catalog
 * range runs two ledger lines further either way; the bracket
 * deliberately marks the STAFF, not the drilled range, because the
 * question it answers is "how much of the piano is this clef".
 */
function staffRangeBracket(clef: Clef): KeyboardBracket {
  const low = pitchAtStaffPosition(clef, 0);
  const high = pitchAtStaffPosition(clef, 8);
  return {
    from: { letter: low.letter, octave: low.octave },
    to: { letter: high.letter, octave: high.octave },
    label: `${clef} staff`,
  };
}

export default function ReadingDrill({
  skill,
  focusRefs,
}: {
  skill: ReadingDrillSkill;
  /**
   * Restrict the drill to these stored item refs.
   *
   * Set when the dashboard sends you here from a tapped row: "drill
   * this key's conceptual knowledge" is two refs, "drill key signature
   * recognition" is seventy-eight. Absent means the normal spaced
   * selection over the whole skill.
   *
   * Refs that do not belong to `skill` are ignored rather than served -
   * a stale link must not put a chord card inside a key-signature
   * drill. An empty result falls back to the unfiltered pick, because a
   * drill that serves nothing is worse than one that serves the module.
   */
  focusRefs?: readonly string[];
}) {
  const [card, setCard] = useState<PickedCard | null>(null);
  const [answer, setAnswer] = useState<AnswerState>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  /** Hint state is per-DRILL, not per-card — it is a mode the user is
   *  in while learning, and resetting it every card would make it
   *  useless. Only key-signature `name` cards consult it. */
  const [hintOn, setHintOn] = useState(false);
  /** When the current card appeared. A ref, not state: it must not
   *  trigger a re-render, and reading it during submit must give the
   *  value set at mount rather than one a render cycle behind. */
  const shownAt = useRef<number>(Date.now());

  const focusPool = useMemo(() => {
    if (!focusRefs || focusRefs.length === 0) return null;
    const own = focusRefs.filter(ref => readingSkillForItemRef(ref) === skill);
    return own.length > 0 ? own : null;
  }, [focusRefs, skill]);

  const next = useCallback(() => {
    setCard(
      focusPool
        ? optionsForItem(focusPool[Math.floor(Math.random() * focusPool.length)])
        : pickCard(skill),
    );
    setAnswer(EMPTY);
    setSubmitted(false);
    shownAt.current = Date.now();
  }, [skill, focusPool]);

  // A skill change is a new drill, not a continuation.
  useEffect(() => { next(); }, [next]);

  const resolved = useMemo(
    () => (card ? resolveReadingCard(card.itemRef, card.options) : null),
    [card],
  );
  const parsed = useMemo(
    () => (card ? parseReadingItemRef(card.itemRef) : null),
    [card],
  );

  if (!card || !resolved || !parsed) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  const sig = parsed.skill === 'sig'
    ? SIGNATURES.find(s => s.id === parsed.signature) ?? null
    : null;

  const { correct, ready, countStage } = evaluate(parsed, card, answer);
  // Letter and octave only. Note cards carry no accidental by design,
  // and `Pitch.accidental` admits doubles that a keyboard has no
  // separate key for — narrowing here keeps that impossible case out
  // of the diagram rather than handling it there.
  const notePitch = parsed.skill === 'note'
    ? (({ letter, octave }) => ({ letter, octave }))(
        pitchAtStaffPosition(parsed.clef, parsed.position),
      )
    : null;
  // Only the `name` direction has a hint to offer.
  const hintAvailable = parsed.skill === 'sig' && parsed.direction === 'name';

  const set = (patch: Partial<AnswerState>) =>
    setAnswer(prev => ({ ...prev, ...patch }));

  /**
   * Submit, and write the attempt.
   *
   * Takes the answer to judge EXPLICITLY rather than reading state,
   * because the count direction submits from inside its own onPick —
   * at which point `answer` is still the pre-pick value. Passing the
   * merged answer is what keeps the recorded verdict and the displayed
   * one the same judgement rather than two that usually agree.
   */
  const submit = (finalAnswer: AnswerState) => {
    if (submitted) return;
    setSubmitted(true);
    const v = evaluate(parsed, card, finalAnswer);
    void recordReadingAttempt({
      itemRef: card.itemRef,
      correct: v.correct,
      elapsedMs: Date.now() - shownAt.current,
      noteVerdict: v.noteVerdict,
      hintUsed: hintOn,
    });
  };

  return (
    /* `data-item-ref` names which catalog item is on screen. It is what
       lets a test assert that a focus pool served what it was given,
       and the only alternative was inferring the item from rendered
       glyphs — which would pass on the wrong card whenever two items
       happen to look alike. */
    <div className="space-y-5" data-item-ref={card.itemRef}>
      {/* ---------------------------------------------------------
          The prompt. Key-signature COUNT cards show no staff — the
          prompt is a key name, and drawing the signature would be
          showing the answer.
          --------------------------------------------------------- */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
        {parsed.skill === 'sig' && parsed.direction === 'count' && sig ? (
          <div className="text-center py-6">
            <p className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">
              how many accidentals, and which?
            </p>
            <p className="text-3xl font-medium" style={{ color: SEPIA }}>
              {withAccidentalGlyphs(parsed.mode === 'major' ? sig.major : sig.minor)}{' '}
              {parsed.mode}
            </p>
          </div>
        ) : (
          <ReadingStaff spec={resolved.staff} />
        )}
      </div>

      {/* Verdict + the answer, revealed together. */}
      {submitted && (
        <div className="space-y-2">
          <AnswerVerdict state={correct ? 'correct' : 'incorrect'} />
          <p className="text-center text-sm font-medium" style={{ color: SEPIA }}>
            {resolved.caption}
          </p>
          {/* The notes, under the name. Naming the chord without naming
              its notes skips the connection the drill is building —
              seeing F–A–C and calling it F major. Read off the same
              pitches the staff drew. */}
          {resolved.notes && (
            <p
              data-testid="chord-notes"
              className="text-center text-[15px] tracking-[0.15em] tabular-nums"
              style={{ color: SEPIA }}
            >
              {resolved.notes}
            </p>
          )}
          {parsed.skill === 'note' && (
            // THE ANSWER SCREEN IS WHERE TESTING AND TEACHING MEET.
            // The preview page teaches without testing and the drill
            // tested without teaching; a wrong answer should leave
            // something behind. Shown right or wrong, every time — a
            // mnemonic that only appears after a miss reads as a
            // correction rather than as the thing being learned.
            <div className="space-y-4 pt-1">
              <MnemonicStaff
                mnemonic={mnemonicFor(parsed.clef, parsed.position)}
                accentHex={SEPIA}
              />
              {/* Octave numbers are being tested with nothing to
                  anchor them to. The full 88 is what supplies the
                  anchor: where this note actually falls, how little of
                  the instrument the clef covers, and every C to count
                  from — middle C included, sitting between the staves
                  rather than being a fact to memorise. */}
              <KeyboardDiagram
                highlight={notePitch}
                bracket={staffRangeBracket(parsed.clef)}
                accentHex={SEPIA}
              />
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------- */}
      {/* Answer panels                                             */}
      {/* --------------------------------------------------------- */}

      {parsed.skill === 'note' && (
        <div className="space-y-3">
          <FullSetPicker
            title="letter"
            options={letterOptions()}
            correctId={resolved.caption[0]}
            selectedId={answer.letter}
            locked={submitted}
            onPick={id => set({ letter: id })}
          />
          {/* Octave only after a letter — staged, as designed. The set
              is per-clef, so it is built from the card's own clef. */}
          {answer.letter !== null && (
            <FullSetPicker
              title="octave"
              options={octaveOptions(parsed.clef)}
              correctId={resolved.caption.slice(1)}
              selectedId={answer.octave}
              locked={submitted}
              onPick={id => set({ octave: id })}
            />
          )}
        </div>
      )}

      {parsed.skill === 'shape' && (
        <FullSetPicker
          title="which shape?"
          options={shapeOptions()}
          correctId={card.itemRef}
          selectedId={answer.shape}
          locked={submitted}
          onPick={id => set({ shape: id })}
          gridClassName="grid grid-cols-2 sm:grid-cols-4 gap-2"
        />
      )}

      {hintAvailable && sig && (
        <div className="flex items-center justify-center">
          {/* A LEARNING AID, not a difficulty setting: the hint stays on
              across cards until turned off, and the attempts it
              produces stay in the same pile for streaks and coverage.
              They are recorded as hint-on so "with hint" and "without"
              can be read apart — see readingProgress.ts for why
              excludeFromFluency was the wrong lever. */}
          <label className="flex items-center gap-2 text-[11px] text-neutral-500 cursor-pointer">
            <input
              type="checkbox"
              checked={hintOn}
              onChange={e => setHintOn(e.target.checked)}
            />
            show the accidental count
            {hintOn && (
              <span className="font-medium" style={{ color: SEPIA }}>
                {sig.count === 0
                  ? 'none'
                  : `${sig.count} ${sig.accidental === 'sharp' ? 'sharp' : 'flat'}${sig.count === 1 ? '' : 's'}`}
              </span>
            )}
          </label>
        </div>
      )}

      {parsed.skill === 'sig' && parsed.direction === 'name' && (
        <FullSetPicker
          title={`which ${parsed.mode} key?`}
          options={keyNameOptions(parsed.mode)}
          correctId={parsed.signature}
          selectedId={answer.keyName}
          locked={submitted}
          onPick={id => set({ keyName: id })}
          gridClassName="grid grid-cols-4 sm:grid-cols-7 gap-2"
        />
      )}

      {parsed.skill === 'sig' && parsed.direction === 'count' && (
        <div className="space-y-3">
          <FullSetPicker
            title="how many?"
            options={accidentalCountOptions()}
            correctId={parsed.signature}
            selectedId={answer.count}
            locked={submitted}
            onPick={id => {
              const merged = { ...answer, count: id, sequence: [] };
              set({ count: id, sequence: [] });
              // A wrong KIND ends the attempt here — see
              // countStageAfterPick for why finishing it would
              // rehearse the wrong accidental order. "none" settles
              // too: there is nothing to name. Submitting with the
              // MERGED answer, since state has not caught up yet.
              const stage = countStageAfterPick(parsed.signature as SignatureId, id);
              if (stage.stage === 'settled') submit(merged);
            }}
            gridClassName="grid grid-cols-3 sm:grid-cols-7 gap-2"
          />
          {/* Which ones — only after committing to a number, which is
              the point of the ordering. The kind shown follows the
              user's OWN answer, not the card's, so part one cannot
              leak into part two. */}
          {/* The number is corrected BEFORE the tapping starts. Naming
              four flats while still believing there are three rehearses
              the wrong count — the attempt is wrong either way, but the
              rep should happen against the right number. */}
          {countStage?.stage === 'sequence' && !countStage.countCorrect && (
            <p className="text-center text-xs text-needswork">
              not {SIGNATURES.find(s => s.id === answer.count)?.count}
              {' — '}it&rsquo;s {countStage.actualCount}. name them in order.
            </p>
          )}
          {countStage?.stage === 'sequence' && (
            <AccidentalSequence
              kind={countStage.kind}
              sequence={answer.sequence}
              onChange={seq => set({ sequence: seq })}
              locked={submitted}
              expected={correctAccidentalSequence(parsed.signature as SignatureId)}
            />
          )}
          {submitted && countStage?.stage === 'settled'
            && countStage.reason === 'wrong-kind' && (
            <p className="text-center text-xs text-needswork">
              wrong kind — the key name says which.
            </p>
          )}
        </div>
      )}

      {parsed.skill === 'sig' && parsed.direction === 'which' && sig && (
        <AccidentalSequence
          kind={sig.accidental ?? 'sharp'}
          sequence={answer.sequence}
          onChange={seq => set({ sequence: seq })}
          locked={submitted}
          expected={correctAccidentalSequence(parsed.signature as SignatureId)}
        />
      )}

      {parsed.skill === 'chord' && (
        <ChordPanel
          parsed={parsed}
          answer={answer}
          set={set}
          submitted={submitted}
          correctRootId={card.rootId}
        />
      )}

      {/* Submit / next */}
      <div className="flex justify-center pt-1">
        {!submitted ? (
          <button
            type="button"
            disabled={!ready}
            onClick={() => submit(answer)}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 disabled:cursor-default"
            style={{ backgroundColor: SEPIA }}
          >
            submit
          </button>
        ) : (
          <button
            type="button"
            onClick={next}
            className="px-5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 text-sm font-medium"
          >
            next card
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// "Name them, in order" — tap to append, tap the last to undo.
// ---------------------------------------------------------------------

function AccidentalSequence({
  kind, sequence, onChange, locked, expected,
}: {
  kind: 'sharp' | 'flat';
  sequence: string[];
  onChange: (next: string[]) => void;
  locked: boolean;
  expected: ReadonlyArray<string>;
}) {
  const options = accidentalNameOptions(kind);
  const label = (id: string) => options.find(o => o.id === id)?.label ?? id;

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 text-center">
        which ones, in order
      </div>
      <div className="flex justify-center gap-1.5 flex-wrap min-h-[2rem] items-center">
        {sequence.length === 0 && (
          <span className="text-xs text-neutral-400">tap them in written order</span>
        )}
        {sequence.map((id, i) => {
          const ok = expected[i] === id;
          const cls = locked
            ? ok ? 'border-fluent text-fluent bg-fluent/10'
                 : 'border-needswork text-needswork bg-needswork/10'
            : 'border-neutral-300 dark:border-neutral-600';
          return (
            <span
              key={`${id}-${i}`}
              className={`px-2 py-1 rounded-md border text-xs font-medium ${cls}`}
            >
              {label(id)}
            </span>
          );
        })}
        {!locked && sequence.length > 0 && (
          <button
            type="button"
            onClick={() => onChange(sequence.slice(0, -1))}
            className="text-xs text-neutral-400 hover:text-needswork px-1"
          >
            undo
          </button>
        )}
      </div>
      {locked && (
        <p className="text-center text-xs text-neutral-500">
          answer: {expected.length === 0 ? 'none' : expected.map(label).join(' ')}
        </p>
      )}
      <div className="flex justify-center gap-2 flex-wrap">
        {options.map(o => (
          <button
            key={o.id}
            type="button"
            disabled={locked}
            onClick={() => onChange([...sequence, o.id])}
            className="px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium hover:border-fluent hover:text-fluent disabled:opacity-50 disabled:cursor-default"
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Chord — three picks, all on screen, answerable in any order.
// ---------------------------------------------------------------------

function ChordPanel({
  parsed, answer, set, submitted, correctRootId,
}: {
  parsed: { skill: 'chord'; qualityId: string; position: ChordPosition };
  answer: AnswerState;
  set: (patch: Partial<AnswerState>) => void;
  submitted: boolean;
  correctRootId: string | null;
}) {
  return (
    <div className="space-y-3">
      {/* Top to bottom: inversion, root, quality — the order the
          reading actually goes. Any order is allowed; this is layout.

          The inversion picker is IDENTICAL on every chord card,
          including open shapes, whose answer is "open shape". A picker
          that appeared or disappeared would announce which kind of card
          this is before the staff had been read. */}
      <FullSetPicker
        title="inversion"
        options={inversionOptions()}
        correctId={inversionAnswerFor(parsed.qualityId, parsed.position)}
        selectedId={answer.inversion}
        locked={submitted}
        onPick={id => set({ inversion: id })}
      />
      <FullSetPicker
        title="root"
        options={rootOptions()}
        correctId={correctRootId}
        selectedId={answer.root}
        locked={submitted}
        onPick={id => set({ root: id })}
        gridClassName="grid grid-cols-4 sm:grid-cols-6 gap-2"
      />
      <FullSetPicker
        title="quality"
        options={qualityOptions()}
        correctId={parsed.qualityId}
        selectedId={answer.quality}
        locked={submitted}
        onPick={id => set({ quality: id })}
        gridClassName="grid grid-cols-2 sm:grid-cols-5 gap-2"
      />
    </div>
  );
}
