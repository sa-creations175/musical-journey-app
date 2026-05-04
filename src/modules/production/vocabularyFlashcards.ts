/**
 * Production Vocabulary flashcards — programmatically generated from
 * the glossary content (src/modules/production/content/glossary.ts).
 *
 * Each glossary term becomes a 4-choice flashcard:
 *   question      = "Which best describes <Term Name>?"
 *   correctAnswer = the term's definition (verbatim)
 *   decoys        = three sibling-cluster definitions, deterministic
 *                   per-card via a seeded shuffle so the same card
 *                   surfaces the same decoys across renders
 *   explanation   = the term's `example` field — concrete pivot to
 *                   why-it-shows-up-in-context
 *
 * Clusters mirror the section headers in glossary.ts. Same-cluster
 * decoys are plausibly confusable (compression terms decoy other
 * compression terms; reverb terms decoy other reverb terms; etc.)
 * so wrong answers force a discrimination, not a vocab whiff.
 */

import { GLOSSARY } from './content/glossary';
import type { GlossaryContent } from './content/types';
import type { BaseFlashcard } from '../../lib/flashcards/FlashcardSession';

export type VocabClusterId =
  | 'logic-interface'
  | 'audio-fundamentals'
  | 'recording'
  | 'microphones'
  | 'eq'
  | 'compression'
  | 'reverb'
  | 'delay-saturation'
  | 'mixing'
  | 'vocals'
  | 'files-bouncing'
  | 'arrangement'
  | 'drums'
  | 'instrumentation'
  | 'mastering'
  | 'business'
  | 'ai-era';

export const VOCAB_CLUSTER_LABELS: Record<VocabClusterId, string> = {
  'logic-interface': 'Logic interface',
  'audio-fundamentals': 'Audio fundamentals',
  'recording': 'Recording',
  'microphones': 'Microphones',
  'eq': 'EQ',
  'compression': 'Compression',
  'reverb': 'Reverb',
  'delay-saturation': 'Delay & saturation',
  'mixing': 'Mixing',
  'vocals': 'Vocal production',
  'files-bouncing': 'Files & bouncing',
  'arrangement': 'Arrangement & song form',
  'drums': 'Drums & groove',
  'instrumentation': 'Instrumentation & textures',
  'mastering': 'Mastering & dynamics',
  'business': 'Music business',
  'ai-era': 'AI era',
};

export const VOCAB_CLUSTER_ORDER: VocabClusterId[] = [
  'logic-interface',
  'audio-fundamentals',
  'recording',
  'microphones',
  'eq',
  'compression',
  'reverb',
  'delay-saturation',
  'mixing',
  'vocals',
  'files-bouncing',
  'arrangement',
  'drums',
  'instrumentation',
  'mastering',
  'business',
  'ai-era',
];

