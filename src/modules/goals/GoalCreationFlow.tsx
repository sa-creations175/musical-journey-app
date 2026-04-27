import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from '../../components/Modal';
import {
  db,
  type Goal,
  type GoalScope,
  type Song,
  type SongCell,
  type SongKey,
  type SongMatrixSection,
} from '../../lib/db';
import { moduleMetaById, PRACTICE_SESSIONS_META } from '../../lib/moduleMeta';
import { computeSongLevelState } from '../repertoire/matrix/songLevelState';
import {
  CROSS_KEY_PERCENT_DEFAULT,
  buildKeyStateHints,
  type KeyStateHint,
  type SongTargetSelection,
} from './songTarget';
import SongTargetSection, { SongPreview } from './SongTargetSection';
import { inputClass } from './formStyles';

/**
 * Phase 1.6 — guided 5-step goal creation flow. Replaces
 * `GoalFormModal` once all build steps land.
 *
 * Built so far:
 *   Step 1 — module cards
 *   Step 2 — Song Repertoire target surface (this commit)
 *   Shell — navigation, 5-dot indicator, back/next
 *
 * Still to land: Step 2 for the other five modules (build steps 4–8),
 * scope cards (step 9), parent goal picker (step 10), save logic
 * (step 11), multi-target encoding (step 13), edit mode (step 14),
 * entry-point swap (step 15).
 *
 * See docs/GOAL_MODAL_REDESIGN.md for the full spec.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, opens in edit mode pre-filled from this goal. Edit
   *  flow will drop the user into the relevant step rather than
   *  starting at Step 1 — wired in step 14. */
  initialGoal?: Goal | null;
  /** When set (and `initialGoal` is null), opens in new-goal mode
   *  with this scope pre-filled. Consumed by Step 3 in step 9. */
  initialScope?: GoalScope | null;
}

// ---- Steps ---------------------------------------------------------

interface StepDef {
  id: '1' | '2' | '3' | '3.5' | '4';
  label: string;
  title: string;
}

const STEPS: StepDef[] = [
  { id: '1',   label: 'Step 1',   title: 'What do you want to work on?' },
  { id: '2',   label: 'Step 2',   title: 'What does success look like?' },
  { id: '3',   label: 'Step 3',   title: 'When do you want to achieve this?' },
  { id: '3.5', label: 'Step 3.5', title: 'Does this goal roll up into a bigger one?' },
  { id: '4',   label: 'Step 4',   title: 'Review and save' },
];

// ---- Module cards (Step 1) -----------------------------------------

/**
 * Goal-flow card identifiers. Five map onto existing `ModuleId`s
 * from moduleMeta (`harmonic-fluency`, `ear-training`,
 * `shapes-and-patterns`, `repertoire`, `production`); the sixth
 * — `practice-consistency` — is a goal-flow concept that doesn't
 * correspond to a learning module in the registry. Defined locally
 * because this is the only consumer; promote to a shared module
 * if a second surface needs it.
 */
type ModuleCardId =
  | 'ear-training'
  | 'harmonic-fluency'
  | 'repertoire'
  | 'shapes-and-patterns'
  | 'production'
  | 'practice-consistency';

interface ModuleCard {
  id: ModuleCardId;
  name: string;
  description: string;
  example: string;
}

/**
 * Canonical accent per card. Five values resolve through
 * `moduleMetaById` so the goal flow stays in lockstep with sidebar /
 * dashboard / catalogue if a hex is ever retuned. `practice-consistency`
 * has no entry in the module registry — it borrows
 * `PRACTICE_SESSIONS_META`'s teal because consistency goals are
 * fulfilled by Practice Sessions.
 */
function accentHexForCard(id: ModuleCardId): string {
  if (id === 'practice-consistency') return PRACTICE_SESSIONS_META.accentHex;
  return moduleMetaById(id)?.accentHex ?? '#9ca3af';
}

