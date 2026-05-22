/**
 * Proposal block grouping — the single source of truth for which blocks
 * lock together as one draggable / deletable unit. Pure (no React) so
 * both SessionStack (drag UI) and proposalRedistribute (delete) import
 * it; previously the rules were hand-mirrored in two places and drifted.
 *
 * Rules:
 *
 *   1. Rep warm-up → song chain. A repertoire warm-up (chord-quiz /
 *      scale-prep) with an isSongPractice block after it chains forward
 *      to that song — the whole span is one unit. An ORPHANED rep
 *      warm-up (no song after it) does NOT grab an unrelated next block;
 *      it stays on its own (unless Rule 2 applies).
 *
 *   2. Visualization/memorization pair. When an orphaned chord-quiz
 *      (no song anchor) AND a mental-viz block both appear, they lock
 *      together (same cognitive mode). A song-anchored chord-quiz keeps
 *      Rule 1 (chains to its song) instead.
 *
 *   3. ET family. All ET sub-module blocks (intervals, chord-recognition,
 *      chord-progressions, scales-modes) lock together as one unit,
 *      regardless of order or what sits between them.
 *
 *   4. Production family. The Production vocab block and the Production
 *      lesson block both ride the 'production' moduleRef; they lock
 *      together so the flashcard review and lesson work always render
 *      back-to-back (the vocab block is prepended to the card front
 *      while lessons sit in the allocator body, so without this they
 *      drift apart). No anchor/warm-up relationship — just adjacency.
 *
 *   · Everything else is its own unit.
 */
import type { ProposalBlock } from './proposalTypes';
import { ET_MODULE_REFS, PRODUCTION_MODULE_REF } from '../goals/progress';

const ET_REF_SET: ReadonlySet<string> = new Set(ET_MODULE_REFS);

/** A drag/delete unit — one or more blocks locked together. */
export interface BlockGroup {
  /** Stable id for SortableContext — the first item's id. */
  id: string;
  items: ProposalBlock[];
}

/** An Ear-Training sub-module block (intervals / chord-recognition /
 *  chord-progressions / scales-modes). */
export function isEtBlock(b: ProposalBlock): boolean {
  return ET_REF_SET.has(b.moduleRef);
}

/** The mental-visualization block — rides the shapes-and-patterns
 *  moduleRef, so it's identified by its mental-viz quickLaunchRoute. */
export function isMentalVizBlock(b: ProposalBlock): boolean {
  return !!b.quickLaunchRoute?.includes('mental-viz');
}

/** A repertoire warm-up (chord-quiz or scale-prep). */
export function isRepWarmup(b: ProposalBlock): boolean {
  return b.moduleRef === 'repertoire' && !!b.isWarmup;
}

/** A Production block — both the vocab flashcard block and the lesson
 *  block ride the 'production' moduleRef, so the ref alone identifies
 *  the family. */
export function isProductionBlock(b: ProposalBlock): boolean {
  return b.moduleRef === PRODUCTION_MODULE_REF;
}

/** The chord-quiz recall warm-up specifically. Both chord-quiz and
 *  scale-prep are repertoire warm-ups; scale-prep carries
 *  inSessionDrillKind 'scales' (it opens the scales drill), the
 *  chord-quiz recall does not. */
export function isChordQuizBlock(b: ProposalBlock): boolean {
  return isRepWarmup(b) && b.inSessionDrillKind !== 'scales';
}

export function groupBlocks(blocks: ReadonlyArray<ProposalBlock>): BlockGroup[] {
  const n = blocks.length;

  // Rule 1 — rep-warmup → song chains. Mark each block in a chain span
  // [warmup .. song]. Orphaned warm-ups (no song after) get no chain key.
  const chainKey: (string | null)[] = new Array(n).fill(null);
  let i = 0;
  while (i < n) {
    if (isRepWarmup(blocks[i]) && chainKey[i] === null) {
      let anchor = -1;
      for (let j = i + 1; j < n; j++) {
        if (blocks[j].isSongPractice) {
          anchor = j;
          break;
        }
      }
      if (anchor >= 0) {
        const key = `chain:${blocks[i].id}`;
        for (let k = i; k <= anchor; k++) chainKey[k] = key;
        i = anchor + 1;
        continue;
      }
    }
    i += 1;
  }

  // Rule 2 — viz/memo pair applies only when an orphaned chord-quiz and
  // a mental-viz block both exist.
  const orphanChordQuizExists = blocks.some(
    (b, idx) => isChordQuizBlock(b) && chainKey[idx] === null,
  );
  const mentalVizExists = blocks.some(isMentalVizBlock);
  const vizApplies = orphanChordQuizExists && mentalVizExists;

  const keyFor = (b: ProposalBlock, idx: number): string => {
    if (isEtBlock(b)) return 'et-family'; // Rule 3 — highest priority
    if (chainKey[idx] !== null) return chainKey[idx] as string; // Rule 1
    if (vizApplies && (isChordQuizBlock(b) || isMentalVizBlock(b))) return 'viz-memo'; // Rule 2
    if (isProductionBlock(b)) return 'production-family'; // Rule 4
    return `solo:${idx}`;
  };

  // Emit one group per key, in order of each key's first occurrence so
  // a non-contiguous group (ET family, viz pair) renders at the position
  // of its first member.
  const byKey = new Map<string, ProposalBlock[]>();
  const order: string[] = [];
  for (let idx = 0; idx < n; idx++) {
    const key = keyFor(blocks[idx], idx);
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = [];
      byKey.set(key, bucket);
      order.push(key);
    }
    bucket.push(blocks[idx]);
  }
  return order.map(key => {
    const items = byKey.get(key) as ProposalBlock[];
    return { id: items[0].id, items };
  });
}
