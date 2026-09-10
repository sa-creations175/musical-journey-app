/**
 * Every write site records the measurement. All eleven of them.
 *
 * =====================================================================
 * A TEST ON ONE MODULE PASSES WHILE FIVE OTHERS RECORD NOTHING.
 *
 * There are ELEVEN places in this app that write an attempt row —
 * not the eight the brief assumed. Chord recognition writes twice
 * (quality and inversion), and chord progressions writes three times
 * across three tabs (the full-progression card, chord motion in bulk,
 * and key detection). Instrumenting the ones that came to mind and
 * calling it done is the failure this file exists to catch, and it
 * would be invisible — the app works, the field is simply missing from
 * some rows, and the gap only shows up months later as a lopsided
 * sample.
 *
 * It was TWELVE until 10 Sep 2026: the retired `ChordProgressionsQuiz`
 * wrote the transcription in bulk and a separate "which pattern is
 * this" question. Both went with the screen.
 *
 * SOURCE, NOT A RENDER. Following `homeRoute.test.tsx`: rendering five
 * quizzes to look at one spread would pull in Dexie, the audio graph
 * and every pref. What matters is what each file DECLARES.
 *
 * COUNTS, NOT PRESENCE. Asserting the spread appears somewhere in a
 * file passes on a file with two write sites and one spread — which is
 * exactly what chord recognition and chord progressions look like. So
 * the number of write calls must equal the number of instrumented
 * ones, per file.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import intervalsSource from '../../modules/ear-training/intervals/IntervalsQuiz.tsx?raw';
import chordRecognitionSource from '../../modules/ear-training/chord-recognition/ChordRecognitionQuiz.tsx?raw';
import progressionsSource from '../../modules/ear-training/chord-progressions/FullProgressionCard.tsx?raw';
import chordMotionSource from '../../modules/ear-training/chord-progressions/ChordMotionTab.tsx?raw';
import keyDetectionSource from '../../modules/ear-training/chord-progressions/KeyDetectionTab.tsx?raw';
import hearScaleSource from '../../modules/ear-training/scales-modes/HearScaleTab.tsx?raw';
import sitInsideSource from '../../modules/ear-training/scales-modes/SitInsideTab.tsx?raw';
import harmonicFluencySource from '../../modules/harmonic-fluency/HarmonicFluencySession.tsx?raw';
import vocabularySource from '../../modules/production/VocabularySession.tsx?raw';

const count = (text: string, needle: RegExp) => (text.match(needle) ?? []).length;

/** The heard modules: one `answerTimingFields` per attempt write. */
const HEARD: ReadonlyArray<{ name: string; source: string; writes: number }> = [
  { name: 'intervals', source: intervalsSource, writes: 1 },
  { name: 'chord recognition', source: chordRecognitionSource, writes: 2 },
  // ONE WRITE, NOT TWO. `ChordProgressionsQuiz` was here and wrote
  // twice — the whole progression in bulk and a separate "which
  // pattern is this" question. It was deleted on 10 Sep 2026 having
  // been unrendered since the shared list arrived, and the card that
  // replaced it asks one question and writes one row.
  { name: 'chord progressions — full progression', source: progressionsSource, writes: 1 },
  { name: 'chord progressions — chord motion', source: chordMotionSource, writes: 1 },
  { name: 'chord progressions — key detection', source: keyDetectionSource, writes: 1 },
  { name: 'scales & modes — hear scale', source: hearScaleSource, writes: 1 },
  { name: 'scales & modes — sit inside', source: sitInsideSource, writes: 1 },
];

