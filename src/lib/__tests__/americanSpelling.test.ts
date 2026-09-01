/**
 * The app says "practice", never "practise".
 *
 * =====================================================================
 * A SOURCE SWEEP, BECAUSE WHAT IT PINS IS AN ABSENCE.
 *
 * "No screen says practised" is a statement about what the app does NOT
 * contain, and rendering proves only the positive case: a line written
 * next month in the British form would sail past every behavioural test
 * in the repo, and nobody would notice until Silas read it.
 *
 * American English uses "practice" for both the noun and the verb, so
 * there is no case where the other spelling is correct in what a person
 * reads.
 *
 * =====================================================================
 * WHAT IT DOES NOT TOUCH, AND WHY IT CANNOT.
 *
 * The ruling is about what a person READS. Variables, functions, types,
 * test ids and stored keys are not read by anyone using the app, and
 * renaming a stored key is a stored-shape change — a different decision
 * with a migration behind it. So identifiers keep whatever they were
 * called, and they are listed rather than pattern-matched: a bare
 * "allow anything that looks like camelCase" would let
 * `const practisedLabel = 'last practised'` through.
 *
 * COMMENTS ARE STRIPPED BEFORE THE SEARCH. Prose about the code is not
 * prose in the app, and rewriting a few hundred of them would bury the
 * change that matters.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('../../**/*.{ts,tsx}', {
  eager: true, query: '?raw', import: 'default',
}) as Record<string, string>;

/**
 * Identifiers carrying the British spelling, left alone on purpose.
 *
 * Every one of these is a name in the code. None is read by anyone
 * using the app.
 */
const ALLOWED_IDENTIFIERS: ReadonlyArray<string> = [
  // A `FilterSpec` field, encoded into the URL as `stale` — so the name
  // itself never reaches storage or the screen.
  'notPractisedInDays',
  // Exported helper in `practiceDays`.
  'practisedDayKeys',
  // The song row's own field name and the label derived from it.
  'lastPractisedAt',
  'lastPractisedLabel',
  // Local state and a local formatter.
  'hasEverPractised',
  'practisedLine',
  // A key on the tile-label record.
  'lastPractised',
];

/**
 * Test ids, which the ruling explicitly excludes. They are selectors,
 * not sentences.
 */
const ALLOWED_TEST_IDS: ReadonlyArray<string> = [
  'summary-tile-last-practised',
  'song-card-last-practised',
];

/** Source with comments blanked, so prose about the code is not
 *  mistaken for prose in the app. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let inBlock = false;
  let inLine = false;
  let inString: string | null = null;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1] ?? '';
    if (inBlock) {
      if (c === '*' && next === '/') { inBlock = false; i += 2; out += '  '; continue; }
      out += c === '\n' ? '\n' : ' '; i += 1; continue;
    }
    if (inLine) {
      if (c === '\n') { inLine = false; out += '\n'; } else { out += ' '; }
      i += 1; continue;
    }
    if (inString !== null) {
      out += c;
      if (c === '\\') { out += next; i += 2; continue; }
      if (c === inString) inString = null;
      i += 1; continue;
    }
    if (c === '/' && next === '*') { inBlock = true; i += 2; out += '  '; continue; }
    if (c === '/' && next === '/') { inLine = true; i += 2; out += '  '; continue; }
    if (c === '"' || c === "'" || c === '`') inString = c;
    out += c; i += 1;
  }
  return out;
}

/** Every whole word around a `practis` stem, outside comments. */
function britishWords(src: string): string[] {
  const stripped = stripComments(src);
  const out: string[] = [];
  for (const match of stripped.matchAll(/[A-Za-z-]*practis[A-Za-z-]*/gi)) {
    out.push(match[0]);
  }
  return out;
}

/**
 * The one string left in the British form, and why it is not mine to
 * change.
 *
 * `seedSongs` writes its descriptions into `db.songs`. That text is a
 * STORED VALUE, not display text: it is already sitting in Silas's
 * database in the British form on every device that has ever seeded,
 * and rewriting the source would only change what a fresh install gets
 * — leaving two versions of one song row to sync against each other.
 * Flagged in the report and awaiting a ruling.
 *
 * Held as a file with a reason rather than waved through, and asserted
 * to still be needed below, so it cannot outlive the problem.
 */
const STORED_VALUES: Readonly<Record<string, string>> = {
  'modules/repertoire/seedSongs.ts':
    'A seed song description, written into db.songs. Changing it is a '
    + 'stored-value change, which the ruling explicitly excluded.',
};

const ALLOWED = new Set<string>([...ALLOWED_IDENTIFIERS, ...ALLOWED_TEST_IDS]);

/** A test file, wherever the glob's relative key happens to start. */
function isTestFile(key: string): boolean {
  return key.includes('__tests__') || /\.test\.tsx?$/.test(key);
}

describe('user-facing text is American', () => {
  it('reads its own source', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(200);
  });

  it('says practice, practiced, practicing — never the British forms', () => {
    const offenders: string[] = [];
    for (const [key, src] of Object.entries(SOURCES)) {
      // Test names are prose about the app, not prose in it.
      if (isTestFile(key)) continue;
      const file = key.replace('../../', '');
      if (file in STORED_VALUES) continue;
      for (const word of britishWords(src)) {
        if (!ALLOWED.has(word)) offenders.push(`${file}: ${word}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('lists every exception as a name, never as a pattern', () => {
    // A rule like "anything camelCase is fine" would let
    // `const practisedLabel = 'last practised'` straight through.
    for (const name of [...ALLOWED_IDENTIFIERS, ...ALLOWED_TEST_IDS]) {
      expect(name.toLowerCase(), name).toContain('practis');
      expect(name, name).not.toBe('practised');
      expect(name, name).not.toBe('practise');
      expect(name, name).not.toBe('practising');
    }
  });

  it('still needs the one stored-value exception it grants', () => {
    // The day that string is ruled on and changed, this fails and the
    // exception comes out with it.
    for (const [file, reason] of Object.entries(STORED_VALUES)) {
      const src = SOURCES[`../../${file}`];
      expect(src, file).toBeTypeOf('string');
      expect(britishWords(src).length, `${file} — ${reason}`).toBeGreaterThan(0);
    }
  });

  it('has the labels a reader actually sees in the American form', () => {
    // The positive half, in case a file is ever excluded from the sweep
    // by accident.
    const named: ReadonlyArray<[string, string]> = [
      ['modules/shapes-and-patterns/summaryTiles.ts', "'Last practiced'"],
      ['modules/dashboard/mobile/ModuleCards.tsx', "'never practiced'"],
      ['modules/skills/SkillDetailPanel.tsx', 'Practice This Skill'],
      ['modules/repertoire/LeadSheetPracticeNudge.tsx', 'Start Practicing'],
      ['modules/harmonic-diary/DiaryEntryCard.tsx', 'Practice This'],
    ];
    for (const [file, text] of named) {
      const src = SOURCES[`../../${file}`];
      expect(src, file).toBeTypeOf('string');
      expect(src, `${file} — ${text}`).toContain(text);
    }
  });
});
