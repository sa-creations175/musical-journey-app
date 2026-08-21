/**
 * The row explanations.
 *
 * Two kinds of failure are worth guarding, and they are not the same:
 *
 *   A DESCRIPTION SILENTLY DETACHING FROM ITS ROW. The table is keyed on
 *     the joined path, which changes the day someone renames a segment.
 *     Nothing would break — the row would simply inherit its parent's
 *     explanation and read plausibly — and it would not surface for
 *     months. So every key is asserted to resolve to a real node in an
 *     ASSEMBLED tree, not to a hand-written id.
 *
 *   A HINT THAT DOES NOT CHANGE WITH THE NUMBERS. `advanceHintFor` is
 *     derived, so a fixture where every row is empty cannot tell it from
 *     a constant. Every arithmetic assertion below is against a node
 *     with real, VARYING counts.
 */
import { describe, expect, it } from 'vitest';
import { FLUENCY_POOL_RULE } from '../../../../lib/fluencyPool';
import type { AttemptRecord, ProductionLesson, SpacingState } from '../../../../lib/db';
import {
  DESCRIBED_MODULE_LABELS,
  DESCRIBED_NODE_IDS,
  advanceHintFor,
  rowNotesFor,
  skillDescriptionFor,
} from '../affordances';
import { assembleDashboard, type DashboardSource } from '../load';
import { flatten, leavesOf, type TreeNode } from '../tree';
import { PROGRESSIONS } from '../../../ear-training/chord-progressions/catalog';
import { MENTAL_VIZ_ITEMS } from '../../../shapes-and-patterns/mentalVizLibrary';
import { PRODUCTION_VOCAB_FLASHCARDS } from '../../../production/vocabularyFlashcards';

const NOW = 1_700_000_000_000;

function source(patch: Partial<DashboardSource> = {}): DashboardSource {
  return {
    attempts: [], drillSessions: [], drillSkills: [], spacingRows: [],
    lessons: [], lessonSessions: [],
    repertoire: {
      songs: [], sections: [], keys: [], cells: [], runThroughs: [], practiceLogs: [],
    },
    ...patch,
  };
}

const DASHBOARD = assembleDashboard(source(), NOW);

/** Every node in every module, with the module it belongs to. */
function everyNode(): Array<{ node: TreeNode; moduleId: string }> {
  return DASHBOARD.modules.flatMap(m =>
    flatten(m.root).map(node => ({ node, moduleId: m.moduleId })));
}

const ALL = everyNode();

// =====================================================================
// The keys resolve — the guard that stops a silent detachment
// =====================================================================

describe('every description is attached to a row that exists', () => {
  it('resolves every node-id key against an assembled tree', () => {
    // Guard the guard: this passes vacuously if the table is empty.
    expect(DESCRIBED_NODE_IDS.length).toBeGreaterThan(30);
    const ids = new Set(ALL.map(({ node }) => node.id));
    for (const key of DESCRIBED_NODE_IDS) {
      expect(ids.has(key), `no node with id "${key}"`).toBe(true);
    }
  });

  it('resolves every label key against a row in that module', () => {
    expect(DESCRIBED_MODULE_LABELS.length).toBeGreaterThan(15);
    for (const key of DESCRIBED_MODULE_LABELS) {
      const [moduleId, label] = key.split('::');
      const matches = ALL.filter(
        ({ node, moduleId: m }) => m === moduleId && node.label === label,
      );
      expect(matches.length, `no row "${label}" in ${moduleId}`).toBeGreaterThan(0);
    }
  });

  it('describes every module row and every submodule row', () => {
    // Depth 0 and depth 1 are what the screen opens at. A blank row
    // there is the status report this whole step exists to replace.
    const shallow = ALL.filter(({ node }) => node.depth <= 1);
    expect(shallow.length).toBeGreaterThan(25);
    for (const { node, moduleId } of shallow) {
      const described = skillDescriptionFor(node, moduleId);
      expect(described, `${moduleId} · ${node.label} (depth ${node.depth})`)
        .not.toBeNull();
      expect(described!.text.length).toBeGreaterThan(60);
    }
  });

  it('leaves NO row anywhere without an explanation', () => {
    // ~3,700 rows, ~50 pieces of writing. Anything deeper than a
    // described row inherits the nearest one above it.
    expect(ALL.length).toBeGreaterThan(3000);
    const undescribed = ALL.filter(
      ({ node, moduleId }) => skillDescriptionFor(node, moduleId) === null,
    );
    expect(undescribed.map(u => u.node.id)).toEqual([]);
  });
});

