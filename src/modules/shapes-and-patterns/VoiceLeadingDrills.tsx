import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db, type DrillSession, type DrillSkill, type SpacingState,
} from '../../lib/db';
import VoiceLeadingPatternGrid from './VoiceLeadingPatternGrid';
import PracticeTestPanel from './practiceTest/PracticeTestPanel';
import { voiceLeadingSurface } from './practiceTest/makeSurfaces';
import {
  CIRCLE_KEY, CIRCLE_LABEL, parseVoiceLeadingItemRef, patternRowLabel, voiceLeadingRung,
  voiceLeadingSubCellLabel,
} from './catalog';
import type { RowOptions } from '../../lib/progressionRow';
import { VOICE_LEADING_PATTERN_BY_ID } from './catalog';
import {
  applyRename,
  isRemovedCustomPattern,
  mergePatternList,
  type CustomPattern,
} from './voiceLeadingPatternList';
import { getPref, setPref } from '../../lib/userPrefs';
import { useToast } from '../../components/Toaster';
import { spellKey, type Spelling } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';
import { useProgressionSpelling } from '../../lib/progressionSpelling';
import CellPlayer from './CellPlayer';
import CellProgressDetails, {
  HAND_ROW_LABEL, type DetailTarget,
} from './CellProgressDetails';
import { DEFAULT_LAYOUT, LayoutToggle, type Layout } from './KeyedGrid';
import { useSectionScroll } from '../../lib/scrollSectionToTop';
import { itemCellTargets, targetKey } from './cellTargets';
import { cellProgress, sessionSecondsById } from './handProgress';
import { sessionsByTarget } from './timeInvested';
import { NOT_STARTED } from '../../lib/spacing/banding';
import ConfirmDialog from '../../components/ConfirmDialog';
import { SECTION_TIME_SIGNATURE_PRESETS } from '../repertoire/barGrid';
import { createMovement, deleteMovement } from './movements/movementStore';
import {
  movementCellLabel, movementGridRows, movementIdForRef,
} from './movements/movementCells';
import { movementPath } from './sectionRoutes';
import type { ChordMovement } from '../../lib/db';

/** Nothing is ever out of the score here — see `selectedTargets`. */
const NOTHING_OUT: ReadonlySet<string> = new Set();

const PREF_CUSTOM_PATTERNS = 'shapesAndPatternsCustomVoiceLeading';

// The list, the override rules and the two writers all live in
// `voiceLeadingPatternList` — pure, and tested there. This file draws
// what that returns.

/**
 * Chord Movements & Passes: one grid per movement, spread across 12
 * keys, with the standing Progress Details section under all of them.
 *
 * =====================================================================
 * RULING 19: THIS PAGE IS THE MOVEMENTS PAGE. Silas: "It's literally
 * just like everything else. I'm just building it as I go, building up
 * the library of them as I go. Just like the Ear Training chord
 * progressions now."
 *
 * The named patterns that shipped — the diatonic cycle, 5→1, the
 * 2-5-1s — ARE movements. Nothing about them changed. What changed is
 * that the page also holds the ones Silas captures himself, and that
 * the words "voice leading" have gone from everything a reader sees.
 * The internal names stay: `voice-leading` keys every stored row, every
 * itemRef prefix and every pref, and renaming those would be renaming
 * data to change a label.
 *
 * =====================================================================
 * THE SIMPLEST OF THE THREE GRIDS, AND THE LAST TO GET THE FACE.
 *
 * A cell holds ONE target — voice leading is two-handed by nature and
 * only ever writes `both` — so there is no roll-up to make and nothing
 * to take out of the score. What changes here is only where a click
 * lands: it used to open the session panel directly, which made this
 * the one grid where touching a square took over the screen.
 *
 * No step in the sequence is added. It is the scales chain with one
 * target instead of three.
 * =====================================================================
 */