// Order matches the spec's Step 1 table verbatim.
const MODULE_CARDS: ModuleCard[] = [
  {
    id: 'ear-training',
    name: 'Ear Training',
    description: 'Sharpen how you hear chords, intervals, and progressions',
    example: 'I want to improve my chord recognition accuracy to 80%',
  },
  {
    id: 'harmonic-fluency',
    name: 'Harmonic Fluency',
    description: 'Build speed and confidence reading and recognizing the starting and landing points of chords within a key',
    example: 'I want to reach 75% accuracy on chord motion math in all 12 keys',
  },
  {
    id: 'repertoire',
    name: 'Song Repertoire',
    description: 'Grow and deepen your playable song library',
    example: 'I want to get Mirror Solid in the original key',
  },
  {
    id: 'shapes-and-patterns',
    name: 'Shapes & Patterns',
    description: 'Internalize scales, chords, inversions, and patterns across the keyboard',
    example: 'I want to reach Comfortable proficiency level on major 7th inversions in 6 keys',
  },
  {
    id: 'production',
    name: 'Production',
    description: 'Expand your music production knowledge and workflow',
    example: 'I want to complete 4 new production lessons this month including the Sound Design lesson path',
  },
  {
    id: 'practice-consistency',
    name: 'Practice consistency',
    description: 'Build the habit of showing up regularly',
    example: 'I want to practice at least 4 days a week this month',
  },
];

// ---- Draft state ---------------------------------------------------

/**
 * Cumulative answers across the flow. Grows step-by-step.
 *
 * `songId` and `songTarget` are populated only when `moduleId === 'repertoire'`.
 * For other modules they remain at their defaults — module-specific
 * draft fields will be added per-module as their Step 2 surfaces land
 * in build steps 4–8.
 */
interface Draft {
  moduleId: ModuleCardId | null;
  songId: string | null;
  songTarget: SongTargetSelection;
}

/**
 * Mirrors `defaultSongTarget` in GoalFormModal. Duplicated rather
 * than shared because the duplication resolves when GoalFormModal
 * goes away in build step 15.
 */
function defaultSongTarget(): SongTargetSelection {
  return {
    granularity: 'whole',
    wholeOption: null,
    crossKeyPercent: CROSS_KEY_PERCENT_DEFAULT,
    keyTarget: '',
    keyState: 'comfortable',
    sectionId: '',
  };
}

const EMPTY_DRAFT: Draft = {
  moduleId: null,
  songId: null,
  songTarget: defaultSongTarget(),
};

// ---- Per-step validity ---------------------------------------------

function isCurrentStepValid(stepId: StepDef['id'], draft: Draft): boolean {
  switch (stepId) {
    case '1':
      return draft.moduleId !== null;
    case '2':
      return isStep2Valid(draft);
    // TODO: real gates land in steps 9 / 10 alongside each step's UI.
    case '3':
    case '3.5':
    case '4':
    default:
      return true;
  }
}

function isStep2Valid(draft: Draft): boolean {
  // TODO: Step 2 validity for the other five modules lands with their
  // UI in build steps 4–8. Until then, only Song Repertoire enforces.
  if (draft.moduleId !== 'repertoire') return true;
  if (!draft.songId) return false;
  const t = draft.songTarget;
  if (t.granularity === 'whole') return t.wholeOption !== null;
  if (t.granularity === 'key') return t.keyTarget !== '';
  if (t.granularity === 'section') return t.sectionId !== '' && t.keyTarget !== '';
  return false;
}

// ---- Component -----------------------------------------------------

