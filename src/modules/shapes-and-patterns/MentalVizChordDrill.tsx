// Mental-visualisation chord-library drill (SM-2 queue). Walks the
// due-ordered queue of chord voicings: name the chord, picture the
// shape, reveal the interval-colored keyboard, self-rate. Each rating
// records an SM-2 engagement under the 'mental-viz' moduleRef. The
// session banner owns the time; the drill walks the queue until the
// user exits or the queue is exhausted.
import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import PianoKeyboard from '../../components/PianoKeyboard';
import { recordEngagement } from '../../lib/spacingState';
import { loadMentalVizQueue } from './mentalVizQueue';
import { MENTAL_VIZ_MODULE_REF, type MentalVizItem } from './mentalVizLibrary';

type Rating = 'flying' | 'cruising' | 'crawling';
type Phase = 'loading' | 'prompt' | 'reveal' | 'done';

const RATINGS: ReadonlyArray<{ value: Rating; label: string; hint: string; cls: string }> = [
  { value: 'flying', label: 'Flying', hint: 'saw it instantly',
    cls: 'border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10' },
  { value: 'cruising', label: 'Cruising', hint: 'got there, took a beat',
    cls: 'border-fluent/40 text-fluent hover:bg-fluent/10' },
  { value: 'crawling', label: 'Crawling', hint: 'struggled / blanked',
    cls: 'border-needswork/40 text-needswork hover:bg-needswork/10' },
];

export default function MentalVizChordDrill({ onClose }: { onClose: () => void }) {
  const [queue, setQueue] = useState<MentalVizItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [reps, setReps] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const q = await loadMentalVizQueue();
      if (cancelled) return;
      setQueue(q);
      setPhase(q.length > 0 ? 'prompt' : 'done');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = queue ? queue[idx] : undefined;

  const rate = async (rating: Rating) => {
    if (!current || saving) return;
    setSaving(true);
    try {
      await recordEngagement({
        itemRef: current.itemRef,
        moduleRef: MENTAL_VIZ_MODULE_REF,
        signal: { kind: 'rating', rating },
      });
      setReps(r => r + 1);
      const next = idx + 1;
      if (queue && next < queue.length) {
        setIdx(next);
        setPhase('prompt');
      } else {
        setPhase('done');
      }
    } catch (err) {
      // Don't let a failed engagement silently strand the card — surface
      // it so a signal/memory-type mismatch can't fail unnoticed again.
      console.error('[mental-viz] failed to record rating', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Mental Visualization"
      description="Picture the shape on the keyboard, then reveal"
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

      {(phase === 'prompt' || phase === 'reveal') && current && (
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">visualize</div>
            <div className="text-2xl font-semibold text-neutral-800 dark:text-neutral-100 mt-1">
              {current.prompt}
            </div>
            {phase === 'reveal' && current.altName && (
              <div className="text-sm text-neutral-500 mt-0.5">(= {current.altName})</div>
            )}
          </div>

          {phase === 'prompt' ? (
            <button
              type="button"
              onClick={() => setPhase('reveal')}
              className="w-full px-3 py-3 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
            >
              Reveal
            </button>
          ) : (
            <div className="space-y-4">
              <PianoKeyboard
                rootPc={current.rootPc}
                voicing={current.voicing}
                preferFlats={current.preferFlats}
                octaves={4}
                absoluteOffsets
              />
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-neutral-500 text-center">
                  how did it feel?
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {RATINGS.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => void rate(r.value)}
                      disabled={saving}
                      className={`w-full px-3 py-2 rounded-md border text-sm text-left transition-colors disabled:opacity-50 ${r.cls}`}
                    >
                      <span className="font-medium">{r.label}</span>
                      <span className="ml-2 opacity-70 text-xs">{r.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'done' && (
        <div className="py-10 text-center text-sm text-neutral-700 dark:text-neutral-200">
          {reps > 0
            ? `Nice — ${reps} chord${reps === 1 ? '' : 's'} visualized this round.`
            : 'No chords in the queue right now.'}
        </div>
      )}
    </Modal>
  );
}
