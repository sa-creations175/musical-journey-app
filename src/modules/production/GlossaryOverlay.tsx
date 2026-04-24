import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toaster';
import { glossaryById } from './content/glossary';
import { lessonById } from './content/lessons';
import { markGlossaryGotIt, recordGlossaryOpen, resetGlossaryMastery } from './data';

interface Props {
  termId: string;
  onClose: () => void;
  /** Called when the user clicks "open primary lesson" — caller
   *  navigates to the lesson and dismisses the overlay. */
  onOpenLesson?: (lessonId: string) => void;
}

/**
 * Glossary term overlay. Opens inline from any `[[term-id]]` link
 * in a lesson, or from the standalone Glossary view. Shows the
 * plain-language definition, a concrete example, why-it-matters,
 * and a "Got it" toggle. Records each open so freshness and
 * "revisits" heuristics can grow later.
 */
export default function GlossaryOverlay({ termId, onClose, onOpenLesson }: Props) {
  const { toast } = useToast();
  const content = glossaryById(termId);

  const state = useLiveQuery(
    async () => db.glossaryTermStates.get(termId),
    [termId],
  );

  useEffect(() => {
    // Fire-and-forget record-open — avoids making this a setState
    // loop.
    void recordGlossaryOpen(termId);
  }, [termId]);

  if (!content) {
    return (
      <Modal open onClose={onClose} title="term not found">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          The glossary term "{termId}" isn't in the catalogue yet.
        </p>
      </Modal>
    );
  }

  const gotIt = state?.mastery === 'got-it';

  const primaryLesson = content.relatedLessons[0]
    ? lessonById(content.relatedLessons[0])
    : undefined;

  return (
    <Modal
      open
      onClose={onClose}
      title={content.name}
      description="glossary term"
      footer={
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {gotIt ? (
              <button
                onClick={async () => {
                  await resetGlossaryMastery(termId);
                  toast({ message: 'marked as "not yet."', variant: 'warning', duration: 1600 });
                }}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-500 hover:text-needswork hover:border-needswork"
              >
                un-mark
              </button>
            ) : (
              <button
                onClick={async () => {
                  await markGlossaryGotIt(termId);
                  toast({ message: `"${content.name}" marked as got it.`, variant: 'success', duration: 1800 });
                }}
                className="px-3 py-1.5 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
              >
                got it ✓
              </button>
            )}
            {primaryLesson && onOpenLesson && (
              <button
                onClick={() => onOpenLesson(primaryLesson.id)}
                className="px-3 py-1.5 rounded-md border border-fluent text-fluent text-sm hover:bg-fluent/10"
              >
                open primary lesson →
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            close
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        {gotIt && (
          <div className="rounded-md bg-fluent/10 text-fluent px-3 py-1.5 text-xs">
            you've marked this as got it.
          </div>
        )}
        <section>
          <h4 className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">definition</h4>
          <p className="leading-relaxed">{content.definition}</p>
        </section>
        <section>
          <h4 className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">example</h4>
          <p className="leading-relaxed italic text-neutral-600 dark:text-neutral-300">{content.example}</p>
        </section>
        <section>
          <h4 className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">why it matters</h4>
          <p className="leading-relaxed">{content.whyItMatters}</p>
        </section>
        {content.relatedLessons.length > 0 && (
          <section>
            <h4 className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">related lessons</h4>
            <ul className="space-y-1">
              {content.relatedLessons.map(lid => {
                const l = lessonById(lid);
                if (!l) return null;
                return (
                  <li key={lid} className="text-xs text-neutral-600 dark:text-neutral-300">
                    {l.title}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
