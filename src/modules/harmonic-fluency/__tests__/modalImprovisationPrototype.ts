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
 * ONE REPAIR, ON THIRTY ROWS, AND IT IS IN THE REPORT.
 *
 * The prototype's `parse()` reads an accidental by counting '#' and 'b'
 * characters, but `spell()` hands it names already drawn with GLYPHS —
 * 'F♯', not 'F#'. So a target root carrying an accidental parsed as a
 * natural, and `nameOf(tRoot, 7, 4)` named the borrowed chord a fifth
 * above the WRONG note. On screen: "In D, the band is on C7 (5 of 3)"
 * answered by "Notes of the F♯ melodic minor scale" — and C7 is not the
 * 5 of F♯m, C♯7 is. Thirty of the sixty-five borrowed cards name a
 * chord that cannot resolve to the chord the same card names.
 *
 * The rows below are the prototype's output with that one bug repaired,
 * which is what the app builds. NOTHING ELSE MOVED: the answer is
 * identical on all 130, and so is every `seq` — the sound is computed
 * from pitch classes and never goes through `parse`. The thirty:
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
 *
 * =====================================================================
 * ALL 130 ROWS ARE HERE, INCLUDING THE FOUR THAT ARE NOT IN THE DECK.
 *
 * `MODAL_IMPROV_STOPS` names those four and says why, and the test
 * asserts the deck is exactly this list minus exactly those — so a stop
 * cannot quietly become five, and a card cannot quietly come back
 * without its words being checked.
 * =====================================================================
 */
export interface PrototypeRow {
  key: string;
  chord: string;
  question: string;
  answer: string;
  explanation: string;
}

