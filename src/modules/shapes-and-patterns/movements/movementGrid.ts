/**
 * A movement, seen as the lead sheet sees a section.
 *
 * =====================================================================
 * RULING 18: THE MOVEMENT SCREEN RENDERS THE LEAD SHEET'S OWN GRID.
 *
 * Silas: "I don't know why you would make this that different from the
 * lead sheet itself. It can honestly be quite similar."
 *
 * `BarGridView` takes a `Song` and a `SongSection`. A movement is
 * neither, but it already stores a section's own `ChordPlacement[]` —
 * that was commit 2's decision, made for exactly this — so what is
 * needed is a VIEW, not a translation. Six fields out of a movement,
 * nothing computed, nothing invented.
 *
 * A VIEW IS NOT AN ADAPTER. It does not re-implement anything the grid
 * does; it names a movement in the words the grid already speaks. The
 * thing the one-shell rule forbids is a second grid, and this is how
 * there is only one.
 *
 * =====================================================================
 * EVERY OPERATION IS THE LEAD SHEET'S OWN, AND PURE.
 *
 * Add, delete, length, move, swap, reorder, add bar, delete bar all go
 * through `barGrid.ts` — `addChordPlacement`, `removeChordPlacement`,
 * `updateChordPlacement`, `moveChordPlacement`, `swapChordPlacements`,
 * `deleteBarFromPlacements`, `cascadeChordPlacements`, `reorderBar`,
 * `reconcileBarLayout`. Not one of them is written here. What IS here
 * is which of them a movement's gesture calls, and that is the whole
 * file.
 *
 * They return a PATCH rather than writing, so the sequence can be
 * tested without a database and the screen has one place that saves.
 * =====================================================================
 */
import type { ChordFunction, ChordMovement, ChordPlacement, Song, SongSection } from '../../../lib/db';
import { MOVEMENT_ARRANGEMENT_ID } from '../../../lib/db';
import {
  addChordPlacement,
  cascadeChordPlacements,
  deleteBarFromPlacements,
  deriveBarGrid,
  moveChordPlacement,
  parseTimeSignature,
  reconcileBarLayout,
  removeChordPlacement,
  reorderBar,
  slotsPerBar,
  swapChordPlacements,
} from '../../repertoire/barGrid';

/** What the movement screen hands `BarGridView`. */
export interface MovementGridView {
  song: Song;
  section: SongSection;
  arrangementId: string;
  /** Positions a bar offers — the duration ceiling for a chord. */
  barSlots: number;
}

/**
 * A movement has no eighths toggle, so the grid renders one position
 * per beat and a `beats` of 1 is one position. Naming it rather than
 * passing `false` inline, because `eighths` decides both the geometry
 * and the unit and a bare literal says neither.
 */
export const MOVEMENT_EIGHTHS = false;

export function movementGridView(movement: ChordMovement): MovementGridView {
  const { beatsPerBar } = parseTimeSignature(movement.timeSignature);
  return {
    // ENOUGH OF A SONG TO DRAW A GRID, and no more. The grid reads
    // exactly two fields off a song — the key and the eighths toggle —
    // and one of them a movement has. Everything else is filled with
    // what an empty song is, so nothing here can be mistaken for a
    // repertoire row: it is never stored and never leaves this call.
    song: {
      id: `movement:${movement.id}`,
      title: '',
      artist: '',
      key: movement.key,
      timeSignature: movement.timeSignature,
      eighths: MOVEMENT_EIGHTHS,
      learningOrder: 0,
      audioLinks: [],
      addedDate: movement.createdAt,
      updatedAt: movement.updatedAt,
    } as Song,
    section: {
      id: `movement:${movement.id}`,
      songId: `movement:${movement.id}`,
      name: '',
      order: 0,
      lyrics: '',
      timeSignature: movement.timeSignature,
      chordPlacements: movement.placements,
      ...(movement.barLayout ? { barLayout: movement.barLayout } : {}),
    } as SongSection,
    arrangementId: MOVEMENT_ARRANGEMENT_ID,
    barSlots: slotsPerBar(beatsPerBar, MOVEMENT_EIGHTHS),
  };
}

/** How many bars the grid will draw for this movement. */
export function movementBars(movement: ChordMovement): number {
  const { song, section, arrangementId } = movementGridView(movement);
  const { beatsPerBar } = parseTimeSignature(section.timeSignature ?? song.timeSignature);
  return deriveBarGrid(section, arrangementId, beatsPerBar, MOVEMENT_EIGHTHS).length;
}

/** What a gesture changes about a movement. */
export type MovementPatch = Partial<Pick<ChordMovement, 'placements' | 'barLayout'>>;

