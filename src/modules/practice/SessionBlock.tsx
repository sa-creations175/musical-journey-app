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
import { moduleMetaById } from '../../lib/moduleMeta';
import { formatActiveTime } from '../../lib/sessionTimer/formatActiveTime';
import type { ProposalBlock } from './proposalTypes';

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

  const navigate = useNavigate();
  const moduleMeta = moduleMetaById(block.moduleRef);
  const label = block.moduleLabel || moduleMeta?.label || block.moduleRef;
  // Per-block override (e.g. Production Vocab → vocab tab) wins over
  // the module's default route.
  const route = block.quickLaunchRoute ?? moduleMeta?.route ?? null;

  const handleToggle = () => {
    if (isControlled) onToggle?.();
    else setInternalExpanded(v => !v);
  };

  const handleQuickLaunch = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (route) navigate(route);
  };

  const handleInlineAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (block.inlineActionTarget === 'goals') navigate('/goals');
  };

  const tint = `${block.moduleAccentHex}14`; // ~8% alpha

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-expanded={isExpanded}
      className="w-full min-w-0 overflow-hidden text-left rounded-md border transition-shadow hover:shadow-sm focus:outline-none"
      style={{
        backgroundColor: tint,
        borderColor: block.moduleAccentHex,
        borderLeftWidth: 3,
      }}
    >
      <div className="px-3 py-2 flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[10px] uppercase tracking-wider font-medium"
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
          <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
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
        <div className="shrink-0 font-mono tabular-nums text-sm text-neutral-700 dark:text-neutral-200">
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
          {route && (
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
              <span aria-hidden>↗</span>
              <span>open {label}</span>
            </span>
          )}
        </div>
      )}
    </button>
  );
}
