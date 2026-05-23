// Harmonic Fluency flashcard catalog.
// Static data — no audio, no keys in the DB beyond per-user SM-2 state.
// Programmatic generators fill systematic categories (scale-degree math,
// reverse key pivots, intervals); hand-written cards cover nuanced
// categories (functional harmony, slash chords, ear-theory crossover).

export type FlashcardCategory =
  | 'scale-degree-math'
  | 'named-notes'
  | 'diatonic-qualities'
  | 'functional-harmony'
  | 'key-signatures'
  | 'reverse-key-pivots'
  | 'modes'
  | 'pentatonic-scales'
  | 'intervals'
  | 'chord-construction'
  | 'progressions'
  | 'slash-chords'
  | 'ear-theory'
  | 'tritone-pairs'
  | 'enharmonic-equivalents';

export const CATEGORY_LABELS: Record<FlashcardCategory, string> = {
  'scale-degree-math': 'Scale Degree Math',
  'named-notes': 'Named Notes Across Keys',
  'diatonic-qualities': 'Diatonic Chord Qualities',
  'functional-harmony': 'Functional Harmony',
  'key-signatures': 'Key Signatures & Relationships',
  'reverse-key-pivots': 'Reverse Key Pivots',
  'modes': 'Mode Identification',
  'pentatonic-scales': 'Pentatonic Scales',
  'intervals': 'Interval Identification',
  'chord-construction': 'Chord Construction',
  'progressions': 'Progression Vocabulary',
  'slash-chords': 'Slash Chords & Inversions',
  'ear-theory': 'Ear-Theory Crossover',
  'tritone-pairs': 'Tritone Pairs',
  'enharmonic-equivalents': 'Enharmonic Equivalents',
};

export const CATEGORY_ORDER: FlashcardCategory[] = [
  'scale-degree-math', 'named-notes', 'tritone-pairs', 'enharmonic-equivalents',
  'diatonic-qualities', 'functional-harmony',
  'key-signatures', 'reverse-key-pivots', 'modes', 'pentatonic-scales', 'intervals',
  'chord-construction', 'progressions', 'slash-chords', 'ear-theory',
];

export interface VisualHint {
  startingDegree?: number;
  destinationDegree?: number;
  direction?: 'up' | 'down';
  distance?: number;
  startingNote?: string;
  destinationNote?: string;
  key?: string;
}

export interface Flashcard {
  id: string;
  category: FlashcardCategory;
  categoryName: string;
  question: string;
  correctAnswer: string;
  decoys: string[];
  explanation?: string;
  skillTag: string;
  visualHint?: VisualHint;
}

// --- Shared music theory tables ------------------------------------

const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11]; // semitones above tonic for degrees 1..7

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT =  ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const KEY_USES_FLATS: Record<string, boolean> = {
  C: false, G: false, D: false, A: false, E: false, B: false, 'F#': false,
  F: true, Bb: true, Eb: true, Ab: true, Db: true, Gb: true,
};

const MAJOR_KEY_TONICS: Record<string, number> = {
  C: 0, G: 7, D: 2, A: 9, E: 4, B: 11, 'F#': 6,
  F: 5, Bb: 10, Eb: 3, Ab: 8, Db: 1, Gb: 6,
};

function noteAt(semitone: number, useFlats: boolean): string {
  const n = ((semitone % 12) + 12) % 12;
  return (useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[n];
}

export function degreeNote(key: string, degree: number): string {
  const tonic = MAJOR_KEY_TONICS[key] ?? 0;
  const semitone = tonic + MAJOR_SCALE_STEPS[degree - 1];
  return noteAt(semitone, KEY_USES_FLATS[key] ?? false);
}

/** Strip "major"/"minor" suffix so "G major" → "G". */
export function parseKeyRoot(key: string): string {
  return key.replace(/\s*(major|minor)\s*$/i, '').trim();
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pad a decoy list to 3 unique values excluding the correct answer.
function makeDecoys(candidates: string[], correct: string, count = 3): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    if (c !== correct && !out.includes(c)) out.push(c);
    if (out.length >= count) break;
  }
  return out;
}

// --- Category 1: Scale degree math (systematic) ---------------------

const INTERVAL_STEPS: Array<{ name: string; step: number }> = [
  { name: '2nd', step: 1 },
  { name: '3rd', step: 2 },
  { name: '4th', step: 3 },
  { name: '5th', step: 4 },
  { name: '6th', step: 5 },
  { name: '7th', step: 6 },
];

// Build a stepwise path string like "2 → 3 → 4 → 5 → 6" to embed in
// the explanation so users can visually confirm the counting.
function stepPath(startDeg: number, dir: 'up' | 'down', steps: number): string {
  const seq: number[] = [startDeg];
  for (let i = 1; i <= steps; i++) {
    const delta = dir === 'up' ? i : -i;
    const d = ((startDeg - 1 + delta) % 7 + 7) % 7 + 1;
    seq.push(d);
  }
  return seq.join(' → ');
}

function generateScaleDegreeMathCards(): Flashcard[] {
  const cards: Flashcard[] = [];
  for (const startDeg of [1, 2, 3, 4, 5, 6, 7]) {
    for (const iv of INTERVAL_STEPS) {
      for (const dir of ['up', 'down'] as const) {
        const delta = dir === 'up' ? iv.step : -iv.step;
        const ans = ((startDeg - 1 + delta) % 7 + 7) % 7 + 1;
        // Decoys: adjacent degrees and opposite-direction answer
        const oppAns = ((startDeg - 1 - delta) % 7 + 7) % 7 + 1;
        const adj1 = (ans % 7) + 1;
        const adj2 = ((ans - 2 + 7) % 7) + 1;
        const path = stepPath(startDeg, dir, iv.step);
        cards.push({
          id: `sdm-${startDeg}-${dir}-${iv.name}`,
          category: 'scale-degree-math',
          categoryName: CATEGORY_LABELS['scale-degree-math'],
          question: `In any major key, ${startDeg} ${dir} a ${iv.name} = ?`,
          correctAnswer: String(ans),
          decoys: makeDecoys(
            [String(oppAns), String(adj1), String(adj2), String(startDeg)],
            String(ans),
          ),
          explanation: `Counting ${dir} from ${startDeg}: ${path}. This is the mental math session musicians run constantly — when an MD calls "go to the ${ans}" or a leader says "${dir} a ${iv.name}", you're doing this step-count in your head and landing on the right note, in any key.`,
          skillTag: `scale-degree-math-${dir}-${iv.name}`,
          visualHint: {
            startingDegree: startDeg,
            destinationDegree: ans,
            direction: dir,
            distance: iv.step,
          },
        });
      }
    }
  }
  return cards;
}

// --- Category 2: Named notes across keys ----------------------------

function generateNamedNoteCards(): Flashcard[] {
  const pairs: Array<{ key: string; degree: number }> = [
    { key: 'C', degree: 5 }, { key: 'G', degree: 4 }, { key: 'D', degree: 3 },
    { key: 'A', degree: 6 }, { key: 'E', degree: 2 }, { key: 'B', degree: 5 },
    { key: 'F', degree: 4 }, { key: 'Bb', degree: 3 }, { key: 'Eb', degree: 5 },
    { key: 'Ab', degree: 6 }, { key: 'Db', degree: 6 }, { key: 'F#', degree: 4 },
    { key: 'C', degree: 7 }, { key: 'G', degree: 2 }, { key: 'D', degree: 7 },
    { key: 'A', degree: 4 }, { key: 'F', degree: 6 }, { key: 'Bb', degree: 7 },
    { key: 'Eb', degree: 2 }, { key: 'Ab', degree: 3 }, { key: 'E', degree: 4 },
    { key: 'Db', degree: 5 }, { key: 'Bb', degree: 2 }, { key: 'Ab', degree: 7 },
  ];
  return pairs.map((p, i) => {
    const correct = degreeNote(p.key, p.degree);
    const decoyCandidates = [1, 2, 3, 4, 5, 6, 7]
      .filter(d => d !== p.degree)
      .map(d => degreeNote(p.key, d));
    const fullScale = [1, 2, 3, 4, 5, 6, 7].map(d => degreeNote(p.key, d)).join(' ');
    return {
      id: `nn-${i + 1}`,
      category: 'named-notes',
      categoryName: CATEGORY_LABELS['named-notes'],
      question: `In ${p.key} major, ${p.degree} of the scale = ?`,
      correctAnswer: correct,
      decoys: makeDecoys(shuffleArray(decoyCandidates), correct),
      explanation: `${p.key} major is ${fullScale} — degree ${p.degree} is ${correct}. Knowing every scale in every key cold is the unglamorous skill that lets you sit in at any session: when the MD calls "key of ${p.key}, hit the ${p.degree}", you're already there.`,
      skillTag: `named-note-key-${p.key}-degree-${p.degree}`,
      visualHint: {
        key: `${p.key} major`,
        destinationNote: correct,
        startingDegree: 1,
        destinationDegree: p.degree,
        direction: 'up',
        distance: Math.max(0, p.degree - 1),
      },
    };
  });
}

// --- Category 6: Reverse key pivots ---------------------------------

function generateReversePivotCards(): Flashcard[] {
  const entries: Array<{ key: string; degree: number }> = [
    { key: 'C', degree: 1 }, { key: 'C', degree: 4 }, { key: 'C', degree: 5 }, { key: 'C', degree: 6 },
    { key: 'G', degree: 1 }, { key: 'G', degree: 4 }, { key: 'G', degree: 5 },
    { key: 'D', degree: 4 }, { key: 'D', degree: 5 }, { key: 'D', degree: 6 },
    { key: 'A', degree: 4 }, { key: 'A', degree: 5 },
    { key: 'E', degree: 4 }, { key: 'E', degree: 5 },
    { key: 'F', degree: 4 }, { key: 'F', degree: 5 }, { key: 'F', degree: 6 },
    { key: 'Bb', degree: 4 }, { key: 'Bb', degree: 5 }, { key: 'Bb', degree: 6 },
    { key: 'Eb', degree: 4 }, { key: 'Eb', degree: 5 },
    { key: 'Ab', degree: 4 }, { key: 'Ab', degree: 5 },
  ];
  const allKeys = Object.keys(MAJOR_KEY_TONICS);
  return entries.map((e, i) => {
    const note = degreeNote(e.key, e.degree);
    const decoys = makeDecoys(
      shuffleArray(allKeys.filter(k => k !== e.key)).slice(0, 3).map(k => `${k} major`),
      `${e.key} major`,
    );
    return {
      id: `rkp-${i + 1}`,
      category: 'reverse-key-pivots',
      categoryName: CATEGORY_LABELS['reverse-key-pivots'],
      question: `${note} is the ${e.degree} of which major key?`,
      correctAnswer: `${e.key} major`,
      decoys,
      explanation: `If ${note} is the ${e.degree}, then counting back ${e.degree - 1} steps lands you on ${e.key} as the 1 — so the key is ${e.key} major. Reverse-pivoting is what arrangers and ear-trained players do when they hear a melody first and need to figure out what key it lives in.`,
      skillTag: `reverse-pivot-degree-${e.degree}`,
      visualHint: {
        startingNote: note,
        startingDegree: e.degree,
        destinationDegree: 1,
        direction: 'down',
        distance: Math.max(0, e.degree - 1),
      },
    };
  });
}

// --- Category 8: Intervals (systematic) -----------------------------

const INTERVAL_NAMES: Array<{ semitones: number; name: string }> = [
  { semitones: 0,  name: 'Unison' },
  { semitones: 1,  name: 'minor 2nd' },
  { semitones: 2,  name: 'Major 2nd' },
  { semitones: 3,  name: 'minor 3rd' },
  { semitones: 4,  name: 'Major 3rd' },
  { semitones: 5,  name: 'Perfect 4th' },
  { semitones: 6,  name: 'Tritone' },
  { semitones: 7,  name: 'Perfect 5th' },
  { semitones: 8,  name: 'minor 6th' },
  { semitones: 9,  name: 'Major 6th' },
  { semitones: 10, name: 'minor 7th' },
  { semitones: 11, name: 'Major 7th' },
  { semitones: 12, name: 'Octave' },
];

function generateIntervalCards(): Flashcard[] {
  const pairs: Array<{ from: string; to: string }> = [
    { from: 'C', to: 'G' }, { from: 'C', to: 'E' }, { from: 'C', to: 'F' },
    { from: 'C', to: 'A' }, { from: 'C', to: 'B' }, { from: 'D', to: 'F' },
    { from: 'D', to: 'A' }, { from: 'E', to: 'G' }, { from: 'E', to: 'B' },
    { from: 'F', to: 'Bb' }, { from: 'G', to: 'D' }, { from: 'G', to: 'B' },
    { from: 'A', to: 'C' }, { from: 'A', to: 'E' }, { from: 'Bb', to: 'D' },
    { from: 'Bb', to: 'F' }, { from: 'F', to: 'B' }, { from: 'E', to: 'A' },
    { from: 'D', to: 'G' }, { from: 'G', to: 'F' },
  ];
  const nameToSem = (n: string) => {
    const sharp = NOTE_NAMES_SHARP.indexOf(n);
    if (sharp >= 0) return sharp;
    return NOTE_NAMES_FLAT.indexOf(n);
  };
  return pairs.map((p, i) => {
    const a = nameToSem(p.from);
    const b = nameToSem(p.to);
    const dist = ((b - a) % 12 + 12) % 12;
    const correct = INTERVAL_NAMES.find(iv => iv.semitones === dist)!.name;
    const decoyPool = INTERVAL_NAMES.filter(iv => iv.name !== correct).map(iv => iv.name);
    return {
      id: `iv-${i + 1}`,
      category: 'intervals',
      categoryName: CATEGORY_LABELS.intervals,
      question: `The interval from ${p.from} to ${p.to} ascending = ?`,
      correctAnswer: correct,
      decoys: makeDecoys(shuffleArray(decoyPool), correct),
      explanation: `${p.from} up to ${p.to} spans ${dist} semitones — that's a ${correct}. Intervals are the raw material of melody and chord voicing: every soul lick, every gospel run, every hip-hop sample chop is a specific sequence of these distances. Naming them instantly is what turns "I can copy that riff" into "I can write my own version in any key."`,
      skillTag: `interval-${dist}-semitones`,
      visualHint: { startingNote: p.from, destinationNote: p.to },
    };
  });
}

