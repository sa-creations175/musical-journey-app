/**
 * Tap-to-drill resolution.
 *
 * The load-bearing assertion is the negative one: a row must never
 * report itself as filtered when the module it points at cannot be
 * told which items to serve.
 */
import { describe, expect, it } from 'vitest';
import {
  drillTargetFor,
  drillTargetSummary,
  drillHref,
  filterableModules,
  smallPoolPromptFor,
  smallPoolPromptText,
} from '../drillTarget';
import type { ModuleCatalog } from '../catalogs';
import { buildMergedTree, buildModuleTree, flatten, leavesOf } from '../tree';
import {
  chordProgressionsCatalog,
  chordRecognitionCatalog,
  earTrainingCatalogs,
  harmonicFluencyCatalog,
  intervalsCatalog,
  readingCatalog,
  scalesModesCatalog,
} from '../catalogs';
import { statsForAttemptCatalog } from '../adapters';

function treeFor(catalog: Parameters<typeof buildModuleTree>[0]) {
  return buildModuleTree(catalog, statsForAttemptCatalog(catalog, []));
}

/** Ear training as the SCREEN builds it: four catalogs, one module
 *  tree, every row carrying the module id `ear-training`. */
function earTrainingTree() {
  return buildMergedTree('ear-training', 'ear training', earTrainingCatalogs.map(
    catalog => ({ catalog, stats: statsForAttemptCatalog(catalog, []) }),
  ));
}

describe('intervals — the mechanism already exists', () => {
  const tree = treeFor(intervalsCatalog);

  it('translates catalog refs into the quiz s own focus keys', () => {
    // Catalog stores `M3:asc`; IntervalsQuiz.buildCandidates matches on
    // `M3|asc`. Getting this wrong would filter the pool to nothing and
    // look like a broken drill rather than a wrong separator.
    const leaf = leavesOf(tree).find(n => n.itemRefs[0] === 'M3:asc')!;
    const target = drillTargetFor(leaf, 'intervals');
    expect(target.kind).toBe('filtered');
    if (target.kind !== 'filtered') throw new Error('unreachable');
    expect(target.itemRefs).toEqual(['M3:asc']);
    expect(target.focusKeys).toEqual(['M3|asc']);
    expect(target.route).toBe('/ear-training/intervals');
  });

  it('a direction row drills every interval in that direction', () => {
    // Intervals now hangs under the ear-training module row, so its
    // direction rows sit one level deeper than they used to.
    const descending = flatten(tree).find(c => c.label === 'Descending')!;
    const target = drillTargetFor(descending, 'intervals');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.focusKeys).toHaveLength(13);
    expect(target.focusKeys.every(k => k.endsWith('|desc'))).toBe(true);
  });

  it('a module row opens the module rather than drilling all of it', () => {
    const target = drillTargetFor(tree, 'intervals');
    expect(target.kind).toBe('navigate');
    if (target.kind !== 'navigate') throw new Error('unreachable');
    expect(target.reason).toBe('whole-module');
  });
});

describe('reading — refs pass through as they are', () => {
  const tree = treeFor(readingCatalog);

  it('hands optionsForItem the stored ref unchanged', () => {
    const leaf = flatten(tree).find(
      n => n.children.length === 0 && n.itemRefs[0]?.startsWith('sig:'),
    )!;
    const target = drillTargetFor(leaf, 'reading');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.focusKeys).toEqual(target.itemRefs);
    expect(target.route).toBe('/reading');
  });

  it('a merged row hands over BOTH of its stored refs', () => {
    // Conceptual knowledge aggregates count and which. Drilling it must
    // serve both, not just the one the row id happens to resemble.
    const conceptual = leavesOf(tree).find(n => n.label === 'Conceptual Knowledge')!;
    const target = drillTargetFor(conceptual, 'reading');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.itemRefs).toHaveLength(2);
    expect(target.itemRefs.some(r => r.endsWith(':count'))).toBe(true);
    expect(target.itemRefs.some(r => r.endsWith(':which'))).toBe(true);
  });
});

