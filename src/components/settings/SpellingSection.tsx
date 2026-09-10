/**
 * Setting Note & Progression Spelling — Section 4 of the Settings page.
 *
 * =====================================================================
 * THE PREVIEW COMES FIRST, BECAUSE THE CONTROLS MEAN NOTHING WITHOUT
 * IT.
 *
 * "Only on spelled loops" is not a phrase anybody can evaluate from the
 * words. Silas's walked page of 10 Sep 2026 puts six real places the
 * spelling lands at the top — a grid row, the minor 2 5 1, the title
 * above the drill player, a flashcard question and answer, the rotate
 * button, a key name — and every one of them updates as a control is
 * tapped. The controls are underneath because by then you know what
 * they do.
 *
 * A CELL THAT CHANGED FLASHES FOR ABOUT A SECOND. Six rows change at
 * once when the separator moves and only one when the half-diminished
 * does; without the flash the reader has to hunt for what a tap did.
 * Respects `prefers-reduced-motion`, which is what the media query in
 * `index.css` is for.
 *
 * =====================================================================
 * EVERY PREVIEW ROW IS BUILT BY THE APP'S OWN FORMATTER.
 *
 * `progressionRow` and `patternRowLabel` are what the grid, the cards
 * and the drill title call. A preview that re-implemented the spelling
 * would be a seventh place the rules live, and the one place a reader
 * checks them — so it would be the last thing to be found wrong.
 *
 * THE WORD IS "THICKNESS", NEVER "RUNG". `rung` is what the code calls
 * the argument; the ladder on screen has always said Thickness.
 * =====================================================================
 */
import { useEffect, useRef, useState } from 'react';
import {
  QUALITY_LABEL, SEPARATOR_LABEL, useProgressionSpelling,
  type ChordSeparator, type HalfDimSeventh, type HalfDimTriad,
  type ProgressionSpelling, type QualityDisplay,
} from '../../lib/progressionSpelling';
import { joinRow, progressionRow } from '../../lib/progressionRow';
import {
  ROW_NAME_BY_ID, patternRowLabel, VOICE_LEADING_PATTERN_BY_ID,
} from '../../modules/shapes-and-patterns/catalog';
import { SPELLING_LABEL, useSpelling } from '../../lib/spellingPref';
import { spellNote, type Spelling } from '../../lib/spelling';
import { PartHeading } from './ratingsCopy';

/** The row a preview line is built from, spelled to these settings. */
function row(id: string, settings: ProgressionSpelling, rung?: 'seventh'): string {
  const name = ROW_NAME_BY_ID.get(id)!;
  return progressionRow(name.chords, {
    settings,
    ...(rung ? { rung } : {}),
    named: name.prefix !== '' || name.suffix !== '',
    ...(name.keepQualityAt ? { keepQualityAt: name.keepQualityAt } : {}),
  });
}

/** The row's full name — its word plus its chords. */
function label(id: string, settings: ProgressionSpelling, rung?: 'seventh'): string {
  const builtin = VOICE_LEADING_PATTERN_BY_ID.get(id)!;
  return patternRowLabel(id, builtin.label, {
    settings, ...(rung ? { rung } : {}),
  });
}

/** The six places the prototype shows, in its order. */
function previewRows(
  settings: ProgressionSpelling, spelling: Spelling,
): ReadonlyArray<{ where: string; reads: string; rotate?: boolean }> {
  const loop = row('1-5-6-4', settings);
  const bFlat = spellNote(10, spelling);
  const eFlat = spellNote(3, spelling);
  return [
    { where: 'A drill grid row', reads: loop },
    {
      where: 'The Minor 2 5 1 row on the drill grid',
      reads: label('minor-251', settings),
    },
    {
      where: 'The title above the drill player, at Seventh chords thickness',
      reads: `${label('minor-251', settings, 'seventh')} · Seventh chords`
        + ` · Position 2 · the key of ${bFlat} major`,
    },
    {
      where: 'A flashcard question and answer',
      reads: `The ${loop} in the key of F major is `
        + joinRow(['F', 'C', 'Dm', bFlat], settings),
    },
    { where: 'The rotate button on a flashcard', reads: loop, rotate: true },
    { where: 'A key name', reads: `the key of ${eFlat} major` },
  ];
}

/** A preview cell that flashes when its own text changes. */
function PreviewCell({ text, rotate }: { text: string; rotate?: boolean }) {
  const [flash, setFlash] = useState(false);
  const previous = useRef(text);
  useEffect(() => {
    if (previous.current === text) return;
    previous.current = text;
    setFlash(false);
    // Two frames, so the class comes off and goes back on — an
    // animation re-added in the same frame never restarts.
    const id = window.requestAnimationFrame(() => setFlash(true));
    return () => window.cancelAnimationFrame(id);
  }, [text]);
  return (
    <td
      data-testid="spelling-preview-cell"
      data-flash={flash}
      onAnimationEnd={() => setFlash(false)}
      className={`py-2 pl-3 font-semibold align-middle
        ${flash ? 'settings-flash' : ''}`}
    >
      {rotate === true ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-fluent
          text-white px-2.5 py-0.5 text-sm"
        >
          <span aria-hidden className="opacity-80">↻</span>
          <span>{text}</span>
        </span>
      ) : text}
    </td>
  );
}

