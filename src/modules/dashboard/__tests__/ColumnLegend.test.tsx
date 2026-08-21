// @vitest-environment jsdom
/**
 * The rules panel, rendered.
 *
 * The thing worth guarding here is not that a panel appears. It is that
 * the SCORE panel carries two legends rather than one merged one, and
 * that each names a different set of meanings against the same four
 * colours. A single legend would say a red cell means one thing, and it
 * means two.
 *
 * Queried from the container, ancestry asserted where placement matters,
 * and every click dispatched as a real event.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ColumnLegend, { ColumnHelpButton } from '../ColumnLegend';
import {
  ACCURACY_LEGEND,
  COLUMN_RULES,
  FLUENCY_LEGEND,
  TOPICS_USING_TREE_VOCABULARY,
  TREE_VOCABULARY,
  type ColumnTopic,
} from '../bands';
import { FEEL_OPTIONS } from '../../../lib/fluencyScale';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(ui: React.ReactElement): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(ui));
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** The band of each swatch, in the order the legend lists them. */
function bandsIn(el: HTMLElement, kind: string): string[] {
  const legend = el.querySelector(`[data-testid="legend-${kind}"]`);
  expect(legend, kind).not.toBeNull();
  // Inside the panel, not floating elsewhere in the container.
  expect(legend!.closest('[data-testid="column-legend"]')).not.toBeNull();
  return [...legend!.querySelectorAll('li')].map(li => li.getAttribute('data-band')!);
}

function labelsIn(el: HTMLElement, kind: string): string[] {
  const legend = el.querySelector(`[data-testid="legend-${kind}"]`)!;
  return [...legend.querySelectorAll('li')].map(li => li.textContent!.trim());
}

describe('the score panel carries two legends, never one', () => {
  it('renders both, headed by their kind', () => {
    const el = render(<ColumnLegend topic="score" />);
    expect(el.querySelector('[data-testid="legend-accuracy"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="legend-fluency"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="legend-accuracy"]')!.textContent)
      .toContain('measured');
    expect(el.querySelector('[data-testid="legend-fluency"]')!.textContent)
      .toContain('self-rated');
  });

  it('gives them the SAME four colours and DIFFERENT meanings', () => {
    // The whole reason there are two. If a future edit merged them, the
    // colours would still line up and the meanings would collapse — so
    // both halves are asserted, not just the colours.
    const el = render(<ColumnLegend topic="score" />);
    const accuracy = bandsIn(el, 'accuracy');
    const fluency = bandsIn(el, 'fluency');
    expect(accuracy).toEqual(['red', 'amber', 'yellow-green', 'green']);
    expect(fluency).toEqual(accuracy);

    // NOT `labels(a) !== labels(b)` — that passes on a merged legend as
    // soon as one side renders a suffix the other does not, which is
    // exactly what happened the first time this was written. Assert
    // what each side actually SAYS: accuracy states percentage ranges,
    // fluency states the four ratings by name.
    const accuracyLabels = labelsIn(el, 'accuracy');
    const fluencyLabels = labelsIn(el, 'fluency');
    expect(accuracyLabels.every(l => l.includes('%'))).toBe(true);
    expect(fluencyLabels.some(l => l.includes('%'))).toBe(false);
    expect(fluencyLabels.map(l => l.replace(/\d+$/, '')))
      .toEqual(FEEL_OPTIONS.map(o => o.label));
  });

  it('reads its entries off the band tables rather than its own copy', () => {
    const el = render(<ColumnLegend topic="score" />);
    for (const entry of ACCURACY_LEGEND) {
      expect(labelsIn(el, 'accuracy').join(' '), entry.label).toContain(entry.label);
    }
    for (const entry of FLUENCY_LEGEND) {
      // The rating AND what it is worth, in the same row: "comfortable
      // 75". The word alone leaves the number in the score cell
      // unexplained. Asserted per row rather than on the concatenated
      // string, so it holds however the two are spaced.
      const row = labelsIn(el, 'fluency').find(l => l.includes(entry.label));
      expect(row, entry.label).toBeDefined();
      expect(row, entry.label).toContain(String(entry.value));
    }
  });

  it('puts a fluency number in the SAME row as its rating', () => {
    // It used to be pushed to the far edge with `ml-auto`, which read
    // as a separate column with an unexplained gap between the two
    // halves of one fact. Asserted structurally: the swatch, the word
    // and the number are siblings, in that order, with nothing flexing
    // them apart.
    const el = render(<ColumnLegend topic="score" />);
    const rows = [...el.querySelectorAll('[data-testid="legend-fluency"] li')];
    expect(rows).toHaveLength(FLUENCY_LEGEND.length);
    for (const [i, row] of rows.entries()) {
      const spans = [...row.querySelectorAll('span')];
      expect(spans[spans.length - 1].textContent)
        .toBe(String(FLUENCY_LEGEND[i].value));
      expect(spans.some(s => s.className.includes('ml-auto'))).toBe(false);
    }
  });

  it('shows no legend on the columns that have no colour', () => {
    // Coverage and recency are not banded. A legend there would invent
    // a scale.
    for (const topic of ['coverage', 'recency', 'due'] as ColumnTopic[]) {
      const el = render(<ColumnLegend topic={topic} />);
      expect(el.querySelector('[data-testid="legend-accuracy"]'), topic).toBeNull();
      expect(el.querySelector('[data-testid="legend-fluency"]'), topic).toBeNull();
      act(() => root!.unmount()); container!.remove();
    }
  });
});

