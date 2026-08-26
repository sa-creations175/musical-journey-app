/**
 * Which hand to drill, asked before the drill starts.
 *
 * =====================================================================
 * TAPPING A CELL USED TO DROP STRAIGHT INTO LEFT HAND.
 *
 * The modal walks left, then right, then both, and a matrix tap always
 * started at the beginning of that walk. So a reader whose left hand
 * was already solid had to sit through a full left-hand rep — or cancel
 * out of it — before reaching the hand they came for. The walk is still
 * there; it is now one of the four things you can ask for rather than
 * the only one.
 *
 * EACH OPTION SAYS WHERE THAT HAND STANDS, read from the same buckets
 * the cell's own bands are drawn from. That is the whole point of
 * asking: the answer to "which hand should I do" is on the cell already
 * and was only legible as three coloured stripes.
 *
 * "All Three" carries the CELL's state — which is what all three
 * together means, by the module's one acquisition rule. It is not a
 * fourth hand and does not pretend to be.
 *
 * NOT EVERY CELL GETS ONE. Mental visualisation has no hand dimension,
 * and voice leading is two-handed by nature and only ever writes
 * `both` — a chooser there would be a menu with one real option. The
 * caller decides by asking `handsFor`, so the rule about which items
 * have hands stays in one place.
 */
import Modal from '../../components/Modal';
import type { DrillHand } from '../../lib/db';
import { HAND_ORDER, type AcquisitionBucket } from './acquisition';

/** The words each bucket reads as — the matrix legend's own. */
const BUCKET_LABEL: Readonly<Record<AcquisitionBucket, string>> = {
  'acquired': 'acquired',
  'in-progress': 'in progress',
  'not-started': 'not started',
};

const HAND_LABEL: Readonly<Record<DrillHand, string>> = {
  left: 'Left Hand',
  right: 'Right Hand',
  both: 'Both Hands',
};

const ALL_THREE_LABEL = 'All Three';

export interface HandChooserProps {
  /** The cell being opened, for the dialog's title. */
  title: string;
  /** Where each hand stands — the buckets the cell's bands draw. */
  hands: Readonly<Record<DrillHand, AcquisitionBucket>>;
  /** The cell as a whole, shown under "All Three". */
  cell: AcquisitionBucket;
  /** The hands to drill, in the order they will run. */
  onChoose: (hands: readonly DrillHand[]) => void;
  onClose: () => void;
}

export default function HandChooser({
  title, hands, cell, onChoose, onClose,
}: HandChooserProps) {
  return (
    <Modal open onClose={onClose} title={title} ariaLabel={title}>
      <div className="grid grid-cols-2 gap-2" data-testid="hand-chooser">
        {HAND_ORDER.map(hand => (
          <Option
            key={hand}
            testId={`hand-choice-${hand}`}
            label={HAND_LABEL[hand]}
            bucket={hands[hand]}
            onClick={() => onChoose([hand])}
          />
        ))}
        <Option
          testId="hand-choice-all"
          label={ALL_THREE_LABEL}
          bucket={cell}
          onClick={() => onChoose(HAND_ORDER)}
        />
      </div>
    </Modal>
  );
}

const BUCKET_TONE: Readonly<Record<AcquisitionBucket, string>> = {
  'acquired': 'text-mastered',
  'in-progress': 'text-developing',
  'not-started': 'text-neutral-400',
};

function Option({
  testId, label, bucket, onClick,
}: {
  testId: string;
  label: string;
  bucket: AcquisitionBucket;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-bucket={bucket}
      onClick={onClick}
      className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2.5 text-left hover:border-fluent hover:text-fluent transition"
    >
      <span className="block text-sm font-medium">{label}</span>
      <span className={`block text-[11px] ${BUCKET_TONE[bucket]}`}>
        {BUCKET_LABEL[bucket]}
      </span>
    </button>
  );
}
