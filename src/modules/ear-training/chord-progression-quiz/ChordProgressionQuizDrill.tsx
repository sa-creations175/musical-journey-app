// Chord Progression Quiz drill (SM-2 queue). Walks the due-ordered queue
// of repertoire sections and, per card, poses one of three question
// types (design spec):
//   · Pure Recall  — recall the progression, reveal, self-rate.
//   · Multiple Choice — pick the progression (distractors from other
//     songs); the rating is pre-filled from correctness, overridable.
//   · Bar Count — how many bars is the section; same pre-filled rating.
// Every rating records a procedural SM-2 engagement under the
// 'chord-progression-quiz' moduleRef. The session banner owns the time.

import { useEffect, useMemo, useState } from 'react';
import Modal from '../../../components/Modal';
import { recordEngagement } from '../../../lib/spacingState';
import {
  renderConcrete,
  renderNumbers,
  renderRoman,
} from '../../repertoire/chordFunction';
import {
  CHORD_PROGRESSION_QUIZ_MODULE_REF,
  buildBarCountOptions,
  buildProgressionChoices,
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

type Question =
  | { type: 'recall' }
  | { type: 'mc'; options: string[]; correctIndex: number }
  | { type: 'barcount'; options: number[]; correctIndex: number };

const RATINGS: ReadonlyArray<{ value: QuizRating; label: string; hint: string; cls: string }> = [
  { value: 'flying', label: 'Flying', hint: 'knew it cold',
    cls: 'border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10' },
  { value: 'cruising', label: 'Cruising', hint: 'got there, took a beat',
    cls: 'border-fluent/40 text-fluent hover:bg-fluent/10' },
  { value: 'crawling', label: 'Crawling', hint: 'struggled / blanked',
    cls: 'border-needswork/40 text-needswork hover:bg-needswork/10' },
];

/** Choose a question type for an item and generate its data. Recall and
 *  Bar-Count are always available; Multiple-Choice needs ≥3 distractor
 *  progressions from other songs. */
function buildQuestion(
  item: ProgressionQuizItem,
  allItems: ReadonlyArray<ProgressionQuizItem>,
  rng: () => number,
): Question {
  const pool = distractorPoolFor(item, allItems);
  const choices = pool.length >= 3 ? buildProgressionChoices(item.romanLine, pool, rng) : null;
  const types: Question['type'][] = ['recall', 'barcount'];
  if (choices) types.push('mc');
  const chosen = types[Math.floor(rng() * types.length)];
  if (chosen === 'mc' && choices) return { type: 'mc', ...choices };
  if (chosen === 'barcount') return { type: 'barcount', ...buildBarCountOptions(item.barCount, rng) };
  return { type: 'recall' };
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

  // Reveal for the recall type (no answer to score — rating starts blank).
  const revealRecall = () => setPhase('reveal');

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

  const answeredCorrectly =
    question && question.type !== 'recall' && answeredIndex === question.correctIndex;

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
              {question.type === 'barcount'
                ? 'how many bars?'
                : question.type === 'mc'
                  ? 'what is the progression?'
                  : 'recall the progression'}
            </div>
            <div className="text-xl font-semibold text-neutral-800 dark:text-neutral-100 mt-1">
              {current.prompt}
            </div>
          </div>

          {/* ---- PROMPT phase ---- */}
          {phase === 'prompt' && question.type === 'recall' && (
            <button
              type="button"
              onClick={revealRecall}
              className="w-full px-3 py-3 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
            >
              Reveal
            </button>
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
              {question.type !== 'recall' && (
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

              {/* Full progression, chord-by-chord (no collapsing held
                  chords — show the whole loop). Nashville number is the
                  primary label; Roman numeral + concrete chord sit
                  beneath in smaller text. */}
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-3">
                {current.chords.map((ch, i) => (
                  <div key={i} className="text-center leading-tight">
                    <div className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
                      {renderNumbers(ch)}
                    </div>
                    <div className="text-xs text-neutral-400">{renderRoman(ch)}</div>
                    <div className="text-[11px] text-neutral-500">
                      {renderConcrete(ch, current.song.key)}
                    </div>
                  </div>
                ))}
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
