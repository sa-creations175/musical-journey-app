/**
 * Phase 3 polish — inversion training utilities for chord recognition.
 *
 * Pure helpers shared by the quiz, the fluency tracker, and the one-shot
 * migration that rewrites legacy itemIds. Keeping them separate keeps
 * the React component files free of pitch math + parsing logic.
 */

export type Inversion = 0 | 1 | 2 | 3;

export const INVERSION_LABEL: Record<Inversion, string> = {
  0: 'Root',
  1: '1st inversion',
  2: '2nd inversion',
  3: '3rd inversion',
};

/**
 * Chord ids excluded from inversion training. Two reasons surface
 * the same exclusion:
 *
 *   · Sus chords (sus2, sus4) — voicing-shape-defined rather than
 *     triad-stacked. "1st inversion" of Sus2 / Sus4 isn't a useful
 *     ear target; the user would be guessing between voicings that
 *     don't share the real Sus emotional fingerprint.
 *
 *   · Augmented triad (aug) — symmetric stack of major thirds
 *     ([0,4,8]). Each inversion is enharmonically the same chord
 *     at a different root — they sound identical to the ear, so
 *     there's nothing to identify.
 *
 *   · Diminished 7th (dim7) — the same argument one note further.
 *     [0,3,6,9] is a symmetric stack of minor thirds, so all four
 *     inversions are the same four pitch classes; the seed's own
 *     description says as much ("all 4 inversions are harmonically
 *     the same"). It joins the list now that step 2 fires for
 *     seventh chords, where before it was excluded by accident
 *     rather than on purpose — nothing above the foundational tier
 *     was ever asked about its inversions.
 *
 * Excluded chords always play in root position regardless of the
 * inversion settings, and never trigger step 2.
 */
/**
 * Chord tiers whose chords get the identify-the-inversion step.
 *
 * Lives here rather than in the quiz because the tier table has to
 * agree with it: an item listed in `TIER_3_ITEMS` whose chord is not
 * in a trained tier can never be attempted, and a tier that cannot be
 * completed stops the whole ladder. `chordRecognitionTiers.test.ts`
 * asserts the two against each other.
 *
 * It stops at the sevenths deliberately. Extensions and dominant
 * variations run to six and seven notes, where a rotation stops being
 * something an ear picks out as an inversion.
 */
export const INVERSION_TRAINED_TIERS: ReadonlySet<string> =
  new Set(['foundational', 'seventh']);

/**
 * Positions enabled until the player says otherwise.
 *
 * Lives beside the other inversion rules, not in the view, because it
 * is load-bearing for the tier ladder rather than cosmetic: the fourth
 * position is the only route to `maj7:3`, `min7:3` and `dom7:3`, so a
 * default of [0,1,2] leaves three tier-3 items unattainable for anyone
 * who never opens the drawer - which is a tier that cannot clear and a
 * ladder that stops, exactly the failure of the version before it.
 * `chordRecognitionTiers.test.ts` walks the tier table against THIS
 * value rather than against a list written out in the test.
 *
 * Triads need no special case: `inversionsForIntervalCount(3)` is
 * [0,1,2], so the fourth position simply does not apply to them.
 */
export const DEFAULT_INVERSION_POSITIONS: Inversion[] = [0, 1, 2, 3];

export const INVERSION_EXCLUDED_CHORD_IDS: ReadonlySet<string> = new Set([
  'sus2',
  'sus4',
  'aug',
  'dim7',
]);

/**
 * Rotate an interval array for inversion. Maintains ascending order
 * by lifting each shifted-out interval an octave above the previous
 * top.
 *
 *   [0,4,7]    inv 1 → [4,7,12]      (3rd in bass)
 *   [0,4,7]    inv 2 → [7,12,16]     (5th in bass)
 *   [0,4,7,10] inv 1 → [4,7,10,12]
 *   [0,4,7,10] inv 3 → [10,12,16,19]
 *
 * Returns a copy. Inversions out of bounds (≤ 0 or ≥ length) clamp
 * to root position.
 */
