/**
 * Bands and cell text.
 *
 * The failures worth guarding are the ones where a missing value gets
 * painted as a present one: an ungraded row coloured red as though it
 * failed, a 0% that cannot be told from "never opened", a "never" that
 * renders as 0 days and claims you practised today.
 */
import { describe, expect, it } from 'vitest';
import { FLUENCY_POOL_RULE } from '../../../lib/fluencyPool';
import {
  ACCURACY_LEGEND,
  COLUMN_RULES,
  COLUMN_TOPIC_TITLE,
  FLUENCY_LEGEND,
  NO_VALUE,
  bandFor,
  formatCoverage,
  formatRecency,
  formatScore,
  legendFor,
  scoreColumnLabel,
  SELF_EVIDENT_RULE_MAX,
  TOPICS_USING_TREE_VOCABULARY,
  TREE_VOCABULARY,
  type ColumnTopic,
} from '../bands';
import { FEEL_OPTIONS, fluencyValue } from '../../../lib/fluencyScale';

describe('accuracy bands', () => {
  it('places each cut-off on the right side', () => {
    const cases: Array<[number, string]> = [
      [0, 'red'], [49, 'red'], [49.9, 'red'],
      [50, 'amber'], [69, 'amber'], [69.9, 'amber'],
      [70, 'yellow-green'], [84, 'yellow-green'], [84.9, 'yellow-green'],
      [85, 'green'], [100, 'green'],
    ];
    for (const [score, band] of cases) {
      expect(bandFor(score, 'measured'), `${score}`).toBe(band);
    }
  });

  it('makes green reachable without perfection', () => {
    // 85 rather than 100: demanding perfect accuracy makes the top
    // band unreachable, and 85+ is the practical "this holds up".
    expect(bandFor(85, 'measured')).toBe('green');
    expect(bandFor(99, 'measured')).toBe('green');
  });
});

describe('fluency bands', () => {
  it('gives each of the four ratings its own band', () => {
    expect(bandFor(25, 'self-rated')).toBe('red');
    expect(bandFor(50, 'self-rated')).toBe('amber');
    expect(bandFor(75, 'self-rated')).toBe('yellow-green');
    expect(bandFor(100, 'self-rated')).toBe('green');
  });

  it('covers every value the scale can actually produce', () => {
    // Read off the scale rather than retyped, so a change to
    // fluencyScale.ts cannot leave a rating with no band.
    for (const option of FEEL_OPTIONS) {
      expect(bandFor(fluencyValue(option.feel), 'self-rated'), option.label)
        .not.toBeNull();
    }
  });

  it('rounds a rolled-up average DOWN to the rating it has earned', () => {
    // A parent shows the highest rating it has actually reached. You
    // reach a threshold, you are not rounded up into it — a mix of 50s
    // and 75s reads 50 until the average genuinely reaches 75.
    expect(bandFor(62.5, 'self-rated')).toBe('amber');
    expect(bandFor(74.9, 'self-rated')).toBe('amber');
    expect(bandFor(75, 'self-rated')).toBe('yellow-green');
    expect(bandFor(87.5, 'self-rated')).toBe('yellow-green');
    expect(bandFor(99.9, 'self-rated')).toBe('yellow-green');
    expect(bandFor(100, 'self-rated')).toBe('green');
  });

  it('never flatters a parent whose children are split', () => {
    // Three children comfortable and one struggling averages 62.5. The
    // parent has a way to go and must not read as comfortable.
    const average = (75 + 75 + 75 + 25) / 4;
    expect(average).toBe(62.5);
    expect(bandFor(average, 'self-rated')).toBe('amber');
  });

  it('lands on the lowest rung below the scale rather than off it', () => {
    expect(bandFor(10, 'self-rated')).toBe('red');
    expect(bandFor(0, 'self-rated')).toBe('red');
  });

  it('bands the same number differently from accuracy', () => {
    // The whole reason there are two legends. 70 is yellow-green
    // measured and amber self-rated.
    expect(bandFor(70, 'measured')).toBe('yellow-green');
    expect(bandFor(70, 'self-rated')).toBe('amber');
    expect(bandFor(60, 'measured')).toBe('amber');
    expect(bandFor(40, 'measured')).toBe('red');
    expect(bandFor(40, 'self-rated')).toBe('red');
  });
});

describe('an ungraded row gets no band at all', () => {
  it('returns null rather than red', () => {
    // Red would say it failed; green would say it holds up. It gets
    // neither, because it has no signal.
    expect(bandFor(null, 'measured')).toBeNull();
    expect(bandFor(null, 'self-rated')).toBeNull();
  });

  it('renders as a dash, not a zero', () => {
    expect(formatScore(null)).toBe(NO_VALUE);
    expect(formatScore(0)).toBe('0%');
    expect(formatScore(null)).not.toBe('0%');
  });
});