export default function GoalCreationFlow({ open, onClose }: Props) {
  // `initialGoal` and `initialScope` are declared on Props so
  // consumers can pass them today, but not yet read here. Wired in
  // step 9 (scope pre-fill) and step 14 (edit-mode landing step).
  // TODO (step 11): reset stepIndex AND draft when the modal is
  // closed externally — Esc, backdrop click, or the X button.
  // Currently re-opening lands on whatever step the user was on at
  // close, with whatever they had selected. Revisit when the rest
  // of draft state lands.
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const canAdvance = isCurrentStepValid(step.id, draft);

  const goBack = () => {
    if (isFirst) onClose();
    else setStepIndex(i => Math.max(0, i - 1));
  };

  const goNext = () => {
    if (!canAdvance) return;
    if (isLast) {
      // TODO: real save in step 11. Shell just dismisses.
      onClose();
      setStepIndex(0);
      setDraft(EMPTY_DRAFT);
    } else {
      setStepIndex(i => Math.min(STEPS.length - 1, i + 1));
    }
  };

  const selectModule = (id: ModuleCardId) => {
    setDraft(d => {
      // No-op when re-selecting the same module — preserves any
      // module-specific selections the user has already made.
      if (d.moduleId === id) return d;
      return {
        ...d,
        moduleId: id,
        // Switching modules invalidates module-specific state.
        songId: null,
        songTarget: defaultSongTarget(),
      };
    });
  };

  const updateDraft = (patch: Partial<Draft>) => {
    setDraft(d => ({ ...d, ...patch }));
  };

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={goBack}
        className="px-4 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        Back
      </button>
      <StepDots currentIndex={stepIndex} total={STEPS.length} />
      <button
        type="button"
        onClick={goNext}
        disabled={!canAdvance}
        className="px-4 py-2 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isLast ? 'Save goal' : 'Next'}
      </button>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={step.title} footer={footer}>
      {renderStep(step, draft, selectModule, updateDraft)}
    </Modal>
  );
}

function renderStep(
  step: StepDef,
  draft: Draft,
  selectModule: (id: ModuleCardId) => void,
  updateDraft: (patch: Partial<Draft>) => void,
) {
  switch (step.id) {
    case '1':
      return <Step1ModuleCards selectedId={draft.moduleId} onSelect={selectModule} />;
    case '2':
      return <Step2View draft={draft} onUpdate={updateDraft} />;
    default:
      return (
        <div className="min-h-[200px] flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
          {step.label} — placeholder
        </div>
      );
  }
}

// ---- Step 1 view ---------------------------------------------------

