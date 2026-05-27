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

const PAGE_TITLES: Record<string, string> = {
  '/':                                            'Dashboard',
  '/goals':                                       'Goals',
  '/practice-sessions':                           'Practice Sessions',
  '/practice-sessions/active':                    'Active Session',
  '/harmonic-fluency':                            'Harmonic Fluency',
  '/harmonic-fluency/calendar':                   'Harmonic Fluency · Calendar',
  '/ear-training':                                'Ear Training',
  '/ear-training/intervals':                      'Intervals',
  '/ear-training/intervals/calendar':             'Intervals · Calendar',
  '/ear-training/chord-recognition':              'Chord Recognition',
  '/ear-training/chord-recognition/calendar':     'Chord Recognition · Calendar',
  '/ear-training/chord-progressions':             'Chord Progressions',
  '/ear-training/chord-progressions/calendar':    'Chord Progressions · Calendar',
  '/ear-training/chord-progression-quiz':         'Progression Quiz',
  '/ear-training/scales-modes':                   'Scales & Modes',
  '/ear-training/scales-modes/calendar':          'Scales & Modes · Calendar',
  '/repertoire':                                  'Song Repertoire',
  '/shapes-and-patterns':                         'Shapes & Patterns',
  '/shapes-and-patterns/calendar':                'Shapes & Patterns · Calendar',
  '/production':                                  'Production',
  '/session-log':                                 'Session Log',
  '/skills-catalogue':                            'Skills Catalogue',
  '/harmonic-diary':                              'Harmonic Diary',
};

export function titleForPath(pathname: string): string {
  return PAGE_TITLES[pathname] ?? 'Musical Journey';
}
