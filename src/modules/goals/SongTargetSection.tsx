import { useMemo, type ReactNode } from 'react';
import type { Song, SongKey, SongMatrixSection } from '../../lib/db';
import type { computeSongLevelState } from '../repertoire/matrix/songLevelState';
import {
  CROSS_KEY_PERCENT_MAX,
  CROSS_KEY_PERCENT_MIN,
  CROSS_KEY_PERCENT_STEP,
  MAJOR_KEYS,
  deriveWholeOptionTagsFromMatrix,
  isSolidLockedFromMatrix,
  previewSongTarget,
  type KeyStateHint,
  type SongGranularity,
  type SongTargetSelection,
  type SongWholeOption,
} from './songTarget';
import Field from './Field';
import { inputClass } from './formStyles';

/**
 * Granularity-aware song target picker. Renders the granularity
 * selector (Whole / Section / Key), the per-granularity sub-pickers,
 * and inline state hints (lapsed key, already-at-target, etc.).
 *
 * Extracted from GoalFormModal in Phase 1.6 build step 3 so the new
 * GoalCreationFlow can reuse it without duplication. Behavior is
 * identical to the previous in-file definition; only the location
 * has changed.
 */
export default function SongTargetSection({
  song,
  songMissing,
  selection,
  onChange,
  sectionAvailable,
  sectionWeeklyEligible,
  songLevelState,
  originalMatrixKey,
  visibleMatrixSections,
  keyStateHints,
  now,
}: {
  song: Song | undefined;
  songMissing: boolean;
  selection: SongTargetSelection;
  onChange: (next: SongTargetSelection) => void;
  sectionAvailable: boolean;
  sectionWeeklyEligible: boolean;
  songLevelState: ReturnType<typeof computeSongLevelState> | null;
  originalMatrixKey: SongKey | null;
  visibleMatrixSections: ReadonlyArray<SongMatrixSection>;
  keyStateHints: ReadonlyMap<string, KeyStateHint>;
  now: number;
}) {
  // Whole-song option tags derived from matrix data — replaces the
  // legacy RepertoireStage approximation.
  const wholeTags = useMemo(
    () => songLevelState
      ? deriveWholeOptionTagsFromMatrix(songLevelState.state, originalMatrixKey, now)
      : { solid: null, crossKey: null, internalized: 'stretch' as const },
    [songLevelState, originalMatrixKey, now],
  );
  const solidLocked = isSolidLockedFromMatrix(originalMatrixKey, now);
  const originalKeyIsLapsed = originalMatrixKey !== null
    && originalMatrixKey.keyState === 'solid'
    && wholeTags.solid === 'current'; // matrix helper assigns 'current' to lapsed-solid

  if (songMissing) {
    return (
      <div className="rounded-md border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
        The selected song couldn't be loaded. Try removing it from related items and re-adding it.
      </div>
    );
  }

  const setGranularity = (g: SongGranularity) => {
    if (g === selection.granularity) return;
    // Reset target picks when granularity changes so the user
    // re-confirms intent. Keys roll over (no need to retype).
    onChange({ ...selection, granularity: g, wholeOption: null });
  };

  const setWholeOption = (opt: SongWholeOption) => {
    onChange({ ...selection, wholeOption: opt });
  };

  // Soft warning for cross-key % when the user picks a value below
  // the song's current cross-key %. Honest, not blocking — user can
  // still save (e.g., they may want to re-stamp or split a goal).
  const currentCrossKeyPercent = songLevelState?.crossKeyPercent ?? 0;
  const crossKeyAlreadyAt = selection.granularity === 'whole'
    && selection.wholeOption === 'cross_key'
    && currentCrossKeyPercent >= selection.crossKeyPercent;

  return (
    <div className="flex flex-col gap-3">
      <Field label="Goal granularity">
        <div className="flex gap-1.5" role="tablist" aria-label="Song goal granularity">
          <GranularityButton
            label="Whole song"
            active={selection.granularity === 'whole'}
            onClick={() => setGranularity('whole')}
          />
          <GranularityButton
            label="Song section"
            active={selection.granularity === 'section'}
            disabled={!sectionAvailable || !sectionWeeklyEligible}
            tooltip={
              !sectionAvailable
                ? 'Set up sections in the matrix view first'
                : !sectionWeeklyEligible
                  ? 'Only available for weekly goals'
                  : undefined
            }
            onClick={() => setGranularity('section')}
          />
          <GranularityButton
            label="Key"
            active={selection.granularity === 'key'}
            onClick={() => setGranularity('key')}
          />
        </div>
      </Field>

      {selection.granularity === 'whole' && (
        <div className="flex flex-col gap-2">
          <WholeTargetRow
            title="Solid in original key"
            hint={`Prove the whole song end-to-end in ${song?.key ?? 'the original key'}`}
            tag={wholeTags.solid}
            selected={selection.wholeOption === 'solid'}
            disabled={solidLocked}
            note={originalKeyIsLapsed
              ? `${song?.key ?? 'Original key'} is currently lapsed — pass a retest to clear.`
              : undefined}
            onSelect={() => setWholeOption('solid')}
          />

          <WholeTargetRow
            title="Cross-key %"
            hint="Reach a target % of sections comfortable across non-original keys"
            tag={wholeTags.crossKey}
            selected={selection.wholeOption === 'cross_key'}
            onSelect={() => setWholeOption('cross_key')}
          >
            {selection.wholeOption === 'cross_key' && (
              <>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={CROSS_KEY_PERCENT_MIN}
                    max={CROSS_KEY_PERCENT_MAX}
                    step={CROSS_KEY_PERCENT_STEP}
                    value={selection.crossKeyPercent}
                    onChange={e => onChange({
                      ...selection,
                      crossKeyPercent: Number(e.target.value),
                    })}
                    className="flex-1"
                    aria-label="Cross-key percent"
                  />
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200 w-12 text-right">
                    {selection.crossKeyPercent}%
                  </span>
                </div>
                {crossKeyAlreadyAt && (
                  <div className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                    Already at {currentCrossKeyPercent}% cross-key — pick a higher target?
                  </div>
                )}
              </>
            )}
          </WholeTargetRow>

          <WholeTargetRow
            title="Internalized"
            hint="3+ keys at Solid + lived-with gate satisfied"
            tag={wholeTags.internalized}
            selected={selection.wholeOption === 'internalized'}
            onSelect={() => setWholeOption('internalized')}
          />
        </div>
      )}

      {selection.granularity === 'key' && (
        <KeyTarget
          selection={selection}
          onChange={onChange}
          keyStateHints={keyStateHints}
        />
      )}

      {selection.granularity === 'section' && (
        <SectionTarget
          selection={selection}
          onChange={onChange}
          sections={visibleMatrixSections}
          keyStateHints={keyStateHints}
        />
      )}
    </div>
  );
}

