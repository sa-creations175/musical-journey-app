/**
 * The settings tree: module → submodule → skill.
 *
 * =====================================================================
 * NO ORDER IS DEFINED HERE. EVERY LEVEL IS READ FROM WHAT ALREADY
 * ORDERS THAT LEVEL SOMEWHERE ELSE.
 *
 *   modules      `MODULE_ORDER`            — the nav's own list
 *   ear training `EAR_TRAINING_SUB_MODULES` — its home cards
 *   reading      `READING_SKILL_ORDER`     — its tab strip
 *   shapes       `SHAPES_SECTIONS`         — its home cards
 *   production   `VOCAB_CLUSTER_ORDER`     — the vocabulary deck
 *   ET tabs      the `DrillTab` union in db.ts
 *
 * A second list here would be a second answer to "what order are the
 * modules in", and the two would diverge the first time one of them
 * was reordered. The spec's mockup shows Reading first; the nav says
 * Harmonic Fluency first, and the nav wins — that is what "read it
 * from wherever the navbar gets it" means.
 * =====================================================================
 */

import { MODULE_ORDER } from '../moduleMeta';
import { EAR_TRAINING_SUB_MODULES } from '../../modules/ear-training/homeCards';
import { READING_SKILL_ORDER, READING_SKILL_LABELS } from '../../modules/reading/homeCards';
import { SHAPES_SECTIONS } from '../../modules/shapes-and-patterns/homeCards';
import {
  CATEGORY_LABELS, CATEGORY_ORDER, FLASHCARDS,
} from '../../modules/harmonic-fluency/catalog';

export type TreeLevel = 'module' | 'submodule' | 'skill';

export interface SpacingNode {
  /** Unique within the tree. Dotted for depth: `ear-training.intervals`. */
  id: string;
  label: string;
  level: TreeLevel;
  children: SpacingNode[];
  /**
   * The `moduleRef` this node's cards write under, when it has one.
   * Several tree nodes can share a moduleRef — the three chord
   * progression tabs all write `chord-progressions` — which is why
   * `itemRefMatch` exists to tell them apart.
   */
  moduleRef?: string;
  /**
   * How to tell whether a given itemRef belongs to this node, when the
   * moduleRef alone cannot. Absent on nodes whose moduleRef is enough.
   */
  itemRefMatch?: (itemRef: string) => boolean;
}

const node = (
  id: string,
  label: string,
  level: TreeLevel,
  extra: Partial<SpacingNode> = {},
): SpacingNode => ({ id, label, level, children: [], ...extra });

/**
 * Reading's four skills live in an itemRef PREFIX, not a moduleRef —
 * the module writes one row type and encodes the skill in the id, so
 * that is what the tree has to match on.
 */
function readingChildren(): SpacingNode[] {
  return READING_SKILL_ORDER.map(skill =>
    node(`reading.${skill}`, READING_SKILL_LABELS[skill], 'submodule', {
      moduleRef: 'reading',
      itemRefMatch: (ref) => ref.split(':')[0] === skill,
    }),
  );
}

/**
 * Ear training's four submodules are separate moduleRefs, and two of
 * them split again by `drillTab`. The tab names come from the union in
 * db.ts rather than a list typed here.
 */
function earTrainingChildren(): SpacingNode[] {
  const TABS: Readonly<Record<string, ReadonlyArray<[string, string]>>> = {
    'chord-progressions': [
      ['key-detection', 'key detection'],
      ['chord-motion', 'chord motion'],
      ['full-progression', 'progression ID'],
    ],
    'scales-modes': [
      ['scale', 'hear the scale'],
      ['vamp', 'sit inside'],
    ],
  };

  return EAR_TRAINING_SUB_MODULES.map(sub => {
    const tabs = TABS[sub.id];
    const n = node(`ear-training.${sub.id}`, sub.label, 'submodule', {
      moduleRef: sub.id,
    });
    if (tabs) {
      n.children = tabs.map(([tab, label]) =>
        node(`ear-training.${sub.id}.${tab}`, label, 'skill', {
          moduleRef: sub.id,
          // The tab lives on the attempt row rather than the itemRef,
          // so this match is resolved by the caller passing the tab.
          itemRefMatch: () => false,
        }),
      );
    }
    return n;
  });
}

function shapesChildren(): SpacingNode[] {
  return SHAPES_SECTIONS.map(section =>
    node(`shapes-and-patterns.${section.id}`, section.label, 'submodule', {
      moduleRef: section.id === 'mental-viz' ? 'mental-viz' : 'shapes-and-patterns',
      itemRefMatch: section.itemRefPrefix
        ? (ref) => ref.startsWith(section.itemRefPrefix as string)
        : undefined,
    }),
  );
}

