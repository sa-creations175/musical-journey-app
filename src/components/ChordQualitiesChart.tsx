/**
 * The chord-qualities-by-scale chart.
 *
 * =====================================================================
 * ONE CHART, TWO DOORS.
 *
 * Silas's decision of 13 Sep 2026, built from the walked prototype
 * `chord-qualities-by-scale.html` (v3): the reveal of every Diatonic
 * Chord Qualities card, and a link at the top of the Harmonic Diary.
 * The same component in both places, reading the same marks, so a dot
 * switched on under a flashcard is there in the diary.
 *
 * WHAT MAY DIFFER BETWEEN THE TWO, AND WHY:
 *
 *   · the reveal opens on the card's own cell, so the card at the top is
 *     already filled in for the chord just answered; the diary opens on
 *     nothing, as the prototype does
 *   · the reveal starts with the other modes folded (the card is about
 *     major and the minors); the diary starts them open, as the
 *     prototype does
 *   · the diary's sheet carries the title, so the chart there shows only
 *     the line under it
 *
 * The cells are computed from the scale steps (`chordQualitiesByScale`)
 * and the words are the prototype's. Colours are the diary's own tokens.
 * =====================================================================
 */
import { useEffect, useState } from 'react';
import {
  MAIN_ROWS, MODE_ROWS, cardTitle, cellKey, cellLabel, exampleLine, inC, inCLabel,
  seventhOn, whyLine, type ScaleId, type ScaleRow,
} from '../lib/chordQualitiesByScale';
import {
  clearMark, seedMarksIfNeeded, setMark, useChordQualityMarks,
} from '../lib/chordQualityMarks';

export const CHORD_QUALITIES_TITLE = 'Chord qualities by scale';

const DEGREES = [1, 2, 3, 4, 5, 6, 7];

export interface ChartCell {
  scale: ScaleId;
  degree: number;
}

