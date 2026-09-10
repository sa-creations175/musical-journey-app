/**
 * How Silas hears the essential inversions — his words, not this
 * file's.
 *
 * =====================================================================
 * EVERY LINE BELOW IS QUOTED, AND THAT IS THE POINT.
 *
 * `~/cc-scratch/SILAS_NOTES_VOICINGS_AND_MODAL_INTERCHANGE.md`, "Essential
 * Inversion Vocabulary", is a player writing down what a chord sounds
 * like to him and what he uses it for. A "how I see it" reveal that
 * paraphrased any of it would be the app explaining his own hearing
 * back to him in someone else's sentences, which is the one thing this
 * data must not do. So the strings are transcribed exactly — including
 * the "⅓" he typed, the unfinished "Resolves to One could go back and
 * forth", and the lower-case starts. A test asserts they are quoted
 * rather than rewritten.
 *
 * NOTHING RENDERS THIS YET. It is the data the reveal will read.
 *
 * =====================================================================
 * SIX, NOT SEVEN. Silas's rule: "I only want these if the function is
 * pretty clear."
 *
 * Number 7 in the notes — the 6 minor over its ♭7 — has a heading and
 * no function written under it, so it is not here. It comes back the
 * day a function is written for it, not before.
 *
 * =====================================================================
 * TWO WAYS TO NAME THE BASS, AND THE APP AND THE NOTES USE DIFFERENT
 * ONES.
 *
 * The Slash Chords cards say "the number after the slash is the BASS
 * scale degree (Nashville notation)" — a degree of the KEY. Silas's
 * notes name the bass as a degree of the CHORD: "4 / 5 = 4 chord over
 * its 5th tone ... (e.g. F over C in the key of C maj)". Those agree
 * whenever the chord is the 1 and disagree everywhere else — his 4/5 is
 * F/C and the deck's `4-5` card is F/G, two different chords under one
 * label.
 *
 * THE APP'S NAMING WINS. Ruled by Silas on 10 Sep 2026, in the notes
 * file itself: "these notes name the bass as a tone of the chord. The
 * app names it as a note of the key." So `bassOfKey` is what a card
 * says and `bassOfChord` is kept because it is how the words below
 * were written — his "4 / 5" is the app's 4/1, his "2 / 3" the app's
 * 2/♯4, his "3 / 3" the app's 3/♯5, and his "5 / 3" the `5-7` card the
 * deck already has.
 *
 * `shapeId` links a row to the deck's shape only where the two names
 * describe the same chord. Three of the six have no card in the deck at
 * all; whether they get one is a separate ruling.
 * =====================================================================
 */

export interface EssentialInversion {
  /** Silas's own heading, e.g. "1 / 3" — the notes' naming. */
  name: string;
  /** The same shape as the APP names it, which is what a card says. */
  appName: string;
  /** The chord, as a degree of the key. */
  chord: string;
  /** Its quality where the notes give one — every one of the six is a
   *  major triad, and the notes say so in terms for the 2 and the 3. */
  quality: 'major';
  /** The bass, as a degree of the CHORD — how the notes name it. */
  bassOfChord: string;
  /** The same bass, as a degree of the KEY — how the deck names it. */
  bassOfKey: string;
  /** Silas's own example, in the key of C. */
  inC: string;
  /** The `SLASH_SHAPES` id that asks for this same chord, or null when
   *  the deck has no card for it. */
  shapeId: string | null;
  /** Silas's SOUND line. Absent where he left the heading empty. */
  sound?: string;
  /** His THEORY line, where he wrote one. */
  theory?: string;
  /** His FUNCTION lines, one entry per line he numbered. */
  function: ReadonlyArray<string>;
  /** His VOICING/FINESSE line, where he wrote one. */
  voicing?: string;
}

export const ESSENTIAL_INVERSIONS: ReadonlyArray<EssentialInversion> = [
  {
    name: '1 / 3',
    appName: '1/3',
    chord: '1', quality: 'major', bassOfChord: '3', bassOfKey: '3',
    inC: 'C/E',
    shapeId: '1-3',
    sound: 'Same sound as C but sounds a bit lighter (I love the sound)',
    function: [
      'You can use it to keep a more major sound instead of using the 3 minor (CCM, pop)',
      'You can use it to make a bass line smoother (changing a 4 - 1 - 2 progression to 4 - ⅓ - 2)',
    ],
    voicing: 'You can first quickly play the 3 minor and switch to the 1 / 3',
  },
  {
    name: '1 / 5',
    appName: '1/5',
    chord: '1', quality: 'major', bassOfChord: '5', bassOfKey: '5',
    inC: 'C/G',
    shapeId: '1-5',
    sound: 'Sounds and feels like anticipation!',
    function: [
      'Wants to resolve to the 5 major and then wherever the 5 chord is going); type of cadential 6/4 chord (classical theory remnant)',
    ],
  },
  {
    // HIS 4/5 IS F OVER C, and his own function line settles it: "the
    // 5th (also the key's tonic) in the bass". The deck's `4-5` card is
    // F/G. Same label, different chord — hence no `shapeId`.
    name: '4 / 5',
    appName: '4/1',
    chord: '4', quality: 'major', bassOfChord: '5', bassOfKey: '1',
    inC: 'F/C',
    shapeId: null,
    function: [
      "Resolves to One could go back and forth between the 4 and 1 chords on top (right hand) with the 5th (also the key's tonic) in the bass acting as a pedal on the bottom before it all resolves to the tonic of the key or C major",
    ],
  },
  {
    name: '2 / 3',
    appName: '2/♯4',
    chord: '2', quality: 'major', bassOfChord: '3', bassOfKey: '#4',
    inC: 'D/F♯',
    shapeId: null,
    sound: 'Someone lifts up the spirit or sound of the song because of the focus on that #4 (Lydian) aka the 3rd tone of the 2 major chord',
    theory: "kind of like a Lydian modal interchange; also like a V7 of V chord, think a II dominant leads to V, but if you take the 7th off of the II dominant chord, it's just a 2 major triad",
    function: [
      'Can resolve it down to 4 chord',
      'Can resolve it up to 5 chord',
    ],
    voicing: 'Nice trill and run you can use, 3-4-3-1-5 and keep falling down the scale of that',
  },
  {
    name: '3 / 3',
    appName: '3/♯5',
    chord: '3', quality: 'major', bassOfChord: '3', bassOfKey: '#5',
    inC: 'E/G♯',
    shapeId: null,
    theory: 'similar to V7 of III chord without the 7th tone',
    function: [
      'you put the 3rd tone in the bass because it leads nicely to the 6th chord in the bass. (e.g. G#/Ab up to A or G#/A down to G)',
    ],
  },
  {
    // The deck asks for this chord as `5-7` — G/B in the key of C —
    // which is the same chord under the other naming convention.
    name: '5 / 3',
    appName: '5/7',
    chord: '5', quality: 'major', bassOfChord: '3', bassOfKey: '7',
    inC: 'G/B',
    shapeId: '5-7',
    function: [
      'Often used to smooth baseline from 1 chord down to the 6 minor chord (1 → 5 / 3 → 6 aka C → G/B → A) OR to go up the opposite direction',
    ],
  },
];

/** One row by the deck's shape id, or null where the deck's shape is
 *  not one of the six. */
export function essentialInversionForShape(
  shapeId: string,
): EssentialInversion | null {
  return ESSENTIAL_INVERSIONS.find(i => i.shapeId === shapeId) ?? null;
}
