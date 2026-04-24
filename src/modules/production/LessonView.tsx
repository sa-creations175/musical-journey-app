import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ProductionLessonMastery } from '../../lib/db';
import { lessonById } from './content/lessons';
import { glossaryById } from './content/glossary';
import { referenceTrackById } from './content/referenceTracks';
import { pathById } from './content/paths';
import { recordLessonOpen, updateLessonMastery } from './data';
import GlossaryOverlay from './GlossaryOverlay';

interface Props {
  lessonId: string;
  /** Hook back to the parent router so "back to path" and other
   *  navigation can stay under the caller's control. */
  onBack: () => void;
}

const MASTERY_LABEL: Record<ProductionLessonMastery, string> = {
  'not-started': 'not started',
  'in-progress': 'in progress',
  'completed':   'completed',
  'mastered':    'mastered',
};

/**
 * Single-lesson view. Surface content is always visible; the Deep
 * Dive layer expands on demand. Glossary terms render as inline
 * chips that open an overlay. Footer carries the self-assessment
 * ("Got it" / "Need more") plus the YouTube link and revisit count.
 */
export default function LessonView({ lessonId, onBack }: Props) {
  const lesson = lessonById(lessonId);
  const path = lesson ? pathById(lesson.pathId) : undefined;

  const [showDeepDive, setShowDeepDive] = useState(false);
  const deepDiveLoggedRef = useRef(false);
  const [glossaryOpen, setGlossaryOpen] = useState<string | null>(null);

  // Record an open event once per mount. The effect is guarded so
  // re-opening Deep Dive doesn't double-count.
  useEffect(() => {
    if (!lesson) return;
    void recordLessonOpen(lesson.id, false);
    deepDiveLoggedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  // When the user opens Deep Dive, log a second (enriched) session
  // event — lets freshness heuristics see which lessons get the
  // full treatment vs. a quick skim. Guarded with a ref so we avoid
  // setState-in-effect cascades.
  useEffect(() => {
    if (!lesson) return;
    if (showDeepDive && !deepDiveLoggedRef.current) {
      deepDiveLoggedRef.current = true;
      void recordLessonOpen(lesson.id, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDeepDive]);

  const state = useLiveQuery(
    async () => (lesson ? db.productionLessons.get(lesson.id) : undefined),
    [lessonId],
  );

  if (!lesson || !path) {
    return (
      <div className="space-y-3">
        <button onClick={onBack} className="text-xs text-neutral-500 hover:text-fluent">← back</button>
        <p className="text-sm text-neutral-500 italic">lesson not found.</p>
      </div>
    );
  }

  const mastery = state?.mastery ?? 'not-started';
  const revisitCount = state?.revisitCount ?? 0;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <header className="space-y-2">
        <button
          onClick={onBack}
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          ← back to {path.title}
        </button>
        <h1 className="text-2xl font-medium tracking-tight">{lesson.title}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 italic">
          {lesson.goal}
        </p>
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-neutral-500">
          <span>{path.title}</span>
          <span className="text-neutral-400">·</span>
          <span className={mastery === 'completed' || mastery === 'mastered' ? 'text-fluent font-medium' : ''}>
            {MASTERY_LABEL[mastery]}
          </span>
          {revisitCount > 0 && (
            <>
              <span className="text-neutral-400">·</span>
              <span>revisited {revisitCount}×</span>
            </>
          )}
        </div>
      </header>

      {/* Surface content */}
      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-5 space-y-3">
        <div className="text-[10px] uppercase tracking-wide text-production font-medium">
          the idea
        </div>
        <ProseWithGlossary text={lesson.surface} onOpenTerm={setGlossaryOpen} />

        {/* Try now */}
        <div className="rounded-md border border-production/40 bg-production/5 p-3 space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-production font-medium">
            try now
          </div>
          <p className="text-sm leading-relaxed">{lesson.tryNow}</p>
        </div>
      </section>

      {/* Deep dive toggle */}
      <section>
        <button
          onClick={() => setShowDeepDive(v => !v)}
          className="w-full rounded-card border border-neutral-200 dark:border-neutral-800 px-4 py-3 text-left flex items-center justify-between hover:border-production/60 transition-colors"
        >
          <div>
            <div className="text-sm font-medium">Deep dive</div>
            <div className="text-[11px] text-neutral-500">
              Extended treatment — 15-30 minutes. More examples, nuance, reference songs.
            </div>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 10 10"
            className={`transition-transform text-neutral-500 ${showDeepDive ? 'rotate-90' : ''}`}
            aria-hidden
          >
            <path d="M3 1.5L7 5L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {showDeepDive && (
          <div className="mt-2 rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-5">
            <ProseWithGlossary text={lesson.deepDive} onOpenTerm={setGlossaryOpen} />
          </div>
        )}
      </section>

      {/* Reference tracks */}
      {lesson.referenceTracks && lesson.referenceTracks.length > 0 && (
        <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-5 space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium">
            listen with this lesson
          </div>
          <ul className="space-y-1.5">
            {lesson.referenceTracks.map(rid => {
              const t = referenceTrackById(rid);
              if (!t) return null;
              return (
                <li key={rid} className="text-sm">
                  <span className="font-medium">{t.title}</span>
                  <span className="text-neutral-500"> — {t.artist}</span>
                  <span className="block text-[11px] text-neutral-500 mt-0.5">{t.whatToListenFor}</span>
                </li>
              );
            })}
          </ul>
          <Link
            to="/production?view=reference-tracks"
            className="inline-block text-[11px] text-production hover:underline"
          >
            open full reference library →
          </Link>
        </section>
      )}

      {/* Glossary terms in this lesson */}
      {lesson.glossaryTerms.length > 0 && (
        <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-5 space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium">
            glossary terms introduced
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lesson.glossaryTerms.map(tid => {
              const t = glossaryById(tid);
              if (!t) return null;
              return (
                <button
                  key={tid}
                  onClick={() => setGlossaryOpen(tid)}
                  className="px-2 py-0.5 rounded-full border border-production/30 text-[11px] text-production hover:bg-production/10"
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* External link + mastery footer */}
      <section className="flex items-center justify-between gap-2 flex-wrap pt-2">
        <a
          href={lesson.youtubeLink}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm text-production hover:underline"
        >
          watch a reference tutorial →
        </a>
        <MasteryControls
          lessonId={lesson.id}
          current={mastery}
        />
      </section>

      {glossaryOpen && (
        <GlossaryOverlay
          termId={glossaryOpen}
          onClose={() => setGlossaryOpen(null)}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Rich text with inline glossary links
// -------------------------------------------------------------------

/**
 * Render surface / deep-dive prose with `[[term-id]]` and
 * `[[term-id|custom label]]` syntax expanded to clickable chips.
 * Paragraph breaks come from double newlines; single newlines
 * stay intact. Markdown bold (`**text**`) is supported for
 * emphasis inside bullet-lead-ins.
 */
function ProseWithGlossary({
  text,
  onOpenTerm,
}: {
  text: string;
  onOpenTerm: (termId: string) => void;
}) {
  const paragraphs = useMemo(() => text.split(/\n\n+/), [text]);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-neutral-800 dark:text-neutral-100">
      {paragraphs.map((para, i) => (
        <Paragraph key={i} text={para} onOpenTerm={onOpenTerm} />
      ))}
    </div>
  );
}

function Paragraph({
  text,
  onOpenTerm,
}: {
  text: string;
  onOpenTerm: (termId: string) => void;
}) {
  // Bullet list support: paragraphs that start with "- " become
  // bulleted lists by splitting lines.
  const trimmed = text.trim();
  if (trimmed.startsWith('- ')) {
    const items = trimmed.split(/\n(?=- )/).map(s => s.replace(/^-\s+/, ''));
    return (
      <ul className="list-disc pl-5 space-y-1.5">
        {items.map((line, i) => (
          <li key={i}><Inline text={line} onOpenTerm={onOpenTerm} /></li>
        ))}
      </ul>
    );
  }
  // Heading shorthand: paragraphs that are a single bolded line
  // ("**Header.**") render as a small heading.
  const bolded = /^\*\*(.+)\*\*\.?$/.exec(trimmed);
  if (bolded) {
    return <h4 className="font-semibold mt-2">{bolded[1]}</h4>;
  }
  return <p><Inline text={text} onOpenTerm={onOpenTerm} /></p>;
}

/**
 * Inline renderer — expands glossary chips + markdown-bold.
 * Kept intentionally simple; we don't ship a full markdown parser.
 */
function Inline({
  text,
  onOpenTerm,
}: {
  text: string;
  onOpenTerm: (termId: string) => void;
}) {
  // Combined regex catches both [[term|label]] and [[term]] and
  // **bold**. Splitting retains the delimiters so we can replace.
  const parts: ReactNode[] = [];
  const regex = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }
    if (match[1]) {
      // Glossary link.
      const termId = match[1];
      const label = match[2] ?? glossaryById(termId)?.name ?? termId;
      parts.push(
        <button
          key={`g-${keyIdx++}`}
          onClick={() => onOpenTerm(termId)}
          className="inline-flex items-baseline rounded px-0.5 underline decoration-production/40 underline-offset-2 hover:decoration-production text-production font-medium"
        >
          {label}
        </button>,
      );
    } else if (match[3]) {
      // Bold text.
      parts.push(<strong key={`b-${keyIdx++}`}>{match[3]}</strong>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return <>{parts}</>;
}

// -------------------------------------------------------------------
// Mastery controls
// -------------------------------------------------------------------

function MasteryControls({
  lessonId,
  current,
}: {
  lessonId: string;
  current: ProductionLessonMastery;
}) {
  const mark = async (next: ProductionLessonMastery) => {
    await updateLessonMastery(lessonId, next);
  };
  const options: Array<{ value: ProductionLessonMastery; label: string }> = [
    { value: 'not-started', label: 'not yet' },
    { value: 'in-progress', label: 'in progress' },
    { value: 'completed',   label: 'got it' },
    { value: 'mastered',    label: 'mastered' },
  ];
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {options.map(o => {
        const active = current === o.value;
        return (
          <button
            key={o.value}
            onClick={() => mark(o.value)}
            className="px-2.5 py-1 rounded-md border text-xs transition"
            style={active ? {
              backgroundColor: '#3a4875',
              borderColor: '#3a4875',
              color: 'white',
            } : {
              borderColor: 'rgb(229 231 235)',
              color: 'rgb(75 85 99)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