describe('modules with no filter mechanism', () => {
  // Harmonic fluency, since scales & modes grew one. The negative case
  // needs a subject that genuinely cannot filter, or it stops testing
  // anything the day its stand-in is wired.
  const tree = treeFor(harmonicFluencyCatalog);

  it('navigates, and says why, rather than pretending to filter', () => {
    // The failure this prevents: a row that opens the whole module
    // while implying it narrowed the drill.
    const card = flatten(tree).find(n => n.depth === 2)!;
    const target = drillTargetFor(card, 'harmonic-fluency');
    expect(target.kind).toBe('navigate');
    if (target.kind !== 'navigate') throw new Error('unreachable');
    expect(target.reason).toBe('no-filter-mechanism');
    expect(target.route).toBe('/harmonic-fluency');
  });

  it('summarises as unfiltered so a row cannot overclaim', () => {
    const summary = drillTargetSummary(
      drillTargetFor(flatten(tree).find(n => n.depth === 2)!, 'harmonic-fluency'),
    );
    expect(summary.filtered).toBe(false);
    expect(summary.itemCount).toBe(0);
    expect(summary.reason).toBe('no-filter-mechanism');
  });

  it('names exactly the modules that can be filtered today', () => {
    // The unevenness is accepted and stated, not discovered one row at
    // a time.
    // Membership is not a promise about every row — chord progressions
    // is here on the strength of 132 refs out of 420.
    expect(filterableModules().sort()).toEqual([
      'chord-progressions', 'chord-recognition', 'intervals', 'reading',
      'scales-modes',
    ]);
  });
});

// ── Chord recognition: several rows, one key ─────────────────────────

describe('chord recognition — the catalog is finer than the pool', () => {
  const tree = treeFor(chordRecognitionCatalog);

  function rowNamed(label: string) {
    return flatten(tree).find(n => n.label === label)!;
  }

  it('folds a chord row s inversions into the one key the quiz matches', () => {
    // The catalog is one row per chord X inversion because that is
    // what attempts store; `ChordRecognitionQuiz` filters its pool on
    // the bare chord id.
    const chord = rowNamed('Major 7');
    // Guard the guard: four refs, or the fold below has nothing to do.
    expect(chord.itemRefs).toEqual(['maj7:0', 'maj7:1', 'maj7:2', 'maj7:3']);
    const target = drillTargetFor(chord, 'ear-training');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.focusKeys).toEqual(['maj7']);
    expect(target.route).toBe('/ear-training/chord-recognition');
  });

  it('DOES NOT let the fold inflate the pool past focus protection', () => {
    // THE RULE. Every drill computes its under-4 warning from
    // `focusKeys.length` and its pool from `new Set(focusKeys)`. Four
    // copies of `maj7` would report a pool of four and drill one chord
    // — protection skipped, accuracy moved, on a row the dashboard
    // chose. The rule is about how few items you were choosing
    // between, not about who chose them.
    const target = drillTargetFor(rowNamed('Major 7'), 'ear-training');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.focusKeys.length).toBeLessThan(4);
    expect(target.focusKeys.length).toBe(new Set(target.focusKeys).size);
  });

  it('keeps every distinct chord under a tier row', () => {
    // The fold must not collapse rows that are genuinely different
    // chords. Seventh chords are six, at four inversions each.
    const tier = rowNamed('Seventh Chords');
    const target = drillTargetFor(tier, 'ear-training');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.itemRefs.length).toBe(24);
    expect(target.focusKeys).toEqual(
      ['maj7', 'min7', 'dom7', 'dim7', 'm7b5', 'minMaj7'],
    );
  });

  it('an inversion leaf drills its chord, which is all the pool can do', () => {
    // Honest rather than exact: which inversions get played is decided
    // by the player's position settings, and no focus key can change
    // that. The leaf still narrows the drill to one chord.
    const leaf = leavesOf(tree).find(n => n.itemRefs[0] === 'min:2')!;
    const target = drillTargetFor(leaf, 'ear-training');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.focusKeys).toEqual(['min']);
  });
});

describe('degenerate rows', () => {
  it('an empty node has nothing to drill', () => {
    const empty = buildModuleTree(
      { sourceId: 'repertoire', moduleId: 'repertoire', label: 'r', accuracyKind: 'measured', items: [] }, [],
    );
    const target = drillTargetFor(empty, 'repertoire');
    if (target.kind !== 'navigate') throw new Error('expected navigate');
    expect(target.reason).toBe('nothing-to-drill');
  });

  it('an unknown id does not produce a broken route', () => {
    // No source of its own AND an unrecognised module - the only way
    // left to reach the fallback, now that a node knows its catalog.
    const orphan = { ...treeFor(scalesModesCatalog), sourceId: undefined };
    const target = drillTargetFor(orphan, 'not-a-module');
    if (target.kind !== 'navigate') throw new Error('expected navigate');
    expect(target.reason).toBe('nothing-to-drill');
    expect(target.route).toBe('/');
  });
});