export default function VoiceLeadingDrills() {
  const navigate = useNavigate();
  const [spelling] = useSpelling();
  const [rowSpelling] = useProgressionSpelling();
  const [addingMovement, setAddingMovement] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState<ChordMovement | null>(null);
  const movements = useLiveQuery<ChordMovement[]>(
    async () => (await db.chordMovements.toArray())
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [],
  ) ?? [];
  const movementIds = useMemo(
    () => new Set(movements.map(m => m.id)),
    [movements],
  );

  /**
   * What a cell is called — a movement's or a pattern's.
   *
   * ONE FUNCTION FOR BOTH, because Progress Details and the drill panel
   * both ask, and two ways of naming a cell is how the panel comes to
   * head itself differently from the band above it.
   */
  const cellLabel = (itemRef: string): string => {
    const movementId = movementIdForRef(itemRef, movementIds);
    if (movementId === null) {
      // BESIDE A DRILL THE RUNG IS KNOWN, so a half-diminished takes
      // its seventh-chord name here and its triad name on the row
      // label above — see `voiceLeadingRung`.
      return voiceLeadingCellLabel(itemRef, spelling, {
        settings: rowSpelling, rung: voiceLeadingRung(),
      });
    }
    const movement = movements.find(m => m.id === movementId)!;
    return movementCellLabel(movement, itemRef.split(':')[2], spelling);
  };
  const [custom, setCustom] = useState<CustomPattern[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  /** Which axis runs down the side. Page-wide, so every pattern turns
   *  together — and KEYS DOWN THE LEFT by default, because twelve keys
   *  across gave each cell a twelfth of the width and every status word
   *  in every cell hyphenated. */
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  /** The cell whose story Progress Details is telling. */
  const [selected, setSelected] = useState<string | null>(null);
  /** The target the session panel is open on. One per cell here. */
  const [drilling, setDrilling] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  /** Scrolls the band to the top once the pick has rendered — see
   *  `useSectionScroll` for why it cannot be done in the handler. */
  const askForScroll = useSectionScroll(detailRef);
  const [now] = useState(() => Date.now());
  const { toast } = useToast();

  const spacingRows = useLiveQuery<SpacingState[]>(
    () => db.spacingState
      .where('moduleRef').equals('shapes-and-patterns')
      .toArray(),
    [],
  ) ?? [];
  const sessions = useLiveQuery<DrillSession[]>(
    () => db.drillSessions.toArray(),
    [],
  ) ?? [];
  const drillSkills = useLiveQuery<DrillSkill[]>(
    () => db.drillSkills.toArray(),
    [],
  ) ?? [];
  /** THE ONE WALK, shared with the other two grids and the card. */
  const byTarget = useMemo(
    () => sessionsByTarget(sessions, drillSkills),
    [sessions, drillSkills],
  );

  /**
   * The cell's ONE target.
   *
   * =====================================================================
   * NO ROLL-UP, AND NO EDIT WHAT COUNTS.
   *
   * Voice leading is two-handed by nature and only ever writes `both`,
   * so `itemCellTargets` returns a single target and the cell IS its
   * target. There is no rule to pick between — a Furthest/Lowest
   * control over one thing is a control that cannot change anything —
   * and nothing to take out of the score, because taking the only
   * target out would leave the cell with no status at all.
   *
   * Every other step is the scales page's, unchanged.
   * =====================================================================
   */
  const selectedTargets: DetailTarget[] = useMemo(() => {
    if (selected === null) return [];
    const targets = itemCellTargets(selected);
    const progress = cellProgress(targets, spacingRows, byTarget);
    return targets.map((t, i) => ({
      key: targetKey(t.itemRef, t.hand),
      label: HAND_ROW_LABEL[t.hand],
      hand: t.hand,
      progress: progress[i],
    }));
  }, [selected, spacingRows, byTarget]);

  const pickCell = (itemRef: string) => {
    setSelected(itemRef);
    // THE ANSWER GOES WHERE YOU ARE LOOKING — at the TOP of the screen,
    // clear of the sticky header, and asked for AFTER the pick renders:
    // called in the handler it ran before the panel had reserved its
    // room and the browser clamped it. See `useSectionScroll`.
    askForScroll();
  };

  // Live query of voice-leading skills so we can update labels on
  // existing DrillSkill rows when the user renames a pattern.
  const skills = useLiveQuery<DrillSkill[]>(
    () => db.drillSkills.where('kind').equals('voice-leading').toArray(),
    [],
  ) ?? [];

  useEffect(() => {
    (async () => {
      const saved = await getPref<CustomPattern[]>(PREF_CUSTOM_PATTERNS, []);
      // RESIDUE IS DROPPED ON THE WAY IN (ruling 32). The database
      // migration deletes these, and this is the second net: a device
      // that pulls an old pref row from another one before upgrading
      // should not resurrect a pattern nothing can drill.
      setCustom(Array.isArray(saved)
        ? saved.filter(c => !isRemovedCustomPattern(c))
        : []);
      setLoaded(true);
    })();
  }, []);

  // MERGED BY ID, NOT CONCATENATED. An override replaces fields on the
  // built-in it names; it never becomes a second section. See the note
  // at the top of `voiceLeadingPatternList`.
  // THE ROW LABEL TAKES NO RUNG. It names the row, not a rung of it,
  // so a half-diminished reads with the triad name — which is the
  // formatter's own default when nothing is passed.
  const allPatterns = useMemo(
    () => mergePatternList(custom, { settings: rowSpelling }),
    [custom, rowSpelling],
  );

  const persistCustom = async (next: CustomPattern[]) => {
    setCustom(next);
    if (loaded) await setPref(PREF_CUSTOM_PATTERNS, next);
  };

  const saveRename = async (patternId: string) => {
    const trimmed = nameDraft.trim();
    if (trimmed === '') { setRenamingId(null); return; }

    // DELETE ON DEFAULT. A rename back to the shipped name removes the
    // override rather than storing one that says nothing — which is
    // what a stray click on a title, saved on blur, used to leave
    // behind. `null` means there is nothing worth writing.
    const next = applyRename(custom, patternId, trimmed, Date.now());
    if (next !== null) await persistCustom(next);

    // Update any existing DrillSkill rows so the grid and Progress
    // Details re-show the new label immediately.
    const matching = skills.filter(s => s.patternId === patternId);
    if (matching.length > 0) {
      await db.transaction('rw', db.drillSkills, async () => {
        for (const s of matching) {
          const keyName = s.keyName ?? '';
          await db.drillSkills.update(s.id, {
            label: keyName === CIRCLE_KEY
              ? `${trimmed} · ${CIRCLE_LABEL}`
              : `${trimmed} in ${spellKey(keyName, spelling)}`,
          });
        }
      });
    }
    setRenamingId(null);
    toast({ message: `Renamed to "${trimmed}".`, variant: 'success' });
  };

  const addMovement = (
    <div className="flex justify-center" data-testid="add-movement">
      {addingMovement ? (
        <div className="rounded-2xl border border-fluent/40 bg-fluent/5 p-3 space-y-2 w-full">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            New movement
          </p>
          <div className="flex flex-wrap gap-2">
            {SECTION_TIME_SIGNATURE_PRESETS.map(preset => (
              <button
                key={preset}
                type="button"
                data-testid={`new-movement-${preset}`}
                onClick={() => void (async () => {
                  const made = await createMovement(preset);
                  navigate(movementPath(made.id));
                })()}
                className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm font-mono tabular-nums hover:border-fluent hover:text-fluent"
              >
                {preset}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAddingMovement(false)}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingMovement(true)}
          className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
        >
          + Add movement
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* THE CONTROL SITS ABOVE EVERY PATTERN, because it turns all of
          them — a per-section toggle would let two grids on one page
          disagree about which axis runs down the side. */}
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <LayoutToggle layout={layout} onChange={setLayout} />
      </div>

      {/* AT THE TOP AS WELL AS THE BOTTOM (ruling 21). The library
          grows, and a control only at the end of a growing list is a
          control that gets further away every time it is used. */}
      {addMovement}

      {/* WHAT SILAS HAS CAPTURED, above the ones that shipped. Its grid
          arrives in the next commit; the header and the remove are here
          because the list page they used to live on is gone. */}
      {movements.map(m => (
        <section
          key={m.id}
          data-testid={`movement-section-${m.id}`}
          className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-3"
        >
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <button
                onClick={() => navigate(movementPath(m.id))}
                data-testid={`open-movement-${m.id}`}
                className={m.name
                  ? 'text-sm font-medium hover:text-fluent'
                  : 'text-sm font-medium italic text-neutral-400 hover:text-fluent'}
              >
                {m.name || UNNAMED_MOVEMENT}
              </button>
              {m.description && (
                <p className="text-xs text-neutral-500 mt-0.5">{m.description}</p>
              )}
            </div>
            {/* WHERE THE PAGE ALREADY REMOVES A ROW — the same place a
                custom pattern's Remove sits. It CONFIRMS, unlike that
                one's native prompt, because a movement is nothing but
                work pressed in by hand and there is no undo toast here
                to be the second net. */}
            <button
              onClick={() => setConfirmingRemove(m)}
              data-testid={`remove-movement-${m.id}`}
              className="text-neutral-400 hover:text-needswork text-[11px]"
            >
              Remove
            </button>
          </div>
          {/* ONE COLUMN, TWELVE KEYS (ruling 20). The same grid every
              pattern draws, handed its rows instead of reading them
              out of the catalog — a movement is not in the catalog and
              has no starting positions to fan out into. */}
          <VoiceLeadingPatternGrid
            patternId={m.id}
            rows={movementGridRows(m)}
            layout={layout}
            selectedRef={selected}
            onCellOpen={pickCell}
          />
        </section>
      ))}

      {allPatterns.map(pattern => {
        // `pattern` is already the merged result — the override has
        // been applied. There is exactly one entry per id, so this key
        // is unique; it used to collide, because two sections shared
        // an id and both keyed on it.
        const effective = pattern;
        return (
          <section
            key={pattern.id}
            className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                {renamingId === effective.id ? (
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onBlur={() => saveRename(effective.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                  />
                ) : (
                  <button
                    onClick={() => { setRenamingId(effective.id); setNameDraft(effective.label); }}
                    className="text-sm font-medium hover:text-fluent"
                    title="click to rename"
                  >
                    {effective.label}
                  </button>
                )}
                {effective.description && (
                  <p className="text-xs text-neutral-500 mt-0.5">{effective.description}</p>
                )}
              </div>
              {/* NO REMOVE. Every row here is a built-in and a built-in
                  cannot be removed — it ships — so a link offering to
                  is a promise the app cannot keep. There is no restore
                  control either: renaming is a display name and nothing
                  more, and typing the shipped name back is how you undo
                  it. The override under the hood is only how that name
                  persists; none of it is on screen. */}
            </div>
            <VoiceLeadingPatternGrid
              patternId={effective.id}
              layout={layout}
              selectedRef={selected}
              onCellOpen={pickCell}
            />
          </section>
        );
      })}

      {/* HEAR IT BEFORE YOU DRILL IT. A reference panel for the cell
          that is selected: the same voicing the grid teaches and the
          ear-training card asks about, with the rung locked to the row.
          Nothing here is rated.

          KEYED ON THE itemRef, so tapping another square gives it a
          fresh panel rather than one still showing the last cell's
          position. */}
      {selected !== null && <CellPlayer key={selected} itemRef={selected} />}

      {/* THE SAME SECTION THE OTHER TWO GRIDS FILL. A cell used to open
          the session panel directly — the one grid where clicking a
          square still took over the screen. It fills this now, and the
          target inside it opens the session. */}
      <CellProgressDetails
        ref={detailRef}
        cellLabel={selected === null ? null : cellLabel(selected)}
        targets={selectedTargets}
        verdict={selectedTargets[0]?.progress.verdict ?? NOT_STARTED}
        /* NO ROLL-UP TO REPORT. One target, so the cell's word is the
           target's word and there is no rule that produced it. */
        rollup={null}
        /* NO `onToggleCounted` — see `selectedTargets`. */
        notCounted={NOTHING_OUT}
        sessionSeconds={sessionSecondsById(sessions)}
        onDrill={() => selected !== null && setDrilling(selected)}
        now={now}
      />

      {drilling !== null && (
        /* NO PICK A SKILL STEP. A voice-leading cell is already one
           skill — pattern, row and key — so the target opens straight
           on the mode chooser. The sub-cell label is the header's
           second line rather than a step you walk through. */
        <PracticeTestPanel
          key={drilling}
          surface={voiceLeadingSurface({
            cellLabel: cellLabel(drilling),
            // A MOVEMENT HAS NO SUB-CELL, so there is no second line.
            // The panel joins the two with a middot and an empty one
            // simply does not appear. A CIRCLE OF 4THS CELL'S LABEL
            // already carries its row, so it has no second line either.
            skillLabel: movementIdForRef(drilling, movementIds) === null
              && !drilling.endsWith(`:${CIRCLE_KEY}`)
              ? voiceLeadingSubCellDescription(drilling)
              : '',
            itemRef: drilling,
            // THE ROW'S NAME for a Circle drill's small line, and the
            // captured movement whose chords go under the twelve.
            rowLabel: cellLabel(drilling).replace(` · ${CIRCLE_LABEL}`, ''),
            ...((m: ChordMovement | undefined) => (m === undefined ? {} : { movement: m }))(
              movements.find(x => x.id === movementIdForRef(drilling, movementIds)),
            ),
          })}
          onClose={() => setDrilling(null)}
        />
      )}

      {/* THE ADD-A-PATTERN BOX WAS HERE (ruling 32). What it made was
          a row with a name and nothing behind it — no sub-cells, no
          itemRefs, no spacing rows — which printed "sub-cell drill flow
          isn't available" and could never be drilled. The thing it was
          reaching for exists properly now, one control down: a
          movement. */}
      {addMovement}

      <ConfirmDialog
        open={confirmingRemove !== null}
        title="Remove this movement?"
        message={(
          <p>
            {confirmingRemove?.name
              ? `"${confirmingRemove.name}" and everything pressed into it goes.`
              : 'This movement and everything pressed into it goes.'}
          </p>
        )}
        confirmLabel="Remove movement"
        onCancel={() => setConfirmingRemove(null)}
        onConfirm={async () => {
          const m = confirmingRemove;
          setConfirmingRemove(null);
          if (m) await deleteMovement(m.id);
        }}
      />
    </div>
  );
}

/** What an unnamed movement is called in a list. Silas names them
 *  himself (ruling 4); this is the page saying so, not a name. */
const UNNAMED_MOVEMENT = 'Unnamed movement';


// ---------------------------------------------------------------------

/** "Major 2–5–1 in E♭" — the pattern and the key, from the itemRef. */
function voiceLeadingCellLabel(
  itemRef: string, spelling: Spelling, opts: RowOptions = {},
): string {
  const desc = parseVoiceLeadingItemRef(itemRef);
  if (!desc) return 'Voice-leading';
  const pattern = VOICE_LEADING_PATTERN_BY_ID.get(desc.patternId);
  const name = pattern ? patternRowLabel(pattern.id, pattern.label, opts) : 'Pattern';
  // "Major 2-5-1 · Guide tones · Position 1 · Circle of 4ths": the row's
  // label with the key replaced (Silas, 13 Sep 2026).
  if (desc.keyName === CIRCLE_KEY) {
    return `${name} · ${voiceLeadingSubCellLabel(desc)} · ${CIRCLE_LABEL}`;
  }
  return `${name} in ${spellKey(desc.keyName, spelling)}`;
}

/** The row within the pattern — the starting position or voicing type. */
function voiceLeadingSubCellDescription(itemRef: string): string {
  const desc = parseVoiceLeadingItemRef(itemRef);
  return desc ? voiceLeadingSubCellLabel(desc) : '';
}