// --- Hand-written categories ---------------------------------------

const DIATONIC_QUALITY_CARDS: Flashcard[] = [
  { id: 'dq-maj-1', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In major, the I chord quality is _____',
    correctAnswer: 'major 7',
    decoys: ['dominant 7', 'minor 7', 'half-diminished 7'],
    explanation: "The I chord in a major key naturally lands on major 7 — it's the resting, settled 'home' color. When Stevie Wonder, Donny Hathaway, or PJ Morton sit on a Imaj7, you feel the key plainly.",
    skillTag: 'chord-quality-major-I' },
  { id: 'dq-maj-2', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In major, the ii chord quality is _____',
    correctAnswer: 'minor 7',
    decoys: ['major 7', 'half-diminished 7', 'dominant 7'],
    explanation: "In major, the ii is minor 7 — the predominant that leans toward the V. It's the Dm7 in C major, and it's the first chord of every 2-5-1 jazz and neo-soul players run a thousand times.",
    skillTag: 'chord-quality-major-ii' },
  { id: 'dq-maj-3', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In major, the iii chord quality is _____',
    correctAnswer: 'minor 7',
    decoys: ['major 7', 'half-diminished 7', 'dominant 7'],
    explanation: "The iii chord is minor 7 in major keys — a mellow tonic substitute. When gospel and neo-soul players slide from Imaj7 to iii7 (Cmaj7 → Em7), they're coloring the tonic without really leaving home.",
    skillTag: 'chord-quality-major-iii' },
  { id: 'dq-maj-4', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In major, the IV chord quality is _____',
    correctAnswer: 'major 7',
    decoys: ['minor 7', 'dominant 7', 'half-diminished 7'],
    explanation: "In major, the IV chord is also major 7 — two resting maj7 chords in the key, on the 1 and the 4. Plagal soul endings and hymn-style cadences live on this IVmaj7 → Imaj7 move.",
    skillTag: 'chord-quality-major-IV' },
  { id: 'dq-maj-5', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In major, the V chord quality is _____',
    correctAnswer: 'dominant 7',
    decoys: ['major 7', 'minor 7', 'half-diminished 7'],
    explanation: "The V chord is dominant 7 — the only chord in a major key that naturally wants to resolve home. The tritone inside the dom7 is the engine of every V → I resolution in every style, from gospel cadences to jazz turnarounds.",
    skillTag: 'chord-quality-major-V' },
  { id: 'dq-maj-6', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In major, the vi chord quality is _____',
    correctAnswer: 'minor 7',
    decoys: ['major 7', 'dominant 7', 'half-diminished 7'],
    explanation: "The vi chord is minor 7 — the relative minor's home chord living inside a major key. The 1-5-6-4 pop/gospel progression leans on vi7 as its emotional center; it's where the song breathes inward before going back out.",
    skillTag: 'chord-quality-major-vi' },
  { id: 'dq-maj-7', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In major, the vii° chord quality is _____',
    correctAnswer: 'half-diminished 7',
    decoys: ['minor 7', 'dominant 7', 'diminished 7'],
    explanation: "In major, the vii° is half-diminished 7 (m7b5) — Bm7b5 in C major. Rarely played as its own chord; more often it's hiding inside a V9 voicing, supplying the tense leading-tone pull toward I.",
    skillTag: 'chord-quality-major-vii' },
  { id: 'dq-nm-1', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In natural minor, the i chord quality is _____',
    correctAnswer: 'minor 7',
    decoys: ['minor-major 7', 'dominant 7', 'major 7'],
    explanation: "In natural minor (pure Aeolian), the i chord is minor 7 — no raised 7th, no bright tension, just smooth and settled. D'Angelo, Erykah Badu, and Robert Glasper grooves often sit on a min7 tonic forever.",
    skillTag: 'chord-quality-natural-minor-i' },
  { id: 'dq-nm-2', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In natural minor, the iiø chord quality is _____',
    correctAnswer: 'half-diminished 7',
    decoys: ['minor 7', 'dominant 7', 'diminished 7'],
    explanation: "The ii in natural minor is half-diminished (m7b5) — Bm7b5 in A minor. It's the predominant chord in every minor-key 2-5-1 (Bm7b5 → E7 → Am7) — fundamental jazz and gospel turnaround vocabulary.",
    skillTag: 'chord-quality-natural-minor-ii' },
  { id: 'dq-nm-3', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In natural minor, the III chord quality is _____',
    correctAnswer: 'major 7',
    decoys: ['minor 7', 'dominant 7', 'half-diminished 7'],
    explanation: "In natural minor, the III chord is major 7 — it's literally the relative major's tonic. When a song in A minor slides to Cmaj7, you're hearing the III major-7 color — the door into the brighter relative key.",
    skillTag: 'chord-quality-natural-minor-III' },
  { id: 'dq-nm-4', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In natural minor, the iv chord quality is _____',
    correctAnswer: 'minor 7',
    decoys: ['dominant 7', 'major 7', 'half-diminished 7'],
    explanation: "In natural minor, the iv chord is minor 7 — the pure minor-key predominant. The same iv minor is also what major-key songs 'borrow' for that gospel/soul bittersweet lift (PJ Morton, Madison Ryan Ward live here).",
    skillTag: 'chord-quality-natural-minor-iv' },
  { id: 'dq-nm-5', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In natural minor, the v chord quality is _____',
    correctAnswer: 'minor 7',
    decoys: ['dominant 7', 'major 7', 'half-diminished 7'],
    explanation: "The v chord in natural minor is minor 7 — no raised 7th means no dominant pull. Songs that use the minor v instead of V7 feel suspended and modal; you hear this in Dorian-leaning soul and Portuguese-flavored ballads.",
    skillTag: 'chord-quality-natural-minor-v' },
  { id: 'dq-nm-6', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In natural minor, the VI chord quality is _____',
    correctAnswer: 'major 7',
    decoys: ['minor 7', 'dominant 7', 'half-diminished 7'],
    explanation: "In natural minor, the VI chord is major 7 — a bright, hopeful chord nestled inside a dark key. Gospel and soul songs in minor often lift into VImaj7 for the hook, then drop back to i for the verse.",
    skillTag: 'chord-quality-natural-minor-VI' },
  { id: 'dq-nm-7', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In natural minor, the VII chord quality is _____',
    correctAnswer: 'dominant 7',
    decoys: ['major 7', 'minor 7', 'half-diminished 7'],
    explanation: "The VII in natural minor is a dominant 7 on the flat-7 — the bVII you hear all over Mixolydian rock and gospel (F7 in G minor). It doesn't resolve like a V7; it just sits, blue and broad.",
    skillTag: 'chord-quality-natural-minor-VII' },
  { id: 'dq-hm-1', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In harmonic minor, the i chord quality is _____',
    correctAnswer: 'minor-major 7',
    decoys: ['minor 7', 'dominant 7', 'major 7'],
    explanation: "In harmonic minor, the i chord is minor-major 7 — a minor triad with a raised 7th (the 'James Bond chord'). Tense and cinematic; rarely used as a sit-and-groove tonic, more for a single dramatic moment.",
    skillTag: 'chord-quality-harmonic-minor-i' },
  { id: 'dq-hm-2', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In harmonic minor, the V chord quality is _____',
    correctAnswer: 'dominant 7',
    decoys: ['minor 7', 'major 7', 'half-diminished 7'],
    explanation: "Harmonic minor raises the 7th of the scale, turning the normally-minor v into V7 — and that's what gives minor keys their strong resolution. Without this raised-7 move, a minor-key cadence feels weak; every dramatic gospel and jazz minor ending uses it.",
    skillTag: 'chord-quality-harmonic-minor-V' },
  { id: 'dq-hm-3', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In harmonic minor, the vii° chord quality is _____',
    correctAnswer: 'diminished 7',
    decoys: ['half-diminished 7', 'minor 7', 'dominant 7'],
    explanation: "In harmonic minor, the vii° is fully diminished 7 (not half-dim). It's a tense leading-tone chord that resolves straight to i — used in jazz turnarounds, gospel modulations, and as a passing chord between any two stable harmonies.",
    skillTag: 'chord-quality-harmonic-minor-vii' },
  { id: 'dq-hm-4', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'In harmonic minor, the III+ chord quality is _____',
    correctAnswer: 'augmented major 7',
    decoys: ['major 7', 'augmented 7', 'dominant 7'],
    explanation: "In harmonic minor, the III+ is augmented major 7 — sharp, unstable color. Rarely a standalone chord; you'll usually hear it as a passing sound in a descending bass line or a reharm move.",
    skillTag: 'chord-quality-harmonic-minor-III' },
  { id: 'dq-hm-5', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'Moving from v minor 7 to V dominant 7 within a minor key means switching to _____',
    correctAnswer: 'harmonic minor',
    decoys: ['natural minor', 'melodic minor', 'Dorian'],
    explanation: "Switching from minor v to dominant V inside a minor key means you've borrowed the raised 7th from harmonic minor — that's the move that makes the resolution strong. Every minor-key gospel cadence and jazz turnaround uses this.",
    skillTag: 'chord-quality-minor-modes' },
  { id: 'dq-extra-1', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: 'The IV chord in a major key built as a triad is _____',
    correctAnswer: 'major',
    decoys: ['minor', 'diminished', 'augmented'],
    explanation: "The IV chord in a major key is major — just a major triad, no extensions needed. F in the key of C, Bb in the key of F. When a session leader calls 'the 4', this is what they mean before any color tones get added on top.",
    skillTag: 'chord-quality-major-IV-triad' },
];

