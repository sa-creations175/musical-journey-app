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
  '/repertoire':                          "songs you're learning, maintaining, and stretching across 12 keys",
  '/shapes-and-patterns':                 'where the hands catch up with what the rest of the app teaches',
  '/production':                          'the craft of making music you feel',
  '/session-log':                         'reflection-driven practice journal',
  '/skills-catalogue':                    'every tracked skill across the app, organised',
};

export function taglineForPath(pathname: string): string | null {
  return PAGE_TAGLINES[pathname] ?? null;
}
