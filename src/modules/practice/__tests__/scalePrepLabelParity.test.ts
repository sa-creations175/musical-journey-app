/**
 * The two routes to a scale-prep label must agree.
 *
 * `scalePrepBlock` in repertoireSplit.ts builds the warm-up when a
 * session is generated. `updateWarmupForSong` in proposalSwap.ts
 * rebuilds the SAME warm-up when the user swaps the song it hangs off.
 * They are hand-copied mirrors, and the copy is the hazard: when step 2
 * retired Gb as an identity, the original was fixed to spell its label
 * and this one was not — so a generated block read "· G♭" and the same
 * block after a swap read "· F#", a difference visible only to someone
 * who swapped a song and looked closely.
 *
 * A test comparing each against a literal would not have caught it:
 * both would have been written to match whatever the code did at the
 * time. Comparing the two ROUTES against EACH OTHER is what makes a
 * one-sided fix fail.
 */
import { describe, it, expect } from 'vitest';
import { splitRepertoireAllocation, type RepertoireSplitContext } from '../repertoireSplit';
import { applySwapWithCascade } from '../proposalSwap';
import { FLAT_SIGN, SHARP_SIGN, type Spelling } from '../../../lib/spelling';
import type { Song } from '../../../lib/db';
import type { ProposalBlock } from '../proposalTypes';

const NOW = 1_700_000_000_000;

function mkSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 'song-1',
    title: 'Mirror',
    artist: 'Someone',
    key: 'F#',
    learningOrder: 1,
    addedDate: NOW,
    stage: 'learning',
    ...overrides,
  } as Song;
}

/** The generated route: what a fresh session builds. */
function generatedPrepLabel(song: Song, spelling: Spelling): string | null {
  const ctx = {
    spotlight: { kind: 'song', refId: song.id, displayTitle: song.title },
    spotlightSong: song,
    spotlightReadiness: 'needs-chords',
    spotlightPostComfortable: null,
    maintenanceSong: null,
    maintenanceReadiness: null,
    maintenancePostComfortable: null,
    context: 'keys',
    spelling,
  } as unknown as RepertoireSplitContext;
  const blocks = splitRepertoireAllocation(1200, ctx);
  return blocks.find(b => b.kind === 'scale-prep')?.label ?? null;
}

/** The swap route: what the cascade rebuilds for the same song. */
function swappedPrepLabel(song: Song, spelling: Spelling): string | null {
  const blocks: ProposalBlock[] = [
    // Layout mirrors the canonical Rep group: the warm-up precedes its
    // anchor, and both carry moduleRef 'repertoire' — the cascade walks
    // backward from the anchor and only claims Rep warm-ups.
    {
      id: 'prep',
      moduleRef: 'repertoire',
      moduleLabel: 'Rep',
      moduleAccentHex: '#888',
      itemRefs: ['scale:major:C', 'scale:major-pentatonic:1:C'],
      plannedSeconds: 90,
      whySnippet: '',
      activityDescription: 'SCALES — prep for Old Song · C (major + major pent)',
      isWarmup: true,
    } as unknown as ProposalBlock,
    {
      id: 'anchor',
      moduleRef: 'repertoire',
      moduleLabel: 'Rep',
      moduleAccentHex: '#888',
      isSongPractice: true,
      itemRefs: ['song-old'],
      plannedSeconds: 600,
      whySnippet: '',
      activityDescription: 'Old Song',
      isWarmup: false,
    } as unknown as ProposalBlock,
  ];
  const out = applySwapWithCascade({
    blocks,
    blockId: 'anchor',
    choice: { kind: 'same-submodule', itemRef: song.id, label: song.title },
    songsById: new Map([[song.id, song]]),
    spelling,
  });
  return out.find(b => b.id === 'prep')?.activityDescription ?? null;
}

describe('scale-prep label parity across the two routes', () => {
  it('generates and rebuilds the same label for a black-key song', () => {
    for (const spelling of ['flat', 'sharp'] as Spelling[]) {
      const song = mkSong({ key: 'F#' });
      const generated = generatedPrepLabel(song, spelling);
      const swapped = swappedPrepLabel(song, spelling);
      expect(generated, `no generated label under ${spelling}`).toBeTruthy();
      expect(swapped, `no swapped label under ${spelling}`).toBeTruthy();
      // Titles differ by construction, so compare the part that carries
      // the key — everything from the '·' onward.
      const keyPart = (s: string) => s.slice(s.indexOf('·'));
      expect(keyPart(swapped as string), `routes disagree under ${spelling}`)
        .toBe(keyPart(generated as string));
    }
  });

  it('spells the key on BOTH routes, never the stored identity', () => {
    const song = mkSong({ key: 'F#' });
    for (const [spelling, sign] of [['flat', FLAT_SIGN], ['sharp', SHARP_SIGN]] as const) {
      for (const label of [generatedPrepLabel(song, spelling), swappedPrepLabel(song, spelling)]) {
        expect(label, `${spelling}: ${label}`).toContain(sign);
        // 'F#' is what songs.key holds. It must not reach the label.
        expect(label, `${spelling}: identity leaked into "${label}"`).not.toContain('F#');
      }
    }
  });

  it('leaves a natural-key song identical in both spellings', () => {
    const song = mkSong({ key: 'C' });
    const a = generatedPrepLabel(song, 'flat');
    const b = generatedPrepLabel(song, 'sharp');
    expect(a).toBe(b);
    expect(a).toContain('· C ');
  });
});