const FUNCTIONAL_HARMONY_CARDS: Flashcard[] = [
  { id: 'fh-1', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The V chord most strongly resolves to _____',
    correctAnswer: 'I', decoys: ['IV', 'vi', 'iii'],
    explanation: "V pulls to I — this is the gravity of Western harmony. Every 'final' chord of every style — gospel cadence, jazz turnaround, R&B chorus landing — gets its resolution from this one V → I pull.",
    skillTag: 'resolution-V-to-I' },
  { id: 'fh-2', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The leading tone (7th scale degree) resolves to _____',
    correctAnswer: '1', decoys: ['2', '5', '6'],
    explanation: "The leading tone (7) sits a half-step below the tonic and wants to rise — your ear expects 'ti → do.' That tiny half-step pull is the strongest melodic expectation in tonal music; vocal runs and bass lines exploit it constantly.",
    skillTag: 'leading-tone-resolution' },
  { id: 'fh-3', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The ii-V-I cadence in C major is _____',
    correctAnswer: 'Dm7 - G7 - Cmaj7',
    decoys: ['Dm7 - F7 - Cmaj7', 'D7 - G7 - Cmaj7', 'Em7 - G7 - Cmaj7'],
    explanation: "The ii-V-I is the backbone of jazz and neo-soul harmony. In C: Dm7 → G7 → Cmaj7. Memorize this in every key and you've got half of jazz standard vocabulary; Robert Glasper, D'Angelo, and every Berklee grad live inside this shape.",
    skillTag: 'cadence-2-5-1-in-C' },
  { id: 'fh-4', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The IV → I move (the "Amen" cadence) is also called the _____',
    correctAnswer: 'plagal cadence',
    decoys: ['authentic cadence', 'half cadence', 'deceptive cadence'],
    explanation: "The IV → I move is the gospel 'Amen' cadence — the sound of hymn endings, Kirk Franklin payoffs, and worship-song resolutions. Every church musician knows it as 'the 4 back to the 1'; classical theory books call this same move the 'plagal cadence.'",
    skillTag: 'plagal-cadence' },
  { id: 'fh-5', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The strongest "going home" cadence — V → I — is also called the _____',
    correctAnswer: 'authentic cadence',
    decoys: ['plagal cadence', 'half cadence', 'deceptive cadence'],
    explanation: "V → I is the strongest, most decisive resolution in Western music — it's how almost every song you know lands its final chord. Working musicians just call it 'going home'; theory textbooks call it the 'authentic cadence.'",
    skillTag: 'authentic-cadence' },
  { id: 'fh-6', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'When V goes to vi instead of I (the "fake-out" resolution), the cadence is called _____',
    correctAnswer: 'deceptive cadence',
    decoys: ['plagal cadence', 'half cadence', 'authentic cadence'],
    explanation: "When V slides to vi instead of I, your ear is set up for home and gets the relative minor instead — a fake-out. Soul, gospel, and R&B writers use this constantly to stretch tension across a bridge before finally landing for real. Also called the 'deceptive cadence' in theory.",
    skillTag: 'deceptive-cadence' },
  { id: 'fh-7', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'A phrase that ends "hanging" on the V chord (waiting for resolution) uses a _____',
    correctAnswer: 'half cadence',
    decoys: ['plagal cadence', 'deceptive cadence', 'authentic cadence'],
    explanation: "When a phrase ends on V instead of resolving to I, it hangs in the air, waiting — that's the 'half cadence.' Every pop and R&B pre-chorus that builds suspense before the hook uses this 'end-on-the-5' setup.",
    skillTag: 'half-cadence' },
  { id: 'fh-8', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The tonic function is served by which chord(s)?',
    correctAnswer: 'I and vi',
    decoys: ['ii and IV', 'V and vii°', 'iii only'],
    explanation: "Both I and vi feel like 'home' chords — they share two notes and serve the same resting function. That's why a 1-5-6-4 progression still feels grounded: the vi is standing in for the I, just with a darker color.",
    skillTag: 'tonic-function' },
  { id: 'fh-9', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The "lead-up" function (chords that set up the V) is served by _____',
    correctAnswer: 'ii and IV',
    decoys: ['I and vi', 'V and vii°', 'iii and V'],
    explanation: "ii and IV are the 'lead-up' chords — they build tension away from home and set up the V. The ii → V and IV → V moves are everywhere in gospel, soul, and jazz; theory calls these chords 'predominant' or 'subdominant' function.",
    skillTag: 'predominant-function' },
  { id: 'fh-10', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The dominant function (chords that pull back to I) is served by _____',
    correctAnswer: 'V and vii°',
    decoys: ['I and vi', 'ii and IV', 'iii and vi'],
    explanation: "V and vii° both contain the leading tone, which creates the pull back to I. Practically you'll almost always reach for V (or V7) — but knowing vii° shares the dominant function helps with reharm and substitution.",
    skillTag: 'dominant-function' },
  { id: 'fh-11', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'A secondary dominant V/V in C major is which chord?',
    correctAnswer: 'D7', decoys: ['G7', 'A7', 'E7'],
    explanation: "A secondary dominant is the V-of-a-non-tonic chord. V/V (five of five) points to V: in C, that's D7 → G7. Gospel bridges, Stevie Wonder verses, and jazz tunes use secondary dominants to tour through the key without fully modulating.",
    skillTag: 'secondary-dominant-V-of-V' },
  { id: 'fh-12', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'V/vi in C major resolves to _____',
    correctAnswer: 'Am', decoys: ['Em', 'Dm', 'Fmaj7'],
    explanation: "V/vi is the V chord pointing at vi — in C major, that's E7 → Am. You hear this constantly in gospel and soul when a song pivots into its relative minor for a bridge or emotional lift before drifting back home.",
    skillTag: 'secondary-dominant-V-of-vi' },
  { id: 'fh-13', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'In jazz, the "tritone substitution" of G7 is _____',
    correctAnswer: 'Db7', decoys: ['C7', 'F7', 'B7'],
    explanation: "The tritone sub replaces a V7 with a dominant 7 a tritone away — G7 and Db7 share the same tritone (B–F), so they resolve to C equally well. Robert Glasper and modern jazz pianists use this to add chromatic color to a 2-5-1.",
    skillTag: 'tritone-substitution' },
  { id: 'fh-14', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'bVII in a major key is borrowed from _____',
    correctAnswer: 'Mixolydian / parallel minor',
    decoys: ['Dorian / parallel major', 'Lydian', 'harmonic minor'],
    explanation: "bVII is the flat-7 chord — Bb in the key of C. It's borrowed from Mixolydian or the parallel minor, and you hear it everywhere in rock, gospel, and soul when a song leans bluesy without actually modulating. Stevie Wonder and Kirk Franklin use bVII constantly.",
    skillTag: 'borrowed-bVII' },
  { id: 'fh-15', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'iv minor in a major key is borrowed from _____',
    correctAnswer: 'parallel minor',
    decoys: ['relative minor', 'Lydian', 'Phrygian'],
    explanation: "The iv minor is the minor version of IV, borrowed from the parallel minor key. It's one of the most emotionally loaded chords in gospel, R&B, and soul — PJ Morton, Madison Ryan Ward, and countless church bridges use it for that bittersweet pull before resolving home. Theory books call this 'modal interchange' or 'parallel minor borrowing.'",
    skillTag: 'borrowed-iv-minor' },
  { id: 'fh-16', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'Ending a minor-key song on a major I chord (instead of minor i) creates _____',
    correctAnswer: 'a bright, hopeful resolution',
    decoys: ['a deceptive cadence', 'a dissonant modal shift', 'a suspended ending'],
    explanation: "Ending a minor-key section on a major I chord instead of the expected minor i creates a bright, hopeful lift. You hear this in traditional hymns that end triumphantly and in gospel arrangements where a minor verse resolves to major at the very end. Classical theory calls this a 'Picardy third' (named after the Picardy region of France), but working musicians would just say 'ending on the major 1.'",
    skillTag: 'major-ending-in-minor-key' },
  { id: 'fh-17', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The circle of fifths describes motion by _____',
    correctAnswer: 'descending perfect 5ths (ii-V-I)',
    decoys: ['ascending major 2nds', 'descending major 3rds', 'chromatic descent'],
    explanation: "The circle of fifths is the engine of functional harmony: chords move most strongly by descending perfect 5ths (G → C → F → Bb...). Every ii-V-I is a piece of the circle, and jazz standards modulate through it constantly.",
    skillTag: 'circle-of-fifths' },
  { id: 'fh-18', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'In a 1-5-6-4 progression, swapping the plain V for a fuller version typically means using _____',
    correctAnswer: 'V7', decoys: ['vi', 'iii', 'ii'],
    explanation: "Swapping the plain V for V7 in a 1-5-6-4 adds the dominant pull and a bluesy/gospel lean. V7 is V's fuller, more active cousin — and it's almost always the right move when you want the chord to push, not just sit there.",
    skillTag: 'progression-substitution-V' },
  { id: 'fh-19', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'A chord that has both tonic and dominant function qualities is _____',
    correctAnswer: 'iii (the 3rd chord)',
    decoys: ['IV', 'ii', 'vi'],
    explanation: "The iii chord is a kind of harmonic chameleon — it shares two notes with I (tonic function) and two with V (dominant function). That's why iii can substitute for either in the right context, and why it shows up in slick reharm moves.",
    skillTag: 'mediant-function' },
];