describe('the panel reads as bullets, with its terms defined first', () => {
  it('gives each rule ONE bullet, not a heading over a paragraph', () => {
    // A bold line above an indented paragraph reads as a wall of text
    // at this density. Rule and reason share a line item.
    for (const topic of ['score', 'coverage', 'recency', 'due'] as ColumnTopic[]) {
      const el = render(<ColumnLegend topic={topic} />);
      const items = [...el.querySelectorAll('[data-testid="column-rules"] > li')];
      expect(items, topic).toHaveLength(COLUMN_RULES[topic].length);
      for (const [i, item] of items.entries()) {
        const { rule, why } = COLUMN_RULES[topic][i];
        // Both halves in the SAME list item — not two siblings.
        expect(item.textContent, rule).toContain(rule);
        if (why !== undefined) expect(item.textContent, rule).toContain(why);
      }
      act(() => root!.unmount()); container!.remove();
    }
  });

  it('defines group row and item row ABOVE the rules that use them', () => {
    const el = render(<ColumnLegend topic="coverage" />);
    const vocabulary = el.querySelector('[data-testid="tree-vocabulary"]')!;
    expect(vocabulary).not.toBeNull();
    for (const { term, meaning } of TREE_VOCABULARY) {
      expect(vocabulary.textContent).toContain(term);
      expect(vocabulary.textContent).toContain(meaning);
    }
    // Above, not below: a definition after the sentence that needs it
    // is a definition the reader has already had to guess.
    const rules = el.querySelector('[data-testid="column-rules"]')!;
    expect(vocabulary.compareDocumentPosition(rules)
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('omits the definitions where no rule uses the words', () => {
    // Guard the guard: if it rendered everywhere, the assertion above
    // would say nothing about it being where it is needed.
    const el = render(<ColumnLegend topic="due" />);
    expect(el.querySelector('[data-testid="tree-vocabulary"]')).toBeNull();
    expect(TOPICS_USING_TREE_VOCABULARY.has('due')).toBe(false);
  });
});

describe('every panel states its rules with their reasons', () => {
  it('renders both halves of every rule for the topic it is given', () => {
    for (const topic of ['score', 'coverage', 'recency', 'due'] as ColumnTopic[]) {
      const el = render(<ColumnLegend topic={topic} />);
      const text = el.querySelector('[data-testid="column-legend"]')!.textContent!;
      for (const { rule, why } of COLUMN_RULES[topic]) {
        expect(text, `${topic}: ${rule}`).toContain(rule);
        if (why !== undefined) expect(text, `${topic}: why of ${rule}`).toContain(why);
      }
      act(() => root!.unmount()); container!.remove();
    }
  });

  it("shows one topic's rules and not another's", () => {
    // Guard the guard: the four topics must genuinely differ, or the
    // assertion above passes on a panel that renders everything.
    const dueOnly = COLUMN_RULES.due[0].rule;
    expect(COLUMN_RULES.coverage.some(r => r.rule === dueOnly)).toBe(false);
    const el = render(<ColumnLegend topic="coverage" />);
    expect(el.textContent).not.toContain(dueOnly);
  });
});

describe('the ? button', () => {
  it('reports its state to a screen reader and to the eye', () => {
    const el = render(
      <ColumnHelpButton topic="coverage" open={false} onToggle={() => {}} />,
    );
    const button = el.querySelector('[data-testid="column-help-coverage"]')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('data-open')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('column-legend-coverage');
    act(() => root!.unmount()); container!.remove();

    const open = render(
      <ColumnHelpButton topic="coverage" open onToggle={() => {}} />,
    );
    expect(
      open.querySelector('[data-testid="column-help-coverage"]')!
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('points at the panel it opens', () => {
    // aria-controls has to name a real id, or it points at nothing with
    // total confidence.
    const el = render(
      <div>
        <ColumnHelpButton topic="score" open onToggle={() => {}} />
        <ColumnLegend topic="score" />
      </div>,
    );
    const id = el.querySelector('[data-testid="column-help-score"]')!
      .getAttribute('aria-controls')!;
    expect(el.querySelector(`#${id}`)).not.toBeNull();
    expect(el.querySelector(`#${id}`)!.getAttribute('data-topic')).toBe('score');
  });

  it('toggles on a real click', () => {
    const onToggle = vi.fn();
    const el = render(
      <ColumnHelpButton topic="recency" open={false} onToggle={onToggle} />,
    );
    click(el.querySelector('[data-testid="column-help-recency"]')!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
