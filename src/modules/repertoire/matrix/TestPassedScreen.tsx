import type { ReactNode } from 'react';
import { feelLabel, type Feel } from '../../../lib/fluencyScale';
import { STAGE_LABEL } from '../stage';
import { TIER_LABEL } from '../../../lib/tier';
import type { AccuracyBand } from '../../../lib/spacing/bands';
import { formatClock } from '../../shapes-and-patterns/practiceTest/sessionClock';

/**
 * What the test says when you pass it.
 *
 * =====================================================================
 * IT TAKES OVER THE VIEW. IT IS NOT A TOAST AND NOT A BANNER.
 *
 * The old flow ended by closing the modal, and you found out what you
 * had earned by navigating back to the matrix and looking. That asks
 * someone to play a song three times through and then declines to say
 * what happened — the one moment in the whole flow that is worth
 * stopping for, spent on a dismissal.
 *
 * So passing ends the test HERE, and this is the last thing between
 * the third clean run and the grid.
 *
 * =====================================================================
 * EVERY TEST SHARES THIS SCREEN. THE APP HAS ONE TEST MODEL, SO IT
 * REPORTS THE RESULT ONE WAY.
 *
 * A chord shape, a section and a whole song are the same act at three
 * scales — three in a row, a bad run costs it — so a second
 * implementation of this would be two screens drifting apart. What
 * actually differs is named on `Props` and nowhere else:
 *
 *   what set it   EVERYWHERE A HEIGHT WAS CHOSEN — a section test and
 *                 a cell test both land on the lowest of their three.
 *                 Absent on a whole-song pass, which always lands on
 *                 Comfortable, so the line would explain a choice
 *                 nobody made.
 *   what's next   WHOLE SONG ONLY. Cross-key needs other keys, so it
 *                 is not a thing one section or one shape can be
 *                 invited toward.
 *   the key       A song and a section are played IN a key. A chord
 *                 shape is not — it is one — so its sentence ends
 *                 where the fact does, and `keyName` is null.
 *
 * Neither is a flag on a shared line. They are separate fields, absent
 * where they do not apply, so a caller cannot half-supply one.
 *
 * =====================================================================
 * EVERY STRING HERE IS APPROVED COPY.
 *
 * `docs/WHOLE_SONG_TEST_COPY.md`, 29 Aug 2026. Do not reword and do not
 * add a sentence — anything that file does not cover is unwritten, and
 * a placeholder promoted to a shipped string is how a screen ends up
 * saying something nobody agreed to.
 *
 * =====================================================================
 * THE TIME IS THE TESTING SESSION'S, NOT THE RUN'S.
 *
 * They are minutes apart — a run is one pass through the song, a
 * session is everything from opening the test to passing it — and the
 * screen appears when the SESSION is over, so the session is what it
 * reports. The two numbers look alike enough that a reader would not
 * catch the wrong one, which is why the test asserts which.
 *
 * And it says "Testing session", never "session". The app names which
 * kind every time; see the addendum's naming rule.
 * =====================================================================
 */

/** The song ladder's rung, for a whole-song pass. */
export type SongStatus = 'comfortable';

/**
 * What a passed test earned, in the shape its own surface has.
 *
 * Exported because the surface builds it: only a chord-shape surface
 * knows how a chord shape reads, and only a song knows it has a key.
 */
export type TestPassEarned =
  | {
      kind: 'whole-song';
      songTitle: string;
      status: SongStatus;
    }
  | {
      kind: 'section';
      sectionLabel: string;
      band: AccuracyBand;
      lowestFeel: Feel;
    }
  | {
      kind: 'cell';
      cellLabel: string;
      band: AccuracyBand;
      lowestFeel: Feel;
    };

interface Props {
  /**
   * WHAT WAS EARNED, and its three shapes.
   *
   * A discriminated union rather than "songTitle plus optional
   * sectionLabel", because the two are not a general case and a
   * special one — they earn different things on different ladders, and
   * an object that could carry both would let a caller build a result
   * screen for a test that does not exist.
   */
  /**
   * WHAT WAS EARNED, and its three shapes.
   *
   * A discriminated union rather than "a label plus optional extras",
   * because the three are not one general case with omissions — they
   * earn different things on different ladders, and an object that
   * could carry all of it would let a caller build a result screen for
   * a test that does not exist.
   *
   * The DIFFERENCES, named here and nowhere else:
   *
   *   what set it   Present on a section and a cell — both land on the
   *                 lowest of their three. Absent on a whole-song
   *                 pass, which always lands on Comfortable, so the
   *                 line would explain a choice nobody made.
   *   what's next   Whole song only. Cross-key needs other keys, so it
   *                 is not a thing one section or one shape can be
   *                 invited toward.
   *   the key       A song and a section are played IN a key. A chord
   *                 shape is not — it is one — so `keyName` is null
   *                 and the sentence ends where the fact does.
   */
  earned: TestPassEarned;
  /**
   * The key, already spelled for this song, or null.
   *
   * NULL FOR A CELL, and that is not an omission to default away. A
   * chord shape is not played in a key — it IS one — so a sentence
   * naming a key would invent a fact.
   */
  keyName: string | null;
  /**
   * How long the TESTING SESSION ran, in whole seconds.
   *
   * The session, not the run that passed it. Required rather than
   * optional: a defaulted 0 would render "00:00, recorded" on a
   * session that took twenty minutes, and read as a fact rather than
   * as a missing prop.
   */
  sessionSeconds: number;
  /**
   * The matrix row as it reads NOW, drawn by whoever owns the grid.
   *
   * A ReactNode rather than data, because the row is `KeyRow` and
   * there must not be a second thing that draws a matrix row. The
   * caller has the sections, cells and bands; this screen has the
   * caption and the frame.
   *
   * NULL WHERE THERE IS NO ROW YET, and then the block — caption and
   * all — is absent rather than an empty frame. Shapes and patterns is
   * adopting the song repertoire's face as separate work; a stand-in
   * drawn here would be a third row to reconcile when that lands, and
   * a caption over nothing would promise one.
   */
  preview: ReactNode | null;
  /** The single exit. */
  onClose: () => void;
}

