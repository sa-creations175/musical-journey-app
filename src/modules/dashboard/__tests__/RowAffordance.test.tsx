// @vitest-environment jsdom
/**
 * The row explanation, rendered.
 *
 * The pure layer is tested in `read/__tests__/affordances.test.ts`.
 * What is left to guard here is that all three parts REACH the screen,
 * that an inherited description is marked as inherited rather than
 * passing as the item's own, and that the notes section is absent —
 * genuinely absent, not empty-and-headed — where there is nothing odd
 * to say.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import RowAffordance, { RowInfoButton } from '../RowAffordance';
import { assembleDashboard, type DashboardSource } from '../read/load';
import { leavesOf, type TreeNode } from '../read/tree';
import {
  advanceHintFor,
  rowNotesFor,
  skillDescriptionFor,
} from '../read/affordances';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const NOW = 1_700_000_000_000;

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

const EMPTY: DashboardSource = {
  attempts: [], drillSessions: [], drillSkills: [], spacingRows: [],
  lessons: [], lessonSessions: [],
  repertoire: {
    songs: [], sections: [], keys: [], cells: [], runThroughs: [], practiceLogs: [],
  },
};

const DASHBOARD = assembleDashboard(EMPTY, NOW);

function moduleRoot(moduleId: string): TreeNode {
  return DASHBOARD.modules.find(m => m.moduleId === moduleId)!.root;
}

const NOTATION_SHAPES = moduleRoot('reading').children
  .find(c => c.label === 'Notation Shapes')!;
const MENTAL_VIZ = moduleRoot('shapes-and-patterns').children
  .find(c => c.label === 'Mental Visualisation')!;

function panel(el: HTMLElement): HTMLElement {
  const node = el.querySelector('[data-testid="row-affordance"]') as HTMLElement;
  expect(node).not.toBeNull();
  return node;
}

describe('all three parts reach the screen', () => {
  it('renders the skill, the hint and — where there is one — nothing else', () => {
    const el = render(<RowAffordance node={NOTATION_SHAPES} moduleId="reading" />);
    const text = panel(el).textContent!;
    expect(text).toContain(skillDescriptionFor(NOTATION_SHAPES, 'reading')!.text);
    expect(text).toContain(advanceHintFor(NOTATION_SHAPES, 'reading'));
    expect(text).toContain('what this trains');
    expect(text).toContain('what would advance it');
  });

  it('puts what it trains BEFORE what would advance it', () => {
    // The other two are meaningless without it. A row that cannot say
    // what it trains is a number with no subject.
    const el = render(<RowAffordance node={NOTATION_SHAPES} moduleId="reading" />);
    const text = panel(el).textContent!;
    expect(text.indexOf('what this trains'))
      .toBeLessThan(text.indexOf('what would advance it'));
  });

  it('omits the notes section entirely on an ordinary row', () => {
    // Absent, not empty-and-headed. A heading over nothing reads as
    // something failing to load.
    expect(rowNotesFor(NOTATION_SHAPES, 'reading')).toEqual([]);
    const el = render(<RowAffordance node={NOTATION_SHAPES} moduleId="reading" />);
    expect(panel(el).querySelector('[data-testid="row-notes"]')).toBeNull();
    expect(panel(el).textContent).not.toContain('about these numbers');
  });

  it('renders every note where there are some', () => {
    const notes = rowNotesFor(MENTAL_VIZ, 'shapes-and-patterns');
    // Guard the guard: the row above and this one must genuinely
    // differ, or "omits the notes section" proves nothing.
    expect(notes.length).toBeGreaterThan(1);
    const el = render(
      <RowAffordance node={MENTAL_VIZ} moduleId="shapes-and-patterns" />,
    );
    const list = panel(el).querySelector('[data-testid="row-notes"]')!;
    expect(list.querySelectorAll('li')).toHaveLength(notes.length);
    for (const note of notes) expect(list.textContent).toContain(note);
  });

  it('passes the note context through rather than dropping it', () => {
    const progressions = moduleRoot('ear-training').children
      .find(c => c.label === 'Chord Progressions')!;
    const without = render(
      <RowAffordance node={progressions} moduleId="ear-training" />,
    );
    expect(panel(without).textContent).not.toContain('predate');
    act(() => root!.unmount()); container!.remove();

    const withCount = render(
      <RowAffordance
        node={progressions}
        moduleId="ear-training"
        noteContext={{ ungroupableProgressionAttempts: 7 }}
      />,
    );
    expect(panel(withCount).textContent).toContain('7 stored attempts');
  });
});

describe('an inherited description is marked as inherited', () => {
  it('names the row it came from', () => {
    const item = leavesOf(NOTATION_SHAPES)[0];
    const el = render(<RowAffordance node={item} moduleId="reading" />);
    const badge = panel(el).querySelector('[data-testid="inherited-from"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('Notation Shapes');
  });

  it('shows no badge on the row the description was written for', () => {
    // Otherwise the badge means nothing — it has to distinguish.
    const el = render(<RowAffordance node={NOTATION_SHAPES} moduleId="reading" />);
    expect(panel(el).querySelector('[data-testid="inherited-from"]')).toBeNull();
  });
});

describe('the i button', () => {
  it('reports its state and names the row it explains', () => {
    const el = render(
      <RowInfoButton label="Notation Shapes" open={false} onToggle={() => {}} />,
    );
    const button = el.querySelector('[data-testid="row-info-toggle"]')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    // The label carries the row, because "i" alone is every row's
    // button read aloud identically.
    expect(button.getAttribute('aria-label')).toContain('Notation Shapes');
  });

  it('toggles on a real click', () => {
    const onToggle = vi.fn();
    const el = render(
      <RowInfoButton label="Intervals" open={false} onToggle={onToggle} />,
    );
    act(() => {
      el.querySelector('[data-testid="row-info-toggle"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
