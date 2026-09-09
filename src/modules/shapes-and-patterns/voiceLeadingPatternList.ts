/**
 * The list of voice-leading patterns the page draws — the catalog,
 * with the reader's renames applied.
 *
 * =====================================================================
 * A PATTERN OF THE READER'S OWN IS NO LONGER A THING (ruling 32).
 *
 * There used to be an "+ Add Voice-Leading Pattern" box. What it made
 * was a row with a name and nothing behind it: no `kind`, no `types`,
 * no `positions`, so no sub-cells, no itemRefs, no spacing rows — a
 * grid that printed "sub-cell drill flow isn't available" and could
 * never be drilled. It was a promise the app could not keep, and the
 * thing it was reaching for exists properly now: a MOVEMENT, which
 * Silas builds bar by bar and which drills like everything else.
 *
 * So the box is gone, and a stored row it left behind is dropped here
 * as well as deleted by the database migration — a device that pulls
 * an old pref from another one before upgrading should not resurrect
 * a row nothing can drill.
 *
 * =====================================================================
 * WHAT SURVIVES IS THE OVERRIDE, AND IT USED TO CONCATENATE.
 *
 * The page built `[...catalog, ...custom]`. Renaming a built-in wrote a
 * custom entry carrying the BUILT-IN'S OWN ID and never removed the
 * built-in it claimed to override, so `minor-251` appeared in both
 * halves and rendered twice: once as a working grid and once as a
 * second section whose cells had no click handler and whose React key
 * collided with the first.
 *
 * An override is an override. A stored entry whose id matches a
 * built-in REPLACES fields on that built-in; one id, one section,
 * always. An entry whose id matches nothing is not a pattern — it is
 * the residue of a feature that has been removed.
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
}

/**
 * The prefix the removed "+ Add Voice-Leading Pattern" box minted its
 * ids under — `custom-<when>-<random>`.
 *
 * NAMED RATHER THAN DERIVED FROM THE CATALOG, so the database
 * migration and this file can agree without the migration having to
 * import a module catalog that will keep changing. A catalog id has
 * never looked like this and never will; anything wearing it came out
 * of that box.
 */
export const REMOVED_CUSTOM_PATTERN_PREFIX = 'custom-';

/** Whether a stored entry is one of the un-drillable rows ruling 32
 *  removed. */
export function isRemovedCustomPattern(entry: { id: string }): boolean {
  return entry.id.startsWith(REMOVED_CUSTOM_PATTERN_PREFIX);
}

// THERE IS NO `overridden` FLAG, and its absence is deliberate. It
// existed to drive a restore control, and there is no restore control:
// renaming is a display name, and typing the shipped name back is how
// it is undone. Nothing on screen distinguishes a renamed pattern from
// one that was never renamed, so nothing needs to ask.

/**
 * An override is IGNORED when its label matches the built-in's.
 *
 * A stray click on a pattern title saves on blur, which writes an
 * override that changes nothing — the exact row that produced the
 * duplicate grid. Treating that as absent makes such a row harmless
 * where it already exists, with no write to the reader's database and
 * no cleanup migration. `applyRename` stops new ones being created;
 * this handles the ones already out there.
 *
 * It is also what makes renaming reversible without a control: type
 * the shipped name back and the override stops existing, at both ends.
 */
export function overrideIsEmpty(
  override: CustomPattern,
  builtinLabel: string,
): boolean {
  return override.label.trim() === builtinLabel.trim();
}

/**
 * The catalog, in catalog order, with any rename applied.
 *
 * ONE SECTION PER CATALOG PATTERN AND NO OTHERS. A stored entry whose
 * id is a catalog id is an override; one whose id is not is residue
 * (ruling 32) and adds nothing.
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

  return VOICE_LEADING_PATTERNS.map(p => {
    const o = overrideById.get(p.id);
    const active = o !== undefined && !overrideIsEmpty(o, p.label);
    return {
      id: p.id,
      label: active ? o!.label : p.label,
      ...( (active ? o!.description : p.description) !== undefined
        ? { description: active ? o!.description : p.description }
        : {}),
    };
  });
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

  // NOT A CATALOG PATTERN, so there is nothing to rename: the only
  // rows on the page are built-ins (ruling 32). `null` means write
  // nothing.
  return null;
}

/**
 * `applyRemove` WAS HERE, and it went with the thing it removed
 * (ruling 32). It deleted a stored entry by id, which for a built-in's
 * override was a restore-the-shipped-name control nothing on screen
 * offered, and for a pattern of the reader's own was the Remove beside
 * a row that could never be drilled. Neither exists now: a rename is
 * undone by typing the shipped name back, and there is nothing else in
 * the list to remove.
 */