export const PROTOTYPE_CARDS: ReadonlyArray<PrototypeRow> = [
  {
    key: 'C', chord: '2m',
    question:
      'In C, the band is on Dm (2). Which notes fit?',
    answer: 'Notes of the C major scale',
    explanation:
      'Dm is the 2 of C. Every note it holds is already in C major, so nothing changes: stay in the key.',
  },
  {
    key: 'C', chord: '3m',
    question:
      'In C, the band is on Em (3). Which notes fit?',
    answer: 'Notes of the C major scale',
    explanation:
      'Em is the 3 of C. Every note it holds is already in C major, so nothing changes: stay in the key.',
  },
  {
    key: 'C', chord: '4',
    question:
      'In C, the band is on F (4). Which notes fit?',
    answer: 'Notes of the C major scale',
    explanation:
      'F is the 4 of C. Every note it holds is already in C major, so nothing changes: stay in the key.',
  },
  {
    key: 'C', chord: '5',
    question:
      'In C, the band is on G7 (5). Which notes fit?',
    answer: 'Notes of the C major scale',
    explanation:
      'G7 is the 5 of C. Every note it holds is already in C major, so nothing changes: stay in the key.',
  },
  {
    key: 'C', chord: '6m',
    question:
      'In C, the band is on Am (6). Which notes fit?',
    answer: 'Notes of the C major scale',
    explanation:
      'Am is the 6 of C. Every note it holds is already in C major, so nothing changes: stay in the key.',
  },
  {
    key: 'C', chord: '5of2',
    question:
      'In C, the band is on A7 (5 of 2). Which notes fit?',
    answer: 'Notes of the D melodic minor scale',
    explanation:
      'A7 is not in C major; it is the 5 of Dm. Play the notes of the key it points to for that bar. The highlighted notes are the ones C major does not have. For a minor target that is just C major with one note raised: the A7 chord\'s third.',
  },
  {
    key: 'C', chord: '5of3',
    question:
      'In C, the band is on B7 (5 of 3). Which notes fit?',
    answer: 'Notes of the E melodic minor scale',
    explanation:
      'B7 is not in C major; it is the 5 of Em. Play the notes of the key it points to for that bar. The highlighted notes are the ones C major does not have. For a minor target that is just C major with one note raised: the B7 chord\'s third.',
  },
  {
    key: 'C', chord: '5of4',
    question:
      'In C, the band is on C7 (5 of 4). Which notes fit?',
    answer: 'Notes of the F major scale',
    explanation:
      'C7 is not in C major; it is the 5 of F. Play the notes of the key it points to for that bar. The highlighted notes are the ones C major does not have.',
  },
  {
    key: 'C', chord: '5of5',
    question:
      'In C, the band is on D7 (5 of 5). Which notes fit?',
    answer: 'Notes of the G major scale',
    explanation:
      'D7 is not in C major; it is the 5 of G. Play the notes of the key it points to for that bar. The highlighted notes are the ones C major does not have.',
  },
  {
    key: 'C', chord: '5of6',
    question:
      'In C, the band is on E7 (5 of 6). Which notes fit?',
    answer: 'Notes of the A melodic minor scale',
    explanation:
      'E7 is not in C major; it is the 5 of Am. Play the notes of the key it points to for that bar. The highlighted notes are the ones C major does not have. For a minor target that is just C major with one note raised: the E7 chord\'s third.',
  },
  {
    key: 'Db', chord: '2m',
    question:
      'In D♭, the band is on E♭m (2). Which notes fit?',
    answer: 'Notes of the D♭ major scale',
    explanation:
      'E♭m is the 2 of D♭. Every note it holds is already in D♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Db', chord: '3m',
    question:
      'In D♭, the band is on Fm (3). Which notes fit?',
    answer: 'Notes of the D♭ major scale',
    explanation:
      'Fm is the 3 of D♭. Every note it holds is already in D♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Db', chord: '4',
    question:
      'In D♭, the band is on G♭ (4). Which notes fit?',
    answer: 'Notes of the D♭ major scale',
    explanation:
      'G♭ is the 4 of D♭. Every note it holds is already in D♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Db', chord: '5',
    question:
      'In D♭, the band is on A♭7 (5). Which notes fit?',
    answer: 'Notes of the D♭ major scale',
    explanation:
      'A♭7 is the 5 of D♭. Every note it holds is already in D♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Db', chord: '6m',
    question:
      'In D♭, the band is on B♭m (6). Which notes fit?',
    answer: 'Notes of the D♭ major scale',
    explanation:
      'B♭m is the 6 of D♭. Every note it holds is already in D♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Db', chord: '5of2',
    question:
      'In D♭, the band is on B♭7 (5 of 2). Which notes fit?',
    answer: 'Notes of the E♭ melodic minor scale',
    explanation:
      'B♭7 is not in D♭ major; it is the 5 of E♭m. Play the notes of the key it points to for that bar. The highlighted notes are the ones D♭ major does not have. For a minor target that is just D♭ major with one note raised: the B♭7 chord\'s third.',
  },
  {
    key: 'Db', chord: '5of3',
    question:
      'In D♭, the band is on C7 (5 of 3). Which notes fit?',
    answer: 'Notes of the F melodic minor scale',
    explanation:
      'C7 is not in D♭ major; it is the 5 of Fm. Play the notes of the key it points to for that bar. The highlighted notes are the ones D♭ major does not have. For a minor target that is just D♭ major with one note raised: the C7 chord\'s third.',
  },
  {
    key: 'Db', chord: '5of4',
    question:
      'In D♭, the band is on D♭7 (5 of 4). Which notes fit?',
    answer: 'Notes of the G♭ major scale',
    explanation:
      'D♭7 is not in D♭ major; it is the 5 of G♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones D♭ major does not have.',
  },
  {
    key: 'Db', chord: '5of5',
    question:
      'In D♭, the band is on E♭7 (5 of 5). Which notes fit?',
    answer: 'Notes of the A♭ major scale',
    explanation:
      'E♭7 is not in D♭ major; it is the 5 of A♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones D♭ major does not have.',
  },
  {
    key: 'Db', chord: '5of6',
    question:
      'In D♭, the band is on F7 (5 of 6). Which notes fit?',
    answer: 'Notes of the B♭ melodic minor scale',
    explanation:
      'F7 is not in D♭ major; it is the 5 of B♭m. Play the notes of the key it points to for that bar. The highlighted notes are the ones D♭ major does not have. For a minor target that is just D♭ major with one note raised: the F7 chord\'s third.',
  },
  {
    key: 'D', chord: '2m',
    question:
      'In D, the band is on Em (2). Which notes fit?',
    answer: 'Notes of the D major scale',
    explanation:
      'Em is the 2 of D. Every note it holds is already in D major, so nothing changes: stay in the key.',
  },
  {
    key: 'D', chord: '3m',
    question:
      'In D, the band is on F♯m (3). Which notes fit?',
    answer: 'Notes of the D major scale',
    explanation:
      'F♯m is the 3 of D. Every note it holds is already in D major, so nothing changes: stay in the key.',
  },
  {
    key: 'D', chord: '4',
    question:
      'In D, the band is on G (4). Which notes fit?',
    answer: 'Notes of the D major scale',
    explanation:
      'G is the 4 of D. Every note it holds is already in D major, so nothing changes: stay in the key.',
  },
  {
    key: 'D', chord: '5',
    question:
      'In D, the band is on A7 (5). Which notes fit?',
    answer: 'Notes of the D major scale',
    explanation:
      'A7 is the 5 of D. Every note it holds is already in D major, so nothing changes: stay in the key.',
  },
  {
    key: 'D', chord: '6m',
    question:
      'In D, the band is on Bm (6). Which notes fit?',
    answer: 'Notes of the D major scale',
    explanation:
      'Bm is the 6 of D. Every note it holds is already in D major, so nothing changes: stay in the key.',
  },
  {
    key: 'D', chord: '5of2',
    question:
      'In D, the band is on B7 (5 of 2). Which notes fit?',
    answer: 'Notes of the E melodic minor scale',
    explanation:
      'B7 is not in D major; it is the 5 of Em. Play the notes of the key it points to for that bar. The highlighted notes are the ones D major does not have. For a minor target that is just D major with one note raised: the B7 chord\'s third.',
  },
  {
    key: 'D', chord: '5of3',
    question:
      'In D, the band is on C♯7 (5 of 3). Which notes fit?',
    answer: 'Notes of the F♯ melodic minor scale',
    explanation:
      'C♯7 is not in D major; it is the 5 of F♯m. Play the notes of the key it points to for that bar. The highlighted notes are the ones D major does not have. For a minor target that is just D major with one note raised: the C♯7 chord\'s third.',
  },
  {
    key: 'D', chord: '5of4',
    question:
      'In D, the band is on D7 (5 of 4). Which notes fit?',
    answer: 'Notes of the G major scale',
    explanation:
      'D7 is not in D major; it is the 5 of G. Play the notes of the key it points to for that bar. The highlighted notes are the ones D major does not have.',
  },
  {
    key: 'D', chord: '5of5',
    question:
      'In D, the band is on E7 (5 of 5). Which notes fit?',
    answer: 'Notes of the A major scale',
    explanation:
      'E7 is not in D major; it is the 5 of A. Play the notes of the key it points to for that bar. The highlighted notes are the ones D major does not have.',
  },
  {
    key: 'D', chord: '5of6',
    question:
      'In D, the band is on F♯7 (5 of 6). Which notes fit?',
    answer: 'Notes of the B melodic minor scale',
    explanation:
      'F♯7 is not in D major; it is the 5 of Bm. Play the notes of the key it points to for that bar. The highlighted notes are the ones D major does not have. For a minor target that is just D major with one note raised: the F♯7 chord\'s third.',
  },
  {
    key: 'Eb', chord: '2m',
    question:
      'In E♭, the band is on Fm (2). Which notes fit?',
    answer: 'Notes of the E♭ major scale',
    explanation:
      'Fm is the 2 of E♭. Every note it holds is already in E♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Eb', chord: '3m',
    question:
      'In E♭, the band is on Gm (3). Which notes fit?',
    answer: 'Notes of the E♭ major scale',
    explanation:
      'Gm is the 3 of E♭. Every note it holds is already in E♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Eb', chord: '4',
    question:
      'In E♭, the band is on A♭ (4). Which notes fit?',
    answer: 'Notes of the E♭ major scale',
    explanation:
      'A♭ is the 4 of E♭. Every note it holds is already in E♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Eb', chord: '5',
    question:
      'In E♭, the band is on B♭7 (5). Which notes fit?',
    answer: 'Notes of the E♭ major scale',
    explanation:
      'B♭7 is the 5 of E♭. Every note it holds is already in E♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Eb', chord: '6m',
    question:
      'In E♭, the band is on Cm (6). Which notes fit?',
    answer: 'Notes of the E♭ major scale',
    explanation:
      'Cm is the 6 of E♭. Every note it holds is already in E♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Eb', chord: '5of2',
    question:
      'In E♭, the band is on C7 (5 of 2). Which notes fit?',
    answer: 'Notes of the F melodic minor scale',
    explanation:
      'C7 is not in E♭ major; it is the 5 of Fm. Play the notes of the key it points to for that bar. The highlighted notes are the ones E♭ major does not have. For a minor target that is just E♭ major with one note raised: the C7 chord\'s third.',
  },
  {
    key: 'Eb', chord: '5of3',
    question:
      'In E♭, the band is on D7 (5 of 3). Which notes fit?',
    answer: 'Notes of the G melodic minor scale',
    explanation:
      'D7 is not in E♭ major; it is the 5 of Gm. Play the notes of the key it points to for that bar. The highlighted notes are the ones E♭ major does not have. For a minor target that is just E♭ major with one note raised: the D7 chord\'s third.',
  },
  {
    key: 'Eb', chord: '5of4',
    question:
      'In E♭, the band is on E♭7 (5 of 4). Which notes fit?',
    answer: 'Notes of the A♭ major scale',
    explanation:
      'E♭7 is not in E♭ major; it is the 5 of A♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones E♭ major does not have.',
  },
  {
    key: 'Eb', chord: '5of5',
    question:
      'In E♭, the band is on F7 (5 of 5). Which notes fit?',
    answer: 'Notes of the B♭ major scale',
    explanation:
      'F7 is not in E♭ major; it is the 5 of B♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones E♭ major does not have.',
  },
  {
    key: 'Eb', chord: '5of6',
    question:
      'In E♭, the band is on G7 (5 of 6). Which notes fit?',
    answer: 'Notes of the C melodic minor scale',
    explanation:
      'G7 is not in E♭ major; it is the 5 of Cm. Play the notes of the key it points to for that bar. The highlighted notes are the ones E♭ major does not have. For a minor target that is just E♭ major with one note raised: the G7 chord\'s third.',
  },
  {
    key: 'E', chord: '2m',
    question:
      'In E, the band is on F♯m (2). Which notes fit?',
    answer: 'Notes of the E major scale',
    explanation:
      'F♯m is the 2 of E. Every note it holds is already in E major, so nothing changes: stay in the key.',
  },
  {
    key: 'E', chord: '3m',
    question:
      'In E, the band is on G♯m (3). Which notes fit?',
    answer: 'Notes of the E major scale',
    explanation:
      'G♯m is the 3 of E. Every note it holds is already in E major, so nothing changes: stay in the key.',
  },
  {
    key: 'E', chord: '4',
    question:
      'In E, the band is on A (4). Which notes fit?',
    answer: 'Notes of the E major scale',
    explanation:
      'A is the 4 of E. Every note it holds is already in E major, so nothing changes: stay in the key.',
  },
  {
    key: 'E', chord: '5',
    question:
      'In E, the band is on B7 (5). Which notes fit?',
    answer: 'Notes of the E major scale',
    explanation:
      'B7 is the 5 of E. Every note it holds is already in E major, so nothing changes: stay in the key.',
  },
  {
    key: 'E', chord: '6m',
    question:
      'In E, the band is on C♯m (6). Which notes fit?',
    answer: 'Notes of the E major scale',
    explanation:
      'C♯m is the 6 of E. Every note it holds is already in E major, so nothing changes: stay in the key.',
  },
  {
    key: 'E', chord: '5of2',
    question:
      'In E, the band is on C♯7 (5 of 2). Which notes fit?',
    answer: 'Notes of the F♯ melodic minor scale',
    explanation:
      'C♯7 is not in E major; it is the 5 of F♯m. Play the notes of the key it points to for that bar. The highlighted notes are the ones E major does not have. For a minor target that is just E major with one note raised: the C♯7 chord\'s third.',
  },
  {
    key: 'E', chord: '5of3',
    question:
      'In E, the band is on D♯7 (5 of 3). Which notes fit?',
    answer: 'Notes of the G♯ melodic minor scale',
    explanation:
      'D♯7 is not in E major; it is the 5 of G♯m. Play the notes of the key it points to for that bar. The highlighted notes are the ones E major does not have. For a minor target that is just E major with one note raised: the D♯7 chord\'s third.',
  },
  {
    key: 'E', chord: '5of4',
    question:
      'In E, the band is on E7 (5 of 4). Which notes fit?',
    answer: 'Notes of the A major scale',
    explanation:
      'E7 is not in E major; it is the 5 of A. Play the notes of the key it points to for that bar. The highlighted notes are the ones E major does not have.',
  },
  {
    key: 'E', chord: '5of5',
    question:
      'In E, the band is on F♯7 (5 of 5). Which notes fit?',
    answer: 'Notes of the B major scale',
    explanation:
      'F♯7 is not in E major; it is the 5 of B. Play the notes of the key it points to for that bar. The highlighted notes are the ones E major does not have.',
  },
  {
    key: 'E', chord: '5of6',
    question:
      'In E, the band is on G♯7 (5 of 6). Which notes fit?',
    answer: 'Notes of the C♯ melodic minor scale',
    explanation:
      'G♯7 is not in E major; it is the 5 of C♯m. Play the notes of the key it points to for that bar. The highlighted notes are the ones E major does not have. For a minor target that is just E major with one note raised: the G♯7 chord\'s third.',
  },
  {
    key: 'F', chord: '2m',
    question:
      'In F, the band is on Gm (2). Which notes fit?',
    answer: 'Notes of the F major scale',
    explanation:
      'Gm is the 2 of F. Every note it holds is already in F major, so nothing changes: stay in the key.',
  },
  {
    key: 'F', chord: '3m',
    question:
      'In F, the band is on Am (3). Which notes fit?',
    answer: 'Notes of the F major scale',
    explanation:
      'Am is the 3 of F. Every note it holds is already in F major, so nothing changes: stay in the key.',
  },
  {
    key: 'F', chord: '4',
    question:
      'In F, the band is on B♭ (4). Which notes fit?',
    answer: 'Notes of the F major scale',
    explanation:
      'B♭ is the 4 of F. Every note it holds is already in F major, so nothing changes: stay in the key.',
  },
  {
    key: 'F', chord: '5',
    question:
      'In F, the band is on C7 (5). Which notes fit?',
    answer: 'Notes of the F major scale',
    explanation:
      'C7 is the 5 of F. Every note it holds is already in F major, so nothing changes: stay in the key.',
  },
  {
    key: 'F', chord: '6m',
    question:
      'In F, the band is on Dm (6). Which notes fit?',
    answer: 'Notes of the F major scale',
    explanation:
      'Dm is the 6 of F. Every note it holds is already in F major, so nothing changes: stay in the key.',
  },
  {
    key: 'F', chord: '5of2',
    question:
      'In F, the band is on D7 (5 of 2). Which notes fit?',
    answer: 'Notes of the G melodic minor scale',
    explanation:
      'D7 is not in F major; it is the 5 of Gm. Play the notes of the key it points to for that bar. The highlighted notes are the ones F major does not have. For a minor target that is just F major with one note raised: the D7 chord\'s third.',
  },
  {
    key: 'F', chord: '5of3',
    question:
      'In F, the band is on E7 (5 of 3). Which notes fit?',
    answer: 'Notes of the A melodic minor scale',
    explanation:
      'E7 is not in F major; it is the 5 of Am. Play the notes of the key it points to for that bar. The highlighted notes are the ones F major does not have. For a minor target that is just F major with one note raised: the E7 chord\'s third.',
  },
  {
    key: 'F', chord: '5of4',
    question:
      'In F, the band is on F7 (5 of 4). Which notes fit?',
    answer: 'Notes of the B♭ major scale',
    explanation:
      'F7 is not in F major; it is the 5 of B♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones F major does not have.',
  },
  {
    key: 'F', chord: '5of5',
    question:
      'In F, the band is on G7 (5 of 5). Which notes fit?',
    answer: 'Notes of the C major scale',
    explanation:
      'G7 is not in F major; it is the 5 of C. Play the notes of the key it points to for that bar. The highlighted notes are the ones F major does not have.',
  },
  {
    key: 'F', chord: '5of6',
    question:
      'In F, the band is on A7 (5 of 6). Which notes fit?',
    answer: 'Notes of the D melodic minor scale',
    explanation:
      'A7 is not in F major; it is the 5 of Dm. Play the notes of the key it points to for that bar. The highlighted notes are the ones F major does not have. For a minor target that is just F major with one note raised: the A7 chord\'s third.',
  },
  {
    key: 'F#', chord: '2m',
    question:
      'In F♯, the band is on G♯m (2). Which notes fit?',
    answer: 'Notes of the F♯ major scale',
    explanation:
      'G♯m is the 2 of F♯. Every note it holds is already in F♯ major, so nothing changes: stay in the key.',
  },
  {
    key: 'F#', chord: '3m',
    question:
      'In F♯, the band is on A♯m (3). Which notes fit?',
    answer: 'Notes of the F♯ major scale',
    explanation:
      'A♯m is the 3 of F♯. Every note it holds is already in F♯ major, so nothing changes: stay in the key.',
  },
  {
    key: 'F#', chord: '4',
    question:
      'In F♯, the band is on B (4). Which notes fit?',
    answer: 'Notes of the F♯ major scale',
    explanation:
      'B is the 4 of F♯. Every note it holds is already in F♯ major, so nothing changes: stay in the key.',
  },
  {
    key: 'F#', chord: '5',
    question:
      'In F♯, the band is on C♯7 (5). Which notes fit?',
    answer: 'Notes of the F♯ major scale',
    explanation:
      'C♯7 is the 5 of F♯. Every note it holds is already in F♯ major, so nothing changes: stay in the key.',
  },
  {
    key: 'F#', chord: '6m',
    question:
      'In F♯, the band is on D♯m (6). Which notes fit?',
    answer: 'Notes of the F♯ major scale',
    explanation:
      'D♯m is the 6 of F♯. Every note it holds is already in F♯ major, so nothing changes: stay in the key.',
  },
  {
    key: 'F#', chord: '5of2',
    question:
      'In F♯, the band is on D♯7 (5 of 2). Which notes fit?',
    answer: 'Notes of the G♯ melodic minor scale',
    explanation:
      'D♯7 is not in F♯ major; it is the 5 of G♯m. Play the notes of the key it points to for that bar. The highlighted notes are the ones F♯ major does not have. For a minor target that is just F♯ major with one note raised: the D♯7 chord\'s third.',
  },
  {
    key: 'F#', chord: '5of3',
    question:
      'In F♯, the band is on E♯7 (5 of 3). Which notes fit?',
    answer: 'Notes of the A♯ melodic minor scale',
    explanation:
      'E♯7 is not in F♯ major; it is the 5 of A♯m. Play the notes of the key it points to for that bar. The highlighted notes are the ones F♯ major does not have. For a minor target that is just F♯ major with one note raised: the E♯7 chord\'s third.',
  },
  {
    key: 'F#', chord: '5of4',
    question:
      'In F♯, the band is on F♯7 (5 of 4). Which notes fit?',
    answer: 'Notes of the B major scale',
    explanation:
      'F♯7 is not in F♯ major; it is the 5 of B. Play the notes of the key it points to for that bar. The highlighted notes are the ones F♯ major does not have.',
  },
  {
    key: 'F#', chord: '5of5',
    question:
      'In F♯, the band is on G♯7 (5 of 5). Which notes fit?',
    answer: 'Notes of the C♯ major scale',
    explanation:
      'G♯7 is not in F♯ major; it is the 5 of C♯. Play the notes of the key it points to for that bar. The highlighted notes are the ones F♯ major does not have.',
  },
  {
    key: 'F#', chord: '5of6',
    question:
      'In F♯, the band is on A♯7 (5 of 6). Which notes fit?',
    answer: 'Notes of the D♯ melodic minor scale',
    explanation:
      'A♯7 is not in F♯ major; it is the 5 of D♯m. Play the notes of the key it points to for that bar. The highlighted notes are the ones F♯ major does not have. For a minor target that is just F♯ major with one note raised: the A♯7 chord\'s third.',
  },
  {
    key: 'Gb', chord: '2m',
    question:
      'In G♭, the band is on A♭m (2). Which notes fit?',
    answer: 'Notes of the G♭ major scale',
    explanation:
      'A♭m is the 2 of G♭. Every note it holds is already in G♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Gb', chord: '3m',
    question:
      'In G♭, the band is on B♭m (3). Which notes fit?',
    answer: 'Notes of the G♭ major scale',
    explanation:
      'B♭m is the 3 of G♭. Every note it holds is already in G♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Gb', chord: '4',
    question:
      'In G♭, the band is on C♭ (4). Which notes fit?',
    answer: 'Notes of the G♭ major scale',
    explanation:
      'C♭ is the 4 of G♭. Every note it holds is already in G♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Gb', chord: '5',
    question:
      'In G♭, the band is on D♭7 (5). Which notes fit?',
    answer: 'Notes of the G♭ major scale',
    explanation:
      'D♭7 is the 5 of G♭. Every note it holds is already in G♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Gb', chord: '6m',
    question:
      'In G♭, the band is on E♭m (6). Which notes fit?',
    answer: 'Notes of the G♭ major scale',
    explanation:
      'E♭m is the 6 of G♭. Every note it holds is already in G♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Gb', chord: '5of2',
    question:
      'In G♭, the band is on E♭7 (5 of 2). Which notes fit?',
    answer: 'Notes of the A♭ melodic minor scale',
    explanation:
      'E♭7 is not in G♭ major; it is the 5 of A♭m. Play the notes of the key it points to for that bar. The highlighted notes are the ones G♭ major does not have. For a minor target that is just G♭ major with one note raised: the E♭7 chord\'s third.',
  },
  {
    key: 'Gb', chord: '5of3',
    question:
      'In G♭, the band is on F7 (5 of 3). Which notes fit?',
    answer: 'Notes of the B♭ melodic minor scale',
    explanation:
      'F7 is not in G♭ major; it is the 5 of B♭m. Play the notes of the key it points to for that bar. The highlighted notes are the ones G♭ major does not have. For a minor target that is just G♭ major with one note raised: the F7 chord\'s third.',
  },
  {
    key: 'Gb', chord: '5of4',
    question:
      'In G♭, the band is on G♭7 (5 of 4). Which notes fit?',
    answer: 'Notes of the C♭ major scale',
    explanation:
      'G♭7 is not in G♭ major; it is the 5 of C♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones G♭ major does not have.',
  },
  {
    key: 'Gb', chord: '5of5',
    question:
      'In G♭, the band is on A♭7 (5 of 5). Which notes fit?',
    answer: 'Notes of the D♭ major scale',
    explanation:
      'A♭7 is not in G♭ major; it is the 5 of D♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones G♭ major does not have.',
  },
  {
    key: 'Gb', chord: '5of6',
    question:
      'In G♭, the band is on B♭7 (5 of 6). Which notes fit?',
    answer: 'Notes of the E♭ melodic minor scale',
    explanation:
      'B♭7 is not in G♭ major; it is the 5 of E♭m. Play the notes of the key it points to for that bar. The highlighted notes are the ones G♭ major does not have. For a minor target that is just G♭ major with one note raised: the B♭7 chord\'s third.',
  },
  {
    key: 'G', chord: '2m',
    question:
      'In G, the band is on Am (2). Which notes fit?',
    answer: 'Notes of the G major scale',
    explanation:
      'Am is the 2 of G. Every note it holds is already in G major, so nothing changes: stay in the key.',
  },
  {
    key: 'G', chord: '3m',
    question:
      'In G, the band is on Bm (3). Which notes fit?',
    answer: 'Notes of the G major scale',
    explanation:
      'Bm is the 3 of G. Every note it holds is already in G major, so nothing changes: stay in the key.',
  },
  {
    key: 'G', chord: '4',
    question:
      'In G, the band is on C (4). Which notes fit?',
    answer: 'Notes of the G major scale',
    explanation:
      'C is the 4 of G. Every note it holds is already in G major, so nothing changes: stay in the key.',
  },
  {
    key: 'G', chord: '5',
    question:
      'In G, the band is on D7 (5). Which notes fit?',
    answer: 'Notes of the G major scale',
    explanation:
      'D7 is the 5 of G. Every note it holds is already in G major, so nothing changes: stay in the key.',
  },
  {
    key: 'G', chord: '6m',
    question:
      'In G, the band is on Em (6). Which notes fit?',
    answer: 'Notes of the G major scale',
    explanation:
      'Em is the 6 of G. Every note it holds is already in G major, so nothing changes: stay in the key.',
  },
  {
    key: 'G', chord: '5of2',
    question:
      'In G, the band is on E7 (5 of 2). Which notes fit?',
    answer: 'Notes of the A melodic minor scale',
    explanation:
      'E7 is not in G major; it is the 5 of Am. Play the notes of the key it points to for that bar. The highlighted notes are the ones G major does not have. For a minor target that is just G major with one note raised: the E7 chord\'s third.',
  },
  {
    key: 'G', chord: '5of3',
    question:
      'In G, the band is on F♯7 (5 of 3). Which notes fit?',
    answer: 'Notes of the B melodic minor scale',
    explanation:
      'F♯7 is not in G major; it is the 5 of Bm. Play the notes of the key it points to for that bar. The highlighted notes are the ones G major does not have. For a minor target that is just G major with one note raised: the F♯7 chord\'s third.',
  },
  {
    key: 'G', chord: '5of4',
    question:
      'In G, the band is on G7 (5 of 4). Which notes fit?',
    answer: 'Notes of the C major scale',
    explanation:
      'G7 is not in G major; it is the 5 of C. Play the notes of the key it points to for that bar. The highlighted notes are the ones G major does not have.',
  },
  {
    key: 'G', chord: '5of5',
    question:
      'In G, the band is on A7 (5 of 5). Which notes fit?',
    answer: 'Notes of the D major scale',
    explanation:
      'A7 is not in G major; it is the 5 of D. Play the notes of the key it points to for that bar. The highlighted notes are the ones G major does not have.',
  },
  {
    key: 'G', chord: '5of6',
    question:
      'In G, the band is on B7 (5 of 6). Which notes fit?',
    answer: 'Notes of the E melodic minor scale',
    explanation:
      'B7 is not in G major; it is the 5 of Em. Play the notes of the key it points to for that bar. The highlighted notes are the ones G major does not have. For a minor target that is just G major with one note raised: the B7 chord\'s third.',
  },
  {
    key: 'Ab', chord: '2m',
    question:
      'In A♭, the band is on B♭m (2). Which notes fit?',
    answer: 'Notes of the A♭ major scale',
    explanation:
      'B♭m is the 2 of A♭. Every note it holds is already in A♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Ab', chord: '3m',
    question:
      'In A♭, the band is on Cm (3). Which notes fit?',
    answer: 'Notes of the A♭ major scale',
    explanation:
      'Cm is the 3 of A♭. Every note it holds is already in A♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Ab', chord: '4',
    question:
      'In A♭, the band is on D♭ (4). Which notes fit?',
    answer: 'Notes of the A♭ major scale',
    explanation:
      'D♭ is the 4 of A♭. Every note it holds is already in A♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Ab', chord: '5',
    question:
      'In A♭, the band is on E♭7 (5). Which notes fit?',
    answer: 'Notes of the A♭ major scale',
    explanation:
      'E♭7 is the 5 of A♭. Every note it holds is already in A♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Ab', chord: '6m',
    question:
      'In A♭, the band is on Fm (6). Which notes fit?',
    answer: 'Notes of the A♭ major scale',
    explanation:
      'Fm is the 6 of A♭. Every note it holds is already in A♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Ab', chord: '5of2',
    question:
      'In A♭, the band is on F7 (5 of 2). Which notes fit?',
    answer: 'Notes of the B♭ melodic minor scale',
    explanation:
      'F7 is not in A♭ major; it is the 5 of B♭m. Play the notes of the key it points to for that bar. The highlighted notes are the ones A♭ major does not have. For a minor target that is just A♭ major with one note raised: the F7 chord\'s third.',
  },
  {
    key: 'Ab', chord: '5of3',
    question:
      'In A♭, the band is on G7 (5 of 3). Which notes fit?',
    answer: 'Notes of the C melodic minor scale',
    explanation:
      'G7 is not in A♭ major; it is the 5 of Cm. Play the notes of the key it points to for that bar. The highlighted notes are the ones A♭ major does not have. For a minor target that is just A♭ major with one note raised: the G7 chord\'s third.',
  },
  {
    key: 'Ab', chord: '5of4',
    question:
      'In A♭, the band is on A♭7 (5 of 4). Which notes fit?',
    answer: 'Notes of the D♭ major scale',
    explanation:
      'A♭7 is not in A♭ major; it is the 5 of D♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones A♭ major does not have.',
  },
  {
    key: 'Ab', chord: '5of5',
    question:
      'In A♭, the band is on B♭7 (5 of 5). Which notes fit?',
    answer: 'Notes of the E♭ major scale',
    explanation:
      'B♭7 is not in A♭ major; it is the 5 of E♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones A♭ major does not have.',
  },
  {
    key: 'Ab', chord: '5of6',
    question:
      'In A♭, the band is on C7 (5 of 6). Which notes fit?',
    answer: 'Notes of the F melodic minor scale',
    explanation:
      'C7 is not in A♭ major; it is the 5 of Fm. Play the notes of the key it points to for that bar. The highlighted notes are the ones A♭ major does not have. For a minor target that is just A♭ major with one note raised: the C7 chord\'s third.',
  },
  {
    key: 'A', chord: '2m',
    question:
      'In A, the band is on Bm (2). Which notes fit?',
    answer: 'Notes of the A major scale',
    explanation:
      'Bm is the 2 of A. Every note it holds is already in A major, so nothing changes: stay in the key.',
  },
  {
    key: 'A', chord: '3m',
    question:
      'In A, the band is on C♯m (3). Which notes fit?',
    answer: 'Notes of the A major scale',
    explanation:
      'C♯m is the 3 of A. Every note it holds is already in A major, so nothing changes: stay in the key.',
  },
  {
    key: 'A', chord: '4',
    question:
      'In A, the band is on D (4). Which notes fit?',
    answer: 'Notes of the A major scale',
    explanation:
      'D is the 4 of A. Every note it holds is already in A major, so nothing changes: stay in the key.',
  },
  {
    key: 'A', chord: '5',
    question:
      'In A, the band is on E7 (5). Which notes fit?',
    answer: 'Notes of the A major scale',
    explanation:
      'E7 is the 5 of A. Every note it holds is already in A major, so nothing changes: stay in the key.',
  },
  {
    key: 'A', chord: '6m',
    question:
      'In A, the band is on F♯m (6). Which notes fit?',
    answer: 'Notes of the A major scale',
    explanation:
      'F♯m is the 6 of A. Every note it holds is already in A major, so nothing changes: stay in the key.',
  },
  {
    key: 'A', chord: '5of2',
    question:
      'In A, the band is on F♯7 (5 of 2). Which notes fit?',
    answer: 'Notes of the B melodic minor scale',
    explanation:
      'F♯7 is not in A major; it is the 5 of Bm. Play the notes of the key it points to for that bar. The highlighted notes are the ones A major does not have. For a minor target that is just A major with one note raised: the F♯7 chord\'s third.',
  },
  {
    key: 'A', chord: '5of3',
    question:
      'In A, the band is on G♯7 (5 of 3). Which notes fit?',
    answer: 'Notes of the C♯ melodic minor scale',
    explanation:
      'G♯7 is not in A major; it is the 5 of C♯m. Play the notes of the key it points to for that bar. The highlighted notes are the ones A major does not have. For a minor target that is just A major with one note raised: the G♯7 chord\'s third.',
  },
  {
    key: 'A', chord: '5of4',
    question:
      'In A, the band is on A7 (5 of 4). Which notes fit?',
    answer: 'Notes of the D major scale',
    explanation:
      'A7 is not in A major; it is the 5 of D. Play the notes of the key it points to for that bar. The highlighted notes are the ones A major does not have.',
  },
  {
    key: 'A', chord: '5of5',
    question:
      'In A, the band is on B7 (5 of 5). Which notes fit?',
    answer: 'Notes of the E major scale',
    explanation:
      'B7 is not in A major; it is the 5 of E. Play the notes of the key it points to for that bar. The highlighted notes are the ones A major does not have.',
  },
  {
    key: 'A', chord: '5of6',
    question:
      'In A, the band is on C♯7 (5 of 6). Which notes fit?',
    answer: 'Notes of the F♯ melodic minor scale',
    explanation:
      'C♯7 is not in A major; it is the 5 of F♯m. Play the notes of the key it points to for that bar. The highlighted notes are the ones A major does not have. For a minor target that is just A major with one note raised: the C♯7 chord\'s third.',
  },
  {
    key: 'Bb', chord: '2m',
    question:
      'In B♭, the band is on Cm (2). Which notes fit?',
    answer: 'Notes of the B♭ major scale',
    explanation:
      'Cm is the 2 of B♭. Every note it holds is already in B♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Bb', chord: '3m',
    question:
      'In B♭, the band is on Dm (3). Which notes fit?',
    answer: 'Notes of the B♭ major scale',
    explanation:
      'Dm is the 3 of B♭. Every note it holds is already in B♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Bb', chord: '4',
    question:
      'In B♭, the band is on E♭ (4). Which notes fit?',
    answer: 'Notes of the B♭ major scale',
    explanation:
      'E♭ is the 4 of B♭. Every note it holds is already in B♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Bb', chord: '5',
    question:
      'In B♭, the band is on F7 (5). Which notes fit?',
    answer: 'Notes of the B♭ major scale',
    explanation:
      'F7 is the 5 of B♭. Every note it holds is already in B♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Bb', chord: '6m',
    question:
      'In B♭, the band is on Gm (6). Which notes fit?',
    answer: 'Notes of the B♭ major scale',
    explanation:
      'Gm is the 6 of B♭. Every note it holds is already in B♭ major, so nothing changes: stay in the key.',
  },
  {
    key: 'Bb', chord: '5of2',
    question:
      'In B♭, the band is on G7 (5 of 2). Which notes fit?',
    answer: 'Notes of the C melodic minor scale',
    explanation:
      'G7 is not in B♭ major; it is the 5 of Cm. Play the notes of the key it points to for that bar. The highlighted notes are the ones B♭ major does not have. For a minor target that is just B♭ major with one note raised: the G7 chord\'s third.',
  },
  {
    key: 'Bb', chord: '5of3',
    question:
      'In B♭, the band is on A7 (5 of 3). Which notes fit?',
    answer: 'Notes of the D melodic minor scale',
    explanation:
      'A7 is not in B♭ major; it is the 5 of Dm. Play the notes of the key it points to for that bar. The highlighted notes are the ones B♭ major does not have. For a minor target that is just B♭ major with one note raised: the A7 chord\'s third.',
  },
  {
    key: 'Bb', chord: '5of4',
    question:
      'In B♭, the band is on B♭7 (5 of 4). Which notes fit?',
    answer: 'Notes of the E♭ major scale',
    explanation:
      'B♭7 is not in B♭ major; it is the 5 of E♭. Play the notes of the key it points to for that bar. The highlighted notes are the ones B♭ major does not have.',
  },
  {
    key: 'Bb', chord: '5of5',
    question:
      'In B♭, the band is on C7 (5 of 5). Which notes fit?',
    answer: 'Notes of the F major scale',
    explanation:
      'C7 is not in B♭ major; it is the 5 of F. Play the notes of the key it points to for that bar. The highlighted notes are the ones B♭ major does not have.',
  },
  {
    key: 'Bb', chord: '5of6',
    question:
      'In B♭, the band is on D7 (5 of 6). Which notes fit?',
    answer: 'Notes of the G melodic minor scale',
    explanation:
      'D7 is not in B♭ major; it is the 5 of Gm. Play the notes of the key it points to for that bar. The highlighted notes are the ones B♭ major does not have. For a minor target that is just B♭ major with one note raised: the D7 chord\'s third.',
  },
  {
    key: 'B', chord: '2m',
    question:
      'In B, the band is on C♯m (2). Which notes fit?',
    answer: 'Notes of the B major scale',
    explanation:
      'C♯m is the 2 of B. Every note it holds is already in B major, so nothing changes: stay in the key.',
  },
  {
    key: 'B', chord: '3m',
    question:
      'In B, the band is on D♯m (3). Which notes fit?',
    answer: 'Notes of the B major scale',
    explanation:
      'D♯m is the 3 of B. Every note it holds is already in B major, so nothing changes: stay in the key.',
  },
  {
    key: 'B', chord: '4',
    question:
      'In B, the band is on E (4). Which notes fit?',
    answer: 'Notes of the B major scale',
    explanation:
      'E is the 4 of B. Every note it holds is already in B major, so nothing changes: stay in the key.',
  },
  {
    key: 'B', chord: '5',
    question:
      'In B, the band is on F♯7 (5). Which notes fit?',
    answer: 'Notes of the B major scale',
    explanation:
      'F♯7 is the 5 of B. Every note it holds is already in B major, so nothing changes: stay in the key.',
  },
  {
    key: 'B', chord: '6m',
    question:
      'In B, the band is on G♯m (6). Which notes fit?',
    answer: 'Notes of the B major scale',
    explanation:
      'G♯m is the 6 of B. Every note it holds is already in B major, so nothing changes: stay in the key.',
  },
  {
    key: 'B', chord: '5of2',
    question:
      'In B, the band is on G♯7 (5 of 2). Which notes fit?',
    answer: 'Notes of the C♯ melodic minor scale',
    explanation:
      'G♯7 is not in B major; it is the 5 of C♯m. Play the notes of the key it points to for that bar. The highlighted notes are the ones B major does not have. For a minor target that is just B major with one note raised: the G♯7 chord\'s third.',
  },
  {
    key: 'B', chord: '5of3',
    question:
      'In B, the band is on A♯7 (5 of 3). Which notes fit?',
    answer: 'Notes of the D♯ melodic minor scale',
    explanation:
      'A♯7 is not in B major; it is the 5 of D♯m. Play the notes of the key it points to for that bar. The highlighted notes are the ones B major does not have. For a minor target that is just B major with one note raised: the A♯7 chord\'s third.',
  },
  {
    key: 'B', chord: '5of4',
    question:
      'In B, the band is on B7 (5 of 4). Which notes fit?',
    answer: 'Notes of the E major scale',
    explanation:
      'B7 is not in B major; it is the 5 of E. Play the notes of the key it points to for that bar. The highlighted notes are the ones B major does not have.',
  },
  {
    key: 'B', chord: '5of5',
    question:
      'In B, the band is on C♯7 (5 of 5). Which notes fit?',
    answer: 'Notes of the F♯ major scale',
    explanation:
      'C♯7 is not in B major; it is the 5 of F♯. Play the notes of the key it points to for that bar. The highlighted notes are the ones B major does not have.',
  },
  {
    key: 'B', chord: '5of6',
    question:
      'In B, the band is on D♯7 (5 of 6). Which notes fit?',
    answer: 'Notes of the G♯ melodic minor scale',
    explanation:
      'D♯7 is not in B major; it is the 5 of G♯m. Play the notes of the key it points to for that bar. The highlighted notes are the ones B major does not have. For a minor target that is just B major with one note raised: the D♯7 chord\'s third.',
  },
];