export default function ChordQualitiesChart({
  select, modesFolded = false, showTitle = true, framed = false,
}: {
  /** The cell to open on. The reveal passes the card's own. */
  select?: ChartCell | null;
  /** Start with the other modes of major folded away. */
  modesFolded?: boolean;
  /** Show the title above the line under it. Off inside a sheet that
   *  already carries the title. */
  showTitle?: boolean;
  /** Draw the chart on its own card, for a surface that is not the
   *  diary's paper. */
  framed?: boolean;
}) {
  const marks = useChordQualityMarks();
  const [cur, setCur] = useState<ChartCell | null>(select ?? null);
  const [folded, setFolded] = useState(modesFolded);
  /** What the note box shows while a reader is typing into it, so a
   *  switched-off mark leaves its words in the box as the prototype does
   *  rather than blanking under the cursor. Keyed to the cell it is for. */
  const [draft, setDraft] = useState<{ cell: string; text: string } | null>(null);

  // A NEW READER'S CHART STARTS WITH SILAS'S MARKS, once.
  useEffect(() => { void seedMarksIfNeeded(); }, []);

  const have = marks ?? {};
  const curKey = cur === null ? null : cellKey(cur.scale, cur.degree);
  const marked = curKey !== null && curKey in have;
  const note = curKey === null ? ''
    : draft !== null && draft.cell === curKey ? draft.text : (have[curKey] ?? '');

  const pick = (scale: ScaleId, degree: number) => {
    setCur({ scale, degree });
    setDraft(null);
  };

  const onUse = (on: boolean) => {
    if (curKey === null) return;
    if (on) {
      void setMark(curKey, note);
    } else {
      setDraft({ cell: curKey, text: note });
      void clearMark(curKey);
    }
  };

  const onNote = (text: string) => {
    if (curKey === null) return;
    setDraft({ cell: curKey, text });
    // TYPING A NOTE SWITCHES THE DOT ON BY ITSELF, and updates the note
    // of one that is already on: the same write either way.
    void setMark(curKey, text);
  };

  const row = (r: ScaleRow, hidden: boolean) => (
    <tr key={r.id} data-testid={`row-${r.id}`} hidden={hidden}>
      <td className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ borderTop: '1px solid var(--diary-rule)' }}>
        {r.name}
        <small className="block font-normal text-[11px]" style={{ color: 'var(--diary-text-muted)' }}>{r.note}</small>
      </td>
      {DEGREES.map(d => {
        const key = cellKey(r.id, d);
        const q = seventhOn(r.id, d);
        const lit = curKey === key;
        const used = key in have;
        return (
          <td
            key={d}
            className="p-0 text-center"
            style={{ borderTop: '1px solid var(--diary-rule)' }}
          >
            <button
              type="button"
              data-testid={`cell-${key}`}
              aria-pressed={lit}
              title={q.name}
              onClick={() => pick(r.id, d)}
              className="relative w-full px-2 py-2 font-mono whitespace-nowrap"
              style={{
                background: lit ? 'rgba(138, 125, 82, 0.22)' : used ? 'rgba(107, 122, 79, 0.14)' : 'transparent',
                boxShadow: lit ? 'inset 0 0 0 2px var(--diary-accent)' : 'none',
              }}
            >
              {q.symbol}
              {used && (
                <span
                  data-testid={`dot-${key}`}
                  aria-label="one I use"
                  className="absolute top-[5px] right-[5px] w-[7px] h-[7px] rounded-full"
                  style={{ background: 'var(--diary-accent-earth)' }}
                />
              )}
            </button>
          </td>
        );
      })}
    </tr>
  );

  const dotted = [...MAIN_ROWS, ...MODE_ROWS]
    // EVERY DOTTED CELL IS LISTED, the major row's too (Silas, 14 Sep
    // 2026): the list is the ones with a dot, and major's are dots.
    .flatMap(r => DEGREES.map(d => ({ scale: r.id, degree: d, key: cellKey(r.id, d) })))
    .filter(c => c.key in have);

  return (
    <div
      className={`diary-palette space-y-3 text-[14px] leading-relaxed ${framed ? 'rounded-xl p-3 sm:p-4' : ''}`}
      style={framed ? { background: 'var(--diary-card-bg)', border: '1px solid var(--diary-rule)' } : undefined}
      data-testid="chord-qualities-chart"
    >
      {showTitle && (
        <h3 className="diary-serif text-xl font-medium">{CHORD_QUALITIES_TITLE}</h3>
      )}
      <p className="max-w-[66ch]" style={{ color: 'var(--diary-text-muted)' }}>
        Every scale gives each degree a seventh chord. Tap a cell to see it in the key of{' '}
        <b>C</b> and what the scale did to make it. A green dot marks the ones you reach for in
        real songs; tap a cell to switch its dot on or off and write where you use it.
      </p>

      {cur !== null && (
        <div
          className="rounded-lg px-4 py-3"
          style={{ background: 'var(--diary-card-bg)', border: '1px solid var(--diary-rule)', boxShadow: 'var(--diary-card-shadow)' }}
          data-testid="chord-quality-card"
        >
          <div className="diary-serif text-lg font-medium" data-testid="cqc-title">
            {cardTitle(cur.scale, cur.degree)}
          </div>
          <div className="mt-1">
            <span className="font-semibold mr-2" data-testid="cqc-in">{inCLabel(cur.scale)}</span>
            <span className="font-mono" style={{ color: 'var(--diary-accent-earth)' }} data-testid="cqc-example">
              {exampleLine(cur.scale, cur.degree)}
            </span>
          </div>
          {whyLine(cur.scale, cur.degree) !== '' && (
            <div className="mt-1.5 text-[13.5px]" style={{ color: 'var(--diary-text-muted)' }} data-testid="cqc-why">
              {whyLine(cur.scale, cur.degree)}
            </div>
          )}
          <div className="mt-2.5 pt-2.5 flex flex-wrap items-center gap-3" style={{ borderTop: '1px solid var(--diary-rule)' }}>
            <label className="flex items-center gap-1.5 whitespace-nowrap">
              <input
                type="checkbox"
                checked={marked}
                onChange={e => onUse(e.currentTarget.checked)}
                data-testid="cqc-use"
              />
              <span>This is one I use</span>
            </label>
            <input
              type="text"
              value={note}
              placeholder="Where I use it (a song, a moment, a feel)"
              onChange={e => onNote(e.currentTarget.value)}
              className="flex-1 min-w-[200px] rounded-md px-2 py-1.5"
              style={{ border: '1px solid var(--diary-rule)', background: 'rgba(255, 255, 255, 0.6)' }}
              data-testid="cqc-note"
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[640px] border-separate border-spacing-0 rounded-lg text-[13.5px]"
          style={{ border: '1px solid var(--diary-rule)', background: 'rgba(255, 255, 255, 0.35)' }}
        >
          <thead>
            <tr style={{ background: 'rgba(58, 61, 42, 0.06)' }}>
              {['Scale', ...DEGREES.map(String)].map((h, i) => (
                <th
                  key={h}
                  className={`px-2 py-2 text-[11px] uppercase tracking-[0.08em] font-semibold ${i === 0 ? 'text-left pl-3' : 'text-center'}`}
                  style={{ color: 'var(--diary-text-muted)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={8} className="diary-serif px-3 py-1.5 text-base font-medium" style={{ color: 'var(--diary-accent)', background: 'var(--diary-card-bg)', borderTop: '1px solid var(--diary-rule)' }}>
                Major and the three minors
              </td>
            </tr>
            {MAIN_ROWS.map(r => row(r, false))}
            <tr>
              <td colSpan={8} className="p-0" style={{ background: 'var(--diary-card-bg)', borderTop: '1px solid var(--diary-rule)' }}>
                <button
                  type="button"
                  data-testid="modes-toggle"
                  aria-expanded={!folded}
                  onClick={() => setFolded(f => !f)}
                  className="diary-serif w-full text-left px-3 py-1.5 text-base font-medium"
                  style={{ color: 'var(--diary-accent)' }}
                >
                  <span
                    aria-hidden
                    className="inline-block w-[1em] transition-transform"
                    style={{ transform: folded ? 'rotate(-90deg)' : 'none' }}
                  >
                    ▾
                  </span>
                  {' '}The other modes of major (the major row, shifted along)
                </button>
              </td>
            </tr>
            {MODE_ROWS.map(r => row(r, folded))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 text-[13px]" style={{ color: 'var(--diary-text-muted)' }}>
        <span>
          <i className="inline-block w-3 h-3 rounded-full mr-1.5 align-[-1px]" style={{ background: 'var(--diary-accent-earth)' }} />
          reached for in real songs
        </span>
        <span>
          <b className="inline-block w-3.5 h-3.5 rounded-sm mr-1.5 align-[-2px]" style={{ background: 'rgba(138, 125, 82, 0.22)', boxShadow: 'inset 0 0 0 2px var(--diary-accent)' }} />
          the cell you tapped
        </span>
      </div>

      <h4 className="pt-2 text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--diary-text-muted)' }}>
        The ones with a dot, and where they live
      </h4>
      <ul className="list-none p-0 m-0" data-testid="cqc-used">
        {dotted.map((c, i) => (
          <li
            key={c.key}
            className="grid grid-cols-[150px_1fr] gap-3 py-1.5"
            style={i === 0 ? undefined : { borderTop: '1px solid var(--diary-rule)' }}
          >
            <b className="font-mono font-medium">{cellLabel(c.scale, c.degree)}</b>
            <span style={{ color: 'var(--diary-text-muted)' }}>
              {have[c.key] || 'no note yet'} ({inC(c.scale, c.degree).chord} in C)
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[13px] max-w-[66ch]" style={{ color: 'var(--diary-text-muted)' }}>
        Degrees count from the scale&apos;s own root. Written as seventh chords; the triad is the
        first three notes of each.
      </p>
    </div>
  );
}

