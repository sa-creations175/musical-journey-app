/**
 * The chord duration control's unit, in one place.
 *
 * WHY THIS EXISTS. `ChordPlacement.beats` is stored in SLOTS on a song
 * with eighths on — a slot being half a beat — and the duration editor
 * rendered that number raw under the label "beats". A chord filling a
 * 4/4 bar therefore read "8 beats", which is not 8 beats; it is 4. The
 * field was showing slots and calling them beats.
 *
 * That is not a cosmetic complaint. Wanting a chord to last a beat and
 * a half, with no correct number to type, leads to typing an odd
 * value — and an odd duration is exactly what flips the cascade
 * cursor's parity and displaces every chord after it onto an "and".
 * The mislabel is upstream of the damage, not adjacent to it.
 *
 * So: the control speaks in NOTE VALUES and says which one. Storage is
 * untouched — everything here converts at the edge, and `beats` stays
 * slot-counted so the tiling audit, the cascade and the unit stamp all
 * keep reading exactly what they read before.
 *
 * ON THE NAME. The unit is NOT hardcoded to quarter notes. The app
 * counts beats of the time signature, so in 6/8 a beat is an eighth
 * note and calling it a quarter would replace one wrong label with
 * another. The denominator decides, which is also the first use
 * `parseTimeSignature`'s `beatUnit` has ever had.
 */

/** Slots per beat. Eighths subdivide each beat in two; otherwise a
 *  slot IS a beat. This is the only conversion factor in play. */
export function slotsPerBeat(eighths: boolean): number {
  return eighths ? 2 : 1;
}

/**
 * The note value one beat represents, from the time signature's
 * denominator. Plural — it labels a count.
 *
 * Unrecognised denominators fall back to naming the fraction directly
 * ("1/16 notes") rather than guessing, because a wrong note name is
 * the bug this module exists to fix.
 */
export function beatNoteName(beatUnit: number): string {
  switch (beatUnit) {
    case 1: return 'whole notes';
    case 2: return 'half notes';
    case 4: return 'quarter notes';
    case 8: return 'eighth notes';
    case 16: return 'sixteenth notes';
    default: return `1/${beatUnit} notes`;
  }
}

/** Stored slots → beats, as a possibly-fractional number. */
export function beatsFromSlots(slots: number, eighths: boolean): number {
  return slots / slotsPerBeat(eighths);
}

/** Beats → stored slots, rounded to the nearest representable slot and
 *  floored at one. A non-eighths song cannot express half a beat, so
 *  2.5 there rounds rather than silently truncating. */
export function slotsFromBeats(beats: number, eighths: boolean): number {
  const raw = Math.round(beats * slotsPerBeat(eighths));
  return Math.max(1, raw);
}

/**
 * Render a stored slot count as a note-value count.
 *
 * Halves render as halves — "2½", not "2.5" and certainly not "5".
 * A half-beat duration is legitimate; the point is that it should be
 * VISIBLE as one rather than hiding inside an odd slot number, which
 * is how the accidental ones went unnoticed.
 */
export function formatDurationBeats(slots: number, eighths: boolean): string {
  const beats = beatsFromSlots(slots, eighths);
  const whole = Math.floor(beats);
  const rest = beats - whole;
  if (rest === 0) return String(whole);
  if (rest === 0.5) return whole === 0 ? '½' : `${whole}½`;
  // Not reachable with the current 2-slots-per-beat model, but a
  // finer subdivision later shouldn't render garbage.
  return String(Number(beats.toFixed(2)));
}

/**
 * Parse what the user typed into a beat count. Returns null when the
 * input isn't a duration at all, so the caller can leave the value
 * alone rather than coercing a typo into a number.
 *
 * Accepts: "2", "2.5", "2½", "½", "1 1/2", "3/2".
 */
export function parseDurationBeats(input: string): number | null {
  const text = input.trim().replace(/\s+/g, ' ');
  if (text === '') return null;

  // Unicode halves, with or without a leading whole number.
  const halved = text.replace(/½/g, '.5');
  const withImplicitZero = /^\.5$/.test(halved) ? '0.5' : halved;

  // "1 1/2"
  const mixed = withImplicitZero.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const denom = Number(mixed[3]);
    if (denom === 0) return null;
    return Number(mixed[1]) + Number(mixed[2]) / denom;
  }

  // "3/2"
  const fraction = withImplicitZero.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const denom = Number(fraction[2]);
    if (denom === 0) return null;
    return Number(fraction[1]) / denom;
  }

  // "2" / "2.5" / "2.5" from "2½"
  if (!/^\d*\.?\d+$/.test(withImplicitZero)) return null;
  const value = Number(withImplicitZero);
  return Number.isFinite(value) ? value : null;
}

/**
 * Full round trip for the editor: text in, clamped slot count out.
 * Returns null when the input is unparseable or non-positive, which
 * the caller treats as "leave it as it was".
 */
export function slotsFromDurationInput(
  input: string,
  eighths: boolean,
  maxSlots: number,
): number | null {
  const beats = parseDurationBeats(input);
  if (beats === null || beats <= 0) return null;
  return Math.min(slotsFromBeats(beats, eighths), Math.max(1, maxSlots));
}