function GranularityButton({
  label,
  active,
  disabled,
  tooltip,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  tooltip?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      title={tooltip}
      onClick={disabled ? undefined : onClick}
      className={[
        'px-3 py-1.5 text-sm rounded-md border transition',
        active
          ? 'border-fluent bg-fluent/10 text-fluent'
          : 'border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200',
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-fluent/60',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function WholeTargetRow({
  title,
  hint,
  tag,
  selected,
  disabled,
  note,
  onSelect,
  children,
}: {
  title: string;
  hint: string;
  tag: 'achieved' | 'current' | 'stretch' | null;
  selected: boolean;
  disabled?: boolean;
  /** Optional inline note shown below the hint — used for the
   *  "currently lapsed" disclosure on the Solid row. */
  note?: string;
  onSelect: () => void;
  children?: ReactNode;
}) {
  const interactive = !disabled;
  return (
    <div
      role="button"
      tabIndex={interactive ? 0 : -1}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      onClick={interactive ? onSelect : undefined}
      onKeyDown={interactive ? e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      } : undefined}
      className={[
        'rounded-md border px-3 py-2 transition',
        selected
          ? 'border-fluent bg-fluent/5'
          : 'border-neutral-200 dark:border-neutral-800',
        interactive
          ? 'cursor-pointer hover:border-fluent/60'
          : 'cursor-not-allowed opacity-60',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{title}</span>
        {tag && <StateTag tag={tag} />}
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{hint}</p>
      {note && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">{note}</p>
      )}
      {children}
    </div>
  );
}

function StateTag({ tag }: { tag: 'achieved' | 'current' | 'stretch' }) {
  const styles: Record<typeof tag, string> = {
    achieved: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
    current: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    stretch: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  };
  return (
    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${styles[tag]}`}>
      {tag}
    </span>
  );
}

function KeyTarget({
  selection,
  onChange,
  keyStateHints,
}: {
  selection: SongTargetSelection;
  onChange: (next: SongTargetSelection) => void;
  keyStateHints: ReadonlyMap<string, KeyStateHint>;
}) {
  // Live context for the currently-picked key — surfaces the same
  // info the matrix view shows, so the user doesn't have to round-
  // trip to confirm what state the key is already at.
  const pickedHint = selection.keyTarget
    ? keyStateHints.get(selection.keyTarget) ?? null
    : null;
  // Lapsed targets are allowed (they imply "run the retest") but
  // surfaced inline so the user understands what they're committing
  // to.
  const lapsedNote = pickedHint?.isLapsed && selection.keyState === 'solid'
    ? `${selection.keyTarget} is currently lapsed — pass a retest to clear.`
    : null;
  // Already-at-target check: if the picked state is already met,
  // soft-warn (not blocking — user might want to set a re-confirmation
  // goal). Comfortable is met when state is comfortable or solid;
  // Solid is met only when state === 'solid' (not lapsed).
  const alreadyAt = (() => {
    if (!pickedHint) return false;
    if (selection.keyState === 'comfortable') {
      return pickedHint.state === 'comfortable' || pickedHint.state === 'solid';
    }
    // 'solid'
    return pickedHint.state === 'solid' && !pickedHint.isLapsed;
  })();

  return (
    <div className="rounded-md border border-black/[0.07] px-3 py-3 flex flex-col gap-3">
      <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
        Get a key to a specific state
      </span>
      <Field label="Key">
        <select
          value={selection.keyTarget}
          onChange={e => onChange({ ...selection, keyTarget: e.target.value })}
          className={inputClass()}
        >
          <option value="">Pick a key…</option>
          {MAJOR_KEYS.map(k => {
            const hint = keyStateHints.get(k);
            return (
              <option key={k} value={k}>
                {k}{hint ? ` — ${formatKeyHint(hint)}` : ' — untouched'}
              </option>
            );
          })}
        </select>
      </Field>
      <Field label="State">
        <div className="flex gap-1.5">
          <KeyStateButton
            label="Comfortable"
            active={selection.keyState === 'comfortable'}
            onClick={() => onChange({ ...selection, keyState: 'comfortable' })}
          />
          <KeyStateButton
            label="Solid"
            active={selection.keyState === 'solid'}
            onClick={() => onChange({ ...selection, keyState: 'solid' })}
          />
        </div>
      </Field>
      {lapsedNote && (
        <div className="text-[11px] text-amber-700 dark:text-amber-300">{lapsedNote}</div>
      )}
      {alreadyAt && !lapsedNote && (
        <div className="text-[11px] text-amber-700 dark:text-amber-300">
          {selection.keyTarget} is already at {selection.keyState === 'solid' ? 'Solid' : 'Comfortable'} — pick a different target?
        </div>
      )}
    </div>
  );
}

/**
 * Display string for the key-picker dropdown's per-key context.
 * "Solid · lapsed" / "Solid" / "Comfortable" / "Learning" / "untouched".
 */
function formatKeyHint(hint: KeyStateHint): string {
  if (hint.state === 'solid') return hint.isLapsed ? 'Solid · lapsed' : 'Solid';
  if (hint.state === 'comfortable') return 'Comfortable';
  if (hint.state === 'learning') return 'Learning';
  return 'untouched';
}

function SectionTarget({
  selection,
  onChange,
  sections,
  keyStateHints,
}: {
  selection: SongTargetSelection;
  onChange: (next: SongTargetSelection) => void;
  sections: ReadonlyArray<SongMatrixSection>;
  keyStateHints: ReadonlyMap<string, KeyStateHint>;
}) {
  // Same lapsed/already-at logic as KeyTarget — section goals
  // implicitly act on the picked key, so the same hints apply at
  // the key level. We don't show per-cell state because cells aren't
  // surfaced in this picker (would need cellsBySectionId; out of
  // scope here).
  const pickedHint = selection.keyTarget
    ? keyStateHints.get(selection.keyTarget) ?? null
    : null;
  const lapsedNote = pickedHint?.isLapsed && selection.keyState === 'solid'
    ? `${selection.keyTarget} is currently lapsed — pass a retest to clear.`
    : null;

  return (
    <div className="rounded-md border border-black/[0.07] px-3 py-3 flex flex-col gap-3">
      <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
        Get one section to a specific state
      </span>
      <Field label="Section">
        <select
          value={selection.sectionId}
          onChange={e => onChange({ ...selection, sectionId: e.target.value })}
          className={inputClass()}
        >
          <option value="">Pick a section…</option>
          {sections.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Key">
        <select
          value={selection.keyTarget}
          onChange={e => onChange({ ...selection, keyTarget: e.target.value })}
          className={inputClass()}
        >
          <option value="">Pick a key…</option>
          {MAJOR_KEYS.map(k => {
            const hint = keyStateHints.get(k);
            return (
              <option key={k} value={k}>
                {k}{hint ? ` — ${formatKeyHint(hint)}` : ' — untouched'}
              </option>
            );
          })}
        </select>
      </Field>
      <Field label="State">
        <div className="flex gap-1.5">
          <KeyStateButton
            label="Comfortable"
            active={selection.keyState === 'comfortable'}
            onClick={() => onChange({ ...selection, keyState: 'comfortable' })}
          />
          <KeyStateButton
            label="Solid"
            active={selection.keyState === 'solid'}
            onClick={() => onChange({ ...selection, keyState: 'solid' })}
          />
        </div>
      </Field>
      {lapsedNote && (
        <div className="text-[11px] text-amber-700 dark:text-amber-300">{lapsedNote}</div>
      )}
    </div>
  );
}

function KeyStateButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'px-3 py-1.5 text-sm rounded-md border transition',
        active
          ? 'border-fluent bg-fluent/10 text-fluent'
          : 'border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent/60',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

/**
 * Natural-language preview block — renders "Take Mirror to Solid in
 * C" / "Get the Bridge of Mirror Comfortable in F" from the current
 * selection. Empty-state copy when the selection is incomplete.
 */
export function SongPreview({
  selection,
  song,
  sectionNamesById,
}: {
  selection: SongTargetSelection;
  song: Song;
  sectionNamesById: ReadonlyMap<string, string>;
}) {
  const text = previewSongTarget(selection, {
    title: song.title,
    key: song.key,
    sectionNamesById,
  });
  return (
    <div className="rounded-md border border-fluent/30 bg-fluent/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-fluent mb-0.5">Preview</div>
      <div className="text-sm text-neutral-800 dark:text-neutral-100">
        {text ?? <span className="text-neutral-500 italic">Pick a target above to preview your goal.</span>}
      </div>
    </div>
  );
}
