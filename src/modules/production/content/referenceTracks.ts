import type { ReferenceTrackContent } from './types';

/**
 * Starter reference tracks seeded on first load. Sonic notes are
 * written for producers studying technique — what to listen for at
 * what moment. Users can edit, add new tracks, or archive any of
 * these; the seeding is one-time (tracked via the isStarter flag).
 */
export const REFERENCE_TRACKS: ReferenceTrackContent[] = [
  {
    id: 'ref-babyface-ballad',
    title: 'Can We Talk',
    artist: 'Tevin Campbell (prod. Babyface)',
    genre: 'R&B ballad',
    sonicNotes:
      'Textbook Babyface vocal chain — gentle Opto compression (barely audible pumping), classic EMT 140 plate reverb at around 1.8 s, subtle de-essing, no audible harshness. Listen to how every breath sits at exactly the same level. Drums are programmed but feel warm — probably tape-saturated. Bass is DI, compressed firmly, panned dead centre.',
    tags: ['vocal-compression', 'plate-reverb', '90s-rnb', 'babyface'],
  },
  {
    id: 'ref-babyface-ballad-2',
    title: 'Water Runs Dry',
    artist: 'Boyz II Men (prod. Babyface)',
    genre: 'R&B ballad',
    sonicNotes:
      'Four-part BGV stack — each harmony doubled, wide stereo spread, glued with heavy bus compression. Hall reverb on the stack (2.5 s decay) against plate on the lead (1.6 s). The "preacher + congregation" architecture. Vocal chain: light peak-catcher + smooth Opto leveler; parallel compression underneath.',
    tags: ['bgv-stacking', 'parallel-compression', 'reverb-architecture', '90s-rnb'],
  },
  {
    id: 'ref-kirk-franklin',
    title: 'Stomp',
    artist: 'Kirk Franklin and God\'s Property',
    genre: 'Gospel',
    sonicNotes:
      'Modern gospel choir production. Choir feels like 50 voices but is maybe 8 singers stacked. Each part (sopranos, altos, tenors, basses) doubled 3+ times, panned wide. Choir bus heavily compressed for unity, hall reverb for architecture. Lead vocal dry and forward by contrast. Listen to the slapback on Kirk\'s ad-libs — short, no feedback. Kick sidechain-pumping the pad gently.',
    tags: ['choir-stacking', 'gospel', 'sidechain-pump', 'slapback'],
  },
  {
    id: 'ref-boyz-ii-men',
    title: 'End of the Road',
    artist: 'Boyz II Men',
    genre: 'R&B ballad',
    sonicNotes:
      'The gold standard of 90s R&B BGV production. Five-part stack at the chorus, each part heavily compressed individually, summed into a bus with additional gentle compression, panned across the stereo field. Lead vocal sits in a classic EMT plate (1.6 s, 30 ms pre-delay). Listen to how the BGVs tuck behind the lead on the verses but bloom at the chorus — automated send levels.',
    tags: ['bgv-stacking', 'vocal-compression', 'plate-reverb', '90s-rnb'],
  },
  {
    id: 'ref-frank-ocean',
    title: 'Pink + White',
    artist: 'Frank Ocean',
    genre: 'Neo-soul',
    sonicNotes:
      'Modern minimalism. Vocal feels dry up close but there\'s subtle short reverb and tape delay. BGVs are soft, not stacked aggressively. Drums are tape-saturated but loose. Bass is round, gently compressed. The whole mix has a lot of headroom — loudness is not the point; space is. Pitch correction is present but gentle; character preserved.',
    tags: ['modern-rnb', 'tape-saturation', 'minimalism', 'neo-soul'],
  },
  {
    id: 'ref-daniel-caesar',
    title: 'Best Part (feat. H.E.R.)',
    artist: 'Daniel Caesar',
    genre: 'Modern R&B',
    sonicNotes:
      'Nearly-dry lead vocal with a hint of short plate; slapback delay on ad-libs; guitar-led production. BGVs subtle, pitch-tight. Reference for "less is more" — the arrangement has a lot of space, and the vocals are positioned inside that space, not competing with it. Bus compression on the master feels very gentle.',
    tags: ['modern-rnb', 'slapback', 'minimalism'],
  },
  {
    id: 'ref-dangelo-untitled',
    title: 'Untitled (How Does It Feel)',
    artist: "D'Angelo",
    genre: 'Neo-soul',
    sonicNotes:
      'The neo-soul production textbook. Aggressive tape saturation across the mix. Drums pulled back in time (the "Dilla feel"), compressed heavily on the drum bus. Bass and Rhodes intentionally share low-mid frequency space — would be mud in other genres, feels right here because the arrangement is spare. Vocal has a warm Opto compression and a medium plate.',
    tags: ['tape-saturation', 'neo-soul', 'dilla-feel', 'minimalism'],
  },
  {
    id: 'ref-whitney-ballad',
    title: 'I Will Always Love You',
    artist: 'Whitney Houston (prod. David Foster)',
    genre: 'Pop ballad',
    sonicNotes:
      'The compression reference. Every breath, every consonant, every sustained note sits at the same perceived level despite the enormous dynamic range of the performance. Two-stage compressor chain: fast peak-catcher + slow Opto leveler, total ~8 dB of combined gain reduction. Meticulous de-essing — no S ever pokes harshly. Plate reverb at ~2 s. BGVs surround the final chorus, panned wide.',
    tags: ['vocal-compression', 'de-essing', 'plate-reverb', 'pop-ballad'],
  },
];

export function referenceTrackById(id: string): ReferenceTrackContent | undefined {
  return REFERENCE_TRACKS.find(t => t.id === id);
}