describe('legends', () => {
  it('are two, not one combined', () => {
    expect(legendFor('measured')).toBe(ACCURACY_LEGEND);
    expect(legendFor('self-rated')).toBe(FLUENCY_LEGEND);
    expect(ACCURACY_LEGEND).not.toEqual(FLUENCY_LEGEND);
  });

  it('share the four colours and differ in what they say', () => {
    expect(ACCURACY_LEGEND.map(e => e.band)).toEqual(FLUENCY_LEGEND.map(e => e.band));
    expect(ACCURACY_LEGEND.map(e => e.label)).not.toEqual(FLUENCY_LEGEND.map(e => e.label));
  });

  it('names fluency bands off the rating scale, so they cannot drift', () => {
    expect(FLUENCY_LEGEND.map(e => e.label))
      .toEqual(FEEL_OPTIONS.map(o => o.label));
  });

  it('labels the column by what it means', () => {
    expect(scoreColumnLabel('measured')).toBe('accuracy');
    expect(scoreColumnLabel('self-rated')).toBe('fluency');
  });

  it('states accuracy cut-offs that bandFor actually uses', () => {
    // THE FAILURE THIS PREVENTS. A legend naming a threshold the band
    // function does not use is worse than no legend: it is a confident,
    // WRONG account of a colour the reader can see for themselves.
    //
    // Asserted at both edges, because "85 is green" alone passes even if
    // 84 is green too — which would make the stated boundary fiction.
    expect(ACCURACY_LEGEND.map(e => e.label))
      .toEqual(['below 50%', '50–69%', '70–84%', '85%+']);
    for (const entry of ACCURACY_LEGEND) {
      expect(bandFor(entry.value, 'measured'), entry.label).toBe(entry.band);
      if (entry.value > 0) {
        expect(bandFor(entry.value - 1, 'measured'), entry.label).not.toBe(entry.band);
      }
    }
  });

  it('states fluency values that bandFor actually uses', () => {
    expect(FLUENCY_LEGEND.map(e => e.value)).toEqual(FEEL_OPTIONS.map(o => o.value));
    for (const entry of FLUENCY_LEGEND) {
      expect(bandFor(entry.value, 'self-rated'), entry.label).toBe(entry.band);
    }
  });

  it('reads the round-DOWN rule the same way the legend implies', () => {
    // A parent lands between rungs. 62.5 sits between working on it and
    // comfortable and reads working on it — you reach a threshold, you
    // are not rounded up into it.
    expect(bandFor(62.5, 'self-rated')).toBe(bandFor(50, 'self-rated'));
    expect(bandFor(62.5, 'self-rated')).not.toBe(bandFor(75, 'self-rated'));
  });
});

describe('column rules — what each one says, and that it says why', () => {
  const topics: ColumnTopic[] = ['score', 'coverage', 'recency', 'due'];

  it('covers all four topics, none of them empty', () => {
    for (const topic of topics) {
      expect(COLUMN_RULES[topic].length, topic).toBeGreaterThan(0);
      expect(COLUMN_TOPIC_TITLE[topic], topic).toBeTruthy();
    }
  });

  it('drops a reason only from a rule short enough to carry itself', () => {
    // A rule stated alone usually reads as an arbitrary constraint, and
    // the first instinct on meeting an unexpected number is that the
    // screen is broken. The exception is a rule that is self-evident —
    // "an item you have never practised reads never" — where an
    // explanation draws attention to a question nobody asked.
    //
    // The length cap is what stops that being an excuse: you cannot
    // quietly drop the reason from a rule that is doing real work.
    for (const topic of topics) {
      for (const { rule, why } of COLUMN_RULES[topic]) {
        expect(rule, topic).toBeTruthy();
        if (why === undefined) {
          expect(rule.length, `unexplained and too long: ${rule}`)
            .toBeLessThanOrEqual(SELF_EVIDENT_RULE_MAX);
          continue;
        }
        // Long enough to be an explanation rather than a restatement.
        expect(why.length, rule).toBeGreaterThan(40);
        expect(why, rule).not.toBe(rule);
      }
    }
  });

  it('leaves almost every rule explained', () => {
    // Guard the guard: the exception above is worthless if it becomes
    // the norm, and every assertion in this block would pass on a set
    // of rules that explained none of themselves.
    const all = topics.flatMap(t => COLUMN_RULES[t]);
    const unexplained = all.filter(r => r.why === undefined);
    expect(unexplained.length).toBeGreaterThan(0);
    expect(unexplained.length).toBeLessThan(all.length / 4);
  });

  it('names the rules the design doc ships as a requirement', () => {
    // The list in DASHBOARD_REDESIGN_DESIGN.md's Legibility requirement.
    // Matched on the load-bearing NUMBER or phrase rather than whole
    // sentences, so a writing pass does not fail this but dropping a
    // RULE does.
    const said = (topic: ColumnTopic) =>
      COLUMN_RULES[topic].map(r => `${r.rule} ${r.why ?? ''}`).join(' ');
    expect(said('score')).toContain('last 20 attempts');
    // The rule is stated in one place and rendered by three surfaces,
    // so the assertion names the source rather than a copy of it.
    expect(said('score')).toContain(FLUENCY_POOL_RULE);
    expect(said('score')).toMatch(/rating its average has actually reached/);
    expect(said('coverage')).toContain('3 or more');
    expect(said('coverage')).toContain('full skill catalog');
    expect(said('coverage')).toContain('tried it (75)');
    // Both numbers named, and tied to the word the sort control uses.
    expect(said('recency')).toContain('12d / 61d');
    expect(said('recency')).toContain('stalest');
    expect(said('recency')).toContain('never');
    expect(said('due')).toContain('not a deadline');
  });
});

