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
 * Atmospheric palette keyed by emotion. Returned when a search term
 * or active emotion tag implies a mood — the Moodboard view shifts
 * its background temperature subtly. Palettes are intentionally
 * dusty/muted so the effect feels atmospheric rather than costumed.
 */
export interface DiaryPalette {
  /** CSS background (accepts any valid background value). */
  background: string;
  /** Accent colour used for headings and tag chips. */
  accent: string;
  /** Subtle overlay tint for cards. */
  cardTint: string;
  /** Short descriptor displayed to the user when the palette shifts. */
  label: string;
}

// Palette defaults follow the editorial-warmth spec. Gradient angle
// is 135° so the darker corner sits top-left and light pools toward
// the bottom-right — the layout where the eye naturally rests.
const DEFAULT_PALETTE: DiaryPalette = {
  background: 'linear-gradient(135deg, #1a1410 0%, #2a1f18 100%)',
  accent: '#e3cba1',
  cardTint: 'rgba(36, 29, 24, 0.92)',
  label: 'warm neutrals',
};

const PALETTES: Record<string, DiaryPalette> = {
  melancholy: {
    background: 'linear-gradient(135deg, #0f1419 0%, #1a2838 100%)',
    accent: '#d4a055',
    cardTint: 'rgba(26, 40, 56, 0.72)',
    label: 'blues twilight',
  },
  joyful: {
    background: 'linear-gradient(135deg, #2a1610 0%, #3d2618 100%)',
    accent: '#f5c456',
    cardTint: 'rgba(61, 38, 24, 0.72)',
    label: 'gospel light',
  },
  contemplative: {
    background: 'linear-gradient(135deg, #1f1523 0%, #2d1a2e 100%)',
    accent: '#c98478',
    cardTint: 'rgba(45, 26, 46, 0.72)',
    label: 'neo-soul dusk',
  },
  groovy: {
    background: 'linear-gradient(135deg, #2a1a0f 0%, #3d2515 100%)',
    accent: '#e8a55a',
    cardTint: 'rgba(61, 37, 21, 0.72)',
    label: '70s soul',
  },
};

// Search terms that map onto palette keys. Fuzzy — the first match
// wins. Kept small to avoid surprise palette shifts on unrelated
// searches; unknown terms just use the default.
const PALETTE_MATCHERS: Array<{ re: RegExp; key: keyof typeof PALETTES }> = [
  { re: /melanchol|blue|sad|longing|yearning|forlorn|pensive/i, key: 'melancholy' },
  { re: /joy|uplift|triumph|bright|hopeful|light/i,             key: 'joyful' },
  { re: /smooth|contemplat|tender|dreamy|intimate/i,            key: 'contemplative' },
  { re: /groov|funk|soul(ful)?|warm|pocket|greasy/i,            key: 'groovy' },
];

export function paletteFor(query: string): DiaryPalette {
  const q = query.trim().toLowerCase();
  if (!q) return DEFAULT_PALETTE;
  for (const { re, key } of PALETTE_MATCHERS) {
    if (re.test(q)) return PALETTES[key];
  }
  return DEFAULT_PALETTE;
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
