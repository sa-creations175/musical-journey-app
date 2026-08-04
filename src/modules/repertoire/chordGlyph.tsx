import type { ReactNode } from 'react';

/**
 * Split a chord display string on the first `/` so the caller can
 * style numerator and bass differently. Returns `bass: null` when
 * the input has no slash — i.e. a root-position chord.
 *
 * The rule is purely visual ("first slash"), not music-theoretic.
 * Extension tokens that happen to contain a slash (e.g. "6/9") are
 * treated as slash chords for rendering purposes. Users picking
 * extensions from the suffix palette accept this consequence.
 *
 * Leading slash (e.g. "/3") returns an empty numerator + the
 * remainder as bass. Trailing slash (e.g. "5/") returns the
 * numerator + empty bass. Both edge cases render sensibly via
 * `ChordGlyph` (which omits empty parts).
 */
export function splitSlashChord(text: string): { numerator: string; bass: string | null } {
  const slashIdx = text.indexOf('/');
  if (slashIdx < 0) return { numerator: text, bass: null };
  return {
    numerator: text.slice(0, slashIdx),
    bass: text.slice(slashIdx + 1),
  };
}

/**
 * Split a chord part (numerator or bass — i.e. a string that does
 * NOT contain a slash) into a root + suffix so the renderer can
 * size them differently. The root is the leading run of digits in
 * 1–7; everything after is the suffix.
 *
 *   "6m"       → { root: "6",  suffix: "m" }
 *   "4maj7"    → { root: "4",  suffix: "maj7" }
 *   "3(#9#5)"  → { root: "3",  suffix: "(#9#5)" }
 *   "11add9"   → { root: "11", suffix: "add9" }
 *
 * When the part doesn't start with a 1–7 digit, root is the entire
 * input and suffix is empty. This is how non-numbers notation
 * modes (Roman "Vmaj7", concrete "Gmaj7") render: the whole part
 * gets the root treatment, no sub-hierarchy.
 *
 *   "Vmaj7"    → { root: "Vmaj7", suffix: "" }
 *   "Gmaj7"    → { root: "Gmaj7", suffix: "" }
 *   ""         → { root: "",      suffix: "" }
 */
export function splitRootSuffix(text: string): { root: string; suffix: string } {
  const match = text.match(/^([1-7]+)(.*)$/);
  if (!match) return { root: text, suffix: '' };
  return { root: match[1], suffix: match[2] };
}

interface Props {
  /** The rendered chord text (e.g. "5", "6m", "5/7", "1maj7/3"). */
  text: string;
  /** Fill + text color for the ROOT PILL on a slash chord. When omitted
   *  the numerator (and the slash) render in the default muted neutral.
   *
   *  Why a pill rather than just a text color: the cell fill follows the
   *  BASS degree (see `chordPalette`), so coloring only the numerator's
   *  text puts two dark 700-level colors side by side on one pale fill.
   *  For hue-neighbour families that is unreadable — amber-700 root text
   *  on a red cell ("5maj/7") does not separate from the red-700 bass
   *  text. Boxing the root in its own family's fill swaps a
   *  dark-text-vs-dark-text comparison for a fill-vs-fill one, and the
   *  pill's bounded shape carries most of the signal on its own.
   *
   *  `border` draws a 1px ring inside the pill. The fills alone weren't
   *  always enough — both are 50-level pastels, so amber-50 on red-50
   *  ("5maj/7") still didn't register. The ring makes the boundary
   *  unambiguous regardless of how close the two fills are.
   *
   *  Passing a value also un-mutes the slash separator so "/7" reads in
   *  the bass family's color on the cell fill.
   *
   *  Ignored for root-position chords — they have no numerator. */
  numeratorPill?: { bg: string; text: string; border: string };
}

/** Default numerator + separator treatment: muted, so the bass note
 *  reads as the dominant anchor. Used whenever no explicit numerator
 *  color is supplied. */
const MUTED = 'text-neutral-400 dark:text-neutral-500';

