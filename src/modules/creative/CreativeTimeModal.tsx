import { useEffect, useRef, useState } from 'react';
import { db, type CreativeSession } from '../../lib/db';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toaster';
import {
  MIN_CREATIVE_SECONDS,
  gatherPrompts,
  uid,
  type CreativeMode,
  type CreativePrompt,
} from './engine';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional starting mode. Omit to start at the mode picker. */
  initialMode?: CreativeMode;
  /** Optional pre-composed initial prompt — used when launching from
   *  the Dashboard's creative card. */
  initialPrompt?: CreativePrompt;
}

export default function CreativeTimeModal(props: Props) {
  // Mount fresh each time `open` flips to true so internal state
  // starts clean without needing a reset effect. Unmounts on close.
  if (!props.open) return null;
  return <CreativeTimeModalImpl {...props} />;
}

type Phase =
  | 'mode-select'
  | 'prompt-picker'
  | 'session'
  | 'summary';

const DEFAULT_TARGET_SECONDS = 10 * 60; // 10 min — creative sessions want longer than drills
const MIN_TARGET_SECONDS = 60;           // 1 min floor
const MAX_TARGET_SECONDS = 60 * 60;      // 60 min ceiling
const TARGET_PRESETS = [5, 10, 15, 20, 30, 45];

/**
 * Creative-time logging flow.
 *
 *   mode-select → prompt-picker → session (countdown) → summary (save)
 *
 * Session phase uses a countdown timer: user sets target, clicks
 * Start, timer counts down. At 0 a gentle chime plays and a banner
 * asks whether to extend (+5 / +10 / complete). Elapsed time is
 * tracked independently of target so extensions accumulate correctly.
 */
