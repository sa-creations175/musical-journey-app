import { metronome } from '../../../lib/metronome';
import { useMetronomeState } from '../../../lib/useMetronome';

/**
 * Metronome controls inside a logging modal.
 *
 * ---------------------------------------------------------------
 * ONE METRONOME, SEVERAL CONTROL SURFACES.
 *
 * This is not a second metronome. `lib/metronome` is a singleton with
 * a driver stack, already driven from the app header
 * (MetronomeControl), the session banner, and the Shapes & Patterns
 * drill modals. This is a fourth surface onto the same tool.
 *
 * So there is NO local state and NO restore-on-close. Whatever tempo
 * you set here is the app's tempo when you leave, exactly as if you
 * had set it in the header — because you did. A modal that quietly
 * put the BPM back would mean the app had two ideas about what tempo
 * you are working at.
 *
 * `start('user')` / `stop('user')` rather than a bespoke driver name,
 * so a metronome started here nests correctly with one started
 * anywhere else: the stack only actually stops when the last driver
 * pops.
 * ---------------------------------------------------------------
 *
 * The modal asked what tempo you played at and gave you nothing to
 * play against. That was the friction.
 */

interface Props {
  /** The BPM currently in the modal's tempo field, when it parses to
   *  something usable. Null when the field is blank or invalid. */
  fieldBpm: number | null;
}

export default function ModalMetronome({ fieldBpm }: Props) {
  const state = useMetronomeState();

  const startAtFieldTempo = () => {
    // Adopt the field's tempo on start — that is the number you just
    // said you were playing at, so it is the one worth hearing.
    if (fieldBpm !== null && fieldBpm !== state.bpm) {
      metronome.update({ bpm: fieldBpm });
    }
    void metronome.start('user');
  };

  // Deliberately NOT retuned on every keystroke while running: the
  // field is a text input, so live-following it would lurch through
  // 1 → 12 → 120 as you type. Offered as an explicit match instead.
  const outOfSync = fieldBpm !== null && fieldBpm !== state.bpm;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => (state.playing ? metronome.stop('user') : startAtFieldTempo())}
        className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
          state.playing
            ? 'bg-needswork text-white border-needswork'
            : 'border-fluent text-fluent hover:bg-fluent/10'
        }`}
      >
        {state.playing ? '■ stop' : '▶ metronome'}
      </button>
      <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
        ♩ {state.bpm}
      </span>
      {outOfSync && (
        <button
          type="button"
          onClick={() => metronome.update({ bpm: fieldBpm })}
          className="text-[11px] text-fluent hover:underline underline-offset-2"
        >
          match ♩ {fieldBpm}
        </button>
      )}
    </div>
  );
}
