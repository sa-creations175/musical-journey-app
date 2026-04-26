/**
 * The "set up your sections" callout shown at the top of the
 * matrix when no sections exist yet for the current song. Replaces
 * the disabled placeholder shipped in step 3a.
 *
 * Pure presentation — the parent (SongMatrixView) owns the modal
 * open state and passes a callback. Keeps modal lifecycle in one
 * place and lets the banner stay a simple stateless component.
 */

interface Props {
  onSetUp: () => void;
}

export default function SectionSetupBanner({ onSetUp }: Props) {
  return (
    <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Define your sections to start using the matrix.
        </div>
        <div className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
          Add the parts of the song — verse, chorus, bridge — once and the
          grid fills in as you practice.
        </div>
      </div>
      <button
        type="button"
        onClick={onSetUp}
        className="shrink-0 px-3 py-1.5 text-xs rounded-md bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-amber-950 font-medium"
      >
        Set up sections →
      </button>
    </div>
  );
}
