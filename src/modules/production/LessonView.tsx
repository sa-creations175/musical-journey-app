import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ProductionLessonRating } from '../../lib/db';
import { useSessionTimer } from '../../lib/sessionTimer/SessionTimerContext';
import { lessonById } from './content/lessons';
import { glossaryById } from './content/glossary';
import { pathById } from './content/paths';
import { recordLessonOpen, setLessonRating } from './data';
import { RATING_OPTIONS, isCovered, ratingOption } from './lessonRating';
import GlossaryOverlay from './GlossaryOverlay';
import LessonReferenceSection from './LessonReferenceSection';

interface Props {
  lessonId: string;
  /** Hook back to the parent router so "back to path" and other
   *  navigation can stay under the caller's control. */
  onBack: () => void;
}


/**
 * Single-lesson view. Surface content is always visible; the Deep
 * Dive layer expands on demand. Glossary terms render as inline
 * chips that open an overlay. Footer carries the five-step self-
 * rating plus the YouTube link and revisit count.
 */
export default function LessonView({ lessonId, onBack }: Props) {
  const lesson = lessonById(lessonId);
  const path = lesson ? pathById(lesson.pathId) : undefined;

  // Phone-session affordance: the hands-on exercise needs Logic, but
  // phone sessions don't have it. The badge is informational — not a
  // gate, not a disable — so the user can read the exercise and run
  // it later from a laptop / full session.
  const { state: sessionState } = useSessionTimer();
  const requiresLogicBadge =
    sessionState.status !== 'idle'
    && sessionState.status !== 'ended'
    && sessionState.context === 'phone';

  const [showDeepDive, setShowDeepDive] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState<string | null>(null);
  // lessonStartedAt — when the user entered this lesson page. Seeded
  // at first render and refreshed by the mount effect below when the
  // user navigates between lessons without unmounting. Doubles as the
  // visit key: setLessonRating folds repeat ratings within one visit
  // into a single rated session row.
  const startedAtRef = useRef(Date.now());

  // Record a passive open event once per mount. Opening Deep Dive no
  // longer logs a second event — that used to double-bump
  // revisitCount, and the deep-dive step is a rating value now rather
  // than a side channel.
  useEffect(() => {
    if (!lesson) return;
    void recordLessonOpen(lesson.id);
    startedAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  const handleRate = async (rating: ProductionLessonRating) => {
    if (!lesson) return;
    await setLessonRating(lesson.id, rating, startedAtRef.current);
  };

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

  const rating: ProductionLessonRating = state?.rating ?? 0;
  const currentOption = ratingOption(rating);
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
          <span className={isCovered(rating) ? 'text-fluent font-medium' : ''}>
            {currentOption.label}
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
      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-4 sm:p-5 space-y-3">
        <div className="text-[10px] uppercase tracking-wide text-production font-medium">
          the idea
        </div>
        <ProseWithGlossary text={lesson.surface} onOpenTerm={setGlossaryOpen} />

        {/* Try now — the hands-on exercise. On phone sessions the
            user doesn't have Logic available, so a "Requires Logic"
            badge surfaces alongside the section header. Informational
            only; the exercise still renders so the user can read it
            and run it later from a laptop / full session. */}
        <div className="rounded-md border border-production/40 bg-production/5 p-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-wide text-production font-medium">
              try now
            </div>
            {requiresLogicBadge && (
              <span
                title="This exercise needs Logic — open it on your laptop later"
                className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-developing/40 text-developing font-medium"
              >
                Requires Logic
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed">{lesson.tryNow}</p>
        </div>
      </section>

      {/* Deep dive toggle */}
      <section>
        <button
          onClick={() => setShowDeepDive(v => !v)}
          className="w-full rounded-2xl border border-black/[0.07] px-4 py-3 text-left flex items-center justify-between hover:border-production/60 transition-colors"
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
          <div className="mt-2 rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-4 sm:p-5">
            <ProseWithGlossary text={lesson.deepDive} onOpenTerm={setGlossaryOpen} />
          </div>
        )}
      </section>

      {/* Reference tracks — user-curated per-lesson associations */}
      <LessonReferenceSection lessonId={lesson.id} />

      {/* Glossary terms in this lesson */}
      {lesson.glossaryTerms.length > 0 && (
        <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-4 sm:p-5 space-y-2">
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

      {/* External link */}
      <section className="pt-2">
        <a
          href={lesson.youtubeLink}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm text-production hover:underline"
        >
          watch a reference tutorial →
        </a>
      </section>

      {/* The five-step self-rating — the ONLY control that records
          progress on this lesson, and the only writer of a Production
          attempt. Sets in place rather than navigating away: the
          rating is cumulative state, so moving from "read it" to
          "tried it" later in the same visit has to be possible. */}
      <RatingControls current={rating} onRate={handleRate} />

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
// Five-step self-rating control
// -------------------------------------------------------------------

/**
 * The lesson's rating control. Each step names something the page
 * offers, and the meanings sit alongside the buttons rather than
 * behind a "what do these mean?" toggle — the old legend hid the one
 * thing the user needs while deciding.
 *
 * Selecting a step writes through setLessonRating, which is the
 * single path for all three consequences (lesson state, the rated
 * session row, the spacing mirror). Re-tapping the current step is a
 * no-op there, so it can't manufacture an attempt.
 */
function RatingControls({
  current,
  onRate,
}: {
  current: ProductionLessonRating;
  onRate: (rating: ProductionLessonRating) => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  const pick = async (next: ProductionLessonRating) => {
    if (saving || next === current) return;
    setSaving(true);
    try {
      await onRate(next);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[production] lesson rating save failed', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-4 sm:p-5 space-y-3"
      aria-label="Lesson self-rating"
    >
      <div>
        <div className="text-[10px] uppercase tracking-wide text-production font-medium">
          where am I with this
        </div>
        <p className="mt-1 text-[11px] text-neutral-500">
          What you actually did — not how well you followed it. From
          &ldquo;tried it&rdquo; on, the lesson counts toward Production coverage.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {RATING_OPTIONS.map(o => {
          const active = current === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => void pick(o.value)}
              disabled={saving}
              aria-pressed={active}
              className={`w-full px-3 py-2 rounded-md border text-sm text-left flex items-baseline gap-2.5 transition-colors ${
                active
                  ? 'border-production bg-production/10'
                  : 'border-neutral-200 dark:border-neutral-700 hover:border-production/50'
              } ${saving ? 'opacity-60' : ''}`}
            >
              <span className={`shrink-0 inline-block w-2.5 h-2.5 rounded-full ${o.dot}`} aria-hidden />
              <span className={`font-medium ${active ? 'text-production' : ''}`}>{o.label}</span>
              <span className="text-neutral-500 text-xs">{o.meaning}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
