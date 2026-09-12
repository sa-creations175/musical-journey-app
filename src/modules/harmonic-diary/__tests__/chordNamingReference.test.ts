/**
 * The chord naming reference is a file, and the file has a shape.
 *
 * =====================================================================
 * THE COUNTS COME FROM THE DOCUMENT, NOT FROM HERE.
 *
 * `docs/CHORD_NAMING_REFERENCE.md` is what Silas signed off on 12 Sep
 * 2026 and what he will edit. A test that restated its rows would be a
 * second copy that has to be edited in step, so nothing below names a
 * chord. What it holds is the frame: four family tables with the five
 * columns the reference was walked with, in that order.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  CHORD_NAMING_REFERENCE,
  CHORD_NAMING_REFERENCE_SOURCE,
  parseChordNamingReference,
} from '../chordNamingReference';

const COLUMNS = ['Name', 'Must be in it', 'Named by', 'Your choice', 'Example in C'];

describe('the reference file', () => {
  it('parses to four tables, each with the signed-off columns', () => {
    const families = CHORD_NAMING_REFERENCE.sections.filter(s => s.kind === 'family');
    expect(families).toHaveLength(4);
    for (const f of families) {
      expect(f.columns, f.heading).toEqual(COLUMNS);
      expect(f.rows.length, f.heading).toBeGreaterThan(0);
    }
  });

  it('reads rules, then the families, then the traps', () => {
    expect(CHORD_NAMING_REFERENCE.sections.map(s => s.kind))
      .toEqual(['rules', 'family', 'family', 'family', 'family', 'list']);
  });

  it('keeps every table row the file holds', () => {
    // Counted off the raw text: pipe lines, less each table's header
    // and its |---| rule.
    const pipeLines = CHORD_NAMING_REFERENCE_SOURCE.split('\n')
      .filter(l => l.trim().startsWith('|'));
    const rules = pipeLines.filter(l => /^\|[\s|:-]+\|$/.test(l.trim()));
    const parsed = CHORD_NAMING_REFERENCE.sections
      .reduce((n, s) => n + (s.kind === 'family' ? s.rows.length : 0), 0);
    expect(parsed).toBe(pipeLines.length - rules.length * 2);
  });

  it('has no em dash anywhere a reader sees', () => {
    const shown = CHORD_NAMING_REFERENCE_SOURCE.replace(/<!--[\s\S]*?-->/g, '');
    expect(shown).not.toContain('—');
  });

  it('refuses a line it does not recognise rather than dropping it', () => {
    // A rule that silently fell out of the sheet would fail nothing.
    const broken = CHORD_NAMING_REFERENCE_SOURCE.replace(
      '| Name | Must be in it |',
      'A stray line\n\n| Name | Must be in it |',
    );
    expect(() => parseChordNamingReference(broken)).toThrow(/one paragraph and a table/);
  });
});
