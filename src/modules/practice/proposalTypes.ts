/**
 * Phase 3 Step 4 — display-side types for the proposal screen.
 *
 * The algorithm (Step 2) produces AllocatedBlock — moduleRef + memory
 * type + itemRefs + plannedSeconds. The proposal screen needs more:
 * a display label, the module's accent color, a per-memory-type
 * activity description, and a why-snippet. Rather than burdening the
 * algorithm with display concerns, we transform AllocatedBlock into
 * ProposalBlock at the integration layer (Step 5+); the screen
 * components take ProposalBlock directly.
 */

export interface ProposalBlock {
  /** Stable id matching the algorithm's AllocatedBlock.id. */
  id: string;
  moduleRef: string;
  /** Display label for the module — from moduleMeta. */
  moduleLabel: string;
  /** Module accent hex. Drives block background + Why-this-plan dot. */
  moduleAccentHex: string;
  /**
   * Short, scannable description of what this block targets.
   * Per-memory-type shape (caller assembles):
   *
   *   declarative → "Chord Function cards — 10 attempts"
   *   procedural  → "Chord shape drills — 12 min"
   *   integration → "Mirror, Alpha & Omega · Verse · C, G"
   *   production  → "Workflow Foundations · 12 min"
   *   expression  → activity name
   */
  activityDescription: string;
  /** Allocated duration in seconds. */
  plannedSeconds: number;
  /**
   * Concise reason this block is in the session. Shown in the
   * expanded state and (mirrored) in the Why-this-plan panel.
   * Examples:
   *   "4 overdue cards · chord function goal due in 9 days"
   *   "Last practiced 5 days ago"
   *   "Acquiring · 2nd touch this week"
   */
  whySnippet: string;
  /** Items this block targets. Step 4b uses these for the quick-
   *  launch destination + (for songs) the section + key copy. */
  itemRefs: readonly string[];
  /** Render the "warm-up" badge. The screen-level wiring picks one
   *  block per card to flag as warm-up; this component just paints
   *  the badge when told. */
  isWarmup?: boolean;
}

export interface ProposalCardData {
  kind: 'balanced' | 'focused';
  title: string;
  blocks: ProposalBlock[];
  /** Sum of plannedSeconds across blocks. Pre-computed so the
   *  proposal header doesn't have to. */
  totalSeconds: number;
  /**
   * Optional pre-built lines for the "Why this plan?" panel
   * (Step 4e). Each line carries the dot color + a concise reason.
   * When omitted, the panel falls back to one line per block using
   * each block's whySnippet + moduleAccentHex — useful baseline for
   * Phase 3 v1, with the integration layer (Step 5+) supplying
   * cross-block narratives (pace deficit lines, etc.) when they're
   * available.
   */
  whyLines?: ReadonlyArray<{ accentHex: string; reason: string }>;
}
