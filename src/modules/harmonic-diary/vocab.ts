// Controlled vocabularies for Harmonic Diary tags. Users can add
// custom tags at any time; these are the pre-populated chips shown
// as defaults.

export const EMOTIONAL_TAGS = [
  'melancholy',
  'hopeful',
  'tense',
  'resolved',
  'bright',
  'dark',
  'warm',
  'dreamy',
  'mysterious',
  'soulful',
  'funky',
  'triumphant',
  'contemplative',
  'longing',
  'joyful',
  'stormy',
  'tender',
  'urgent',
  'playful',
  'reverent',
] as const;

export const GENRE_TAGS = [
  'gospel',
  'soul',
  'r&b',
  'neo-soul',
  'jazz',
  'hip-hop',
  'funk',
  'blues',
  'worship',
  'pop',
] as const;

export type EmotionalTag = typeof EMOTIONAL_TAGS[number];
export type GenreTag = typeof GENRE_TAGS[number];

/**
 * Diary modes + emotion variants. The concrete palettes live in
 * `index.css` as CSS custom properties keyed by the `data-mode` +
 * `data-emotion` attributes on `.diary-root`; this module owns the
 * string vocabulary + emotion-detection regex that drive those
 * attributes, so the React layer just reads a key and sets an
 * attribute.
 */
export type DiaryMode = 'light' | 'dark';

export type DiaryEmotion =
  | 'default'
  | 'melancholy'
  | 'joyful'
  | 'contemplative'
  | 'groovy';

/** Short descriptor shown to the user when a palette activates. */
export const EMOTION_LABEL: Record<DiaryEmotion, string> = {
  default:       'warm neutral',
  melancholy:    'overcast afternoon',
  joyful:        'golden hour',
  contemplative: 'moss and cream',
  groovy:        'sun-drenched',
};

// Search terms that trigger an emotion palette. Fuzzy — the first
// match wins. Kept small on purpose so unrelated searches don't
// surprise-shift the palette.
const EMOTION_MATCHERS: Array<{ re: RegExp; key: Exclude<DiaryEmotion, 'default'> }> = [
  { re: /melanchol|blue|sad|longing|yearning|forlorn|pensive|bittersweet/i, key: 'melancholy' },
  { re: /joy|uplift|triumph|bright|hopeful|light/i,                         key: 'joyful' },
  { re: /smooth|contemplat|tender|dreamy|intimate/i,                        key: 'contemplative' },
  { re: /groov|funk|soul(ful)?|warm|pocket|greasy/i,                        key: 'groovy' },
];

/** Resolve a search term (or active emotion tag) to a palette key.
 *  Returns `'default'` when nothing matches or the query is empty. */
export function emotionFor(query: string): DiaryEmotion {
  const q = query.trim().toLowerCase();
  if (!q) return 'default';
  for (const { re, key } of EMOTION_MATCHERS) {
    if (re.test(q)) return key;
  }
  return 'default';
}

// ---------------------------------------------------------------
// Lineage quotes shown at the top of the Diary landing. Rotates
// daily — `quoteForToday` seeds from the local day so the same quote
// stays put across a single day's visits.
// ---------------------------------------------------------------

export const LINEAGE_QUOTES: string[] = [
  'Every melody you hear has traveled. From spiritual to blues to jazz to you.',
  'You\'re part of a lineage. Let your associations reflect it.',
  'Harmonic language carries generations. Yours joins the conversation.',
  'The blues is the reason. Gospel is the heart. Jazz is the vocabulary. You are the verb.',
  'What you feel is what was passed down. What you play is what you pass on.',
  'Listen for the ancestors in every chord. They put them there.',
  'Theory is a map. The music is the terrain. The feeling is the weather.',
  'Black music is a country with no borders and an infinite language. You speak it too.',
  'Every turnaround is a little prayer that someone taught someone who taught someone.',
  'A chord is a mood. A progression is a story. Pay attention to what yours tells you.',
  'Grooves carry memory. When you catch one, you\'re holding a thread.',
  'Silence is an instrument. Leave room for what the chord is saying.',
  'Harmony is a conversation. Dissonance is honesty.',
  'Pocket, church, swing, trap — different rooms in the same house.',
  'What sounds right to you was taught to you, long before the first lesson.',
];

export function quoteForToday(): string {
  const d = new Date();
  const dayKey = d.getFullYear() * 1000 + (d.getMonth() * 31) + d.getDate();
  return LINEAGE_QUOTES[dayKey % LINEAGE_QUOTES.length];
}

// ---------------------------------------------------------------
// Starter-text seeds. When a diary entry is newly created (e.g. the
// user clicks a skill that has no diary entry yet) we seed with a
// soft, evocative line tuned to the skill type. User can edit or
// replace entirely.
// ---------------------------------------------------------------

export function defaultStarterFor(skillType: string, skillName: string): string {
  switch (skillType) {
    case 'theory':
      return `What does ${skillName.toLowerCase()} make you feel before you explain it?`;
    case 'ear':
      return `Close your eyes. When ${skillName.toLowerCase()} lands in your ear, where does it sit?`;
    case 'physical-chord-shape':
      return `Under your hands, ${skillName} has a temperature. Describe it.`;
    case 'physical-scale':
      return `Run ${skillName.toLowerCase()} once. What's the story it tells on the way up vs. down?`;
    case 'physical-voice-leading':
      return `Follow the top voice through ${skillName.toLowerCase()}. What does it want to say?`;
    case 'song':
      return `What's the one moment in ${skillName} that lives in you?`;
    default:
      return `Write whatever comes first — feel, memory, moment, image.`;
  }
}
