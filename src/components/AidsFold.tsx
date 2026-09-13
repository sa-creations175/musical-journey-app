/**
 * "Aids before you answer" — the quiz surfaces' fold.
 *
 * =====================================================================
 * SOME OF WHAT HELPS YOU HEAR IS FREE, AND SOME OF IT COSTS.
 *
 * Slowing a chord down or moving it an octave does not tell you what it
 * is; you still have to name it. Hearing the bass alone, or hearing the
 * chord rolled note by note, does part of the naming for you — so those
 * are still offered, and taking one is on the attempt. The fold says so
 * in one line rather than marking each control.
 *
 * WHY IT IS A FOLD AND NOT THE PANEL. Before the answer, the panel would
 * be the answer: its board lights the notes, its chips name the chords.
 * So the quiz surfaces show these four rows and nothing else until the
 * reader has answered, and the whole panel afterwards.
 *
 * THE ROWS ARE THE SHARED PLAYER'S, in the shared player's words. A
 * reader who learns "As voiced / Up an octave" on the reveal meets the
 * same two words here.
 * =====================================================================
 */
import type { ReactNode } from 'react';
import {
  BPM_MAX, BPM_MIN, clampBpm, type PlayerSettings,
} from '../lib/player/settings';
import PlayAsRow from './PlayAsRow';

const CHIP = 'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors';
const CHIP_OFF = 'border-black/10 dark:border-white/20 bg-black/[0.03] '
  + 'dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/10';
const CHIP_ON = 'border-neutral-900 dark:border-neutral-100 bg-neutral-900 '
  + 'text-white dark:bg-neutral-100 dark:text-neutral-900';

function Chip({
  on, onClick, children, testId,
}: {
  on: boolean; onClick: () => void; children: ReactNode; testId: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-testid={testId}
      onClick={onClick}
      className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

export default function AidsFold({
  settings, onSettings, playAs, showListen = true, extra,
}: {
  settings: PlayerSettings;
  onSettings: (next: PlayerSettings) => void;
  /** Play as, in the spot Chord sounds had. Chord Recognition only: a
   *  run is an aid there. Omit where the surface has no such row. */
  playAs?: boolean;
  /**
   * A row this surface adds of its own.
   *
   * ONE SURFACE HAS ONE, and it is Chord Motion's Starting note — an
   * aid nothing else offers because nothing else asks where a move
   * began. It goes at the foot of the fold, after the shared rows, so
   * the rows every surface has stay in the same order everywhere.
   */
  extra?: ReactNode;
  /** Bass only. Every quiz surface has it today; the flag is here for
   *  the one that will not. */
  showListen?: boolean;
}) {
  const set = (patch: Partial<PlayerSettings>) => onSettings({ ...settings, ...patch });
  return (
    <details
      data-testid="aids-fold"
      className="rounded-lg border border-dashed border-black/10 dark:border-white/15 px-3 py-2"
    >
      <summary className="cursor-pointer text-xs text-neutral-500 dark:text-neutral-400">
        Aids before you answer
      </summary>
      <div className="space-y-3 pt-2">
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Tempo and octave are free. Bass only and broken count, with a lower rating.
        </p>

        <Row label="Tempo">
          <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <input
              type="range"
              min={BPM_MIN}
              max={BPM_MAX}
              value={settings.bpm}
              data-testid="aid-tempo"
              aria-label="Tempo in beats per minute"
              onChange={e => set({ bpm: clampBpm(Number(e.target.value)) })}
              className="w-28 align-middle"
            />
            <input
              type="number"
              min={BPM_MIN}
              max={BPM_MAX}
              value={settings.bpm}
              data-testid="aid-tempo-number"
              aria-label="Tempo, typed"
              onChange={e => set({ bpm: clampBpm(Number(e.target.value)) })}
              className="w-14 rounded-md border border-black/10 dark:border-white/20 bg-transparent px-1.5 py-0.5 font-mono tabular-nums"
            />
            bpm
          </label>
        </Row>

        <Row label="Right hand">
          <Chip on={!settings.octaveUp} testId="aid-hand-written" onClick={() => set({ octaveUp: false })}>
            As voiced
          </Chip>
          <Chip on={settings.octaveUp} testId="aid-hand-up" onClick={() => set({ octaveUp: true })}>
            Up an octave
          </Chip>
        </Row>

        {showListen && (
          <Row label="Listen to">
            <Chip on={settings.listen === 'both'} testId="aid-listen-both" onClick={() => set({ listen: 'both' })}>
              Bass and chords
            </Chip>
            <Chip on={settings.listen === 'bass'} testId="aid-listen-bass" onClick={() => set({ listen: 'bass' })}>
              Bass only (lower rating)
            </Chip>
          </Row>
        )}

        <Row label="Bass">
          <Chip on={settings.bass === 'forward'} testId="aid-bass-forward" onClick={() => set({ bass: 'forward' })}>
            Forward
          </Chip>
          <Chip on={settings.bass === 'blended'} testId="aid-bass-blended" onClick={() => set({ bass: 'blended' })}>
            Blended
          </Chip>
        </Row>

        {/* PLAY AS, IN THE SPOT CHORD SOUNDS HAD. Chord Recognition
            only, where a run is an aid and the row says so in Silas's
            words of 13 Sep 2026. */}
        {playAs === true && (
          <PlayAsRow
            value={settings.playAs}
            onChange={p => set({ playAs: p })}
            testIdPrefix="aid-play-as"
            aidNote
          />
        )}

        {extra}
      </div>
    </details>
  );
}
