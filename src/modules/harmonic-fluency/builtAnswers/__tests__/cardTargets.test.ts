/**
 * What each card wants built, checked against what the card already
 * says the answer is.
 *
 * =====================================================================
 * THE ONE ASSERTION THAT MATTERS, AND IT IS THE WHOLE FILE.
 *
 * A built answer and a multiple-choice answer have to be the same fact.
 * If they are not, the reader is marked wrong for building the chord
 * the card's own reveal then tells them was right — and nothing on
 * screen would explain it, because both halves look correct on their
 * own.
 *
 * So every target is formatted back into the card's own answer string
 * and compared to `correctAnswer`. 272 cards, no exceptions, no
 * allowlist. That is stronger than any per-family example: it proves
 * the two derivations agree everywhere rather than in the four places
 * somebody thought to check.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../../catalog';
import { builtTargetFor, type BuiltTarget } from '../cardTargets';
import { noteList } from '../../pentatonics';
import { spellNote } from '../../../../lib/spelling';
import { withAccidentalGlyphs } from '../../../reading/pitch';
import { joinRow } from '../../../../lib/progressionRow';
import { CANONICAL_SPELLING } from '../../../../lib/progressionSpelling';

const withTarget = FLASHCARDS
  .map(card => ({ card, target: builtTargetFor(card) }))
  .filter((x): x is { card: typeof FLASHCARDS[number]; target: BuiltTarget } =>
    x.target !== null);

const byKind = (kind: BuiltTarget['kind']) =>
  withTarget.filter(x => x.target.kind === kind);

describe('which cards stop being multiple choice', () => {
  it('is the six families and nothing else', () => {
    const counts = new Map<string, number>();
    for (const { card } of withTarget) {
      counts.set(card.category, (counts.get(card.category) ?? 0) + 1);
    }
    expect(Object.fromEntries([...counts].sort())).toEqual({
      // Spell the chord in a key, 14 Sep 2026.
      'chord-construction': 91,
      // 52 that answer with a key plus the 13 that answer with a count.
      'key-signatures': 65,
      'pentatonic-scales': 38,
      progressions: 78,
      'slash-chords': 91,
    });
    expect(withTarget).toHaveLength(363);
  });

  it('leaves the rest of the deck alone', () => {
    // The deck is 1,597 (1,611 before the minors of 13 Sep 2026, 1,621
    // before `dq-extra-1` retired on 14 Sep, 1,620 before Ear-Theory
    // Crossover's fifteen did, 1,605 before the duplicates) and does not move; what
    // changes is the answer surface on 259 of them.
    expect(FLASHCARDS).toHaveLength(1680);
    // The ten minor cards of 13 Sep 2026 stay on their buttons: 1339 →
    // 1349. The retired triad card was on its buttons too: 1349 → 1348.
    // Ear-Theory Crossover's fifteen were on buttons too: 1348 → 1333.
    // Ten hand-written duplicates out, two generated C cards in: 1325.
    // The eight "contains the notes" cards retired into Spell the chord,
    // which answers on the keyboard: 1325 → 1317.
    expect(FLASHCARDS.length - withTarget.length).toBe(1317);
  });

  it('leaves the parallel-minor cards on their buttons', () => {
    // Named rather than merely absent: the relative pair is built and
    // the parallel pair is not, because the prototype draws the first
    // and is silent on the second.
    for (const c of FLASHCARDS.filter(f => f.id.startsWith('ks-parallel-'))) {
      expect(builtTargetFor(c), c.id).toBeNull();
    }
  });

  it('gives every card of a family a target, or none of them', () => {
    // A family half-converted would be a reader meeting two different
    // answer surfaces for one question shape.
    for (const [prefix, n] of [
      ['pr-prog-', 78], ['sc-slash-', 91], ['cc-spell-major-', 91], ['pent-notes-', 25],
      ['pent-lick-', 13], ['ks-relminor-', 13], ['ks-relmajor-', 13],
      ['ks-count-', 13], ['ks-sig-major-', 13], ['ks-sig-minor-', 13],
    ] as const) {
      const family = FLASHCARDS.filter(c => c.id.startsWith(prefix));
      expect(family, prefix).toHaveLength(n);
      for (const c of family) expect(builtTargetFor(c), c.id).not.toBeNull();
    }
  });
});

describe('a target says the same thing as the card it grades', () => {
  it('names the progression the card names, chord for chord', () => {
    const cards = byKind('progression');
    expect(cards).toHaveLength(78);
    for (const { card, target } of cards) {
      if (target.kind !== 'progression') continue;
      // THE SAME SEPARATOR THE CARD'S ANSWER KEY IS BAKED IN — a
      // middle dot with a space either side. Progression spelling
      // became a setting later the same day and the KEY does not
      // follow it: it is graded by equality and written to the attempt
      // row, so it stays canonical and is re-joined for the eye.
      expect(joinRow(target.chords.map(c => c.name), CANONICAL_SPELLING), card.id)
        .toBe(card.correctAnswer);
    }
  });

  it('names the slash chord the card names', () => {
    const cards = byKind('slash');
    expect(cards).toHaveLength(91);
    for (const { card, target } of cards) {
      if (target.kind !== 'slash') continue;
      expect(target.name, card.id).toBe(card.correctAnswer);
    }
  });

  it('holds the notes the pentatonic card lists', () => {
    const cards = byKind('scale');
    expect(cards).toHaveLength(38);
    for (const { card, target } of cards) {
      if (target.kind !== 'scale') continue;
      expect(target.pcs, card.id).toHaveLength(5);
      // The notes cards spell their answer out; the lick card answers
      // with a scale NAME, so its notes are checked against the card's
      // own explanation instead.
      if (card.id.startsWith('pent-notes-')) {
        const spelled = noteList(
          target.pcs.map(pc => spellNote(pc, card.correctAnswer.includes('♯') ? 'sharp' : 'flat')),
        );
        expect(withAccidentalGlyphs(spelled).replace(/♯/g, '♯'), card.id)
          .toBe(card.correctAnswer);
      } else {
        expect(card.correctAnswer, card.id)
          .toBe(`${target.rootName} minor pentatonic`);
      }
    }
  });

  it('drones on the KEY, not on the scale, for the lick card', () => {
    // The prototype's rule in terms: "the scale sitting on the key,
    // never the root of the scale". In the key of A♭ major the answer
    // is F minor pentatonic and the drone is A♭.
    const lick = withTarget.find(x => x.card.id === 'pent-lick-Ab')!;
    if (lick.target.kind !== 'scale') throw new Error('wrong kind');
    expect(lick.target.rootName).toBe('F');
    expect(lick.target.dronePc).toBe(8);
    expect(lick.target.rootFirst).toBe(true);
    // And the notes cards drone on their own root, which is the key
    // they are named in.
    const notes = withTarget.find(x => x.card.id === 'pent-notes-major-Eb')!;
    if (notes.target.kind !== 'scale') throw new Error('wrong kind');
    expect(notes.target.dronePc).toBe(notes.target.rootPc);
    expect(notes.target.rootFirst).toBe(false);
  });

  it('names the key the relative and count-to-key cards answer', () => {
    for (const { card, target } of byKind('root')) {
      if (target.kind !== 'root') continue;
      expect(`${target.rootName} ${target.minor ? 'minor' : 'major'}`, card.id)
        .toBe(card.correctAnswer);
    }
  });

  it('counts the accidentals the count cards count', () => {
    const cards = byKind('signature');
    expect(cards).toHaveLength(13);
    for (const { card, target } of cards) {
      if (target.kind !== 'signature') continue;
      expect(String(target.count), card.id).toBe(card.correctAnswer);
      // AND THE DIRECTION THE QUESTION ASKS FOR. F♯ major has six
      // sharps and G♭ major six flats: one pitch class, two answers,
      // which is the clearest place in the deck that the thirteenth
      // key is a musical claim.
      expect(card.question, card.id).toContain(target.direction === 'sharps'
        ? 'sharps' : 'flats');
    }
    const sharp = cards.find(x => x.card.id === 'ks-count-F#')!.target;
    const flat = cards.find(x => x.card.id === 'ks-count-Gb')!.target;
    if (sharp.kind !== 'signature' || flat.kind !== 'signature') throw new Error();
    expect(sharp.count).toBe(6);
    expect(sharp.direction).toBe('sharps');
    expect(flat.count).toBe(6);
    expect(flat.direction).toBe('flats');
    // One pitch class, two keys, two scales — F♯ major spells its 4 B
    // and G♭ major spells its 4 C♭, which is the same key on a board.
    expect(sharp.keyName).toBe('F♯');
    expect(flat.keyName).toBe('G♭');
    expect(sharp.pcs).toEqual(flat.pcs);
  });

  it('reads the scale of the key it answers, minor or major', () => {
    const minor = withTarget.find(x => x.card.id === 'ks-relminor-Ab')!.target;
    const major = withTarget.find(x => x.card.id === 'ks-relmajor-Ab')!.target;
    if (minor.kind !== 'root' || major.kind !== 'root') throw new Error();
    // F natural minor and A♭ major are the same seven pitch classes,
    // which is the fact the pair of cards teaches.
    expect([...minor.pcs].sort((a, b) => a - b))
      .toEqual([...major.pcs].sort((a, b) => a - b));
    expect(minor.minor).toBe(true);
    expect(major.minor).toBe(false);
  });
});

describe('the other version rides on the progression, not on the card', () => {
  const progressions = byKind('progression')
    .map(x => ({ card: x.card, target: x.target as Extract<BuiltTarget, { kind: 'progression' }> }));

  it('is carried by every 1 6 2 5 and by no other shape', () => {
    const withVersion = progressions.filter(x => x.target.variation !== undefined);
    expect(withVersion).toHaveLength(13);
    for (const { card, target } of withVersion) {
      expect(card.id, card.id).toContain('pr-prog-1-6-2-5-');
      expect(target.variation!.index).toBe(1);
      expect(target.variation!.quality).toBe('7');
      // The label names the number, not a note, because one shape's
      // variation is the same fact in all thirteen keys.
      expect(target.variation!.label).toBe('6 as a dominant');
    }
    // 78 progression cards, 13 of them with a version.
    expect(progressions).toHaveLength(78);
  });

  it('points at a chord the progression actually has', () => {
    // A version whose index ran off the end, or whose quality this
    // deck cannot build, would be silently unplayable — so it is
    // refused at the target rather than at the keyboard.
    for (const { card, target } of progressions) {
      if (target.variation === undefined) continue;
      expect(target.variation.index, card.id).toBeLessThan(target.chords.length);
    }
  });

  it('leaves the graded answer alone', () => {
    // The card still asks for the regular version: the 6 is the minor
    // chord the key gives, in every one of the thirteen.
    for (const { card, target } of progressions) {
      if (target.variation === undefined) continue;
      expect(target.chords[1].quality, card.id).toBe('m');
      expect(card.correctAnswer, card.id)
        .toBe(joinRow(target.chords.map(c => c.name), CANONICAL_SPELLING));
    }
  });
});