describe('the copy obeys its own writing rules', () => {
  const topics: ColumnTopic[] = ['score', 'coverage', 'recency', 'due'];
  const everything = topics.flatMap(
    t => COLUMN_RULES[t].map(r => `${r.rule} ${r.why ?? ''}`),
  );

  it('uses no structural word it has not defined', () => {
    // "Parent", "child", "branch", "leaf", "descendant" are the tree's
    // own words rather than the reader's, and they were being used
    // interchangeably. Exactly two are used, and both are defined in
    // TREE_VOCABULARY above the rules.
    // `leaves` is deliberately absent: it is far more often the verb
    // ("the score leaves it out") than the tree's noun, and a guard
    // that fires on ordinary English gets weakened rather than obeyed.
    // `leaf` singular is the jargon worth catching.
    const undefinedTerms = /\b(parent|child|children|branch|branches|leaf|descendant|descendants)\b/i;
    for (const text of everything) {
      expect(text, text.slice(0, 60)).not.toMatch(undefinedTerms);
    }
    expect(TREE_VOCABULARY.map(v => v.term)).toEqual(['group row', 'item row']);
  });

  it('defines the vocabulary on exactly the panels that use it', () => {
    for (const topic of topics) {
      const usesIt = COLUMN_RULES[topic].some(
        r => /\b(group row|item row)\b/.test(`${r.rule} ${r.why ?? ''}`),
      );
      expect(TOPICS_USING_TREE_VOCABULARY.has(topic), topic).toBe(usesIt);
    }
    // Guard the guard: this passes vacuously if no panel uses the terms
    // or if every panel does.
    expect(TOPICS_USING_TREE_VOCABULARY.size).toBeGreaterThan(0);
    expect(TOPICS_USING_TREE_VOCABULARY.size).toBeLessThan(topics.length);
  });

  it('gives a rating its number every time it names one', () => {
    // A rule leaning on another rule has to point at it. "Comfortable"
    // three inches under a key that reads "comfortable 75" is still
    // asking the reader to make the connection themselves.
    for (const text of everything) {
      for (const option of FEEL_OPTIONS) {
        if (!text.includes(option.label)) continue;
        expect(text, `${option.label} without its number`)
          .toContain(`${option.label} (${option.value})`);
      }
    }
    // Guard the guard: at least one rule genuinely names a rating.
    expect(everything.some(t => t.includes('comfortable (75)'))).toBe(true);
  });

  it('reserves the em-dash for the rule/reason boundary', () => {
    // FOUND BY READING THE RENDERED COPY BACK AS PLAIN TEXT, which no
    // assertion here would have caught. The panel joins a rule to its
    // reason with " — ", and several rules and reasons used em-dashes
    // internally too, so the one boundary that matters was invisible
    // among three that did not. Colons, commas and full stops do the
    // internal work now.
    for (const text of [
      ...everything,
      ...TREE_VOCABULARY.map(v => `${v.term} ${v.meaning}`),
    ]) {
      expect(text, text.slice(0, 60)).not.toContain('—');
    }
  });

  it('points every cross-reference at a rule that exists', () => {
    // A pointer at nothing is worse than none, the same way an
    // `aria-controls` naming a missing id is: it is a confident claim
    // that something is explained elsewhere.
    let found = 0;
    for (const topic of topics) {
      const rules = COLUMN_RULES[topic];
      for (const { rule, why, reference } of rules) {
        if (reference === undefined) continue;
        found += 1;
        // Present in its own text, or the renderer marks nothing.
        expect(`${rule} ${why ?? ''}`, reference).toContain(reference);
        // And genuinely used by ANOTHER rule on the same panel — the
        // half that makes it a reference rather than a phrase.
        const elsewhere = rules.filter(
          r => r.rule !== rule
            && `${r.rule} ${r.why ?? ''}`.toLowerCase().includes(reference.toLowerCase()),
        );
        expect(elsewhere.length, `"${reference}" names no other rule in ${topic}`)
          .toBeGreaterThan(0);
      }
    }
    // Guard the guard: passes vacuously if nothing references anything.
    expect(found).toBeGreaterThan(0);
  });

  it('explains rather than defends', () => {
    // THE REFRAME, and the same guard the row copy carries. The first
    // version of this panel argued against alternatives nobody
    // proposed: "most recent alone flatters", "showing it as 0 would
    // say you practised today". That is the author's reasoning from the
    // design session, written as though the reader shares the context.
    //
    // The tell is a counterfactual, which is mechanical enough to
    // catch. Whether a sentence actually reads as help is not.
    const counterfactual =
      /\bwould (make|let|mean|produce|read|reverse|be|have|leave|put|give)\b/i;
    for (const text of everything) {
      expect(text, text.slice(0, 70)).not.toMatch(counterfactual);
    }
    for (const text of everything) {
      expect(text, text.slice(0, 70))
        .not.toMatch(/\b(deliberately|on purpose|by design)\b/i);
    }
  });

  it('cites nothing the screen does not show', () => {
    // "A lifetime average never moves" asked the reader to picture a
    // figure this screen has never displayed.
    for (const text of everything) {
      expect(text, text.slice(0, 60)).not.toMatch(/lifetime average/i);
    }
  });
});