const KEY_SIG_CARDS: Flashcard[] = [
  // Counts
  { id: 'ks-1', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'C major has _____ sharps/flats', correctAnswer: '0', decoys: ['1', '2', '3'],
    explanation: "C major has zero sharps or flats — the all-white-keys key. That simplicity is why it's the default teaching key, but most real recorded music lives in sharper or flatter keys (the warmth of Eb, the brightness of E, the grit of Db).",
    skillTag: 'key-sig-C' },
  { id: 'ks-2', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'G major has _____ sharps', correctAnswer: '1', decoys: ['2', '0', '3'],
    explanation: "G major has one sharp: F#. A common gospel, country, and rock key — rings nicely on guitar and isn't murderous on the voice.",
    skillTag: 'key-sig-G' },
  { id: 'ks-3', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'D major has _____ sharps', correctAnswer: '2', decoys: ['3', '1', '4'],
    explanation: "D major has two sharps: F#, C#. Bright and ringing on guitar and violin — countless country, rock, and uplifting gospel tunes sit here.",
    skillTag: 'key-sig-D' },
  { id: 'ks-4', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'A major has _____ sharps', correctAnswer: '3', decoys: ['2', '4', '5'],
    explanation: "A major has three sharps: F#, C#, G#. Big, open guitar key — common in classic rock, anthemic pop, and some soul.",
    skillTag: 'key-sig-A' },
  { id: 'ks-5', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'E major has _____ sharps', correctAnswer: '4', decoys: ['3', '5', '2'],
    explanation: "E major has four sharps: F#, C#, G#, D#. A guitar's natural ringing key — the home of countless blues, rock, and gospel tunes (think early B.B. King, Hendrix, soul revival).",
    skillTag: 'key-sig-E' },
  { id: 'ks-6', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'B major has _____ sharps', correctAnswer: '5', decoys: ['4', '6', '3'],
    explanation: "B major has five sharps: F#, C#, G#, D#, A#. Tougher to read for guitarists, but vocalists and horn players spend time here — Mariah Carey lives in B-region keys for many ballads.",
    skillTag: 'key-sig-B' },
  { id: 'ks-7', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'F# major has _____ sharps', correctAnswer: '6', decoys: ['5', '7', '4'],
    explanation: "F# major has six sharps (F# C# G# D# A# E#). Rare to read in this spelling — most charts will write the same sound as Gb major (six flats). Same notes, different look on the page.",
    skillTag: 'key-sig-F-sharp' },
  { id: 'ks-8', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'F major has _____ flats', correctAnswer: '1', decoys: ['2', '0', '3'],
    explanation: "F major has one flat: Bb. Warm, easy key for horns and vocalists; tons of jazz standards and soul ballads default here.",
    skillTag: 'key-sig-F' },
  { id: 'ks-9', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'Bb major has _____ flats', correctAnswer: '2', decoys: ['3', '1', '4'],
    explanation: "Bb major has two flats: Bb, Eb. The default key for brass and sax — a huge chunk of jazz, R&B, and gospel horn charts live in Bb because that's where horns sound best.",
    skillTag: 'key-sig-Bb' },
  { id: 'ks-10', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'Eb major has _____ flats', correctAnswer: '3', decoys: ['2', '4', '5'],
    explanation: "Eb major has three flats: Bb, Eb, Ab. The 'horn key' — a lot of soul, jazz, and gospel charts default here because it's comfortable for sax, trumpet, and trombone (Stevie Wonder's 'Superstition' is in Eb).",
    skillTag: 'key-sig-Eb' },
  { id: 'ks-11', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'Ab major has _____ flats', correctAnswer: '4', decoys: ['3', '5', '2'],
    explanation: "Ab major has four flats: Bb, Eb, Ab, Db. Rich, mellow key favored in ballads, gospel, and jazz — Donny Hathaway and many soul vocalists love this register.",
    skillTag: 'key-sig-Ab' },
  { id: 'ks-12', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'Db major has _____ flats', correctAnswer: '5', decoys: ['4', '6', '3'],
    explanation: "Db major has five flats: Bb, Eb, Ab, Db, Gb. Deep, smooth key — Mariah Carey, R&B ballads, and lush jazz cuts live here. Enharmonically the same as C# major (which would be written with seven sharps).",
    skillTag: 'key-sig-Db' },
  // Relative / parallel
  { id: 'ks-13', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative minor of C major is _____', correctAnswer: 'A minor',
    decoys: ['D minor', 'E minor', 'C minor'],
    explanation: "A minor is the relative minor of C major — same exact notes, different home base. The relative minor sits on the 6 of the major scale; this pairing is why you can flip between C major and A minor without changing the key signature.",
    skillTag: 'relative-minor-of-C' },
  { id: 'ks-14', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative minor of G major is _____', correctAnswer: 'E minor',
    decoys: ['A minor', 'D minor', 'B minor'],
    explanation: "E minor is the relative minor of G major — same key signature (one sharp), different tonic. E minor is the sound you hear when a G-major song slides into its darker sibling for a bridge or contrast section.",
    skillTag: 'relative-minor-of-G' },
  { id: 'ks-15', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative minor of Ab major is _____', correctAnswer: 'F minor',
    decoys: ['C minor', 'Eb minor', 'G minor'],
    explanation: "F minor is the relative minor of Ab major — four flats either way. F minor shows up all over gospel, soul, and jazz ballads (a lot of Adele and Donny Hathaway-flavored tunes live here).",
    skillTag: 'relative-minor-of-Ab' },
  { id: 'ks-16', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative major of A minor is _____', correctAnswer: 'C major',
    decoys: ['D major', 'F major', 'G major'],
    explanation: "C major is the relative major of A minor — same notes, flipped tonic. Every 'A minor' song contains the C-major key hiding inside it; great arrangers exploit this duality constantly to pivot between bright and dark.",
    skillTag: 'relative-major-of-A-minor' },
  { id: 'ks-17', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The parallel minor of D major is _____', correctAnswer: 'D minor',
    decoys: ['B minor', 'A minor', 'F minor'],
    explanation: "D minor is D major's parallel minor — same root, opposite quality. The parallel minor is where major-key songs 'borrow' chords from when they want to lean dark (iv minor, bVII, bVI all come from this borrowing).",
    skillTag: 'parallel-minor-of-D' },
  { id: 'ks-18', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The parallel minor of F major is _____', correctAnswer: 'F minor',
    decoys: ['D minor', 'A minor', 'C minor'],
    explanation: "F minor is F major's parallel minor — same tonic, different quality. When a gospel song in F borrows an Ab or Bb minor chord, it's pulling from F minor's palette without actually leaving the key.",
    skillTag: 'parallel-minor-of-F' },
  { id: 'ks-19', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'A key with 3 flats is most likely _____', correctAnswer: 'Eb major or C minor',
    decoys: ['Bb major or G minor', 'Ab major or F minor', 'Db major or Bb minor'],
    explanation: "Three flats = Eb major or C minor (relative-minor pair). To tell which: look at the final chord — if it ends on Eb, it's the major key; if it ends on Cm, it's the minor.",
    skillTag: 'key-sig-identify-3-flats' },
  { id: 'ks-20', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'A key with 4 sharps is most likely _____', correctAnswer: 'E major or C# minor',
    decoys: ['B major or G# minor', 'A major or F# minor', 'D major or B minor'],
    explanation: "Four sharps = E major or C# minor — same note set, different tonic. Determine which by where the song lands at the end and what chord feels like home.",
    skillTag: 'key-sig-identify-4-sharps' },
  { id: 'ks-21', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The order of sharps in a key signature is _____', correctAnswer: 'F# C# G# D# A# E# B#',
    decoys: ['Bb Eb Ab Db Gb Cb Fb', 'F# G# A# B# C# D# E#', 'C# D# E# F# G# A# B#'],
    explanation: "Sharps always appear in this fixed order: F# C# G# D# A# E# B# (mnemonic: 'Father Charles Goes Down And Ends Battle'). A key with four sharps has the first four; a key with two has the first two. This is how you read any sharp key signature instantly without memorizing each one.",
    skillTag: 'order-of-sharps' },
  { id: 'ks-22', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The order of flats in a key signature is _____', correctAnswer: 'Bb Eb Ab Db Gb Cb Fb',
    decoys: ['F# C# G# D# A# E# B#', 'Ab Bb Cb Db Eb Fb Gb', 'Eb Bb Ab Db Gb Cb Fb'],
    explanation: "Flats always appear in this order: Bb Eb Ab Db Gb Cb Fb — exactly the reverse of sharps. Knowing this lets you read any flat key signature at a glance.",
    skillTag: 'order-of-flats' },

  // --- Scale construction (sc-* IDs) ---------------------------------
  // Natural-minor interval geometry + the full minor → relative-major
  // mapping that the S&P scale mini-track leans on. ks-13/14/15 cover
  // the MAJOR → minor direction; these cards cover MINOR → major and
  // round out the parallel-vs-relative distinction.
  { id: 'ksc-1', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'What are the intervals of the natural minor scale?',
    correctAnswer: '1, 2, b3, 4, 5, b6, b7',
    decoys: ['1, b2, b3, 4, 5, b6, b7', '1, 2, 3, 4, 5, 6, b7', '1, 2, b3, 4, b5, b6, b7'],
    explanation: "Natural minor (Aeolian) flats the 3rd, 6th, and 7th of the major scale — everything else stays. That b3/b6/b7 triple is the dark-but-stable color you hear in every D'Angelo groove and gospel ballad that never wants to brighten up.",
    skillTag: 'natural-minor-intervals' },
  { id: 'ksc-2', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'Natural minor differs from major by which altered notes?',
    correctAnswer: 'b3, b6, and b7 (three flattened notes)',
    decoys: ['b3 and b7 only', 'b2, b3, and b6', 'b3, 4, and b7'],
    explanation: "Three flattened notes — b3, b6, b7 — flip a major scale into its parallel natural minor. The b3 is the headline (minor third), the b7 kills the leading tone, the b6 darkens the upper tetrachord. All three together is what makes natural minor feel settled instead of yearning.",
    skillTag: 'natural-minor-vs-major' },
  { id: 'ksc-3', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative major of A minor is _____',
    correctAnswer: 'C major',
    decoys: ['F major', 'G major', 'D major'],
    explanation: "A minor → C major: walk up a minor 3rd (3 half steps) from A. Same seven notes, same key signature, different home base. This is the easiest relative pair to internalize because there are no flats or sharps anywhere.",
    skillTag: 'relative-major-of-A-minor-sc' },
  { id: 'ksc-4', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative major of E minor is _____',
    correctAnswer: 'G major',
    decoys: ['D major', 'A major', 'F major'],
    explanation: "E minor → G major (3 half steps up from E). Both share one sharp (F#) — same key signature, different tonic. E minor is the relative minor of G major, and vice versa; the relationship runs both directions.",
    skillTag: 'relative-major-of-E-minor' },
  { id: 'ksc-5', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative major of B minor is _____',
    correctAnswer: 'D major',
    decoys: ['A major', 'F# major', 'E major'],
    explanation: "B minor → D major (B + minor 3rd = D). Two sharps either way: F# and C#. B minor is a common gospel and worship key; D major sits a minor 3rd above the same notes.",
    skillTag: 'relative-major-of-B-minor' },
  { id: 'ksc-6', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative major of F# minor is _____',
    correctAnswer: 'A major',
    decoys: ['E major', 'B major', 'D major'],
    explanation: "F# minor → A major (F# + minor 3rd = A). Three sharps: F#, C#, G#. F# minor is the relative minor of A major — common in jazz ballads and contemporary R&B that wants the brightness of A without the resolution.",
    skillTag: 'relative-major-of-F#-minor' },
  { id: 'ksc-7', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative major of C# minor is _____',
    correctAnswer: 'E major',
    decoys: ['A major', 'B major', 'F# major'],
    explanation: "C# minor → E major (C# + minor 3rd = E). Four sharps: F#, C#, G#, D#. C# minor is a moody, intimate key — Beethoven's 'Moonlight,' Rachmaninoff's prelude, plenty of neo-soul ballads.",
    skillTag: 'relative-major-of-C#-minor' },
  { id: 'ksc-8', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative major of G# minor is _____',
    correctAnswer: 'B major',
    decoys: ['E major', 'F# major', 'A major'],
    explanation: "G# minor → B major (G# + minor 3rd = B). Five sharps either way. G# minor isn't a common gigging key, but its relative B major shows up plenty in choir charts and slick jazz cuts.",
    skillTag: 'relative-major-of-G#-minor' },
  { id: 'ksc-9', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative major of D# minor is _____',
    correctAnswer: 'F# major',
    decoys: ['B major', 'A major', 'E major'],
    explanation: "D# minor → F# major (D# + minor 3rd = F#). Six sharps — usually re-spelled enharmonically as Eb minor / Gb major in flat-key contexts. Same sound either spelling.",
    skillTag: 'relative-major-of-D#-minor' },
  { id: 'ksc-10', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative major of Bb minor is _____',
    correctAnswer: 'Db major',
    decoys: ['F major', 'Ab major', 'Eb major'],
    explanation: "Bb minor → Db major (Bb + minor 3rd = Db). Five flats either way. Db major is a smooth, ballad-friendly key — Mariah Carey, R&B and gospel ballad territory; Bb minor is its darker twin.",
    skillTag: 'relative-major-of-Bb-minor' },
  { id: 'ksc-11', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative major of F minor is _____',
    correctAnswer: 'Ab major',
    decoys: ['C major', 'Eb major', 'Bb major'],
    explanation: "F minor → Ab major (F + minor 3rd = Ab). Four flats. F minor is gospel and soul ballad heartland — Adele, Donny Hathaway, Andra Day all live here often; Ab major is the lifted-out-of-it sibling.",
    skillTag: 'relative-major-of-F-minor' },
  { id: 'ksc-12', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative major of C minor is _____',
    correctAnswer: 'Eb major',
    decoys: ['F major', 'G major', 'Ab major'],
    explanation: "C minor → Eb major (C + minor 3rd = Eb). Three flats either way. C minor's bittersweetness pairs with Eb's warmth — both keys live all over D'Angelo, Robert Glasper, and modern gospel ballads.",
    skillTag: 'relative-major-of-C-minor' },
  { id: 'ksc-13', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative major of G minor is _____',
    correctAnswer: 'Bb major',
    decoys: ['D major', 'F major', 'Eb major'],
    explanation: "G minor → Bb major (G + minor 3rd = Bb). Two flats either way. G minor is a common songwriter key — Sade, Lauryn Hill, plenty of neo-soul lives here — and Bb major is the brighter side door.",
    skillTag: 'relative-major-of-G-minor' },
  { id: 'ksc-14', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The relative major of D minor is _____',
    correctAnswer: 'F major',
    decoys: ['A major', 'C major', 'Bb major'],
    explanation: "D minor → F major (D + minor 3rd = F). One flat: Bb. D minor is folk + soul + gospel territory ('the saddest of all keys,' per Spinal Tap); F major is its sunnier mirror.",
    skillTag: 'relative-major-of-D-minor' },
  { id: 'ksc-15', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'To find the relative major of any minor key, go ___ half steps up from the minor root',
    correctAnswer: '3 half steps up (a minor third)',
    decoys: ['4 half steps up (a major third)', '5 half steps up (a perfect fourth)', '2 half steps up (a whole tone)'],
    explanation: "Minor + 3 half steps = its relative major. C minor + 3 = Eb. A minor + 3 = C. This single shortcut beats memorizing all 12 pairs — once you internalize the minor-3rd jump, every relative-pair question collapses to the same move.",
    skillTag: 'relative-major-formula' },
  { id: 'ksc-16', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'Parallel minor vs relative minor — what is the difference?',
    correctAnswer: 'Parallel minor shares the same root (C major → C minor). Relative minor shares the same notes (C major → A minor)',
    decoys: [
      'Parallel minor shares the same notes; relative minor shares the same root',
      'Parallel and relative minor are the same thing',
      'Parallel minor is a whole step down; relative minor is a minor 3rd up',
    ],
    explanation: "Two different ways a minor key can relate to a major key. Parallel = same tonic, opposite quality (C major ↔ C minor) — used for chord borrowing inside one key center. Relative = same key signature, different tonic (C major ↔ A minor) — used for pivoting between bright and dark sections without changing the notes.",
    skillTag: 'parallel-vs-relative-minor' },
  { id: 'ksc-17', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The parallel minor of G major is _____',
    correctAnswer: 'G minor',
    decoys: ['E minor', 'C minor', 'D minor'],
    explanation: "Parallel minor = same root, flipped quality. G major's parallel minor is G minor (one flat → two flats). When a G major song borrows a Bb chord or a Cm, it's reaching into G minor's palette without leaving the G tonic.",
    skillTag: 'parallel-minor-of-G' },
  { id: 'ksc-18', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The parallel minor of Bb major is _____',
    correctAnswer: 'Bb minor',
    decoys: ['G minor', 'D minor', 'F minor'],
    explanation: "Bb major's parallel minor is Bb minor — same root, flipped quality (two flats → five flats). Common borrowed chords from this side: Db (bIII), Eb (iv when treated as minor), Gb (bVI) — the gospel/soul flavors that make a Bb major tune feel briefly heavy.",
    skillTag: 'parallel-minor-of-Bb' },
];

const MODE_CARDS: Flashcard[] = [
  { id: 'mo-1', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Dorian mode starts on which scale degree of the major scale?',
    correctAnswer: '2', decoys: ['3', '4', '6'],
    explanation: "Dorian is what you get by playing a major scale starting on the 2nd degree. In C major, that's D Dorian: D-E-F-G-A-B-C — the sound of cool, hopeful-minor vamps (think Miles Davis's 'So What' or any D'Angelo groove that sits on a minor chord without ever resolving).",
    skillTag: 'mode-dorian-degree' },
  { id: 'mo-2', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Phrygian mode starts on which scale degree?',
    correctAnswer: '3', decoys: ['2', '4', '6'],
    explanation: "Phrygian starts on the 3rd of the major scale — E Phrygian from C major. The flat-2 on top of a minor tonic gives it a dark, Spanish/flamenco color; you hear hints of it in metal and in some hip-hop sample loops.",
    skillTag: 'mode-phrygian-degree' },
  { id: 'mo-3', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Lydian mode starts on which scale degree?',
    correctAnswer: '4', decoys: ['3', '5', '7'],
    explanation: "Lydian starts on the 4th of the major scale — F Lydian from C major. The raised 4th (B natural over an F chord) gives it the bright, cinematic, 'dreamy' quality that PJ Morton, Tom Misch, and Stevie Wonder all use as a signature color.",
    skillTag: 'mode-lydian-degree' },
  { id: 'mo-4', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Mixolydian mode starts on which scale degree?',
    correctAnswer: '5', decoys: ['4', '6', '7'],
    explanation: "Mixolydian starts on the 5th of the major scale — G Mixolydian from C major. The flat-7 instead of the leading tone gives it a bluesy, gospel, Hendrix color; it's the scale of rock, R&B, and gospel vamps that never quite resolve.",
    skillTag: 'mode-mixolydian-degree' },
  { id: 'mo-5', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Aeolian mode (natural minor) starts on which scale degree?',
    correctAnswer: '6', decoys: ['5', '7', '3'],
    explanation: "Aeolian is just natural minor — it starts on the 6th of the major scale. A Aeolian from C major is A-B-C-D-E-F-G. Every 'pure' minor-key song that doesn't raise the 7th is in Aeolian.",
    skillTag: 'mode-aeolian-degree' },
  { id: 'mo-6', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Locrian mode starts on which scale degree?',
    correctAnswer: '7', decoys: ['6', '5', '1'],
    explanation: "Locrian starts on the 7th degree — unstable and almost never used as a home mode. Jazz players improvise Locrian over m7b5 chords, but you won't find a straight-ahead Locrian song.",
    skillTag: 'mode-locrian-degree' },
  { id: 'mo-7', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Mixolydian mode's signature altered note is _____",
    correctAnswer: 'b7', decoys: ['#4', 'b3', 'b6'],
    explanation: "Mixolydian's flavor note is the flat-7 — it's a major scale with a flattened 7th. That flat-7 is the bluesy color you hear in gospel, rock, and R&B whenever the tonic chord is a dominant 7 that just sits there, never resolving.",
    skillTag: 'mode-mixolydian-signature' },
  { id: 'mo-8', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Lydian mode's signature altered note is _____",
    correctAnswer: '#4', decoys: ['b7', 'b3', '#5'],
    explanation: "Lydian's signature note is the sharp-4 — a major scale with a raised 4th. That #4 is the 'cinematic, floating' sound; you hear it in Tom Misch, Robert Glasper, and Disney/Pixar score writing.",
    skillTag: 'mode-lydian-signature' },
  { id: 'mo-9', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Dorian mode's signature altered note is _____",
    correctAnswer: 'natural 6 (in a minor tonic)',
    decoys: ['b2', 'b7 only', '#4'],
    explanation: "Dorian is minor with a raised (natural) 6th — that 6 is what makes Dorian feel hopeful-minor instead of dead-sad. It's the signature of D'Angelo grooves, modal jazz, and any minor vamp that doesn't feel mournful.",
    skillTag: 'mode-dorian-signature' },
  { id: 'mo-10', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Phrygian mode's signature altered note is _____",
    correctAnswer: 'b2', decoys: ['b3', 'b6', '#4'],
    explanation: "Phrygian's signature is the flat-2 — that half-step right above the tonic. It's what gives the mode its Spanish/Middle-Eastern flavor when played over a minor tonic.",
    skillTag: 'mode-phrygian-signature' },
  { id: 'mo-11', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'The mode of C major starting on A is _____',
    correctAnswer: 'A Aeolian',
    decoys: ['A Dorian', 'A Phrygian', 'A Locrian'],
    explanation: "Starting a C-major scale on A gives you A Aeolian — C major's relative minor. Same seven notes, just centered on A; the chord vocabulary shifts (Am becomes home instead of C) but the key signature stays put.",
    skillTag: 'mode-of-C-on-A' },
  { id: 'mo-12', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'The mode of C major starting on D is _____',
    correctAnswer: 'D Dorian',
    decoys: ['D Phrygian', 'D Mixolydian', 'D Aeolian'],
    explanation: "Starting C major from D gives D Dorian — D-E-F-G-A-B-C. This is what session musicians mean when they say 'stay in C, just vamp on Dm' — you're playing Dorian whether you call it that or not.",
    skillTag: 'mode-of-C-on-D' },
  { id: 'mo-13', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'The mode of C major starting on G is _____',
    correctAnswer: 'G Mixolydian',
    decoys: ['G Lydian', 'G Dorian', 'G Ionian'],
    explanation: "Starting C major from G gives G Mixolydian — G-A-B-C-D-E-F. That F natural (instead of F#) is what makes a G chord sit as a G7 tonic that never wants to resolve.",
    skillTag: 'mode-of-C-on-G' },
  { id: 'mo-14', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "The signature chord that says 'Dorian' is _____",
    correctAnswer: 'i minor 7 with a major IV',
    decoys: ['v minor 7 with a major I', 'iii minor with a major IV', 'ii minor 7 flat 5'],
    explanation: "The Dorian sound is a minor tonic with a MAJOR IV — e.g., Dm7 | G7 | Dm7 | G7. That major IV (instead of the usual minor iv) is the telltale signature; sit on this two-chord vamp and you're in pure 'So What' / D'Angelo territory.",
    skillTag: 'mode-dorian-chord' },
  { id: 'mo-15', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "The signature chord that says 'Lydian' is _____",
    correctAnswer: 'I maj7#11',
    decoys: ['I7', 'Imaj7', 'i(maj7)'],
    explanation: "The signature Lydian chord is I maj7#11 — a major 7 with a raised 4. That #11 is the shimmering, cinematic color; PJ Morton, Tom Misch, and gospel arrangers stack it for that lifted, dreamlike sound on the I or IV.",
    skillTag: 'mode-lydian-chord' },
  { id: 'mo-16', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "The signature chord that says 'Mixolydian' is _____",
    correctAnswer: 'I7 as a tonic (dominant 7 that doesn\'t resolve)',
    decoys: ['Imaj7', 'I maj7#11', 'i minor 7'],
    explanation: "Mixolydian is signaled by a tonic dominant-7 chord that doesn't resolve — a G7 that stays put, not going to C. Every funky gospel vamp, every blues-rock riff, and every Stevie Wonder verse that grooves on a 7-chord lives in this space.",
    skillTag: 'mode-mixolydian-chord' },
  { id: 'mo-17', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Harmonic minor differs from natural minor by _____',
    correctAnswer: 'a raised 7th',
    decoys: ['a raised 6th', 'a raised 4th', 'a lowered 2nd'],
    explanation: "Harmonic minor raises the 7th of natural minor — that's the only difference, and it's a powerful one. That raised 7 is what turns the minor v into a proper V7, giving minor-key music a strong resolution back to i.",
    skillTag: 'harmonic-minor-difference' },
  { id: 'mo-18', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Melodic minor (ascending) differs from natural minor by _____',
    correctAnswer: 'raised 6th and 7th',
    decoys: ['raised 7th only', 'raised 6th only', 'lowered 2nd and 7th'],
    explanation: "Melodic minor (ascending) raises both the 6th and 7th of natural minor — going up, it sounds almost major. Classical tradition reverts to natural minor on the way down, but jazz keeps the raised notes both directions.",
    skillTag: 'melodic-minor-difference' },
  { id: 'mo-20', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Ionian mode is the same as _____',
    correctAnswer: 'major scale',
    decoys: ['natural minor', 'melodic minor', 'pentatonic'],
    explanation: "Ionian is just another word for the plain major scale. Any time someone says 'Ionian mode,' they mean the vanilla major — it's the mode all the others get measured against.",
    skillTag: 'mode-ionian-equivalent' },
];

