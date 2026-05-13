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

interface Props {
  /** The rendered chord text (e.g. "5", "6m", "5/7", "1maj7/3"). */
  text: string;
}

/**
 * Render a chord glyph with slash-chord visual hierarchy.
 *
 *   · root-position chord (no slash): unchanged — the parent's
 *     class controls size, weight, and color.
 *   · slash chord: numerator + `/` render at ~85% size in muted
 *     neutral-400. Denominator renders at parent size with
 *     `font-semibold`, inheriting the parent's color so a filled
 *     chord stays in `text-fluent`, an unparsed chord stays in
 *     `text-developing`, etc.
 *
 * The effect: the bass note pops as the dominant visual anchor,
 * which is what the user is tracking when reading the bass line.
 */
export default function ChordGlyph({ text }: Props): ReactNode {
  if (text === '') return null;
  const { numerator, bass } = splitSlashChord(text);
  if (bass === null) return <>{text}</>;
  return (
    <span className="inline-flex items-baseline">
      {numerator !== '' && (
        <span className="text-[85%] text-neutral-400 dark:text-neutral-500">
          {numerator}
        </span>
      )}
      <span className="text-[85%] text-neutral-400 dark:text-neutral-500">/</span>
      {bass !== '' && (
        <span className="font-semibold">{bass}</span>
      )}
    </span>
  );
}