/**
 * The layout as an array, materialised from what the grid currently
 * draws when the movement has none.
 *
 * The lead sheet does the same thing for the same reason: a movement
 * saved before "+ bar" existed has no layout, and the first bar
 * operation has to write one that agrees with what is on screen rather
 * than one that shortens the grid.
 */
function materialiseLayout(movement: ChordMovement): Array<'chord' | 'empty'> {
  if (movement.barLayout) return [...movement.barLayout];
  const { song, section, arrangementId } = movementGridView(movement);
  const { beatsPerBar } = parseTimeSignature(section.timeSignature ?? song.timeSignature);
  return deriveBarGrid(section, arrangementId, beatsPerBar, MOVEMENT_EIGHTHS)
    .map(b => (b.isEmpty ? 'empty' : 'chord'));
}

/** A patch carrying placements plus whatever the layout has to become. */
function withLayout(
  movement: ChordMovement, placements: ChordPlacement[],
): MovementPatch {
  const layout = reconcileBarLayout(movement.barLayout, placements);
  return layout ? { placements, barLayout: layout } : { placements };
}

export function addChord(
  movement: ChordMovement,
  barIndex: number,
  beatPos: number,
  chord: ChordFunction,
  offbeat?: boolean,
  id: string = crypto.randomUUID(),
): MovementPatch {
  // ONE POSITION LONG, which is the prototype's own step 1: "the chord
  // lands one eighth long". Length is the next gesture, not a guess
  // made at the moment of typing.
  const placement: ChordPlacement = {
    id,
    arrangementId: MOVEMENT_ARRANGEMENT_ID,
    barIndex,
    beatPos,
    beats: 1,
    chord,
    ...(offbeat ? { offbeat: true } : {}),
  };
  return withLayout(movement, addChordPlacement(movement.placements, placement));
}

export function deleteChord(
  movement: ChordMovement, placementId: string,
): MovementPatch {
  return withLayout(movement, removeChordPlacement(movement.placements, placementId));
}

/**
 * Change a chord's length.
 *
 * CLAMPED TO THE BAR, then CASCADED — both the lead sheet's own rules.
 * The clamp is why a chord cannot be made longer than the room a bar
 * offers; the cascade is why lengthening one pushes the chords after it
 * forward instead of hiding them behind it.
 */
export function setChordLength(
  movement: ChordMovement, placementId: string, beats: number,
): MovementPatch {
  const { section, arrangementId, barSlots } = movementGridView(movement);
  const { beatsPerBar } = parseTimeSignature(section.timeSignature);
  const clamped = Math.min(Math.max(1, Math.round(beats)), barSlots);
  const updated = movement.placements.map(
    p => (p.id === placementId ? { ...p, beats: clamped } : p),
  );
  const cascaded = cascadeChordPlacements(
    updated, arrangementId, beatsPerBar, MOVEMENT_EIGHTHS,
  );
  return withLayout(movement, cascaded);
}

export function moveChord(
  movement: ChordMovement, placementId: string, barIndex: number, beatPos: number,
): MovementPatch {
  return withLayout(
    movement, moveChordPlacement(movement.placements, placementId, barIndex, beatPos),
  );
}

export function swapChords(
  movement: ChordMovement, fromId: string, toId: string,
): MovementPatch {
  return withLayout(movement, swapChordPlacements(movement.placements, fromId, toId));
}

export function addBar(movement: ChordMovement): MovementPatch {
  const layout = materialiseLayout(movement);
  layout.push('empty');
  return { barLayout: layout };
}

export function deleteBar(
  movement: ChordMovement, barIndex: number,
): MovementPatch {
  const layout = materialiseLayout(movement);
  if (barIndex < 0 || barIndex >= layout.length) return {};
  layout.splice(barIndex, 1);
  // The chords close up, and without this the placements PIN the bar
  // count and the delete is a silent no-op — the lead sheet's own note.
  const placements = deleteBarFromPlacements(movement.placements, barIndex);
  return { placements, barLayout: layout };
}

export function reorderBars(
  movement: ChordMovement, fromIndex: number, toIndex: number,
): MovementPatch {
  const { section, arrangementId } = movementGridView(movement);
  const { beatsPerBar } = parseTimeSignature(section.timeSignature);
  const result = reorderBar(section, arrangementId, fromIndex, toIndex, beatsPerBar);
  // NULL IS A REAL ANSWER: an index outside the grid, or a move to
  // where it already is. Nothing changes rather than something being
  // written that was not asked for.
  if (result === null) return {};
  return {
    ...(result.chordPlacements ? { placements: result.chordPlacements } : {}),
    barLayout: result.barLayout,
  };
}
