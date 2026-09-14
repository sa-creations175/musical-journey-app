/**
 * What the colours on the keyboard mean, under every reveal.
 *
 * =====================================================================
 * THE BOARD HAS BEEN TEACHING A VOCABULARY NOBODY WROTE DOWN.
 *
 * Every reveal in the app paints its chord tones by interval — deep
 * green root, teal ♭3, grey 5, amber ♭7 — and bands the bass in green,
 * and on some surfaces rings the root in the chord's degree-of-the-key
 * colour. Three systems, all of them meaningful, none of them named
 * anywhere a reader could look. Silas's ruling of 10 Sep 2026 puts a
 * fold under the shared keyboard that says all three.
 *
 * CLOSED BY DEFAULT AND REMEMBERED PER DEVICE. It is a reference, not
 * part of the answer: a reader who has learned the colours should not
 * have to close it on every card, and one who has not should find it
 * exactly where they left it open.
 *
 * =====================================================================
 * THE CHIPS ARE THE SOUNDING CHORD, NOT THE WRITTEN ONE.
 *
 * One chip per note that is actually playing, in the colour that note
 * is actually painted, named by its interval from the chord's root —
 * "D root · bass · F ♭3 · A 5 · C ♭7". So a reader can point at a key,
 * find its chip, and read what it is. That means the chips follow
 * Listen to, the octave lift and the bass drop, exactly as the board
 * does; anything else would be a legend for a chord that is not
 * sounding.
 *
 * =====================================================================
 * ONE LINE PER CHORD, AND IT NAMES A DEGREE RATHER THAN A CHORD.
 *
 * "this chord is the 4 of the key" — never "the 4m", because the ring
 * answers where in the key the chord sits and its quality is a separate
 * fact the chip row above already carries.
 *
 * WHEN THE CHORD IS THE 1 THERE IS NO RING and the line says so: its
 * root is the key's home, so a ring would be saying what the fill
 * already says. See `inKeyRing` for why a green ring beside the
 * interval palette's green root was the wrong mark.
 *
 * THE GREEN BAND LINE IS WRITTEN ONLY WHEN THE BAND IS THE ONLY THING
 * MARKING ITS KEY. Where the bass is the chord's own root the chip row
 * already says "D root · bass" and the band needs no gloss; where the
 * bass is some other note — a slash chord — the band is the only mark
 * that key carries and the line earns its place.
 *
 * A legend naming a mark that is not on the screen is worse than no
 * legend, so neither line is written unless the mark is drawn.
 * =====================================================================
 */
import { useState, type ReactNode } from 'react';
import { intervalColor } from '../lib/voicingColors';
import { soundingNotes, type PlayerChord } from '../lib/player/voices';
import type { PlayerSettings } from '../lib/player/settings';
import { spellNote, type Spelling } from '../lib/spelling';
import type { InKeyRing } from '../lib/player/inKeyColour';
import { readLegendOpen, writeLegendOpen } from '../lib/player/legendFold';

/**
 * What each interval is called, from the chord's own root.
 *
 * THE NAMES A PLAYER USES, not the mod-12 arithmetic: a minor third is
 * "♭3" and a minor seventh is "♭7", which is how the chord symbol above
 * the staff already writes them.
 */
const INTERVAL_NAME: Readonly<Record<number, string>> = {
  0: 'root', 1: '♭9', 2: '9', 3: '♭3', 4: '3', 5: '11',
  6: '♯11', 7: '5', 8: '♯5', 9: '13', 10: '♭7', 11: '7',
};

/** One chip: a swatch and a name. */
function Chip({ colour, children, outline }: {
  colour: string; children: ReactNode; outline?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04]
      dark:bg-white/[0.06] px-2 py-0.5 text-xs"
    >
      <i
        aria-hidden
        data-testid="legend-swatch"
        className="inline-block h-3 w-3 rounded-[3px] shrink-0"
        style={outline === true
          ? { border: `3px solid ${colour}` }
          : { background: colour }}
      />
      {children}
    </span>
  );
}

