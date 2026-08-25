/**
 * The grand-staff reference. One component, three homes.
 *
 * =====================================================================
 * BUILT ONCE ON PURPOSE.
 *
 * This is the reference page, the reading reveal panel, and the
 * cross-module reference page when that exists. A second drawing of the
 * same staff would be a second answer to "where does middle C sit", and
 * the two would part company the first time one was edited.
 * =====================================================================
 *
 * TWO LABEL COLUMNS, AND THAT IS THE WHOLE LAYOUT.
 *
 * Every position stacked in one column put a row every 14px, so the
 * rows overlapped and lines and spaces interleaved into one
 * undifferentiated list. Split into SPACES and LINES, the rows within a
 * column are two diatonic steps apart — 28px — which is what stops them
 * colliding, and which of the two columns a note is in becomes a fact
 * you can read at a glance.
 *
 * THE LETTER IS THE MARK. There are no noteheads. An oval per position
 * drew 33 identical shapes down a page whose subject is which LETTER
 * sits where.
 *
 * GEOMETRY IS DERIVED FROM THE LADDER. `y = BOTTOM_Y - index * STEP_PX`
 * places every row, and everything else — the staff lines, the brace,
 * the barlines, the clef labels, the ledger brackets — is placed from
 * the y of a NAMED position rather than from a number typed twice. Add
 * a ledger in `staffLadder` and the furniture follows.
 *
 * COLOUR COMES FROM TOKENS, never a literal: `developing` for ledgers
 * (the amber already behind every progress bar's wrong answers) and
 * `fluent` for middle C. The staff itself is ink.
 */
import { useState } from 'react';
import { buildLadder, type StaffPosition } from './staffLadder';
import { useMnemonics } from './mnemonics';

// --- Geometry, all in stage units ------------------------------------

/** One diatonic step. Two of them is the gap between staff lines. */
const STEP_PX = 14;

/** Where the lowest position on the ladder sits. */
const BOTTOM_Y = 544;

const STAGE_W = 850;
const STAGE_H = 584;

/** The staff lines' horizontal extent — ledgers run the same width. */
const STAFF_X1 = 112;
const STAFF_X2 = 800;

/** Left edge of each label column. */
const SPACES_X = 196;
const LINES_X = 452;

/** Column header baseline, above the topmost row. */
const HEADER_Y = 52;

/** Half a row: rows are centred on their position's line or space. */
const ROW_H = 26;

/** How far a ledger bracket stands off the group it encloses. */
const BRACKET_PAD = 20;

/** The bracket's own depth, left of the staff. */
const BRACKET_X = 50;
const BRACKET_BACK_X = 42;
const ZONE_LABEL_X = 35;
const CLEF_LABEL_X = 93;
const BRACE_X = 98;

const yOf = (pos: StaffPosition): number => BOTTOM_Y - pos.index * STEP_PX;

export interface StaffReferenceProps {
  /**
   * The position to mark, as a ladder id like "C4".
   *
   * The reveal panel's whole reason for existing: the note that was
   * just asked about is ON the drawing, so the panel always contains
   * the answer.
   */
  highlight?: string | null;
  /** Start with octave numbers shown. The control is still there. */
  showOctavesInitially?: boolean;
  /** Whether a mnemonic can be edited here. The panel is for reading. */
  editable?: boolean;
}

