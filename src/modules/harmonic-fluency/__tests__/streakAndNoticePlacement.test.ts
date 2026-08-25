/**
 * Two facts about where things are said, and one about what is left.
 *
 * =====================================================================
 * SOURCE-LEVEL, BECAUSE ALL THREE ARE ABSENCES OR TOKENS.
 *
 * "The streaks are not printed twice", "the notice uses the shared
 * amber rather than a literal", and "nothing calls the retired
 * function" are each a statement about what the source does NOT
 * contain. Rendering proves the positive case only: a second streak
 * cluster in a component the test never mounts would sail through, and
 * that is exactly where the duplicate was.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';

const SOURCES: Record<string, string> = import.meta.glob(
  '../../../**/*.{ts,tsx}',
  { eager: true, query: '?raw', import: 'default' },
);

const FILES = Object.entries(SOURCES).filter(
  ([path]) => !path.includes('__tests__') && !/\.test\.tsx?$/.test(path),
);

/**
 * One file by the tail of its path.
 *
 * Vite normalises glob keys RELATIVE to this file, so a sibling arrives
 * as `../HarmonicFluency.tsx` with no module directory in it — a suffix
 * like `harmonic-fluency/HarmonicFluency.tsx` matches nothing. Hence
 * bare filenames, and hence the uniqueness check: a suffix that matched
 * two files would silently assert about whichever came first.
 */
function read(suffix: string): string {
  const hits = FILES.filter(([path]) => path.endsWith(suffix));
  if (hits.length === 0) throw new Error(`no source found for ${suffix}`);
  if (hits.length > 1) {
    throw new Error(`${suffix} matched ${hits.length} files: ${hits.map(h => h[0]).join(', ')}`);
  }
  return hits[0][1];
}

/**
 * The file with its comments stripped.
 *
 * WHY THIS EXISTS: a comment EXPLAINING that the streak cluster was
 * removed necessarily names 🔥 and 📅, and a naive "the file does not
 * contain 🔥" would forbid the explanation along with the code. What is
 * being asserted is that nothing RENDERS them.
 *
 * Deliberately a crude stripper — it would also blank a `//` inside a
 * string literal. That is acceptable here and nowhere else: these
 * assertions are all `not.toContain`, so an over-eager strip can only
 * ever make the test more likely to pass on a file it should fail, and
 * the positive assertions below run against the unstripped source.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function code(suffix: string): string {
  return stripComments(read(suffix));
}

describe('the sweep actually reads files', () => {
  it('has the three files these assertions are about', () => {
    expect(FILES.length).toBeGreaterThan(50);
    expect(() => read('DailyGoalBar.tsx')).not.toThrow();
    expect(() => read('HarmonicFluency.tsx')).not.toThrow();
    expect(() => read('repertoire/stage.ts')).not.toThrow();
  });
});

describe('the streak figures are printed once', () => {
  it('the Today bar carries no streak glyphs', () => {
    const bar = code('DailyGoalBar.tsx');
    // Not in a render, not in a title, not anywhere: the module home's
    // calendar row owns these two numbers, with words attached.
    expect(bar).not.toContain('🔥');
    expect(bar).not.toContain('📅');
  });

  it('and computes no streak it does not show', () => {
    const bar = code('DailyGoalBar.tsx');
    expect(bar).not.toContain('computeHotStreak');
    expect(bar).not.toContain('computeDayStreak');
  });

  it('the module home still shows both, with their words', () => {
    const page = read('HarmonicFluency.tsx');
    expect(page).toContain('🔥');
    expect(page).toContain('📅');
    expect(page).toContain('correct in a row');
    expect(page).toContain('at goal');
  });

  it('the Today bar is still there, and still editable', () => {
    // What survives the removal, and why it survives mid-session: the
    // goal can be changed nowhere else.
    const page = read('HarmonicFluency.tsx');
    expect(page).toContain('<DailyGoalBar');
    const bar = read('DailyGoalBar.tsx');
    expect(bar).toContain('setPref');
    expect(bar).toContain('MAX_DAILY_GOAL');
  });
});

describe('the practice-ahead notice is visible, in a colour the app owns', () => {
  const noticeBlock = () => {
    const page = read('HarmonicFluency.tsx');
    const at = page.indexOf('data-testid="hf-practice-ahead"');
    expect(at).toBeGreaterThan(-1);
    return page.slice(at, at + 400);
  };

  it('uses the shared developing token', () => {
    const block = noticeBlock();
    expect(block).toContain('border-developing/40');
    expect(block).toContain('bg-developing/5');
  });

  it('introduces no colour literal of its own', () => {
    // A hex or an rgb() here would be a sixteenth amber that nothing
    // else could stay in step with.
    const block = noticeBlock();
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).not.toMatch(/rgba?\(/);
  });

  it('matches the notice treatment the app already had', () => {
    // `FluencyProtectionNotice` is the existing shape for "the app is
    // explaining why a drill behaved unexpectedly". Same classes, not a
    // second look at the same job.
    const existing = read('FluencyProtectionNotice.tsx');
    const block = noticeBlock();
    for (const cls of ['rounded-lg', 'border-developing/40', 'bg-developing/5', 'px-3', 'py-2', 'text-xs']) {
      expect(existing).toContain(cls);
      expect(block).toContain(cls);
    }
  });

  it('is no longer the faint muted aside it was', () => {
    expect(noticeBlock()).not.toContain('text-neutral-500 italic');
  });
});

describe('ready-to-advance is fully retired', () => {
  it('no source calls evaluateAdvancement', () => {
    // Comments stripped: `stage.ts` and `StageCriteriaPanel` both
    // explain the retirement, and naming a deleted function in prose is
    // not calling it.
    const callers = FILES
      .filter(([, src]) => stripComments(src).includes('evaluateAdvancement('))
      .map(([path]) => path);
    expect(callers).toEqual([]);
  });

  it('and stage.ts no longer exports it', () => {
    const stage = read('repertoire/stage.ts');
    expect(stage).not.toContain('export function evaluateAdvancement');
    // The sentence-builder behind it goes too — nothing renders a
    // reason any more.
    expect(stage).not.toContain('function evidenceFrom');
    expect(stage).not.toContain('interface AdvancementEvaluation');
  });

  it('the ✨ banner is gone from the song page', () => {
    const detail = read('SongDetailView.tsx');
    expect(detail).not.toContain('advancement.suggest');
    // The glyph survives only in prose explaining the removal.
    expect(detail).not.toMatch(/<span aria-hidden className="mr-1\.5">✨<\/span>/);
  });

  it('stageCriteria stays, and the panel still reads it', () => {
    // Deleting the wrapper must not take the rules with it.
    const stage = read('repertoire/stage.ts');
    expect(stage).toContain('export function stageCriteria');
    expect(read('StageCriteriaPanel.tsx')).toContain('criteria');
  });
});