/**
 * Production splits into the vocabulary deck and the lessons.
 *
 * THEY NO LONGER SHARE A moduleRef. Both used to write `production`
 * and the `prod-vocab:` prefix was the only thing separating them;
 * the deck now writes `production-vocabulary`, because a card is
 * scored on attempts and a lesson on ratings, and one memory type
 * cannot take both signals. See `memoryType.ts`.
 *
 * THE NODE STAYS A CHILD OF PRODUCTION, which is the whole reason
 * this is safe. `chainForCard` matches the deepest node whose
 * moduleRef equals the card's, but the chain it returns is the path
 * from the root — so a vocab card still resolves through the
 * Production node above it, and every setting on that node still
 * cascades down. Turning Production off turns the deck off with it.
 *
 * The prefix match is kept rather than dropped. It is redundant while
 * this ref holds only deck rows, and it is what keeps the node honest
 * if anything else is ever filed under the same ref.
 */
function productionChildren(): SpacingNode[] {
  return [
    node('production.vocabulary', 'vocabulary', 'submodule', {
      moduleRef: 'production-vocabulary',
      itemRefMatch: (ref) => ref.startsWith('prod-vocab:'),
    }),
    node('production.lessons', 'lessons', 'submodule', {
      moduleRef: 'production',
      itemRefMatch: (ref) => !ref.startsWith('prod-vocab:'),
    }),
  ];
}

/**
 * Harmonic fluency's categories, in the catalog's own order.
 *
 * THE CARD'S CATEGORY IS LOOKED UP, NEVER PARSED OUT OF ITS ID. The
 * catalog says so in as many words: ids there are positional handles
 * for stored state, and reading one as a schema would mean renumbering
 * a generator moved a reader's settings. So the map is built by
 * walking the cards, which is the only thing that actually knows.
 */
const CATEGORY_BY_CARD_ID: ReadonlyMap<string, string> = new Map(
  FLASHCARDS.map(c => [c.id, c.category as string]),
);

function harmonicFluencyChildren(): SpacingNode[] {
  return CATEGORY_ORDER.map(category =>
    node(`harmonic-fluency.${category}`, CATEGORY_LABELS[category], 'submodule', {
      moduleRef: 'harmonic-fluency',
      itemRefMatch: (ref) => CATEGORY_BY_CARD_ID.get(ref) === category,
    }),
  );
}

const CHILDREN_BY_MODULE: Readonly<Record<string, () => SpacingNode[]>> = {
  'reading': readingChildren,
  'ear-training': earTrainingChildren,
  'shapes-and-patterns': shapesChildren,
  'production': productionChildren,
  'harmonic-fluency': harmonicFluencyChildren,
  // SONGS IS A LEAF, DELIBERATELY. The tree is a tree of KINDS of
  // thing — module, submodule, skill. A song is one instance, not a
  // kind, and instances do not belong in it. If per-song pacing ever
  // becomes a real want it goes on that song's own page.
  'repertoire': () => [],
};

/** The whole tree, rebuilt on demand. Cheap and never stale. */
export function spacingTree(): SpacingNode[] {
  return MODULE_ORDER.map(meta => {
    const children = CHILDREN_BY_MODULE[meta.id]?.() ?? [];
    return node(meta.id, meta.label, 'module', {
      moduleRef: meta.id === 'ear-training' ? undefined : meta.id,
      children,
    });
  });
}

/** Depth-first walk, parents before children. */
export function walkTree(
  nodes: ReadonlyArray<SpacingNode>,
  visit: (n: SpacingNode, chain: SpacingNode[]) => void,
  chain: SpacingNode[] = [],
): void {
  for (const n of nodes) {
    const here = [...chain, n];
    visit(n, here);
    walkTree(n.children, visit, here);
  }
}

/** The chain from root to the node with this id, or null. */
export function chainForId(id: string): SpacingNode[] | null {
  let found: SpacingNode[] | null = null;
  walkTree(spacingTree(), (n, chain) => {
    if (n.id === id) found = chain;
  });
  return found;
}

/**
 * The most specific node for a card, root-first.
 *
 * Falls back to the module node when no child claims the itemRef,
 * which is the correct answer rather than a failure: a module with no
 * submodules, or an item that predates a split, is scheduled by its
 * module's settings.
 */
export function chainForCard(moduleRef: string, itemRef: string): SpacingNode[] {
  const tree = spacingTree();
  let best: SpacingNode[] = [];
  walkTree(tree, (n, chain) => {
    if (n.moduleRef !== moduleRef) return;
    if (n.itemRefMatch && !n.itemRefMatch(itemRef)) return;
    if (chain.length > best.length) best = chain;
  });
  if (best.length > 0) return best;
  // A moduleRef with no node at all — mental-viz style refs that sit
  // under a parent whose own moduleRef differs. Match the module by id.
  const module = tree.find(m => m.id === moduleRef);
  return module ? [module] : [];
}