export default function StaffReference({
  highlight = null, showOctavesInitially = true, editable = false,
}: StaffReferenceProps) {
  const ladder = buildLadder();
  const { mnemonics, set } = useMnemonics();
  const [showOctaves, setShowOctaves] = useState(showOctavesInitially);

  const staffLines = ladder.filter(p => p.kind === 'line' && !p.isLedgerLine);
  const ledgerLines = ladder.filter(p => p.isLedgerLine);
  const ledgersAbove = ladder.filter(p => p.region === 'ledger-above' && p.kind === 'line');
  const ledgersBelow = ladder.filter(p => p.region === 'ledger-below' && p.kind === 'line');
  const trebleLines = ladder.filter(p => p.region === 'treble' && p.kind === 'line');
  const bassLines = ladder.filter(p => p.region === 'bass' && p.kind === 'line');

  const trebleTop = yOf(trebleLines[trebleLines.length - 1]);
  const trebleBottom = yOf(trebleLines[0]);
  const bassTop = yOf(bassLines[bassLines.length - 1]);
  const bassBottom = yOf(bassLines[0]);

  return (
    <div data-testid="staff-reference">
      {/* THE CONTROL SAYS WHAT IT DOES. It was labelled "8va", which is
          an instruction to play an octave higher — a different thing
          entirely from showing the digit after each letter. */}
      <label className="inline-flex items-center gap-2 mb-3 text-xs text-neutral-600 dark:text-neutral-300 cursor-pointer">
        <input
          type="checkbox"
          checked={showOctaves}
          onChange={e => setShowOctaves(e.target.checked)}
          data-testid="staff-reference-octaves"
          className="accent-fluent"
        />
        show octave numbers
      </label>

      <div className="rounded-xl border border-black/[0.07] bg-white dark:bg-neutral-900 overflow-x-auto py-2">
        <div
          className="relative mx-auto"
          style={{ width: STAGE_W, height: STAGE_H }}
          data-testid="staff-reference-grid"
        >
          <svg
            viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
            width={STAGE_W}
            height={STAGE_H}
            className="absolute inset-0"
            aria-hidden
          >
            {/* Ledger brackets, one per group, each spanning its own
                ledger lines rather than a written height. */}
            {[
              { rows: ledgersAbove, label: 'LEDGER ABOVE', testid: 'ledger-bracket-above' },
              { rows: ledgersBelow, label: 'LEDGER BELOW', testid: 'ledger-bracket-below' },
            ].map(group => {
              if (group.rows.length === 0) return null;
              const ys = group.rows.map(yOf);
              const top = Math.min(...ys) - BRACKET_PAD;
              const bottom = Math.max(...ys) + BRACKET_PAD;
              const mid = (top + bottom) / 2;
              return (
                <g key={group.label} data-testid={group.testid}>
                  <path
                    d={`M${BRACKET_X} ${top} H${BRACKET_BACK_X} V${bottom} H${BRACKET_X}`}
                    fill="none"
                    strokeWidth={1}
                    className="stroke-current text-neutral-300 dark:text-neutral-600"
                  />
                  <text
                    x={ZONE_LABEL_X}
                    y={mid}
                    transform={`rotate(-90 ${ZONE_LABEL_X} ${mid})`}
                    textAnchor="middle"
                    className="fill-current text-neutral-400 text-[8px] font-semibold tracking-[0.14em]"
                  >
                    {group.label}
                  </text>
                </g>
              );
            })}

            {/* Clef names down the left, each centred on its own staff's
                middle line. */}
            {[
              { label: 'TREBLE', mid: yOf(trebleLines[2]) },
              { label: 'BASS', mid: yOf(bassLines[2]) },
            ].map(clef => (
              <text
                key={clef.label}
                x={CLEF_LABEL_X}
                y={clef.mid}
                transform={`rotate(-90 ${CLEF_LABEL_X} ${clef.mid})`}
                textAnchor="middle"
                data-testid="clef-label"
                className="fill-current text-neutral-500 text-[9.5px] font-bold tracking-[0.2em]"
              >
                {clef.label}
              </text>
            ))}

            {/* The ten staff lines. */}
            {staffLines.map(pos => (
              <line
                key={pos.id}
                data-testid="staff-line"
                data-note={pos.id}
                x1={STAFF_X1}
                y1={yOf(pos)}
                x2={STAFF_X2}
                y2={yOf(pos)}
                strokeWidth={1.4}
                className="stroke-current text-neutral-700 dark:text-neutral-300"
              />
            ))}

            {/* Barlines and the brace that joins the two staves. */}
            <line
              x1={STAFF_X1} y1={trebleTop} x2={STAFF_X1} y2={trebleBottom}
              strokeWidth={2}
              className="stroke-current text-neutral-700 dark:text-neutral-300"
            />
            <line
              x1={STAFF_X1} y1={bassTop} x2={STAFF_X1} y2={bassBottom}
              strokeWidth={2}
              className="stroke-current text-neutral-700 dark:text-neutral-300"
            />
            <path
              data-testid="staff-brace"
              d={`M${BRACE_X} ${trebleTop} q-11 ${(bassBottom - trebleTop) / 4} 0 ${(bassBottom - trebleTop) / 2} q11 ${(bassBottom - trebleTop) / 4} 0 ${(bassBottom - trebleTop) / 2}`}
              fill="none"
              strokeWidth={2.2}
              strokeLinecap="round"
              className="stroke-current text-neutral-700 dark:text-neutral-300"
            />

            {/* Ledger lines, dotted and the FULL width — a ledger drawn
                only under a notehead leaves the space note above it
                looking like it floats. Middle C takes the shared-note
                colour; the rest are ledger amber. */}
            {ledgerLines.map(pos => (
              <line
                key={pos.id}
                data-testid="staff-line"
                data-note={pos.id}
                data-ledger="true"
                x1={STAFF_X1}
                y1={yOf(pos)}
                x2={STAFF_X2}
                y2={yOf(pos)}
                strokeWidth={pos.isMiddleC ? 1.6 : 1.4}
                strokeDasharray={pos.isMiddleC ? '4 4' : '3 4'}
                className={`stroke-current ${pos.isMiddleC ? 'text-fluent' : 'text-developing'}`}
              />
            ))}

            {/* The join between the staves, marked on middle C's own
                column: the one note both clefs share. */}
            <line
              x1={(SPACES_X + LINES_X) / 2}
              y1={trebleBottom}
              x2={(SPACES_X + LINES_X) / 2}
              y2={bassTop}
              strokeWidth={1}
              strokeDasharray="2 3"
              opacity={0.45}
              className="stroke-current text-fluent"
            />
          </svg>

          {/* Column headers. The split is the layout, so it is named. */}
          {[
            { label: 'SPACES', x: SPACES_X + 9 },
            { label: 'LINES', x: LINES_X + 9 },
          ].map(head => (
            <div
              key={head.label}
              data-testid="column-header"
              className="absolute text-[8px] font-bold tracking-[0.16em] text-neutral-400"
              style={{ top: HEADER_Y, left: head.x }}
            >
              {head.label}
            </div>
          ))}

          {ladder.map(pos => (
            <Row
              key={pos.id}
              pos={pos}
              top={yOf(pos) - ROW_H / 2}
              left={pos.kind === 'space' ? SPACES_X : LINES_X}
              showOctave={showOctaves}
              highlighted={pos.id === highlight}
              mnemonic={mnemonics[pos.id] ?? ''}
              editable={editable}
              onCommit={value => set(pos.id, value)}
            />
          ))}
        </div>
      </div>

      {/* The legend, beneath the card. Three facts the colours carry. */}
      <div className="flex gap-5 flex-wrap mt-4 text-xs text-neutral-500" data-testid="staff-legend">
        {[
          { swatch: 'bg-neutral-700 dark:bg-neutral-300', text: 'staff line' },
          { swatch: 'bg-developing', text: 'ledger — no mnemonic yet, write your own' },
          { swatch: 'bg-fluent', text: 'middle C, shared by both clefs' },
        ].map(item => (
          <span key={item.text} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`inline-block w-4 h-0.5 ${item.swatch}`} />
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  pos: StaffPosition;
  top: number;
  left: number;
  showOctave: boolean;
  highlighted: boolean;
  mnemonic: string;
  editable: boolean;
  onCommit: (value: string) => void;
}

function Row({
  pos, top, left, showOctave, highlighted, mnemonic, editable, onCommit,
}: RowProps) {
  const isLine = pos.kind === 'line';

  const letterTone = pos.isMiddleC
    ? 'text-fluent font-bold'
    : pos.isLedgerLine || pos.region.startsWith('ledger')
      ? 'text-developing'
      : isLine
        ? 'text-neutral-800 dark:text-neutral-100 font-semibold'
        : 'text-neutral-500 dark:text-neutral-400';

  return (
    <div
      data-testid="staff-row"
      data-note={pos.id}
      data-kind={pos.kind}
      data-region={pos.region}
      data-ledger={pos.isLedgerLine ? 'true' : 'false'}
      data-middle-c={pos.isMiddleC ? 'true' : 'false'}
      data-highlighted={highlighted ? 'true' : 'false'}
      className={`absolute flex items-center gap-[9px] px-[9px] ${
        // AN OPAQUE BREAK ON LINE ROWS. The staff line runs the full
        // width behind them, and without this it struck the text
        // through. Space rows need none: nothing is drawn where they
        // sit.
        isLine ? 'bg-white dark:bg-neutral-900 rounded-[5px]' : ''
      } ${highlighted ? 'ring-2 ring-fluent rounded-[5px]' : ''}`}
      style={{ top, left, height: ROW_H }}
    >
      <span
        data-testid="staff-note"
        className={`inline-block min-w-[22px] text-[13px] leading-none ${letterTone}`}
      >
        {pos.letter}
        {showOctave && (
          <span data-testid="staff-octave" className="text-[10px] font-normal opacity-60 ml-px">
            {pos.octave}
          </span>
        )}
      </span>

      {pos.spellsFace ? (
        // NOTHING IN THIS COLUMN, and nothing said about it either. The
        // four spaces are their own mnemonic; a prompt here would ask
        // for a mnemonic for the mnemonic, and a tag beside them would
        // spend a line of the drawing saying what they already spell.
        <span className="min-w-[128px]" />
      ) : (
        <Mnemonic
          value={mnemonic}
          noteId={pos.id}
          ledger={pos.isLedgerLine || pos.region.startsWith('ledger')}
          editable={editable}
          onCommit={onCommit}
        />
      )}
    </div>
  );
}

/**
 * A position's words.
 *
 * ALWAYS LIVE WHERE IT IS EDITABLE — no button to press first. The page
 * exists to have these written, and a field that has to be revealed
 * before it can be typed in adds a step to the only thing the page is
 * for. Empty says "add your own" rather than showing a `+`: the words
 * are the instruction.
 */
function Mnemonic({
  value, noteId, ledger, editable, onCommit,
}: {
  value: string;
  noteId: string;
  ledger: boolean;
  editable: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  if (!editable) {
    if (value === '') return null;
    return (
      <span data-testid="staff-mnemonic" data-note={noteId} className="text-[12.5px] text-neutral-600 dark:text-neutral-300">
        {value}
      </span>
    );
  }

  return (
    <input
      value={editing ? draft : value}
      onFocus={() => { setDraft(value); setEditing(true); }}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); onCommit(draft.trim()); }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setDraft(value); setEditing(false); }
      }}
      placeholder={ledger ? 'add your own' : 'mnemonic'}
      aria-label={`mnemonic for ${noteId}`}
      data-testid="staff-mnemonic"
      data-note={noteId}
      className={`min-w-[128px] w-[128px] bg-transparent text-[12.5px] text-neutral-600 dark:text-neutral-300 px-1 py-px outline-none border-b border-dashed placeholder:italic placeholder:text-neutral-300 focus:border-fluent ${
        ledger ? 'border-developing/50' : 'border-neutral-300 dark:border-neutral-600'
      }`}
    />
  );
}