describe('an inherited description says whose it is', () => {
  it('names the row it was written for, and only when inherited', () => {
    const reading = DASHBOARD.modules.find(m => m.moduleId === 'reading')!;
    const skill = reading.root.children.find(c => c.label === 'Notation Shapes')!;

    // The row it was written for claims it outright.
    expect(skillDescriptionFor(skill, 'reading')!.inheritedFrom).toBeUndefined();

    // An item under it borrows it, and says so — "notation shapes"
    // describes seven rows, and presenting it as this one's own would
    // claim a specificity it has not got.
    const item = leavesOf(skill)[0];
    expect(item).not.toBe(skill);
    const inherited = skillDescriptionFor(item, 'reading')!;
    expect(inherited.inheritedFrom).toBe('Notation Shapes');
    expect(inherited.text).toBe(skillDescriptionFor(skill, 'reading')!.text);
  });

  it('inherits from the NEAREST described ancestor, not the module', () => {
    // Chord motion sits three deep under ear training. A first-chord
    // item must borrow the first-chord row's explanation, not the
    // module's — which would lose the one thing worth knowing about it.
    const et = DASHBOARD.modules.find(m => m.moduleId === 'ear-training')!;
    const firstChord = flatten(et.root).find(
      n => n.id.endsWith('/Chord Motion/First Chord'),
    )!;
    const item = leavesOf(firstChord)[0];
    const inherited = skillDescriptionFor(item, 'ear-training')!;
    expect(inherited.inheritedFrom).toBe('First Chord');
    expect(inherited.text).toContain('minimal scaffold');
  });

  it('names Reading\'s two skills apart, which is what prompted all this', () => {
    const reading = DASHBOARD.modules.find(m => m.moduleId === 'reading')!;
    const shapes = reading.root.children.find(c => c.label === 'Notation Shapes')!;
    const chords = reading.root.children.find(c => c.label === 'Chord Identification')!;
    const shapeText = skillDescriptionFor(shapes, 'reading')!.text;
    const chordText = skillDescriptionFor(chords, 'reading')!.text;

    expect(shapeText).not.toBe(chordText);
    // The silhouette read: one pick from seven, and the three things
    // that are deliberately NOT being asked.
    expect(shapeText).toContain('seven');
    expect(shapeText).toContain('shape alone');
    // The conjunctive answer, and the dependency between the two.
    expect(chordText).toContain('inversion AND quality AND clef');
    expect(chordText).toContain('Notation Shapes');
  });
});

// =====================================================================
// What would advance it — derived, so tested against varying counts
// =====================================================================

/** A leaf with a real engagement count, built the way the screen sees
 *  it rather than hand-assembled. */
function leafWith(moduleId: string, predicate: (n: TreeNode) => boolean): TreeNode {
  const module = DASHBOARD.modules.find(m => m.moduleId === moduleId)!;
  return leavesOf(module.root).find(predicate)!;
}

