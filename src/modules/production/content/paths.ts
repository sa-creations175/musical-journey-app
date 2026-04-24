import type { ProductionPath } from './types';

/**
 * The six production paths. Phase 1 ships the first three; the rest
 * render as "Coming in Phase 2" placeholders until their lessons
 * are authored.
 */
export const PRODUCTION_PATHS: ProductionPath[] = [
  {
    id: 'workflow-foundations',
    title: 'Workflow Foundations',
    subtitle: 'Get comfortable in Logic so the tool stops getting in your way.',
    status: 'live',
  },
  {
    id: 'language-of-production',
    title: 'The Language of Production',
    subtitle: 'The vocabulary every producer hears in their head — EQ, compression, reverb, and the rest.',
    status: 'live',
  },
  {
    id: 'vocal-production',
    title: 'Vocal Production',
    subtitle: 'Record, tune, compress, and place a vocal with intent.',
    status: 'live',
  },
  {
    id: 'genre-productions',
    title: 'Genre Productions',
    subtitle: 'Build gospel, R&B, soul, neo-soul, hip-hop productions end to end — 11 two-session arcs.',
    status: 'live',
  },
  {
    id: 'arrangement',
    title: 'Arrangement & Song Structure',
    subtitle: 'Intros, pre-choruses, bridges, outros — how great songs breathe.',
    status: 'live',
  },
  {
    id: 'business',
    title: 'The Business of Music',
    subtitle: 'Publishing, splits, placements, royalties, and releasing on your own.',
    status: 'live',
  },
];

export function pathById(id: string): ProductionPath | undefined {
  return PRODUCTION_PATHS.find(p => p.id === id);
}
