import { useState } from 'react';
import Modal from '../../components/Modal';
import type { Goal } from '../../lib/db';

/**
 * Phase 2 step 5b — YearlyAnchorFlow shell.
 *
 * A yearly anchor expresses the user's complete intention for ONE
 * module across one calendar year. It is *not* one goal — it is a
 * small goal cluster (umbrella + up to 4 dimension records) all
 * feeding one yearly umbrella, together expressing four dimensions:
 *
 *   Breadth  → what do you want to cover?
 *   Mastery  → what do you want to truly own?
 *   Depth    → how well do you want to know it?
 *   Consistency → how often will you show up?
 *
 * (Production runs 3 questions — depth/mastery merged. Practice
 * consistency is a meta-habit with its own 3 questions: weekly floor /
 * monthly floor / aspiration. See PRACTICE_SESSIONS_DESIGN_3.md
 * "Yearly Anchor Flow" section for the full per-module spec.)
 *
 * This shell ships:
 *   - Modal lifecycle (open / Esc / backdrop / X close)
 *   - Two-screen navigation (intent → review)
 *   - 2-dot indicator
 *   - Back / Next / Save buttons in the right positions
 *   - Per-screen title + module-aware copy
 *
 * Still to land:
 *   - 5c — Screen 1 dimension components per module
 *   - 5d — Screen 2 review (auto-name, per-dimension Edit links,
 *          natural-language summary)
 *   - 5e — Save logic (transactional umbrella + N dimension records)
 *   - 5f — Trigger interstitial wired into goal-creation entry points
 *   - 5g — Tests
 *
 * Edit mode (`initialAnchor` prop) is wired but the decoder is a 5d
 * concern; for 5b the prop is plumbed through and the title flips to
 * "Review your yearly anchor" without round-tripping data.
 *
 * Why a separate component (not a branch inside GoalCreationFlow):
 * the two flows answer different questions. GoalCreationFlow is
 * "create one goal at any scope"; YearlyAnchorFlow is "express the
 * full year's intention for a module as an umbrella + cluster."
 * They share Modal + StepDots styling and reuse `moduleItemCounts`
 * for live denominators, but their drafts, validation, and save
 * shape are distinct enough that interleaving them would cost
 * clarity. Per the design doc, YearlyAnchorFlow bypasses Step 3.5
 * entirely — no parent picker, the flow IS the umbrella creation.
 */

// ---- Module identity (local, will sync with GoalCreationFlow in 5f) ----

/**
 * Module identifiers used by this flow. Mirrors `ModuleCardId` in
 * GoalCreationFlow.tsx — kept local for 5b so the shell change is
 * self-contained. Step 5f will extract a shared type when the
 * trigger interstitial needs to hand identifiers between both flows;
 * if a third consumer appears, promote to a shared module then.
 */
export type AnchorModuleId =
  | 'ear-training'
  | 'harmonic-fluency'
  | 'repertoire'
  | 'shapes-and-patterns'
  | 'production'
  | 'practice-consistency';

const MODULE_DISPLAY_NAME: Record<AnchorModuleId, string> = {
  'ear-training':         'Ear Training',
  'harmonic-fluency':     'Harmonic Fluency',
  'repertoire':           'Song Repertoire',
  'shapes-and-patterns':  'Shapes & Patterns',
  'production':           'Production',
  'practice-consistency': 'Practice consistency',
};

// ---- Screens ----------------------------------------------------------

type ScreenId = 'intent' | 'review';

const SCREENS: ReadonlyArray<{ id: ScreenId }> = [
  { id: 'intent' },
  { id: 'review' },
];

/**
 * Dimensions expressed on Screen 1, in the on-screen order specified
 * by the design doc. Screen 2's per-dimension Edit links (5d) take
 * one of these as a `focusDimension` prop so navigation back lands on
 * the right scrolled-into-view section.
 *
 * Production omits 'mastery' (depth/mastery merged) — handled in 5c
 * by branching on moduleId. Practice consistency's three questions
 * (weekly / monthly / aspiration) ride under the 'consistency' label.
 */
export type AnchorDimension = 'breadth' | 'mastery' | 'depth' | 'consistency';

