/**
 * Three-band matrix cell for scales & chord shapes (Left / Right / Both
 * hands). Each (shape × key) cell is split into three equal vertical
 * strips — left band = LH, middle = RH, right = Both — coloured by that
 * hand's acquisition state, using the same three-bucket palette the
 * scale / VL grids already use.
 *
 * Two modes:
 *   · Default (scales) — each band is a single fill coloured by that
 *     hand's stage (3 slots total).
 *   · Split (chord shapes, `split` prop) — each band is divided
 *     horizontally: top half = solid, bottom half = arpeggiated, each
 *     coloured independently by that skill's stage (6 slots total). The
 *     arpeggiated stages come in via the `*Arp` props.
 *
 * Empty state: when NO slot has been drilled (all bands/halves empty),
 * the cell renders as a single plain "not started" square — identical to
 * the pre-hands appearance, no band dividers. As soon as ANY slot has
 * been drilled, all three bands appear; un-drilled slots in that trio
 * show as the plain "not started" colour within their slot.
 *
 * Voice-leading cells do NOT use this — VL is two-handed by nature and
 * keeps its single-fill cell.
 */
import type { AcquisitionBucket } from './acquisition';

/**
 * Per-hand band state.
 *
 * A BUCKET, NOT A STAGE. This file used to hold its own `bucketFor`,
 * one of three copies of the same collapse — and a hand with more than
 * one row (chord shapes are drilled solid AND arpeggiated) cannot be
 * described by a single stage at all. The caller resolves it through
 * `acquisition.ts` and hands over the answer.
 */
export type BandStage = AcquisitionBucket;

/** Background classes per bucket. `not-started` matches the legacy
 *  neutral so a fresh cell looks unchanged. */
const BUCKET_BG: Readonly<Record<AcquisitionBucket, string>> = {
  'acquired':    'bg-mastered/35',
  'in-progress': 'bg-developing/25',
  'not-started': 'bg-neutral-100 dark:bg-neutral-800',
};

const NOT_STARTED_CELL =
  'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border-neutral-300 dark:border-neutral-700';

export interface ThreeBandCellProps {
  /** Solid-style bucket for left / right / both hands. In default
   *  (non-split) mode this is the band's only fill. */
  left: BandStage;
  right: BandStage;
  both: BandStage;
  /** Arpeggiated-style bucket for left / right / both hands. Only read
   *  when `split` is true (chord shapes). */
  leftArp?: BandStage;
  rightArp?: BandStage;
  bothArp?: BandStage;
  /** When true, each band splits top (solid) / bottom (arpeggiated) for
   *  the 6-slot chord-shape display. Omit (or false) for scales — single
   *  fill per band. */
  split?: boolean;
  title: string;
  onClick?: () => void;
}

export default function ThreeBandCell({
  left,
  right,
  both,
  leftArp = 'not-started',
  rightArp = 'not-started',
  bothArp = 'not-started',
  split = false,
  title,
  onClick,
}: ThreeBandCellProps) {
  const base =
    'aspect-square mx-0.5 my-0.5 rounded-sm border border-neutral-300/70 dark:border-neutral-700 ' +
    'overflow-hidden transition focus:outline-none focus:ring-2 focus:ring-fluent/50';

  if (split) {
    // Chord shapes: three bands, each split solid (top) / arpeggiated
    // (bottom) — 6 slots, each coloured independently.
    const bands: Array<{ solid: AcquisitionBucket; arp: AcquisitionBucket }> = [
      { solid: left, arp: leftArp },
      { solid: right, arp: rightArp },
      { solid: both, arp: bothArp },
    ];
    const anyStarted = bands.some(
      b => b.solid !== 'not-started' || b.arp !== 'not-started',
    );
    if (!anyStarted) {
      return (
        <button onClick={onClick} title={title} className={`${base} ${NOT_STARTED_CELL}`} />
      );
    }
    return (
      <button onClick={onClick} title={title} className={`${base} flex`}>
        {bands.map((b, i) => (
          <span key={i} className="flex-1 flex flex-col" aria-hidden>
            <span className={`flex-1 ${BUCKET_BG[b.solid]}`} />
            <span className={`flex-1 ${BUCKET_BG[b.arp]}`} />
          </span>
        ))}
      </button>
    );
  }

  // Scales: three single-fill vertical bands (LH · RH · Both).
  const buckets: AcquisitionBucket[] = [left, right, both];
  const anyStarted = buckets.some(b => b !== 'not-started');

  // No hand drilled yet → single plain square (legacy not-started look).
  if (!anyStarted) {
    return (
      <button onClick={onClick} title={title} className={`${base} ${NOT_STARTED_CELL}`} />
    );
  }

  return (
    <button onClick={onClick} title={title} className={`${base} flex`}>
      {buckets.map((b, i) => (
        <span key={i} className={`flex-1 ${BUCKET_BG[b]}`} aria-hidden />
      ))}
    </button>
  );
}