function CreativeTimeModalImpl({
  onClose,
  initialMode,
  initialPrompt,
}: Props) {
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>(
    initialMode ? (initialPrompt ? 'session' : 'prompt-picker') : 'mode-select',
  );
  const [mode, setMode] = useState<CreativeMode | null>(initialMode ?? null);
  const [prompts, setPrompts] = useState<CreativePrompt[]>(
    initialPrompt ? [initialPrompt] : [],
  );
  const [promptIndex, setPromptIndex] = useState(0);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<CreativePrompt | null>(initialPrompt ?? null);
  const [notes, setNotes] = useState('');

  // Timer state. `elapsed` is the source of truth for actual time
  // played (monotonic, survives pauses). `targetSeconds` is what the
  // user aimed for — changes when they extend at time's up.
  const [targetSeconds, setTargetSeconds] = useState(DEFAULT_TARGET_SECONDS);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  // Tracks whether we've played the time-up chime for the current
  // target. Cleared when the user extends so the next deadline also
  // chimes.
  const [chimePlayed, setChimePlayed] = useState(false);
  // Epoch timestamp of when the timer was most recently started.
  // Combined with `elapsedAtStart` lets ticks compute elapsed without
  // accumulating drift across pause/resume.
  const startRef = useRef<number | null>(null);
  const elapsedAtStartRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  // Clear interval on unmount.
  useEffect(() => {
    return () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
    };
  }, []);

  const remaining = Math.max(0, targetSeconds - elapsed);
  const timeUp = running && targetSeconds > 0 && elapsed >= targetSeconds;

  const pickMode = async (m: CreativeMode) => {
    setMode(m);
    setLoadingPrompts(true);
    try {
      const ps = await gatherPrompts(m, 5);
      setPrompts(ps);
      setPromptIndex(0);
    } finally {
      setLoadingPrompts(false);
    }
    setPhase('prompt-picker');
  };

  const skipPrompts = () => {
    setSelectedPrompt(null);
    setPhase('session');
  };

  const acceptPrompt = () => {
    setSelectedPrompt(prompts[promptIndex] ?? null);
    setPhase('session');
  };

  const nextPrompt = () => {
    setPromptIndex(i => (i + 1) % Math.max(prompts.length, 1));
  };

  const startTimer = () => {
    setRunning(true);
    elapsedAtStartRef.current = elapsed;
    startRef.current = Date.now();
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      if (startRef.current === null) return;
      const deltaSec = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsed(elapsedAtStartRef.current + deltaSec);
    }, 500);
  };

  const pauseTimer = () => {
    setRunning(false);
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    startRef.current = null;
  };

  // Gentle chime + pause when the countdown reaches 0. The user can
  // then extend or complete; running resumes on extend. Lives below
  // the function declarations so it can reference pauseTimer.
  useEffect(() => {
    if (!timeUp || chimePlayed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChimePlayed(true);
    pauseTimer();
    void playEndChime();
  }, [timeUp, chimePlayed]);

  const resetTimer = () => {
    pauseTimer();
    setElapsed(0);
    setChimePlayed(false);
  };

  const extendBy = (minutes: number) => {
    setTargetSeconds(prev => Math.min(MAX_TARGET_SECONDS * 2, prev + minutes * 60));
    setChimePlayed(false);
    startTimer();
  };

  const completeSession = () => {
    pauseTimer();
    setPhase('summary');
  };

  const saveSession = async () => {
    if (!mode) return;
    const row: CreativeSession = {
      id: uid('creative'),
      timestamp: Date.now(),
      mode,
      durationSeconds: elapsed,
      prompt: selectedPrompt?.text,
      promptKind: selectedPrompt?.kind,
      notes: notes.trim() || undefined,
      quickExploration: elapsed < MIN_CREATIVE_SECONDS,
    };
    await db.creativeSessions.add(row);
    toast({
      message: row.quickExploration
        ? `Logged ${formatDuration(elapsed)} of ${modeLabel(mode)} (quick exploration).`
        : `Logged ${formatDuration(elapsed)} of ${modeLabel(mode)}.`,
      variant: 'success',
    });
    onClose();
  };

  const cancelWithoutLogging = () => {
    pauseTimer();
    onClose();
  };

  // --- Render --------------------------------------------------------

  return (
    <Modal
      open
      onClose={phase === 'session' && running ? () => { /* block close while timing */ } : onClose}
      title={titleFor(phase, mode)}
      description={descriptionFor(phase, mode)}
      footer={footerFor(phase)}
    >
      {phase === 'mode-select' && <ModeSelect onPick={pickMode} />}

      {phase === 'prompt-picker' && (
        <PromptPicker
          loading={loadingPrompts}
          prompts={prompts}
          index={promptIndex}
          onNext={nextPrompt}
          onSkipAll={skipPrompts}
          onRefresh={async () => {
            if (!mode) return;
            setLoadingPrompts(true);
            try {
              const ps = await gatherPrompts(mode, 5);
              setPrompts(ps);
              setPromptIndex(0);
            } finally {
              setLoadingPrompts(false);
            }
          }}
        />
      )}

      {phase === 'session' && (
        <SessionTimer
          prompt={selectedPrompt}
          targetSeconds={targetSeconds}
          onTargetChange={next => {
            if (running || elapsed > 0) return; // only editable before start
            const clamped = Math.max(MIN_TARGET_SECONDS, Math.min(MAX_TARGET_SECONDS, next));
            setTargetSeconds(clamped);
          }}
          targetLocked={running || elapsed > 0}
          elapsed={elapsed}
          remaining={remaining}
          running={running}
          timeUp={timeUp || (elapsed >= targetSeconds && targetSeconds > 0 && elapsed > 0)}
          onStart={startTimer}
          onPause={pauseTimer}
          onReset={resetTimer}
          onExtend={extendBy}
          onComplete={completeSession}
          notes={notes}
          onNotesChange={setNotes}
        />
      )}

      {phase === 'summary' && (
        <SessionSummary
          mode={mode!}
          elapsed={elapsed}
          targetSeconds={targetSeconds}
          prompt={selectedPrompt}
          notes={notes}
          onNotesChange={setNotes}
        />
      )}
    </Modal>
  );

  // ----- Inline footers ---------------------------------------------
  function footerFor(p: Phase) {
    if (p === 'mode-select') {
      return (
        <div className="flex items-center justify-end">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm">
            cancel
          </button>
        </div>
      );
    }
    if (p === 'prompt-picker') {
      return (
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setPhase('mode-select')}
            className="text-xs text-neutral-500 hover:text-fluent"
          >
            ← change mode
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={skipPrompts}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
            >
              just give me time to play — no prompt
            </button>
            <button
              onClick={acceptPrompt}
              disabled={prompts.length === 0}
              className={`px-4 py-1.5 rounded-md text-sm font-medium text-white ${
                prompts.length === 0
                  ? 'bg-neutral-300 dark:bg-neutral-700'
                  : 'bg-fluent hover:opacity-90'
              }`}
            >
              use this prompt
            </button>
          </div>
        </div>
      );
    }
    if (p === 'session') {
      return (
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={cancelWithoutLogging}
            className="text-xs text-neutral-500 hover:text-needswork"
          >
            cancel — don't log
          </button>
          <button
            onClick={completeSession}
            disabled={elapsed === 0}
            className={`px-4 py-1.5 rounded-md text-sm font-medium ${
              elapsed === 0
                ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400'
                : 'bg-fluent text-white hover:opacity-90'
            }`}
          >
            complete early
          </button>
        </div>
      );
    }
    // summary
    return (
      <div className="flex items-center justify-end gap-2">
        <button onClick={cancelWithoutLogging} className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm">
          don't log
        </button>
        <button
          onClick={saveSession}
          className="px-4 py-1.5 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
        >
          save session
        </button>
      </div>
    );
  }
}