describe('what would advance a leaf', () => {
  it('counts how many MORE attempts a partly-practised item needs', () => {
    // Two attempts on one card, none on another. The fixture VARIES on
    // purpose: with an empty source every leaf reads the same and a
    // constant string would pass.
    const card = PRODUCTION_VOCAB_FLASHCARDS[0];
    const other = PRODUCTION_VOCAB_FLASHCARDS[1];
    const dash = assembleDashboard(source({
      attempts: [0, 1].map(i => ({
        moduleId: 'production', itemId: card.id, correct: true,
        timestamp: NOW - i * 1000,
      } as AttemptRecord)),
    }), NOW);
    const vocab = dash.modules.find(m => m.moduleId === 'production')!;
    const leaves = leavesOf(vocab.root);
    const twoAttempts = leaves.find(l => l.id.endsWith(`/${card.id}`))!;
    const none = leaves.find(l => l.id.endsWith(`/${other.id}`))!;

    expect(twoAttempts.engagementCount).toBe(2);
    expect(none.engagementCount).toBe(0);
    expect(advanceHintFor(twoAttempts, 'production')).toContain('1 more attempt');
    expect(advanceHintFor(none, 'production')).toContain('3 more attempts');
  });

  it('switches to the rolling window once an item is covered', () => {
    const card = PRODUCTION_VOCAB_FLASHCARDS[0];
    const dash = assembleDashboard(source({
      attempts: [0, 1, 2].map(i => ({
        moduleId: 'production', itemId: card.id, correct: true,
        timestamp: NOW - i * 1000,
      } as AttemptRecord)),
    }), NOW);
    const leaf = leavesOf(dash.modules.find(m => m.moduleId === 'production')!.root)
      .find(l => l.id.endsWith(`/${card.id}`))!;
    expect(leaf.engagementCount).toBe(3);
    const hint = advanceHintFor(leaf, 'production');
    expect(hint).toContain('covered');
    expect(hint).toContain('last 20');
    expect(hint).not.toContain('more attempt');
  });

  it('says "rated rep" where nothing is marked right or wrong', () => {
    // Shapes & Patterns has no right answer to be measured against, and
    // a hint saying "attempts" would imply one.
    const shape = leafWith('shapes-and-patterns', n => n.id.includes('/Chord Shapes/'));
    expect(shape.accuracyKind).toBe('self-rated');
    expect(advanceHintFor(shape, 'shapes-and-patterns')).toContain('rated rep');
    const card = leafWith('harmonic-fluency', () => true);
    expect(advanceHintFor(card, 'harmonic-fluency')).toContain('attempt');
    expect(advanceHintFor(card, 'harmonic-fluency')).not.toContain('rated rep');
  });

  it('gives a production lesson its own rule, not an attempt count', () => {
    // A lesson is not a rep you repeat, so counting attempts would be
    // the wrong question entirely.
    const lesson = leafWith('production', n => n.id.includes('/Lessons/'));
    const hint = advanceHintFor(lesson, 'production');
    expect(hint).toContain('tried it');
    expect(hint).toContain('deep dive');
    expect(hint).not.toContain('3 more');
  });

  it('gives a repertoire section the CELL GATE, at the number', () => {
    // RULE_LEGIBILITY §3.8 calls this the best-surfaced rule in the app
    // — stated in five places, every one of them at the drill. This is
    // where the number gets read, and it was the one place it was not.
    const dash = assembleDashboard(source({
      repertoire: {
        songs: [{
          id: 's1', title: 'Nothing Even Matters', learningOrder: 1,
        } as never],
        sections: [{
          id: 'sec1', songId: 's1', name: 'Verse 1', displayOrder: 1,
          isArchived: false,
        } as never],
        keys: [], cells: [], runThroughs: [], practiceLogs: [],
      },
    }), NOW);
    const section = leavesOf(
      dash.modules.find(m => m.moduleId === 'repertoire')!.root,
    )[0];
    const hint = advanceHintFor(section, 'repertoire');
    expect(hint).toContain('three consecutive clean');
    expect(hint).toContain('performance tempo − 10');
    // And that coverage is a different record from the score.
    expect(hint).toContain('practice session');
  });
});

