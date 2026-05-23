// Chord Progression Quiz drill (SM-2 queue). Walks the due-ordered queue
// of (section × question type) items and poses each one's type:
//   · Recall (1)        — name the progression, reveal, self-rate.
//   · Multiple Choice (2) — pick the progression (distractors from other
//     songs); rating pre-filled from correctness, overridable.
//   · Bar Count (4)     — how many bars; same pre-filled rating.
//   · Transpose scaffold (5a) — numbers shown, recall the concrete chords
//     in a target key.
//   · Transpose full (5b)     — nothing shown, recall numbers + chords in
//     a target key.
// Each (section, type) is its own SM-2 row (itemRef carries the type).
// Every rating records a procedural engagement under the
// 'chord-progression-quiz' moduleRef. The session banner owns the time.

import { useEffect, useMemo, useState } from 'react';
import Modal from '../../../components/Modal';
import { recordEngagement } from '../../../lib/spacingState';
import { renderConcrete, renderNumbers } from '../../repertoire/chordFunction';
import {
  CHORD_PROGRESSION_QUIZ_MODULE_REF,
  buildBarCountOptions,
  buildProgressionChoices,
  degreeColor,
  pickDisplayKey,
  pickTransposeKey,
  ratingFromCorrectness,
  type QuizRating,
} from './progressionQuiz';
import {
  distractorPoolFor,
  filterItemsBySong,
  loadProgressionQuizQueue,
  type ProgressionQuizItem,
} from './progressionQuizQueue';
import ProgressionBarGrid from './ProgressionBarGrid';

type Phase = 'loading' | 'prompt' | 'reveal' | 'done';

/** The reveal's two summary lines show at most this many chords; the bar
 *  grid below carries the full loop. */
const MAX_SUMMARY_CHORDS = 6;

type Question =
  | { type: 'recall'; displayKey: string }
  | { type: 'mc'; options: string[]; correctIndex: number }
  | { type: 'barcount'; options: number[]; correctIndex: number }
  | { type: 'transpose-scaffold'; targetKey: string }
  | { type: 'transpose-full'; targetKey: string };

const RATINGS: ReadonlyArray<{ value: QuizRating; label: string; hint: string; cls: string }> = [
  { value: 'flying', label: 'Flying', hint: 'knew it cold',
    cls: 'border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10' },
  { value: 'cruising', label: 'Cruising', hint: 'got there, took a beat',
    cls: 'border-fluent/40 text-fluent hover:bg-fluent/10' },
  { value: 'crawling', label: 'Crawling', hint: 'struggled / blanked',
    cls: 'border-needswork/40 text-needswork hover:bg-needswork/10' },
];

const TYPE_LABEL: Record<Question['type'], string> = {
  recall: 'recall the progression',
  mc: 'what is the progression?',
  barcount: 'how many bars?',
  'transpose-scaffold': 'recall the chords in this key',
  'transpose-full': 'recall the numbers + chords',
};

/** Build the question data for an item's type. Objective types (mc /
 *  barcount) carry their options; transpose types carry a target key
 *  (a common practice key other than the song's own, rotating per card).
 *  mc falls back to recall if a section somehow lacks distractors. */
function buildQuestion(
  item: ProgressionQuizItem,
  allItems: ReadonlyArray<ProgressionQuizItem>,
  rng: () => number,
): Question {
  switch (item.type) {
    case 'mc': {
      const pool = distractorPoolFor(item, allItems);
      if (pool.length >= 3) return { type: 'mc', ...buildProgressionChoices(item.romanLine, pool, rng) };
      return { type: 'recall', displayKey: pickDisplayKey(item.song.key, rng) };
    }
    case 'barcount':
      return { type: 'barcount', ...buildBarCountOptions(item.barCount, rng) };
    case 'transpose-scaffold':
      return { type: 'transpose-scaffold', targetKey: pickTransposeKey(item.song.key, rng) };
    case 'transpose-full':
      return { type: 'transpose-full', targetKey: pickTransposeKey(item.song.key, rng) };
    case 'recall':
    default:
      return { type: 'recall', displayKey: pickDisplayKey(item.song.key, rng) };
  }
}

