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
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DrillSkill, DrillType } from '../../lib/db';
import { moduleMetaById } from '../../lib/moduleMeta';
import { metronome } from '../../lib/metronome';
import { useMetronomeState } from '../../lib/useMetronome';
import { formatActiveTime } from '../../lib/sessionTimer/formatActiveTime';
import DrillSessionModal from '../shapes-and-patterns/DrillSessionModal';
import ScalesDrillModal from '../shapes-and-patterns/ScalesDrillModal';
import { drillContextForChordShapeItemRef } from '../shapes-and-patterns/drillModel';
import { scaleCellForItemRef } from '../shapes-and-patterns/scaleSkills';
import type { ProposalBlock } from './proposalTypes';

const BPM_MIN = 40;
const BPM_MAX = 220;
function clampBpm(v: number): number {
  return Math.max(BPM_MIN, Math.min(BPM_MAX, v));
}

/** Inline metronome widget for song practice blocks. Mirrors the
 *  header MetronomeControl's pill design (play/pause + BPM display
 *  + −/+ steppers) without the settings popover — groove + time-sig
 *  + volume stay in the header. Uses driver key `'song'` so toggles
 *  here stack independently of `'user'` (header) and `'drill'`
 *  (drill modals) per metronome.ts:303-316. */
function InlineSongMetronome() {
  const state = useMetronomeState();
  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();
  const toggle = (e: React.MouseEvent) => {
    stop(e);
    if (state.playing) metronome.stop('song');
    else void metronome.start('song');
  };
  const adjust = (delta: number) => (e: React.MouseEvent) => {
    stop(e);
    metronome.update({ bpm: clampBpm(state.bpm + delta) });
  };
  return (
    <span
      onClick={stop}
      onKeyDown={stop}
      className="inline-flex items-center rounded-full border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900/70 overflow-hidden text-[11px]"
    >
      <span
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle(e as unknown as React.MouseEvent);
          }
        }}
        aria-label={state.playing ? 'stop metronome' : 'start metronome'}
        className={`px-2 py-0.5 cursor-pointer transition ${
          state.playing ? 'bg-fluent text-white' : 'text-neutral-500 hover:text-fluent'
        }`}
      >
        {state.playing ? '■' : '▶'}
      </span>
      <span
        role="button"
        tabIndex={0}
        onClick={adjust(-1)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            adjust(-1)(e as unknown as React.MouseEvent);
          }
        }}
        aria-label="decrease bpm"
        className="px-1.5 py-0.5 border-l border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-fluent cursor-pointer font-mono"
      >
        −
      </span>
      <span className="px-1.5 py-0.5 border-l border-neutral-200 dark:border-neutral-700 font-mono tabular-nums text-neutral-700 dark:text-neutral-200">
        {state.bpm}
        <span className="text-neutral-400 ml-0.5">bpm</span>
      </span>
      <span
        role="button"
        tabIndex={0}
        onClick={adjust(1)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            adjust(1)(e as unknown as React.MouseEvent);
          }
        }}
        aria-label="increase bpm"
        className="px-1.5 py-0.5 border-l border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-fluent cursor-pointer font-mono"
      >
        +
      </span>
    </span>
  );
}

interface Props {
  block: ProposalBlock;
  /** Controlled-mode expand state. Undefined → uncontrolled. */
  expanded?: boolean;
  /** Controlled-mode toggle handler. Required when `expanded` is set. */
  onToggle?: () => void;
}

