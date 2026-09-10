/**
 * The approved copy file is the source, and this reads it.
 *
 * =====================================================================
 * A TEST THAT RESTATES THE STRINGS IS A THIRD COPY.
 *
 * `docs/HARMONIC_FLUENCY_COPY.md` is what Silas approved. A test that
 * hard-coded "Maj/Min Key Relation" beside the code's own constant
 * would pass just as happily when both had drifted from the document,
 * and the document is the only one of the three anybody reads before
 * writing new copy.
 *
 * So the file is parsed. Every table in it is a claim about what the
 * app says, checked against what the app says. Editing the document
 * without editing the code fails here, and so does the reverse — which
 * is what "approved" has to mean if it is to mean anything.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
// The document itself, as text. `?raw` rather than `readFileSync`
// because this file is type-checked by the app's own tsconfig, which
// has no node types — and because a bundler import fails loudly if the
// document is ever moved, where a path string would fail at runtime.
import COPY from '../../../../docs/HARMONIC_FLUENCY_COPY.md?raw';
import { CATEGORY_LABELS, FLASHCARDS } from '../catalog';
import { SLASH_SHAPES } from '../catalogExpansions';
import {
  FACET_ROW, MOVEMENT_LABELS, facetValueLabel,
} from '../facetDisplay';
import { CLEAR_FILTERS_LABEL, FILTERS_LABEL } from '../FacetFilterRow';
import { HEAR_IT_LABEL } from '../CardPlayback';
import { DEGREE_MATH_CATEGORY_NAME } from '../scaleDegreeQualityCards';
import { DEGREE_NOTE_CATEGORY_NAME, placeItCards } from '../degreeNoteCards';
import { MODAL_IMPROV_DESCRIPTION } from '../modalImprovisation';
import { withAccidentalGlyphs } from '../../reading/pitch';
import { skillDescriptionFor } from '../../dashboard/read/affordances';
import type { TreeNode } from '../../dashboard/read/tree';


/**
 * The two-column table under a heading, as `[left, right]` pairs.
 *
 * The header row and the `|---|---|` rule are dropped; everything else
 * under that heading until the next one is a claim.
 */
function tableUnder(heading: string): Array<[string, string]> {
  const lines = COPY.split('\n');
  const start = lines.findIndex((l: string) => l.trim() === `## ${heading}`);
  expect(start, `heading "${heading}" is in the copy file`).toBeGreaterThan(-1);
  const rows: Array<[string, string]> = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (!line.trimStart().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c: string) => c.trim());
    if (cells.length !== 2) continue;
    if (/^-+$/.test(cells[0])) continue;
    rows.push([cells[0], cells[1]]);
  }
  // The header row of the table itself.
  return rows.slice(1);
}

describe('the file says what it is', () => {
  it('is dated and attributed', () => {
    expect(COPY).toContain('Approved by Silas, 8 Sep 2026');
  });
});

describe('the filter row — what each line is called', () => {
  const rows = tableUnder('The filter row — what each line is called');

  it('names every row the app offers, in the app\'s own order', () => {
    expect(rows.map(([facet]) => facet)).toEqual(FACET_ROW.map(f => f.name));
  });

  it('and calls each one what the app calls it', () => {
    expect(rows.map(([, label]) => label)).toEqual(FACET_ROW.map(f => f.label));
  });

  it('says which two facets the row does not offer', () => {
    // Ruling 25. Named rather than merely absent: a facet quietly
    // missing from a list looks like an oversight, and these are a
    // decision.
    expect(COPY).toContain('`semitones`');
    expect(COPY).toContain('`enharmonicGroup`');
    for (const dropped of ['semitones', 'enharmonicGroup']) {
      expect(FACET_ROW.map(f => String(f.name))).not.toContain(dropped);
    }
  });
});

