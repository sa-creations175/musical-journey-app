/**
 * What a module's CATEGORIES are, as the card view counts them.
 *
 * =====================================================================
 * THE CARD SHOULD AGREE WITH THE MODULE'S OWN HOME PAGE.
 *
 * Every module's strip draws one square per category, taken from the
 * row directly under the module. For five modules that is exactly the
 * list their module home shows as cards, and nothing here has to say
 * anything.
 *
 * PRODUCTION IS THE ONE THAT DOES NOT LINE UP. Its catalog carries an
 * extra level — a lesson's path is `production / Lessons / <path>` — so
 * the row under the module is the single grouping row **Lessons**, and
 * beside Vocabulary that made a strip of TWO squares and a sub-line
 * reading "2 categories". Open Production's module home and there are
 * seven cards: the six lesson paths and Vocabulary. The dashboard was
 * describing the shape of the catalog rather than the shape of the
 * module.
 *
 * =====================================================================
 * IT IS DECLARED, BECAUSE THERE IS NO STRUCTURAL RULE TO FIND.
 *
 * The tempting version reads "look through any row that is only a
 * grouping". Vocabulary is the counter-example: it also has children —
 * seventeen clusters — and it is ONE card on the module home and stays
 * one square. Nothing about the two rows in the tree distinguishes
 * them. Which of them is a grouping and which is a category is an
 * editorial fact about the module, so it is written down as one rather
 * than inferred from a shape that does not carry it.
 *
 * =====================================================================
 * THE TREE IS NOT TOUCHED, DELIBERATELY.
 *
 * The catalog still builds `production / Lessons / <path>`, the tree
 * view still shows the **Lessons** grouping row with the six paths
 * folded under it, and the module filter pills are unchanged. This is
 * the card view reading the same tree differently, not a restructure —
 * flattening the catalog would take that row off the tree, which is a
 * change nobody asked for.
 * =====================================================================
 */
import { PRODUCTION_LESSONS_GROUP } from '../read/catalogs';
import type { ModuleTree } from '../read/query';
import type { TreeNode } from '../read/tree';

/**
 * Rows the card view looks THROUGH rather than at, per module.
 *
 * Empty for every module but production, and it should stay that way
 * without a reason: a module whose catalog matches its own home page
 * needs no entry here, and an entry that is not needed is a second
 * place for the two to disagree.
 */
const LOOK_THROUGH: Readonly<Record<string, readonly string[]>> = {
  production: [PRODUCTION_LESSONS_GROUP],
};

/**
 * A module's categories — one per square on its strip, one row per
 * entry in the skills list.
 *
 * ONE ANSWER FOR BOTH VIEWS. The two tabs of the card view are two
 * shapes of one list, and a category that appeared in one and not the
 * other would make them read as different things.
 */
export function stripCategories(module: ModuleTree): TreeNode[] {
  const through = LOOK_THROUGH[module.moduleId];
  if (through === undefined) return module.root.children;
  return module.root.children.flatMap(child => (
    through.includes(child.label) && child.children.length > 0
      ? child.children
      : [child]
  ));
}
