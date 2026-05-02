import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { seedProductionIfNeeded } from './data';
import { lessonById } from './content/lessons';
import ProductionOverview from './ProductionOverview';
import PathView from './PathView';
import LessonView from './LessonView';
import GlossaryView from './GlossaryView';
import ReferenceTracksView from './ReferenceTracksView';
import VocabularySession from './VocabularySession';

/**
 * Production module router. Reads from the URL:
 *   ?view=overview (default) | glossary | reference-tracks
 *   ?path=<pathId>     → path list
 *   ?lesson=<lessonId> → single lesson
 * Keeping everything on one `/production` route (rather than nested
 * routes) matches the query-string convention used by Repertoire,
 * Shapes, and Chord Progressions — the sidebar just emits the right
 * `?view=` and this component dispatches.
 *
 * URL state wins over local state so deep links work, the sidebar's
 * sub-items land correctly, and the browser back/forward buttons do
 * what you'd expect.
 */
export default function Production() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Reserved — kept in case we later switch to nested routes; today
  // the router only uses query params so `params` stays empty.
  useParams();

  // Seed lessons / glossary / starter tracks on first mount.
  // Idempotent — safe to call every mount.
  useEffect(() => {
    void seedProductionIfNeeded();
  }, []);

  const lessonId = searchParams.get('lesson');
  const pathId = searchParams.get('path');
  const view = searchParams.get('view') ?? 'overview';

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: false });
  };

  const openPath = (id: string) => go({ path: id, lesson: null, view: null });
  const openLesson = (id: string) => go({ lesson: id, path: null, view: null });
  const openGlossary = () => go({ view: 'glossary', path: null, lesson: null });
  const openRefs = () => go({ view: 'reference-tracks', path: null, lesson: null });
  const openVocabulary = () => go({ view: 'vocabulary', path: null, lesson: null });
  const backToOverview = () => navigate('/production');

  // Priority order: lesson > path > view.
  if (lessonId) {
    // "Back" inside a lesson lands on the path's lesson list, not the
    // module home — one level up in the Production → Path → Lesson
    // hierarchy. Falls back to the module home if the lesson id can't
    // be resolved (deep link to a deleted lesson, etc.).
    const lesson = lessonById(lessonId);
    const onBack = lesson ? () => openPath(lesson.pathId) : backToOverview;
    return <LessonView lessonId={lessonId} onBack={onBack} />;
  }
  if (pathId) {
    return (
      <PathView
        pathId={pathId}
        onOpenLesson={openLesson}
        onBack={backToOverview}
      />
    );
  }
  if (view === 'glossary') {
    return <GlossaryView />;
  }
  if (view === 'reference-tracks') {
    return <ReferenceTracksView />;
  }
  if (view === 'vocabulary') {
    return <VocabularySession onBack={backToOverview} />;
  }

  return (
    <ProductionOverview
      onOpenPath={openPath}
      onOpenLesson={openLesson}
      onOpenGlossary={openGlossary}
      onOpenReferenceTracks={openRefs}
      onOpenVocabulary={openVocabulary}
    />
  );
}
