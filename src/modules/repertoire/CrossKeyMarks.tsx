/**
 * What Cross-key adds to Comfortable: four marks, one per quadrant.
 *
 * =====================================================================
 * NOT A SIXTH COLOUR, BECAUSE IT IS NOT A DIFFERENT QUALITY.
 *
 * Cross-key is Comfortable in more keys — green in four quadrants of
 * the circle rather than one. A deeper green was considered and
 * rejected: a new colour would say the song had reached a different
 * KIND of standing, when what changed is how many keys it holds it in.
 *
 * So the badge keeps Comfortable's green and carries the count. The
 * marks say what earned the rung; the colour says what the rung is.
 *
 * =====================================================================
 * A MARK, NOT A STRING.
 *
 * There is no label beside these and none is approved. The badge next
 * to them already reads "Cross-key", and four dots under one word do
 * not need a second word explaining that there are four of them.
 * `aria-hidden` for the same reason: a screen reader gets the rung's
 * name, which is the fact — the marks are how it is drawn.
 * =====================================================================
 */
import { CROSS_KEY_MARKS, stageCarriesMarks } from './stage';
import type { RepertoireStage } from '../../lib/db';

export interface CrossKeyMarksProps {
  stage: RepertoireStage;
}

/**
 * Renders nothing for every rung but Cross-key.
 *
 * THE QUESTION IS ASKED HERE, not at the three badges. They differ in
 * type scale and in what else sits in the pill; none of them should
 * carry a rule about which rung gets marks.
 */
export default function CrossKeyMarks({ stage }: CrossKeyMarksProps) {
  if (!stageCarriesMarks(stage)) return null;
  return (
    <span
      aria-hidden
      data-testid="cross-key-marks"
      data-marks={CROSS_KEY_MARKS}
      className="inline-flex items-center gap-[2px] ml-0.5 align-middle"
    >
      {Array.from({ length: CROSS_KEY_MARKS }, (_, i) => (
        <span
          key={i}
          // `currentColor`, so the marks are the badge's own word
          // colour whatever size or theme the badge is drawn at —
          // and so this file names no colour of its own.
          className="inline-block w-[3px] h-[3px] rounded-full bg-current"
        />
      ))}
    </span>
  );
}