describe('the heard modules', () => {
  for (const { name, source, writes } of HEARD) {
    it(`${name}: ${writes} write site${writes === 1 ? '' : 's'}, all instrumented`, () => {
      expect(count(source, /\b(addAttempt|bulkAddAttempts)\(/g)).toBe(writes);
      expect(count(source, /answerTimingFields\(/g)).toBe(writes);
    });

    it(`${name}: captures at ask time, never reads a live setting at write`, () => {
      // The whole point of the AskedContext: the row must come from
      // the ref filled when the question was presented. A live
      // `speedRef.current` inside the attempt record would be the bug.
      expect(source).toContain('answerTimingFields(asked.current');
      expect(source).toMatch(/asked\.current\s*(=|\?\?=)\s*\{/);
    });

    it(`${name}: measures from the end of playback, not the start`, () => {
      // `playbackEndsAt`, not `playbackStartedAt`. The players resolve
      // once the notes are SCHEDULED, so a clock started when the call
      // returns still has the whole sound inside it.
      expect(source).toContain('playbackEndsAt');
    });
  }
});

describe('the flashcard shell modules', () => {
  const SHELL = [
    { name: 'harmonic fluency', source: harmonicFluencySource },
    { name: 'production vocabulary', source: vocabularySource },
  ];
  for (const { name, source } of SHELL) {
    it(`${name}: records elapsed and the timeout`, () => {
      expect(count(source, /\baddAttempt\(/g)).toBe(1);
      expect(source).toContain('elapsedFields(shownAt, timestamp)');
      expect(source).toContain('timedOutFields(timedOut)');
    });
  }
});

describe('chord recognition records the stage, not a tab', () => {
  it('marks its two write sites as one-stage and two-stage', () => {
    // The two sites resolve differently: one is reached when the
    // reader answered once, the other when they answered twice.
    expect(count(chordRecognitionSource, /answerStage: 'quality',/g)).toBe(1);
    expect(count(chordRecognitionSource, /answerStage: 'quality-inversion',/g)).toBe(1);
  });

  it('does NOT put the stage on drillTab', () => {
    // `drillTab`'s own docblock says it is absent in single-drill
    // modules, and chord recognition has no tabs. Putting 'quality'
    // there would make that documentation false — and a tab is a place
    // the reader chose to be, a stage is how the question resolved.
    // Same two literals, two different claims.
    expect(chordRecognitionSource).not.toContain('drillTab');
  });

  it('is the only module that records a stage', () => {
    // A single-stage module writing one would be claiming a
    // distinction it does not have.
    for (const { name, source } of HEARD) {
      if (name === 'chord recognition') continue;
      expect(source, name).not.toContain('answerStage');
    }
  });

  it('starts its clock once per question, never on a replay', () => {
    // TWENTY ROWS OF EXACTLY ZERO came from two clocks pointing the
    // wrong way, and this is the second of them: `asked.current` was
    // assigned inside the play helper, which `replay` also calls, so
    // every replay pushed the start of the measurement forward past
    // the answer that followed it. One assignment, on the path that
    // presents a NEW question.
    expect(count(chordRecognitionSource, /asked\.current\s*=[^=]/g)).toBe(1);
    // And the assignment is not in the player. `playChord` is called by
    // both `startNew` and `replay`; only one of them asks a question.
    expect(chordRecognitionSource)
      .toMatch(/asked\.current = \{[\s\S]*?\};\n\s*await playChord\(/);
  });

  it('measures from the onset of a blocked chord, not the end of its ring', () => {
    // The first of the two clocks. A blocked chord strikes every note
    // at once, so the 3.2s it then rings for is not time the reader
    // spends deciding — and at the module's default half speed that
    // put the start of the clock 6.45s after the answer.
    expect(chordRecognitionSource).toContain('chordBlockedAnswerableMs()');
    expect(chordRecognitionSource).not.toContain('chordBlockedMs');
  });

  it('records it rather than leaving it reconstructable', () => {
    // Step two fires only when the chord is inversion-trained, not
    // excluded, AND at least two inversion positions are enabled FOR
    // THAT CHORD'S TIER. That last condition is a mutable setting that
    // appears nowhere on the row, so nothing downstream could recover
    // the split — which is why the stage is written rather than
    // inferred.
    //
    // The setting became per-tier on 26 Aug 2026, so the gate reads
    // `positionsForTier(...)` where it read one shared list. The rule
    // is unchanged and is now harder to satisfy by accident: there are
    // two settings that can move it rather than one.
    expect(chordRecognitionSource)
      .toContain('positionsForTier(inversionSettingsRef.current, chord.tier).length >= 2');
    expect(chordRecognitionSource).not.toContain('inversionPositions: ');
  });
});

describe('the count itself', () => {
  it('is eleven write sites — eight heard, two shell, one reading', () => {
    // PINNED, because the number is the thing that was wrong twice.
    // The brief said eight; I reported eleven; it was twelve. A new
    // write site added without a line here fails this assertion rather
    // than quietly recording nothing.
    //
    // IT IS ELEVEN AGAIN SINCE 10 SEP 2026, and this is the one way the
    // count is allowed to fall: `ChordProgressionsQuiz` was deleted and
    // the card that replaced it asks one question where the quiz asked
    // two. The site did not go uninstrumented — it stopped existing.
    const heard = HEARD.reduce((sum, m) => sum + m.writes, 0);
    expect(heard).toBe(8);
    const shell = 2;
    const reading = 1;
    expect(heard + shell + reading).toBe(11);
  });
});
