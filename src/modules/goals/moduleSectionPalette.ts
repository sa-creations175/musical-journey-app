import type { GoalFlowModuleId } from './goalVocabulary';

/**
 * Per-module visual container palette shared between the Goals
 * by-module cards and the WeeklyPlan "This week" table.
 *
 * Tints intentionally reuse the feasibility-pill palette where
 * a module's accent matches a status color (ET green, Shapes
 * amber). Borders are darker variants of the same family —
 * deeper than the moduleMeta accents because they're a small
 * 3px stripe and need contrast against the tint.
 */
export const SECTION_PALETTE: Record<
  GoalFlowModuleId,
  { bg: string; border: string }
> = {
  'ear-training':         { bg: '#EAF3DE', border: '#3B6D11' },
  'harmonic-fluency':     { bg: '#EEEDFE', border: '#534AB7' },
  'shapes-and-patterns':  { bg: '#FAEEDA', border: '#854F0B' },
  'repertoire':           { bg: '#FBEAF0', border: '#8B3A52' },
  'production':           { bg: '#E6F1FB', border: '#1F3A6E' },
  'practice-consistency': { bg: '#F1EFE8', border: '#5F5E5A' },
};