// ---------------------------------------------------------------------
// Cluster ↔ term mapping. The order here mirrors the section-header
// grouping in glossary.ts. Adding a term to the glossary without
// adding it to a cluster here just means it won't appear as a
// flashcard — safe failure mode.
// ---------------------------------------------------------------------
const CLUSTER_TERMS: Record<VocabClusterId, ReadonlyArray<string>> = {
  'logic-interface': [
    'main-window', 'control-bar', 'tracks-area', 'inspector', 'library',
    'smart-controls', 'mixer', 'transport', 'region', 'track', 'screenset',
  ],
  'audio-fundamentals': [
    'decibel', 'dbfs', 'hz', 'kilohertz', 'frequency', 'pitch', 'amplitude',
    'harmonic', 'peak', 'phase',
  ],
  'recording': [
    'record', 'take', 'take-folder', 'comping', 'quick-swipe-comping',
    'flatten', 'composite', 'midi', 'arm', 'input-monitoring', 'cycle',
    'punch', 'playhead', 'marker', 'arrangement-track',
  ],
  'microphones': [
    'microphone', 'pop-filter', 'plosive', 'sibilance', 'phantom-power',
    'condenser-microphone', 'dynamic-microphone',
  ],
  'eq': [
    'eq', 'parametric-eq', 'shelving-eq', 'high-pass-filter',
    'low-pass-filter', 'q-factor',
  ],
  'compression': [
    'compression', 'threshold', 'ratio', 'attack', 'release', 'knee',
    'makeup-gain', 'gain-reduction', 'parallel-compression', 'side-chain',
  ],
  'reverb': [
    'reverb', 'decay', 'pre-delay', 'wet-dry', 'chromaverb', 'space-designer',
    'plate-reverb', 'hall-reverb', 'convolution', 'send',
  ],
  'delay-saturation': [
    'delay', 'feedback', 'slapback', 'tape-delay', 'stereo-delay',
    'saturation', 'distortion', 'tape-saturation', 'tube-saturation',
  ],
  'mixing': [
    'gain-staging', 'headroom', 'clipping', 'clip-gain', 'master-fader',
    'mix-bus', 'auxiliary-track', 'pan', 'stereo-field', 'automation',
  ],
  'vocals': [
    'de-esser', 'flex-pitch', 'pitch-correction', 'cents', 'semitone',
    'formant', 'new-york-compression', 'background-vocals', 'bgv',
    'stacking', 'double',
  ],
  'files-bouncing': [
    'wav', 'mp3', 'sample-rate', 'bit-depth', 'bounce', 'bounce-in-place',
    'stem',
  ],
  'arrangement': [
    'intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro', 'aaba',
    'song-form', 'hook', 'earworm', 'call-and-response', 'syncopation',
    'arrangement', 'section', 'transition', 'emotional-arc', 'drum-fill',
    'vamp', 'half-time', 'time-signature', 'six-eight', 'triplet',
  ],
  'drums': ['kick', 'snare', 'hi-hat', 'ghost-note', 'swing', 'pocket'],
  'instrumentation': [
    'rhodes', 'electric-piano', 'dx7', 'fm-synthesis', 'chorus-effect',
    'string-pad', 'walking-bass', 'gated-reverb', 'vinyl-effect',
    'sampling', 'sample-chop', 'vocal-chop', 'dusty', 'lofi-aesthetic',
    'sparse-arrangement', 'synth-pad', '808', 'glide',
  ],
  'mastering': [
    'multi-band-compression', 'limiter', 'gate', 'expander',
    'upward-compression', 'dynamic-range', 'mid-side-processing',
    'mono-compatibility', 'dither', 'true-peak', 'lufs',
    'loudness-normalization', 'stereo-imaging',
  ],
  'business': [
    'record-label', 'advance', 'royalty', 'album-era', 'napster', 'streaming',
    'sync-licensing', 'streaming-royalty', 'publishing-royalty', 'ascap',
    'bmi', 'sesac', 'beat-leasing', 'non-exclusive-lease', 'exclusive-lease',
    'producer-points', 'copyright', 'registration', 'split-sheet',
    'master-rights', 'publishing-rights', 'work-for-hire', 'public-domain',
    'soundexchange', 'epk', 'distribution', 'catalog',
  ],
  'ai-era': [
    'ai-music', 'stem-separation', 'vocal-cloning', 'training-data',
    'ai-generated-content', 'udio', 'suno',
  ],
};

// Inverse index: term id → cluster id. Built once at module load.
const TERM_TO_CLUSTER = new Map<string, VocabClusterId>();
for (const [cluster, ids] of Object.entries(CLUSTER_TERMS) as Array<
  [VocabClusterId, ReadonlyArray<string>]
>) {
  for (const id of ids) TERM_TO_CLUSTER.set(id, cluster);
}

export interface VocabFlashcard extends BaseFlashcard {
  /** Original glossary term id (without the prod-vocab: prefix). */
  termId: string;
  /** Human-readable term name — denormalised onto the card at build
   *  time so reveal-side surfaces (e.g. the YouTube search link) can
   *  read it without re-looking-up the glossary. */
  termName: string;
  clusterId: VocabClusterId;
}