describe('what would advance a parent', () => {
  it('says how many items are short, and that the percentage cannot', () => {
    const reading = DASHBOARD.modules.find(m => m.moduleId === 'reading')!;
    const shapes = reading.root.children.find(c => c.label === 'Notation Shapes')!;
    expect(shapes.totalItems).toBe(7);
    expect(shapes.coveredItems).toBe(0);
    const hint = advanceHintFor(shapes, 'reading');
    expect(hint).toContain('7 items');
    expect(hint).toContain('third');
    expect(hint).toContain('Open this row');
  });

  it('changes as items become covered', () => {
    // THE ASSERTION THAT MAKES THE ONE ABOVE MEAN ANYTHING. A hint that
    // reads "7 items" on an empty fixture proves nothing unless it also
    // reads something else on a fuller one.
    const card = PRODUCTION_VOCAB_FLASHCARDS[0];
    const dash = assembleDashboard(source({
      attempts: [0, 1, 2].map(i => ({
        moduleId: 'production', itemId: card.id, correct: true,
        timestamp: NOW - i * 1000,
      } as AttemptRecord)),
    }), NOW);
    const vocab = dash.modules.find(m => m.moduleId === 'production')!
      .root.children.find(c => c.label === 'Vocabulary')!;
    expect(vocab.coveredItems).toBe(1);
    expect(advanceHintFor(vocab, 'production')).toContain('198 items');
    expect(advanceHintFor(vocab, 'production')).not.toContain('199 items');
  });

  it('says nothing is logged where nothing is, rather than "0 of N"', () => {
    const hf = DASHBOARD.modules.find(m => m.moduleId === 'harmonic-fluency')!;
    expect(hf.root.engagementCount).toBe(0);
    expect(advanceHintFor(hf.root, 'harmonic-fluency'))
      .toContain('Nothing is logged here yet');
  });

  it('says so when everything under a row is covered', () => {
    // Every card in one category, three attempts each. A partial
    // fixture would leave the branch uncovered and the assertion would
    // be testing the other arm.
    const cluster = PRODUCTION_VOCAB_FLASHCARDS[0].clusterId;
    const cards = PRODUCTION_VOCAB_FLASHCARDS.filter(c => c.clusterId === cluster);
    expect(cards.length).toBeGreaterThan(1);
    const dash = assembleDashboard(source({
      attempts: cards.flatMap(card => [0, 1, 2].map(i => ({
        moduleId: 'production', itemId: card.id, correct: true,
        timestamp: NOW - i * 1000,
      } as AttemptRecord))),
    }), NOW);
    const category = flatten(dash.modules.find(m => m.moduleId === 'production')!.root)
      .find(n => n.children.length > 0 && n.totalItems === cards.length
        && n.coveredItems === cards.length)!;
    expect(category, 'no fully covered branch in the fixture').toBeDefined();
    expect(advanceHintFor(category, 'production')).toContain('Everything under this row');
    expect(advanceHintFor(category, 'production')).not.toContain('still under');
  });
});

// =====================================================================
// What is odd about these numbers
// =====================================================================

