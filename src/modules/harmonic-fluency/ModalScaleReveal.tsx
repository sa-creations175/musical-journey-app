/**
 * The answer scale, drawn — after you have named it.
 *
 * =====================================================================
 * THE CARD'S OWN SENTENCE ASKED FOR THIS.
 *
 * Every borrowed card ends "The highlighted notes are the ones C major
 * does not have". Those are the prototype's words and on the prototype
 * there were notes to highlight; on a flashcard there were not, so the
 * sentence pointed at nothing. Ruled 9 Sep 2026: draw them, and the
 * sentence stays as written.
 *
 * =====================================================================
 * REVEAL-SIDE ONLY, which is the rule `DegreeNoteReveal` states at
 * length and this follows rather than restates: the row IS the answer
 * spelled out, so showing it beside an open question would replace
 * knowing with reading.
 *
 * =====================================================================
 * NO CAPTION, AND THAT IS DELIBERATE.
 *
 * The explanation sits directly above and already says what the row is
 * and what the marks mean. A heading here would be new copy nobody
 * wrote — see `docs/HARMONIC_FLUENCY_COPY.md`, which is the list of
 * words this module is allowed to say.
 * =====================================================================
 */
import CardPlayback from './CardPlayback';
import type { Flashcard } from './catalog';
import { MODAL_CHORDS, modalAnswerScale } from './modalImprovisation';

export default function ModalScaleReveal({ card }: { card: Flashcard }) {
  const axis = card.axis;
  const chord = MODAL_CHORDS.find(c => c.id === String(axis?.chord));
  // A card that has not said what it is about draws nothing — the same
  // answer `cardAudio` gives, for the same reason.
  if (axis === undefined || chord === undefined) {
    return <CardPlayback card={card} />;
  }
  const scale = modalAnswerScale(String(axis.key), chord);

  return (
    <div className="space-y-2 pt-2" data-testid="modal-scale-reveal">
      <div
        className="font-mono text-sm flex flex-wrap gap-x-4 gap-y-1"
        data-testid="modal-scale"
      >
        {scale.map(note => (
          <span
            key={note.note}
            data-outside={note.outside ? 'true' : 'false'}
            className={note.outside
              ? 'text-borrowed font-medium'
              : 'text-black/60 dark:text-white/60'}
          >
            {note.note}
          </span>
        ))}
      </div>
      <CardPlayback card={card} />
    </div>
  );
}