// -------------------------------------------------------------------
// Mode selection
// -------------------------------------------------------------------

function ModeSelect({ onPick }: { onPick: (m: CreativeMode) => void }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
        Creative time matters as much as drills. Pick a mode and we'll suggest a starting point — or skip the prompt and just play.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ModeCard
          title="Just Play"
          emoji="🎹"
          description="Freeform keyboard exploration, improvisation, figuring out ideas at the piano."
          onClick={() => onPick('play')}
        />
        <ModeCard
          title="Just Produce"
          emoji="🎛️"
          description="Beat-making, recording, arranging, sound design in your DAW."
          onClick={() => onPick('produce')}
        />
      </div>
    </div>
  );
}

function ModeCard({
  title,
  emoji,
  description,
  onClick,
}: {
  title: string;
  emoji: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-card border border-neutral-200 dark:border-neutral-800 p-5 hover:border-fluent hover:bg-fluent/5 transition-colors"
    >
      <div className="text-2xl mb-2">{emoji}</div>
      <div className="text-base font-medium mb-1 group-hover:text-fluent transition-colors">
        {title}
      </div>
      <div className="text-xs text-neutral-500 leading-snug">
        {description}
      </div>
    </button>
  );
}

// -------------------------------------------------------------------
// Prompt picker
// -------------------------------------------------------------------

interface PromptPickerProps {
  loading: boolean;
  prompts: CreativePrompt[];
  index: number;
  onNext: () => void;
  onSkipAll: () => void;
  onRefresh: () => void;
}

function PromptPicker({
  loading,
  prompts,
  index,
  onNext,
  onSkipAll,
  onRefresh,
}: PromptPickerProps) {
  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-neutral-500">
        drafting prompts from your recent practice…
      </div>
    );
  }
  if (prompts.length === 0) {
    return (
      <div className="space-y-3 text-sm text-neutral-600">
        <p>No data yet to draft a personal prompt. That's OK — just play.</p>
        <button
          onClick={onSkipAll}
          className="px-4 py-1.5 rounded-md bg-fluent text-white text-sm"
        >
          start session without a prompt
        </button>
      </div>
    );
  }
  const p = prompts[index];
  return (
    <div className="space-y-4">
      <div className="rounded-card border border-fluent/30 bg-fluent/5 p-5 space-y-3">
        <div className="text-[10px] uppercase tracking-wide text-fluent font-medium">
          prompt {index + 1} of {prompts.length}
        </div>
        <p className="text-base leading-relaxed text-neutral-800 dark:text-neutral-100">
          {p.text}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onNext}
          className="text-xs text-fluent hover:underline"
        >
          ↻ next prompt
        </button>
        <button
          onClick={onRefresh}
          className="text-xs text-neutral-500 hover:text-fluent"
          title="re-draft the whole list"
        >
          re-draft all
        </button>
      </div>
      <p className="text-xs text-neutral-500 italic">
        Use it as a starting point, not a rule. The goal is to play — the prompt is just the match.
      </p>
    </div>
  );
}

