// @vitest-environment jsdom
/**
 * Where Previous / the shortcuts / Next sit (Silas, 14 Sep 2026).
 *
 * Before a card is answered the row is at the bottom. Once it is
 * answered it moves up to sit directly under the verdict and the
 * explanation, above whatever the deck reveals. One shell, every deck;
 * held here through a Diatonic Chord Qualities card, whose reveal is the
 * chord-qualities chart.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import FlashcardSession from '../FlashcardSession';
import { FLASHCARDS } from '../../../modules/harmonic-fluency/catalog';
import { renderHfAnswerSurface } from '../../../modules/harmonic-fluency/answerSurface';
import { diatonicCell } from '../../../modules/harmonic-fluency/diatonicCell';
import ChordQualitiesChart from '../../../components/ChordQualitiesChart';
import { db } from '../../db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/** "In major, what quality is the 4 chord?" */
const CARD = FLASHCARDS.find(c => c.id === 'dq-maj-4')!;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.attempts.clear();
  await db.spacingState.clear();
});

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 10)); });

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <FlashcardSession
        queue={[CARD]}
        timerMode="off"
        onExit={() => {}}
        onCardAnswered={() => {}}
        renderAnswerSurface={renderHfAnswerSurface}
        // THE DECK'S OWN REVEAL: the chart, on the card's cell, once answered.
        // Before answering the footer draws a marker, so "at the bottom" is
        // told apart from "under the verdict" even where nothing is revealed.
        renderFooter={(card, { answered }) => (answered
          ? <div data-testid="reveal"><ChordQualitiesChart select={diatonicCell(card)!} modesFolded framed /></div>
          : <div data-testid="footer-before" />)}
      />,
    );
  });
  await settle();
  return container;
}

const nav = () => container!.querySelector('[data-testid="flashcard-nav"]') as HTMLElement;
const follows = (a: Element, b: Element) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('the navigation row', () => {
  it('before answering, sits at the bottom, under the four buttons', async () => {
    const el = await render();
    expect(el.querySelectorAll('[data-testid="flashcard-nav"]')).toHaveLength(1);
    expect(el.querySelector('[data-testid="reveal"]')).toBeNull();
    // Below the footer, and the last thing on the card.
    const footer = el.querySelector('[data-testid="footer-before"]')!;
    expect(nav().previousElementSibling).toBe(footer);
    expect(footer.previousElementSibling!.textContent).toContain(CARD.correctAnswer);
    expect(nav().nextElementSibling).toBeNull();
  });

  it('once answered, sits directly under the verdict and explanation, above the chart', async () => {
    const el = await render();
    const answer = [...el.querySelectorAll('button')].find(b => b.textContent?.includes(CARD.correctAnswer))!;
    await act(async () => { answer.click(); });
    await settle();
    expect(el.querySelectorAll('[data-testid="flashcard-nav"]')).toHaveLength(1);
    const reveal = el.querySelector('[data-testid="reveal"]')!;
    expect(reveal).not.toBeNull();
    expect(follows(nav(), reveal)).toBe(true);
    // Directly under the feedback: the block before it holds the verdict.
    expect(nav().previousElementSibling!.textContent).toMatch(/Correct/);
  });
});