describe('the row notes', () => {
  const spModule = () =>
    DASHBOARD.modules.find(m => m.moduleId === 'shapes-and-patterns')!;

  it('says mental visualisation does not roll up, and why', () => {
    const mv = spModule().root.children.find(c => c.label === 'Mental Visualisation')!;
    expect(mv.excludedFromParentTotals).toBe(true);
    const notes = rowNotesFor(mv, 'shapes-and-patterns').join(' ');
    expect(notes).toContain('not counted in the Shapes & Patterns totals');
    expect(notes).toContain('builds the physical skill rather than measuring it');
    // The half that DOES roll up, or the note overstates the exclusion.
    expect(notes).toContain('recency');
  });

  it('says the mental-viz attempt count is a floor, at every depth', () => {
    const mv = spModule().root.children.find(c => c.label === 'Mental Visualisation')!;
    const item = leavesOf(mv)[0];
    for (const node of [mv, item]) {
      expect(rowNotesFor(node, 'shapes-and-patterns').join(' '), node.label)
        .toContain('floor rather than a total');
    }
    // And NOT on a sibling that has no such cap.
    const shapes = spModule().root.children.find(c => c.label === 'Chord Shapes')!;
    expect(rowNotesFor(shapes, 'shapes-and-patterns').join(' '))
      .not.toContain('floor rather than a total');
  });

  it('states ungroupable progression attempts, and only when there are some', () => {
    const et = DASHBOARD.modules.find(m => m.moduleId === 'ear-training')!;
    const progressions = et.root.children.find(c => c.label === 'Chord Progressions')!;

    // Silent at zero: there is then nothing to explain, and a note
    // saying "0 attempts predate tracking" is noise.
    expect(rowNotesFor(progressions, 'ear-training', {
      ungroupableProgressionAttempts: 0,
    }).join(' ')).not.toContain('predate');

    const said = rowNotesFor(progressions, 'ear-training', {
      ungroupableProgressionAttempts: 12,
    }).join(' ');
    expect(said).toContain('12 stored attempts');
    expect(said).toContain('one chord rather than one');

    // And nowhere else — the rule is about this module's storage.
    expect(rowNotesFor(
      et.root.children.find(c => c.label === 'Intervals')!,
      'ear-training',
      { ungroupableProgressionAttempts: 12 },
    ).join(' ')).not.toContain('predate');
  });

  it('explains a dash on a row whose items are scored differently', () => {
    const dash = assembleDashboard(source({
      lessons: [{
        id: 'wf-01', pathId: 'workflow', order: 1, rating: 100,
        revisitCount: 1, lastOpenedAt: NOW, createdAt: NOW, updatedAt: NOW,
      } as ProductionLesson],
      attempts: [{
        moduleId: 'production', itemId: PRODUCTION_VOCAB_FLASHCARDS[0].id,
        correct: true, timestamp: NOW,
      } as AttemptRecord],
    }), NOW);
    const prod = dash.modules.find(m => m.moduleId === 'production')!.root;
    // Guard the guard: both branches must be graded, or the row is null
    // for want of scores rather than for mixing units.
    expect(prod.children.find(c => c.label === 'Lessons')!.score).not.toBeNull();
    expect(prod.children.find(c => c.label === 'Vocabulary')!.score).not.toBeNull();
    expect(prod.mixedKinds).toBe(true);
    expect(rowNotesFor(prod, 'production').join(' '))
      .toContain('scored in different ways');
  });

  it('accounts for focus-protected attempts at the item that has them', () => {
    // The gap between "12 attempts" and a score computed over 8 of them
    // is exactly the kind of silence this screen exists to end.
    const card = PRODUCTION_VOCAB_FLASHCARDS[0];
    const dash = assembleDashboard(source({
      attempts: [0, 1, 2, 3].map(i => ({
        moduleId: 'production', itemId: card.id, correct: true,
        timestamp: NOW - i * 1000,
        ...(i < 3 ? { excludeFromFluency: true } : {}),
      } as AttemptRecord)),
    }), NOW);
    const leaf = leavesOf(dash.modules.find(m => m.moduleId === 'production')!.root)
      .find(l => l.id.endsWith(`/${card.id}`))!;
    expect(leaf.stats!.excludedByReason['focus-pool']).toBe(3);
    const notes = rowNotesFor(leaf, 'production').join(' ');
    expect(notes).toContain('3 of these attempts');
    expect(notes).toContain(FLUENCY_POOL_RULE);
    expect(notes).toContain('coverage and recency');

    // And absent on an item with none.
    const clean = leavesOf(DASHBOARD.modules.find(m => m.moduleId === 'production')!.root)
      .find(l => l.id.endsWith(`/${card.id}`))!;
    expect(rowNotesFor(clean, 'production').join(' ')).not.toContain('focus pool');
  });

  it('says a song\'s keys are not in its coverage', () => {
    const dash = assembleDashboard(source({
      repertoire: {
        songs: [{ id: 's1', title: 'Song', learningOrder: 1 } as never],
        sections: [{
          id: 'sec1', songId: 's1', name: 'Verse 1', displayOrder: 1,
          isArchived: false,
        } as never],
        keys: [], cells: [], runThroughs: [], practiceLogs: [],
      },
    }), NOW);
    const song = dash.modules.find(m => m.moduleId === 'repertoire')!.root.children[0];
    expect(song.depth).toBe(1);
    expect(rowNotesFor(song, 'repertoire').join(' '))
      .toContain('counts sections, not keys');
  });

  it('is EMPTY on an ordinary row', () => {
    // Guard the guard for every assertion above: if notes appeared on
    // everything, "it says X" would prove nothing. A warning on every
    // row is a warning on none.
    const reading = DASHBOARD.modules.find(m => m.moduleId === 'reading')!;
    const shapes = reading.root.children.find(c => c.label === 'Notation Shapes')!;
    expect(rowNotesFor(shapes, 'reading')).toEqual([]);
    expect(rowNotesFor(leavesOf(shapes)[0], 'reading')).toEqual([]);
  });
});

