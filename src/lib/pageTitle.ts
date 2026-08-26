/**
 * Pathname → page-title resolver for the pinned app header.
 *
 * Centralised here (rather than threaded as a per-page prop or a
 * context) because every routed page already has a known URL, and
 * the header is rendered once in Layout.tsx — a flat lookup avoids
 * the prop-drilling / context boilerplate.
 *
 * Exact-match map. Routes without an entry fall back to "Musical
 * Journey" so a forgotten title surfaces obviously rather than
 * blanks the header. Add new entries when adding new routes.
 *
 * Calendar / nested routes use the " · " separator so the parent
 * context stays visible (e.g. "Intervals · Calendar").
 */

import { CATEGORY_LABELS } from '../modules/harmonic-fluency/catalog';
import { isCategory } from '../modules/harmonic-fluency/categoryRoutes';
import { READING_SKILL_LABELS } from '../modules/reading/homeCards';
import { readingSkillForSlug } from '../modules/reading/skillRoutes';
import { titleCase } from './labelCase';

const PAGE_TITLES: Record<string, string> = {
  '/':                                            'Dashboard',
  // Temporary, alongside the swap. Goes with the old screen.
  '/dashboard-old':                               'Dashboard (old)',
  '/goals':                                       'Goals',
  '/practice-sessions':                           'Practice Sessions',
  '/practice-sessions/active':                    'Active Session',
  '/harmonic-fluency':                            'Harmonic Fluency',
  '/harmonic-fluency/calendar':                   'Harmonic Fluency · Calendar',
  '/ear-training':                                'Ear Training',
  '/ear-training/calendar':                       'Ear Training · Calendar',
  '/ear-training/intervals':                      'Intervals',
  '/ear-training/intervals/calendar':             'Intervals · Calendar',
  '/ear-training/chord-recognition':              'Chord Recognition',
  '/ear-training/chord-recognition/calendar':     'Chord Recognition · Calendar',
  '/ear-training/chord-progressions':             'Chord Progressions',
  '/ear-training/chord-progressions/calendar':    'Chord Progressions · Calendar',
  '/ear-training/chord-progression-quiz':         'Progression Quiz',
  '/ear-training/scales-modes':                   'Scales & Modes',
  '/ear-training/scales-modes/calendar':          'Scales & Modes · Calendar',
  '/reading':                                     'Reading',
  '/reading/calendar':                            'Reading · Calendar',
  '/reading/reference':                           'Reading · Staff Reference',
  '/reading/preview':                             'Reading · Notation Preview',
  '/repertoire':                                  'Song Repertoire',
  '/shapes-and-patterns':                         'Shapes & Patterns',
  '/shapes-and-patterns/calendar':                'Shapes & Patterns · Calendar',
  '/production':                                  'Production',
  '/production/calendar':                         'Production · Calendar',
  '/session-log':                                 'Session Log',
  '/skills-catalogue':                            'Skills Catalogue',
  '/harmonic-diary':                              'Harmonic Diary',
};

/**
 * Titles for routes whose last segment is a VALUE rather than a page.
 *
 * =====================================================================
 * A DRILL PAGE SAID "MUSICAL JOURNEY", WHICH IS THE FALLBACK WORKING.
 *
 * `/harmonic-fluency/modes` and `/reading/notes` are one route each
 * with fifteen and four destinations behind them, so no exact-match
 * entry can name them — the map has no row to write. The fallback did
 * exactly what its comment promises and made the gap visible; this is
 * the gap being closed rather than the fallback being distrusted.
 *
 * THE LABEL COMES FROM THE MODULE THAT OWNS THE CATEGORY, never from a
 * table beside the resolver. A second list of the fifteen category
 * names is how a renamed category comes to have two names.
 * =====================================================================
 *
 * Ordered, and first match wins. Each entry claims one prefix and
 * resolves the segment after it, returning null when the segment names
 * nothing — an unknown slug falls through to the fallback, which is
 * what the pages themselves do with it.
 */
const DYNAMIC_TITLES: ReadonlyArray<{
  prefix: string;
  labelFor: (segment: string) => string | null;
}> = [
  {
    prefix: '/harmonic-fluency/',
    labelFor: slug =>
      (isCategory(slug) ? CATEGORY_LABELS[slug] : null),
  },
  {
    prefix: '/reading/',
    labelFor: slug => {
      const skill = readingSkillForSlug(slug);
      return skill === null ? null : titleCase(READING_SKILL_LABELS[skill]);
    },
  },
];

export function titleForPath(pathname: string): string {
  const exact = PAGE_TITLES[pathname];
  if (exact !== undefined) return exact;

  for (const { prefix, labelFor } of DYNAMIC_TITLES) {
    if (!pathname.startsWith(prefix)) continue;
    const segment = pathname.slice(prefix.length);
    // One segment only. `/reading/notes/anything` is not a drill page.
    if (segment === '' || segment.includes('/')) continue;
    const label = labelFor(segment);
    if (label !== null) return label;
  }

  return 'Musical Journey';
}

/**
 * Pathname → short page tagline, shown as a muted sub-line under the
 * title in the pinned header. These migrated up from the per-page
 * secondary headers that were removed — the sticky bar now carries
 * both the page name and its one-line description so page content can
 * start immediately. Pages without an entry render no sub-line.
 */
const PAGE_TAGLINES: Record<string, string> = {
  '/harmonic-fluency':                    'flashcard practice for scale degrees, keys, and chord construction',
  '/ear-training':                        'pick a sub-module',
  '/ear-training/intervals':              'hear it, name it, log it',
  '/ear-training/chord-recognition':      'identify chord qualities by sound alone',
  '/ear-training/chord-progressions':     'hear the bass, the chord quality, and the full progression shape',
  '/ear-training/chord-progression-quiz': "away-from-keyboard recall of the progressions you've charted",
  '/ear-training/scales-modes':           'hear the color, sit inside the atmosphere, spot it in real music',
  '/reading':                             'decoding the page fast enough to play from it',
  '/repertoire':                          "songs you're learning, maintaining, and stretching across 12 keys",
  '/shapes-and-patterns':                 'where the hands catch up with what the rest of the app teaches',
  '/production':                          'the craft of making music you feel',
  '/session-log':                         'reflection-driven practice journal',
  '/skills-catalogue':                    'every tracked skill across the app, organised',
};

export function taglineForPath(pathname: string): string | null {
  return PAGE_TAGLINES[pathname] ?? null;
}