/**
 * Render a chord glyph with slash-chord + root/suffix visual
 * hierarchy. Two-axis sizing:
 *
 *   axis 1 — slash chord: numerator and slash render at 85% size
 *     in muted neutral-400 so the bass note (denominator) reads as
 *     the dominant visual anchor.
 *
 *   axis 2 — root vs suffix: within each part (numerator or
 *     bass), the leading 1–7 digit(s) render bold/full-size and
 *     the suffix renders at 85% / normal weight. This applies to
 *     both root-position chords (the whole input is "the bass")
 *     and to the bass note of a slash chord.
 *
 * Combined effect:
 *   "6m"       → 6 bold full size, m smaller normal weight
 *   "4maj7"    → 4 bold full size, maj7 smaller normal weight
 *   "5/7"      → 5 smaller lighter, / muted, 7 bold full size
 *   "5maj7/3"  → 5 smaller lighter, maj7 even smaller lighter,
 *                / muted, 3 bold full size
 *
 * "Even smaller" comes for free: the numerator wrapper applies
 * text-[85%], and the suffix span inside applies text-[85%] again
 * (CSS nests percentages, so it ends at ~72% of base).
 *
 * Non-numbers modes (Roman "Vmaj7", concrete "Gmaj7") have no
 * leading 1–7 digit, so splitRootSuffix returns the whole part as
 * the root — they render as a single bold glyph with no
 * sub-hierarchy. Acceptable since the spec focused on numbers.
 */
export default function ChordGlyph({ text, numeratorPill }: Props): ReactNode {
  if (text === '') return null;
  const { numerator, bass } = splitSlashChord(text);
  if (bass === null) {
    // Root-position chords have no numerator — the pill never applies.
    return (
      <span className="inline-flex items-baseline">
        <ChordPart text={text} bassPosition />
      </span>
    );
  }
  // A pill also un-mutes the separator, so "/7" takes the surrounding
  // (bass-family) text color instead of neutral.
  const mutedClass = numeratorPill ? '' : MUTED;
  return (
    <span className="inline-flex items-baseline">
      {numerator !== '' && (
        <span
          // Horizontal padding only (4px total) and a 2px radius: the bar
          // grid gets tight at 4 chords/bar on a phone, and vertical
          // padding would change the line box and shift the cell's
          // flex-col layout. Overflow is clipped by the label wrapper's
          // existing `truncate`, so a too-narrow cell degrades exactly
          // the way it does today.
          className={`text-[85%] inline-flex items-baseline ${
            numeratorPill ? 'rounded-sm px-0.5' : mutedClass
          }`}
          style={
            numeratorPill
              ? {
                  backgroundColor: numeratorPill.bg,
                  color: numeratorPill.text,
                  // An inset box-shadow rather than a real border: an
                  // inline-flex box's border DOES grow the line box, which
                  // would shift the cell's flex-col layout. This paints a
                  // 1px ring inside the pill, follows the border radius,
                  // and costs zero layout.
                  boxShadow: `inset 0 0 0 1px ${numeratorPill.border}`,
                }
              : undefined
          }
        >
          <ChordPart text={numerator} />
        </span>
      )}
      <span className={`text-[85%] ${mutedClass}`}>/</span>
      {bass !== '' && <ChordPart text={bass} bassPosition />}
    </span>
  );
}

/**
 * One part of a chord glyph — either the numerator of a slash chord
 * or the bass (which is also "the whole thing" for a root-position
 * chord). When `bassPosition` is true, the root renders bold; the
 * suffix renders at 85% normal weight. When false (numerator), the
 * root inherits the wrapper's muted styling and the suffix nests a
 * second 85% to render even smaller.
 */
function ChordPart({ text, bassPosition }: { text: string; bassPosition?: boolean }) {
  if (text === '') return null;
  const { root, suffix } = splitRootSuffix(text);
  return (
    <>
      {root !== '' && (
        <span className={bassPosition ? 'font-semibold' : undefined}>{root}</span>
      )}
      {suffix !== '' && <span className="text-[85%]">{suffix}</span>}
    </>
  );
}