export function rotateForInversion(
  intervals: ReadonlyArray<number>,
  inversion: number,
): number[] {
  if (intervals.length === 0) return [];
  if (inversion <= 0 || inversion >= intervals.length) return [...intervals];
  const out = [...intervals];
  for (let i = 0; i < inversion; i++) {
    const first = out.shift()!;
    out.push(first + 12);
  }
  return out;
}

/**
 * Build the per-inversion attempt itemId. Going forward every
 * chord-recognition attempt logs against this shape so per-inversion
 * accuracy can be computed by simple filter + group.
 */
export function attemptItemId(chordId: string, inversion: Inversion): string {
  return `${chordId}:${inversion}`;
}

/** Parse an attempt itemId back into chord id + inversion. Legacy
 *  itemIds without a `:N` suffix parse as inversion 0 (root) since
 *  the audio engine only ever played root before this build. */
export function parseAttemptItemId(itemId: string): {
  chordId: string;
  inversion: Inversion;
} {
  const colon = itemId.indexOf(':');
  if (colon < 0) return { chordId: itemId, inversion: 0 };
  const chordId = itemId.slice(0, colon);
  const raw = Number(itemId.slice(colon + 1));
  const inversion = (Number.isFinite(raw) && raw >= 0 && raw <= 3 ? raw : 0) as Inversion;
  return { chordId, inversion };
}

/** Read-side normalization. Adds `:0` to legacy itemIds so the rest
 *  of the pipeline can rely on the canonical shape even if the
 *  one-shot migration hasn't run yet on this device. */
export function normalizeAttemptItemId(itemId: string): string {
  return itemId.includes(':') ? itemId : `${itemId}:0`;
}

/** Inversions valid for a chord with N intervals. Triads → [0,1,2];
 *  4-note chords → [0,1,2,3]. */
export function inversionsForIntervalCount(count: number): Inversion[] {
  if (count <= 1) return [0];
  if (count === 2) return [0, 1];
  if (count === 3) return [0, 1, 2];
  return [0, 1, 2, 3];
}

/**
 * The inversions a chord can EVER be asked in, ignoring settings.
 *
 * =====================================================================
 * STRUCTURAL ONLY. THAT IS THE WHOLE DISTINCTION.
 *
 * The drill's full gate is this AND `positions.length >= 2`, which
 * reads the reader's current inversion preference. That last condition
 * must never reach a coverage denominator: a total that moves when
 * someone toggles a setting is not a total — yesterday's 51 becomes
 * today's 30 and the dashboard reports progress nobody made.
 *
 * So the three structural questions live here and the runtime one stays
 * at the call site that cares:
 *   · is this chord's tier inversion-trained
 *   · is this chord excluded from inversion training
 *   · does a chord of this size have this inversion at all
 *
 * The dashboard calls this. The quiz composes it with the preference.
 * Neither writes the rule out again — a second copy is how the drill
 * and the dashboard came to disagree about 63 rows.
 * =====================================================================
 */
export function reachableInversions(
  chord: { id: string; tier: string; intervals: ReadonlyArray<number> },
): Inversion[] {
  const trained = INVERSION_TRAINED_TIERS.has(chord.tier)
    && !INVERSION_EXCLUDED_CHORD_IDS.has(chord.id);
  return trained ? inversionsForIntervalCount(chord.intervals.length) : [0];
}

/**
 * Every `chordId:inversion` the drill can ever ask, structurally.
 *
 * =====================================================================
 * ONE ENUMERATION, TWO CONSUMERS, SO THEY CANNOT DRIFT.
 *
 * The dashboard's coverage denominator and the goals layer's
 * `earTrainingCounts` both need this set. They disagreed for months —
 * 114 against 30 — because each answered the question its own way and
 * nothing compared them. Sharing the function is what makes "widen an
 * exclusion and both move" true by construction rather than by two
 * people remembering.
 *
 * Takes the seed list as a parameter so a test can hand it a different
 * catalog. Defaulted, because every caller wants the real one.
 * =====================================================================
 */
export function reachableChordRefs(
  seeds: ReadonlyArray<{ id: string; tier: string; intervals: ReadonlyArray<number> }>,
): string[] {
  return seeds.flatMap(chord =>
    reachableInversions(chord).map(inv => `${chord.id}:${inv}`));
}