describe('coverage cell', () => {
  it('tells "worked on" from "never opened" at 0%', () => {
    // THE FAILURE THIS PREVENTS: both read 0%, and without the count
    // real practice looks like neglect.
    const workedOn = formatCoverage({
      isLeaf: false, coveredItems: 0, totalItems: 40, engagementCount: 24,
    });
    const neverOpened = formatCoverage({
      isLeaf: false, coveredItems: 0, totalItems: 40, engagementCount: 0,
    });
    expect(workedOn).toBe('0% · 24 attempts');
    expect(neverOpened).toBe('0% · no attempts');
    expect(workedOn).not.toBe(neverOpened);
  });

  it('shows the count only on an item row', () => {
    // "5 attempts" tells you more than "covered", and 5 sits
    // differently from 47.
    expect(formatCoverage({
      isLeaf: true, coveredItems: 1, totalItems: 1, engagementCount: 5,
    })).toBe('5 attempts');
    expect(formatCoverage({
      isLeaf: true, coveredItems: 0, totalItems: 1, engagementCount: 1,
    })).toBe('1 attempt');
  });

  it('rounds the percentage and keeps the raw count exact', () => {
    expect(formatCoverage({
      isLeaf: false, coveredItems: 28, totalItems: 63, engagementCount: 63,
    })).toBe('44% · 63 attempts');
  });

  it('does not divide by zero on an empty node', () => {
    expect(formatCoverage({
      isLeaf: false, coveredItems: 0, totalItems: 0, engagementCount: 0,
    })).toBe('no attempts');
  });
});

describe('recency cell', () => {
  it('shows one number on an item and two on a parent', () => {
    expect(formatRecency({
      isLeaf: true, mostRecentDays: 12, stalestDays: 12, hasUntouched: false,
    })).toBe('12d');
    expect(formatRecency({
      isLeaf: false, mostRecentDays: 12, stalestDays: 61, hasUntouched: false,
    })).toBe('12d / 61d');
  });

  it('says never rather than fabricating a stalest', () => {
    // "Never" is not a number of days, and 0 would claim you practised
    // today.
    expect(formatRecency({
      isLeaf: false, mostRecentDays: 12, stalestDays: 12, hasUntouched: true,
    })).toBe('12d / never');
    expect(formatRecency({
      isLeaf: false, mostRecentDays: null, stalestDays: null, hasUntouched: true,
    })).toBe('never');
  });

  it('dashes an untouched item rather than showing zero days', () => {
    expect(formatRecency({
      isLeaf: true, mostRecentDays: null, stalestDays: null, hasUntouched: true,
    })).toBe(NO_VALUE);
  });
});
