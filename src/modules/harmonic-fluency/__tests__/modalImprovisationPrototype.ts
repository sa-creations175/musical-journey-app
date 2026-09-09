/**
 * The prototype's own output, for all 130 cards.
 *
 * =====================================================================
 * THE SIGNED-OFF CLICK-THROUGH IS THE SPEC, AND THIS IS WHAT IT SAYS.
 *
 * `docs/modal-improvisation-prototype_1.html` was walked and approved on
 * 9 Sep 2026. Its `model()` function is the source of every word on
 * these cards, so the rows below were produced by RUNNING it over the
 * thirteen keys and its ten chords — not retyped, and not paraphrased.
 *
 * A test that restated the generator's own strings would pass just as
 * happily when both had drifted from the thing Silas actually looked
 * at. This is the third copy that makes the other two checkable.
 *
 * =====================================================================
 * ONE REPAIR, ON THIRTY ROWS.
 *
 * The prototype's `parse()` reads an accidental by counting '#' and 'b'
 * characters, but `spell()` hands it names already drawn with GLYPHS —
 * 'F♯', not 'F#'. So a target root carrying an accidental parsed as a
 * natural, and `nameOf(tRoot, 7, 4)` named the borrowed chord a fifth
 * above the WRONG note. On screen: "In D, the band is on C7 (5 of 3)"
 * answered by "Notes of the F♯ melodic minor scale" — and C7 is not the
 * 5 of F♯m, C♯7 is. Thirty of the sixty-five borrowed cards named a
 * chord that cannot resolve to the chord the same card names.
 *
 * RULED 9 SEP 2026: THE REPAIR STAYS, so for the chord NAMES the app is
 * the source and this file records what the prototype would have said
 * had it spelled them right. Every other word here is still the
 * prototype's, and still what the app is held to.
 *
 * The same bug reached `scaleNotes`, which is where the `scale` column
 * below comes from — `spell(tRoot, …)` took the same mis-parsed root —
 * so those rows are repaired in the same way and by the same argument.
 * NOTHING ELSE MOVED: the answer is identical on all 130, and so is
 * every `seq`, because the sound is computed from pitch classes and
 * never goes through `parse`. The thirty:
 *
 *   Db 5 of 2  B7    → B♭7
 *   Db 5 of 4  D7    → D♭7
 *   Db 5 of 5  E7    → E♭7
 *   Db 5 of 6  F♯7   → F7
 *   D 5 of 3   C7    → C♯7
 *   Eb 5 of 4  E7    → E♭7
 *   Eb 5 of 5  F♯7   → F7
 *   E 5 of 2   C7    → C♯7
 *   E 5 of 3   D7    → D♯7
 *   E 5 of 6   G7    → G♯7
 *   F 5 of 4   F♯7   → F7
 *   F# 5 of 2  D7    → D♯7
 *   F# 5 of 3  E7    → E♯7
 *   F# 5 of 5  G7    → G♯7
 *   F# 5 of 6  A7    → A♯7
 *   Gb 5 of 2  E7    → E♭7
 *   Gb 5 of 3  F♯7   → F7
 *   Gb 5 of 4  G7    → G♭7
 *   Gb 5 of 5  A7    → A♭7
 *   Gb 5 of 6  B7    → B♭7
 *   Ab 5 of 2  F♯7   → F7
 *   Ab 5 of 4  A7    → A♭7
 *   Ab 5 of 5  B7    → B♭7
 *   A 5 of 3   G7    → G♯7
 *   A 5 of 6   C7    → C♯7
 *   Bb 5 of 4  B7    → B♭7
 *   B 5 of 2   G7    → G♯7
 *   B 5 of 3   A7    → A♯7
 *   B 5 of 5   C7    → C♯7
 *   B 5 of 6   D7    → D♯7
 * =====================================================================
 * ONE MORE DEPARTURE, ON THE QUESTION, AND IT IS ALSO A RULING.
 *
 * The prototype asks "In C, the band is on Dm (2)". Silas's standing
 * rule of 9 Sep 2026 is that a key is always written "the key of C
 * major" or "the key of C minor" — a bare capital letter mid-sentence
 * reads as a stray word. So the question rows below carry the longer
 * opening, and the app is the source of that clause the way it is
 * already the source of the chord names.
 *
 * THE REST OF EACH QUESTION IS UNTOUCHED.
 *
 * =====================================================================
 * THE `explanation` COLUMN IS NO LONGER THE PROTOTYPE'S, AND SAYING SO
 * IS THE POINT.
 *
 * Enough of it has been ruled since — the minor-target sentence
 * rewritten in Silas's words, the dominant's own number named on every
 * borrowed card, and "the key of C major" written out wherever a
 * sentence is about a key — that holding the prototype's version here
 * would be pinning text no card says.
 *
 * So this column is a PINNED COPY OF THE APP'S OWN SENTENCES, and it is
 * weaker than the three beside it: it cannot catch the app drifting on
 * its own, only a change made without meaning to. What it still does is
 * put all 130 sentences in one file, so a wording change lands as a
 * reviewable diff in the commit that makes it rather than disappearing
 * into a template.
 *
 * `key`, `chord`, `question`, `answer` and `scale` ARE STILL THE
 * PROTOTYPE'S, with the departures named above, and those are the
 * columns that still prove something.
 * =====================================================================
 */
export interface PrototypeScaleNote {
  /** The note as the prototype draws it, glyphs and all. */
  note: string;
  /**
   * Whether the home key does NOT hold this pitch — the prototype's
   * `.alt` class, which it draws in its borrow orange.
   *
   * Always false on an in-key card: the answer scale IS the key, so
   * there is nothing to mark, and the prototype passes `alt: null`
   * rather than an empty set.
   */
  outside: boolean;
}

export interface PrototypeRow {
  key: string;
  chord: string;
  question: string;
  answer: string;
  explanation: string;
  /** The seven notes of the answer scale, from its own root. */
  scale: readonly PrototypeScaleNote[];
}