export default function ChordProgressionQuizDrill({
  onClose,
  songId,
}: {
  onClose: () => void;
  /** When set (chord-quiz warm-up Level-3 nav), the walked queue is
   *  scoped to this song's sections. Multiple-choice distractors still
   *  draw from the full library (other songs). */
  songId?: string;
}) {
  const [allItems, setAllItems] = useState<ProgressionQuizItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [reps, setReps] = useState(0);
  const [answeredIndex, setAnsweredIndex] = useState<number | null>(null);
  const [selectedRating, setSelectedRating] = useState<QuizRating | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const q = await loadProgressionQuizQueue();
      if (cancelled) return;
      setAllItems(q);
      const walked = songId ? filterItemsBySong(q, songId) : q;
      setPhase(walked.length > 0 ? 'prompt' : 'done');
    })();
    return () => {
      cancelled = true;
    };
  }, [songId]);

  // The walked queue: one song in song-filtered mode, else everything.
  const queue = useMemo<ProgressionQuizItem[] | null>(
    () => (allItems ? (songId ? filterItemsBySong(allItems, songId) : allItems) : null),
    [allItems, songId],
  );

  const current = queue ? queue[idx] : undefined;

  // One question per card, stable until the card changes. Distractors
  // draw from the FULL library so song-filtered mode still has options
  // from other songs.
  const question = useMemo<Question | null>(
    () => (current && allItems ? buildQuestion(current, allItems, Math.random) : null),
    [current, allItems],
  );

  const advance = () => {
    const next = idx + 1;
    setAnsweredIndex(null);
    setSelectedRating(null);
    if (queue && next < queue.length) {
      setIdx(next);
      setPhase('prompt');
    } else {
      setPhase('done');
    }
  };

  // Reveal for the self-rated types (recall / transpose) — no answer to
  // score, so the rating starts blank.
  const reveal = () => setPhase('reveal');

  // Answer an objective question: score it, pre-fill the rating, reveal.
  const answer = (optionIndex: number, correct: boolean) => {
    setAnsweredIndex(optionIndex);
    setSelectedRating(ratingFromCorrectness(correct));
    setPhase('reveal');
  };

  const submitRating = async () => {
    if (!current || selectedRating == null || saving) return;
    setSaving(true);
    try {
      await recordEngagement({
        itemRef: current.itemRef,
        moduleRef: CHORD_PROGRESSION_QUIZ_MODULE_REF,
        signal: { kind: 'rating', rating: selectedRating },
      });
      setReps(r => r + 1);
      advance();
    } catch (err) {
      // Surface a failed engagement rather than silently stranding the card.
      console.error('[chord-progression-quiz] failed to record rating', err);
    } finally {
      setSaving(false);
    }
  };

  const isObjective = question?.type === 'mc' || question?.type === 'barcount';
  const transposeKey =
    question?.type === 'transpose-scaffold' || question?.type === 'transpose-full'
      ? question.targetKey
      : undefined;
  // Which key to render concrete chord letters in on the reveal:
  //   · recall (Type 1) — a rotating display key (incl. the song's own),
  //     so each recall builds familiarity in a different key.
  //   · transpose (5a/5b) — the prompted target key.
  //   · mc / bar-count — none (those stay key-agnostic).
  const concreteKey =
    question?.type === 'recall' ? question.displayKey : transposeKey;
  const answeredCorrectly =
    !!question && isObjective && answeredIndex === (question as { correctIndex: number }).correctIndex;

  return (
    <Modal
      open
      onClose={onClose}
      title="Chord Progression Quiz"
      description="Recall the progression from your lead sheet"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-[11px] text-neutral-400">
            {queue && queue.length > 0 && phase !== 'done'
              ? `${idx + 1} of ${queue.length} · ${reps} rated`
              : `${reps} rated`}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            {phase === 'done' ? 'Done' : 'End drill'}
          </button>
        </div>
      }
    >
      {phase === 'loading' && (
        <div className="py-10 text-center text-sm text-neutral-500">Loading queue…</div>
      )}

      {(phase === 'prompt' || phase === 'reveal') && current && question && (
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">
              {TYPE_LABEL[question.type]}
            </div>
            <div className="text-xl font-semibold text-neutral-800 dark:text-neutral-100 mt-1">
              {current.prompt}
            </div>
            {transposeKey && (
              <div className="text-sm text-fluent font-medium mt-0.5">
                in the key of {transposeKey}
              </div>
            )}
          </div>

          {/* ---- PROMPT phase ---- */}
          {phase === 'prompt' && (question.type === 'recall' || question.type === 'transpose-full') && (
            <button
              type="button"
              onClick={reveal}
              className="w-full px-3 py-3 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
            >
              Reveal
            </button>
          )}

          {phase === 'prompt' && question.type === 'transpose-scaffold' && (
            <div className="space-y-3">
              {/* Numbers shown as scaffolding — recall the concrete chords. */}
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm font-medium text-neutral-700 dark:text-neutral-200">
                {current.chords.map((ch, i) => (
                  <span key={i}>{renderNumbers(ch)}</span>
                ))}
              </div>
              <button
                type="button"
                onClick={reveal}
                className="w-full px-3 py-3 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
              >
                Reveal
              </button>
            </div>
          )}

          {phase === 'prompt' && question.type === 'mc' && (
            <div className="grid grid-cols-1 gap-2">
              {question.options.map((opt, i) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => answer(i, i === question.correctIndex)}
                  className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm text-left font-medium hover:border-fluent hover:bg-fluent/5"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {phase === 'prompt' && question.type === 'barcount' && (
            <div className="grid grid-cols-2 gap-2">
              {question.options.map((opt, i) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => answer(i, i === question.correctIndex)}
                  className="w-full px-3 py-3 rounded-md border border-neutral-200 dark:border-neutral-700 text-base font-semibold tabular-nums hover:border-fluent hover:bg-fluent/5"
                >
                  {opt} bars
                </button>
              ))}
            </div>
          )}

          {/* ---- REVEAL phase ---- */}
          {phase === 'reveal' && (
            <div className="space-y-4">
              {isObjective && (
                <div
                  className={`text-center text-sm font-medium ${
                    answeredCorrectly ? 'text-fluent' : 'text-needswork'
                  }`}
                >
                  {answeredCorrectly ? 'Correct' : 'Not quite'}
                  {question.type === 'barcount' && (
                    <span className="text-neutral-500 font-normal">
                      {' '}— {current.barCount} bars
                    </span>
                  )}
                </div>
              )}

              {/* Compact summary — first 6 chords only (the bar grid below
                  shows the full loop). One column per chord: Nashville
                  number (colored by scale degree) on top, concrete chord in
                  the rotating/target key directly below, vertically aligned.
                  "in the key of X:" is a single left-side label for the
                  concrete row (bottom-aligned via justify-end), not repeated
                  per chord. Roman numerals are omitted (a future type). */}
              <div className="flex flex-wrap justify-center items-stretch gap-x-4 gap-y-2">
                {concreteKey && (
                  <div className="flex flex-col justify-end leading-tight whitespace-nowrap pr-0.5 text-[11px] text-neutral-400">
                    in the key of {concreteKey}:
                  </div>
                )}
                {current.chords.slice(0, MAX_SUMMARY_CHORDS).map((ch, i) => (
                  <div key={i} className="flex flex-col items-center leading-tight whitespace-nowrap">
                    <span className="text-lg font-bold" style={{ color: degreeColor(ch) }}>
                      {renderNumbers(ch)}
                    </span>
                    {concreteKey && (
                      <span className="text-sm text-neutral-700 dark:text-neutral-200">
                        {renderConcrete(ch, concreteKey)}
                      </span>
                    )}
                  </div>
                ))}
                {/* Invisible mirror of the left label so the chord columns
                    stay centered rather than pushed right by it. */}
                {concreteKey && (
                  <div
                    aria-hidden
                    className="invisible flex flex-col justify-end leading-tight whitespace-nowrap pl-0.5 text-[11px]"
                  >
                    in the key of {concreteKey}:
                  </div>
                )}
              </div>

              <ProgressionBarGrid song={current.song} section={current.section} />

              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-neutral-500 text-center">
                  how did it feel?
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {RATINGS.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setSelectedRating(r.value)}
                      aria-pressed={selectedRating === r.value}
                      className={`w-full px-3 py-2 rounded-md border text-sm text-left transition-colors ${r.cls} ${
                        selectedRating === r.value ? 'ring-2 ring-offset-1 ring-fluent/50' : ''
                      }`}
                    >
                      <span className="font-medium">{r.label}</span>
                      <span className="ml-2 opacity-70 text-xs">{r.hint}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void submitRating()}
                  disabled={selectedRating == null || saving}
                  className="w-full px-3 py-2.5 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {idx + 1 < (queue?.length ?? 0) ? 'Next' : 'Finish'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'done' && (
        <div className="py-10 text-center text-sm text-neutral-700 dark:text-neutral-200">
          {reps > 0
            ? `Nice — ${reps} progression${reps === 1 ? '' : 's'} reviewed this round.`
            : 'No charted progressions yet — add chords to a song’s lead sheet to quiz them.'}
        </div>
      )}
    </Modal>
  );
}