/** One labelled row of segmented choices. */
function Choice<T extends string>({
  label: rowLabel, value, options, onChange, testIdPrefix, disabled,
}: {
  label?: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (next: T) => void;
  testIdPrefix: string;
  disabled?: boolean;
}) {
  return (
    <div className="mb-2">
      {rowLabel !== undefined && (
        <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 mb-1.5">
          {rowLabel}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {options.map(([id, text]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            disabled={disabled === true}
            data-testid={`${testIdPrefix}-${id}`}
            onClick={() => onChange(id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors
              disabled:cursor-default ${
              value === id
                ? 'bg-fluent text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SpellingSection() {
  const [settings, setSettings] = useProgressionSpelling();
  const [spelling, setSpelling] = useSpelling();
  const set = (patch: Partial<ProgressionSpelling>) => {
    void setSettings({ ...settings, ...patch });
  };
  const qualitiesOff = settings.qualities === 'off';

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        How notes and progressions are written everywhere they appear. Change a
        choice and the preview updates.
      </p>

      <table
        className="w-full text-sm rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800"
        data-testid="spelling-preview"
      >
        <thead>
          <tr>
            <th className="text-left font-semibold uppercase tracking-[0.06em]
              text-[10px] text-neutral-500 py-2 pl-3 w-[46%]"
            >
              Where
            </th>
            <th className="text-left font-semibold uppercase tracking-[0.06em]
              text-[10px] text-neutral-500 py-2 pl-3"
            >
              Reads as
            </th>
          </tr>
        </thead>
        <tbody>
          {previewRows(settings, spelling).map(r => (
            <tr key={r.where} className="border-t border-neutral-200 dark:border-neutral-700">
              <td className="py-2 pl-3 pr-2 text-neutral-500 align-middle">{r.where}</td>
              <PreviewCell text={r.reads} {...(r.rotate ? { rotate: true } : {})} />
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <PartHeading>Note names</PartHeading>
        <Choice
          value={spelling}
          testIdPrefix="spelling-notes"
          options={[
            ['flat', `Flats (${spellNote(10, 'flat')}, ${spellNote(3, 'flat')})`],
            ['sharp', `Sharps (${spellNote(10, 'sharp')}, ${spellNote(3, 'sharp')})`],
          ] as ReadonlyArray<readonly [Spelling, string]>}
          onChange={s => { void setSpelling(s); }}
        />
        <p className="text-sm text-neutral-500">
          Used for every note and key name in the app.
        </p>
      </div>

      <div>
        <PartHeading>Between the chords of a progression</PartHeading>
        <Choice
          value={settings.separator}
          testIdPrefix="spelling-sep"
          options={(Object.keys(SEPARATOR_LABEL) as ChordSeparator[])
            .map(id => [id, SEPARATOR_LABEL[id]] as const)}
          onChange={separator => set({ separator })}
        />
      </div>

      <div>
        <PartHeading>Chord qualities in a progression</PartHeading>
        <Choice
          value={settings.qualities}
          testIdPrefix="spelling-qual"
          options={(Object.keys(QUALITY_LABEL) as QualityDisplay[])
            .map(id => [id, QUALITY_LABEL[id]] as const)}
          onChange={qualities => set({ qualities })}
        />
        <p className="text-sm text-neutral-500 mb-2">
          &quot;Only on spelled loops&quot;: a progression with a name (Major
          2 5 1, Minor 2 5 1, the backdoor) is written as its name; a loop with
          no name (1 5 6 4) is spelled with its qualities.
        </p>

        {/* GREYED OUT WHEN QUALITIES ARE OFF, not hidden. Two controls
            that vanish would look like a page that changed shape; two
            that dim say "these belong to the choice above". */}
        <div
          data-testid="spelling-qual-sub"
          data-disabled={qualitiesOff}
          className={`border-l-2 border-neutral-200 dark:border-neutral-700 pl-3.5 ml-1.5
            ${qualitiesOff ? 'opacity-40' : ''}`}
        >
          <p className="text-sm text-neutral-500 mb-2">
            Major is bare (1, 4, 5) and minor is &quot;m&quot; (6m). Two
            qualities have more than one common abbreviation, so you choose:
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1">
            <span className="text-sm min-w-[220px]">
              Diminished (a triad, or anywhere no thickness is set)
            </span>
            <Choice
              value={settings.halfDimTriad}
              testIdPrefix="spelling-hd3"
              disabled={qualitiesOff}
              options={[['°', '°'], ['dim', 'dim']] as ReadonlyArray<readonly [HalfDimTriad, string]>}
              onChange={halfDimTriad => set({ halfDimTriad })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1">
            <span className="text-sm min-w-[220px]">
              Half-diminished (a seventh chord)
            </span>
            <Choice
              value={settings.halfDimSeventh}
              testIdPrefix="spelling-hd7"
              disabled={qualitiesOff}
              options={[['ø', 'ø'], ['m7♭5', 'm7♭5']] as ReadonlyArray<readonly [HalfDimSeventh, string]>}
              onChange={halfDimSeventh => set({ halfDimSeventh })}
            />
          </div>
          <p className="text-sm text-neutral-500">
            The 2 of a minor 2 5 1 and the 7 of the Diatonic Cycle are the
            chords this touches: diminished at Triads thickness, half-diminished
            at Seventh chords and Full voicing.
          </p>
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        {SPELLING_LABEL[spelling]} · display only, and no practice data changes.
      </p>
    </div>
  );
}