describe('the mental-viz spacing rows still reach their own numbers', () => {
  it('reads a floor count off real stored history', () => {
    // Not an assertion about the note — an assertion that the node the
    // note describes genuinely carries the capped count.
    const item = MENTAL_VIZ_ITEMS[0];
    const dash = assembleDashboard(source({
      spacingRows: [{
        moduleRef: 'mental-viz', itemRef: item.itemRef,
        performanceHistory: Array.from({ length: 20 }, (_, i) => ({
          kind: 'rating', rating: 'flying', t: NOW - i * 1000,
        })),
        lastEngagedAt: NOW, nextDueAt: null,
      } as unknown as SpacingState],
    }), NOW);
    const leaf = leavesOf(
      dash.modules.find(m => m.moduleId === 'shapes-and-patterns')!.root,
    ).find(l => l.id.endsWith(`/${item.itemRef}`))!;
    expect(leaf.engagementCount).toBe(20);
    expect(rowNotesFor(leaf, 'shapes-and-patterns').join(' '))
      .toContain('only its last 20 reps per item');
  });
});

describe('the chord-progression catalog still holds what the notes assume', () => {
  it('has progressions to be ungroupable about', () => {
    expect(PROGRESSIONS.length).toBeGreaterThan(0);
  });
});

// =====================================================================
// The copy obeys the same writing rules as the column legends
// =====================================================================

/**
 * A dashboard with data in EVERY branch that produces its own copy.
 *
 * THE EMPTY FIXTURE WOULD MAKE THE SWEEP BELOW USELESS, and it did:
 * `DASHBOARD` is assembled from nothing, so repertoire has no songs,
 * no section rows and therefore none of its hints or notes. The first
 * version of these guards swept it, reported 60-odd strings, and could
 * not see the repertoire copy at all — reintroducing a defence there
 * passed. Found by reversing, not by reading.
 *
 * So: a song with sections and a logged practice, a rated lesson beside
 * scored vocabulary (which is what makes production mixed-kind), and
 * focus-protected attempts. `sweepReachesEveryBranch` asserts it stayed
 * that way.
 */
const RICH = assembleDashboard(source({
  attempts: [
    ...[0, 1, 2, 3].map(i => ({
      moduleId: 'production', itemId: PRODUCTION_VOCAB_FLASHCARDS[0].id,
      correct: true, timestamp: NOW - i * 1000,
      ...(i < 3 ? { excludeFromFluency: true } : {}),
    } as AttemptRecord)),
  ],
  lessons: [{
    id: 'wf-01', pathId: 'workflow', order: 1, rating: 100,
    revisitCount: 1, lastOpenedAt: NOW, createdAt: NOW, updatedAt: NOW,
  } as ProductionLesson],
  repertoire: {
    songs: [{ id: 's1', title: 'Nothing Even Matters', learningOrder: 1 } as never],
    sections: [
      { id: 'sec1', songId: 's1', name: 'Verse 1', displayOrder: 1, isArchived: false } as never,
      { id: 'sec2', songId: 's1', name: 'Chorus', displayOrder: 2, isArchived: false } as never,
    ],
    keys: [], cells: [], runThroughs: [],
    practiceLogs: [{
      id: 'p1', songId: 's1', sectionIds: ['sec1'], timestamp: NOW, durationMinutes: 20,
    } as never],
  },
}), NOW);

const RICH_NODES = RICH.modules.flatMap(m =>
  flatten(m.root).map(node => ({ node, moduleId: m.moduleId })));