// Pentatonic-scales — major + minor pent intervals, what's removed
// from the parent scale, and the relative-pent relationship that
// makes C major pent and A minor pent the same 5 notes. The
// "musical starting points" cards (pent-3 / pent-4 / pent-7 in the
// original spec) were dropped — they're performance heuristics, not
// theory facts. ID numbering keeps the original gaps (1, 2, 5, 6,
// 8, 9, 10) for traceability against the spec.
const PENTATONIC_CARDS: Flashcard[] = [
  { id: 'pent-1', category: 'pentatonic-scales', categoryName: CATEGORY_LABELS['pentatonic-scales'],
    question: 'What 5 notes make up the major pentatonic scale?',
    correctAnswer: '1, 2, 3, 5, 6 (removes the 4th and 7th from the major scale)',
    decoys: ['1, 2, 3, 4, 5', '1, 3, 4, 5, 6', '1, 2, b3, 5, 6'],
    explanation: "Major pentatonic is the major scale minus the 4 and 7 — the two notes that create the half-step tension against the major triad. What's left (1, 2, 3, 5, 6) is the safest melodic set inside a major key; it's the bedrock of gospel licks, country bends, and the Stevie Wonder vocal-line vocabulary.",
    skillTag: 'major-pentatonic-intervals' },
  { id: 'pent-2', category: 'pentatonic-scales', categoryName: CATEGORY_LABELS['pentatonic-scales'],
    question: 'The major pentatonic scale is the major scale with which two notes removed?',
    correctAnswer: 'The 4th and 7th',
    decoys: ['The 2nd and 7th', 'The 3rd and 6th', 'The 4th and 6th'],
    explanation: "Drop the 4 and the 7 — that's the whole move. Those two notes are the half-step neighbors above the 3 and below the tonic; pulling them out kills the leading-tone tension and leaves a scale that fits any chord in the major key without bumping into a dissonance.",
    skillTag: 'major-pent-removes-from-major' },
  { id: 'pent-5', category: 'pentatonic-scales', categoryName: CATEGORY_LABELS['pentatonic-scales'],
    question: 'What 5 notes make up the minor pentatonic scale?',
    correctAnswer: '1, b3, 4, 5, b7',
    decoys: ['1, 2, b3, 5, b7', '1, b3, 4, b5, b7', '1, 2, 4, 5, 6'],
    explanation: "Minor pentatonic = 1, b3, 4, 5, b7. The bluesy-soul backbone — every B.B. King line, every gospel/R&B vocal lick, the entire rock guitar vocabulary lives in this 5-note shape. Adding a b5 between the 4 and 5 gives you the 'blues scale.'",
    skillTag: 'minor-pentatonic-intervals' },
  { id: 'pent-6', category: 'pentatonic-scales', categoryName: CATEGORY_LABELS['pentatonic-scales'],
    question: 'The minor pentatonic scale is the natural minor scale with which two notes removed?',
    correctAnswer: 'The 2nd and b6th',
    decoys: ['The b3 and b7', 'The 4th and 5th', 'The 2nd and 5th'],
    explanation: "Natural minor minus the 2 and the b6 = minor pentatonic. Pulling those out removes the half-step tensions that pull toward the b3 and 5, leaving the strong-chord-tone-only set you can sing over any minor chord without thinking.",
    skillTag: 'minor-pent-removes-from-natural-minor' },
  { id: 'pent-8', category: 'pentatonic-scales', categoryName: CATEGORY_LABELS['pentatonic-scales'],
    question: 'In C minor pentatonic, the notes are _____',
    correctAnswer: 'C, Eb, F, G, Bb',
    decoys: ['C, D, Eb, F, G', 'C, Eb, F, Ab, Bb', 'C, D, F, G, Bb'],
    explanation: "C minor pent: C, Eb, F, G, Bb. Same intervals (1, b3, 4, 5, b7) applied to C as root. Sit on these five notes over any Cm groove — D'Angelo, Aretha, every minor-key blues — and you can't really miss.",
    skillTag: 'c-minor-pentatonic-notes' },
  { id: 'pent-9', category: 'pentatonic-scales', categoryName: CATEGORY_LABELS['pentatonic-scales'],
    question: 'The minor pentatonic scale starting on the ___ of the major pentatonic gives you the relative minor pentatonic',
    correctAnswer: '6th (or b3 of the minor root)',
    decoys: ['5th', '3rd', '2nd'],
    explanation: "Start a major pent on its 6 and the same five notes become the relative minor pent. C major pent starting from A gives A minor pent — A, C, D, E, G — identical pitch set, different home base. Same relative-major / relative-minor logic, applied to the pentatonic subset.",
    skillTag: 'relative-pentatonic-degree' },
  { id: 'pent-10', category: 'pentatonic-scales', categoryName: CATEGORY_LABELS['pentatonic-scales'],
    question: 'C major pentatonic and A minor pentatonic share the same _____',
    correctAnswer: '5 notes — they are relative pentatonics (C, D, E, G, A)',
    decoys: ['root note', 'key signature only (different notes)', '3 notes'],
    explanation: "C major pent (C, D, E, G, A) is literally the same five notes as A minor pent (A, C, D, E, G) — just centered on a different tonic. This is the pentatonic version of the C-major / A-minor relative relationship, and it's why a single pentatonic shape covers both major-key and relative-minor-key songs.",
    skillTag: 'c-major-a-minor-pent-shared' },
];