describe('the filter row — the controls', () => {
  const rows = new Map(tableUnder('The filter row — the controls'));

  it('names the toggle and the reset', () => {
    expect(rows.get('filters')).toBe(FILTERS_LABEL);
    expect(rows.get('clear')).toBe(CLEAR_FILTERS_LABEL);
  });

  it('shows the folded form with its count', () => {
    // The separator is load-bearing — the document spells it out, so
    // the string the component builds has to match character for
    // character.
    expect(COPY).toContain('`Filters · 2`');
    expect(`${FILTERS_LABEL} · 2`).toBe('Filters · 2');
  });
});

/**
 * The fenced block under a heading, as one line.
 *
 * A row description is a SENTENCE, not a table, and it is wrapped in
 * the document so the file stays readable at 80 columns. The fence is
 * what marks where it starts and stops; collapsing the wrap is what
 * makes it comparable to the string the app holds.
 */
function blockUnder(heading: string): string {
  const lines = COPY.split('\n');
  const start = lines.findIndex((l: string) => l.trim() === `## ${heading}`);
  expect(start, `heading "${heading}" is in the copy file`).toBeGreaterThan(-1);
  const out: string[] = [];
  let inside = false;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (line.trim() === '```') {
      if (inside) break;
      inside = true;
      continue;
    }
    if (inside) out.push(line.trim());
  }
  return out.join(' ');
}

