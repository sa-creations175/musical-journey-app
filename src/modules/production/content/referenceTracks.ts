import type { ReferenceTrackContent } from './types';

/**
 * Starter reference tracks, seeded on first-time Production setup.
 *
 * Content philosophy: "What to listen for" is a GUIDED-LISTENING
 * prompt, not a fabricated technical readout. We don't know the
 * specific plugins, ratios, or decay times the engineer chose, and
 * inventing those dulls the user's ears instead of training them.
 * Instead we point at things the listener can actually perceive —
 * balance, space, arrangement contrast, how voices blend — and let
 * them notice the result of production choices on their own.
 *
 * Spotify / YouTube links are NOT listed here — the seed routine
 * derives them uniformly via `buildSpotifySearchLink` /
 * `buildYouTubeProducerLink` so every track (starter, user-added,
 * Claude-generated) gets the same link format.
 */
export const REFERENCE_TRACKS: ReferenceTrackContent[] = [
  {
    id: 'ref-babyface-ballad',
    title: 'Can We Talk',
    artist: 'Tevin Campbell',
    producer: 'Babyface',
    genre: 'R&B ballad',
    whatToListenFor:
      "Listen for how the vocal floats on top of a warm, restrained backing — you can always hear Tevin's breath between phrases even when the track is full. Notice the tonal balance: everything lives in its own lane, nothing fights. Pay attention to how the reverb on the vocal feels generous but never smeared — you can tell exactly where a phrase ends. Compare the sparse verses to the thicker chorus: what gets added? What gets taken away? Babyface's touch shows up as polish — see if you can sense the care in every moment.",
    tags: ['90s-rnb', 'babyface', 'vocal-production', 'ballad'],
  },
  {
    id: 'ref-babyface-ballad-2',
    title: 'Water Runs Dry',
    artist: 'Boyz II Men',
    producer: 'Babyface',
    genre: 'R&B ballad',
    whatToListenFor:
      "Focus on the background vocals. Start by trying to hear the lead alone, then bring your attention to the harmony stack — is it a few voices, or a cloud? Notice how the backgrounds feel wider than the lead. When the chorus hits, does the room feel bigger? See if you can tell when a harmony enters and exits; that's arrangement at work. Listen for the blend: no single voice pokes through, which is hard to make happen.",
    tags: ['bgv-stacking', 'babyface', '90s-rnb', 'ballad'],
  },
  {
    id: 'ref-kirk-franklin',
    title: 'Stomp',
    artist: "Kirk Franklin and God's Property",
    producer: 'Kirk Franklin',
    genre: 'Gospel',
    whatToListenFor:
      "Listen for how a choir can feel enormous and precise at the same time. Try to count the parts — soprano, alto, tenor, bass — and notice how each part has its own space. Pay attention to the ad-libs over the top: do they feel dry and present, or wet and far? Compare the choir sound to Kirk's lead — his voice is closer. When the groove drops in, notice how the drums push the whole thing forward without overpowering the vocals. This is modern gospel arrangement at its tightest.",
    tags: ['gospel', 'choir', 'arrangement'],
  },
  {
    id: 'ref-boyz-ii-men',
    title: 'End of the Road',
    artist: 'Boyz II Men',
    producer: 'Babyface, L.A. Reid, Daryl Simmons',
    genre: 'R&B ballad',
    whatToListenFor:
      "The gold standard of 90s R&B ensemble vocals. Pay attention to how the voices blend into one instrument during harmonies, then separate when a solo happens. Notice how the track feels big without feeling loud. Listen for the subtle automation — parts duck and lift so your ear always knows where to focus. Compare how much room the vocals occupy versus the instrumental bed; see how producers give the voice the center and push everything else to the sides.",
    tags: ['90s-rnb', 'bgv-stacking', 'ballad', 'vocal-production'],
  },
  {
    id: 'ref-frank-ocean',
    title: 'Pink + White',
    artist: 'Frank Ocean',
    producer: "Frank Ocean, Om'Mas Keith",
    genre: 'Neo-soul',
    whatToListenFor:
      "This is a reference for space. Notice how much silence lives between the drum hits and how much air sits around the vocal. Listen for the difference between how close Frank's voice feels versus the backgrounds — which one is in your ear, which is in the room? Pay attention to the drums: they feel hand-held, loose, imperfect in the best way. Compare how this song breathes to tighter modern productions. The minimalism is doing the work — every element has been chosen carefully because there are so few of them.",
    tags: ['neo-soul', 'minimalism', 'modern-rnb'],
  },
  {
    id: 'ref-daniel-caesar',
    title: 'Best Part (feat. H.E.R.)',
    artist: 'Daniel Caesar',
    producer: 'Daniel Caesar, Jordan Evans, Matthew Burnett',
    genre: 'Modern R&B',
    whatToListenFor:
      "Listen for intimacy. How close does each voice feel? Notice that the guitar and vocal are the whole show — everything else is a texture. Pay attention to how the vocals hand off between Daniel and H.E.R.; where does one stop and the other begin? Listen for the subtle doubling and harmonies in the background — they're almost whispered. Compare the quietness of this production to modern pop R&B — this is what restraint sounds like.",
    tags: ['modern-rnb', 'minimalism', 'duet'],
  },
  {
    id: 'ref-dangelo-untitled',
    title: 'Untitled (How Does It Feel)',
    artist: "D'Angelo",
    producer: "D'Angelo, Raphael Saadiq",
    genre: 'Neo-soul',
    whatToListenFor:
      "This is the neo-soul blueprint. Listen for how the drums pull slightly behind the beat — the whole track has a dragging, sensual feel. Pay attention to the Rhodes and the bass: they share frequency space that would be mud in another genre, but here it feels warm and thick. Notice how D'Angelo's vocal feels like it's in the same room as the instruments, not on top of them. Compare the way this mix breathes to cleaner, brighter R&B records — the slight haze is the point.",
    tags: ['neo-soul', 'dilla-feel', 'arrangement'],
  },
  {
    id: 'ref-whitney-ballad',
    title: 'I Will Always Love You',
    artist: 'Whitney Houston',
    producer: 'David Foster',
    genre: 'Pop ballad',
    whatToListenFor:
      "This is a vocal-performance reference. Listen for how Whitney's quietest whisper and her biggest belt sit at roughly the same perceived loudness — that's the magic of great compression and gain staging. Notice how every consonant lands clearly; nothing is harsh, nothing is lost. Pay attention to how the arrangement parts pull back when the vocal climbs, and fill back in during quieter moments. Compare the final chorus to the first verse: how much more emotional weight is the full production carrying by the end?",
    tags: ['pop-ballad', 'vocal-production', 'dynamics'],
  },
];

