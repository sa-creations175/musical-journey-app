import { formatClock } from './sessionClock';

/**
 * What a paused session asks when you come back to it.
 *
 * =====================================================================
 * NOTHING CLOSES A PAUSED SESSION BY ITSELF.
 *
 * The minutes are real and were earned. So returning is an explicit
 * choice between three things — pick it up, keep the time and close, or
 * throw it away — and not one of them happens quietly.
 *
 * =====================================================================
 * THE PROMPT CHANGES SHAPE AT TWO HOURS. IT DOES NOT GREY A BUTTON.
 *
 * Resuming after two hours starts a new sitting BY DEFINITION — that is
 * what the rule says a sitting is. So a Resume button sitting there
 * disabled, or worse enabled, would be lying about what it does: it
 * would not resume anything, it would start something new wearing the
 * word "resume".
 *
 * Past two hours the option is therefore ABSENT, and the sentence says
 * why in the same breath as saying the minutes are safe. Two options,
 * both true.
 *
 * RULED OUT: a third option, "Log It And Start A New Session". Logging
 * and then starting one is two taps already available, and a button
 * that is two other buttons is a way for them to disagree.
 *
 * =====================================================================
 * IT NAMES WHICH KIND OF SESSION, like everything else in this flow.
 * "practice session" or "testing session", never the bare word — the
 * two are one tap apart and write different records.
 *
 * WHO HANDS IT A PAUSED SESSION IS NOT SETTLED. The strip's pause is
 * component state; `songTimer`'s `pausedRecord` is a durable record
 * that survives a reload. Which of them owns a session is sequenced
 * after the flip, so this takes what it needs as props and has no
 * opinion about where they came from.
 * =====================================================================
 *
 * Copy: `docs/WHOLE_SONG_TEST_COPY.md`, 29 Aug 2026.
 */

/** After this, resuming would start a new sitting rather than continue
 *  one — so the option is not offered. */
export const RESUME_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface PausedSession {
  kind: 'testing' | 'practice';
  /** When it was paused. */
  pausedAt: number;
  /** Whole seconds banked on the clock. */
  seconds: number;
}

interface Props {
  session: PausedSession;
  /** Now, as a parameter so a caller can pass a render-stable instant
   *  and tests need no fake clock. */
  now: number;
  /** Pick it up. Absent past the window — see the header. */
  onResume: () => void;
  onLogAndClose: () => void;
  onDiscard: () => void;
}

export default function PausedSessionPrompt({
  session, now, onResume, onLogAndClose, onDiscard,
}: Props) {
  const age = Math.max(0, now - session.pausedAt);
  const resumable = age < RESUME_WINDOW_MS;
  const kindWord = session.kind === 'testing' ? 'testing session' : 'practice session';

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          You paused this {kindWord} {resumable ? `${agoText(age)} ago` : `on ${dayName(session.pausedAt)}`}.
        </p>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {formatClock(session.seconds)} on the clock.
        </p>
        {/* WHY THE OPTION IS GONE, said where the option would have
            been. An absent button with no explanation reads as a
            missing feature rather than a rule. */}
        {!resumable && (
          <p className="text-xs leading-snug text-neutral-500 dark:text-neutral-400">
            Too long ago to pick up — anything from here starts a new session.
            The minutes are still yours.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {resumable && (
          <button
            type="button"
            onClick={onResume}
            className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
          >
            Resume This {session.kind === 'testing' ? 'Testing' : 'Practice'} Session
          </button>
        )}
        <button
          type="button"
          onClick={onLogAndClose}
          className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm"
        >
          Log It And Close
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="px-4 py-2 rounded-lg text-sm text-neutral-500 hover:text-needswork"
        >
          Discard It
        </button>
      </div>
    </div>
  );
}

/**
 * How long ago, in the units someone would say out loud.
 *
 * Only ever reached inside the two-hour window, so minutes and hours
 * are the whole vocabulary needed — there is no "3 days ago" branch
 * because that shape of the prompt names the day instead.
 */
function agoText(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'a moment';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function dayName(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { weekday: 'long' });
}
