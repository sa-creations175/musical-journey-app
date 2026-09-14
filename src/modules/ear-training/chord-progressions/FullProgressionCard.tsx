/**
 * "Which progression is this, and from which position?"
 *
 * =====================================================================
 * ONE CARD KIND FOR EVERYTHING ON THE SHARED LIST, PASSES INCLUDED.
 *
 * The shared list is the Chord Movements & Passes grid — see
 * `sharedList.ts` — so what you hear here is what you drill there:
 * the root in the left hand, the rootless shape in the right, the rest
 * voice-led, at one of the grid's own thickness rows and from one of
 * its own positions.
 *
 * POSITIONS ARE A SECOND QUESTION, NOT A SECOND CARD. Chord
 * recognition's model: `1 5 6 4` is one chip and Position 1 and
 * Position 2 are two ways of hearing it. That is why the filter has a
 * Positions row of its own rather than thirty progression chips.
 *
 * =====================================================================
 * NOTHING IS LOCKED WHEN YOU OPEN IT YOURSELF.
 *
 * "What is in play" starts with everything on and narrows only when the
 * reader narrows it. Tiers steer what a practice SESSION hands you;
 * they have never been a wall in front of a drill somebody chose to
 * open, and this surface does not build one.
 *
 * =====================================================================
 * IT PLAYS AS THE CARD ARRIVES, WHICH IS THE ONE ALLOWED DIFFERENCE.
 *
 * Every other surface waits for a tap. A quiz may not: the question IS
 * the sound. The first card of a session still waits, because a browser
 * will not make a sound before the reader has touched the page —
 * Silas's prototype says so in its own note.
 * =====================================================================
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AttemptRecord } from '../../../lib/db';
import { poolCountsTowardAccuracy } from '../../../lib/fluencyPool';
import FluencyProtectionNotice from '../../../components/FluencyProtectionNotice';
import { addAttempt } from '../../../lib/practiceWrites';
import SessionCardCount from '../../../components/SessionCardCount';
import { recordEngagement } from '../../../lib/spacingState';
import { updateDailySummary } from '../../../lib/dailySummaries';
import { answerTimingFields, type AskedContext } from '../../../lib/attemptTiming';
import { getPref, setPref } from '../../../lib/userPrefs';
import type { PlaybackHandle } from '../../../lib/musicalPlayback';
import { panelBeats, playPanel } from '../../../lib/builtAnswers/play';
import { usePlayerSettings } from '../../../lib/player/usePlayerSettings';
import type { Move } from '../../../lib/builtAnswers/voiceLeading';
import SharedPlayer from '../../../components/SharedPlayer';
import AidsFold from '../../../components/AidsFold';
import { useSpelling } from '../../../lib/spellingPref';
import { useProgressionSpelling } from '../../../lib/progressionSpelling';
import { spellNote } from '../../../lib/spelling';
import {
  LIST_KEYS, LIST_RUNGS, RUNG_LABEL, SHARED_PROGRESSIONS, nameOf,
  SHARED_PROGRESSION_BY_ID, fullProgressionItemId, positionLabel, positionsOf,
  type ListRung, type SharedProgression,
} from './sharedList';
// THE FILTER LIVES BESIDE THE POOL IT NARROWS, because a generated
// practice session reads the same pref this fold writes — see
// `fullProgressionPool.ts`. Two copies of "what is in play" would let
// the session and the card disagree about it.
import {
  ALL_POSITIONS, EVERYTHING, PREF_FULL_PROGRESSION_FILTER, sanitizeInPlay,
  type InPlay,
} from './fullProgressionPool';
import { voiceEntry } from './passVoicing';
import { heardFeel, isAided } from '../../../lib/earTraining/heardFeel';

const MODULE_ID = 'chord-progressions';
const DRILL_TAB = 'full-progression';

const CHIP = 'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors';
const CHIP_OFF = 'border-black/10 dark:border-white/20 bg-black/[0.03] '
  + 'dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/10';
const CHIP_ON = 'border-neutral-900 dark:border-neutral-100 bg-neutral-900 '
  + 'text-white dark:bg-neutral-100 dark:text-neutral-900';

/** One card: what was asked, and how it sounded. */
interface Card {
  entry: SharedProgression;
  keyPc: number;
  rung: ListRung;
  position: number;
  /** The bass's FIRST move, a coin flip per card. Everything after it
   *  takes the rule. */
  bassMoves: Move[];
}

