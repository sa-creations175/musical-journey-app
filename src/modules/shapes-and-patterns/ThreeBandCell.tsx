/**
 * Three-band matrix cell for scales & chord shapes (Left / Right / Both
 * hands). Each (shape × key) cell is split into three equal vertical
 * strips — left band = LH, middle = RH, right = Both — coloured by that
 * hand's acquisition state, using the same three-bucket palette the
 * scale / VL grids already use.
 *
 * Empty state: when NO hand has been drilled (all three bands empty),
 * the cell renders as a single plain "not started" square — identical to
 * the pre-hands appearance, no band dividers. As soon as ANY hand has
 * been drilled, all three bands appear; un-drilled hands in that trio
 * show as the plain "not started" colour within their slot.
 *
 * Voice-leading cells do NOT use this — VL is two-handed by nature and
 * keeps its single-fill cell.
 */
import type { AcquisitionStage } from '../../lib/db';

/** Per-hand band state. `null` = that hand has no spacing row yet
 *  (not drilled). */
export type BandStage = AcquisitionStage | null;

/** Collapse the spacing ladder into the three-bucket palette. Mirrors
 *  ScaleDrills.bucketFor: acquired+ (consolidated, mastered) all read as
 *  "acquired"; a missing row reads as "not started". */
type Bucket = 'empty' | 'acquiring' | 'acquired';

function bucketFor(stage: BandStage): Bucket {
  if (stage === 'acquired' || stage === 'consolidated' || stage === 'mastered') {
    return 'acquired';
  }
  if (stage === 'acquiring') return 'acquiring';
  return 'empty';
}

/** Background classes per bucket. `empty` matches the legacy
 *  not-started neutral so a fresh cell looks unchanged. */
const BUCKET_BG: Readonly<Record<Bucket, string>> = {
  acquired:  'bg-mastered/35',
  acquiring: 'bg-developing/25',
  empty:     'bg-neutral-100 dark:bg-neutral-800',
};

const NOT_STARTED_CELL =
  'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border-neutral-300 dark:border-neutral-700';

export interface ThreeBandCellProps {
  /** Stage for left / right / both hands; null when un-drilled. */
  left: BandStage;
  right: BandStage;
  both: BandStage;
  title: string;
  onClick?: () => void;
}

export default function ThreeBandCell({ left, right, both, title, onClick }: ThreeBandCellProps) {
  const buckets: Bucket[] = [bucketFor(left), bucketFor(right), bucketFor(both)];
  const anyStarted = buckets.some(b => b !== 'empty');

  const base =
    'aspect-square mx-0.5 my-0.5 rounded-sm border border-neutral-300/70 dark:border-neutral-700 ' +
    'overflow-hidden transition focus:outline-none focus:ring-2 focus:ring-fluent/50';

  // No hand drilled yet → single plain square (legacy not-started look).
  if (!anyStarted) {
    return (
      <button onClick={onClick} title={title} className={`${base} ${NOT_STARTED_CELL}`} />
    );
  }

  // At least one hand started → three vertical bands (LH · RH · Both).
  return (
    <button onClick={onClick} title={title} className={`${base} flex`}>
      {buckets.map((b, i) => (
        <span key={i} className={`flex-1 ${BUCKET_BG[b]}`} aria-hidden />
      ))}
    </button>
  );
}