/**
 * Every string this file can put on screen: descriptions, the derived
 * hints for a spread of real row shapes, and every note.
 *
 * Built from ASSEMBLED nodes rather than hand-written samples, so a
 * sentence that only appears for one row shape is still covered.
 */
function everyVisibleString(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { node, moduleId } of RICH_NODES) {
    const described = skillDescriptionFor(node, moduleId);
    if (described && !seen.has(described.text)) {
      seen.add(described.text);
      out.push(described.text);
    }
    const hint = advanceHintFor(node, moduleId);
    if (!seen.has(hint)) { seen.add(hint); out.push(hint); }
    // Both counts supplied, so the notes that need one are reached.
    for (const note of rowNotesFor(node, moduleId, {
      ungroupableProgressionAttempts: 7,
    })) {
      if (!seen.has(note)) { seen.add(note); out.push(note); }
    }
  }
  return out;
}

describe('the row copy obeys the legends\' writing rules', () => {
  const strings = everyVisibleString();

  it('sweeps every branch that has copy of its own', () => {
    // GUARD THE GUARD, and it is load-bearing: swept against an empty
    // fixture these rules cannot see repertoire, production's mixed-kind
    // dash, or a focus-protected item, and a defence reintroduced in any
    // of them passes. Each phrase below comes from exactly one branch.
    const all = strings.join('   ');
    const branches: Array<[string, string]> = [
      ['repertoire section hint', 'three consecutive clean'],
      ['repertoire keys note', 'counts sections, not keys'],
      ['ungraded practice note', 'no pass or fail'],
      ['production lesson hint', 'Rating this lesson'],
      ['mixed-kind note', 'scored in different ways'],
      ['focus-protected note', FLUENCY_POOL_RULE],
      ['mental-viz exclusion', 'Shapes & Patterns totals'],
      ['mental-viz floor', 'floor rather than a total'],
      ['ungroupable note', 'one chord rather than one'],
      ['uncovered item hint', 'would cover it'],
      ['uncovered group hint', 'Open this row to see which'],
    ];
    for (const [name, phrase] of branches) {
      expect(all, `${name} is not in the sweep`).toContain(phrase);
    }
  });

  it('uses no structural word the reader has not been given', () => {
    // Same rule as the column panels, and the same five words. The row
    // panel has no vocabulary strip of its own, so it avoids them
    // outright rather than defining them on every one of 3,266 rows.
    //
    // `leaves` stays out of the pattern: it is the verb far more often
    // than the tree's noun, and a guard that fires on ordinary English
    // gets weakened rather than obeyed.
    const undefinedTerms = /\b(parent|child|children|branch|branches|leaf|descendant|descendants)\b/i;
    for (const text of strings) {
      expect(text, text.slice(0, 70)).not.toMatch(undefinedTerms);
    }
    // Guard the guard: a fixture of two strings would pass this.
    expect(strings.length).toBeGreaterThan(60);
  });

  it('explains rather than defends', () => {
    // THE REFRAME. The first version argued against alternatives nobody
    // proposed — "rolling them together would let an hour of noodling
    // read as a clean run-through", "counting them would make songs
    // incomparable". That is the author's reasoning from the design
    // session, written as though the reader shares the context.
    //
    // The tell is a counterfactual: "would have", "would make", "would
    // mean". Caught here because it is mechanical; whether a sentence
    // actually reads as help is not something a test can settle.
    const counterfactual =
      /\bwould (make|let|mean|produce|read|reverse|be|have|leave|put|give)\b/i;
    for (const text of strings) {
      expect(text, text.slice(0, 70)).not.toMatch(counterfactual);
    }
  });

  it('does not tell the reader a decision was deliberate', () => {
    // "Deliberately", "on purpose" and "by design" are addressed to
    // someone who might otherwise think it a mistake — which is a
    // conversation with a reviewer, not with a player.
    for (const text of strings) {
      expect(text, text.slice(0, 70))
        .not.toMatch(/\b(deliberately|on purpose|by design)\b/i);
    }
  });
});