export const PROTOTYPE_CARDS: ReadonlyArray<PrototypeRow> = [
  {
    key: 'C', chord: '2m',
    question:
      'In the key of C major, the band is on Dm (2). Which notes fit?',
    answer: 'Notes of the C major scale',
    explanation:
      'Dm is the 2 of the key of C major. Every note it holds is already in the key of C major, so nothing changes: stay in the key.',
    scale: [
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
    ],
  },
  {
    key: 'C', chord: '3m',
    question:
      'In the key of C major, the band is on Em (3). Which notes fit?',
    answer: 'Notes of the C major scale',
    explanation:
      'Em is the 3 of the key of C major. Every note it holds is already in the key of C major, so nothing changes: stay in the key.',
    scale: [
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
    ],
  },
  {
    key: 'C', chord: '4',
    question:
      'In the key of C major, the band is on F (4). Which notes fit?',
    answer: 'Notes of the C major scale',
    explanation:
      'F is the 4 of the key of C major. Every note it holds is already in the key of C major, so nothing changes: stay in the key.',
    scale: [
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
    ],
  },
  {
    key: 'C', chord: '5',
    question:
      'In the key of C major, the band is on G7 (5). Which notes fit?',
    answer: 'Notes of the C major scale',
    explanation:
      'G7 is the 5 of the key of C major. Every note it holds is already in the key of C major, so nothing changes: stay in the key.',
    scale: [
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
    ],
  },
  {
    key: 'C', chord: '6m',
    question:
      'In the key of C major, the band is on Am (6). Which notes fit?',
    answer: 'Notes of the C major scale',
    explanation:
      'Am is the 6 of the key of C major. Every note it holds is already in the key of C major, so nothing changes: stay in the key.',
    scale: [
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
    ],
  },
  {
    key: 'C', chord: '5of2',
    question:
      'In the key of C major, the band is on A7 (5 of 2). Which notes fit?',
    answer: 'Notes of the D melodic minor scale',
    explanation:
      'A7 is not in the key of C major; it is the 5 of Dm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here A7 (the 6 as a dominant, the 5 of 2) lands on Dm (the 2m), so while you\'re on the A7 play D melodic minor: D major with an F (♭3) instead of an F♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of C major does not have.',
    scale: [
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: true },
    ],
  },
  {
    key: 'C', chord: '5of3',
    question:
      'In the key of C major, the band is on B7 (5 of 3). Which notes fit?',
    answer: 'Notes of the E melodic minor scale',
    explanation:
      'B7 is not in the key of C major; it is the 5 of Em. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here B7 (the 7 as a dominant, the 5 of 3) lands on Em (the 3m), so while you\'re on the B7 play E melodic minor: E major with a G (♭3) instead of a G♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of C major does not have.',
    scale: [
      { note: 'E', outside: false },
      { note: 'F♯', outside: true },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: true },
      { note: 'D♯', outside: true },
    ],
  },
  {
    key: 'C', chord: '5of4',
    question:
      'In the key of C major, the band is on C7 (5 of 4). Which notes fit?',
    answer: 'Notes of the F major scale',
    explanation:
      'C7 (the 1 as a dominant, the 5 of 4) is not in the key of C major; it is the 5 of F. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of C major does not have.',
    scale: [
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B♭', outside: true },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
    ],
  },
  {
    key: 'C', chord: '5of5',
    question:
      'In the key of C major, the band is on D7 (5 of 5). Which notes fit?',
    answer: 'Notes of the G major scale',
    explanation:
      'D7 (the 2 as a dominant, the 5 of 5) is not in the key of C major; it is the 5 of G. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of C major does not have.',
    scale: [
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: true },
    ],
  },
  {
    key: 'C', chord: '5of6',
    question:
      'In the key of C major, the band is on E7 (5 of 6). Which notes fit?',
    answer: 'Notes of the A melodic minor scale',
    explanation:
      'E7 is not in the key of C major; it is the 5 of Am. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here E7 (the 3 as a dominant, the 5 of 6) lands on Am (the 6m), so while you\'re on the E7 play A melodic minor: A major with a C (♭3) instead of a C♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of C major does not have.',
    scale: [
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: true },
      { note: 'G♯', outside: true },
    ],
  },
  {
    key: 'Db', chord: '2m',
    question:
      'In the key of D♭ major, the band is on E♭m (2). Which notes fit?',
    answer: 'Notes of the D♭ major scale',
    explanation:
      'E♭m is the 2 of the key of D♭ major. Every note it holds is already in the key of D♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
    ],
  },
  {
    key: 'Db', chord: '3m',
    question:
      'In the key of D♭ major, the band is on Fm (3). Which notes fit?',
    answer: 'Notes of the D♭ major scale',
    explanation:
      'Fm is the 3 of the key of D♭ major. Every note it holds is already in the key of D♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
    ],
  },
  {
    key: 'Db', chord: '4',
    question:
      'In the key of D♭ major, the band is on G♭ (4). Which notes fit?',
    answer: 'Notes of the D♭ major scale',
    explanation:
      'G♭ is the 4 of the key of D♭ major. Every note it holds is already in the key of D♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
    ],
  },
  {
    key: 'Db', chord: '5',
    question:
      'In the key of D♭ major, the band is on A♭7 (5). Which notes fit?',
    answer: 'Notes of the D♭ major scale',
    explanation:
      'A♭7 is the 5 of the key of D♭ major. Every note it holds is already in the key of D♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
    ],
  },
  {
    key: 'Db', chord: '6m',
    question:
      'In the key of D♭ major, the band is on B♭m (6). Which notes fit?',
    answer: 'Notes of the D♭ major scale',
    explanation:
      'B♭m is the 6 of the key of D♭ major. Every note it holds is already in the key of D♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
    ],
  },
  {
    key: 'Db', chord: '5of2',
    question:
      'In the key of D♭ major, the band is on B♭7 (5 of 2). Which notes fit?',
    answer: 'Notes of the E♭ melodic minor scale',
    explanation:
      'B♭7 is not in the key of D♭ major; it is the 5 of E♭m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here B♭7 (the 6 as a dominant, the 5 of 2) lands on E♭m (the 2m), so while you\'re on the B♭7 play E♭ melodic minor: E♭ major with a G♭ (♭3) instead of a G (3). Once you land, you\'re back in the key. The marked notes are the ones the key of D♭ major does not have.',
    scale: [
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: true },
    ],
  },
  {
    key: 'Db', chord: '5of3',
    question:
      'In the key of D♭ major, the band is on C7 (5 of 3). Which notes fit?',
    answer: 'Notes of the F melodic minor scale',
    explanation:
      'C7 is not in the key of D♭ major; it is the 5 of Fm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here C7 (the 7 as a dominant, the 5 of 3) lands on Fm (the 3m), so while you\'re on the C7 play F melodic minor: F major with an A♭ (♭3) instead of an A (3). Once you land, you\'re back in the key. The marked notes are the ones the key of D♭ major does not have.',
    scale: [
      { note: 'F', outside: false },
      { note: 'G', outside: true },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: true },
      { note: 'E', outside: true },
    ],
  },
  {
    key: 'Db', chord: '5of4',
    question:
      'In the key of D♭ major, the band is on D♭7 (5 of 4). Which notes fit?',
    answer: 'Notes of the G♭ major scale',
    explanation:
      'D♭7 (the 1 as a dominant, the 5 of 4) is not in the key of D♭ major; it is the 5 of G♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of D♭ major does not have.',
    scale: [
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C♭', outside: true },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
    ],
  },
  {
    key: 'Db', chord: '5of5',
    question:
      'In the key of D♭ major, the band is on E♭7 (5 of 5). Which notes fit?',
    answer: 'Notes of the A♭ major scale',
    explanation:
      'E♭7 (the 2 as a dominant, the 5 of 5) is not in the key of D♭ major; it is the 5 of A♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of D♭ major does not have.',
    scale: [
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: true },
    ],
  },
  {
    key: 'Db', chord: '5of6',
    question:
      'In the key of D♭ major, the band is on F7 (5 of 6). Which notes fit?',
    answer: 'Notes of the B♭ melodic minor scale',
    explanation:
      'F7 is not in the key of D♭ major; it is the 5 of B♭m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here F7 (the 3 as a dominant, the 5 of 6) lands on B♭m (the 6m), so while you\'re on the F7 play B♭ melodic minor: B♭ major with a D♭ (♭3) instead of a D (3). Once you land, you\'re back in the key. The marked notes are the ones the key of D♭ major does not have.',
    scale: [
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: true },
      { note: 'A', outside: true },
    ],
  },
  {
    key: 'D', chord: '2m',
    question:
      'In the key of D major, the band is on Em (2). Which notes fit?',
    answer: 'Notes of the D major scale',
    explanation:
      'Em is the 2 of the key of D major. Every note it holds is already in the key of D major, so nothing changes: stay in the key.',
    scale: [
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
    ],
  },
  {
    key: 'D', chord: '3m',
    question:
      'In the key of D major, the band is on F♯m (3). Which notes fit?',
    answer: 'Notes of the D major scale',
    explanation:
      'F♯m is the 3 of the key of D major. Every note it holds is already in the key of D major, so nothing changes: stay in the key.',
    scale: [
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
    ],
  },
  {
    key: 'D', chord: '4',
    question:
      'In the key of D major, the band is on G (4). Which notes fit?',
    answer: 'Notes of the D major scale',
    explanation:
      'G is the 4 of the key of D major. Every note it holds is already in the key of D major, so nothing changes: stay in the key.',
    scale: [
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
    ],
  },
  {
    key: 'D', chord: '5',
    question:
      'In the key of D major, the band is on A7 (5). Which notes fit?',
    answer: 'Notes of the D major scale',
    explanation:
      'A7 is the 5 of the key of D major. Every note it holds is already in the key of D major, so nothing changes: stay in the key.',
    scale: [
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
    ],
  },
  {
    key: 'D', chord: '6m',
    question:
      'In the key of D major, the band is on Bm (6). Which notes fit?',
    answer: 'Notes of the D major scale',
    explanation:
      'Bm is the 6 of the key of D major. Every note it holds is already in the key of D major, so nothing changes: stay in the key.',
    scale: [
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
    ],
  },
  {
    key: 'D', chord: '5of2',
    question:
      'In the key of D major, the band is on B7 (5 of 2). Which notes fit?',
    answer: 'Notes of the E melodic minor scale',
    explanation:
      'B7 is not in the key of D major; it is the 5 of Em. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here B7 (the 6 as a dominant, the 5 of 2) lands on Em (the 2m), so while you\'re on the B7 play E melodic minor: E major with a G (♭3) instead of a G♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of D major does not have.',
    scale: [
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: true },
    ],
  },
  {
    key: 'D', chord: '5of3',
    question:
      'In the key of D major, the band is on C♯7 (5 of 3). Which notes fit?',
    answer: 'Notes of the F♯ melodic minor scale',
    explanation:
      'C♯7 is not in the key of D major; it is the 5 of F♯m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here C♯7 (the 7 as a dominant, the 5 of 3) lands on F♯m (the 3m), so while you\'re on the C♯7 play F♯ melodic minor: F♯ major with an A (♭3) instead of an A♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of D major does not have.',
    scale: [
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: true },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: true },
      { note: 'E♯', outside: true },
    ],
  },
  {
    key: 'D', chord: '5of4',
    question:
      'In the key of D major, the band is on D7 (5 of 4). Which notes fit?',
    answer: 'Notes of the G major scale',
    explanation:
      'D7 (the 1 as a dominant, the 5 of 4) is not in the key of D major; it is the 5 of G. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of D major does not have.',
    scale: [
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C', outside: true },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
    ],
  },
  {
    key: 'D', chord: '5of5',
    question:
      'In the key of D major, the band is on E7 (5 of 5). Which notes fit?',
    answer: 'Notes of the A major scale',
    explanation:
      'E7 (the 2 as a dominant, the 5 of 5) is not in the key of D major; it is the 5 of A. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of D major does not have.',
    scale: [
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: true },
    ],
  },
  {
    key: 'D', chord: '5of6',
    question:
      'In the key of D major, the band is on F♯7 (5 of 6). Which notes fit?',
    answer: 'Notes of the B melodic minor scale',
    explanation:
      'F♯7 is not in the key of D major; it is the 5 of Bm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here F♯7 (the 3 as a dominant, the 5 of 6) lands on Bm (the 6m), so while you\'re on the F♯7 play B melodic minor: B major with a D (♭3) instead of a D♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of D major does not have.',
    scale: [
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: true },
      { note: 'A♯', outside: true },
    ],
  },
  {
    key: 'Eb', chord: '2m',
    question:
      'In the key of E♭ major, the band is on Fm (2). Which notes fit?',
    answer: 'Notes of the E♭ major scale',
    explanation:
      'Fm is the 2 of the key of E♭ major. Every note it holds is already in the key of E♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
    ],
  },
  {
    key: 'Eb', chord: '3m',
    question:
      'In the key of E♭ major, the band is on Gm (3). Which notes fit?',
    answer: 'Notes of the E♭ major scale',
    explanation:
      'Gm is the 3 of the key of E♭ major. Every note it holds is already in the key of E♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
    ],
  },
  {
    key: 'Eb', chord: '4',
    question:
      'In the key of E♭ major, the band is on A♭ (4). Which notes fit?',
    answer: 'Notes of the E♭ major scale',
    explanation:
      'A♭ is the 4 of the key of E♭ major. Every note it holds is already in the key of E♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
    ],
  },
  {
    key: 'Eb', chord: '5',
    question:
      'In the key of E♭ major, the band is on B♭7 (5). Which notes fit?',
    answer: 'Notes of the E♭ major scale',
    explanation:
      'B♭7 is the 5 of the key of E♭ major. Every note it holds is already in the key of E♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
    ],
  },
  {
    key: 'Eb', chord: '6m',
    question:
      'In the key of E♭ major, the band is on Cm (6). Which notes fit?',
    answer: 'Notes of the E♭ major scale',
    explanation:
      'Cm is the 6 of the key of E♭ major. Every note it holds is already in the key of E♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
    ],
  },
  {
    key: 'Eb', chord: '5of2',
    question:
      'In the key of E♭ major, the band is on C7 (5 of 2). Which notes fit?',
    answer: 'Notes of the F melodic minor scale',
    explanation:
      'C7 is not in the key of E♭ major; it is the 5 of Fm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here C7 (the 6 as a dominant, the 5 of 2) lands on Fm (the 2m), so while you\'re on the C7 play F melodic minor: F major with an A♭ (♭3) instead of an A (3). Once you land, you\'re back in the key. The marked notes are the ones the key of E♭ major does not have.',
    scale: [
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: true },
    ],
  },
  {
    key: 'Eb', chord: '5of3',
    question:
      'In the key of E♭ major, the band is on D7 (5 of 3). Which notes fit?',
    answer: 'Notes of the G melodic minor scale',
    explanation:
      'D7 is not in the key of E♭ major; it is the 5 of Gm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here D7 (the 7 as a dominant, the 5 of 3) lands on Gm (the 3m), so while you\'re on the D7 play G melodic minor: G major with a B♭ (♭3) instead of a B (3). Once you land, you\'re back in the key. The marked notes are the ones the key of E♭ major does not have.',
    scale: [
      { note: 'G', outside: false },
      { note: 'A', outside: true },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: true },
      { note: 'F♯', outside: true },
    ],
  },
  {
    key: 'Eb', chord: '5of4',
    question:
      'In the key of E♭ major, the band is on E♭7 (5 of 4). Which notes fit?',
    answer: 'Notes of the A♭ major scale',
    explanation:
      'E♭7 (the 1 as a dominant, the 5 of 4) is not in the key of E♭ major; it is the 5 of A♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of E♭ major does not have.',
    scale: [
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D♭', outside: true },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
    ],
  },
  {
    key: 'Eb', chord: '5of5',
    question:
      'In the key of E♭ major, the band is on F7 (5 of 5). Which notes fit?',
    answer: 'Notes of the B♭ major scale',
    explanation:
      'F7 (the 2 as a dominant, the 5 of 5) is not in the key of E♭ major; it is the 5 of B♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of E♭ major does not have.',
    scale: [
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: true },
    ],
  },
  {
    key: 'Eb', chord: '5of6',
    question:
      'In the key of E♭ major, the band is on G7 (5 of 6). Which notes fit?',
    answer: 'Notes of the C melodic minor scale',
    explanation:
      'G7 is not in the key of E♭ major; it is the 5 of Cm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here G7 (the 3 as a dominant, the 5 of 6) lands on Cm (the 6m), so while you\'re on the G7 play C melodic minor: C major with an E♭ (♭3) instead of an E (3). Once you land, you\'re back in the key. The marked notes are the ones the key of E♭ major does not have.',
    scale: [
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: true },
      { note: 'B', outside: true },
    ],
  },
  {
    key: 'E', chord: '2m',
    question:
      'In the key of E major, the band is on F♯m (2). Which notes fit?',
    answer: 'Notes of the E major scale',
    explanation:
      'F♯m is the 2 of the key of E major. Every note it holds is already in the key of E major, so nothing changes: stay in the key.',
    scale: [
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
    ],
  },
  {
    key: 'E', chord: '3m',
    question:
      'In the key of E major, the band is on G♯m (3). Which notes fit?',
    answer: 'Notes of the E major scale',
    explanation:
      'G♯m is the 3 of the key of E major. Every note it holds is already in the key of E major, so nothing changes: stay in the key.',
    scale: [
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
    ],
  },
  {
    key: 'E', chord: '4',
    question:
      'In the key of E major, the band is on A (4). Which notes fit?',
    answer: 'Notes of the E major scale',
    explanation:
      'A is the 4 of the key of E major. Every note it holds is already in the key of E major, so nothing changes: stay in the key.',
    scale: [
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
    ],
  },
  {
    key: 'E', chord: '5',
    question:
      'In the key of E major, the band is on B7 (5). Which notes fit?',
    answer: 'Notes of the E major scale',
    explanation:
      'B7 is the 5 of the key of E major. Every note it holds is already in the key of E major, so nothing changes: stay in the key.',
    scale: [
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
    ],
  },
  {
    key: 'E', chord: '6m',
    question:
      'In the key of E major, the band is on C♯m (6). Which notes fit?',
    answer: 'Notes of the E major scale',
    explanation:
      'C♯m is the 6 of the key of E major. Every note it holds is already in the key of E major, so nothing changes: stay in the key.',
    scale: [
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
    ],
  },
  {
    key: 'E', chord: '5of2',
    question:
      'In the key of E major, the band is on C♯7 (5 of 2). Which notes fit?',
    answer: 'Notes of the F♯ melodic minor scale',
    explanation:
      'C♯7 is not in the key of E major; it is the 5 of F♯m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here C♯7 (the 6 as a dominant, the 5 of 2) lands on F♯m (the 2m), so while you\'re on the C♯7 play F♯ melodic minor: F♯ major with an A (♭3) instead of an A♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of E major does not have.',
    scale: [
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E♯', outside: true },
    ],
  },
  {
    key: 'E', chord: '5of3',
    question:
      'In the key of E major, the band is on D♯7 (5 of 3). Which notes fit?',
    answer: 'Notes of the G♯ melodic minor scale',
    explanation:
      'D♯7 is not in the key of E major; it is the 5 of G♯m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here D♯7 (the 7 as a dominant, the 5 of 3) lands on G♯m (the 3m), so while you\'re on the D♯7 play G♯ melodic minor: G♯ major with a B (♭3) instead of a B♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of E major does not have.',
    scale: [
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: true },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E♯', outside: true },
      { note: 'F𝄪', outside: true },
    ],
  },
  {
    key: 'E', chord: '5of4',
    question:
      'In the key of E major, the band is on E7 (5 of 4). Which notes fit?',
    answer: 'Notes of the A major scale',
    explanation:
      'E7 (the 1 as a dominant, the 5 of 4) is not in the key of E major; it is the 5 of A. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of E major does not have.',
    scale: [
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D', outside: true },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
    ],
  },
  {
    key: 'E', chord: '5of5',
    question:
      'In the key of E major, the band is on F♯7 (5 of 5). Which notes fit?',
    answer: 'Notes of the B major scale',
    explanation:
      'F♯7 (the 2 as a dominant, the 5 of 5) is not in the key of E major; it is the 5 of B. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of E major does not have.',
    scale: [
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: true },
    ],
  },
  {
    key: 'E', chord: '5of6',
    question:
      'In the key of E major, the band is on G♯7 (5 of 6). Which notes fit?',
    answer: 'Notes of the C♯ melodic minor scale',
    explanation:
      'G♯7 is not in the key of E major; it is the 5 of C♯m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here G♯7 (the 3 as a dominant, the 5 of 6) lands on C♯m (the 6m), so while you\'re on the G♯7 play C♯ melodic minor: C♯ major with an E (♭3) instead of an E♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of E major does not have.',
    scale: [
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: true },
      { note: 'B♯', outside: true },
    ],
  },
  {
    key: 'F', chord: '2m',
    question:
      'In the key of F major, the band is on Gm (2). Which notes fit?',
    answer: 'Notes of the F major scale',
    explanation:
      'Gm is the 2 of the key of F major. Every note it holds is already in the key of F major, so nothing changes: stay in the key.',
    scale: [
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
    ],
  },
  {
    key: 'F', chord: '3m',
    question:
      'In the key of F major, the band is on Am (3). Which notes fit?',
    answer: 'Notes of the F major scale',
    explanation:
      'Am is the 3 of the key of F major. Every note it holds is already in the key of F major, so nothing changes: stay in the key.',
    scale: [
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
    ],
  },
  {
    key: 'F', chord: '4',
    question:
      'In the key of F major, the band is on B♭ (4). Which notes fit?',
    answer: 'Notes of the F major scale',
    explanation:
      'B♭ is the 4 of the key of F major. Every note it holds is already in the key of F major, so nothing changes: stay in the key.',
    scale: [
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
    ],
  },
  {
    key: 'F', chord: '5',
    question:
      'In the key of F major, the band is on C7 (5). Which notes fit?',
    answer: 'Notes of the F major scale',
    explanation:
      'C7 is the 5 of the key of F major. Every note it holds is already in the key of F major, so nothing changes: stay in the key.',
    scale: [
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
    ],
  },
  {
    key: 'F', chord: '6m',
    question:
      'In the key of F major, the band is on Dm (6). Which notes fit?',
    answer: 'Notes of the F major scale',
    explanation:
      'Dm is the 6 of the key of F major. Every note it holds is already in the key of F major, so nothing changes: stay in the key.',
    scale: [
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
    ],
  },
  {
    key: 'F', chord: '5of2',
    question:
      'In the key of F major, the band is on D7 (5 of 2). Which notes fit?',
    answer: 'Notes of the G melodic minor scale',
    explanation:
      'D7 is not in the key of F major; it is the 5 of Gm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here D7 (the 6 as a dominant, the 5 of 2) lands on Gm (the 2m), so while you\'re on the D7 play G melodic minor: G major with a B♭ (♭3) instead of a B (3). Once you land, you\'re back in the key. The marked notes are the ones the key of F major does not have.',
    scale: [
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: true },
    ],
  },
  {
    key: 'F', chord: '5of3',
    question:
      'In the key of F major, the band is on E7 (5 of 3). Which notes fit?',
    answer: 'Notes of the A melodic minor scale',
    explanation:
      'E7 is not in the key of F major; it is the 5 of Am. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here E7 (the 7 as a dominant, the 5 of 3) lands on Am (the 3m), so while you\'re on the E7 play A melodic minor: A major with a C (♭3) instead of a C♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of F major does not have.',
    scale: [
      { note: 'A', outside: false },
      { note: 'B', outside: true },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: true },
      { note: 'G♯', outside: true },
    ],
  },
  {
    key: 'F', chord: '5of4',
    question:
      'In the key of F major, the band is on F7 (5 of 4). Which notes fit?',
    answer: 'Notes of the B♭ major scale',
    explanation:
      'F7 (the 1 as a dominant, the 5 of 4) is not in the key of F major; it is the 5 of B♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of F major does not have.',
    scale: [
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E♭', outside: true },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
    ],
  },
  {
    key: 'F', chord: '5of5',
    question:
      'In the key of F major, the band is on G7 (5 of 5). Which notes fit?',
    answer: 'Notes of the C major scale',
    explanation:
      'G7 (the 2 as a dominant, the 5 of 5) is not in the key of F major; it is the 5 of C. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of F major does not have.',
    scale: [
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: true },
    ],
  },
  {
    key: 'F', chord: '5of6',
    question:
      'In the key of F major, the band is on A7 (5 of 6). Which notes fit?',
    answer: 'Notes of the D melodic minor scale',
    explanation:
      'A7 is not in the key of F major; it is the 5 of Dm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here A7 (the 3 as a dominant, the 5 of 6) lands on Dm (the 6m), so while you\'re on the A7 play D melodic minor: D major with an F (♭3) instead of an F♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of F major does not have.',
    scale: [
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: true },
      { note: 'C♯', outside: true },
    ],
  },
  {
    key: 'F#', chord: '2m',
    question:
      'In the key of F♯ major, the band is on G♯m (2). Which notes fit?',
    answer: 'Notes of the F♯ major scale',
    explanation:
      'G♯m is the 2 of the key of F♯ major. Every note it holds is already in the key of F♯ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E♯', outside: false },
    ],
  },
  {
    key: 'F#', chord: '3m',
    question:
      'In the key of F♯ major, the band is on A♯m (3). Which notes fit?',
    answer: 'Notes of the F♯ major scale',
    explanation:
      'A♯m is the 3 of the key of F♯ major. Every note it holds is already in the key of F♯ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E♯', outside: false },
    ],
  },
  {
    key: 'F#', chord: '4',
    question:
      'In the key of F♯ major, the band is on B (4). Which notes fit?',
    answer: 'Notes of the F♯ major scale',
    explanation:
      'B is the 4 of the key of F♯ major. Every note it holds is already in the key of F♯ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E♯', outside: false },
    ],
  },
  {
    key: 'F#', chord: '5',
    question:
      'In the key of F♯ major, the band is on C♯7 (5). Which notes fit?',
    answer: 'Notes of the F♯ major scale',
    explanation:
      'C♯7 is the 5 of the key of F♯ major. Every note it holds is already in the key of F♯ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E♯', outside: false },
    ],
  },
  {
    key: 'F#', chord: '6m',
    question:
      'In the key of F♯ major, the band is on D♯m (6). Which notes fit?',
    answer: 'Notes of the F♯ major scale',
    explanation:
      'D♯m is the 6 of the key of F♯ major. Every note it holds is already in the key of F♯ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E♯', outside: false },
    ],
  },
  {
    key: 'F#', chord: '5of2',
    question:
      'In the key of F♯ major, the band is on D♯7 (5 of 2). Which notes fit?',
    answer: 'Notes of the G♯ melodic minor scale',
    explanation:
      'D♯7 is not in the key of F♯ major; it is the 5 of G♯m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here D♯7 (the 6 as a dominant, the 5 of 2) lands on G♯m (the 2m), so while you\'re on the D♯7 play G♯ melodic minor: G♯ major with a B (♭3) instead of a B♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of F♯ major does not have.',
    scale: [
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E♯', outside: false },
      { note: 'F𝄪', outside: true },
    ],
  },
  {
    key: 'F#', chord: '5of3',
    question:
      'In the key of F♯ major, the band is on E♯7 (5 of 3). Which notes fit?',
    answer: 'Notes of the A♯ melodic minor scale',
    explanation:
      'E♯7 is not in the key of F♯ major; it is the 5 of A♯m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here E♯7 (the 7 as a dominant, the 5 of 3) lands on A♯m (the 3m), so while you\'re on the E♯7 play A♯ melodic minor: A♯ major with a C♯ (♭3) instead of a C𝄪 (3). Once you land, you\'re back in the key. The marked notes are the ones the key of F♯ major does not have.',
    scale: [
      { note: 'A♯', outside: false },
      { note: 'B♯', outside: true },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E♯', outside: false },
      { note: 'F𝄪', outside: true },
      { note: 'G𝄪', outside: true },
    ],
  },
  {
    key: 'F#', chord: '5of4',
    question:
      'In the key of F♯ major, the band is on F♯7 (5 of 4). Which notes fit?',
    answer: 'Notes of the B major scale',
    explanation:
      'F♯7 (the 1 as a dominant, the 5 of 4) is not in the key of F♯ major; it is the 5 of B. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of F♯ major does not have.',
    scale: [
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E', outside: true },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
    ],
  },
  {
    key: 'F#', chord: '5of5',
    question:
      'In the key of F♯ major, the band is on G♯7 (5 of 5). Which notes fit?',
    answer: 'Notes of the C♯ major scale',
    explanation:
      'G♯7 (the 2 as a dominant, the 5 of 5) is not in the key of F♯ major; it is the 5 of C♯. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of F♯ major does not have.',
    scale: [
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E♯', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
      { note: 'B♯', outside: true },
    ],
  },
  {
    key: 'F#', chord: '5of6',
    question:
      'In the key of F♯ major, the band is on A♯7 (5 of 6). Which notes fit?',
    answer: 'Notes of the D♯ melodic minor scale',
    explanation:
      'A♯7 is not in the key of F♯ major; it is the 5 of D♯m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here A♯7 (the 3 as a dominant, the 5 of 6) lands on D♯m (the 6m), so while you\'re on the A♯7 play D♯ melodic minor: D♯ major with an F♯ (♭3) instead of an F𝄪 (3). Once you land, you\'re back in the key. The marked notes are the ones the key of F♯ major does not have.',
    scale: [
      { note: 'D♯', outside: false },
      { note: 'E♯', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
      { note: 'B♯', outside: true },
      { note: 'C𝄪', outside: true },
    ],
  },
  {
    key: 'Gb', chord: '2m',
    question:
      'In the key of G♭ major, the band is on A♭m (2). Which notes fit?',
    answer: 'Notes of the G♭ major scale',
    explanation:
      'A♭m is the 2 of the key of G♭ major. Every note it holds is already in the key of G♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C♭', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
    ],
  },
  {
    key: 'Gb', chord: '3m',
    question:
      'In the key of G♭ major, the band is on B♭m (3). Which notes fit?',
    answer: 'Notes of the G♭ major scale',
    explanation:
      'B♭m is the 3 of the key of G♭ major. Every note it holds is already in the key of G♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C♭', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
    ],
  },
  {
    key: 'Gb', chord: '4',
    question:
      'In the key of G♭ major, the band is on C♭ (4). Which notes fit?',
    answer: 'Notes of the G♭ major scale',
    explanation:
      'C♭ is the 4 of the key of G♭ major. Every note it holds is already in the key of G♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C♭', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
    ],
  },
  {
    key: 'Gb', chord: '5',
    question:
      'In the key of G♭ major, the band is on D♭7 (5). Which notes fit?',
    answer: 'Notes of the G♭ major scale',
    explanation:
      'D♭7 is the 5 of the key of G♭ major. Every note it holds is already in the key of G♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C♭', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
    ],
  },
  {
    key: 'Gb', chord: '6m',
    question:
      'In the key of G♭ major, the band is on E♭m (6). Which notes fit?',
    answer: 'Notes of the G♭ major scale',
    explanation:
      'E♭m is the 6 of the key of G♭ major. Every note it holds is already in the key of G♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C♭', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
    ],
  },
  {
    key: 'Gb', chord: '5of2',
    question:
      'In the key of G♭ major, the band is on E♭7 (5 of 2). Which notes fit?',
    answer: 'Notes of the A♭ melodic minor scale',
    explanation:
      'E♭7 is not in the key of G♭ major; it is the 5 of A♭m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here E♭7 (the 6 as a dominant, the 5 of 2) lands on A♭m (the 2m), so while you\'re on the E♭7 play A♭ melodic minor: A♭ major with a C♭ (♭3) instead of a C (3). Once you land, you\'re back in the key. The marked notes are the ones the key of G♭ major does not have.',
    scale: [
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C♭', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: true },
    ],
  },
  {
    key: 'Gb', chord: '5of3',
    question:
      'In the key of G♭ major, the band is on F7 (5 of 3). Which notes fit?',
    answer: 'Notes of the B♭ melodic minor scale',
    explanation:
      'F7 is not in the key of G♭ major; it is the 5 of B♭m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here F7 (the 7 as a dominant, the 5 of 3) lands on B♭m (the 3m), so while you\'re on the F7 play B♭ melodic minor: B♭ major with a D♭ (♭3) instead of a D (3). Once you land, you\'re back in the key. The marked notes are the ones the key of G♭ major does not have.',
    scale: [
      { note: 'B♭', outside: false },
      { note: 'C', outside: true },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: true },
      { note: 'A', outside: true },
    ],
  },
  {
    key: 'Gb', chord: '5of4',
    question:
      'In the key of G♭ major, the band is on G♭7 (5 of 4). Which notes fit?',
    answer: 'Notes of the C♭ major scale',
    explanation:
      'G♭7 (the 1 as a dominant, the 5 of 4) is not in the key of G♭ major; it is the 5 of C♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of G♭ major does not have.',
    scale: [
      { note: 'C♭', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F♭', outside: true },
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
    ],
  },
  {
    key: 'Gb', chord: '5of5',
    question:
      'In the key of G♭ major, the band is on A♭7 (5 of 5). Which notes fit?',
    answer: 'Notes of the D♭ major scale',
    explanation:
      'A♭7 (the 2 as a dominant, the 5 of 5) is not in the key of G♭ major; it is the 5 of D♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of G♭ major does not have.',
    scale: [
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: true },
    ],
  },
  {
    key: 'Gb', chord: '5of6',
    question:
      'In the key of G♭ major, the band is on B♭7 (5 of 6). Which notes fit?',
    answer: 'Notes of the E♭ melodic minor scale',
    explanation:
      'B♭7 is not in the key of G♭ major; it is the 5 of E♭m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here B♭7 (the 3 as a dominant, the 5 of 6) lands on E♭m (the 6m), so while you\'re on the B♭7 play E♭ melodic minor: E♭ major with a G♭ (♭3) instead of a G (3). Once you land, you\'re back in the key. The marked notes are the ones the key of G♭ major does not have.',
    scale: [
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G♭', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: true },
      { note: 'D', outside: true },
    ],
  },
  {
    key: 'G', chord: '2m',
    question:
      'In the key of G major, the band is on Am (2). Which notes fit?',
    answer: 'Notes of the G major scale',
    explanation:
      'Am is the 2 of the key of G major. Every note it holds is already in the key of G major, so nothing changes: stay in the key.',
    scale: [
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
    ],
  },
  {
    key: 'G', chord: '3m',
    question:
      'In the key of G major, the band is on Bm (3). Which notes fit?',
    answer: 'Notes of the G major scale',
    explanation:
      'Bm is the 3 of the key of G major. Every note it holds is already in the key of G major, so nothing changes: stay in the key.',
    scale: [
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
    ],
  },
  {
    key: 'G', chord: '4',
    question:
      'In the key of G major, the band is on C (4). Which notes fit?',
    answer: 'Notes of the G major scale',
    explanation:
      'C is the 4 of the key of G major. Every note it holds is already in the key of G major, so nothing changes: stay in the key.',
    scale: [
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
    ],
  },
  {
    key: 'G', chord: '5',
    question:
      'In the key of G major, the band is on D7 (5). Which notes fit?',
    answer: 'Notes of the G major scale',
    explanation:
      'D7 is the 5 of the key of G major. Every note it holds is already in the key of G major, so nothing changes: stay in the key.',
    scale: [
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
    ],
  },
  {
    key: 'G', chord: '6m',
    question:
      'In the key of G major, the band is on Em (6). Which notes fit?',
    answer: 'Notes of the G major scale',
    explanation:
      'Em is the 6 of the key of G major. Every note it holds is already in the key of G major, so nothing changes: stay in the key.',
    scale: [
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
    ],
  },
  {
    key: 'G', chord: '5of2',
    question:
      'In the key of G major, the band is on E7 (5 of 2). Which notes fit?',
    answer: 'Notes of the A melodic minor scale',
    explanation:
      'E7 is not in the key of G major; it is the 5 of Am. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here E7 (the 6 as a dominant, the 5 of 2) lands on Am (the 2m), so while you\'re on the E7 play A melodic minor: A major with a C (♭3) instead of a C♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of G major does not have.',
    scale: [
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: true },
    ],
  },
  {
    key: 'G', chord: '5of3',
    question:
      'In the key of G major, the band is on F♯7 (5 of 3). Which notes fit?',
    answer: 'Notes of the B melodic minor scale',
    explanation:
      'F♯7 is not in the key of G major; it is the 5 of Bm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here F♯7 (the 7 as a dominant, the 5 of 3) lands on Bm (the 3m), so while you\'re on the F♯7 play B melodic minor: B major with a D (♭3) instead of a D♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of G major does not have.',
    scale: [
      { note: 'B', outside: false },
      { note: 'C♯', outside: true },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: true },
      { note: 'A♯', outside: true },
    ],
  },
  {
    key: 'G', chord: '5of4',
    question:
      'In the key of G major, the band is on G7 (5 of 4). Which notes fit?',
    answer: 'Notes of the C major scale',
    explanation:
      'G7 (the 1 as a dominant, the 5 of 4) is not in the key of G major; it is the 5 of C. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of G major does not have.',
    scale: [
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F', outside: true },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
    ],
  },
  {
    key: 'G', chord: '5of5',
    question:
      'In the key of G major, the band is on A7 (5 of 5). Which notes fit?',
    answer: 'Notes of the D major scale',
    explanation:
      'A7 (the 2 as a dominant, the 5 of 5) is not in the key of G major; it is the 5 of D. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of G major does not have.',
    scale: [
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: true },
    ],
  },
  {
    key: 'G', chord: '5of6',
    question:
      'In the key of G major, the band is on B7 (5 of 6). Which notes fit?',
    answer: 'Notes of the E melodic minor scale',
    explanation:
      'B7 is not in the key of G major; it is the 5 of Em. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here B7 (the 3 as a dominant, the 5 of 6) lands on Em (the 6m), so while you\'re on the B7 play E melodic minor: E major with a G (♭3) instead of a G♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of G major does not have.',
    scale: [
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: true },
      { note: 'D♯', outside: true },
    ],
  },
  {
    key: 'Ab', chord: '2m',
    question:
      'In the key of A♭ major, the band is on B♭m (2). Which notes fit?',
    answer: 'Notes of the A♭ major scale',
    explanation:
      'B♭m is the 2 of the key of A♭ major. Every note it holds is already in the key of A♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
    ],
  },
  {
    key: 'Ab', chord: '3m',
    question:
      'In the key of A♭ major, the band is on Cm (3). Which notes fit?',
    answer: 'Notes of the A♭ major scale',
    explanation:
      'Cm is the 3 of the key of A♭ major. Every note it holds is already in the key of A♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
    ],
  },
  {
    key: 'Ab', chord: '4',
    question:
      'In the key of A♭ major, the band is on D♭ (4). Which notes fit?',
    answer: 'Notes of the A♭ major scale',
    explanation:
      'D♭ is the 4 of the key of A♭ major. Every note it holds is already in the key of A♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
    ],
  },
  {
    key: 'Ab', chord: '5',
    question:
      'In the key of A♭ major, the band is on E♭7 (5). Which notes fit?',
    answer: 'Notes of the A♭ major scale',
    explanation:
      'E♭7 is the 5 of the key of A♭ major. Every note it holds is already in the key of A♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
    ],
  },
  {
    key: 'Ab', chord: '6m',
    question:
      'In the key of A♭ major, the band is on Fm (6). Which notes fit?',
    answer: 'Notes of the A♭ major scale',
    explanation:
      'Fm is the 6 of the key of A♭ major. Every note it holds is already in the key of A♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
    ],
  },
  {
    key: 'Ab', chord: '5of2',
    question:
      'In the key of A♭ major, the band is on F7 (5 of 2). Which notes fit?',
    answer: 'Notes of the B♭ melodic minor scale',
    explanation:
      'F7 is not in the key of A♭ major; it is the 5 of B♭m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here F7 (the 6 as a dominant, the 5 of 2) lands on B♭m (the 2m), so while you\'re on the F7 play B♭ melodic minor: B♭ major with a D♭ (♭3) instead of a D (3). Once you land, you\'re back in the key. The marked notes are the ones the key of A♭ major does not have.',
    scale: [
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: true },
    ],
  },
  {
    key: 'Ab', chord: '5of3',
    question:
      'In the key of A♭ major, the band is on G7 (5 of 3). Which notes fit?',
    answer: 'Notes of the C melodic minor scale',
    explanation:
      'G7 is not in the key of A♭ major; it is the 5 of Cm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here G7 (the 7 as a dominant, the 5 of 3) lands on Cm (the 3m), so while you\'re on the G7 play C melodic minor: C major with an E♭ (♭3) instead of an E (3). Once you land, you\'re back in the key. The marked notes are the ones the key of A♭ major does not have.',
    scale: [
      { note: 'C', outside: false },
      { note: 'D', outside: true },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: true },
      { note: 'B', outside: true },
    ],
  },
  {
    key: 'Ab', chord: '5of4',
    question:
      'In the key of A♭ major, the band is on A♭7 (5 of 4). Which notes fit?',
    answer: 'Notes of the D♭ major scale',
    explanation:
      'A♭7 (the 1 as a dominant, the 5 of 4) is not in the key of A♭ major; it is the 5 of D♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of A♭ major does not have.',
    scale: [
      { note: 'D♭', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G♭', outside: true },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
    ],
  },
  {
    key: 'Ab', chord: '5of5',
    question:
      'In the key of A♭ major, the band is on B♭7 (5 of 5). Which notes fit?',
    answer: 'Notes of the E♭ major scale',
    explanation:
      'B♭7 (the 2 as a dominant, the 5 of 5) is not in the key of A♭ major; it is the 5 of E♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of A♭ major does not have.',
    scale: [
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: true },
    ],
  },
  {
    key: 'Ab', chord: '5of6',
    question:
      'In the key of A♭ major, the band is on C7 (5 of 6). Which notes fit?',
    answer: 'Notes of the F melodic minor scale',
    explanation:
      'C7 is not in the key of A♭ major; it is the 5 of Fm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here C7 (the 3 as a dominant, the 5 of 6) lands on Fm (the 6m), so while you\'re on the C7 play F melodic minor: F major with an A♭ (♭3) instead of an A (3). Once you land, you\'re back in the key. The marked notes are the ones the key of A♭ major does not have.',
    scale: [
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A♭', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: true },
      { note: 'E', outside: true },
    ],
  },
  {
    key: 'A', chord: '2m',
    question:
      'In the key of A major, the band is on Bm (2). Which notes fit?',
    answer: 'Notes of the A major scale',
    explanation:
      'Bm is the 2 of the key of A major. Every note it holds is already in the key of A major, so nothing changes: stay in the key.',
    scale: [
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
    ],
  },
  {
    key: 'A', chord: '3m',
    question:
      'In the key of A major, the band is on C♯m (3). Which notes fit?',
    answer: 'Notes of the A major scale',
    explanation:
      'C♯m is the 3 of the key of A major. Every note it holds is already in the key of A major, so nothing changes: stay in the key.',
    scale: [
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
    ],
  },
  {
    key: 'A', chord: '4',
    question:
      'In the key of A major, the band is on D (4). Which notes fit?',
    answer: 'Notes of the A major scale',
    explanation:
      'D is the 4 of the key of A major. Every note it holds is already in the key of A major, so nothing changes: stay in the key.',
    scale: [
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
    ],
  },
  {
    key: 'A', chord: '5',
    question:
      'In the key of A major, the band is on E7 (5). Which notes fit?',
    answer: 'Notes of the A major scale',
    explanation:
      'E7 is the 5 of the key of A major. Every note it holds is already in the key of A major, so nothing changes: stay in the key.',
    scale: [
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
    ],
  },
  {
    key: 'A', chord: '6m',
    question:
      'In the key of A major, the band is on F♯m (6). Which notes fit?',
    answer: 'Notes of the A major scale',
    explanation:
      'F♯m is the 6 of the key of A major. Every note it holds is already in the key of A major, so nothing changes: stay in the key.',
    scale: [
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
    ],
  },
  {
    key: 'A', chord: '5of2',
    question:
      'In the key of A major, the band is on F♯7 (5 of 2). Which notes fit?',
    answer: 'Notes of the B melodic minor scale',
    explanation:
      'F♯7 is not in the key of A major; it is the 5 of Bm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here F♯7 (the 6 as a dominant, the 5 of 2) lands on Bm (the 2m), so while you\'re on the F♯7 play B melodic minor: B major with a D (♭3) instead of a D♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of A major does not have.',
    scale: [
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: true },
    ],
  },
  {
    key: 'A', chord: '5of3',
    question:
      'In the key of A major, the band is on G♯7 (5 of 3). Which notes fit?',
    answer: 'Notes of the C♯ melodic minor scale',
    explanation:
      'G♯7 is not in the key of A major; it is the 5 of C♯m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here G♯7 (the 7 as a dominant, the 5 of 3) lands on C♯m (the 3m), so while you\'re on the G♯7 play C♯ melodic minor: C♯ major with an E (♭3) instead of an E♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of A major does not have.',
    scale: [
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: true },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: true },
      { note: 'B♯', outside: true },
    ],
  },
  {
    key: 'A', chord: '5of4',
    question:
      'In the key of A major, the band is on A7 (5 of 4). Which notes fit?',
    answer: 'Notes of the D major scale',
    explanation:
      'A7 (the 1 as a dominant, the 5 of 4) is not in the key of A major; it is the 5 of D. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of A major does not have.',
    scale: [
      { note: 'D', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G', outside: true },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
    ],
  },
  {
    key: 'A', chord: '5of5',
    question:
      'In the key of A major, the band is on B7 (5 of 5). Which notes fit?',
    answer: 'Notes of the E major scale',
    explanation:
      'B7 (the 2 as a dominant, the 5 of 5) is not in the key of A major; it is the 5 of E. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of A major does not have.',
    scale: [
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: true },
    ],
  },
  {
    key: 'A', chord: '5of6',
    question:
      'In the key of A major, the band is on C♯7 (5 of 6). Which notes fit?',
    answer: 'Notes of the F♯ melodic minor scale',
    explanation:
      'C♯7 is not in the key of A major; it is the 5 of F♯m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here C♯7 (the 3 as a dominant, the 5 of 6) lands on F♯m (the 6m), so while you\'re on the C♯7 play F♯ melodic minor: F♯ major with an A (♭3) instead of an A♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of A major does not have.',
    scale: [
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: true },
      { note: 'E♯', outside: true },
    ],
  },
  {
    key: 'Bb', chord: '2m',
    question:
      'In the key of B♭ major, the band is on Cm (2). Which notes fit?',
    answer: 'Notes of the B♭ major scale',
    explanation:
      'Cm is the 2 of the key of B♭ major. Every note it holds is already in the key of B♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
    ],
  },
  {
    key: 'Bb', chord: '3m',
    question:
      'In the key of B♭ major, the band is on Dm (3). Which notes fit?',
    answer: 'Notes of the B♭ major scale',
    explanation:
      'Dm is the 3 of the key of B♭ major. Every note it holds is already in the key of B♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
    ],
  },
  {
    key: 'Bb', chord: '4',
    question:
      'In the key of B♭ major, the band is on E♭ (4). Which notes fit?',
    answer: 'Notes of the B♭ major scale',
    explanation:
      'E♭ is the 4 of the key of B♭ major. Every note it holds is already in the key of B♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
    ],
  },
  {
    key: 'Bb', chord: '5',
    question:
      'In the key of B♭ major, the band is on F7 (5). Which notes fit?',
    answer: 'Notes of the B♭ major scale',
    explanation:
      'F7 is the 5 of the key of B♭ major. Every note it holds is already in the key of B♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
    ],
  },
  {
    key: 'Bb', chord: '6m',
    question:
      'In the key of B♭ major, the band is on Gm (6). Which notes fit?',
    answer: 'Notes of the B♭ major scale',
    explanation:
      'Gm is the 6 of the key of B♭ major. Every note it holds is already in the key of B♭ major, so nothing changes: stay in the key.',
    scale: [
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
    ],
  },
  {
    key: 'Bb', chord: '5of2',
    question:
      'In the key of B♭ major, the band is on G7 (5 of 2). Which notes fit?',
    answer: 'Notes of the C melodic minor scale',
    explanation:
      'G7 is not in the key of B♭ major; it is the 5 of Cm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here G7 (the 6 as a dominant, the 5 of 2) lands on Cm (the 2m), so while you\'re on the G7 play C melodic minor: C major with an E♭ (♭3) instead of an E (3). Once you land, you\'re back in the key. The marked notes are the ones the key of B♭ major does not have.',
    scale: [
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: true },
    ],
  },
  {
    key: 'Bb', chord: '5of3',
    question:
      'In the key of B♭ major, the band is on A7 (5 of 3). Which notes fit?',
    answer: 'Notes of the D melodic minor scale',
    explanation:
      'A7 is not in the key of B♭ major; it is the 5 of Dm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here A7 (the 7 as a dominant, the 5 of 3) lands on Dm (the 3m), so while you\'re on the A7 play D melodic minor: D major with an F (♭3) instead of an F♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of B♭ major does not have.',
    scale: [
      { note: 'D', outside: false },
      { note: 'E', outside: true },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B', outside: true },
      { note: 'C♯', outside: true },
    ],
  },
  {
    key: 'Bb', chord: '5of4',
    question:
      'In the key of B♭ major, the band is on B♭7 (5 of 4). Which notes fit?',
    answer: 'Notes of the E♭ major scale',
    explanation:
      'B♭7 (the 1 as a dominant, the 5 of 4) is not in the key of B♭ major; it is the 5 of E♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of B♭ major does not have.',
    scale: [
      { note: 'E♭', outside: false },
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A♭', outside: true },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
    ],
  },
  {
    key: 'Bb', chord: '5of5',
    question:
      'In the key of B♭ major, the band is on C7 (5 of 5). Which notes fit?',
    answer: 'Notes of the F major scale',
    explanation:
      'C7 (the 2 as a dominant, the 5 of 5) is not in the key of B♭ major; it is the 5 of F. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of B♭ major does not have.',
    scale: [
      { note: 'F', outside: false },
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: true },
    ],
  },
  {
    key: 'Bb', chord: '5of6',
    question:
      'In the key of B♭ major, the band is on D7 (5 of 6). Which notes fit?',
    answer: 'Notes of the G melodic minor scale',
    explanation:
      'D7 is not in the key of B♭ major; it is the 5 of Gm. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here D7 (the 3 as a dominant, the 5 of 6) lands on Gm (the 6m), so while you\'re on the D7 play G melodic minor: G major with a B♭ (♭3) instead of a B (3). Once you land, you\'re back in the key. The marked notes are the ones the key of B♭ major does not have.',
    scale: [
      { note: 'G', outside: false },
      { note: 'A', outside: false },
      { note: 'B♭', outside: false },
      { note: 'C', outside: false },
      { note: 'D', outside: false },
      { note: 'E', outside: true },
      { note: 'F♯', outside: true },
    ],
  },
  {
    key: 'B', chord: '2m',
    question:
      'In the key of B major, the band is on C♯m (2). Which notes fit?',
    answer: 'Notes of the B major scale',
    explanation:
      'C♯m is the 2 of the key of B major. Every note it holds is already in the key of B major, so nothing changes: stay in the key.',
    scale: [
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
    ],
  },
  {
    key: 'B', chord: '3m',
    question:
      'In the key of B major, the band is on D♯m (3). Which notes fit?',
    answer: 'Notes of the B major scale',
    explanation:
      'D♯m is the 3 of the key of B major. Every note it holds is already in the key of B major, so nothing changes: stay in the key.',
    scale: [
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
    ],
  },
  {
    key: 'B', chord: '4',
    question:
      'In the key of B major, the band is on E (4). Which notes fit?',
    answer: 'Notes of the B major scale',
    explanation:
      'E is the 4 of the key of B major. Every note it holds is already in the key of B major, so nothing changes: stay in the key.',
    scale: [
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
    ],
  },
  {
    key: 'B', chord: '5',
    question:
      'In the key of B major, the band is on F♯7 (5). Which notes fit?',
    answer: 'Notes of the B major scale',
    explanation:
      'F♯7 is the 5 of the key of B major. Every note it holds is already in the key of B major, so nothing changes: stay in the key.',
    scale: [
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
    ],
  },
  {
    key: 'B', chord: '6m',
    question:
      'In the key of B major, the band is on G♯m (6). Which notes fit?',
    answer: 'Notes of the B major scale',
    explanation:
      'G♯m is the 6 of the key of B major. Every note it holds is already in the key of B major, so nothing changes: stay in the key.',
    scale: [
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
    ],
  },
  {
    key: 'B', chord: '5of2',
    question:
      'In the key of B major, the band is on G♯7 (5 of 2). Which notes fit?',
    answer: 'Notes of the C♯ melodic minor scale',
    explanation:
      'G♯7 is not in the key of B major; it is the 5 of C♯m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here G♯7 (the 6 as a dominant, the 5 of 2) lands on C♯m (the 2m), so while you\'re on the G♯7 play C♯ melodic minor: C♯ major with an E (♭3) instead of an E♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of B major does not have.',
    scale: [
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
      { note: 'B♯', outside: true },
    ],
  },
  {
    key: 'B', chord: '5of3',
    question:
      'In the key of B major, the band is on A♯7 (5 of 3). Which notes fit?',
    answer: 'Notes of the D♯ melodic minor scale',
    explanation:
      'A♯7 is not in the key of B major; it is the 5 of D♯m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here A♯7 (the 7 as a dominant, the 5 of 3) lands on D♯m (the 3m), so while you\'re on the A♯7 play D♯ melodic minor: D♯ major with an F♯ (♭3) instead of an F𝄪 (3). Once you land, you\'re back in the key. The marked notes are the ones the key of B major does not have.',
    scale: [
      { note: 'D♯', outside: false },
      { note: 'E♯', outside: true },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
      { note: 'B♯', outside: true },
      { note: 'C𝄪', outside: true },
    ],
  },
  {
    key: 'B', chord: '5of4',
    question:
      'In the key of B major, the band is on B7 (5 of 4). Which notes fit?',
    answer: 'Notes of the E major scale',
    explanation:
      'B7 (the 1 as a dominant, the 5 of 4) is not in the key of B major; it is the 5 of E. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of B major does not have.',
    scale: [
      { note: 'E', outside: false },
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A', outside: true },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
    ],
  },
  {
    key: 'B', chord: '5of5',
    question:
      'In the key of B major, the band is on C♯7 (5 of 5). Which notes fit?',
    answer: 'Notes of the F♯ major scale',
    explanation:
      'C♯7 (the 2 as a dominant, the 5 of 5) is not in the key of B major; it is the 5 of F♯. Play the notes of the key it points to for that bar. The highlighted notes are the ones the key of B major does not have.',
    scale: [
      { note: 'F♯', outside: false },
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E♯', outside: true },
    ],
  },
  {
    key: 'B', chord: '5of6',
    question:
      'In the key of B major, the band is on D♯7 (5 of 6). Which notes fit?',
    answer: 'Notes of the G♯ melodic minor scale',
    explanation:
      'D♯7 is not in the key of B major; it is the 5 of G♯m. Play the notes of the key it points to for that bar. When a secondary dominant takes you to a minor chord, improvise over that dominant with the melodic minor of the chord you\'re landing on, which is just that chord\'s major scale with a ♭3. Here D♯7 (the 3 as a dominant, the 5 of 6) lands on G♯m (the 6m), so while you\'re on the D♯7 play G♯ melodic minor: G♯ major with a B (♭3) instead of a B♯ (3). Once you land, you\'re back in the key. The marked notes are the ones the key of B major does not have.',
    scale: [
      { note: 'G♯', outside: false },
      { note: 'A♯', outside: false },
      { note: 'B', outside: false },
      { note: 'C♯', outside: false },
      { note: 'D♯', outside: false },
      { note: 'E♯', outside: true },
      { note: 'F𝄪', outside: true },
    ],
  },
];