const CHORD_CONSTRUCTION_CARDS: Flashcard[] = [
  { id: 'cc-1', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A major 7 chord stacks these intervals from root', correctAnswer: 'major 3rd + minor 3rd + major 3rd',
    decoys: ['major 3rd + minor 3rd + minor 3rd', 'minor 3rd + major 3rd + major 3rd', 'major 3rd + major 3rd + minor 3rd'],
    explanation: "A maj7 stacks major 3rd, then minor 3rd, then major 3rd — that's root-3-5-7. In C: C-E-G-B. It's the sound of tonic rest in R&B and jazz; every 'nice' final chord in soul music is a maj7.",
    skillTag: 'chord-construction-maj7' },
  { id: 'cc-2', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A dominant 7 chord stacks these intervals from root', correctAnswer: 'major 3rd + minor 3rd + minor 3rd',
    decoys: ['major 3rd + minor 3rd + major 3rd', 'minor 3rd + minor 3rd + minor 3rd', 'major 3rd + major 3rd + major 3rd'],
    explanation: "A dominant 7 stacks major 3rd, minor 3rd, minor 3rd — root, 3, 5, b7. In C: C-E-G-Bb. The flat-7 is what makes it lean — V7 chords pull to I, and I7 (Mixolydian) tonics just sit and groove.",
    skillTag: 'chord-construction-dom7' },
  { id: 'cc-3', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A minor 7 chord stacks these intervals from root', correctAnswer: 'minor 3rd + major 3rd + minor 3rd',
    decoys: ['major 3rd + minor 3rd + major 3rd', 'minor 3rd + minor 3rd + major 3rd', 'major 3rd + minor 3rd + minor 3rd'],
    explanation: "A minor 7 stacks minor 3rd, major 3rd, minor 3rd — root, b3, 5, b7. In C: C-Eb-G-Bb. The default 'smooth' minor chord in neo-soul, jazz, and gospel — every Dm7 or Em7 you hear in a vamp.",
    skillTag: 'chord-construction-min7' },
  { id: 'cc-4', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A diminished 7 chord stacks these intervals from root', correctAnswer: 'minor 3rd + minor 3rd + minor 3rd',
    decoys: ['minor 3rd + minor 3rd + major 3rd', 'major 3rd + minor 3rd + minor 3rd', 'minor 3rd + major 3rd + minor 3rd'],
    explanation: "A diminished 7 stacks three minor 3rds in a row — every interval the same. It has no single tonal center, so jazz and gospel use it as a passing chord to slide between two more stable harmonies.",
    skillTag: 'chord-construction-dim7' },
  { id: 'cc-5', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'Cmaj7 contains the notes _____', correctAnswer: 'C, E, G, B',
    decoys: ['C, E, G, Bb', 'C, Eb, G, B', 'C, E, G#, B'],
    explanation: "Cmaj7 = C-E-G-B. The major triad C-E-G plus B (the major 7th) on top. The B is what gives it that soft, lit-from-within quality you hear at the end of a slow R&B ballad.",
    skillTag: 'chord-notes-Cmaj7' },
  { id: 'cc-6', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'G7 contains the notes _____', correctAnswer: 'G, B, D, F',
    decoys: ['G, Bb, D, F', 'G, B, D, F#', 'G, B, D#, F'],
    explanation: "G7 = G-B-D-F. Major triad G-B-D plus F on top (the flat 7). The B-F tritone inside is the engine — it's what pulls G7 toward C, and it's why tritone substitutions work on the V chord.",
    skillTag: 'chord-notes-G7' },
  { id: 'cc-7', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'Dm7 contains the notes _____', correctAnswer: 'D, F, A, C',
    decoys: ['D, F#, A, C', 'D, F, A, C#', 'D, F, Ab, C'],
    explanation: "Dm7 = D-F-A-C. Minor triad D-F-A plus C on top. The default ii chord in C major — every 2-5-1 in C starts here (Dm7 → G7 → Cmaj7).",
    skillTag: 'chord-notes-Dm7' },
  { id: 'cc-8', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'Bm7b5 is also called _____', correctAnswer: 'half-diminished 7',
    decoys: ['fully diminished 7', 'minor-major 7', 'dominant 7 flat 5'],
    explanation: "Bm7b5 (B-D-F-A) is a minor 7 with a flattened 5th — same chord as half-diminished 7. It's the ii of every minor-key 2-5-1 (Bm7b5 → E7 → Am) — fundamental jazz turnaround vocabulary.",
    skillTag: 'chord-name-m7b5' },
  { id: 'cc-9', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A dominant 7#9 chord contains which altered tone?',
    correctAnswer: 'raised 9 (augmented 2nd above root)',
    decoys: ['flat 9', 'sharp 11', 'flat 13'],
    explanation: "A 7#9 chord stacks a raised 9 on top of a dom7 — the 'Hendrix chord' (C7#9 = C-E-G-Bb-D#). The major 3rd colliding with the minor 3rd (the #9 spelled enharmonically) creates bluesy, knife-edge tension; you hear it in Hendrix, Stevie Wonder, and gospel cadences.",
    skillTag: 'chord-construction-7-sharp-9' },
  { id: 'cc-10', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A Cadd9 chord contains _____', correctAnswer: 'C E G D',
    decoys: ['C E G B D', 'C E G Bb D', 'C Eb G D'],
    explanation: "Cadd9 is a C major triad with an added 9 (D) — no 7th, just the color tone. Bright, open sound; you hear it all over indie pop and neo-soul (Tom Misch, Daniel Caesar, Frank Ocean's cleaner moments).",
    skillTag: 'chord-construction-add9' },
  { id: 'cc-11', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'C6/9 contains _____', correctAnswer: 'C E G A D',
    decoys: ['C E G B D', 'C E G A', 'C Eb G A D'],
    explanation: "C6/9 stacks C-E-G plus a 6 (A) and a 9 (D) — no 7th, just rich color tones. The classic gospel and jazz 'final chord' sound: sweet, settled, and fully resolved without being plain.",
    skillTag: 'chord-construction-6-9' },
  { id: 'cc-12', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A sus2 chord replaces the 3rd with _____', correctAnswer: 'the 2nd',
    decoys: ['the 4th', 'the 6th', 'the flat 3rd'],
    explanation: "A sus2 swaps the 3rd for the 2nd — Csus2 is C-D-G instead of C-E-G. Open, ambiguous sound, neither major nor minor; common in indie/alt arrangements and Daniel Caesar-style guitar voicings.",
    skillTag: 'chord-construction-sus2' },
  { id: 'cc-13', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A sus4 chord replaces the 3rd with _____', correctAnswer: 'the 4th',
    decoys: ['the 2nd', 'the 6th', 'the 7th'],
    explanation: "A sus4 swaps the 3rd for the 4th — Csus4 is C-F-G. It's the 'held' sound before resolution; gospel cadences (V7sus4 → V7 → I) lean on this exact suspense-and-release move constantly.",
    skillTag: 'chord-construction-sus4' },
  { id: 'cc-14', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'Fmaj7 contains _____', correctAnswer: 'F A C E',
    decoys: ['F A C Eb', 'F Ab C E', 'F A C# E'],
    explanation: "Fmaj7 = F-A-C-E. Major triad plus E on top — warm, settled IV chord in the key of C, or the tonic when you're in F. Default 'pretty' chord on the 4 of any major key.",
    skillTag: 'chord-notes-Fmaj7' },
  { id: 'cc-15', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'Am(maj7) contains _____', correctAnswer: 'A C E G#',
    decoys: ['A C E G', 'A C# E G#', 'A C Eb G#'],
    explanation: "Am(maj7) = A-C-E-G# — a minor triad with a raised 7th, the 'James Bond chord.' Tense and cinematic; used sparingly for a single dramatic beat rather than as a sit-and-groove tonic.",
    skillTag: 'chord-notes-Am-maj7' },
  { id: 'cc-16', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'The tritone interval inside a dom7 chord is between _____',
    correctAnswer: 'the 3rd and the b7',
    decoys: ['the root and the 5', 'the 5 and the b7', 'the root and the b7'],
    explanation: "The tritone inside a dom7 lives between the 3rd and the flat-7 (in G7: B to F). That tritone is the engine — it's what pulls V7 back to I, and it's why tritone substitutions work (G7 and Db7 share the same tritone).",
    skillTag: 'dom7-tritone' },
  { id: 'cc-17', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'C9 (dominant 9) contains _____', correctAnswer: 'C E G Bb D',
    decoys: ['C E G B D', 'C E G Bb F', 'C Eb G Bb D'],
    explanation: "C9 is dominant 9 — C-E-G-Bb-D. The 9 on top of the dom7 adds brighter, richer color than a plain C7. Common in funk, soul, and gospel (think Stevie Wonder's 'I Wish' horn stabs).",
    skillTag: 'chord-notes-C9' },
  { id: 'cc-18', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'Which chord has no perfect 5th?', correctAnswer: 'diminished 7',
    decoys: ['dominant 7', 'major 7', 'half-diminished 7'],
    explanation: "The diminished 7 chord has no perfect 5th — its 5th is flattened. All its intervals are stacked minor 3rds, so nothing inside it is stable; that's why it's used as a passing/transition chord rather than a resting one.",
    skillTag: 'chord-no-perfect-5th' },
  { id: 'cc-19', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'An augmented triad stacks _____',
    correctAnswer: 'two major 3rds',
    decoys: ['two minor 3rds', 'major then minor 3rd', 'minor then major 3rd'],
    explanation: "An augmented triad stacks two major 3rds — like C-E-G#. The raised 5th creates an unsettled, suspended feeling; appears in cinematic transitions and sometimes as V+ (an altered V) before resolving in minor keys.",
    skillTag: 'chord-construction-augmented' },
  { id: 'cc-20', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A diminished triad stacks _____',
    correctAnswer: 'two minor 3rds',
    decoys: ['two major 3rds', 'major then minor 3rd', 'minor then major 3rd'],
    explanation: "A diminished triad stacks two minor 3rds — C-Eb-Gb. The flat-5 makes it unstable; as a vii° chord it pulls to the tonic, and it more commonly shows up as part of a bigger dim7 passing move.",
    skillTag: 'chord-construction-diminished' },
];

const PROGRESSION_CARDS: Flashcard[] = [
  { id: 'pr-1', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The 1-5-6-4 progression in C major is _____', correctAnswer: 'C - G - Am - F',
    decoys: ['C - Em - Am - F', 'C - G - Dm - F', 'C - G - Am - Dm'],
    explanation: "1-5-6-4 in C is C → G → Am → F — the 'pop progression' (or 'axis' chords). You've heard this in hundreds of songs across pop, gospel, R&B, and worship; it works because it cycles through all four tonal functions in a tight loop.",
    skillTag: 'progression-1-5-6-4-in-C' },
  { id: 'pr-2', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The 2-5-1 in Bb major is _____', correctAnswer: 'Cm7 - F7 - Bbmaj7',
    decoys: ['Cm7 - F7 - Cbmaj7', 'Dm7 - G7 - Cmaj7', 'Cm7 - Ab7 - Bbmaj7'],
    explanation: "The 2-5-1 in Bb is Cm7 → F7 → Bbmaj7. Memorize this in every key and you've got half of jazz standard vocabulary — Bb is a particularly important one to know cold because so many horn charts default here.",
    skillTag: 'progression-2-5-1-in-Bb' },
  { id: 'pr-3', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The 1-6-4-5 in G major is _____', correctAnswer: 'G - Em - C - D',
    decoys: ['G - Am - C - D', 'G - Em - Am - D', 'G - Em - C - D7sus4'],
    explanation: "1-6-4-5 in G is G → Em → C → D — the 50s doo-wop progression that became the bedrock of countless soul, gospel, and pop ballads. Same chord set as 1-5-6-4, just rotated.",
    skillTag: 'progression-1-6-4-5-in-G' },
  { id: 'pr-4', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The 6-4-1-5 in D major is _____', correctAnswer: 'Bm - G - D - A',
    decoys: ['Bm - Em - D - A', 'Gm - G - D - A', 'Bm - G - Dsus4 - A'],
    explanation: "6-4-1-5 in D is Bm → G → D → A — same four chords as 1-5-6-4, just started from the vi. Starting on the minor makes the song feel darker and more contemplative even though the chords themselves are identical.",
    skillTag: 'progression-6-4-1-5-in-D' },
  { id: 'pr-5', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The gospel walk-up I-II-iii-IV in C major is _____',
    correctAnswer: 'C - D - Em - F',
    decoys: ['C - Dm - Em - F', 'C - D - E - F', 'C - D7 - Em - F'],
    explanation: "C → D → Em → F is the classic gospel walk-up — note the II is D MAJOR (a secondary dominant pointing at iii), not Dm. You hear this rising-line move in gospel and soul bridges constantly; it's a signature 'lift' device.",
    skillTag: 'progression-gospel-walkup-in-C' },
  { id: 'pr-6', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'Rhythm changes A section in Bb major starts with _____',
    correctAnswer: 'Bbmaj7 - Gm7 - Cm7 - F7',
    decoys: ['Bbmaj7 - Dm7 - Cm7 - F7', 'Bbmaj7 - Gm7 - Am7 - Dm7', 'Bbmaj7 - Eb7 - Cm7 - F7'],
    explanation: "Rhythm changes A-section: Bbmaj7 | Gm7 | Cm7 | F7 (I - vi - ii - V). Based on Gershwin's 'I Got Rhythm,' it's one of the most-played forms in jazz — hundreds of bebop heads are written over this 32-bar structure.",
    skillTag: 'progression-rhythm-changes-in-Bb' },
  { id: 'pr-7', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The backdoor progression I-IV-bVII-I in F major is _____',
    correctAnswer: 'F - Bb - Eb - F',
    decoys: ['F - Bb - E - F', 'F - Bbm - Eb - F', 'F - Bb - Db - F'],
    explanation: "The backdoor progression in F is F → Bb → Eb → F — the bVII (Eb) sneaks in instead of a V. It's a gospel/soul favorite: less expected than a V-I, more melodic, and gives that broad, modal landing.",
    skillTag: 'progression-backdoor-in-F' },
  { id: 'pr-8', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'A plagal vamp is which two chords alternating?',
    correctAnswer: 'IV - I',
    decoys: ['V - I', 'ii - V', 'vi - IV'],
    explanation: "A plagal vamp cycles IV and I — the gospel 'Amen' move stretched into a whole section. Worship music, gospel altar calls, and soul outros sit on this two-chord cycle for minutes at a time, building intensity before the climax.",
    skillTag: 'progression-plagal-vamp' },
  { id: 'pr-9', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The 1-5-6-4 and 6-4-1-5 progressions use the same chords; what changes?',
    correctAnswer: 'The starting point (rotation)',
    decoys: ['The chord qualities', 'The key', 'The duration of each chord'],
    explanation: "1-5-6-4 and 6-4-1-5 use the same four chords — just started at different points. That's why you hear these progressions in thousands of songs but they feel different: the starting point (and which chord becomes the emotional 'home' base) changes the whole mood.",
    skillTag: 'progression-rotation-concept' },
  { id: 'pr-10', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The neo-soul cycle Imaj7-iii7-vi7-IVmaj7 in C is _____',
    correctAnswer: 'Cmaj7 - Em7 - Am7 - Fmaj7',
    decoys: ['Cmaj7 - Dm7 - Am7 - Fmaj7', 'Cmaj7 - Em7 - Am7 - Dm7', 'Cmaj7 - Em7 - Am - F'],
    explanation: "Cmaj7 → Em7 → Am7 → Fmaj7 is the neo-soul cycle — lush, cycling, rarely fully resolving. Tom Misch, D'Angelo, Daniel Caesar, and Snoh Aalegra tracks live in this kind of harmonic space where everything stays beautifully suspended.",
    skillTag: 'progression-neo-soul-in-C' },
  { id: 'pr-11', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The descending minor progression i-bVII-bVI-V in A minor is _____',
    correctAnswer: 'Am - G - F - E',
    decoys: ['Am - G - F - E7', 'Am - G - Fm - E', 'Am - Gm - F - E'],
    explanation: "Am → G → F → E walks down by step from the tonic, then settles on the V for a strong 'about to come back home' feeling. Sometimes called the Andalusian cadence (from flamenco), it shows up in soul, hip-hop, and dramatic minor-key arrangements anytime a writer wants stepwise descent into tension.",
    skillTag: 'progression-descending-minor-in-A-minor' },
  { id: 'pr-12', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'In the 12-bar blues, bars 5-6 typically go to which chord?',
    correctAnswer: 'IV7',
    decoys: ['ii7', 'V7', 'vi'],
    explanation: "In the 12-bar blues form, bars 5 and 6 land on IV7 — the 'second chord' of the blues structure. This move is what turns a generic rock/pop tune into a proper blues: the IV appears right on schedule every time, and your ear knows.",
    skillTag: 'progression-12-bar-blues-structure' },
  { id: 'pr-13', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The bossa nova standard I-VI-ii-V in F is _____',
    correctAnswer: 'Fmaj7 - D7 - Gm7 - C7',
    decoys: ['Fmaj7 - Dm7 - Gm7 - C7', 'Fmaj7 - D7 - Am7 - C7', 'Fmaj7 - D7 - Gm7 - Cmaj7'],
    explanation: "Fmaj7 → D7 → Gm7 → C7 — bossa turnaround in F. The D7 is a secondary dominant (V/ii) pointing at Gm7. This shape is the harmonic spine of countless jazz standards, Brazilian tunes, and lounge-soul reharmonizations.",
    skillTag: 'progression-bossa-in-F' },
  { id: 'pr-14', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'A Dorian vamp i-IV in D is _____',
    correctAnswer: 'Dm - G',
    decoys: ['Dm - Gm', 'D - G', 'Dm - Gm7'],
    explanation: "Dm → G is a Dorian vamp — minor i going to MAJOR IV (not minor iv). That major IV is the Dorian signature; sit on these two chords forever and you're in 'So What' / D'Angelo territory.",
    skillTag: 'progression-dorian-vamp-in-D' },
  { id: 'pr-15', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The 4-1-5-6 in D major is _____',
    correctAnswer: 'G - D - A - Bm',
    decoys: ['G - D - Am - Bm', 'G - D - A - Em', 'Gm - D - A - Bm'],
    explanation: "G → D → A → Bm (4-1-5-6 in D) is another rotation of the axis progression — starts on the IV for a soft, lifted opening that doesn't reveal the home chord until beat two. Common shape in worship and pop ballads.",
    skillTag: 'progression-4-1-5-6-in-D' },
  { id: 'pr-16', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'A tonic-pedal progression keeps which note in the bass?',
    correctAnswer: 'the 1 (tonic)',
    decoys: ['the 5 (dominant)', 'the 3', 'the 7'],
    explanation: "A tonic-pedal progression holds the 1 in the bass while chords move above it. Keeps the song feeling grounded even as harmony shifts — a staple of soul grooves, gospel bridges, and any song that wants to feel anchored while the top moves around.",
    skillTag: 'progression-tonic-pedal' },
  { id: 'pr-17', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'A dominant pedal progression keeps which note in the bass?',
    correctAnswer: 'the 5 (dominant)',
    decoys: ['the 1', 'the 3', 'the 6'],
    explanation: "A dominant pedal holds the 5 in the bass — and since the 5 wants to resolve to 1, the whole thing creates building tension. Common in gospel buildups and jazz intros where the song sits on the V, waiting and waiting before finally dropping home.",
    skillTag: 'progression-dominant-pedal' },
  { id: 'pr-18', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The 1-4-5 in A major is _____',
    correctAnswer: 'A - D - E',
    decoys: ['A - D - E7 only', 'A - Dm - E', 'A - D - F#m'],
    explanation: "A → D → E is 1-4-5 in A — the most fundamental progression in Western popular music. Every blues, country tune, and early rock and R&B song cycles I-IV-V; modern soul, gospel, and hip-hop still use it as the underlying scaffolding.",
    skillTag: 'progression-1-4-5-in-A' },
  { id: 'pr-19', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The Coltrane changes cycle through how many key centers?',
    correctAnswer: 'three (a major 3rd apart)',
    decoys: ['two (a tritone apart)', 'four (a minor 3rd apart)', 'six (a whole step apart)'],
    explanation: "Coltrane changes cycle through three key centers a major 3rd apart (e.g., B → G → Eb → back to B). The 'Giant Steps' shape — hard to improvise over, but the underlying logic is simple: three tonics dividing the octave equally.",
    skillTag: 'progression-coltrane-cycle' },
  { id: 'pr-20', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The 1-b7-4 progression in C major is _____',
    correctAnswer: 'C - Bb - F',
    decoys: ['C - B - F', 'C - Bb - Fm', 'Cm - Bb - F'],
    explanation: "C → Bb → F is 1-bVII-IV — a Mixolydian/gospel move. The bVII (Bb) is borrowed from the parallel minor; you hear this three-chord cycle all over rock, gospel, and soul tunes that want a bluesy, open, never-quite-fully-resolved feel.",
    skillTag: 'progression-1-b7-4-in-C' },
];