// ── The merged module, which is where this used to fall over ─────────

describe('a row resolves against its own catalog, not its module', () => {
  const tree = earTrainingTree();

  it('the fixture really does hide the source from the caller', () => {
    // GUARD THE GUARD. Every assertion below is worthless if these
    // rows carry `intervals` as their module id, because then passing
    // the module id would have worked all along.
    const intervals = tree.children.find(n => n.label === 'Intervals')!;
    expect(intervals.sourceId).toBe('intervals');
    expect(tree.id).toBe('ear-training');
    expect(tree.children.map(n => n.label)).toContain('Chord Recognition');
  });

  it('drills intervals from a row whose caller only knows ear-training', () => {
    // THE DEAD TAP. `ROUTES` and `FOCUS_KEY_FORMAT` are keyed on the
    // CATALOG (`intervals`); the screen walks a merged tree and holds
    // the MODULE (`ear-training`). Resolving on what the caller passed
    // sent every ear-training row - intervals included - to
    // `nothing-to-drill` with route `/`, which is the dashboard the tap
    // started on.
    const tree2 = earTrainingTree();
    const descending = flatten(tree2).find(
      n => n.label === 'Descending' && n.sourceId === 'intervals',
    )!;
    const target = drillTargetFor(descending, 'ear-training');
    expect(target.kind).toBe('filtered');
    if (target.kind !== 'filtered') throw new Error('unreachable');
    expect(target.route).toBe('/ear-training/intervals');
    expect(target.focusKeys).toHaveLength(13);
    expect(target.focusKeys.every(k => k.includes('|desc'))).toBe(true);
  });

  it('still refuses to filter a sibling row that cannot be', () => {
    // The fix must not make everything under ear training filterable -
    // only what its own catalog supports, row by row.
    const keyDetection = flatten(tree).find(n => n.label === 'Key Detection')!;
    expect(keyDetection.sourceId).toBe('chord-progressions');
    const target = drillTargetFor(keyDetection, 'ear-training');
    if (target.kind !== 'navigate') throw new Error('expected navigate');
    expect(target.reason).toBe('no-filter-mechanism');
    expect(target.route).toBe('/ear-training/chord-progressions');
  });

  it('opens the module itself where the row spans all four', () => {
    // No single source, so no drill - and the module id is what is
    // left to route on. Before the route existed this was `/` too.
    expect(tree.sourceId).toBeUndefined();
    const target = drillTargetFor(tree, 'ear-training');
    if (target.kind !== 'navigate') throw new Error('expected navigate');
    expect(target.reason).toBe('whole-module');
    expect(target.route).toBe('/ear-training');
  });
});

// ── Too small to count ───────────────────────────────────────────────

describe('a pool under the minimum says so before it drills', () => {
  const tree = treeFor(chordRecognitionCatalog);
  const nodeNamed = (label: string) => flatten(tree).find(n => n.label === label)!;

  /** Root-first, as the screen walks it. */
  function ancestorsOf(label: string) {
    const chain: typeof tree[] = [];
    const walk = (node: typeof tree, above: typeof tree[]): boolean => {
      if (node.label === label) { chain.push(...above); return true; }
      return node.children.some(c => walk(c, [...above, node]));
    };
    walk(tree, []);
    return chain;
  }

  it('offers the parent whose drill would count', () => {
    // The case from the spec: one chord, and Seventh Chords above it.
    const prompt = smallPoolPromptFor(
      nodeNamed('Major 7'), ancestorsOf('Major 7'), 'ear-training',
    )!;
    expect(prompt.poolSize).toBe(1);
    expect(prompt.offer?.label).toBe('Seventh Chords');
    expect(prompt.offer?.poolSize).toBe(6);
    const text = smallPoolPromptText(prompt);
    expect(text.size).toBe('This is 1 item.');
    expect(text.offer).toBe('Drill Seventh Chords (6 items) instead');
    expect(text.proceed).toBe('Drill 1 item anyway');
  });

  it('says nothing when the pool already counts', () => {
    // Guard the guard: this row is genuinely over the line, so the
    // null below is a decision rather than the function never firing.
    const tier = nodeNamed('Seventh Chords');
    expect(drillTargetSummary(drillTargetFor(tier, 'ear-training')).itemCount).toBe(6);
    expect(smallPoolPromptFor(tier, ancestorsOf('Seventh Chords'), 'ear-training'))
      .toBeNull();
  });

  it('says nothing on a row that cannot filter at all', () => {
    // An "open module" row drills everything, so it is never a small
    // pool — and warning on it would attach the rule to rows it has
    // nothing to do with.
    const hf = treeFor(harmonicFluencyCatalog);
    const card = flatten(hf).find(n => n.depth === 2)!;
    expect(drillTargetFor(card, 'harmonic-fluency').kind).toBe('navigate');
    expect(smallPoolPromptFor(card, [hf], 'harmonic-fluency')).toBeNull();
  });

  it('the count is the POOL, not the catalog rows behind it', () => {
    // Major 7 is four catalog rows and one chord. Counting rows would
    // read 4, clear the minimum, and skip the warning on a drill
    // choosing between one.
    const chord = nodeNamed('Major 7');
    expect(chord.itemRefs).toHaveLength(4);
    expect(smallPoolPromptFor(chord, ancestorsOf('Major 7'), 'ear-training')?.poolSize)
      .toBe(1);
  });
});