// -------------------------------------------------------------------
// Session timer (countdown)
// -------------------------------------------------------------------

interface SessionTimerProps {
  prompt: CreativePrompt | null;
  targetSeconds: number;
  onTargetChange: (seconds: number) => void;
  targetLocked: boolean;
  elapsed: number;
  remaining: number;
  running: boolean;
  timeUp: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onExtend: (minutes: number) => void;
  onComplete: () => void;
  notes: string;
  onNotesChange: (s: string) => void;
}

function SessionTimer({
  prompt,
  targetSeconds,
  onTargetChange,
  targetLocked,
  elapsed,
  remaining,
  running,
  timeUp,
  onStart,
  onPause,
  onReset,
  onExtend,
  onComplete,
  notes,
  onNotesChange,
}: SessionTimerProps) {
  const displayClock = timeUp ? 0 : remaining;
  return (
    <div className="space-y-4 text-sm">
      {prompt && (
        <div className="rounded-card border border-fluent/30 bg-fluent/5 p-4">
          <div className="text-[10px] uppercase tracking-wide text-fluent font-medium mb-1">
            your prompt
          </div>
          <p className="text-sm leading-relaxed">{prompt.text}</p>
        </div>
      )}
      {!prompt && (
        <div className="rounded-card border border-neutral-200 dark:border-neutral-800 p-4 text-xs text-neutral-500 italic">
          No prompt — just play.
        </div>
      )}

      {/* Target-time editor — only editable before Start */}
      <div className={`rounded-md border p-3 space-y-2 ${
        targetLocked
          ? 'border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-900/40'
          : 'border-neutral-200 dark:border-neutral-800'
      }`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500">target time</span>
          <span className="font-mono tabular-nums text-sm">{formatClock(targetSeconds)}</span>
        </div>
        {!targetLocked ? (
          <>
            <input
              type="range"
              min={MIN_TARGET_SECONDS}
              max={45 * 60}
              step={60}
              value={targetSeconds}
              onChange={e => onTargetChange(Number(e.target.value))}
              className="w-full accent-fluent"
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {TARGET_PRESETS.map(m => (
                <button
                  key={m}
                  onClick={() => onTargetChange(m * 60)}
                  className={`px-2 py-0.5 rounded border text-xs ${
                    targetSeconds === m * 60
                      ? 'bg-fluent text-white border-fluent'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-neutral-500 italic">
            target locked in while the session runs — reset to change.
          </p>
        )}
      </div>

      <div className={`rounded-card border p-6 flex flex-col items-center gap-3 ${
        timeUp
          ? 'border-fluent/40 bg-fluent/5'
          : 'border-neutral-200 dark:border-neutral-800'
      }`}>
        <div className={`font-mono tabular-nums text-5xl sm:text-6xl ${
          running ? 'text-fluent' : timeUp ? 'text-fluent' : 'text-neutral-700 dark:text-neutral-200'
        }`}>
          {formatClock(displayClock)}
        </div>

        {!timeUp ? (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {!running ? (
              <button
                onClick={onStart}
                className="px-5 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
              >
                {elapsed === 0 ? 'start' : 'resume'}
              </button>
            ) : (
              <button
                onClick={onPause}
                className="px-5 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
              >
                pause
              </button>
            )}
            {elapsed > 0 && !running && (
              <button
                onClick={onReset}
                className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-500 hover:border-fluent hover:text-fluent"
              >
                reset
              </button>
            )}
          </div>
        ) : (
          <div className="w-full max-w-sm text-center space-y-3">
            <p className="text-sm text-neutral-700 dark:text-neutral-200">
              Time's up. Keep going or wrap up?
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={() => onExtend(5)}
                className="px-3 py-1.5 rounded-md border border-fluent text-fluent text-xs font-medium hover:bg-fluent/10"
              >
                +5 minutes
              </button>
              <button
                onClick={() => onExtend(10)}
                className="px-3 py-1.5 rounded-md border border-fluent text-fluent text-xs font-medium hover:bg-fluent/10"
              >
                +10 minutes
              </button>
              <button
                onClick={onComplete}
                className="px-4 py-1.5 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90"
              >
                complete session
              </button>
            </div>
          </div>
        )}

        <div className="text-[11px] text-neutral-500 flex items-center gap-3">
          <span>played: <span className="font-mono tabular-nums">{formatDuration(elapsed)}</span></span>
          {elapsed > 0 && elapsed < MIN_CREATIVE_SECONDS && (
            <span className="italic">under 2 min → quick exploration</span>
          )}
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-neutral-500">quick notes (optional)</span>
        <textarea
          rows={2}
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder="what came out of this? a phrase, a feel, a chord to revisit?"
          className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
        />
      </label>
    </div>
  );
}

// -------------------------------------------------------------------
// Summary
// -------------------------------------------------------------------

function SessionSummary({
  mode,
  elapsed,
  targetSeconds,
  prompt,
  notes,
  onNotesChange,
}: {
  mode: CreativeMode;
  elapsed: number;
  targetSeconds: number;
  prompt: CreativePrompt | null;
  notes: string;
  onNotesChange: (s: string) => void;
}) {
  const quick = elapsed < MIN_CREATIVE_SECONDS;
  const hitTarget = elapsed >= targetSeconds;
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-card border border-neutral-200 dark:border-neutral-800 p-4 text-center">
        <div className="text-[11px] uppercase tracking-wide text-neutral-500">
          {modeLabel(mode)} session
        </div>
        <div className="font-mono tabular-nums text-3xl my-1">{formatDuration(elapsed)}</div>
        <div className="text-[11px] text-neutral-500">
          target: <span className="font-mono tabular-nums">{formatDuration(targetSeconds)}</span>
          {hitTarget && !quick && <span className="text-fluent ml-2">· completed</span>}
        </div>
        {quick && (
          <div className="text-[11px] text-developing italic mt-1">
            flagged as a quick exploration
          </div>
        )}
      </div>

      {prompt && (
        <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 text-xs text-neutral-600 dark:text-neutral-300">
          <div className="uppercase tracking-wide text-[10px] text-neutral-500 mb-1">prompt</div>
          {prompt.text}
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-neutral-500">session notes</span>
        <textarea
          rows={3}
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder="anything worth remembering from this session?"
          className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
        />
      </label>
    </div>
  );
}

// -------------------------------------------------------------------
// Header helpers
// -------------------------------------------------------------------

function titleFor(phase: Phase, mode: CreativeMode | null): string {
  switch (phase) {
    case 'mode-select':  return 'creative time';
    case 'prompt-picker':return mode === 'produce' ? 'just produce — pick a prompt' : 'just play — pick a prompt';
    case 'session':      return mode === 'produce' ? 'producing' : 'playing';
    case 'summary':      return 'session complete';
  }
}

function descriptionFor(phase: Phase, mode: CreativeMode | null): string | undefined {
  if (phase === 'mode-select') return 'what are you up to?';
  if (phase === 'prompt-picker') {
    return mode === 'produce'
      ? 'drafted from your recent song work + genre preferences'
      : 'drafted from your recent practice + association notes';
  }
  return undefined;
}

// -------------------------------------------------------------------
// Formatting
// -------------------------------------------------------------------

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

function modeLabel(m: CreativeMode): string {
  return m === 'play' ? 'Just Play' : 'Just Produce';
}

// -------------------------------------------------------------------
// End-of-session chime
// -------------------------------------------------------------------

// Gentle two-note bell chime. Uses the shared Web Audio context
// (kept running by the existing audio module). Intentionally softer
// than the drill module's end cue — creative sessions want a nudge,
// not an alarm.
async function playEndChime(): Promise<void> {
  try {
    const { ensureRunning } = await import('../../lib/audio');
    const ctx = await ensureRunning();
    const t0 = ctx.currentTime + 0.02;
    // Two notes a perfect fifth apart (A5 → E6), sine, slow fade.
    const notes = [
      { freq: 880.00, delay: 0.00 },
      { freq: 1318.51, delay: 0.28 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0, t0 + n.delay);
      gain.gain.linearRampToValueAtTime(0.14, t0 + n.delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.delay + 0.65);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + n.delay);
      osc.stop(t0 + n.delay + 0.7);
    }
  } catch {
    // Chime failure is non-fatal — the banner still appears.
  }
}
