import type { ReactNode } from 'react';
import { feelLabel, type Feel } from '../../../lib/fluencyScale';
import { STAGE_LABEL } from '../stage';
import { TIER_LABEL } from '../../../lib/tier';
import type { AccuracyBand } from '../../../lib/spacing/bands';

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
 * THE TWO TESTS SHARE THIS SCREEN AND DIFFER IN TWO PLACES.
 *
 * A section test and a whole-song test are the same act at two scales,
 * so a second implementation of this would be two screens drifting
 * apart. What actually differs is named on `Props` and nowhere else:
 *
 *   what set it   SECTION ONLY. A whole-song test always lands on
 *                 Comfortable, so a line explaining which height was
 *                 chosen would explain a choice nobody made.
 *   what's next   WHOLE SONG ONLY. Cross-key needs other keys, so it
 *                 is not a thing one section can be invited toward.
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
 * NOT SHIPPED, AND DELIBERATELY: the session time. Spec §4 asks the
 * result screen to show it, and the copy file has no words for it. A
 * number with a label I invented would be worse than the omission,
 * which is visible and fixable. Flagged rather than filled in.
 * =====================================================================
 */

/** The song ladder's rung, for a whole-song pass. */
export type SongStatus = 'comfortable';

interface Props {
  /**
   * WHAT WAS EARNED, and its two shapes.
   *
   * A discriminated union rather than "songTitle plus optional
   * sectionLabel", because the two are not a general case and a
   * special one — they earn different things on different ladders, and
   * an object that could carry both would let a caller build a result
   * screen for a test that does not exist.
   */
  earned:
    | {
        kind: 'whole-song';
        songTitle: string;
        /** Fixed at Comfortable. There is no higher rung one key's
         *  test can reach, because Cross-key needs other keys. */
        status: SongStatus;
      }
    | {
        kind: 'section';
        sectionLabel: string;
        /** The band the three winning runs landed on. Fluent or
         *  Mastered — every run in a passing streak is Clean or
         *  better, so nothing lower is reachable through a pass. */
        band: AccuracyBand;
        /** The lowest of the three winning runs, which is what chose
         *  the band. Named on screen because a height arrived at
         *  without a reason reads as arbitrary. */
        lowestFeel: Feel;
      };
  /** The key, already spelled for this song. Spelling is the caller's
   *  — this screen has no opinion about sharps and flats. */
  keyName: string;
  /**
   * The matrix row as it reads NOW, drawn by whoever owns the grid.
   *
   * A ReactNode rather than data, because the row is `KeyRow` and
   * there must not be a second thing that draws a matrix row. The
   * caller has the sections, cells and bands; this screen has the
   * caption and the frame.
   */
  preview: ReactNode;
  /** The single exit. */
  onClose: () => void;
}

export default function TestPassedScreen({
  earned, keyName, preview, onClose,
}: Props) {
  const statusWord = earned.kind === 'whole-song'
    ? STAGE_LABEL[earned.status]
    : bandWord(earned.band);

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
        {earned.kind === 'whole-song' ? (
          <>
            <b>{earned.songTitle}</b> is now at <b>{statusWord}</b> status in
            the key of <b>{keyName}</b>.
          </>
        ) : (
          <>
            <b>{earned.sectionLabel}</b> is now at <b>{statusWord}</b> status in
            the key of <b>{keyName}</b>.
          </>
        )}
      </p>

      {/* WHAT SET IT — SECTION ONLY. See the header. */}
      {earned.kind === 'section' && (
        <p className="text-xs text-center text-neutral-500 dark:text-neutral-400">
          Three in a row. Your lowest was <b>{feelLabel(earned.lowestFeel)}</b>,
          so it lands on <b>{statusWord}</b>.
        </p>
      )}

      {/* THE BADGE, SO CLOSING IS NOT A LEAP OF FAITH. The row is the
          real one; only the caption belongs to this screen. */}
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 text-center">
          What the matrix says now
        </div>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-x-auto">
          {preview}
        </div>
      </div>

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
