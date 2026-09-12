/**
 * "How a chord gets its name", read from the file Silas edits.
 *
 * =====================================================================
 * THE WORDS LIVE IN `docs/CHORD_NAMING_REFERENCE.md`, AND ONLY THERE.
 *
 * Signed off 12 Sep 2026. The diary's info sheet renders what this
 * module parses out of that file at build time (`?raw`, so no runtime
 * fetch and a moved file fails the build rather than the page). There
 * is no copy of a single line in the code, so changing a rule is an
 * edit to the document and nothing else.
 *
 * The parser knows only the shapes the document uses: a `#` title and
 * the paragraph under it, then `##` sections that are a numbered list
 * (the rules), a paragraph and a pipe table (a family), or a bulleted
 * list (the traps), then `---` and a closing line. Anything else
 * throws. A silently skipped line would be a rule that vanished from
 * the sheet with nothing failing.
 * =====================================================================
 */
import SOURCE from '../../../docs/CHORD_NAMING_REFERENCE.md?raw';

/** Inline text as written: `**bold**` and `` `mono` `` still marked. */
export type InlineText = string;

export type ReferenceSection =
  | { kind: 'rules'; heading: string; items: InlineText[] }
  | { kind: 'family'; heading: string; summary: InlineText; columns: string[]; rows: string[][] }
  | { kind: 'list'; heading: string; items: InlineText[] };

export interface ChordNamingReference {
  title: string;
  intro: InlineText;
  sections: ReferenceSection[];
  footnote: InlineText;
}

const cells = (line: string): string[] =>
  line.trim().split('|').slice(1, -1).map(c => c.trim());

const isTableRule = (line: string): boolean => /^\|(\s*:?-+:?\s*\|)+$/.test(line.trim());

export function parseChordNamingReference(source: string): ChordNamingReference {
  const lines = source.replace(/<!--[\s\S]*?-->/g, '').split('\n').map(l => l.trimEnd());
  const fail = (why: string): never => {
    throw new Error(`CHORD_NAMING_REFERENCE.md: ${why}`);
  };

  let title: string | null = null;
  let intro: string | null = null;
  let footnote: string | null = null;
  const sections: ReferenceSection[] = [];

  // Blocks under the heading currently being read.
  let heading: string | null = null;
  let paragraphs: string[] = [];
  let ordered: string[] = [];
  let bullets: string[] = [];
  let table: string[][] = [];
  let afterRule = false;

  const closeSection = () => {
    if (heading === null) return;
    if (table.length > 0) {
      if (paragraphs.length !== 1 || ordered.length || bullets.length) {
        fail(`"${heading}" should be one paragraph and a table`);
      }
      const [columns, ...rows] = table;
      for (const row of rows) {
        if (row.length !== columns.length) fail(`a row under "${heading}" has ${row.length} cells, not ${columns.length}`);
      }
      sections.push({ kind: 'family', heading, summary: paragraphs[0], columns, rows });
    } else if (ordered.length > 0) {
      if (paragraphs.length || bullets.length) fail(`"${heading}" should be a numbered list only`);
      sections.push({ kind: 'rules', heading, items: ordered });
    } else if (bullets.length > 0) {
      if (paragraphs.length) fail(`"${heading}" should be a bulleted list only`);
      sections.push({ kind: 'list', heading, items: bullets });
    } else {
      fail(`"${heading}" has nothing under it`);
    }
    heading = null;
    paragraphs = []; ordered = []; bullets = []; table = [];
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    if (afterRule) {
      if (footnote !== null) fail('only one line may follow ---');
      footnote = t;
    } else if (t.startsWith('# ')) {
      if (title !== null) fail('more than one # title');
      title = t.slice(2).trim();
    } else if (t.startsWith('## ')) {
      closeSection();
      heading = t.slice(3).trim();
    } else if (t === '---') {
      closeSection();
      afterRule = true;
    } else if (heading === null) {
      if (title === null) fail(`text before the title: "${t}"`);
      if (intro !== null) fail('the title takes one paragraph');
      intro = t;
    } else if (t.startsWith('|')) {
      if (!isTableRule(t)) table.push(cells(t));
    } else if (/^\d+\.\s/.test(t)) {
      ordered.push(t.replace(/^\d+\.\s+/, ''));
    } else if (t.startsWith('- ')) {
      bullets.push(t.slice(2).trim());
    } else {
      paragraphs.push(t);
    }
  }
  closeSection();

  if (title === null) fail('no # title');
  if (intro === null) fail('no paragraph under the title');
  if (footnote === null) fail('no closing line after ---');
  return { title: title!, intro: intro!, sections, footnote: footnote! };
}

export const CHORD_NAMING_REFERENCE: ChordNamingReference = parseChordNamingReference(SOURCE);

/** The document as it sits on disk, for tests that count against it. */
export const CHORD_NAMING_REFERENCE_SOURCE: string = SOURCE;