function Step1ModuleCards({
  selectedId,
  onSelect,
}: {
  selectedId: ModuleCardId | null;
  onSelect: (id: ModuleCardId) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {MODULE_CARDS.map(card => (
        <ModuleCardButton
          key={card.id}
          card={card}
          selected={selectedId === card.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function ModuleCardButton({
  card,
  selected,
  onSelect,
}: {
  card: ModuleCard;
  selected: boolean;
  onSelect: (id: ModuleCardId) => void;
}) {
  // Hex alpha suffixes mirror the existing Dashboard / SkillsCatalogue
  // pattern: 33 (~20%) for the resting border tint, full hex on hover
  // and selected, 0f (~6%) for the transient hover wash, 1a (~10%)
  // for the sticky selected fill.
  const accentHex = accentHexForCard(card.id);
  const restBorder = `${accentHex}33`;
  const fullBorder = accentHex;
  const hoverBg = `${accentHex}0f`;
  const selectedBg = `${accentHex}1a`;

  return (
    <button
      type="button"
      onClick={() => onSelect(card.id)}
      aria-pressed={selected}
      onMouseEnter={selected ? undefined : (e) => {
        e.currentTarget.style.borderColor = fullBorder;
        e.currentTarget.style.backgroundColor = hoverBg;
      }}
      onMouseLeave={selected ? undefined : (e) => {
        e.currentTarget.style.borderColor = restBorder;
        e.currentTarget.style.backgroundColor = '';
      }}
      style={{
        borderColor: selected ? fullBorder : restBorder,
        backgroundColor: selected ? selectedBg : undefined,
      }}
      className="text-left flex flex-col items-start rounded-card border p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
    >
      <div className="text-sm font-medium tracking-tight" style={{ color: accentHex }}>
        {card.name}
      </div>
      <div className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
        {card.description}
      </div>
      <div className="mt-2 text-xs italic text-neutral-500 dark:text-neutral-400 leading-relaxed">
        “{card.example}”
      </div>
    </button>
  );
}

// ---- Step 2 dispatcher ---------------------------------------------

function Step2View({
  draft,
  onUpdate,
}: {
  draft: Draft;
  onUpdate: (patch: Partial<Draft>) => void;
}) {
  switch (draft.moduleId) {
    case 'repertoire':
      return <Step2SongRepertoire draft={draft} onUpdate={onUpdate} />;
    case null:
      // Defensive — shouldn't be reachable since Step 1 gates Next on
      // module being set, but keeps types honest.
      return (
        <div className="min-h-[200px] flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
          Pick a module first.
        </div>
      );
    default:
      // TODO: Step 2 surfaces for the other five modules land in build
      // steps 4–8. Until then, placeholder so navigation works end-to-end.
      return (
        <div className="min-h-[200px] flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
          Step 2 for this module — coming soon.
        </div>
      );
  }
}

// ---- Step 2 — Song Repertoire --------------------------------------

function Step2SongRepertoire({
  draft,
  onUpdate,
}: {
  draft: Draft;
  onUpdate: (patch: Partial<Draft>) => void;
}) {
  // Live song list for the picker. Showing all songs (no archive
  // flag exists on Song today) — search filters client-side.
  const allSongs = useLiveQuery(
    () => db.songs.toArray(),
    [],
    [] as Song[],
  );
  const songRecord = useMemo(
    () => draft.songId ? allSongs.find(s => s.id === draft.songId) : undefined,
    [allSongs, draft.songId],
  );
  // True only when we know the song list has loaded but the picked
  // song isn't in it (e.g., deleted between sessions). While the
  // initial query is pending `allSongs` is the empty-array default,
  // so we'd false-positive without the loaded-check.
  const songMissing = draft.songId !== null && allSongs.length > 0 && !songRecord;

  // Matrix queries — only meaningful with a song picked. Returning
  // empty-array defaults keeps the hook order stable.
  const matrixSongKeys = useLiveQuery(
    () => {
      if (!draft.songId) return [] as SongKey[];
      return db.songKeys.where('songId').equals(draft.songId).toArray();
    },
    [draft.songId],
    [] as SongKey[],
  );
  const matrixSongCells = useLiveQuery(
    () => {
      if (!draft.songId) return [] as SongCell[];
      return db.songCells.where('songId').equals(draft.songId).toArray();
    },
    [draft.songId],
    [] as SongCell[],
  );
  const matrixSections = useLiveQuery(
    () => {
      if (!draft.songId) return [] as SongMatrixSection[];
      return db.songMatrixSections.where('songId').equals(draft.songId).sortBy('displayOrder');
    },
    [draft.songId],
    [] as SongMatrixSection[],
  );

  // Mount-time decay snapshot — matches GoalFormModal's pattern.
  // Re-mounting via Step 1 → Step 2 navigation refreshes it, which
  // is fine for daily-resolution decay.
  const [now] = useState(() => Date.now());

  const visibleMatrixSections = useMemo(
    () => matrixSections.filter(s => !s.isArchived),
    [matrixSections],
  );
  const sectionAvailable = visibleMatrixSections.length > 0;
  // TODO (build step 9): wire to draft.scope once Step 3 lands.
  // Section granularity is gated on weekly scope per spec; until
  // scope is collected, treat the slot as eligible so users can
  // pick section now and we'll validate at Step 3 / Step 4.
  const sectionWeeklyEligible = true;

  const songLevelState = useMemo(
    () => songRecord
      ? computeSongLevelState(matrixSongKeys, matrixSongCells, visibleMatrixSections.length, now)
      : null,
    [songRecord, matrixSongKeys, matrixSongCells, visibleMatrixSections.length, now],
  );
  const originalMatrixKey = useMemo(
    () => matrixSongKeys.find(k => k.isOriginalKey) ?? null,
    [matrixSongKeys],
  );
  const keyStateHints = useMemo(
    () => songRecord
      ? buildKeyStateHints(matrixSongKeys, now)
      : new Map<string, KeyStateHint>(),
    [songRecord, matrixSongKeys, now],
  );
  const sectionNamesById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of visibleMatrixSections) m.set(s.id, s.name);
    return m;
  }, [visibleMatrixSections]);

  const setSongTarget = (next: SongTargetSelection) => {
    onUpdate({ songTarget: next });
  };
  const setSongId = (id: string | null) => {
    // Clear target when song changes — different song, different
    // matrix data, and the previously-picked section ID may not
    // exist on the new song.
    onUpdate({
      songId: id,
      songTarget: defaultSongTarget(),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <SongPicker
        songs={allSongs}
        selectedSongId={draft.songId}
        onSelect={setSongId}
      />
      {draft.songId && songRecord && (
        <>
          <SongTargetSection
            song={songRecord}
            songMissing={songMissing}
            selection={draft.songTarget}
            onChange={setSongTarget}
            sectionAvailable={sectionAvailable}
            sectionWeeklyEligible={sectionWeeklyEligible}
            songLevelState={songLevelState}
            originalMatrixKey={originalMatrixKey}
            visibleMatrixSections={visibleMatrixSections}
            keyStateHints={keyStateHints}
            now={now}
          />
          <SongPreview
            selection={draft.songTarget}
            song={songRecord}
            sectionNamesById={sectionNamesById}
          />
        </>
      )}
    </div>
  );
}

const SONG_PICKER_MAX_RESULTS = 20;

function SongPicker({
  songs,
  selectedSongId,
  onSelect,
}: {
  songs: ReadonlyArray<Song>;
  selectedSongId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const selectedSong = selectedSongId ? songs.find(s => s.id === selectedSongId) : undefined;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as Song[];
    return songs
      .filter(s => s.title.toLowerCase().includes(q))
      .slice(0, SONG_PICKER_MAX_RESULTS);
  }, [songs, query]);

  // Custom div+span structure rather than the shared Field component
  // (which wraps in <label>) — labelling an input + a list of buttons
  // with one <label> can cause browsers to delegate the button clicks
  // to the input via the labeled-control activation behavior.
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
        Song
      </span>
      {selectedSong ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-fluent/30 bg-fluent/5 px-3 py-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
              {selectedSong.title}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {selectedSong.artist}{selectedSong.key ? ` • ${selectedSong.key}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { onSelect(null); setQuery(''); }}
            className="shrink-0 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search songs by title…"
            className={inputClass()}
          />
          {matches.length > 0 && (
            <div className="mt-1.5 flex flex-col rounded-md border border-neutral-200 dark:border-neutral-800 max-h-60 overflow-y-auto">
              {matches.map(song => (
                <button
                  key={song.id}
                  type="button"
                  onClick={() => onSelect(song.id)}
                  className="text-left px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/60 border-b border-neutral-100 dark:border-neutral-800 last:border-b-0"
                >
                  <div className="font-medium text-neutral-800 dark:text-neutral-100 truncate">
                    {song.title}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                    {song.artist}{song.key ? ` • ${song.key}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
          {query.trim() && matches.length === 0 && (
            <div className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              No songs match “{query}”.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- Dot indicator -------------------------------------------------

function StepDots({ currentIndex, total }: { currentIndex: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => {
        const active = i === currentIndex;
        return (
          <span
            key={i}
            className={`h-2 rounded-full transition-all ${
              active ? 'w-6 bg-teal-500' : 'w-2 bg-neutral-300 dark:bg-neutral-700'
            }`}
          />
        );
      })}
    </div>
  );
}
