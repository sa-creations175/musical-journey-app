/**
 * App start runs no harmonic-fluency migration.
 *
 * =====================================================================
 * THE END STATE OF THE RESTRUCTURE, ASSERTED RATHER THAN ANNOUNCED.
 *
 * Eleven one-time passes ran in the boot path between commits 5 and 8 —
 * seven fold-ins, the retired-category move, the identity-id move, the
 * `ksc-3` row cleanup and the orphan deletion. Every one was safe, and
 * every one was a thing a reader's first paint waited on and a thing
 * the next person to change a card's wording had to reason about.
 *
 * They have run on both devices and they are gone (commit 9). NOTHING
 * ENFORCES THAT BUT THIS: a mover is easy to add back, boots fine, and
 * says nothing on a database where it finds no work — so its return
 * would look exactly like its absence.
 *
 * =====================================================================
 * IT READS THE SOURCE, BECAUSE THAT IS WHERE THE CLAIM LIVES.
 *
 * The boot path is a `useEffect` in `App.tsx`. Rendering the whole app
 * to watch what it calls would need a database, a router and an auth
 * provider, and would prove less: what is being asserted is that the
 * CODE does not reach for a mover, not that one particular run of it
 * happened not to.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import APP from '../../../App.tsx?raw';
import { describeOrphans } from '../orphanedCardSweep';

/** Every module `App.tsx` imports from this one. */
function harmonicFluencyImports(): string[] {
  return [...APP.matchAll(/from '\.\/modules\/harmonic-fluency\/([^']+)'/g)]
    .map(m => m[1]);
}

describe('the boot path holds no harmonic-fluency mover', () => {
  it('imports one non-component module from the family, and it is the sweep', () => {
    // The components are routed, not run at start; the sweep is the
    // only thing `App.tsx` calls into the family for.
    const modules = harmonicFluencyImports()
      .filter(m => !m.startsWith('HarmonicFluency'));
    expect(modules).toEqual(['orphanedCardSweep']);
  });

  it('names no fold-in, migration or cleanup module', () => {
    // By NAME as well as by list, so a mover added under a new file
    // name still has to get past something.
    for (const m of harmonicFluencyImports()) {
      expect(m, m).not.toMatch(/FoldIn|Migration|migrate|Cleanup$/i);
    }
  });

  it('calls no mover, by the names the deleted ones used', () => {
    for (const call of [
      'foldInSlashCCards', 'foldInModeCards', 'foldInIntervalCards',
      'foldInSlashCards', 'foldInKeySignatureCards', 'foldInPentatonicCards',
      'foldInProgressionCards', 'migrateRetiredCategories',
      'migrateIdentityCardIds', 'cleanUpRetiredCard', 'cleanUpOrphanedCards',
      'moveCardRows', 'foldInByIdentity',
    ]) {
      expect(APP, call).not.toContain(call);
    }
  });

  it('reaches for nothing that fold-in machinery would need', () => {
    // `cardRowMove` and `foldInByIdentity` went with their last
    // callers. Nothing in the family should import them again — and
    // "nothing" includes a module that has not been written yet, which
    // is why this reads the whole directory.
    const modules = import.meta.glob('../*.ts', { query: '?raw', import: 'default', eager: true });
    const offenders = Object.entries(modules as Record<string, string>)
      .filter(([, src]) => /from '\.\/(cardRowMove|foldInByIdentity)'/.test(src))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('has deleted the mover modules, not merely unwired them', () => {
    const present = Object.keys(
      import.meta.glob('../*.ts', { query: '?raw', import: 'default', eager: true }),
    ).map(p => p.replace('../', ''));
    for (const gone of [
      'cardRowMove.ts', 'foldInByIdentity.ts', 'identityIdMigration.ts',
      'retiredCategoryMigration.ts', 'retiredCardCleanup.ts',
      'progressionFoldIn.ts', 'intervalFoldIn.ts', 'modeFoldIn.ts',
      'slashFoldIn.ts', 'slashCFoldIn.ts', 'keySignatureFoldIn.ts',
      'pentatonicFoldIn.ts',
    ]) {
      expect(present, gone).not.toContain(gone);
    }
  });
});

describe('what the boot path does still do', () => {
  it('runs the orphan sweep, which is a check and not a step', () => {
    expect(APP).toContain('reportOrphanedCards()');
    // AND PRINTS NOTHING WHEN THERE IS NOTHING TO SAY. A boot line on
    // every start is a boot line nobody reads.
    expect(describeOrphans({ orphans: [] })).toBeNull();
  });

  it('has no harmonic-fluency console line left to print', () => {
    // The eleven passes each logged what they moved. Those lines are
    // gone with them; the sweep's is the only `[hf]` string left, and
    // it fires on a state that should not exist.
    const lines = [...APP.matchAll(/'\[hf\][^']*'/g)].map(m => m[0]);
    expect(lines).toEqual(["'[hf] orphaned-card sweep failed'"]);
  });
});
