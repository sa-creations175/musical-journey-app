import KeyQuadrantRows from './KeyQuadrantRows';
import { rootLabel } from './lydianChords';
import { groundedLine, type Direction, type IntervalQuality } from './scaleDegreeQuality';

/**
 * "In C that's D down to F♯" — the abstract question, in four real keys.
 *
 * ---------------------------------------------------------------
 * "IN ANY MAJOR KEY" IS THE POINT AND ALSO THE PROBLEM.
 *
 * A degree card has to be key-agnostic or it is a note card. But a
 * reader who has only ever seen "2 down a minor 6th = ♯4" has never
 * had to spell it, and ♯4 is exactly the answer that falls apart when
 * you do: in C it is F♯, and a pitch table asked for the same sound
 * hands back G♭ — a lowered 5th, a different degree, a different
 * answer.
 *
 * So the footer grounds it, in four keys at once rather than one, so
 * the key stays a variable rather than becoming the example.
 *
 * The rows are `KeyQuadrantRows`, the same component the Lydian cards
 * use. Different content, one key picker.
 * ---------------------------------------------------------------
 */
export default function DegreeGroundedRows({
  startDegree, quality, direction,
}: {
  startDegree: number;
  quality: IntervalQuality;
  direction: Direction;
}) {
  return (
    <KeyQuadrantRows
      caption={`${startDegree} ${direction} ${quality.label} · tap a key to hear it in another`}
      renderRow={(root, active) => (
        <GroundedNotes
          root={root}
          active={active}
          startDegree={startDegree}
          quality={quality}
          direction={direction}
        />
      )}
    />
  );
}

function GroundedNotes({
  root, active, startDegree, quality, direction,
}: {
  root: string;
  active: boolean;
  startDegree: number;
  quality: IntervalQuality;
  direction: Direction;
}) {
  const line = groundedLine(root, startDegree, quality, direction);
  if (line === null) {
    // Cannot happen for any of the 168 — asserted in the test — but a
    // missing row beats a row rendering "undefined" if a caller ever
    // passes something the speller cannot reach.
    return null;
  }
  return (
    <span className="font-mono text-[11px] flex items-baseline gap-1 flex-wrap">
      <span className="text-neutral-500">In {rootLabel(root)} that&rsquo;s</span>
      <Note label={line.startNote} marked={false} />
      <span className="text-neutral-500">{direction} to</span>
      <Note label={line.endNote} marked={active} />
    </span>
  );
}

/**
 * One note, with its playable name bolded when it has one.
 *
 * THE BOLD IS THE FOURTH PARENTHETICAL RULE, and it is not styling.
 * B𝄫 (**A**) marks a spelling that cannot be played as written — the
 * parenthetical is the instruction, not a footnote, because there is
 * no B-double-flat key to find. E♯ (F) and C♭ (B) are notes a reader
 * could reason their way to; this one they cannot. See
 * `scaleDegreeQuality.ts`, where all four conventions are set out
 * together.
 */
function Note({ label, marked }: { label: string; marked: boolean }) {
  const match = /^(.+?) \((\*\*)?(.+?)(\*\*)?\)$/.exec(label);
  const body = match === null ? label : match[1];
  const playable = match === null ? null : match[3];
  const bold = match !== null && match[2] === '**';
  return (
    <span className={marked ? 'text-[#E24B4A] font-medium' : 'text-neutral-700 dark:text-neutral-200'}>
      {body}
      {playable !== null && (
        <span className={bold ? 'text-neutral-600 dark:text-neutral-300' : 'text-neutral-400'}>
          {' ('}
          <span className={bold ? 'font-bold' : undefined}>{playable}</span>
          {')'}
        </span>
      )}
    </span>
  );
}
