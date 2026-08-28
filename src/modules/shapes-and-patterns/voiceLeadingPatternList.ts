/**
 * The list of voice-leading patterns the page draws — catalog and the
 * reader's own, MERGED BY ID.
 *
 * =====================================================================
 * IT USED TO CONCATENATE, AND THAT IS THE WHOLE BUG.
 *
 * The page built `[...catalog, ...custom]`. Renaming a built-in wrote a
 * custom entry carrying the BUILT-IN'S OWN ID and never removed the
 * built-in it claimed to override, so `minor-251` appeared in both
 * halves and rendered twice: once as a working grid and once as a
 * second section whose cells had no click handler and whose React key
 * collided with the first.
 *
 * An override is an override. A custom entry whose id matches a
 * built-in REPLACES fields on that built-in; it never becomes a
 * pattern of its own. One id, one section, always.
 * =====================================================================
 */
import { VOICE_LEADING_PATTERNS } from './catalog';

/** What the reader's stored list holds. */
export interface CustomPattern {
  id: string;
  label: string;
  description?: string;
  createdAt: number;
}

/**
 * What an override is allowed to supply, written down rather than
 * implied: THE LABEL AND THE DESCRIPTION. Nothing else.
 *
 * Not the id — that is the join key, and letting it move would make an
 * override point at a different pattern than the one it overrides. Not
 * the catalog shape (`kind`, `types`, `positions`): those decide which
 * sub-cells exist, which itemRefs are legal and which spacing rows the
 * grid reads. A reader renaming a row must not be able to change what
 * the row IS.
 */
export type OverridableField = 'label' | 'description';

export interface DisplayPattern {
  id: string;
  label: string;
  description?: string;
  /**
   * The id is in the catalog.
   *
   * TRUE FOR AN OVERRIDDEN BUILT-IN TOO, and that is the property the
   * old code got wrong. It drives whether cells are drillable, and an
   * overridden built-in is still a built-in — renaming a pattern must
   * not take its drill flow away.
   */
  builtin: boolean;
  /** The reader has supplied fields for this one. Drives the control
   *  that puts it back. */
  overridden: boolean;
}

/**
 * An override is IGNORED when its label matches the built-in's.
 *
 * A stray click on a pattern title saves on blur, which writes an
 * override that changes nothing — the exact row that produced the
 * duplicate grid. Treating that as absent makes such a row harmless
 * where it already exists, with no write to the reader's database and
 * no cleanup migration. `applyRename` stops new ones being created;
 * this handles the ones already out there.
 */
export function overrideIsEmpty(
  override: CustomPattern,
  builtinLabel: string,
): boolean {
  return override.label.trim() === builtinLabel.trim();
}

/**
 * Catalog first, in catalog order, then the reader's own patterns.
 *
 * A custom entry is either an OVERRIDE (its id is a catalog id) or a
 * PATTERN OF ITS OWN (its id is not). The first never adds a section;
 * the second always does.
 */
export function mergePatternList(
  custom: ReadonlyArray<CustomPattern>,
): DisplayPattern[] {
  const catalogIds: ReadonlySet<string> =
    new Set<string>(VOICE_LEADING_PATTERNS.map(p => p.id));
  const overrideById = new Map<string, CustomPattern>();
  for (const c of custom) {
    if (catalogIds.has(c.id)) overrideById.set(c.id, c);
  }

  const merged: DisplayPattern[] = VOICE_LEADING_PATTERNS.map(p => {
    const o = overrideById.get(p.id);
    const active = o !== undefined && !overrideIsEmpty(o, p.label);
    return {
      id: p.id,
      label: active ? o!.label : p.label,
      ...( (active ? o!.description : p.description) !== undefined
        ? { description: active ? o!.description : p.description }
        : {}),
      builtin: true,
      overridden: active,
    };
  });

  for (const c of custom) {
    if (catalogIds.has(c.id)) continue;
    merged.push({
      id: c.id,
      label: c.label,
      ...(c.description !== undefined ? { description: c.description } : {}),
      builtin: false,
      overridden: false,
    });
  }

  return merged;
}

/**
 * The stored list after a rename, or `null` when nothing should be
 * written.
 *
 * DELETE ON DEFAULT, the same rule the cell note boxes use: a rename
 * back to the built-in's own label removes the override rather than
 * storing one that says nothing. That is what stops a stray click on a
 * title from leaving a row behind at all.
 */
export function applyRename(
  custom: ReadonlyArray<CustomPattern>,
  patternId: string,
  rawLabel: string,
  now: number,
): CustomPattern[] | null {
  const label = rawLabel.trim();
  if (label === '') return null;

  const builtin = VOICE_LEADING_PATTERNS.find(p => p.id === patternId);
  const without = custom.filter(c => c.id !== patternId);

  if (builtin) {
    // Back to the shipped name — the override has nothing to say.
    if (label === builtin.label.trim()) return without;
    return [...without, {
      id: builtin.id,
      label,
      ...(builtin.description !== undefined
        ? { description: builtin.description }
        : {}),
      createdAt: now,
    }];
  }

  const existing = custom.find(c => c.id === patternId);
  if (!existing) return null;
  return [...without, { ...existing, label }];
}

/**
 * The stored list after Remove.
 *
 * For an OVERRIDDEN BUILT-IN this deletes the override, which restores
 * the catalog default — the pattern itself cannot be removed, because
 * it is shipped. For a pattern of the reader's own it drops the
 * pattern. Both are the same operation on the stored list; they differ
 * only in what remains afterwards.
 */
export function applyRemove(
  custom: ReadonlyArray<CustomPattern>,
  patternId: string,
): CustomPattern[] {
  return custom.filter(c => c.id !== patternId);
}