export default function TestPassedScreen({
  earned, keyName, sessionSeconds, preview, onClose,
}: Props) {
  const statusWord = earned.kind === 'whole-song'
    ? STAGE_LABEL[earned.status]
    : bandWord(earned.band);
  // What set it, where there is a lowest to name. A whole-song test
  // always lands on Comfortable, so it has none.
  const lowest = earned.kind === 'whole-song' ? null : earned.lowestFeel;

  return (
    <div className="space-y-5">
      {/* CONGRATULATE. A mark and a sentence — the mark is what reads
          at a glance from across the room, which is where someone
          finishing a run-through actually is. */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <span
          aria-hidden
          className="flex items-center justify-center w-12 h-12 rounded-full bg-fluent text-white text-2xl"
        >
          ✓
        </span>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          That&rsquo;s the test passed.
        </h2>
      </div>

      {/* WHAT WAS EARNED, AND WHERE. The status word and the key are
          bolded because both are app vocabulary that reads as ordinary
          English otherwise — "comfortable in A" is a sentence about a
          mood, not a claim about a song. */}
      <p className="text-sm text-center text-neutral-700 dark:text-neutral-200">
        {earned.kind === 'cell' ? (
          // NO KEY CLAUSE. A chord shape is not played in a key, so
          // the sentence ends where the fact does.
          <>
            <b>{earned.cellLabel}</b> is now at <b>{statusWord}</b> status.
          </>
        ) : (
          <>
            <b>
              {earned.kind === 'whole-song' ? earned.songTitle : earned.sectionLabel}
            </b>{' '}
            is now at <b>{statusWord}</b> status in the key of <b>{keyName}</b>.
          </>
        )}
      </p>

      {/* WHAT SET IT — wherever there was a choice of height. See the
          header: a whole-song test always lands on Comfortable. */}
      {lowest !== null && (
        <p className="text-xs text-center text-neutral-500 dark:text-neutral-400">
          Three in a row. Your lowest was <b>{feelLabel(lowest)}</b>,
          so it lands on <b>{statusWord}</b>.
        </p>
      )}

      {/* THE TIME, AS RECORDED. Past tense and no verb for the reader
          to act on: the session is already written, and this is the
          receipt rather than a prompt. */}
      <p className="text-xs text-center text-neutral-500 dark:text-neutral-400">
        Testing session time {formatClock(sessionSeconds)}, recorded.
      </p>

      {/* THE BADGE, SO CLOSING IS NOT A LEAP OF FAITH. The row is the
          real one; only the caption belongs to this screen. */}
      {preview !== null && (
      <div className="space-y-1.5">
        {/* THE SAME CAPTION ON EVERY SURFACE, and that is a ruling
            rather than an oversight. Shapes and patterns is adopting
            the song repertoire's face, matrix included; calling the
            same thing two names here would be the app disagreeing with
            itself while that work is in flight. */}
        <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 text-center">
          What the matrix says now
        </div>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-x-auto">
          {preview}
        </div>
      </div>
      )}

      {/* WHAT'S NEXT — WHOLE SONG ONLY, and phrased as an invitation.
          "No rush, the song is yours either way" is the half that
          keeps it from becoming a to-do item bolted onto a
          celebration. */}
      {earned.kind === 'whole-song' && (
        <p className="text-xs leading-snug text-neutral-600 dark:text-neutral-300">
          If you want to take it further, <b>Cross-key</b> is next — this song
          at <b>Comfortable</b> status in a key from each of the other three
          quadrants. No rush, the song is yours in the key of <b>{keyName}</b>{' '}
          either way.
        </p>
      )}

      {/* ONE EXIT. The spec asks for one and means it: a second button
          here would make the user choose between two ways of agreeing. */}
      <button
        type="button"
        onClick={onClose}
        className="w-full px-4 py-2.5 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
      >
        Close And See It
      </button>
    </div>
  );
}

/** The band's own word, from the app's one vocabulary. */
function bandWord(band: AccuracyBand): string {
  switch (band) {
    case 'needs-work': return TIER_LABEL.needsWork;
    case 'developing': return TIER_LABEL.developing;
    case 'fluent': return TIER_LABEL.fluent;
    case 'mastered': return TIER_LABEL.mastered;
  }
}
