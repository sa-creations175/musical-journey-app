import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ProductionLessonMastery, type ProductionLessonRating } from '../../lib/db';
import Modal from '../../components/Modal';
import { useSessionTimer } from '../../lib/sessionTimer/SessionTimerContext';
import { lessonById } from './content/lessons';
import { glossaryById } from './content/glossary';
import { pathById } from './content/paths';
import { recordLessonOpen, recordLessonRating, updateLessonMastery } from './data';
import GlossaryOverlay from './GlossaryOverlay';
import LessonReferenceSection from './LessonReferenceSection';

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

const MASTERY_DOT: Record<ProductionLessonMastery, string> = {
  'not-started': 'bg-neutral-200 dark:bg-neutral-700',
  'in-progress': 'bg-developing',
  'completed':   'bg-fluent',
  'mastered':    'bg-mastered',
};

const MASTERY_LEGEND: Array<{ key: ProductionLessonMastery; label: string; meaning: string }> = [
  { key: 'not-started', label: 'not yet',     meaning: "haven't looked at this yet" },
  { key: 'in-progress', label: 'in progress', meaning: 'started but still working through it' },
  { key: 'completed',   label: 'got it',      meaning: 'understand the idea and can use it' },
  { key: 'mastered',    label: 'mastered',    meaning: 'solid enough to teach it or apply it instinctively' },
];