describe('key names carry their mode', () => {
  it('shows a real card as its example', () => {
    // The document's example is not an illustration — it is a card,
    // and if the sentence ever changes shape this fails rather than
    // the doc quietly describing a question nobody is asked.
    const card = FLASHCARDS.find(c => c.id === 'mi-modal-5of5-C')!;
    expect(card.question).toBe(blockUnder('Key names carry their mode'));
  });

  it('leaves no bare key in a Modal Improvisation question', () => {
    for (const c of FLASHCARDS.filter(f => f.category === 'modal-improvisation')) {
      expect(c.question.startsWith('In the key of '), c.id).toBe(true);
      expect(c.question, c.id).toMatch(/^In the key of \S+ major, /);
    }
  });

  it('is applied to the other families too', () => {
    // The rule was Modal Improvisation's alone for an afternoon. It is
    // the deck's now, and this asserts one card per family rather than
    // trusting the document's own table.
    const asks = (id: string) => FLASHCARDS.find(c => c.id === id)?.question;
    // EVERY CHORD SHOWS ITS QUALITY, and the row is separated by middle
    // dots. Silas's ruling of 10 Sep 2026 — the 2 of a 2 5 1 is minor
    // and the question now says so.
    expect(asks('pr-prog-2-5-1-Bb'))
      .toBe('The 2m · 5 · 1 in the key of B♭ major is _____');
    expect(asks('mo-mode-C-2'))
      .toBe('The mode of the key of C major starting on D is _____');
    expect(asks('dgn-C-b6')).toBe('In the key of C major, what is the ♭6?');
    expect(asks('fh-v-of-vi-Db'))
      .toBe('V/vi in the key of D♭ major resolves to _____');
    expect(asks('ks-parallel-Db'))
      .toBe('The parallel minor of the key of D♭ major is _____');
    expect(asks('pent-lick-C')).toBe(
      "You're in the key of C major. Which minor pentatonic fits for riffs "
      + 'and licks?');
  });

  it('leaves a chord and a scale alone, because neither is a key', () => {
    const expl = (id: string) => FLASHCARDS.find(c => c.id === id)?.explanation;
    // "the 5 of G" — G is the chord it resolves to, not a key.
    expect(expl('mi-modal-5of5-C')).toContain('it is the 5 of G.');
    // A scale name keeps its own shape.
    expect(FLASHCARDS.find(c => c.id === 'pent-notes-minor-C')?.question)
      .toBe('In C minor pentatonic, the notes are _____');
    // And an interval card names no key at all.
    expect(FLASHCARDS.find(c => c.id === 'iv-C-up-2')?.question)
      .toBe('The interval from C to D ascending = ?');
  });

  it('holds nothing back any more, and the four say so', () => {
    // A HISTORY DECISION THAT EXPIRED. Retired hand-written cards used
    // to pair onto these four by asking the identical sentence, and
    // their answers ("1", "A minor", "C/E") are each given by more than
    // one live card — so the ruled answer-only route could not prove
    // the pairing and the questions could not move. Those records went
    // with the migration passes on 10 Sep 2026, and nothing pairs on
    // text now.
    const asks = (id: string) => FLASHCARDS.find(c => c.id === id)?.question;
    expect(asks('ks-count-G')).toBe('The key of G major has _____ sharps');
    expect(asks('ks-relminor-Ab'))
      .toBe('The relative minor of the key of A♭ major is _____');
    expect(asks('ks-relmajor-Ab'))
      .toBe('The relative major of the key of F minor is _____');
    expect(asks('sc-slash-1-3-C')).toBe('What is 1/3 in the key of C major?');
    expect(COPY).toContain('No question is held back any more');
  });

  it('leaves no bare key in ANY question in the deck', () => {
    // The whole rule now, with no exemption list — which is what the
    // four coming back means. Same shape as the explanation sweep
    // below: wherever a card's own key is followed by its mode, "the
    // key of" is in front of it.
    for (const c of FLASHCARDS) {
      const key = c.facets?.key;
      if (key === undefined) continue;
      const name = withAccidentalGlyphs(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const bare = new RegExp(`(?<!key of )\\b${name} (major|minor)\\b`);
      expect(c.question, `${c.id}: ${c.question}`).not.toMatch(bare);
    }
  });

  it('never names a key without "the key of", anywhere in the deck', () => {
    // THE RULE ITSELF, asserted rather than illustrated: wherever a
    // card's OWN key appears followed by "major" or "minor", it is
    // preceded by "the key of". A chord ("the 5 of G") and a scale
    // ("D melodic minor") name no key and are not matched, because
    // neither is this card's key followed by its mode.
    //
    // The four held-back questions are the only exceptions and they are
    // listed above; this runs over explanations, where there are none.
    for (const c of FLASHCARDS) {
      const key = c.facets?.key;
      if (key === undefined || c.explanation === undefined) continue;
      const name = withAccidentalGlyphs(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const bare = new RegExp(`(?<!key of )\\b${name} (major|minor)\\b`);
      expect(c.explanation, `${c.id}: ${c.explanation}`).not.toMatch(bare);
    }
  });
});

describe('the 1 6 2 5 explanation', () => {
  it('reads in the key of E♭ major exactly as the file says', () => {
    const card = FLASHCARDS.find(c => c.id === 'pr-prog-1-6-2-5-Eb')!;
    expect(card.explanation).toBe(blockUnder('The 1 6 2 5 explanation'));
  });

  it('says the same thing in all thirteen, with that key\'s chords', () => {
    const cards = FLASHCARDS.filter(c => c.id.startsWith('pr-prog-1-6-2-5-'));
    expect(cards).toHaveLength(13);
    for (const c of cards) {
      expect(c.explanation, c.id).toContain(', the turnaround.');
      expect(c.explanation, c.id)
        .toContain("It's sometimes used to walk back to the 1 and go round again.");
      // The card's own four chords, which is what makes it that key's
      // sentence rather than a sentence about a key.
      expect(c.explanation, c.id).toContain(c.correctAnswer.replace(/ - /g, ' → '));
    }
  });

  it('has dropped the rhythm-changes clause everywhere', () => {
    // Named rather than merely absent: it was true, and it was a
    // second fact about a different progression.
    for (const c of FLASHCARDS) {
      expect(c.explanation ?? '', c.id).not.toContain('Rhythm changes is the same');
    }
    expect(COPY).toContain('Rhythm changes is the same four');
  });
});

describe('one name for one mark', () => {
  it('says "marked" on every card that names the mark', () => {
    const modal = FLASHCARDS.filter(c => c.category === 'modal-improvisation');
    const naming = modal.filter(c => /marked notes/.test(c.explanation ?? ''));
    // The sixty-five borrowed cards. The in-key cards mark nothing and
    // do not mention it.
    expect(naming).toHaveLength(65);
  });

  it('says "highlighted" nowhere in the deck', () => {
    for (const c of FLASHCARDS) {
      expect(`${c.question} ${c.explanation ?? ''}`, c.id).not.toMatch(/highlight/i);
    }
    expect(COPY).toContain('no card in the deck says "highlighted"');
  });
});

describe('the minor-target sentence', () => {
  const MINOR_TARGETS = ['5of2', '5of3', '5of6'];
  const minorCards = FLASHCARDS.filter(
    c => MINOR_TARGETS.some(t => c.id.startsWith(`mi-modal-${t}-`)));

  it('reads on the 5 of 6 in C exactly as the file says', () => {
    const card = FLASHCARDS.find(c => c.id === 'mi-modal-5of6-C')!;
    expect(card.explanation).toContain(blockUnder('The minor-target sentence'));
  });

  it('is on all 39 minor-target cards, and only those', () => {
    expect(minorCards).toHaveLength(39);
    const opening = 'When a secondary dominant takes you to a minor chord';
    for (const c of minorCards) expect(c.explanation, c.id).toContain(opening);
    const others = FLASHCARDS.filter(
      c => c.category === 'modal-improvisation' && !minorCards.includes(c));
    for (const c of others) expect(c.explanation, c.id).not.toContain(opening);
  });

  it('says the marked notes once, and never the old claim', () => {
    for (const c of minorCards) {
      expect(c.explanation, c.id).not.toContain('one note raised');
      expect(c.explanation, c.id).not.toContain('highlighted notes');
      const marked = (c.explanation ?? '').split('The marked notes are').length - 1;
      expect(marked, c.id).toBe(1);
    }
  });

  it('gets the article right on every note it names', () => {
    // "an F", not "a F". A, E and F are said with a vowel however they
    // are spelled after the letter.
    for (const c of minorCards) {
      expect(c.explanation, c.id).not.toMatch(/\ba [AEF]/);
      expect(c.explanation, c.id).not.toMatch(/\ban [BCDG]/);
    }
  });
});

describe('the Modal Improvisation row', () => {
  it('says Silas\'s sentence, word for word', () => {
    expect(MODAL_IMPROV_DESCRIPTION).toBe(blockUnder('The Modal Improvisation row'));
  });

  it('and the row on screen is that sentence', () => {
    // The description reaches the dashboard through `affordances`,
    // which reads this constant rather than holding a second copy.
    expect(skillDescriptionFor(
      {
        id: `harmonic-fluency/${CATEGORY_LABELS['modal-improvisation']}`,
        label: CATEGORY_LABELS['modal-improvisation'],
      } as TreeNode,
      'harmonic-fluency',
    )?.text).toBe(MODAL_IMPROV_DESCRIPTION);
  });

  it('is not the prototype\'s page copy any more', () => {
    // Named rather than merely absent: it was on screen for an
    // afternoon, and "Pick a key…" reads plausibly enough that its
    // return would not be noticed.
    expect(MODAL_IMPROV_DESCRIPTION).not.toContain('Pick a key');
    expect(MODAL_IMPROV_DESCRIPTION).not.toContain('Hear It');
    expect(COPY).toContain('Pick a key and a chord');
  });
});

describe('the Progression chips', () => {
  it('reads each stored value the way the file says', () => {
    for (const [stored, chip] of tableUnder('The Progression chips')) {
      expect(facetValueLabel('progression', stored), stored).toBe(chip);
    }
  });

  it('covers every progression the deck holds', () => {
    const listed = tableUnder('The Progression chips').map(([stored]) => stored);
    expect(listed.sort()).toEqual([
      '1-5-6-4', '1-6-4-5', '1-6-2-5', '1-4-5',
      'V/ii', 'V/iii', 'V/IV', 'V/V', 'V/vi',
      'backdoor', 'ii-V-I',
    ].sort());
  });

  it('and the deck holds every progression it covers', () => {
    // THE TEST ABOVE PINS A LIST; THIS ONE READS THE DECK. Two
    // families carry this facet now, and a hand-written list is
    // exactly the thing that stays green while a chip goes stale —
    // which is what the row's own note says a chip must never do.
    const listed = new Set(
      tableUnder('The Progression chips').map(([stored]) => stored));
    const live = new Set(
      FLASHCARDS.map(c => c.facets?.progression).filter(v => v !== undefined));
    expect([...live].sort()).toEqual([...listed].sort());
  });
});

describe('the Distance chips', () => {
  const rows = tableUnder('The Distance chips');

  it('reads each movement the way the file says', () => {
    for (const [stored, chip] of rows) {
      expect(facetValueLabel('movement', stored), stored).toBe(chip);
    }
  });

  it('covers every movement the deck can produce', () => {
    // 24 — twelve qualities each way. A quality added to the theory
    // table without a chip in this file fails here rather than
    // printing its coordinate on screen.
    expect(rows.length).toBe(MOVEMENT_LABELS.size);
    expect(rows.map(([stored]) => stored).sort())
      .toEqual([...MOVEMENT_LABELS.keys()].sort());
  });

  it('never prints a half-step count', () => {
    for (const [, chip] of rows) expect(chip).not.toMatch(/\d/);
  });
});

describe('the slash chord deck', () => {
  const rows = tableUnder('The slash chord deck');

  it('drills exactly the shapes the file lists, in its order', () => {
    expect(SLASH_SHAPES.map(s => s.label)).toEqual(rows.map(([label]) => label));
  });

  it('has 6/♭7 in neither', () => {
    // Ruling 30 removed it. Named rather than merely absent, because
    // a shape quietly missing from a list looks like an oversight.
    expect(SLASH_SHAPES.map(s => s.id)).not.toContain('6-b7');
    expect(FLASHCARDS.filter(c => c.id.includes('6-b7'))).toEqual([]);
    expect(FLASHCARDS.filter(c => c.question.includes('6/b7'))).toEqual([]);
  });

  it('reads each shape back in Silas\'s own words', () => {
    const reading = new Map(SLASH_SHAPES.map(s => [s.label, s.reading] as const));
    for (const [label, words] of rows) {
      expect(reading.get(label), label).toBe(words);
    }
  });

  it('puts that reading on a line of its own, on every card', () => {
    // The GENERATED cards only. `sc-1` … `sc-16` are the hand-written
    // prose cards, which say other things about slash chords and carry
    // no shape; ruling 37 took the three that duplicated this
    // generator, so C is now generated like every other key.
    let seen = 0;
    for (const card of FLASHCARDS.filter(c => c.category === 'slash-chords')) {
      const shape = SLASH_SHAPES.find(s => card.id.startsWith(`sc-slash-${s.id}-`));
      if (shape === undefined) continue;
      seen += 1;
      const lines = (card.explanation ?? '').split('\n');
      expect(lines[lines.length - 1], card.id)
        .toBe(`${shape.reading.charAt(0).toUpperCase()}${shape.reading.slice(1)}.`);
    }
    // 7 shapes × 13 keys, no exceptions (rulings 37, 39 and 40).
    expect(seen).toBe(SLASH_SHAPES.length * 13);
  });

  it('never offers a chord over its own root as a wrong answer', () => {
    // `G/G` is not a slash chord, and it was on every 5/7 card until
    // this deck was rebuilt.
    for (const card of FLASHCARDS.filter(c => c.category === 'slash-chords')) {
      for (const decoy of card.decoys) {
        const [chord, bass] = decoy.split('/');
        if (bass === undefined) continue;
        expect(chord.replace(/m$/, ''), `${card.id}: ${decoy}`).not.toBe(bass);
      }
    }
  });
});

describe('category names', () => {
  const rows = new Map(tableUnder('Category names'));

  it('titles the two categories ruling 29 renames', () => {
    expect(rows.get('scale-degree-math')).toBe(DEGREE_MATH_CATEGORY_NAME);
    expect(rows.get('degree-notes')).toBe(DEGREE_NOTE_CATEGORY_NAME);
    expect(CATEGORY_LABELS['scale-degree-math']).toBe(rows.get('scale-degree-math'));
    expect(CATEGORY_LABELS['degree-notes']).toBe(rows.get('degree-notes'));
  });

  it('says Number and not Degree', () => {
    for (const title of rows.values()) {
      expect(title.toLowerCase(), title).not.toContain('degree');
      expect(title.toLowerCase(), title).toContain('number');
    }
  });
});

describe('the four question types', () => {
  it('records the names without claiming they are on screen', () => {
    const rows = new Map(tableUnder(
      'The four question types in Notes of the Number System',
    ));
    expect(rows.get('nameItCards')).toBe('Name the Note');
    expect(rows.get('placeItCards')).toBe('Name the Number');
    expect(rows.get('pressItCards')).toBe('Press the Number');
    expect(rows.get('findKeyCards')).toBe('Name the Key');
    expect(COPY).toContain('These names surface nowhere in the app today');
  });
});

describe("the worked method's two headings", () => {
  const rows = tableUnder("The worked method's two headings");

  it('heads both steps, word for word, on every card', () => {
    const cards = FLASHCARDS.filter(c => c.category === 'scale-degree-math');
    expect(cards.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(2);
    for (const c of cards) {
      for (const [, heading] of rows) {
        expect(c.explanation ?? '', c.id).toContain(heading);
      }
    }
  });

  it('says the same thing on every card — no number baked into a heading', () => {
    // The second heading used to read "THE QUALITY SAYS WHICH 2", which
    // is a heading a reader has to read again on every card.
    for (const [, heading] of rows) expect(heading).not.toMatch(/\d/);
  });
});

describe('the explanation sweep', () => {
  it('changed every string the file lists, and says so in full', () => {
    for (const [id, text] of tableUnder('The explanation sweep')) {
      const found = FLASHCARDS.find(c => c.id === id);
      // The second table under this heading is not cards; skip a row
      // whose left cell is not one.
      if (found === undefined) continue;
      expect(`${found.question} ${found.explanation ?? ''}`, id).toContain(text);
    }
  });

  it('leaves no bare "degree" anywhere in the deck', () => {
    // The ruling in one assertion. "scale degree" may stay; a bare
    // "degree" meaning the number may not. This is what makes the sweep
    // finished rather than mostly done.
    for (const c of FLASHCARDS) {
      const text = `${c.question} ${c.explanation ?? ''}`;
      for (const match of text.matchAll(/\b\w+\s+degrees?\b/gi)) {
        expect(match[0].toLowerCase(), `${c.id}: ${match[0]}`)
          .toMatch(/^scale degrees?$/);
      }
    }
  });
});

describe('card text', () => {
  it('asks which NUMBER, in every card of the type', () => {
    const cards = placeItCards();
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.question, card.id).toContain('is which number?');
      expect(card.question, card.id).not.toContain('degree');
    }
  });
});

describe('what is still unwritten', () => {
  it('is a list rather than a discovery', () => {
    const start = COPY.indexOf('## Unruled');
    expect(start).toBeGreaterThan(-1);
    const unruled = COPY.slice(start);
    for (const item of ['Tile labels', 'Presets', 'Sort controls', 'Layout',
      'Apply to every key', HEAR_IT_LABEL]) {
      expect(unruled, item).toContain(item);
    }
  });
});