describe('the climb', () => {
  function nested(items: ModuleCatalog['items']): ModuleCatalog {
    // `reading` because its refs pass through untranslated, so the
    // pool size is exactly the number of refs and the arithmetic below
    // is readable.
    return {
      sourceId: 'reading', moduleId: 'reading', label: 'reading',
      accuracyKind: 'measured', items,
    };
  }
  const leaf = (id: string, path: string[]) => ({ id, label: id, path, itemRefs: [id] });

  it('climbs past an ancestor that is also too small', () => {
    // Offering the nearest parent regardless would move the problem up
    // one row and earn a second prompt saying the same thing.
    const catalog = nested([
      leaf('a', ['reading', 'Big', 'Small']),
      leaf('b', ['reading', 'Big', 'Small']),
      leaf('c', ['reading', 'Big', 'Other']),
      leaf('d', ['reading', 'Big', 'Other']),
      leaf('e', ['reading', 'Big', 'Other']),
      leaf('f', ['reading', 'Big', 'Other']),
    ]);
    const tree = buildModuleTree(catalog, statsForAttemptCatalog(catalog, []));
    const big = tree.children.find(n => n.label === 'Big')!;
    const small = big.children.find(n => n.label === 'Small')!;
    const target = small.children[0];
    // Guard the guard: the skipped ancestor must really be too small.
    expect(small.itemRefs).toHaveLength(2);
    expect(big.itemRefs).toHaveLength(6);

    const prompt = smallPoolPromptFor(target, [tree, big, small], 'reading')!;
    expect(prompt.offer?.label).toBe('Big');
    expect(prompt.offer?.poolSize).toBe(6);
  });

  it('offers nothing rather than the module row', () => {
    // Depth 0 is not a filtered drill — "open module" is a different
    // offer, and one the row already makes for itself. A null offer is
    // a real outcome: the prompt still states the rule and still lets
    // the drill happen.
    const catalog = nested([
      leaf('a', ['reading', 'Only']),
      leaf('b', ['reading', 'Only']),
    ]);
    const tree = buildModuleTree(catalog, statsForAttemptCatalog(catalog, []));
    const only = tree.children[0];
    const prompt = smallPoolPromptFor(only.children[0], [tree, only], 'reading')!;
    expect(prompt.poolSize).toBe(1);
    expect(prompt.offer).toBeNull();
    expect(smallPoolPromptText(prompt).offer).toBeNull();
  });
});

// ── Chord motion: one catalog, four sub-drills ───────────────────────

