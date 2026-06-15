/**
 * Resolve the prep-screen per-item breakdown into an ordered list of
 * voice-leading sub-cells for the in-session drill runner (Level 3
 * auto-nav). The voice-leading counterpart to inSessionScaleRunner.
 *
 * VL sub-cells run off the static catalog (no DrillSkill / DrillType
 * rows), so resolution is synchronous like scales: each VL itemRef is
 * validated via `parseVoiceLeadingItemRef` and given a human label for
 * the between-cells prep screen. Non-VL itemRefs are dropped.
 */
import {
  parseVoiceLeadingItemRef,
  voiceLeadingSubCellLabel,
  VOICE_LEADING_PATTERN_BY_ID,
} from '../shapes-and-patterns/catalog';
import type { BreakdownItem } from './inSessionScaleRunner';

export interface VoiceLeadingRunnerItem extends BreakdownItem {
  /** "pattern in key" headline for the between-cells prep screen. */
  label: string;
  /** Sub-cell detail (e.g. "guide tones · A") shown under the headline. */
  subLabel: string | null;
}

/** True when a breakdown's first item is a VL sub-cell itemRef — the
 *  signal to drive the in-session VL runner instead of a route
 *  fallback. Sync (parses the ref only), so it can gate render. */
export function isVoiceLeadingRunnerBlock(
  items: ReadonlyArray<BreakdownItem> | null | undefined,
): boolean {
  return (
    !!items &&
    items.length > 0 &&
    parseVoiceLeadingItemRef(items[0].itemRef) !== null
  );
}

/** Map breakdown items to VL sub-cells in order, dropping any that
 *  aren't recognised VL itemRefs. */
export function resolveVoiceLeadingRunnerItems(
  items: ReadonlyArray<BreakdownItem>,
): VoiceLeadingRunnerItem[] {
  const out: VoiceLeadingRunnerItem[] = [];
  for (const item of items) {
    const desc = parseVoiceLeadingItemRef(item.itemRef);
    if (!desc) continue;
    const pattern = VOICE_LEADING_PATTERN_BY_ID.get(desc.patternId);
    const label = pattern ? `${pattern.label} in ${desc.keyName}` : item.itemRef;
    out.push({ ...item, label, subLabel: voiceLeadingSubCellLabel(desc) });
  }
  return out;
}
