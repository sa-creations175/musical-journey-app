/**
 * Reading drill — the answering surface.
 *
 * NO ATTEMPT WRITING. Nothing here touches Dexie: no `addAttempt`, no
 * `recordEngagement`, no daily summary. Sub-step 4.3 adds that on top
 * of whatever this settles into. Answering, verdicts and the reveal
 * are all local state, so this can be reshaped without touching data.
 *
 * NO TIMER AND NO SPEED PRESSURE anywhere in here. Elapsed time gets
 * measured silently when the attempt writer lands; nothing about it is
 * shown to the user, by design.
 *
 * Every answer set comes from `answerModels.ts` and every option list
 * is derived from the catalog, so a picker cannot offer an answer the
 * card could not have, or omit one it could.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReadingStaff from './ReadingStaff';
import FullSetPicker from '../../components/FullSetPicker';
import AnswerVerdict from '../../components/AnswerVerdict';
import { resolveReadingCard } from './renderCard';
import { pickCard, type ReadingDrillSkill, type PickedCard } from './pickCard';
import {
  SIGNATURES,
  parseReadingItemRef,
  type ChordPosition,
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
  letterOptions,
  mnemonicFor,
  octaveOptions,
  qualityOptions,
  rootOptions,
  shapeOptions,
} from './answerModels';
import { withAccidentalGlyphs } from './pitch';

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

export default function ReadingDrill({ skill }: { skill: ReadingDrillSkill }) {
  const [card, setCard] = useState<PickedCard | null>(null);
  const [answer, setAnswer] = useState<AnswerState>(EMPTY);
  const [submitted, setSubmitted] = useState(false);

  const next = useCallback(() => {
    setCard(pickCard(skill));
    setAnswer(EMPTY);
    setSubmitted(false);
  }, [skill]);

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

  // -------------------------------------------------------------
  // Verdicts — computed, never stored. Storing a verdict alongside
  // the answer is how the two drift.
  // -------------------------------------------------------------
  const sig = parsed.skill === 'sig'
    ? SIGNATURES.find(s => s.id === parsed.signature) ?? null
    : null;

  // Which stage the count direction is in, derived from the answer
  // rather than stored — a stored stage is a second source of truth
  // that can disagree with the pick that produced it.
  const countStage =
    parsed.skill === 'sig' && parsed.direction === 'count' && answer.count !== null
      ? countStageAfterPick(parsed.signature as SignatureId, answer.count)
      : null;

  let correct = false;
  let ready = false;
  if (parsed.skill === 'note') {
    ready = answer.letter !== null && answer.octave !== null;
    correct = judgeNote(parsed.clef, parsed.position, answer.letter, answer.octave).correct;
  } else if (parsed.skill === 'shape') {
    ready = answer.shape !== null;
    correct = answer.shape === card.itemRef;
  } else if (parsed.skill === 'sig') {
    if (parsed.direction === 'count') {
      // A settled stage is already answered — a wrong kind, or "none",
      // needs no sequence to be complete.
      ready = countStage !== null
        && (countStage.stage === 'settled' || answer.sequence.length > 0);
      correct = judgeSignatureCount(
        parsed.signature as SignatureId, answer.count, answer.sequence,
      ).correct;
    } else if (parsed.direction === 'which') {
      const expected = correctAccidentalSequence(parsed.signature as SignatureId);
      ready = answer.sequence.length > 0 || expected.length === 0;
      correct = answer.sequence.length === expected.length
        && expected.every((a, i) => answer.sequence[i] === a);
    } else {
      ready = answer.keyName !== null;
      correct = answer.keyName === parsed.signature;
    }
  } else {
    // Every chord card asks all three, open shapes included — their
    // inversion answer is 'open shape', which is a real answer.
    ready = answer.root !== null && answer.quality !== null
      && answer.inversion !== null;
    correct = judgeChord(
      {
        position: inversionAnswerFor(parsed.qualityId, parsed.position),
        rootId: card.rootId ?? '',
        qualityId: parsed.qualityId,
      },
      { position: answer.inversion, rootId: answer.root, qualityId: answer.quality },
    ).correct;
  }

  const set = (patch: Partial<AnswerState>) =>
    setAnswer(prev => ({ ...prev, ...patch }));

  return (
    <div className="space-y-5">
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
          {parsed.skill === 'note' && (
            // Right or wrong, every time — a mnemonic shown only after
            // a miss reads as a correction rather than as the thing
            // being learned.
            <p className="text-center text-xs text-neutral-500">
              {mnemonicFor(parsed.clef, parsed.position)}
            </p>
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
              set({ count: id, sequence: [] });
              // A wrong KIND ends the attempt here — see
              // countStageAfterPick for why finishing it would
              // rehearse the wrong accidental order. "none" settles
              // too: there is nothing to name.
              const stage = countStageAfterPick(parsed.signature as SignatureId, id);
              if (stage.stage === 'settled') setSubmitted(true);
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
            onClick={() => setSubmitted(true)}
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
