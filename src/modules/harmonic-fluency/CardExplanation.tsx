/**
 * A card's explanation, rendered.
 *
 * =====================================================================
 * ONE RENDERER FOR THE FAMILY, WHICH IS WHY IT IS NOT TWO COMPONENTS.
 *
 * Every explanation in this deck goes through here: mode names become
 * links, and a key signature's accidentals take the colours the
 * keyboard gives them. The shell hands over a string and a card and
 * takes back a node; which treatment a card gets is this module's
 * business rather than the session's, so the session's own line stays
 * one line.
 *
 * =====================================================================
 * THE SAME COLOUR IN THE SENTENCE AS ON THE KEYS.
 *
 * "The key of E♭ major has 3 flats: B♭ E♭ A♭" is the card's whole
 * answer, and the reveal below it draws the scale with each note
 * coloured by its job. Reading the three in black and then finding them
 * in three colours is two pictures of one fact; this makes it one.
 *
 * `INTERVAL_COLOR` by interval from the KEY ROOT, which is exactly what
 * `scaleMarks` does for the same notes — so B♭ is the grey of a fifth
 * in the key of E♭ major and the pale amber of a seventh in the key of
 * B major.
 *
 * =====================================================================
 * IT COLOURS THE LIST AND NOTHING ELSE.
 *
 * WHICH accidentals is read off the card's key through
 * `signatureAccidentals` — the function that wrote them — and never
 * parsed out of the sentence. WHERE the list sits is the one thing
 * taken from the text: the span between the colon and the stop after
 * it. That keeps "E♭" in "the key of E♭ major" black, and keeps the
 * gloss on the end of the G♭ card ("C♭ is B on the keyboard") out of
 * it, without either being special-cased.
 *
 * =====================================================================
 * A CARD THIS DOES NOT APPLY TO GETS ITS TEXT BACK UNCHANGED, and every
 * surface that renders an explanation as a plain string keeps doing so.
 * Colour is an addition to one reveal, not a new way of storing copy.
 * =====================================================================
 */
import { Fragment, type ReactNode } from 'react';
import ModeLinkify from '../ear-training/scales-modes/ModeLinkify';
import { intervalColor } from '../../lib/voicingColors';
import { pitchClassOf } from '../../lib/spelling';
import type { Flashcard } from './catalog';
import { signatureAccidentals } from './catalogExpansions';

/**
 * Whether this card's explanation lists a key signature.
 *
 * READ OFF `axis`, never off the sentence — the rule the whole module
 * follows. `ask: 'count'` is the card that ends by naming the
 * accidentals; every other key-signature shape talks about them
 * without listing any.
 */
function listsAccidentals(card: Flashcard): boolean {
  return card.category === 'key-signatures'
    && String(card.axis?.ask ?? '') === 'count';
}

export default function CardExplanation({
  text, card,
}: {
  text: string;
  card: Flashcard;
}) {
  // NO COUNT CARD NAMES A MODE, so the two treatments never need to
  // compose and neither has to know about the other.
  if (!listsAccidentals(card)) return <ModeLinkify text={text} />;
  const root = String(card.axis?.key ?? '');
  const rootPc = pitchClassOf(root);
  const names = signatureAccidentals(root);
  const colon = text.indexOf(': ');
  const stop = colon < 0 ? -1 : text.indexOf('.', colon);
  if (rootPc === null || names.length === 0 || colon < 0 || stop < 0) {
    // The key with no accidentals at all, and anything whose sentence
    // has no list in it: the text, unchanged.
    return <>{text}</>;
  }

  const before = text.slice(0, colon + 2);
  const list = text.slice(colon + 2, stop);
  const after = text.slice(stop);

  /**
   * The list, split on the names this key carries.
   *
   * Walked left to right rather than replaced, so a name that appears
   * twice is coloured twice and anything between them survives — the
   * separator is a space today and nothing here depends on that.
   */
  const parts: ReactNode[] = [];
  let rest = list;
  let key = 0;
  while (rest.length > 0) {
    const hit = names
      .map(name => ({ name, at: rest.indexOf(name) }))
      .filter(h => h.at >= 0)
      .sort((a, b) => a.at - b.at || b.name.length - a.name.length)[0];
    if (hit === undefined) {
      parts.push(<Fragment key={key += 1}>{rest}</Fragment>);
      break;
    }
    if (hit.at > 0) parts.push(<Fragment key={key += 1}>{rest.slice(0, hit.at)}</Fragment>);
    const pc = pitchClassOf(hit.name);
    parts.push(
      <span
        key={key += 1}
        data-testid={`accidental-${hit.name}`}
        style={pc === null ? undefined : { color: intervalColor(pc - rootPc) }}
        className="font-medium"
      >
        {hit.name}
      </span>,
    );
    rest = rest.slice(hit.at + hit.name.length);
  }

  return (
    <>
      {before}
      {parts}
      {after}
    </>
  );
}