/**
 * Single-lesson view. Surface content is always visible; the Deep
 * Dive layer expands on demand. Glossary terms render as inline
 * chips that open an overlay. Footer carries the self-assessment
 * ("Got it" / "Need more") plus the YouTube link and revisit count.
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
  const deepDiveLoggedRef = useRef(false);
  const [glossaryOpen, setGlossaryOpen] = useState<string | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  // lessonStartedAt — when the user entered this lesson page. Seeded
  // at first render and refreshed by the mount effect below when the
  // user navigates between lessons without unmounting.
  const startedAtRef = useRef(Date.now());

  // Record an open event once per mount. The effect is guarded so
  // re-opening Deep Dive doesn't double-count.
  useEffect(() => {
    if (!lesson) return;
    void recordLessonOpen(lesson.id, false);
    deepDiveLoggedRef.current = false;
    startedAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  // Phase B Decision 4 — write the rated session row, then hand
  // navigation back to the parent. The rating modal is the ONLY path
  // to recordLessonRating, so leaving the lesson any other way
  // (back button, sidebar, browser back) writes no rated row.
  const handleSubmitRating = async (rating: ProductionLessonRating) => {
    if (!lesson) return;
    await recordLessonRating(lesson.id, rating, startedAtRef.current);
    setRatingOpen(false);
    onBack();
  };

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

      <MasteryLegend />

      {/* Phase B Decision 4 — per-session self-report. Distinct from
          the mastery declaration above (mastery is cumulative state;
          this rates how THIS session felt) and is the row Phase B
          counts as a Production attempt. Explicit done-flow: no rated
          row is written unless the user opens this and submits. */}
      <section className="pt-3 border-t border-neutral-200 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => setRatingOpen(true)}
          className="w-full sm:w-auto px-4 py-2 rounded-md bg-production text-white text-sm font-medium hover:opacity-90"
        >
          Done — rate this session
        </button>
        <p className="mt-1.5 text-[11px] text-neutral-500">
          A quick self-report — it's how Production practice shows up in your weekly plan.
        </p>
      </section>

      {glossaryOpen && (
        <GlossaryOverlay
          termId={glossaryOpen}
          onClose={() => setGlossaryOpen(null)}
        />
      )}

      {ratingOpen && (
        <LessonRatingModal
          lessonTitle={lesson.title}
          onClose={() => setRatingOpen(false)}
          onSubmit={handleSubmitRating}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Session rating modal (Phase B Decision 4)
// -------------------------------------------------------------------

const LESSON_FEEL_OPTIONS: ReadonlyArray<{
  value: ProductionLessonRating;
  label: string;
  hint: string;
  activeClass: string;
  inactiveClass: string;
}> = [
  {
    value: 'flying',
    label: 'Flying',
    hint: 'clicked — I can apply this',
    activeClass: 'bg-amber-500 text-white border-amber-500',
    inactiveClass: 'border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10',
  },
  {
    value: 'cruising',
    label: 'Cruising',
    hint: 'followed it, need reps',
    activeClass: 'bg-fluent text-white border-fluent',
    inactiveClass: 'border-fluent/40 text-fluent hover:bg-fluent/10',
  },
  {
    value: 'crawling',
    label: 'Crawling',
    hint: 'still fuzzy',
    activeClass: 'bg-needswork text-white border-needswork',
    inactiveClass: 'border-needswork/40 text-needswork hover:bg-needswork/10',
  },
];

/**
 * Explicit done-flow rating prompt. Opened by the "Done — rate this
 * session" button; submitting writes the rated ProductionLessonSession
 * row (via the parent's handleSubmitRating) and the parent navigates
 * back. Cancelling — or leaving the lesson by any other route —
 * writes nothing, since this modal is the only path to
 * recordLessonRating. Navigate-away interception was rejected: the
 * Production module navigates via react-router query params, browser
 * back, and the sidebar, so a back-button wrap would miss most exit
 * paths and a router/beforeunload block would be fragile.
 */
function LessonRatingModal({
  lessonTitle,
  onClose,
  onSubmit,
}: {
  lessonTitle: string;
  onClose: () => void;
  onSubmit: (rating: ProductionLessonRating) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<ProductionLessonRating | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (selected === null || saving) return;
    setSaving(true);
    try {
      await onSubmit(selected);
      // No setSaving(false) on success — onSubmit navigates away and
      // unmounts this modal; touching state here would warn.
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[production] lesson rating save failed', err);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="How did this session feel?"
      description={lessonTitle}
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={selected === null || saving}
            className={`px-4 py-1.5 rounded-md text-sm font-medium text-white ${
              selected === null || saving
                ? 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'
                : 'bg-production hover:opacity-90'
            }`}
          >
            {saving ? 'Saving…' : 'Save & finish'}
          </button>
        </div>
      )}
    >
      <div className="space-y-3">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Self-assessed — how the ideas in this lesson sat with you this session.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {LESSON_FEEL_OPTIONS.map(opt => {
            const active = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelected(opt.value)}
                aria-pressed={active}
                className={`w-full px-3 py-2 rounded-md border text-sm text-left transition-colors ${
                  active ? opt.activeClass : opt.inactiveClass
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="ml-2 opacity-70 text-xs">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
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
        const button = (
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
        if (o.value === 'completed') {
          return (
            <span key={o.value} className="inline-flex items-center gap-1">
              {button}
              <GotItInfoTip />
            </span>
          );
        }
        return button;
      })}
    </div>
  );
}

/** Collapsible legend explaining what each mastery state means.
 *  Lives next to MasteryControls so the explanation is one tap away
 *  from the buttons the user is actually deciding between. */
function MasteryLegend() {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="text-[11px] text-neutral-500 hover:text-production inline-flex items-center gap-1 self-end"
      >
        What do these mean?
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="text-[11px] text-neutral-600 dark:text-neutral-300 space-y-1 border-l-2 border-production/20 pl-3 self-end">
          {MASTERY_LEGEND.map(entry => (
            <li key={entry.key} className="flex items-baseline gap-2">
              <span className={`shrink-0 inline-block w-2 h-2 rounded-full mt-0.5 ${MASTERY_DOT[entry.key]}`} aria-hidden />
              <span>
                <span className="font-medium">{entry.label}</span>
                <span className="text-neutral-500"> — {entry.meaning}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Visible-popover info tip pinned to the "got it" button. Same
 *  hover/focus/click pattern as InputQuestionnaire's IntentInfoTip —
 *  native `title` tooltips don't fire on touch and have a long
 *  reveal delay on desktop, neither of which fits a moment where
 *  the user is actively deciding between mastery states. */
function GotItInfoTip() {
  const [open, setOpen] = useState(false);
  const text = 'Self-assessed — you understand the idea and can apply it in your work.';
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        aria-label={text}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 focus:outline-none focus:text-production"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 1a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm0 2.25a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zM7.25 7h1.5v5h-1.5V7z" />
        </svg>
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-10 right-0 bottom-full mb-1.5 w-56 px-2.5 py-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] leading-snug shadow-lg pointer-events-none"
        >
          {text}
        </span>
      )}
    </span>
  );
}