const SLASH_CHORD_CARDS: Flashcard[] = [
  { id: 'sc-1', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'C/E is in which inversion?', correctAnswer: '1st inversion',
    decoys: ['root position', '2nd inversion', '3rd inversion'],
    explanation: "C/E means a C chord with E (the 3rd) in the bass — that's 1st inversion. Slash chords are how you notate inversions without writing out the full voicing; the symbol after the slash is just the bass note.",
    skillTag: 'slash-inversion-C-E' },
  { id: 'sc-2', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'C/G is in which inversion?', correctAnswer: '2nd inversion',
    decoys: ['root position', '1st inversion', '3rd inversion'],
    explanation: "C/G is a C chord with G (the 5th) in the bass — 2nd inversion. Used for smoother bass motion, especially when the bass is descending or ascending step-wise through a progression.",
    skillTag: 'slash-inversion-C-G' },
  { id: 'sc-3', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'Cmaj7/B is in which inversion?', correctAnswer: '3rd inversion',
    decoys: ['root position', '1st inversion', '2nd inversion'],
    explanation: "Cmaj7/B has B (the major 7th) in the bass — 3rd inversion. The half-step between the bass B and the root C creates a moody tension — pianists use this voicing in R&B and jazz ballads for that close, intimate sound.",
    skillTag: 'slash-inversion-Cmaj7-B' },
  { id: 'sc-4', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'G/B in the key of C major functions as _____',
    correctAnswer: 'V with its 3rd in the bass',
    decoys: ['V with its 5th in the bass', 'iii with its root in the bass', 'vii° with its root in the bass'],
    explanation: "G/B in C major puts the leading tone (B) in the bass underneath the V chord — and that B pulls right up to C on the next chord. Classic descending-bass device used in countless gospel and soul ballads: I → V/B → vi (C → G/B → Am). In Nashville numbers, that's 5/7.",
    skillTag: 'slash-function-G-B-in-C' },
  { id: 'sc-5', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'A 2nd inversion triad has which note in the bass?',
    correctAnswer: 'the 5th of the chord',
    decoys: ['the root of the chord', 'the 3rd of the chord', 'the 7th of the chord'],
    explanation: "A 2nd-inversion triad puts its 5th in the bass — like C/G. This bass note is less stable than the root, so 2nd inversion is mostly used for passing moments or specific voice-leading needs (ascending bass through a progression, for example). In Nashville numbers, a 1-chord 2nd inversion is written 1/5.",
    skillTag: 'inversion-2nd-bass-note' },
  { id: 'sc-6', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'A 1st inversion triad has which note in the bass?',
    correctAnswer: 'the 3rd of the chord',
    decoys: ['the root of the chord', 'the 5th of the chord', 'the 6th of the chord'],
    explanation: "A 1st-inversion triad puts its 3rd in the bass — like C/E. Gentler than root position, used widely in R&B and gospel for smooth step-wise bass motion. Hymn writers and church pianists rely on it heavily. In Nashville numbers, a 1-chord 1st inversion is written 1/3.",
    skillTag: 'inversion-1st-bass-note' },
  { id: 'sc-7', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'F/G in the key of C major is most often used as _____',
    correctAnswer: 'a V7sus4 substitute',
    decoys: ['a IV inversion', 'a bII chord', 'a secondary dominant'],
    explanation: "F/G in C is a classic V7sus4 substitute — G in the bass, F-A-C on top gives you the G7sus sound without the 3rd. Widely used in neo-soul, gospel, and modern R&B for a suspended, 'held' feel before resolution to the I. Chord-tone view: G isn't a tone of F (F-A-C), so this is a hybrid/slash chord, not an inversion.",
    skillTag: 'slash-function-F-G' },
  { id: 'sc-8', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'What is 1/3 in C major?',
    correctAnswer: 'C/E',
    decoys: ['C/G', 'C/B', 'E/C'],
    explanation: "1/3 means the 1 chord with the 3rd scale degree in the bass — in C that's C/E. The number after the slash is the BASS scale degree (Nashville notation), NOT a secondary dominant. Chord-tone view: E is the 3rd of C, so C/E is the 1 chord in 1st inversion.",
    skillTag: 'slash-notation-I-3-in-C' },
  { id: 'sc-9', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'What is 5/7 in C major?',
    correctAnswer: 'G/B',
    decoys: ['G/F', 'G/D', 'G/F#'],
    explanation: "5/7 means the 5 chord with the 7th scale degree (B) in the bass — in C that's G/B. The number after the slash is the BASS scale degree (Nashville notation), NOT the Roman 'V/x' which means a secondary dominant. Chord-tone view: B is the 3rd of G, so G/B is the 5 chord in 1st inversion; that leading-tone bass resolves up to 1 (B → C).",
    skillTag: 'slash-notation-V-7-in-C' },
  { id: 'sc-10', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'What is 4/5 in C major?',
    correctAnswer: 'F/G',
    decoys: ['F/C', 'F/A', 'F/D'],
    explanation: "4/5 means the 4 chord with the 5th scale degree (G) in the bass — in C that's F/G. Chord-tone heads-up: G is NOT a tone of F (F-A-C), so this is a hybrid/slash chord, not an inversion — it sounds and functions like a G7sus4, a 'held' dominant that resolves down to 1.",
    skillTag: 'slash-notation-IV-5-in-C' },
  { id: 'sc-11', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'What is 6/b7 in C major?',
    correctAnswer: 'Am/Bb',
    decoys: ['Am/B', 'Am/G', 'Am/C'],
    explanation: "6/b7 means the 6 chord with the flat-7 scale degree (Bb) in the bass — in C that's Am/Bb. Chord-tone heads-up: Bb is NOT a tone of Am (A-C-E), so this is a hybrid/slash chord, not an inversion. The Bb sets up a chromatic descent (B → Bb → A) or a half-step pull up to 1; a slick voice-leading trick in jazz reharms.",
    skillTag: 'slash-notation-vi-b7-in-C' },
  { id: 'sc-12', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'The descending bass line 1 - 5/7 - 6 - 1/3 moves the bass by _____',
    correctAnswer: 'step (1 → 7 → 6 → 3)',
    decoys: ['leap (1 → 7 → 6 → 3)', 'a 5th each step', 'a 3rd each step'],
    explanation: "1 → 7 → 6 → 3 is a smooth, mostly-stepwise descending bass line. This kind of bass motion is one of the most common devices in gospel, soul, and ballad writing — the smoother the bass walks, the more connected the harmony feels above it.",
    skillTag: 'slash-descending-bass-motion' },
  { id: 'sc-13', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'A pedal-tone progression using slash chords over a single bass note is called a _____',
    correctAnswer: 'pedal point / slash-chord pedal',
    decoys: ['walking bass', 'chromatic bass', 'oblique motion'],
    explanation: "A pedal-tone progression keeps the same bass note while chords change above it — often written as a chain of slash chords (C/G, F/G, G — all with G in the bass). Creates suspense and builds tension; used heavily in gospel buildups, cinematic intros, and worship music transitions.",
    skillTag: 'slash-pedal-point' },
  { id: 'sc-14', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'A slash chord X/Y where Y is NOT a chord tone is sometimes called _____',
    correctAnswer: 'a polychord or hybrid chord',
    decoys: ['an inversion', 'a secondary dominant', 'an altered chord'],
    explanation: "When the bass note isn't part of the chord above it (like F/G — F major over G bass), you've left inversion territory and entered polychord/hybrid chord territory. This is how modern jazz and neo-soul players get those rich, stacked sounds that aren't quite one chord and aren't quite two.",
    skillTag: 'slash-non-chord-tone' },
  { id: 'sc-15', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'The main purpose of using slash chords is to _____',
    correctAnswer: 'control bass movement',
    decoys: ['change chord quality', 'add tension', 'modulate to a new key'],
    explanation: "The main reason to write slash chords is to control the bass line — making it step-wise or melodic instead of leaping around with each chord change. Good bass voice leading is what separates a competent arrangement from a great one; gospel and soul arrangers obsess over it.",
    skillTag: 'slash-purpose-voice-leading' },
  { id: 'sc-16', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'The V chord in first inversion has which chord tone in the bass?',
    correctAnswer: 'its 3rd',
    decoys: ['its 5th', 'its 7th', 'its root'],
    explanation: "First inversion always puts its 3rd in the bass. For the V chord the 3rd is the leading tone — in C major that's B under a G chord = G/B (Nashville: 5/7), and that leading-tone bass pulls up a half step to 1. This is the chord-tone twin of the 5/7 card.",
    skillTag: 'inversion-V-first-bass-tone' },
];

