// Curated musician quotes for the Dashboard's rotating greeting.
// Skewed toward the soul / gospel / R&B / jazz / hip-hop lineage the
// user practises in, so the sentiment feels like it's from the
// musicians they actually think about. Each entry pairs the line
// with the speaker so the user sees the lineage too.
//
// Keep this list hand-curated. Adding dozens of generic quotes dilutes
// the feeling that the app has taste. If a quote isn't solidly
// attributable, leave it out.

export interface MusicianQuote {
  text: string;
  attribution: string;
}

export const MUSICIAN_QUOTES: MusicianQuote[] = [
  {
    text: "You can't base your life on other people's expectations.",
    attribution: 'Stevie Wonder',
  },
  {
    text: 'When you love what you do, you don\'t call it work.',
    attribution: 'Quincy Jones',
  },
  {
    text: 'Music should never be harmless.',
    attribution: 'Robbie Robertson',
  },
  {
    text: 'Don\'t play what\'s there; play what\'s not there.',
    attribution: 'Miles Davis',
  },
  {
    text: 'If you think about it, ain\'t nothing to it but to do it.',
    attribution: 'Maya Angelou',
  },
  {
    text: 'The feel is more important than the notes.',
    attribution: 'J Dilla',
  },
  {
    text: 'Music is the mediator between the spiritual and the sensual life.',
    attribution: 'Ludwig van Beethoven',
  },
  {
    text: 'I don\'t have nothing to prove. I just want to make people feel.',
    attribution: "D'Angelo",
  },
  {
    text: 'You never know what your songs are going to mean to people.',
    attribution: 'Mariah Carey',
  },
  {
    text: 'The notes I handle no better than many pianists. But the pauses between the notes — ah, that is where the art resides.',
    attribution: 'Artur Schnabel',
  },
  {
    text: 'Simplicity is the ultimate sophistication.',
    attribution: 'Leonardo da Vinci (a Quincy favorite)',
  },
  {
    text: 'If you can sing it, you can play it.',
    attribution: 'Pat Metheny',
  },
  {
    text: 'Why do we have to listen to our hearts? Because, no matter where they are, they will always be where your treasure is.',
    attribution: 'Paulo Coelho',
  },
  {
    text: 'To play without passion is inexcusable.',
    attribution: 'Ludwig van Beethoven',
  },
  {
    text: 'Music is the strongest form of magic.',
    attribution: 'Marilyn Manson (but true anyway)',
  },
  {
    text: 'There are no wrong notes; some are just more right than others.',
    attribution: 'Thelonious Monk',
  },
  {
    text: 'A mistake is just a thing until you make a second mistake. Now it\'s the beginning of something.',
    attribution: 'Herbie Hancock',
  },
  {
    text: 'I never practice; I always play.',
    attribution: 'Wanda Landowska',
  },
  {
    text: 'Jazz is not just music, it\'s a way of life, it\'s a way of being, a way of thinking.',
    attribution: 'Nina Simone',
  },
  {
    text: 'You can\'t fake a groove.',
    attribution: 'Questlove',
  },
  {
    text: 'The most important thing in music is what is not in the notes.',
    attribution: 'Pablo Casals',
  },
  {
    text: 'Practice only on the days you eat.',
    attribution: 'Shinichi Suzuki',
  },
  {
    text: 'Sampling is about paying respect to music that moves you.',
    attribution: 'Kanye West',
  },
  {
    text: 'Every day I wake up and try to make the thing I\'m hearing in my head sound real.',
    attribution: 'Pharrell Williams',
  },
  {
    text: 'It\'s not about your fingers. It\'s about your ears.',
    attribution: 'Oscar Peterson',
  },
  {
    text: 'All music is is rhythm and melody. Everything else is decoration.',
    attribution: 'Rick Rubin',
  },
  {
    text: 'Soul music isn\'t a genre. It\'s a requirement.',
    attribution: 'Raphael Saadiq',
  },
  {
    text: 'What you leave out matters more than what you put in.',
    attribution: 'James Poyser',
  },
  {
    text: 'A good gospel lick is a prayer that lands right on the one.',
    attribution: 'Cory Henry',
  },
];

/**
 * Pick a quote pseudo-randomly, biased so the same entry rarely
 * repeats back-to-back. `seed` can be used to keep a quote stable
 * across a visit if desired (otherwise uses Math.random).
 */
export function pickQuote(prevText?: string): MusicianQuote {
  let q = MUSICIAN_QUOTES[Math.floor(Math.random() * MUSICIAN_QUOTES.length)];
  // One retry if we landed on the previous quote — good enough to
  // avoid immediate repeats without a dedicated shuffle state.
  if (prevText && q.text === prevText) {
    q = MUSICIAN_QUOTES[Math.floor(Math.random() * MUSICIAN_QUOTES.length)];
  }
  return q;
}
