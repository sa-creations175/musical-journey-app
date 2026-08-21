/**
 * What each surface of the song page is for, and how to use it.
 *
 * ---------------------------------------------------------------
 * The song page had four working surfaces and not one of them said
 * what it was for or how to make progress through it. Same gap the
 * dashboard had before its legibility layer, and the same fix:
 * explain what the reader is looking at and what to do with it.
 *
 * TWO RULES THIS COPY IS WRITTEN UNDER.
 *
 * Bulleted, never a wall of text — nobody reads a paragraph on a
 * working screen.
 *
 * And it explains the SURFACE, not the design behind it. Why the
 * matrix has twelve key rows is interesting and belongs in a design
 * doc; what a reader needs is that a row is the whole song in one key.
 * ---------------------------------------------------------------
 *
 * STAGES ARE DEFINED IN EXACTLY ONE PLACE and it is not here. The
 * matrix points at the learning-status panel rather than restating
 * the ladder, for the same reason `stageCriteria` became the single
 * definition of the rules: two statements of one thing drift, and the
 * copy is the half that drifts silently.
 */

export interface GuidanceGroup {
  heading: string;
  bullets: string[];
}

export type SongGuidanceKey = 'leadSheet' | 'matrix' | 'practiceHistory';

export const SONG_PAGE_GUIDANCE: Record<SongGuidanceKey, GuidanceGroup[]> = {
  leadSheet: [
    {
      heading: 'What this is for',
      bullets: [
        'The chords and lyrics, laid out so you can learn how the song moves — not just look up what comes next.',
        'A working surface. What you put here is what you read at the keyboard, and it is meant to be edited as your understanding of the song changes.',
        'Getting familiar with the harmony is the job. The record of the chords is a side effect.',
      ],
    },
    {
      heading: 'How to use it',
      bullets: [
        'Add and correct chords as you go. Nothing has to be right on the first pass.',
        'Split phrases where you hear them break, not where the lyrics happen to wrap.',
        'Name the sections the way you think of them — those names carry through to the matrix and to everything you log.',
        // VERIFIED, and it replaces a claim that was not. The draft said
        // "tap a chord to see what it's doing in the key"; tapping a
        // chord opens the edit choices row (break / new row / hide /
        // note) and shows no function at all. The notation control is
        // the real mechanism, and it is app-wide rather than per-chord.
        'Switch **notation** to numbers or roman numerals to read every chord as its function in the key instead of its name. The choice applies across the whole app.',
        'Keep it open while you play early on. Reading it repeatedly is how the shapes stop needing to be read.',
      ],
    },
    {
      heading: 'The progressions drawer',
      bullets: [
        'Opens from the bottom of the lead sheet: the whole song’s chord movement in one run, with the lyrics stripped away.',
        'Two readings at once — scan the headings to compare section shapes, or read straight down to follow the song’s arc.',
        'It shares that space with the lyrics drawer, so opening one closes the other.',
        'Split and annotate phrases there and the lead sheet shows the same breaks. They are two windows onto one thing.',
        'Section names and section order are set on the lead sheet, not in the drawer.',
      ],
    },
  ],

  matrix: [
    {
      heading: 'What this is for',
      bullets: [
        'Every section of the song against every key, so you can see where the song is solid and where it isn’t, across all twelve keys.',
        'One cell per section per key. Sections run across the top as columns; keys run down the side as rows. So a row read left to right is the whole song in one key, and a column read top to bottom is one section across all twelve keys.',
        'This is where progress is recorded, section by section and key by key. What that progress adds up to is in **learning status**, below.',
      ],
    },
    {
      heading: 'How to use it',
      bullets: [
        'Work one section at a time, starting in the song’s original key. That is the recommended route and the repetition is most of what makes a song stick.',
        'Tap a cell to log what you did on that section.',
        'A section becomes **comfortable** after three clean run-throughs in a row, at or within 10 BPM of the song’s target tempo. Slower runs are recorded but do not count toward it.',
        '**Test song** on any key row plays the whole song in that key: three clean run-throughs in a row, in one sitting. It is available on every key whatever state its sections are in — some songs arrive already in your hands.',
        'Passing moves the song to **Comfortable**. It makes that key **Solid** only when every section in the key is already comfortable, because a key’s state is read from its cells.',
        '**Log a run** records a single pass of the whole song in a key. It unlocks nothing — it is how you show you have taken the song into a key without working it section by section.',
      ],
    },
  ],

  practiceHistory: [
    {
      heading: 'What this is for',
      bullets: [
        'Everything you have logged on this song, most recent first.',
        'The record of how the work actually went, next to the matrix’s record of where it got you.',
      ],
    },
    {
      heading: 'How to use it',
      bullets: [
        'Tap a row to expand it — sections, keys, notes, and how the session felt.',
        'Use it to see whether you have been circling the same section, or when you last touched the song at all.',
        'Notes are the part worth writing. What you noticed today is the thing you will not remember next week.',
      ],
    },
  ],
};
