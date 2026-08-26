/**
 * Where a category row goes when you tap it.
 *
 * =====================================================================
 * THE CATEGORY'S OWN PAGE WHERE ONE EXISTS, THE MODULE HOME WHERE NONE
 * DOES — and it never guesses.
 *
 * Two modules have a page per category: harmonic fluency's
 * `/harmonic-fluency/:category` and reading's `/reading/:skill`. Both
 * open with that category's chip lit and its detail grid below, which
 * is exactly what a reader who tapped a weak row wants next.
 *
 * The other four have no such page. Ear training's sub-modules are
 * their own screens, shapes has one page per sub-module, repertoire is
 * a song list and production is a path. For those the module home is
 * the honest destination, and it is the one `drillTarget` already
 * resolves — asked here rather than reimplemented, so a route that
 * moves moves once.
 * =====================================================================
 *
 * RESOLVED FROM `itemRefs`, NEVER FROM THE LABEL. The dashboard's node
 * labels are Title Cased for display — `titleCase(CATEGORY_LABELS[…])`
 * — so mapping "Scale Degree Math" back to `scale-degree-math` would
 * mean re-deriving a slug from prose. The refs are the stored ids the
 * catalogs were built from, and they parse without ambiguity.
 *
 * A node whose refs resolve to nothing falls back to the module home.
 * That is a real case rather than defensive noise: a merged row can
 * carry refs from more than one category, and a route for "some of
 * these" would be a confident wrong answer.
 */
import { FLASHCARDS } from '../../harmonic-fluency/catalog';
import { categoryPath, isCategory } from '../../harmonic-fluency/categoryRoutes';
import { readingSkillPath } from '../../reading/skillRoutes';
import type { ReadingDrillSkill } from '../../reading/pickCard';
import type { TreeNode } from '../read/tree';
import { drillTargetFor } from '../read/drillTarget';

/** Reading's four stored-ref prefixes, and the skill each belongs to. */
const READING_SKILL_BY_PREFIX: Readonly<Record<string, ReadingDrillSkill>> = {
  'sig': 'sig',
  'note': 'note',
  'shape': 'shape',
  'chord': 'chord',
};

const CATEGORY_BY_CARD_ID = new Map(
  FLASHCARDS.map(card => [card.id, card.category] as const),
);

/**
 * The category page for this node, or null when the module has none —
 * or when the node's refs do not agree on one.
 */
function categoryPageFor(moduleId: string, node: TreeNode): string | null {
  const refs = node.itemRefs;
  if (refs.length === 0) return null;

  if (moduleId === 'harmonic-fluency') {
    const category = CATEGORY_BY_CARD_ID.get(refs[0]);
    if (category === undefined || !isCategory(category)) return null;
    // EVERY ref must agree. A row spanning two categories has no single
    // page, and sending it to the first one's would be a wrong answer
    // delivered confidently.
    const agrees = refs.every(ref => CATEGORY_BY_CARD_ID.get(ref) === category);
    return agrees ? categoryPath(category) : null;
  }

  if (moduleId === 'reading') {
    const skillOf = (ref: string) => READING_SKILL_BY_PREFIX[ref.split(':')[0]];
    const skill = skillOf(refs[0]);
    if (skill === undefined) return null;
    return refs.every(ref => skillOf(ref) === skill)
      ? readingSkillPath(skill)
      : null;
  }

  return null;
}

/**
 * The href for a category row. Always a route — there is no "nowhere to
 * go" outcome, because a module home always exists.
 */
export function categoryHref(moduleId: string, node: TreeNode): string {
  return categoryPageFor(moduleId, node)
    ?? drillTargetFor(node, moduleId).route;
}
