/**
 * Nav labels, and the mark that sits with them.
 *
 * Source-level: jsdom resolves no boxes, so whether a label WRAPS at
 * 9rem cannot be observed there. What can be pinned is that nothing
 * declares it must not — `whitespace-nowrap` on a row inside a clipped
 * box is the same defect as spilling, just quieter, because the ends of
 * words disappear instead.
 */
import { describe, expect, it } from 'vitest';

const SOURCE: string = (
  import.meta.glob('../SidebarNav.tsx', { eager: true, query: '?raw', import: 'default' }) as
    Record<string, string>
)['../SidebarNav.tsx'];

describe('labels wrap rather than spill', () => {
  it('no nav row forbids wrapping', () => {
    expect(SOURCE).not.toContain('whitespace-nowrap');
  });

  it('every nav row may be narrower than its longest word', () => {
    // `min-w-0` on the flex rows — without it a row is floored by its
    // own content and the sidebar cannot reach a narrow width.
    const rows = SOURCE.match(/rounded-(?:lg|md) text-/g) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect((SOURCE.match(/min-w-0/g) ?? []).length).toBeGreaterThanOrEqual(rows.length);
  });
});

describe('the disclosure mark', () => {
  it('is one component, used by both row kinds', () => {
    expect(SOURCE).toContain('function DisclosureMark');
    expect((SOURCE.match(/<DisclosureMark/g) ?? [])).toHaveLength(2);
  });

  it('sits in the text flow after the label, with a small fixed gap', () => {
    // `inline-block` and a margin rather than a position: that is what
    // makes it follow the last word onto a second line when a label
    // wraps, instead of hanging at the box's right edge.
    const mark = SOURCE.slice(SOURCE.indexOf('function DisclosureMark'));
    expect(mark).toContain('inline-block');
    expect(mark).toContain('ml-1');
    expect(mark).not.toContain('absolute');
    expect(mark).not.toContain('ml-auto');
  });

  it('is lighter and smaller than the label it follows', () => {
    const mark = SOURCE.slice(SOURCE.indexOf('function DisclosureMark'));
    // Lighter: a muted colour at reduced opacity, not the label's ink.
    expect(mark).toContain('text-neutral-400/70');
    // Smaller: the sizes passed in are under the label's own text size.
    expect(SOURCE).toContain('<DisclosureMark open={isOpen} size={8} />');
    expect(SOURCE).toContain('size={7}');
  });

  it('is not a button any more', () => {
    // Pressing the name opens the group, so the mark lives inside that
    // control — and a button inside a link is invalid markup.
    expect(SOURCE).not.toContain('collapse ${item.label}');
    expect(SOURCE).not.toContain('collapse ${nested.label}');
  });
});

describe('the name opens the group', () => {
  it('toggles from the module row itself', () => {
    // The toggle and the expanded state are declared on the NAME
    // itself, a few lines before its testid.
    const start = SOURCE.indexOf('onClick={() => onToggle(item.id)}');
    expect(start).toBeGreaterThan(-1);
    const row = SOURCE.slice(start, start + 300);
    expect(row).toContain('aria-expanded={isOpen}');
    expect(row).toContain('data-testid="module-nav-name"');
  });

  it('toggles from a nested row through the same one control', () => {
    expect(SOURCE).toContain('onPress={() => onToggle(nested.id)}');
    expect(SOURCE).toContain('disclosureOpen={isOpen}');
  });

  it('only where there are children to open', () => {
    // A leaf row passes neither, so it gets no mark and no toggle.
    expect(SOURCE).toContain('if (!hasChildren) {');
    expect(SOURCE).toContain("disclosureOpen !== undefined && <DisclosureMark");
  });
});
