/**
 * Phase 3 Step 4a/4b — Single block on the proposal screen.
 *
 * Default state (4a): module-accent left bar + tinted fill, module
 * name, activity description, duration, optional warm-up badge.
 *
 * Expanded state (4b): tap toggles a slide-down body containing the
 * why-snippet and a quick-launch button into the relevant module.
 * Song-specific section + key targets land in the whySnippet string
 * — the component renders whatever the caller assembles.
 *
 * Uncontrolled by default. Pass `expanded` + `onToggle` for
 * controlled use (e.g. a "expand all" toggle in a parent).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { moduleMetaById } from '../../lib/moduleMeta';
import { formatActiveTime } from '../../lib/sessionTimer/formatActiveTime';
import { drillContextForChordShapeItemRef } from '../shapes-and-patterns/drillModel';
import { scaleCellForItemRef, scaleCellLabel } from '../shapes-and-patterns/scaleSkills';
import {
  chordShapeSurface, scaleSurface,
} from '../shapes-and-patterns/practiceTest/makeSurfaces';
import PracticeTestPanel from '../shapes-and-patterns/practiceTest/PracticeTestPanel';
import { useSpelling } from '../../lib/spellingPref';
import type { DrillSurface } from '../shapes-and-patterns/practiceTest/surfaces';
import type { DrillHand } from '../../lib/db';
import type { ProposalBlock } from './proposalTypes';

/**
 * =====================================================================
 * THE BLOCK OPENS THE SESSION PANEL, NOT A DRILL POP-UP.
 *
 * Pressing start drill here used to open a pop-up that WAS a second
 * start screen: the metronome and the drill length, scrolled past to
 * reach a button also called Start Drill. Two presses of Start before
 * anything counted down.
 *
 * It also had no test mode, so it wrote `fromTest: false` on every run
 * it recorded — a run started inside a generated session could not be
 * a test, and the row could not say otherwise. The panel asks, so it
 * can.
 *
 * THREE HANDS, THREE OPENS. The pop-up walked left, right and both
 * inside itself. A panel is a sitting on one thing, so the hands are
 * stops in the sequence instead — the same three drills and the same
 * three ratings.
 * =====================================================================
 */

/** One item the block will open the panel on. */
interface PanelStop {
  /** Stable identity, so the panel remounts between items. */
  key: string;
  surface: DrillSurface;
}

/** The order a cell has always been walked in. */
const HANDS: ReadonlyArray<DrillHand> = ['left', 'right', 'both'];

const HAND_LABEL: Readonly<Record<DrillHand, string>> = {
  left: 'Left Hand',
  right: 'Right Hand',
  both: 'Both Hands',
};

interface Props {
  block: ProposalBlock;
  /** Controlled-mode expand state. Undefined → uncontrolled. */
  expanded?: boolean;
  /** Controlled-mode toggle handler. Required when `expanded` is set. */
  onToggle?: () => void;
  /** When supplied, a small × button appears in the header. Tapping
   *  invokes the handler with the block id; the parent owns the
   *  actual list mutation. Warm-ups are deletable on their own
   *  (removes just that warm-up); deleting a Repertoire song-practice
   *  anchor pulls its paired warm-ups via the parent's deletionUnit
   *  helper. */
  onDelete?: (blockId: string) => void;
  /** When supplied, a small ⇄ swap button appears in the header next
   *  to ×. Tapping opens the parent's swap picker for this block.
   *  Warm-ups are swappable too: scale-prep → other scale configs,
   *  chord-quiz → another song's progression, S&P scales warm-up →
   *  other scale items. The shared classifier in proposalSwap routes
   *  scale-prefixed warm-ups to the scales swap pool regardless of
   *  the block's moduleRef. */
  onSwap?: (blockId: string) => void;
}