/**
 * Rotate the displayed scale-degree formula to match the played
 * inversion. Mirrors rotateForInversion's semantics for intervals,
 * but on the comma-separated string format ChordData.formula uses
 * (e.g. "1, 3, 5" → "3, 5, 1" for 1st inversion).
 *
 * Out-of-range inversions clamp to the original (root) formula.
 * The function preserves whatever spacing the source string used
 * by trimming each part and rejoining with ", ".
 */
export function rotateFormula(formula: string, inversion: number): string {
  if (inversion <= 0) return formula;
  const parts = formula.split(',').map(s => s.trim()).filter(s => s.length > 0);
  if (inversion >= parts.length) return formula;
  const out = [...parts];
  for (let i = 0; i < inversion; i++) {
    const first = out.shift()!;
    out.push(first);
  }
  return out.join(', ');
}

// =====================================================================
// PER-TIER INVERSION SETTINGS
// =====================================================================

/**
 * Which inversions the reader wants asked, PER TIER.
 *
 * =====================================================================
 * ONE SETTING FOR EVERYTHING WAS THE WRONG SHAPE.
 *
 * Triads and sevenths are not at the same stage for the same reader.
 * Root-position triads while the sevenths run through all four
 * inversions is a real and common place to be, and a single list could
 * not express it — turning the third inversion on for the sevenths
 * turned it on for chords that do not have one, and turning everything
 * off to steady the triads took the sevenths' inversions away too.
 *
 * So the setting is keyed by tier, and only the tiers that are
 * inversion-trained at all appear in it.
 * =====================================================================
 *
 * IT IS STILL A PREFERENCE, AND PREFERENCES DO NOT REACH DENOMINATORS.
 * `reachableInversions` above is the structural answer and knows
 * nothing about this type; the coverage total is built from that and
 * must stay built from that. What moves with this setting is the strip
 * count — what you are about to drill — and nothing else. See the
 * header on `reachableInversions`.
 */
export type InversionSettings = Readonly<Record<string, readonly Inversion[]>>;

/** Every trained tier at the shipped default. */
export const DEFAULT_INVERSION_SETTINGS: InversionSettings = Object.freeze(
  Object.fromEntries(
    [...INVERSION_TRAINED_TIERS].map(tier => [tier, DEFAULT_INVERSION_POSITIONS]),
  ),
);

/**
 * What this tier is set to.
 *
 * An untrained tier answers root-only rather than the default: it has
 * no inversion training to configure, and handing back four positions
 * would invite a caller to serve inversions the ladder never asks for.
 */
export function positionsForTier(
  settings: InversionSettings,
  tier: string,
): readonly Inversion[] {
  if (!INVERSION_TRAINED_TIERS.has(tier)) return [0];
  const stored = settings[tier];
  return stored === undefined || stored.length === 0
    ? DEFAULT_INVERSION_POSITIONS
    : stored;
}

/** Drop anything not an inversion, dedupe, order. Empty clamps to root
 *  — a tier set to nothing would serve nothing at all. */
export function sanitizePositions(raw: unknown): Inversion[] {
  const list = Array.isArray(raw) ? raw : [];
  const clean = [...new Set(list)]
    .filter((n): n is Inversion => n === 0 || n === 1 || n === 2 || n === 3)
    .sort((a, b) => a - b);
  return clean.length > 0 ? clean : [0];
}

/**
 * Read a stored value back, whatever shape it is in.
 *
 * ACCEPTS THE OLD ARRAY. The preference used to be one list for every
 * tier, and a reader upgrading has that stored. Applying it to both
 * tiers is the honest migration: it is exactly what the app was doing
 * with that value the moment before.
 */
export function sanitizeInversionSettings(raw: unknown): InversionSettings {
  const tiers = [...INVERSION_TRAINED_TIERS];
  if (Array.isArray(raw)) {
    const shared = sanitizePositions(raw);
    return Object.fromEntries(tiers.map(tier => [tier, shared]));
  }
  if (raw !== null && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    return Object.fromEntries(tiers.map(tier => [
      tier,
      tier in record
        ? sanitizePositions(record[tier])
        : DEFAULT_INVERSION_POSITIONS,
    ]));
  }
  return DEFAULT_INVERSION_SETTINGS;
}