/** Every card the filter allows, as (entry, rung, position). */
function pool(inPlay: InPlay): Array<{ entry: SharedProgression; rung: ListRung; position: number }> {
  const out: Array<{ entry: SharedProgression; rung: ListRung; position: number }> = [];
  for (const entry of SHARED_PROGRESSIONS) {
    if (!inPlay.progressions.includes(entry.id)) continue;
    for (const rung of entry.rungs) {
      if (!inPlay.rungs.includes(rung)) continue;
      for (const position of positionsOf(entry, rung)) {
        if (!inPlay.positions.includes(position)) continue;
        out.push({ entry, rung, position });
      }
    }
  }
  return out;
}

const pick = <T,>(list: ReadonlyArray<T>): T => list[Math.floor(Math.random() * list.length)];

export default function FullProgressionCard({ attempts }: { attempts: AttemptRecord[] }) {
  const [spelling] = useSpelling();
  const [rowSpelling] = useProgressionSpelling();
  const [settings, setSettings] = usePlayerSettings();
  const [inPlay, setInPlay] = useState<InPlay>(EVERYTHING);
  const [card, setCard] = useState<Card | null>(null);
  const [answerEntry, setAnswerEntry] = useState<string | null>(null);
  const [answerPosition, setAnswerPosition] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  /** Which position the reveal is SHOWING, which need not be the asked
   *  one — the Compare row moves it. */
  const [showPosition, setShowPosition] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [otherLanding, setOtherLanding] = useState(false);
  const [handMoves, setHandMoves] = useState<Move[]>([]);
  const [started, setStarted] = useState(false);
  const [replays, setReplays] = useState(0);
  const playing = useRef<PlaybackHandle | null>(null);
  const asked = useRef<AskedContext | null>(null);
  const settingsRef = useRef(settings);
  // KEPT IN STEP FROM AN EFFECT, not during render: the play path reads
  // it from a timer and a click, both of which run after the commit.
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => {
    (async () => {
      setInPlay(sanitizeInPlay(await getPref<unknown>(PREF_FULL_PROGRESSION_FILTER, EVERYTHING)));
    })();
  }, []);

  useEffect(() => () => { playing.current?.stop(); }, []);

  const saveInPlay = (next: InPlay) => {
    setInPlay(next);
    void setPref(PREF_FULL_PROGRESSION_FILTER, next);
  };

  const cards = useMemo(() => pool(inPlay), [inPlay]);
  // =====================================================================
  // FOCUS PROTECTION, BROUGHT BACK. The quiz this card replaced marked a
  // too-small pool's attempts as practice; the card did not, so
  // narrowing What is in play to two progressions made a percentage out
  // of a coin toss. Silas: "if the pool is so small, you're only
  // choosing out of a group of four, and those odds are just too easy."
  // Counted over DISTINCT progressions — a progression is the answer,
  // however many positions and rungs of it are in play. Below the
  // shared minimum the card shows the shared notice and logs the flag,
  // exactly as Chord Recognition and Intervals do.
  // =====================================================================
  const poolSize = useMemo(() => new Set(cards.map(c => c.entry.id)).size, [cards]);
  const poolProtected = cards.length > 0 && !poolCountsTowardAccuracy(poolSize);

  /** The chords as they sound now: the asked position while the card is
   *  open, whatever the Compare row is showing once it is answered. */
  const chords = useMemo(() => {
    if (card === null) return [];
    return voiceEntry(card.entry, card.keyPc, card.rung,
      solved ? showPosition : card.position, {
        bassMoves: card.bassMoves,
        handMoves: solved ? handMoves : [],
        rotation: solved ? rotation : 0,
        otherLanding: solved && otherLanding,
        spelling,
      });
  }, [card, solved, showPosition, handMoves, rotation, otherLanding, spelling]);

  const play = async (chordsNow = chords, keyPc = card?.keyPc) => {
    playing.current?.stop();
    if (chordsNow.length === 0 || keyPc === undefined) return;
    playing.current = await playPanel(chordsNow, settingsRef.current, {
      orientPc: keyPc,
      loop: solved ? settingsRef.current.loop : 1,
    });
  };

  const deal = () => {
    if (cards.length === 0) return;
    const next = pick(cards);
    // A KEY PER CARD, from the grid's own twelve. The question does not
    // ask which key — it is named on the reveal — but a progression
    // only ever heard in C is a shape you have learned in one place.
    const keyPc = LIST_KEYS.indexOf(pick(LIST_KEYS));
    // EVERY NEW CARD PLAYS TOGETHER, and a run chosen on the last card's
    // reveal is not an aid on this one (Silas, 14 Sep 2026).
    if (settingsRef.current.playAs !== 'together') {
      settingsRef.current = { ...settingsRef.current, playAs: 'together' };
      setSettings(settingsRef.current);
    }
    // THE HANDS FILTER FORCES THE PANEL ONLY WHERE IT NARROWS. With
    // both on, the reader's own setting stands; with one, the card is
    // dealt the way they asked to hear it.
    if (inPlay.hands.length === 1 && inPlay.hands[0] !== settingsRef.current.hands) {
      setSettings({ ...settingsRef.current, hands: inPlay.hands[0] });
    }
    // THE BASS'S FIRST MOVE IS A COIN FLIP PER CARD. Everything after
    // it follows the rule, so the line still stays near home — but a
    // reader cannot learn "it always goes up first" and answer from
    // that instead of from the chords.
    const bassMoves: Move[] = next.entry.chords.map((_, i) => (i === 0
      ? (Math.random() < 0.5 ? 'up' : 'down') : 'auto'));
    const dealt: Card = { entry: next.entry, keyPc, rung: next.rung, position: next.position, bassMoves };
    setCard(dealt);
    setSolved(false);
    setAnswerEntry(null);
    setAnswerPosition(null);
    setShowPosition(next.position);
    setRotation(0);
    setOtherLanding(false);
    setHandMoves([]);
    setReplays(0);
    setStarted(true);
    const voiced = voiceEntry(dealt.entry, keyPc, dealt.rung, dealt.position,
      { bassMoves, spelling });
    // THE CLOCK STARTS WHEN THE PASSAGE STOPS, once — a replay never
    // moves it. The tonic lead-in is part of the wait, so it counts.
    const beats = panelBeats(voiced.length, { orientPc: keyPc });
    asked.current = {
      playbackEndsAt: Date.now() + (beats * 60 / settingsRef.current.bpm) * 1000,
      playbackBpm: settingsRef.current.bpm,
      drillTab: DRILL_TAB,
    };
    void play(voiced, keyPc);
  };

  const submit = async () => {
    if (card === null || answerEntry === null || answerPosition === null) return;
    const rightEntry = answerEntry === card.entry.id;
    const rightPosition = answerPosition === card.position;
    setSolved(true);
    setShowPosition(card.position);
    const itemId = fullProgressionItemId(card.entry.id, card.position);
    // WHERE THE ANSWER LANDS ON THE FOUR-STEP SCALE. Right on the first
    // listen with no aid is In flow; right after replays is Clean; the
    // right progression from the wrong position, or a right answer that
    // needed the bass on its own, is Working on it; the wrong
    // progression is Struggled. The rule is `heardFeel` and nothing
    // decides it here.
    const aided = isAided(settingsRef.current, { playAsIsAid: true });
    const feel = heardFeel({
      firstRight: rightEntry, secondRight: rightPosition, replays, aided,
    });
    await addAttempt({
      moduleId: MODULE_ID,
      itemId,
      correct: rightEntry && rightPosition,
      timestamp: Date.now(),
      chosenItemId: fullProgressionItemId(answerEntry, answerPosition),
      feelRating: feel,
      replays,
      ...(aided ? { aided: true } : {}),
      ...(poolProtected ? { excludeFromFluency: true } : {}),
      ...answerTimingFields(asked.current, Date.now()),
    });
    await recordEngagement({
      itemRef: itemId,
      moduleRef: MODULE_ID,
      signal: { kind: 'attempt', correct: rightEntry && rightPosition, feel },
    });
    await updateDailySummary(MODULE_ID);
  };

  const seen = useMemo(
    () => attempts.some(a => a.itemId.startsWith('full-progression:')),
    [attempts],
  );

  const chip = (on: boolean) => `${CHIP} ${on ? CHIP_ON : CHIP_OFF}`;
  const positionsForAnswer = answerEntry === null
    ? ALL_POSITIONS
    : positionsOf(
      SHARED_PROGRESSION_BY_ID.get(answerEntry)!,
      card?.rung ?? 'seventh',
    );

  return (
    <div className="space-y-4" data-testid="full-progression-card">
      <SessionCardCount moduleId={MODULE_ID} />
      {/* WHAT IS IN PLAY — the filter, folded away. */}
      <details
        data-testid="in-play"
        className="rounded-lg border border-dashed border-black/10 dark:border-white/15 px-3 py-2"
      >
        <summary className="cursor-pointer text-xs text-neutral-500 dark:text-neutral-400">
          What is in play
        </summary>
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={chip(false)} data-testid="select-all" onClick={() => saveInPlay(EVERYTHING)}>
              Select all
            </button>
            <button
              type="button"
              className={chip(false)}
              data-testid="clear-all"
              onClick={() => saveInPlay({ progressions: [], positions: [], rungs: [], hands: [] })}
            >
              Clear all
            </button>
          </div>
          <FilterRow label="Progressions">
            {SHARED_PROGRESSIONS.map(p => (
              <button
                key={p.id}
                type="button"
                aria-pressed={inPlay.progressions.includes(p.id)}
                data-testid={`filter-prog-${p.id}`}
                className={chip(inPlay.progressions.includes(p.id))}
                onClick={() => saveInPlay({
                  ...inPlay,
                  progressions: inPlay.progressions.includes(p.id)
                    ? inPlay.progressions.filter(x => x !== p.id)
                    : [...inPlay.progressions, p.id],
                })}
              >
                {nameOf(p, { settings: rowSpelling })}
              </button>
            ))}
          </FilterRow>
          <FilterRow label="Positions">
            {ALL_POSITIONS.map(n => (
              <button
                key={n}
                type="button"
                aria-pressed={inPlay.positions.includes(n)}
                data-testid={`filter-pos-${n}`}
                className={chip(inPlay.positions.includes(n))}
                onClick={() => saveInPlay({
                  ...inPlay,
                  positions: inPlay.positions.includes(n)
                    ? inPlay.positions.filter(x => x !== n)
                    : [...inPlay.positions, n],
                })}
              >
                {positionLabel(n)}
              </button>
            ))}
          </FilterRow>
          <FilterRow label="Thickness">
            {LIST_RUNGS.map(r => (
              <button
                key={r}
                type="button"
                aria-pressed={inPlay.rungs.includes(r)}
                data-testid={`filter-rung-${r}`}
                className={chip(inPlay.rungs.includes(r))}
                onClick={() => saveInPlay({
                  ...inPlay,
                  rungs: inPlay.rungs.includes(r)
                    ? inPlay.rungs.filter(x => x !== r)
                    : [...inPlay.rungs, r],
                })}
              >
                {RUNG_LABEL[r]}
              </button>
            ))}
          </FilterRow>
          <FilterRow label="Hands">
            {/* The shared player's Hands row, in its words: two right-hand
                voicings over the same bass. */}
            {([['rootless', 'Rootless right hand'], ['root', 'Root in the right hand']] as const)
              .map(([h, label]) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={inPlay.hands.includes(h)}
                  data-testid={`filter-hands-${h}`}
                  className={chip(inPlay.hands.includes(h))}
                  onClick={() => saveInPlay({
                    ...inPlay,
                    hands: inPlay.hands.includes(h)
                      ? inPlay.hands.filter(x => x !== h)
                      : [...inPlay.hands, h],
                  })}
                >
                  {label}
                </button>
              ))}
          </FilterRow>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Everything is on by default. Narrow it here; nothing is ever locked
            when you open the drill yourself. The tiers only steer what a
            practice session hands you.
          </p>
        </div>
      </details>

      <p className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
        Ear training · Chord progressions · Full progression
      </p>
      <p className="text-lg font-medium">
        Which progression is this, and from which position?
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="play-again"
          disabled={cards.length === 0}
          className={`${CHIP} ${CHIP_ON} disabled:opacity-40`}
          onClick={() => {
            if (!started) { deal(); return; }
            setReplays(r => r + 1);
            void play();
          }}
        >
          {started ? 'Play again' : 'Play'}
        </button>
        <button
          type="button"
          data-testid="next-card"
          disabled={cards.length === 0}
          className={`${CHIP} ${CHIP_OFF} disabled:opacity-40`}
          onClick={deal}
        >
          Next card
        </button>
      </div>

      {poolProtected && <FluencyProtectionNotice />}

      {cards.length === 0 && (
        <p className="text-xs text-needswork" data-testid="empty-pool">
          Nothing is in play. Open “What is in play” and turn something back on.
        </p>
      )}

      {!solved && started && (
        <>
          <div
            className="flex h-24 items-center justify-center rounded-lg border border-dashed border-black/10 dark:border-white/15 text-xs text-neutral-500"
            data-testid="board-hidden"
          >
            The keyboard stays hidden until you answer
          </div>
          <AidsFold settings={settings} onSettings={setSettings} />
        </>
      )}

      {started && (
        <>
          <FilterRow label="Which progression">
            {SHARED_PROGRESSIONS.filter(p => inPlay.progressions.includes(p.id)).map(p => (
              <button
                key={p.id}
                type="button"
                disabled={solved}
                aria-pressed={answerEntry === p.id}
                data-testid={`answer-prog-${p.id}`}
                className={`${chip(answerEntry === p.id)} disabled:opacity-40`}
                onClick={() => { setAnswerEntry(p.id); setAnswerPosition(null); }}
              >
                {nameOf(p, { settings: rowSpelling })}
              </button>
            ))}
          </FilterRow>
          <FilterRow label="Which position">
            {positionsForAnswer.map(n => (
              <button
                key={n}
                type="button"
                disabled={solved || answerEntry === null}
                aria-pressed={answerPosition === n}
                data-testid={`answer-pos-${n}`}
                className={`${chip(answerPosition === n)} disabled:opacity-40`}
                onClick={() => setAnswerPosition(n)}
              >
                {positionLabel(n)}
              </button>
            ))}
          </FilterRow>
          <button
            type="button"
            data-testid="submit"
            disabled={solved || answerEntry === null || answerPosition === null}
            className={`${CHIP} ${CHIP_ON} disabled:opacity-40`}
            onClick={() => { void submit(); }}
          >
            Submit
          </button>
        </>
      )}

      {solved && card !== null && (
        <>
          <p
            data-testid="verdict"
            className={`rounded-lg px-3 py-2 text-sm ${answerEntry === card.entry.id
              && answerPosition === card.position
              ? 'bg-fluent/10 text-fluent'
              : 'bg-needswork/10 text-needswork'}`}
          >
            {answerEntry === card.entry.id && answerPosition === card.position
              ? 'Right. '
              : answerEntry === card.entry.id
                ? 'Right progression, wrong position. '
                : 'Not this one. '}
            {/* THE CARD'S OWN RUNG, unlike the chips above. Every rung
                this list offers is a seventh-chord reading, so the
                minor 2 5 1's 2 reads with its seventh name here. */}
            {`${nameOf(card.entry, { settings: rowSpelling, rung: card.rung })} `
              + `from ${positionLabel(card.position).toLowerCase()}, `
              + `in the key of ${spellNote(card.keyPc, spelling)}.`}
          </p>
          <SharedPlayer
            chords={chords}
            orientPc={card.keyPc}
            settings={settings}
            onSettings={setSettings}
            handDirection={{
              value: handMoves,
              onChange: setHandMoves,
              effective: chords.slice(1).map((c, i) => (
                (c.hand[0] ?? 0) < (chords[i].hand[0] ?? 0) ? 'down' : 'up')),
            }}
            compare={(
              <FilterRow label="Compare">
                {positionsOf(card.entry, card.rung).map(n => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={n === showPosition}
                    data-testid={`compare-pos-${n}`}
                    className={chip(n === showPosition)}
                    onClick={() => setShowPosition(n)}
                  >
                    {positionLabel(n)}
                    {card.rung === 'full' ? (n === 1 ? ' (ABA)' : ' (BAB)') : ''}
                    {n === card.position ? ' (asked)' : ''}
                  </button>
                ))}
                {card.entry.rotates && (
                  <button
                    type="button"
                    data-testid="rotate"
                    className={chip(rotation > 0)}
                    onClick={() => setRotation(r => (r + 1) % card.entry.chords.length)}
                  >
                    Rotate progression start
                  </button>
                )}
                {card.entry.otherLanding !== null && (
                  <>
                    <button
                      type="button"
                      data-testid="landing-asked"
                      aria-pressed={!otherLanding}
                      className={chip(!otherLanding)}
                      onClick={() => setOtherLanding(false)}
                    >
                      As asked
                    </button>
                    <button
                      type="button"
                      data-testid="landing-other"
                      aria-pressed={otherLanding}
                      className={chip(otherLanding)}
                      onClick={() => setOtherLanding(true)}
                    >
                      {card.entry.otherLanding.label}
                    </button>
                  </>
                )}
              </FilterRow>
            )}
          >
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {`${RUNG_LABEL[card.rung]}, `
                + `${replays === 0 ? 'first listen' : `${replays} replay${replays === 1 ? '' : 's'}`}. `
                + 'The other positions are one tap away, so you can hear what changed.'}
            </p>
          </SharedPlayer>
        </>
      )}

      {!seen && !started && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Tap Play to hear the first one.
        </p>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}