// ---- Draft state -----------------------------------------------------

/**
 * Working state for the in-flight anchor. 5b ships only the module +
 * editable umbrella name; per-dimension state lands in 5c. The shape
 * is intentionally permissive (each dimension's slot is optional)
 * because dimensions are independent and a user might leave one or
 * more empty.
 */
export interface AnchorDraft {
  moduleId: AnchorModuleId;
  /** Auto-generated default ("[Module] [Year]"); editable inline on
   *  Screen 2. Null until 5d wires the editable input — the resolved
   *  name at save time falls back to the auto default. */
  name: string | null;
  // Dimension slots land in 5c. Kept here as a placeholder so the
  // Draft shape is recognisable to anyone reading the file mid-build.
  // breadth?: BreadthState;
  // mastery?: MasteryState;
  // depth?: DepthState;
  // consistency?: ConsistencyState;
}

function buildInitialDraft(
  moduleId: AnchorModuleId,
  initialAnchor: Goal | null | undefined,
): AnchorDraft {
  // Edit mode (5d will flesh out): pull the umbrella's existing
  // name (its description, since umbrellas store the user-visible
  // name there). Create mode: name stays null and the auto default
  // resolves at save time.
  return {
    moduleId,
    name: initialAnchor?.description ?? null,
  };
}

// ---- Props -----------------------------------------------------------

interface Props {
  open: boolean;
  onClose: () => void;
  /** Which module this anchor is for. Required — yearly anchors are
   *  per-module by design. Step 5f's trigger interstitial passes
   *  this through from the user's module-card selection. */
  moduleId: AnchorModuleId;
  /** When set, opens in edit mode pre-filled from this umbrella
   *  goal. Decoder is a 5d concern; 5b plumbs the prop through and
   *  reuses the umbrella's `description` as the initial name. */
  initialAnchor?: Goal | null;
  /** Optional initial focused dimension. Used when Screen 2's
   *  per-dimension Edit link routes back to Screen 1; the dimension
   *  is scrolled into view. Wired in 5d. */
  focusDimension?: AnchorDimension | null;
}

// =====================================================================
// Component
// =====================================================================

export default function YearlyAnchorFlow({
  open,
  onClose,
  moduleId,
  initialAnchor,
  // focusDimension is plumbed through but not yet consumed — 5d wires
  // the scroll-into-view behavior. Renamed here to silence the
  // unused-var lint without burying the prop.
  focusDimension: _focusDimension,
}: Props) {
  const [screenIndex, setScreenIndex] = useState(0);
  const [draft, setDraft] = useState<AnchorDraft>(() =>
    buildInitialDraft(moduleId, initialAnchor),
  );
  const [saving, setSaving] = useState(false);

  const isEditing = !!initialAnchor;

  /**
   * Wrap the parent's onClose so every close path resets the flow
   * to Screen 1 with a freshly-rebuilt initial draft. Routed to:
   * Modal's Esc/backdrop/X (via the onClose prop below), Back on
   * Screen 1 (via goBack), and Save (via goNext on the last screen).
   * Re-opening always lands on Screen 1.
   */
  const handleClose = () => {
    setScreenIndex(0);
    setDraft(buildInitialDraft(moduleId, initialAnchor));
    setSaving(false);
    onClose();
  };

  /**
   * Save logic placeholder — 5e will write the umbrella + N
   * dimension records in a single transaction. For 5b we close
   * cleanly so the shell is testable end-to-end. The `saving` flag
   * exists from day one so 5e doesn't need to retrofit the loading
   * state into the button.
   */
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // 5e: write umbrella + dimension records here.
      console.warn('[yearly-anchor] save not yet implemented (Step 5e)', { draft });
      handleClose();
    } catch (err) {
      console.warn('[yearly-anchor] save failed', err);
      setSaving(false);
    }
  };

  const screen = SCREENS[screenIndex];
  const isFirst = screenIndex === 0;
  const isLast = screenIndex === SCREENS.length - 1;
  /** Per-screen advance gate. Screen 1 always passes for now; 5c will
   *  wire per-dimension validation (e.g. consistency requires a count
   *  ≥ 1 to advance). Screen 2's Save is gated by the same flag. */
  const canAdvance = true;

  const goBack = () => {
    if (isFirst) handleClose();
    else setScreenIndex(i => Math.max(0, i - 1));
  };

  const goNext = () => {
    if (!canAdvance || saving) return;
    if (isLast) {
      void handleSave();
      return;
    }
    setScreenIndex(i => Math.min(SCREENS.length - 1, i + 1));
  };

  const updateDraft = (patch: Partial<AnchorDraft>) => {
    setDraft(d => ({ ...d, ...patch }));
  };

  // ---- Title ----------------------------------------------------------

  const moduleName = MODULE_DISPLAY_NAME[moduleId];
  const title = screen.id === 'intent'
    ? `Set your yearly intention for ${moduleName}`
    : 'Review your yearly anchor';

  // ---- Footer ---------------------------------------------------------

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={goBack}
        className="px-4 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        Back
      </button>
      <ScreenDots currentIndex={screenIndex} total={SCREENS.length} />
      <button
        type="button"
        onClick={goNext}
        disabled={!canAdvance || saving}
        className="px-4 py-2 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isLast ? (saving ? 'Saving…' : 'Save anchor') : 'Next'}
      </button>
    </div>
  );

  // ---- Render ---------------------------------------------------------

  return (
    <Modal open={open} onClose={handleClose} title={title} footer={footer}>
      {screen.id === 'intent' ? (
        <ScreenIntent draft={draft} onUpdate={updateDraft} isEditing={isEditing} />
      ) : (
        <ScreenReview draft={draft} onUpdate={updateDraft} />
      )}
    </Modal>
  );
}