const EAR_THEORY_CARDS: Flashcard[] = [
  { id: 'et-1', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A song moves from IV to a chord that feels darker and more emotional. The destination is most likely _____',
    correctAnswer: 'iv minor (borrowed from parallel minor)',
    decoys: ['vi', 'ii minor', 'V/IV'],
    explanation: "When a major-key song slides from IV to iv (F to Fm in C), that minor-IV is the most powerful borrowed-chord move in popular music. It's the 'gospel pull' — PJ Morton, Madison Ryan Ward, and countless church bridges live here. Theory books call it 'modal interchange'; working players just call it 'the minor 4.'",
    skillTag: 'ear-theory-IV-to-iv' },
  { id: 'et-2', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A gospel song has a signature move where V becomes a Dom7#9 before resolving. This creates _____',
    correctAnswer: 'bluesy tension before the resolution',
    decoys: ['a modal shift', 'a descending bass', 'a suspended feeling'],
    explanation: "V7#9 — the 'Hendrix chord' acting as the V — stacks a minor third (the #9) against the major third, creating bluesy/gospel tension right before resolution. Common in gospel cadences in the moment just before the payoff back to I; you also hear it all over Stevie Wonder and funk.",
    skillTag: 'ear-theory-7-sharp-9-tension' },
  { id: 'et-3', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'If a song feels like it is in C major but uses a Bb chord, that Bb is likely _____',
    correctAnswer: 'bVII borrowed from Mixolydian',
    decoys: ['a passing chord', 'a tritone substitution', 'a chromatic mediant'],
    explanation: "When a C-major song drops a Bb chord (bVII), it's borrowing from Mixolydian or the parallel minor — a classic rock/gospel move. Stevie Wonder, Kirk Franklin, and countless worship tunes use bVII for that broad, bluesy lift without actually changing key.",
    skillTag: 'ear-theory-bVII-borrowed' },
  { id: 'et-4', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A song feels unresolved at the end, lingering on a bright chord a whole step below the tonic. That chord is likely _____',
    correctAnswer: 'bVII',
    decoys: ['IV', 'vi', 'ii'],
    explanation: "A song that ends hanging on bVII (Bb in C) feels suspended, unfinished — it's a flat-seven ending instead of a clean tonic resolution. Common in modern indie, gospel-leaning soul, and any track where the writer wants to avoid too-tidy closure (Frank Ocean, Tom Misch sometimes leave songs there).",
    skillTag: 'ear-theory-ending-on-bVII' },
  { id: 'et-5', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A minor chord that sounds "floating" and contemplative when used as a tonic is most likely _____',
    correctAnswer: 'i minor 11 (Dorian feel)',
    decoys: ['i minor 7 (natural minor)', 'i half-diminished', 'i minor-major 7'],
    explanation: "A 'floating' minor tonic chord is almost always a i minor 11 in a Dorian context — the natural 6 plus the rich stack of 9-11 extensions gives it the airy, never-quite-resolving quality you hear in D'Angelo, Erykah Badu, and Robert Glasper vamps.",
    skillTag: 'ear-theory-dorian-floating' },
  { id: 'et-6', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A progression that feels like it keeps "almost resolving" but defers is using _____',
    correctAnswer: 'deceptive cadences (V - vi)',
    decoys: ['plagal cadences (IV - I)', 'half cadences (ending on V)', 'modal interchange'],
    explanation: "A progression that keeps 'almost resolving' is leaning on deceptive cadences — V slides to vi instead of I, postponing the real resolution. Soul, gospel, and R&B writers use this to extend a bridge or build emotional weight before the real landing finally arrives.",
    skillTag: 'ear-theory-deferred-resolution' },
  { id: 'et-7', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A chord that sounds "suspended" and wants to pull down to a major triad is most likely _____',
    correctAnswer: 'sus4',
    decoys: ['sus2', 'major 7', 'add9'],
    explanation: "A sus4 chord replaces the 3rd with the 4th, creating a 'held' tension that wants to resolve down to a major triad. Gospel cadences (V7sus4 → V7 → I) lean on this exact move — that suspension-and-release is one of the most identifiable sounds in church music.",
    skillTag: 'ear-theory-sus4-tension' },
  { id: 'et-8', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A song in a major key suddenly sounds "cinematic and dreamy" on the IV chord. That chord is most likely _____',
    correctAnswer: 'IV maj7#11 (Lydian color)',
    decoys: ['IV 7', 'IV 6/9', 'iv minor'],
    explanation: "A IV chord that sounds dreamy/cinematic is usually a maj7#11 — borrowing from Lydian. That raised 4th is the 'shimmering' color; PJ Morton, Robert Glasper, and modern gospel arrangers use it for lift on the IV when they want the song to bloom open.",
    skillTag: 'ear-theory-lydian-IV' },
  { id: 'et-9', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'The "James Bond chord" — a minor triad with a major 7 — is called _____',
    correctAnswer: 'minor-major 7',
    decoys: ['minor 7', 'half-diminished 7', 'minor 6'],
    explanation: "A minor triad with a raised 7th is a minor-major 7 chord — nicknamed the 'James Bond chord' for its signature use in those scores. Tense, cinematic, used sparingly for a single striking moment rather than as a sit-and-groove chord.",
    skillTag: 'ear-theory-min-maj7' },
  { id: 'et-10', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A chord that sounds like "the neo-soul chord" with a stacked 9th, 11th, and 13th on minor is _____',
    correctAnswer: 'minor 11',
    decoys: ['minor 9', 'minor-major 9', 'minor 6/9'],
    explanation: "A minor chord stacked with 9-11-13 is a minor 11 — 'the neo-soul chord.' Lush, cloudy, rarely resolving; the signature sound of Tom Misch, D'Angelo, Jazmine Sullivan, and H.E.R. vamps where everything hangs beautifully suspended.",
    skillTag: 'ear-theory-min11-neo-soul' },
  { id: 'et-11', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A "Hendrix chord" sound combines which two seemingly-conflicting tones?',
    correctAnswer: 'major 3rd and minor 3rd (as #9)',
    decoys: ['major 7 and minor 7', 'natural 5 and flat 5', '#4 and 5'],
    explanation: "The Hendrix chord is a dom7 with a raised 9 (#9) — the major 3rd and the minor 3rd (spelled as #9) colliding to create that bluesy, knife-edge tension. Hendrix made it his signature, and you hear it all over funk, gospel cadences, and any tune that wants that 'wrong-but-right' bite.",
    skillTag: 'ear-theory-hendrix-chord' },
  { id: 'et-12', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A gospel resolution often uses V7sus4 before V7 to create _____',
    correctAnswer: 'suspension-and-release tension',
    decoys: ['modal ambiguity', 'chromatic descent', 'a deceptive resolution'],
    explanation: "V7sus4 resolving to V7 sets up suspense — the suspended 4th pulls down to the 3rd just before resolving to I. Gospel, R&B, and worship cadences use this 'hold-then-drop' tension constantly; once you can hear it, you'll catch it in every other Sunday-morning song.",
    skillTag: 'ear-theory-V7sus4-release' },
  { id: 'et-13', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'When a song\'s bass descends by step while chords change above it, the technique is called _____',
    correctAnswer: 'descending bass line',
    decoys: ['parallel motion', 'pedal point', 'oblique harmony'],
    explanation: "When the bass walks down by step while chords shift on top, you have a descending bass line — maybe the most universal tool in ballad writing. It's a signature move in gospel, soul, and standards (think 'A Whiter Shade of Pale,' or any Donny Hathaway slow burn).",
    skillTag: 'ear-theory-descending-bass' },
  { id: 'et-14', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A Dominant 7 that does NOT resolve (it acts as the tonic) reveals which mode?',
    correctAnswer: 'Mixolydian',
    decoys: ['Dorian', 'Lydian', 'Phrygian'],
    explanation: "A dominant 7 chord acting as the tonic — sitting there, not resolving — reveals Mixolydian mode (the major scale with a flat 7 instead of the leading tone). It's the harmonic bedrock of rock, funky gospel vamps, and blues-based R&B.",
    skillTag: 'ear-theory-non-resolving-dom7' },
  { id: 'et-15', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'The IV → I move is also nicknamed _____',
    correctAnswer: 'the Amen cadence',
    decoys: ['the leading-tone cadence', 'the deceptive cadence', 'the half cadence'],
    explanation: "The IV → I move is the 'Amen cadence' — named for how hymns end on those two chords sung to the word 'Amen.' Every gospel and worship musician knows it as 'the 4 back to the 1'; classical theory books call the same move the 'plagal cadence.'",
    skillTag: 'ear-theory-amen-cadence' },
];

// --- Combine all -----------------------------------------------------

// --- Tritone pairs + enharmonic equivalents (Foundational / Math) ---

/** Chromatic semitone for any common note spelling, including the
 *  double-edge enharmonics (Cb, B#, E#, Fb). */
const NOTE_SEMITONE: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4,
  'E#': 5, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10,
  B: 11, Cb: 11,
};

/** Near-miss note decoys around `correct`'s pitch (±1, ±2 semitones), in
 *  sharp spelling, excluding the correct note. Never the correct pitch,
 *  so no decoy is a hidden enharmonic of the answer. */
function noteDecoys(correct: string, count = 3): string[] {
  const sem = NOTE_SEMITONE[correct] ?? 0;
  const pool = [sem - 1, sem + 1, sem - 2, sem + 2].map(s => noteAt(s, false));
  return makeDecoys(pool, correct, count);
}

function generateTritonePairCards(): Flashcard[] {
  // Six tritone pairs; each note is drilled as a question subject (both
  // directions). The tritone bisects the octave, so it's its own
  // inverse — the partner's tritone is the original note.
  const pairs: Array<{ a: string; aAlt?: string; b: string; bAlt?: string }> = [
    { a: 'C', b: 'F#', bAlt: 'Gb' },
    { a: 'C#', aAlt: 'Db', b: 'G' },
    { a: 'D', b: 'G#', bAlt: 'Ab' },
    { a: 'D#', aAlt: 'Eb', b: 'A' },
    { a: 'E', b: 'A#', bAlt: 'Bb' },
    { a: 'F', b: 'B', bAlt: 'Cb' },
  ];
  const cards: Flashcard[] = [];
  let i = 1;
  const mk = (note: string, partner: string, partnerAlt?: string) => {
    const altText = partnerAlt ? ` (= ${partnerAlt})` : '';
    cards.push({
      id: `tt-${i++}`,
      category: 'tritone-pairs',
      categoryName: CATEGORY_LABELS['tritone-pairs'],
      question: `Tritone of ${note}?`,
      correctAnswer: partner,
      decoys: noteDecoys(partner),
      explanation: `${note} → ${partner}${altText}: Augmented 4th / Diminished 5th — 6 semitones, exactly half an octave. Because it splits the octave in two, the tritone is its own inverse: the tritone of ${partner} is ${note} right back. It's the engine of the dominant 7th (the 3rd–♭7 tritone) and every V→I resolution in gospel, jazz, and R&B.`,
      skillTag: `tritone-${note}`,
    });
  };
  for (const p of pairs) {
    mk(p.a, p.b, p.bAlt);
    mk(p.b, p.a, p.aAlt);
  }
  return cards;
}

function generateEnharmonicEquivalentCards(): Flashcard[] {
  const cards: Flashcard[] = [];
  let i = 1;

  // Note-name equivalents — same pitch, two spellings. [a, b, context]
  const notePairs: Array<[string, string, string]> = [
    ['Ab', 'G#', 'Ab in flat keys (Eb/Ab/Db major); G# in sharp keys (A/E/B major).'],
    ['Bb', 'A#', 'Bb in flat keys; A# only in sharp keys (B / F# major).'],
    ['Db', 'C#', 'Db in flat keys (Ab/Db/Gb); C# in sharp keys (D/A/E major).'],
    ['Eb', 'D#', 'Eb in flat keys; D# in sharp keys (E / B major).'],
    ['Gb', 'F#', 'Gb in flat keys (Db/Gb); F# in sharp keys (G/D/A major).'],
    ['B#', 'C', 'B# is C re-spelled — the leading tone of C# major / raised degrees.'],
    ['Cb', 'B', 'Cb is B re-spelled — the 4th of Gb major and other flat-key contexts.'],
    ['E#', 'F', 'E# is F re-spelled — the 3rd of C# major / raised degrees.'],
    ['Fb', 'E', 'Fb is E re-spelled — appears in heavily-flat keys and lowered degrees.'],
  ];
  for (const [x, y, ctx] of notePairs) {
    cards.push({
      id: `enh-n-${i++}`,
      category: 'enharmonic-equivalents',
      categoryName: CATEGORY_LABELS['enharmonic-equivalents'],
      question: `Enharmonic equivalent of ${x}?`,
      correctAnswer: y,
      decoys: noteDecoys(y),
      explanation: `${x} = ${y} — same key on the piano, different spelling. ${ctx}`,
      skillTag: `enharmonic-note-${x}`,
    });
    cards.push({
      id: `enh-n-${i++}`,
      category: 'enharmonic-equivalents',
      categoryName: CATEGORY_LABELS['enharmonic-equivalents'],
      question: `Enharmonic equivalent of ${y}?`,
      correctAnswer: x,
      decoys: noteDecoys(x),
      explanation: `${y} = ${x} — same key on the piano, different spelling. ${ctx}`,
      skillTag: `enharmonic-note-${y}`,
    });
  }

  // Interval-name equivalents — same pitch distance, different spellings;
  // context decides which reads correctly. Several are THREE-way: the
  // same pitch has a chord-tone, an altered, and an extension spelling.
  // One card per spelling ("equivalent of X?" → the other member(s)).
  const intervalPool = [
    '2', 'b2', '#2', '3', 'b3', '4', '#4', 'b5', '5', '#5', 'b6', '6',
    'b7', '7', '9', 'b9', '#9', '11', '#11', '13', 'b13',
  ];
  const intervalDecoys = (correct: string, members: readonly string[]) =>
    makeDecoys(shuffleArray(intervalPool.filter(n => !members.includes(n))), correct);
  const intervalGroups: Array<{ members: string[]; context: string }> = [
    { members: ['2', '9'], context: 'Same pitch an octave apart — "2" in sus/add voicings, "9" in extended (9th / 13th) chords.' },
    { members: ['b2', 'b9'], context: 'b2 for a Phrygian / sus flavour; b9 as the altered-dominant tension. Same pitch, different role.' },
    { members: ['#2', 'b3', '#9'], context: 'All the minor-third pitch: b3 as the chord’s third, #2 as a raised-2nd passing tone, #9 as the "Hendrix" altered-dominant tension. Context decides the spelling.' },
    { members: ['4', '11'], context: 'Same pitch an octave apart — "4" in sus/add voicings, "11" in extended chords.' },
    { members: ['#4', 'b5', '#11'], context: 'The tritone: #4 (Lydian, raising the 4th), b5 (altered dominant / half-diminished, lowering the 5th), #11 (the extended-chord name). Context decides the spelling.' },
    { members: ['6', '13'], context: 'Same pitch an octave apart — "6" in sixth chords, "13" in extended dominants.' },
    { members: ['b6', '#5', 'b13'], context: 'The augmented-fifth sound: #5 (augmented / altered dominant), b6 (minor / borrowed), b13 (the extended-dominant name). Context decides the spelling.' },
  ];
  for (const { members, context } of intervalGroups) {
    for (const m of members) {
      const answer = members.filter(x => x !== m).join(' / ');
      cards.push({
        id: `enh-i-${i++}`,
        category: 'enharmonic-equivalents',
        categoryName: CATEGORY_LABELS['enharmonic-equivalents'],
        question: `Enharmonic equivalent of ${m}?`,
        correctAnswer: answer,
        decoys: intervalDecoys(answer, members),
        explanation: `${members.join(' = ')} — same pitch distance, different spelling. ${context}`,
        skillTag: `enharmonic-interval-${m}`,
      });
    }
  }

  return cards;
}

export const FLASHCARDS: Flashcard[] = [
  ...generateScaleDegreeMathCards(),
  ...generateNamedNoteCards(),
  ...DIATONIC_QUALITY_CARDS,
  ...FUNCTIONAL_HARMONY_CARDS,
  ...KEY_SIG_CARDS,
  ...generateReversePivotCards(),
  ...MODE_CARDS,
  ...PENTATONIC_CARDS,
  ...generateIntervalCards(),
  ...CHORD_CONSTRUCTION_CARDS,
  ...PROGRESSION_CARDS,
  ...SLASH_CHORD_CARDS,
  ...EAR_THEORY_CARDS,
  ...generateTritonePairCards(),
  ...generateEnharmonicEquivalentCards(),
];

export function cardsByCategory(category: FlashcardCategory): Flashcard[] {
  return FLASHCARDS.filter(c => c.category === category);
}

export function cardById(id: string): Flashcard | undefined {
  return FLASHCARDS.find(c => c.id === id);
}
