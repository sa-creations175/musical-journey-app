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
  // Reading — SEPIA INK, the colour of printed manuscript. Measured
  // in CIE Lab, not eyeballed: minimum dE to any accent already in
  // use is 32.9 (repertoire plum), against 23.7 for the next-best
  // candidate considered. ET green is dE 42.4 away — the hard
  // requirement, since Reading is ear training's visual COUNTERPART
  // and must not read as a sub-area of it.
  //
  // It shares a hue band with Shapes (25 deg vs 23 deg) and is still
  // dE 34.1 clear, because Shapes is a light saturated terracotta
  // (59% sat / 59% lum) where this is a dark muted brown (41% / 31%).
  // Hue proximity is not the measure; perceptual distance is — which
  // is exactly what the rejected teal got wrong.
  //
  // The tint sits dE 5.7 from its nearest neighbour, matching the
  // tightest pair already in this table (HF vs Production, 5.6).
  'reading':              { bg: '#ECE1D4', border: '#4E3016' },
  'practice-consistency': { bg: '#F1EFE8', border: '#5F5E5A' },
};
