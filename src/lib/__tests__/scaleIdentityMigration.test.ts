// @vitest-environment jsdom
/**
 * v36 — scale itemRefs join the identity vocabulary.
 *
 * The scales catalog addressed its spacing rows as `scale:*:Gb` while
 * every other stored key in the app spelled that pitch `F#`. Step 2
 * retired Gb as an identity, so eight refs per user have to move.
 *
 * This is the step that can LOSE something. Everything else in the
 * spelling work is display and reversible by flipping a setting; a
 * migration that drops a row takes acquisition state and due dates with
 * it, and the user would find out weeks later when a cell they had
 * drilled read "not started". So the assertions here are about
 * preservation, not just about the string changing.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type SpacingState } from '../db';
import { SCALE_CELLS } from '../../modules/shapes-and-patterns/scaleSkills';

const NOW = 1_700_000_000_000;

function spacingRow(overrides: Partial<SpacingState>): SpacingState {
  return {
    id: `sp-${Math.round(Math.random() * 1e9)}`,
    itemRef: 'scale:major:C',
    moduleRef: 'shapes-and-patterns',
    hand: 'both',
    style: 'solid',
    memoryType: 'procedural',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 3,
    lastEngagedAt: NOW,
    nextDueAt: NOW + 3 * 86_400_000,
    performanceHistory: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await db.open();
  await db.spacingState.clear();
  await db.practiceBlocks.clear();
});

/**
 * The migration body, lifted verbatim from db.ts v36.
 *
 * Duplicated rather than imported ON PURPOSE. A Dexie upgrade runs once
 * per browser and cannot be re-run to test it; importing the live one
 * is not possible, and re-opening the database at an older version to
 * force a replay is far more fragile than restating eight lines. The
 * cost is that this copy can drift from the real one — so the tests
 * below also assert the PROPERTY the migration exists to establish
 * (no catalog cell is Gb-spelled), which no copy can fake.
 */
function remap(itemRef: string): string | null {
  if (!itemRef.startsWith('scale:')) return null;
  const parts = itemRef.split(':');
  if (parts[parts.length - 1] !== 'Gb') return null;
  parts[parts.length - 1] = 'F#';
  return parts.join(':');
}

describe('the ref rewrite', () => {
  it('moves all eight scale kinds in the retired key, and only those', () => {
    // One major, one natural minor, three starting points each for the
    // two pentatonics — the full set that existed in Gb.
    const retired = [
      'scale:major:Gb',
      'scale:natural-minor:Gb',
      'scale:major-pentatonic:1:Gb',
      'scale:major-pentatonic:5:Gb',
      'scale:major-pentatonic:6:Gb',
      'scale:minor-pentatonic:1:Gb',
      'scale:minor-pentatonic:b3:Gb',
      'scale:minor-pentatonic:b7:Gb',
    ];
    expect(retired).toHaveLength(8);
    for (const ref of retired) {
      expect(remap(ref), ref).toBe(ref.replace(/:Gb$/, ':F#'));
    }
  });

  it('leaves the starting-point segment alone', () => {
    // 'b3' and 'b7' sit one segment before the key and look like flats.
    // Operating on the LAST segment is what keeps them untouched; a
    // naive replace of 'b' would have mangled them.
    expect(remap('scale:minor-pentatonic:b3:Gb')).toBe('scale:minor-pentatonic:b3:F#');
    expect(remap('scale:minor-pentatonic:b7:Gb')).toBe('scale:minor-pentatonic:b7:F#');
  });

  it('declines every ref it should not touch', () => {
    for (const ref of [
      'scale:major:C',            // different key
      'scale:major:F#',           // already migrated — must not double-apply
      'chord-shape:maj:Gb',       // not a scale ref; no chord shape was ever Gb
      'vl:aba-251:Gb',            // ditto voice leading
      'mv:triad:maj:root:Gb',     // ditto mental viz
      'scale:major:Gbb',          // not the retired spelling
      'reading:key-signature:6f', // another module entirely
    ]) {
      expect(remap(ref), ref).toBeNull();
    }
  });

  it('is idempotent — running it twice changes nothing the second time', () => {
    const once = remap('scale:major:Gb');
    expect(once).toBe('scale:major:F#');
    expect(remap(once as string)).toBeNull();
  });
});

describe('what the rewrite preserves', () => {
  it('carries acquisition state and due dates across, not just the name', () => {
    // The whole point. A migration that produced the right itemRef on a
    // freshly-defaulted row would pass a string check and still have
    // thrown away everything the user earned.
    const row = spacingRow({
      id: 'sp-gb-major',
      itemRef: 'scale:major:Gb',
      acquisitionStage: 'consolidated',
      currentIntervalDays: 21,
      lastEngagedAt: NOW - 5 * 86_400_000,
      nextDueAt: NOW + 16 * 86_400_000,
      performanceHistory: [{ rating: 'cruising', at: NOW - 5 * 86_400_000 }],
    });
    const migrated = { ...row, itemRef: remap(row.itemRef) as string };

    expect(migrated.itemRef).toBe('scale:major:F#');
    expect(migrated.id).toBe(row.id);
    expect(migrated.acquisitionStage).toBe('consolidated');
    expect(migrated.currentIntervalDays).toBe(21);
    expect(migrated.lastEngagedAt).toBe(row.lastEngagedAt);
    expect(migrated.nextDueAt).toBe(row.nextDueAt);
    expect(migrated.performanceHistory).toEqual(row.performanceHistory);
  });

  it('keeps each hand and style as its own row', () => {
    // Uniqueness is [moduleRef+itemRef+hand+style]. Rewriting the ref
    // moves six rows onto one new ref; collapsing any of them would
    // silently merge two hands' progress.
    const rows = (['left', 'right', 'both'] as const).flatMap(hand =>
      (['solid', 'arpeggiated'] as const).map(style =>
        spacingRow({ id: `sp-${hand}-${style}`, itemRef: 'scale:major:Gb', hand, style }),
      ),
    );
    const migrated = rows.map(r => ({ ...r, itemRef: remap(r.itemRef) as string }));
    const slots = new Set(
      migrated.map(r => `${r.moduleRef}|${r.itemRef}|${r.hand}|${r.style}`),
    );
    expect(migrated).toHaveLength(6);
    expect(slots.size, 'two rows collapsed onto one slot').toBe(6);
  });
});

/**
 * THE PROPERTY, which no copied migration body can fake.
 *
 * If the catalog still generated a Gb-spelled ref, the migration would
 * be pointless — new rows would immediately be written back into the
 * retired vocabulary. This reads the real catalog.
 */
describe('the catalog itself', () => {
  it('generates no Gb-spelled itemRef, so nothing re-creates the split', () => {
    const offenders = SCALE_CELLS.filter(c => c.itemRef.endsWith(':Gb'));
    expect(offenders.map(c => c.itemRef)).toEqual([]);
  });

  it('generates exactly eight cells in the sixth key, all F#-spelled', () => {
    const sixth = SCALE_CELLS.filter(c => c.keyName === 'F#');
    expect(sixth).toHaveLength(8);
    for (const c of sixth) expect(c.itemRef.endsWith(':F#'), c.itemRef).toBe(true);
  });

  it('still has 96 cells and 12 distinct keys — nothing was lost or doubled', () => {
    // A botched vocabulary swap could leave both spellings present,
    // which would read as 13 keys and 104 cells rather than an error.
    expect(SCALE_CELLS).toHaveLength(96);
    expect(new Set(SCALE_CELLS.map(c => c.keyName)).size).toBe(12);
    expect(new Set(SCALE_CELLS.map(c => c.itemRef)).size).toBe(96);
  });
});