export default function SessionBlock({ block, expanded, onToggle }: Props) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isControlled = expanded !== undefined;
  const isExpanded = isControlled ? !!expanded : internalExpanded;

  // Index of the scale cell currently open in ScalesDrillModal for
  // an in-session scale-prep drill. null = no modal open. On save the
  // index advances to the next itemRef; when it walks past the end
  // (or the user dismisses) the modal closes and the user is back at
  // the session screen — no navigation away.
  const [scalesCellIdx, setScalesCellIdx] = useState<number | null>(null);

  // In-session chord-shapes drill state — mirrors the scales pattern
  // but resolves the skill + drillType asynchronously per itemRef.
  // `idx` tracks position in the block's itemRefs sequence; the
  // resolved skill/drillType pair drives the active DrillSessionModal.
  const [activeChordShape, setActiveChordShape] = useState<
    { idx: number; itemRef: string; skill: DrillSkill; drillType: DrillType } | null
  >(null);

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

  // Walk to the chord-shape itemRef at `idx`, resolving its skill +
  // drillType. Skips unresolvable refs (rare — defensive against bad
  // data). Closes the modal when the sequence finishes.
  const openChordShapeAt = async (idx: number) => {
    for (let i = idx; i < block.itemRefs.length; i++) {
      const itemRef = block.itemRefs[i];
      const ctx = await drillContextForChordShapeItemRef(itemRef);
      if (ctx) {
        setActiveChordShape({ idx: i, itemRef, ...ctx });
        return;
      }
    }
    setActiveChordShape(null);
  };

  const handleQuickLaunch = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasInSessionScales) {
      setScalesCellIdx(0);
      return;
    }
    if (hasInSessionChordShapes) {
      void openChordShapeAt(0);
      return;
    }
    if (route) navigate(route);
  };

  const handleInlineAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (block.inlineActionTarget === 'goals') navigate('/goals');
  };

  const tint = `${block.moduleAccentHex}14`; // ~8% alpha

  const activeScalesCell =
    scalesCellIdx !== null ? inSessionScaleCells[scalesCellIdx] ?? null : null;
  const handleScalesModalClose = () => setScalesCellIdx(null);
  const handleScalesLogged = () => {
    // Walk to the next cell in the sequence — typically scale-prep
    // carries 2 cells (e.g. major + major-pentatonic for a major key).
    // When we run past the last one, close the modal: the user is
    // back at the session screen with no navigation needed.
    setScalesCellIdx(idx => {
      if (idx === null) return null;
      const next = idx + 1;
      return next < inSessionScaleCells.length ? next : null;
    });
  };
  const handleChordShapeClose = () => setActiveChordShape(null);
  const handleChordShapeLogged = () => {
    if (!activeChordShape) return;
    void openChordShapeAt(activeChordShape.idx + 1);
  };
  const hasInSessionDrillModal = hasInSessionScales || hasInSessionChordShapes;

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
      <div className="px-3 py-2 flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          {/* flex-wrap so a long module label + warm-up badge drop
              the badge to a second line instead of overflowing the
              block's width into the neighbouring card. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="text-[9px] sm:text-[10px] uppercase tracking-wider font-medium break-words"
              style={{ color: block.moduleAccentHex }}
            >
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
          <div className="text-sm sm:text-base font-medium text-neutral-800 dark:text-neutral-100 break-words">
            {block.activityDescription}
          </div>
          {block.isSongPractice && (
            <div className="pt-1">
              <InlineSongMetronome />
            </div>
          )}
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
        <div className="shrink-0 font-mono tabular-nums text-xs sm:text-sm text-neutral-700 dark:text-neutral-200">
          {formatActiveTime(block.plannedSeconds * 1000)}
        </div>
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
          {(route || hasInSessionDrillModal) && (
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
              <span aria-hidden>{hasInSessionDrillModal ? '▶' : '↗'}</span>
              <span>{hasInSessionDrillModal ? 'start drill' : `open ${label}`}</span>
            </span>
          )}
        </div>
      )}
    </button>
    {activeScalesCell && (
      <ScalesDrillModal
        cell={activeScalesCell}
        onClose={handleScalesModalClose}
        onLogged={handleScalesLogged}
      />
    )}
    {activeChordShape && (
      // Key on itemRef so React fully remounts DrillSessionModal
      // between drills — its internal setup/running/assess state
      // and target-time picker reset cleanly for each new chord.
      <DrillSessionModal
        key={activeChordShape.itemRef}
        skill={activeChordShape.skill}
        drillType={activeChordShape.drillType}
        onClose={handleChordShapeClose}
        onLogged={handleChordShapeLogged}
      />
    )}
    </>
  );
}