// ---------------------------------------------------------------------
// Deterministic hash + Fisher-Yates so a given card always renders
// with the same decoys (and thus the same on-screen position via the
// shell's choice shuffle). Hash from the seed string.
// ---------------------------------------------------------------------
function seededHash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return h;
}

function seededShuffle<T>(arr: ReadonlyArray<T>, seed: string): T[] {
  const out = [...arr];
  let h = seededHash(seed);
  for (let i = out.length - 1; i > 0; i--) {
    // Linear-congruential step on the seed so each draw is different.
    h = (h * 1103515245 + 12345) | 0;
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------
// Catalog build — one card per glossary term that's mapped to a
// cluster. Terms whose definition collides with a sibling's are
// padded from outside the cluster as a last resort, so we never
// surface duplicate choices.
// ---------------------------------------------------------------------
function buildCatalog(): VocabFlashcard[] {
  const byId = new Map<string, GlossaryContent>();
  for (const term of GLOSSARY) byId.set(term.id, term);

  const out: VocabFlashcard[] = [];

  for (const term of GLOSSARY) {
    const clusterId = TERM_TO_CLUSTER.get(term.id);
    if (!clusterId) continue;

    const siblingIds = (CLUSTER_TERMS[clusterId] ?? []).filter(
      id => id !== term.id,
    );
    const siblings = siblingIds
      .map(id => byId.get(id))
      .filter((t): t is GlossaryContent => !!t);

    // Pick 3 decoys, seeded by term id so the choice set is stable.
    const shuffled = seededShuffle(siblings, term.id);
    const usedDefinitions = new Set<string>([term.definition]);
    const decoys: string[] = [];
    for (const candidate of shuffled) {
      if (decoys.length >= 3) break;
      if (usedDefinitions.has(candidate.definition)) continue;
      decoys.push(candidate.definition);
      usedDefinitions.add(candidate.definition);
    }

    // Defensive padding from the wider glossary if the cluster has too
    // few unique sibling definitions. Should never happen in practice
    // (smallest cluster is microphones at 7 terms) but cheap insurance.
    if (decoys.length < 3) {
      const wider = GLOSSARY.filter(
        t =>
          t.id !== term.id &&
          !siblingIds.includes(t.id) &&
          !usedDefinitions.has(t.definition),
      );
      const widerShuffled = seededShuffle(wider, `${term.id}:wide`);
      for (const candidate of widerShuffled) {
        if (decoys.length >= 3) break;
        decoys.push(candidate.definition);
        usedDefinitions.add(candidate.definition);
      }
    }

    out.push({
      id: `prod-vocab:${term.id}`,
      termId: term.id,
      termName: term.name,
      clusterId,
      category: clusterId,
      categoryName: VOCAB_CLUSTER_LABELS[clusterId],
      question: `Which best describes ${term.name}?`,
      correctAnswer: term.definition,
      decoys,
      explanation: term.example,
    });
  }

  return out;
}

export const PRODUCTION_VOCAB_FLASHCARDS: VocabFlashcard[] = buildCatalog();

export function vocabCardById(id: string): VocabFlashcard | undefined {
  return PRODUCTION_VOCAB_FLASHCARDS.find(c => c.id === id);
}

export function vocabCardsByCluster(
  clusterId: VocabClusterId,
): VocabFlashcard[] {
  return PRODUCTION_VOCAB_FLASHCARDS.filter(c => c.clusterId === clusterId);
}

export function vocabClustersFromTermIds(
  termIds: ReadonlyArray<string>,
): Set<VocabClusterId> {
  const out = new Set<VocabClusterId>();
  for (const id of termIds) {
    const cluster = TERM_TO_CLUSTER.get(id);
    if (cluster) out.add(cluster);
  }
  return out;
}
