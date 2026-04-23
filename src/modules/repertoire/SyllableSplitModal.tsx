import { useState } from 'react';
import Modal from '../../components/Modal';

interface Props {
  word: string;
  /** Initial split positions, as character indices into `word`.
   *  Index 0 and `word.length` are never valid splits. */
  initialSplits: number[];
  onCancel: () => void;
  onApply: (splits: number[]) => void;
}

/**
 * Modal that lets the user split a word into syllable-sized beats.
 * The word's letters render as boxes; between each pair of letters
 * is a clickable gap that toggles a split point. A live preview
 * below the boxes shows what the joined rendering will look like
 * ("A-maz-ing"). Applying commits the splits via `onApply`.
 */
export default function SyllableSplitModal({ word, initialSplits, onCancel, onApply }: Props) {
  const [splits, setSplits] = useState<Set<number>>(() => new Set(initialSplits));

  const toggleSplit = (pos: number) => {
    setSplits(prev => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  };

  const preview = buildPreview(word, splits);

  const letters = word.split('');

  return (
    <Modal
      open
      onClose={onCancel}
      title="split word into syllables"
      description="tap between letters to add a split. tap an existing split (shown in green) to remove it."
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            cancel
          </button>
          <button
            onClick={() => {
              onApply([...splits].sort((a, b) => a - b));
            }}
            className="px-4 py-1.5 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
          >
            apply splits
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2">
            the word
          </div>
          <div className="flex items-stretch flex-wrap font-mono text-base">
            {letters.map((letter, i) => (
              <span key={i} className="inline-flex items-stretch">
                <span className="inline-flex items-center justify-center px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 min-w-[1.6rem]">
                  {letter}
                </span>
                {i < letters.length - 1 && (
                  <button
                    onClick={() => toggleSplit(i + 1)}
                    className={`inline-flex items-center justify-center px-1 transition ${
                      splits.has(i + 1)
                        ? 'text-fluent hover:text-needswork'
                        : 'text-neutral-300 hover:text-fluent'
                    }`}
                    aria-label={splits.has(i + 1) ? 'remove split' : 'add split'}
                    title={splits.has(i + 1) ? 'remove split' : 'add split'}
                  >
                    {splits.has(i + 1) ? '│' : '·'}
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
            preview
          </div>
          <div className="font-mono text-base tracking-tight text-neutral-800 dark:text-neutral-100">
            {preview.length === 1
              ? preview[0]
              : preview.join('-')}
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">
            each syllable becomes its own beat with its own chord slot. joining hyphens are visual only.
          </p>
        </div>

        {splits.size > 0 && (
          <button
            onClick={() => setSplits(new Set())}
            className="text-xs text-neutral-500 hover:text-fluent"
          >
            clear all splits
          </button>
        )}
      </div>
    </Modal>
  );
}

function buildPreview(word: string, splits: Set<number>): string[] {
  const positions = [...splits].filter(i => i > 0 && i < word.length).sort((a, b) => a - b);
  if (positions.length === 0) return [word];
  const out: string[] = [];
  let prev = 0;
  for (const pos of positions) {
    out.push(word.slice(prev, pos));
    prev = pos;
  }
  out.push(word.slice(prev));
  return out.filter(s => s.length > 0);
}