interface Props {
  /** The chord sounding now, or null before anything has played. */
  chord: PlayerChord | null;
  settings: PlayerSettings;
  spelling: Spelling;
  /** The ring this surface draws on the chord's root, where it draws
   *  one. Omitted, the ring line is not written. */
  ring?: InKeyRing | null;
}

export default function ChordColorLegend({
  chord, settings, spelling, ring,
}: Props) {
  const [open, setOpen] = useState(readLegendOpen);
  // THE CHORD AS IT SOUNDS, its bass already in its register — so the
  // chips follow the board.
  const { notes, hands } = chord === null
    ? { notes: [] as number[], hands: [] as Array<'L' | 'R'> }
    : soundingNotes(chord, settings);

  // ONE CHIP PER SOUNDING PITCH CLASS. The same note in two octaves is
  // one fact about the chord, and two identical chips would read as
  // two different notes.
  const seen = new Set<string>();
  const chips = [...notes]
    .map((midi, i) => ({ midi, hand: hands[i] }))
    .sort((a, b) => a.midi - b.midi)
    .filter(({ midi }) => {
      const iv = chord === null ? 0 : (((midi - chord.rootPc) % 12) + 12) % 12;
      const key = `${((midi % 12) + 12) % 12}:${iv}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // THE BAND IS THE ONLY MARK ON ITS KEY when the bass is not the
  // chord's own root — a slash bass. Where it IS the root the chips
  // already name it "root · bass" and a second line would gloss a mark
  // the reader has already been told about.
  const bandOnlyMark = chord !== null
    && chord.bass !== null
    && (((chord.bass - chord.rootPc) % 12) + 12) % 12 !== 0;

  return (
    <details
      open={open}
      data-testid="chord-color-legend"
      onToggle={e => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(next);
        writeLegendOpen(next);
      }}
      className="rounded-lg border border-dashed border-black/10 dark:border-white/15 px-3 py-2"
    >
      <summary className="cursor-pointer text-xs text-neutral-500 dark:text-neutral-400">
        Chord Color Legend
      </summary>
      <div className="space-y-2 pt-2">
        <div className="flex flex-wrap gap-1.5" data-testid="legend-chips">
          {chips.map(({ midi, hand }) => {
            const iv = chord === null
              ? 0
              : (((midi - chord.rootPc) % 12) + 12) % 12;
            // THE INTERVAL AND THE JOB, not one or the other. A root
            // played in the bass is both, and a chip saying only "bass"
            // would leave the reader to work out which note of the
            // chord it is.
            // THE LEFT HAND IS ALWAYS THE BASS since one-hand mode retired.
            const isBass = hand === 'L';
            return (
              <Chip key={midi} colour={intervalColor(iv)}>
                {chord !== null && chord.rootLetter !== undefined
                  && (((midi - chord.rootPc) % 12) + 12) % 12 === 0
                  ? chord.rootLetter
                  : spellNote(midi, spelling)}{' '}
                <span className="text-neutral-500">
                  {INTERVAL_NAME[iv]}{isBass ? ' · bass' : ''}
                </span>
              </Chip>
            );
          })}
        </div>

        <div className="space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
          {ring != null && (
            <div className="flex items-center gap-1.5" data-testid="legend-ring-line">
              {ring.colour === null
                ? (
                  <span data-testid="legend-home-line">
                    This chord is the {ring.degree} of the key: its root is
                    the key&rsquo;s home, so it gets no ring.
                  </span>
                )
                : (
                  <Chip colour={ring.colour} outline>
                    {ring.colourWord} ring on the root = this chord is the{' '}
                    {ring.degree} of the key
                  </Chip>
                )}
            </div>
          )}
          {bandOnlyMark && (
            <div className="flex items-center gap-1.5" data-testid="legend-bass-line">
              {/* THE SAME GREEN AS THE ROOT FILL, BECAUSE IT IS ONE. The
                  band is `intervalColor(0)`; naming a second green here
                  would invent a distinction the board does not draw. */}
              <Chip colour={intervalColor(0)}>
                green band under a key = the bass note
              </Chip>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