// =====================================================================
// Screen 1 — Set your intention
// =====================================================================

/**
 * Screen 1 placeholder. 5c wires the four dimension components per
 * module:
 *   ET / HF / S&P → Breadth (yes/no + group selector)
 *                   → Mastery (multi-select pre-filtered to breadth)
 *                   → Depth (accuracy slider or proficiency level)
 *                   → Consistency (count + per-week / per-month)
 *   Songs        → Breadth (count at Comfortable)
 *                   → Depth (count at Solid)
 *                   → Mastery (count at Internalized)
 *                   → Consistency
 *   Production   → Breadth / Depth / Consistency (3 questions only)
 *   Practice consistency → Weekly floor / Monthly floor / Aspiration
 */
function ScreenIntent({
  draft,
  isEditing,
}: {
  draft: AnchorDraft;
  onUpdate: (patch: Partial<AnchorDraft>) => void;
  isEditing: boolean;
}) {
  const moduleName = MODULE_DISPLAY_NAME[draft.moduleId];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        A yearly anchor sets your full intention for {moduleName}. It's a small
        cluster of goals that together describe what you want to cover, how
        deeply, and how often.
      </p>
      <div className="rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
        Dimension questions land in step 5c.
        {isEditing && <span className="block mt-2 text-xs">Edit mode active.</span>}
      </div>
    </div>
  );
}

// =====================================================================
// Screen 2 — Review
// =====================================================================

/**
 * Screen 2 placeholder. 5d wires the auto-generated name (editable
 * inline at top), four dimension review rows with per-dimension Edit
 * links, and the natural-language summary block at the bottom with
 * the left accent border.
 */
function ScreenReview({
  draft,
}: {
  draft: AnchorDraft;
  onUpdate: (patch: Partial<AnchorDraft>) => void;
}) {
  const moduleName = MODULE_DISPLAY_NAME[draft.moduleId];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Review your {moduleName} anchor before saving.
      </p>
      <div className="rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
        Auto-generated name + per-dimension review rows + natural-language
        summary land in step 5d.
      </div>
    </div>
  );
}

// =====================================================================
// 2-dot screen indicator
// =====================================================================

/**
 * Mirrors GoalCreationFlow's StepDots component, scoped to the
 * 2-screen YearlyAnchorFlow shape. Kept local so the flow has no
 * cross-file coupling for a 15-line presentational component;
 * promote to a shared `goals/StepDots.tsx` if a third consumer
 * appears.
 */
function ScreenDots({ currentIndex, total }: { currentIndex: number; total: number }) {
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