export default function SessionBlock({ block, expanded, onToggle, onDelete, onSwap }: Props) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isControlled = expanded !== undefined;
  const isExpanded = isControlled ? !!expanded : internalExpanded;

  const [spelling] = useSpelling();
  /** The block's items as one string — `itemRefs` is a fresh array
   *  each render, so depending on it directly would rebuild every tick. */
  const refsKey = block.itemRefs.join('|');
  /**
   * Where the walk is, or null when nothing is open.
   *
   * The block opens the session panel on one item at a time and moves
   * on when it closes — the same shape the in-session runner uses,
   * without the prep screen and count-in, which belong to a session
   * that is actually running.
   */
  const [stops, setStops] = useState<ReadonlyArray<PanelStop> | null>(null);
  const [stopIdx, setStopIdx] = useState(0);

  const navigate = useNavigate();
  const moduleMeta = moduleMetaById(block.moduleRef);
  const label = block.moduleLabel || moduleMeta?.label || block.moduleRef;
  // Per-block override (e.g. Production Vocab → vocab tab) wins over
  // the module's default route.
  const route = block.quickLaunchRoute ?? moduleMeta?.route ?? null;

  // In-session drill blocks open a modal in place instead of routing
  // away. The fallback to navigate(route) stays active for every
  // other block kind.
  const inSessionScaleCells =
    block.inSessionDrillKind === 'scales'
      ? block.itemRefs
          .map(ref => scaleCellForItemRef(ref))
          .filter((c): c is NonNullable<typeof c> => c !== null)
      : [];
  const hasInSessionScales = inSessionScaleCells.length > 0;
  const hasInSessionChordShapes =
    block.inSessionDrillKind === 'chord-shapes' && block.itemRefs.length > 0;

  const handleToggle = () => {
    if (isControlled) onToggle?.();
    else setInternalExpanded(v => !v);
  };

  /** Every scale in the block, hand by hand. */
  const scaleStops = useMemo<PanelStop[]>(() => inSessionScaleCells.flatMap(
    cell => HANDS.map(hand => ({
      key: `${cell.itemRef}:${hand}`,
      surface: scaleSurface({
        cellLabel: scaleCellLabel(cell, spelling),
        skillLabel: HAND_LABEL[hand],
        itemRef: cell.itemRef,
        hand,
      }),
    })),
  // The cells come from the block's own refs; rebuild only when those
  // or the spelling change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [refsKey, spelling]);

  /**
   * Every chord shape in the block, hand by hand.
   *
   * ASYNC, because a chord-shape cell is database rows: the skill is
   * materialised on first touch and its drill types are read back.
   * Refs that resolve to nothing are dropped, as they always were.
   */
  const resolveChordShapeStops = async (): Promise<PanelStop[]> => {
    const out: PanelStop[] = [];
    for (const itemRef of block.itemRefs) {
      const ctx = await drillContextForChordShapeItemRef(itemRef);
      if (!ctx) continue;
      const cellLabel = ctx.skill.label ?? itemRef;
      for (const hand of HANDS) {
        out.push({
          key: `${itemRef}:${hand}`,
          surface: chordShapeSurface({
            cellLabel,
            skillLabel: `${ctx.drillType.name} · ${HAND_LABEL[hand]}`,
            skill: ctx.skill,
            drillType: ctx.drillType,
            hand,
          }),
        });
      }
    }
    return out;
  };

  const beginWalk = (next: ReadonlyArray<PanelStop>) => {
    if (next.length === 0) return;
    setStops(next);
    setStopIdx(0);
  };

  const handleQuickLaunch = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasInSessionScales) {
      beginWalk(scaleStops);
      return;
    }
    if (hasInSessionChordShapes) {
      void resolveChordShapeStops().then(beginWalk);
      return;
    }
    if (route) navigate(route);
  };

  const handleInlineAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (block.inlineActionTarget === 'goals') navigate('/goals');
  };

  const tint = `${block.moduleAccentHex}14`; // ~8% alpha

  const activeStop = stops?.[stopIdx] ?? null;
  /**
   * Closing the panel is moving on.
   *
   * Whichever door was used — Log Session, Cancel Session, or the
   * plain Close before a mode was picked — this item is finished with.
   * Walking past the last one ends the walk and leaves the user on the
   * session screen, with no navigation away.
   */
  const handleStopClose = () => {
    if (stops !== null && stopIdx + 1 < stops.length) {
      setStopIdx(stopIdx + 1);
      return;
    }
    setStops(null);
    setStopIdx(0);
  };
  const hasInSessionDrillPanel = hasInSessionScales || hasInSessionChordShapes;

  return (
    <>
    <button
      type="button"
      onClick={handleToggle}
      aria-expanded={isExpanded}
      // h-full so the block fills the proportional height assigned
      // by SessionStack's parent flex container — without it, the
      // button would shrink to its intrinsic content height and the
      // proportional layout would collapse. `overflow-hidden` clips
      // the header + activity-description to THIS block's bounds:
      // when a short block hits its height floor, content used to
      // bleed past the rounded border into the neighbouring block;
      // clipping per-block keeps each card self-contained.
      className="w-full h-full min-w-0 overflow-hidden text-left rounded-md border transition-shadow hover:shadow-sm focus:outline-none"
      style={{
        backgroundColor: tint,
        borderColor: block.moduleAccentHex,
        borderLeftWidth: 3,
      }}
    >
      <div className="px-3 py-1.5 flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          {/* flex-wrap so a long module label + warm-up badge drop
              the badge to a second line instead of overflowing the
              block's width into the neighbouring card. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider font-normal text-neutral-500 dark:text-neutral-400 break-words">
              {label}
            </span>
            {block.isWarmup && (
              <span
                className="text-[9px] uppercase tracking-wider font-medium px-1 py-px rounded"
                style={{
                  color: block.moduleAccentHex,
                  border: `1px solid ${block.moduleAccentHex}`,
                }}
              >
                warm-up
              </span>
            )}
          </div>
          <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100 break-words">
            {block.activityDescription}
          </div>
          {block.inlineActionText && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleInlineAction}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleInlineAction(e as unknown as React.MouseEvent);
                }
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium hover:opacity-80 cursor-pointer underline-offset-2 hover:underline"
              style={{ color: block.moduleAccentHex }}
            >
              {block.inlineActionText}
              <span aria-hidden>→</span>
            </span>
          )}
        </div>
        <div className="shrink-0 font-mono tabular-nums text-xs text-neutral-700 dark:text-neutral-200">
          {formatActiveTime(block.plannedSeconds * 1000)}
        </div>
        {onSwap && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Swap ${label} block`}
            title="Swap this block for a different focus or module"
            onClick={e => {
              e.stopPropagation();
              onSwap(block.id);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onSwap(block.id);
              }
            }}
            className="shrink-0 px-1.5 py-0.5 text-neutral-400 hover:text-fluent cursor-pointer text-sm leading-none"
          >
            ⇄
          </span>
        )}
        {onDelete && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Remove ${label} block`}
            title="Remove This Block from the Proposal"
            onClick={e => {
              e.stopPropagation();
              onDelete(block.id);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onDelete(block.id);
              }
            }}
            className="shrink-0 -mr-1 px-1.5 py-0.5 text-neutral-400 hover:text-needswork cursor-pointer text-sm leading-none"
          >
            ×
          </span>
        )}
      </div>

      {isExpanded && (
        <div
          className="px-3 pb-2 pt-1.5 text-[11px] space-y-1.5 border-t"
          style={{ borderColor: `${block.moduleAccentHex}33` }}
        >
          {block.whySnippet && (
            <p className="text-neutral-600 dark:text-neutral-300 italic">
              {block.whySnippet}
            </p>
          )}
          {(route || hasInSessionDrillPanel) && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleQuickLaunch}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleQuickLaunch(e as unknown as React.MouseEvent);
                }
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium hover:opacity-90 cursor-pointer"
              style={{
                color: block.moduleAccentHex,
                borderColor: block.moduleAccentHex,
              }}
            >
              <span aria-hidden>{hasInSessionDrillPanel ? '▶' : '↗'}</span>
              <span>{hasInSessionDrillPanel ? 'start drill' : `open ${label}`}</span>
            </span>
          )}
        </div>
      )}
    </button>
    {activeStop && (
      // Keyed on the stop so React fully remounts the panel between
      // items: a sitting ends with the thing it was about.
      <PracticeTestPanel
        key={activeStop.key}
        surface={activeStop.surface}
        onClose={handleStopClose}
      />
    )}
    </>
  );
}
