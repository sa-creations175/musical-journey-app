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
 *
 * So the drawing takes a `highlight` and nothing else that differs
 * between its homes: the panel highlights the note just answered, the
 * page highlights nothing, and neither knows anything the other does
 * not.
 * =====================================================================
 *
 * EVERY ROW COMES FROM `buildLadder()`. Nothing here knows that middle
 * C is special or that there are three ledgers — it draws whatever the
 * ladder hands it, so extending the range is still one number over
 * there.
 *
 * THE GEOMETRY. One diatonic step is `STEP_PX`, so a line and the space
 * above it are half a staff-space apart and the whole grand staff is
 * one grid. Rows are absolutely positioned from the BOTTOM, because the
 * ladder counts upward from its lowest note and a top-down coordinate
 * would need the length subtracted at every use.
 */
import { useState } from 'react';
import { buildLadder, type StaffPosition } from './staffLadder';
import { useMnemonics } from './mnemonics';

/** Height of one diatonic step — half the distance between two lines. */
const STEP_PX = 13;

/** Breathing room above and below the outermost ledger. */
const PAD_PX = 18;

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
  highlight = null, showOctavesInitially = false, editable = false,
}: StaffReferenceProps) {
  const ladder = buildLadder();
  const { mnemonics, set } = useMnemonics();
  const [showOctaves, setShowOctaves] = useState(showOctavesInitially);
  const [editingId, setEditingId] = useState<string | null>(null);

  const height = (ladder.length - 1) * STEP_PX + PAD_PX * 2;

  return (
    <div data-testid="staff-reference" className="w-full">
      {/* A REAL CONTROL, not a build-time flag — the octave numbers are
          the difference between "the space above the bass staff" and
          "B3", and which one helps changes by the day. */}
      <div className="flex justify-end mb-2">
        <label className="inline-flex items-center gap-1.5 text-xs text-neutral-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showOctaves}
            onChange={e => setShowOctaves(e.target.checked)}
            data-testid="staff-reference-octaves"
            className="accent-fluent"
          />
          <span aria-hidden>8va</span>
          <span className="sr-only">octave numbers</span>
        </label>
      </div>

      <div
        className="relative w-full"
        style={{ height }}
        data-testid="staff-reference-grid"
      >
        {ladder.map(pos => (
          <Row
            key={pos.id}
            pos={pos}
            bottom={PAD_PX + pos.index * STEP_PX}
            showOctave={showOctaves}
            highlighted={pos.id === highlight}
            mnemonic={mnemonics[pos.id] ?? ''}
            editable={editable}
            editing={editingId === pos.id}
            onEdit={() => setEditingId(pos.id)}
            onCommit={value => { set(pos.id, value); setEditingId(null); }}
            onCancel={() => setEditingId(null)}
          />
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  pos: StaffPosition;
  bottom: number;
  showOctave: boolean;
  highlighted: boolean;
  mnemonic: string;
  editable: boolean;
  editing: boolean;
  onEdit: () => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

function Row({
  pos, bottom, showOctave, highlighted, mnemonic,
  editable, editing, onEdit, onCommit, onCancel,
}: RowProps) {
  const isLine = pos.kind === 'line';

  return (
    <div
      data-testid="staff-row"
      data-note={pos.id}
      data-kind={pos.kind}
      data-region={pos.region}
      data-ledger={pos.isLedgerLine ? 'true' : 'false'}
      data-middle-c={pos.isMiddleC ? 'true' : 'false'}
      data-highlighted={highlighted ? 'true' : 'false'}
      className="absolute left-0 right-0 flex items-center"
      // Centred ON the coordinate, so a LINE row sits on its line and a
      // SPACE row sits exactly between the two lines around it — which
      // is what "in the space" means, and it falls out of the geometry
      // rather than being nudged.
      style={{ bottom, transform: 'translateY(50%)', height: STEP_PX * 1.6 }}
    >
      {/* THE LINE ITSELF, full width. Ledger lines are dotted and run
          the whole width too — a ledger drawn only under the notehead
          leaves a space note looking like it floats, when the point is
          that it sits between two ledgers. */}
      {isLine && (
        <span
          aria-hidden
          data-testid="staff-line"
          className={`absolute left-0 right-0 top-1/2 border-t ${
            pos.isLedgerLine
              ? 'border-dashed border-neutral-300 dark:border-neutral-600'
              : 'border-solid border-neutral-400 dark:border-neutral-500'
          }`}
        />
      )}

      {/* The label sits INSIDE the staff rather than out at the edge,
          so a line's name reads against its own line. */}
      <div className="relative flex items-center gap-2 pl-6 pr-3">
        <span
          data-testid="staff-note"
          className={`inline-flex items-center justify-center rounded-full text-[11px] font-mono leading-none w-7 h-5 border ${
            highlighted
              ? 'bg-fluent text-white border-fluent font-semibold'
              : pos.isLedgerLine || pos.region.startsWith('ledger')
                // Ledger notes read as outside the staff proper.
                ? 'bg-white dark:bg-neutral-900 text-neutral-500 border-dashed border-neutral-400'
                : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 border-neutral-300 dark:border-neutral-600'
          }`}
        >
          {pos.letter}{showOctave && <span className="text-[9px] ml-0.5">{pos.octave}</span>}
        </span>

        {pos.isMiddleC && (
          <span
            data-testid="staff-middle-c"
            className="text-[10px] uppercase tracking-wide text-fluent"
          >
            {/* Marked, because it is the one note both staves share. */}
            middle C
          </span>
        )}

        {/* THE FOUR TREBLE SPACES ARE THEIR OWN MNEMONIC. They spell
            F-A-C-E bottom to top, so they say so instead of offering a
            field to write one in. Every other position keeps its. */}
        {pos.spellsFace ? (
          <span
            data-testid="staff-spells-face"
            data-note={pos.id}
            className="text-xs text-neutral-500 font-mono tracking-wide"
          >
            F-A-C-E
          </span>
        ) : (
        <Mnemonic
          value={mnemonic}
          noteId={pos.id}
          editable={editable}
          editing={editing}
          onEdit={onEdit}
          onCommit={onCommit}
          onCancel={onCancel}
        />
        )}
      </div>
    </div>
  );
}

/**
 * A position's words, or the affordance to give it some.
 *
 * AN EMPTY MNEMONIC IS A PROMPT, NOT A BLANK. Every ledger position
 * ships empty — there is no standard mnemonic for one — and a silent
 * gap would read as "this position does not take one" rather than as
 * "yours goes here". The prompt is a `+`, which is a control rather
 * than a sentence.
 */
function Mnemonic({
  value, noteId, editable, editing, onEdit, onCommit, onCancel,
}: {
  value: string;
  noteId: string;
  editable: boolean;
  editing: boolean;
  onEdit: () => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => onCommit(draft.trim())}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setDraft(value); onCancel(); }
        }}
        data-testid="staff-mnemonic-input"
        data-note={noteId}
        className="text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-1.5 py-0.5 w-40"
      />
    );
  }

  if (value === '') {
    if (!editable) return null;
    return (
      <button
        type="button"
        onClick={() => { setDraft(''); onEdit(); }}
        data-testid="staff-mnemonic-add"
        data-note={noteId}
        aria-label={`add a mnemonic for ${noteId}`}
        className="text-xs text-neutral-300 hover:text-fluent leading-none"
      >
        +
      </button>
    );
  }

  const words = (
    <span
      data-testid="staff-mnemonic"
      data-note={noteId}
      className="text-xs text-neutral-500"
    >
      {value}
    </span>
  );

  if (!editable) return words;
  return (
    <button
      type="button"
      onClick={() => { setDraft(value); onEdit(); }}
      aria-label={`edit the mnemonic for ${noteId}`}
      className="text-left hover:text-fluent"
    >
      {words}
    </button>
  );
}