export function referenceTrackById(id: string): ReferenceTrackContent | undefined {
  return REFERENCE_TRACKS.find(t => t.id === id);
}

/**
 * Legacy (pre-v13) `sonicNotes` content for each starter. Used by the
 * one-time content refresh pass to detect which starters still carry
 * the original fake-technical prose (and can be safely rewritten to
 * guided-listening) versus starters the user has edited (leave alone).
 */
export const STARTER_LEGACY_SONIC_NOTES: Record<string, string> = {
  'ref-babyface-ballad':
    'Textbook Babyface vocal chain — gentle Opto compression (barely audible pumping), classic EMT 140 plate reverb at around 1.8 s, subtle de-essing, no audible harshness. Listen to how every breath sits at exactly the same level. Drums are programmed but feel warm — probably tape-saturated. Bass is DI, compressed firmly, panned dead centre.',
  'ref-babyface-ballad-2':
    'Four-part BGV stack — each harmony doubled, wide stereo spread, glued with heavy bus compression. Hall reverb on the stack (2.5 s decay) against plate on the lead (1.6 s). The "preacher + congregation" architecture. Vocal chain: light peak-catcher + smooth Opto leveler; parallel compression underneath.',
  'ref-kirk-franklin':
    "Modern gospel choir production. Choir feels like 50 voices but is maybe 8 singers stacked. Each part (sopranos, altos, tenors, basses) doubled 3+ times, panned wide. Choir bus heavily compressed for unity, hall reverb for architecture. Lead vocal dry and forward by contrast. Listen to the slapback on Kirk's ad-libs — short, no feedback. Kick sidechain-pumping the pad gently.",
  'ref-boyz-ii-men':
    'The gold standard of 90s R&B BGV production. Five-part stack at the chorus, each part heavily compressed individually, summed into a bus with additional gentle compression, panned across the stereo field. Lead vocal sits in a classic EMT plate (1.6 s, 30 ms pre-delay). Listen to how the BGVs tuck behind the lead on the verses but bloom at the chorus — automated send levels.',
  'ref-frank-ocean':
    "Modern minimalism. Vocal feels dry up close but there's subtle short reverb and tape delay. BGVs are soft, not stacked aggressively. Drums are tape-saturated but loose. Bass is round, gently compressed. The whole mix has a lot of headroom — loudness is not the point; space is. Pitch correction is present but gentle; character preserved.",
  'ref-daniel-caesar':
    'Nearly-dry lead vocal with a hint of short plate; slapback delay on ad-libs; guitar-led production. BGVs subtle, pitch-tight. Reference for "less is more" — the arrangement has a lot of space, and the vocals are positioned inside that space, not competing with it. Bus compression on the master feels very gentle.',
  'ref-dangelo-untitled':
    'The neo-soul production textbook. Aggressive tape saturation across the mix. Drums pulled back in time (the "Dilla feel"), compressed heavily on the drum bus. Bass and Rhodes intentionally share low-mid frequency space — would be mud in other genres, feels right here because the arrangement is spare. Vocal has a warm Opto compression and a medium plate.',
  'ref-whitney-ballad':
    'The compression reference. Every breath, every consonant, every sustained note sits at the same perceived level despite the enormous dynamic range of the performance. Two-stage compressor chain: fast peak-catcher + slow Opto leveler, total ~8 dB of combined gain reduction. Meticulous de-essing — no S ever pokes harshly. Plate reverb at ~2 s. BGVs surround the final chorus, panned wide.',
};
