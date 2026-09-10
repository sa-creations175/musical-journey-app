/**
 * "Tier 2 unlocked: … are in play." — on both ladders, from one place.
 *
 * =====================================================================
 * THE MESSAGE SAID NOTHING ABOUT WHAT HAD OPENED.
 *
 * Chord recognition's was "Tier 2 unlocked — new chord types
 * available!", which tells a reader something has changed and not what.
 * Scales & Modes said nothing at all: its Tier 2 opened in silence and
 * the modes simply started appearing. Silas's ruling of 10 Sep 2026
 * names the material in both, and puts a way to see the whole ladder
 * beside it.
 *
 * TWO CALLERS, ONE HOOK. What a Tier opening looks like — the sentence,
 * the "See all Tiers" link, the fact that it fires on a CROSSING and
 * not on arriving at a page where a Tier is already open — is one
 * behaviour, and a second copy of it would drift.
 *
 * IT BASELINES ON FIRST PAINT. The first value it sees is where the
 * reader already was, so opening the quiz does not announce a Tier they
 * unlocked last week.
 * =====================================================================
 */
import { useEffect, useRef } from 'react';
import { useToast } from '../../components/Toaster';
import { openSettingsAt } from '../../components/settings/openSettings';
import { tierUnlockedMessage } from './tierContents';

export function useTierUnlockNotice(
  /** The Tier the reader has open now, or null before it is known. */
  tier: number | null,
  /** What is in each Tier, in words — see `tierContents.ts`. */
  rows: ReadonlyArray<string>,
): void {
  const { toast } = useToast();
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (tier === null) return;
    if (previous.current !== null && tier > previous.current) {
      toast({
        message: tierUnlockedMessage(tier, rows),
        variant: 'success',
        action: {
          label: 'See all Tiers',
          onClick: () => { openSettingsAt('unlocking'); },
        },
      });
    }
    previous.current = tier;
  }, [tier, rows, toast]);
}
