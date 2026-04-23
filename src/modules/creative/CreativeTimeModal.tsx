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

/**
 * Creative-time logging flow.
 *
 *   mode-select → prompt-picker → session (timer) → summary (save)
 *
 * Phase transitions:
 *   - User picks "Just Play" or "Just Produce" → prompt-picker
 *   - User clicks "start with this prompt" or "skip — no prompt" → session
 *   - User clicks "stop" → summary (save / cancel)
 *
 * Session state lives locally; only writes to DB on save. Cancelling
 * before save drops everything — we treat creative time as an
 * intentional act, not an auto-logged one.
 */
function CreativeTimeModalImpl({
  onClose,
  initialMode,
  initialPrompt,
}: Props) {
  const { toast } = useToast();

  // We only render this impl when open=true, so state initialisers
  // use the props directly. Fresh mount per open means no reset
  // effect is needed.
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
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [notes, setNotes] = useState('');
  const startRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  // Guard so the auto-start effect fires at most once per mount.
  const autoStartedRef = useRef(false);

  // Clear interval on unmount.
  useEffect(() => {
    return () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
    };
  }, []);

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
    startRef.current = Date.now() - elapsed * 1000;
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      if (startRef.current === null) return;
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 500);
  };

  // Auto-start the clock when we land on the session phase with a
  // pre-supplied prompt (dashboard launch path). Uses a ref guard so
  // we don't restart after the user pauses. The `setState in effect`
  // lint is intentional here — we're synchronising a real side
  // effect (the interval timer) with phase, which is exactly what
  // effects are for.
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (phase !== 'session') return;
    if (!initialPrompt) return;
    autoStartedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const pauseTimer = () => {
    setRunning(false);
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const stopAndReview = () => {
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
          elapsed={elapsed}
          running={running}
          onStart={startTimer}
          onPause={pauseTimer}
          onStop={stopAndReview}
          notes={notes}
          onNotesChange={setNotes}
        />
      )}

      {phase === 'summary' && (
        <SessionSummary
          mode={mode!}
          elapsed={elapsed}
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
            onClick={stopAndReview}
            disabled={elapsed === 0}
            className={`px-4 py-1.5 rounded-md text-sm font-medium ${
              elapsed === 0
                ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400'
                : 'bg-fluent text-white hover:opacity-90'
            }`}
          >
            complete session
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
// Session timer
// -------------------------------------------------------------------

interface SessionTimerProps {
  prompt: CreativePrompt | null;
  elapsed: number;
  running: boolean;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  notes: string;
  onNotesChange: (s: string) => void;
}

function SessionTimer({
  prompt,
  elapsed,
  running,
  onStart,
  onPause,
  onStop,
  notes,
  onNotesChange,
}: SessionTimerProps) {
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

      <div className="rounded-card border border-neutral-200 dark:border-neutral-800 p-6 flex flex-col items-center gap-3">
        <div className={`font-mono tabular-nums text-5xl sm:text-6xl ${running ? 'text-fluent' : 'text-neutral-700 dark:text-neutral-200'}`}>
          {formatClock(elapsed)}
        </div>
        <div className="flex items-center gap-2">
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
          <button
            onClick={onStop}
            disabled={elapsed === 0}
            className={`px-4 py-2 rounded-lg border text-sm ${
              elapsed === 0
                ? 'border-neutral-200 dark:border-neutral-700 text-neutral-400'
                : 'border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent'
            }`}
          >
            stop
          </button>
        </div>
        {elapsed > 0 && elapsed < MIN_CREATIVE_SECONDS && (
          <p className="text-[11px] text-neutral-500 italic">
            under 2 min logs as "quick exploration"
          </p>
        )}
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
  prompt,
  notes,
  onNotesChange,
}: {
  mode: CreativeMode;
  elapsed: number;
  prompt: CreativePrompt | null;
  notes: string;
  onNotesChange: (s: string) => void;
}) {
  const quick = elapsed < MIN_CREATIVE_SECONDS;
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-card border border-neutral-200 dark:border-neutral-800 p-4 text-center">
        <div className="text-[11px] uppercase tracking-wide text-neutral-500">
          {modeLabel(mode)} session
        </div>
        <div className="font-mono tabular-nums text-3xl my-1">{formatDuration(elapsed)}</div>
        {quick && (
          <div className="text-[11px] text-developing italic">
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
    case 'summary':      return mode === 'produce' ? 'session complete' : 'session complete';
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