describe('chord progressions — filterability is per row', () => {
  const tree = treeFor(chordProgressionsCatalog);
  const nodeNamed = (label: string) => flatten(tree).find(n => n.label === label)!;

  it('hands motion refs over untranslated', () => {
    // `motionId()` builds the same string the catalog stores. The one
    // module needing no translation — and the one where assuming a
    // translation was needed would have filtered the pool to nothing.
    const destination = nodeNamed('Destination');
    const target = drillTargetFor(destination, 'ear-training');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.focusKeys).toHaveLength(132);
    expect(target.focusKeys).toEqual(target.itemRefs);
    expect(target.focusKeys[0]).toMatch(/^motion:/);
  });

  it('sends the tab as well as the pool', () => {
    // Three tabs behind one route. A pool landing on Key Detection is
    // a drill silently ignoring what it was asked for.
    const target = drillTargetFor(nodeNamed('Destination'), 'ear-training');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.params).toEqual({ tab: 'chord-motion' });
    const href = drillHref(target);
    expect(href.startsWith('/ear-training/chord-progressions?')).toBe(true);
    const query = new URLSearchParams(href.slice(href.indexOf('?') + 1));
    expect(query.get('tab')).toBe('chord-motion');
    expect(query.get('focus')!.split(',')).toHaveLength(132);
  });

  it('refuses the first-chord rows rather than half-delivering them', () => {
    // Same 132 motions, and the translation would be trivial — but an
    // attempt only lands under `motion-first:` in the MINIMAL
    // scaffold, so filtering the pool and arriving in full scaffold
    // never touches the row's item.
    const first = nodeNamed('First Chord');
    // Guard the guard: these refs really are the same motions, so the
    // refusal is a decision rather than a missing translation.
    expect(first.itemRefs).toHaveLength(132);
    expect(first.itemRefs[0]).toMatch(/^motion-first:/);
    const target = drillTargetFor(first, 'ear-training');
    if (target.kind !== 'navigate') throw new Error('expected navigate');
    expect(target.reason).toBe('no-filter-mechanism');
  });

  it('refuses key detection and full progression', () => {
    for (const label of ['Key Detection', 'Full Progression']) {
      const target = drillTargetFor(nodeNamed(label), 'ear-training');
      expect(target.kind, label).toBe('navigate');
    }
  });

  it('a row MIXING filterable and unfilterable refs offers neither', () => {
    // ALL OR NOTHING. Serving the motion refs and dropping the rest
    // would read as the filter working while three quarters of the row
    // went missing.
    const root = nodeNamed('Chord Progressions');
    const kinds = new Set(root.itemRefs.map(r => r.startsWith('motion:')));
    expect(kinds).toEqual(new Set([true, false]));
    const target = drillTargetFor(root, 'ear-training');
    if (target.kind !== 'navigate') throw new Error('expected navigate');
    expect(target.reason).toBe('no-filter-mechanism');
  });

  it('a single motion is a small pool like any other', () => {
    const leaf = leavesOf(tree).find(n => n.itemRefs[0]?.startsWith('motion:'))!;
    const summary = drillTargetSummary(drillTargetFor(leaf, 'ear-training'));
    expect(summary.itemCount).toBe(1);
    expect(summary.countsTowardAccuracy).toBe(false);
  });
});

// ── Scales & modes: two tabs, one pool ───────────────────────────────

describe('scales & modes — the tab is part of what the row meant', () => {
  const tree = treeFor(scalesModesCatalog);
  const nodeNamed = (label: string) => flatten(tree).find(n => n.label === label)!;
  const under = (mode: string, label: string) =>
    flatten(tree).find(n => n.label === mode)!.children.find(c => c.label === label)!;

  it('strips the tab suffix off the pool keys', () => {
    const scale = under('Dorian', 'Hear Simple Scale');
    expect(scale.itemRefs).toEqual(['dorian-tab1']);
    const target = drillTargetFor(scale, 'ear-training');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.focusKeys).toEqual(['dorian']);
    expect(target.route).toBe('/ear-training/scales-modes');
  });

  it('sends the tab the row named', () => {
    const vamp = under('Dorian', 'Hear Mode In Context');
    const target = drillTargetFor(vamp, 'ear-training');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.params).toEqual({ tab: 'vamp' });
    expect(drillHref(target)).toContain('tab=vamp');
  });

  it('sends NO tab for a row covering both skills', () => {
    // A mode row is both. Picking one would silently answer a question
    // the row did not ask; leaving it out lands on whichever tab was
    // already open.
    const mode = nodeNamed('Dorian');
    // Guard the guard: this row really does span the two tabs.
    expect(mode.itemRefs).toEqual(['dorian-tab1', 'dorian-tab2']);
    const target = drillTargetFor(mode, 'ear-training');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.params).toEqual({});
    expect(drillHref(target)).not.toContain('tab=');
  });

  it('folds a mode row s two rows into the one mode the pool holds', () => {
    const target = drillTargetFor(nodeNamed('Dorian'), 'ear-training');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.focusKeys).toEqual(['dorian']);
    // And so it is a small pool, exactly as the drill will see it.
    expect(drillTargetSummary(target).countsTowardAccuracy).toBe(false);
  });

  it('the submodule row drills all nine modes', () => {
    const all = nodeNamed('Scales & Modes');
    const target = drillTargetFor(all, 'ear-training');
    if (target.kind !== 'filtered') throw new Error('expected filtered');
    expect(target.itemRefs).toHaveLength(18);
    expect(target.focusKeys).toHaveLength(9);
    expect(target.params).toEqual({});
  });
});
