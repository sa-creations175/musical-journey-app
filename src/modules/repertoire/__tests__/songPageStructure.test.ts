/**
 * The song page has one shape now.
 *
 * ---------------------------------------------------------------
 * WHY SOURCE-LEVEL RATHER THAN A RENDER TEST.
 *
 * These are absences — the drag-reorder is gone, two cards are gone —
 * and rendering proves an absence only for the props you happened to
 * pass. A card that reappeared behind a condition the test did not
 * hit would render as nothing and pass.
 *
 * They are also the kind of thing a later edit restores by accident:
 * dnd-kit is still a dependency used elsewhere on the page's siblings,
 * and "why this song" is a phrase that reads like it wants its own
 * heading.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';

const SOURCES: Record<string, string> = import.meta.glob(
  '../**/*.{ts,tsx}',
  { eager: true, query: '?raw', import: 'default' },
);

function read(suffix: string): string {
  const hit = Object.entries(SOURCES).find(([p]) => p.endsWith(suffix));
  if (!hit) throw new Error(`no source found for ${suffix}`);
  return hit[1];
}

/**
 * Source with comments removed.
 *
 * These files explain themselves at length, and an assertion that a
 * word is ABSENT will otherwise fail on the comment saying why it is
 * absent — which reads as the code being wrong when it is right, and
 * gets "fixed" by loosening the assertion. Absence tests take the
 * code; presence tests can take either.
 */
function codeOf(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const DETAIL = read('SongDetailView.tsx');

describe('the page order is fixed', () => {
  it('the sweep found the file', () => {
    // Guard the guard: a glob that matched nothing makes every
    // assertion below vacuously true.
    expect(DETAIL.length).toBeGreaterThan(10_000);
    expect(DETAIL).toContain('SongMatrixView');
  });

  it('no drag-to-reorder machinery remains', () => {
    // The order was user-controlled and stored on
    // `songs.sectionOrder`. That freedom was worth less than a shape
    // you can learn.
    for (const marker of ['DndContext', 'SortableContext', 'useSortable', 'SortableSection']) {
      expect(DETAIL).not.toContain(`<${marker}`);
    }
    expect(DETAIL).not.toContain("from '@dnd-kit/core'");
    expect(DETAIL).not.toContain("from '@dnd-kit/sortable'");
  });

  it('does not read or write the stored card order', () => {
    // The field is deliberately LEFT on the row — unindexed, riding in
    // the sync blob, costing nothing — but nothing may consult it.
    expect(DETAIL).not.toContain('sectionOrder:');
    expect(DETAIL).not.toContain('song?.sectionOrder');
  });

  it('renders the cards in the settled order', () => {
    // Metadata, matrix, lead sheet, associations. Asserted by the
    // position of each card's own marker, so a card moved rather than
    // deleted still fails.
    const order = [
      '{/* Metadata — and everything else',
      '>matrix</h3>',
      '>lead sheet</h3>',
    ].map(m => {
      const at = DETAIL.indexOf(m);
      expect(at, `missing marker: ${m}`).toBeGreaterThan(-1);
      return at;
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe('two cards were absorbed, not merely hidden', () => {
  it('"why this song" is no longer its own card', () => {
    // Its content — the note and the reference links — moved into
    // metadata, which answers the same question: what IS this song.
    expect(DETAIL).not.toContain('>why this song</h3>');
  });

  it('the note and the links moved WITH it', () => {
    // Guard the guard: deleting the heading and losing the content
    // would satisfy the assertion above.
    expect(DETAIL).toContain('+ add a note about this song');
    expect(DETAIL).toContain('spotify ↗');
  });

  it('"learning status" is no longer its own card', () => {
    // The matrix is the song's dashboard, so its status and what would
    // advance it belong in that card rather than two scrolls below it.
    expect(DETAIL).not.toContain('>learning status</h3>');
  });

  it('the stage block moved WITH it, into the matrix card', () => {
    const matrixAt = DETAIL.indexOf('>matrix</h3>');
    const leadAt = DETAIL.indexOf('>lead sheet</h3>');
    const panelAt = DETAIL.indexOf('<StageCriteriaPanel');
    expect(panelAt).toBeGreaterThan(matrixAt);
    expect(panelAt).toBeLessThan(leadAt);
  });
});

describe('associations folded into metadata', () => {
  it('is rendered INSIDE the metadata card, not as one of its own', () => {
    // It was a card near the bottom for a single textarea, two scrolls
    // from anything it related to. It is a note about the song, the
    // same as "why this song", so it sits with it — which means it
    // renders BEFORE the matrix, not after the lead sheet.
    const assoc = DETAIL.indexOf('<SongAssociationsSection song={song} />');
    const matrix = DETAIL.indexOf('>matrix</h3>');
    expect(assoc).toBeGreaterThan(-1);
    expect(assoc).toBeLessThan(matrix);
  });

  it('carries no card chrome of its own', () => {
    // A second border and a second shadow inside the metadata card
    // would read as a card nested in a card. Asserted on the
    // component's own render root rather than on the page.
    const at = DETAIL.indexOf('function SongAssociationsSection');
    const body = DETAIL.slice(at, at + 4000);
    expect(body).not.toContain('rounded-2xl');
    expect(body).not.toContain('shadow-[0_2px_12px');
  });

  it('still writes to the Harmonic Diary', () => {
    // The whole point of "unchanged except its placement". Losing the
    // write while keeping the textarea would look identical on screen.
    const at = DETAIL.indexOf('function SongAssociationsSection');
    const body = DETAIL.slice(at, at + 4000);
    expect(body).toContain('upsertDiaryEntry');
  });
});

describe('the matrix card holds no second copy of the song', () => {
  const MATRIX = read('matrix/SongMatrixView.tsx');

  it('the sweep found that file too', () => {
    expect(MATRIX.length).toBeGreaterThan(5_000);
    expect(MATRIX).toContain('<MatrixGrid');
  });

  it('renders no status pill of its own', () => {
    // THE LOAD-BEARING ONE. It used to open with a sub-card whose pill
    // said "Learning" in green from `songLevelState`, directly beneath
    // "Learning" in red from `deriveStage` — two vocabularies, two
    // colours, no way to tell they described the same song. Removing
    // duplicated status was the point of the redesign; this component
    // was the last place it survived.
    expect(MATRIX).not.toContain('songLevelStateLabel');
    expect(MATRIX).not.toContain('STATE_PILL_CLASS');
    // And the rollup that fed it is gone, not merely unrendered — a
    // computed value with no reader is how the pill comes back.
    expect(MATRIX).not.toContain('computeSongLevelState');
  });

  it('does not restate the title, artist, key, tempo or section count', () => {
    // Every one of these is in the metadata card, three inches up.
    expect(MATRIX).not.toContain('{song.title}');
    expect(MATRIX).not.toContain('{song.artist}');
    expect(MATRIX).not.toContain('original key:');
    expect(MATRIX).not.toContain('song.tempoLabel');
    expect(MATRIX).not.toContain('no sections yet');
  });

  it('has no header element left conditional for a caller that does not exist', () => {
    // The alternative fix was `{!embedded && <Header …/>}`. There is
    // exactly one caller and it always passes `embedded`, so that
    // would have left dead chrome behind for nobody.
    expect(MATRIX).not.toContain('<header');
    const callers = Object.entries(SOURCES)
      .filter(([p, src]) => !p.endsWith('SongMatrixView.tsx')
        && src.includes("from './matrix/SongMatrixView'"));
    expect(callers.map(([p]) => p.split('/').pop())).toEqual(['SongDetailView.tsx']);
  });

  it('keeps the one fact that was not a duplicate, beside the stage badge', () => {
    // "N% original" is the share of original-key sections at
    // Comfortable — the run-up to the whole-song test, which the
    // Learning criterion does not measure. It moved up rather than
    // keeping a card alive to hold it.
    // Named by the value it renders, not by the label — the label
    // appears in this file's own explanatory comment, and a test that
    // a comment can turn red is a test that gets loosened later.
    expect(MATRIX).not.toContain('originalComfortableCount');
    expect(DETAIL).toContain('{rollup.originalComfortableCount} of {rollup.originalSectionCount} sections');
    const pill = DETAIL.indexOf('{rollup.originalComfortableCount} of');
    const badge = DETAIL.indexOf('STAGE_BADGE_CLASS[currentStage]');
    const grid = DETAIL.indexOf('<SongMatrixView');
    expect(badge).toBeLessThan(pill);
    expect(pill).toBeLessThan(grid);
  });
});

describe('the metadata card is two columns', () => {
  it('splits into a grid rather than stacking', () => {
    expect(DETAIL).toContain('grid gap-x-5 gap-y-1.5 sm:grid-cols-2');
  });

  it('puts the note, the links and the associations in the SECOND column', () => {
    // Position in source order is not the property — they were already
    // last when the card was a stack, so an ordering assertion passes
    // for the layout this replaced. What matters is that they sit in a
    // column, pinned to column 2, while the facts stay in column 1.
    const right = DETAIL.indexOf('min-w-0 space-y-1 sm:col-start-2');
    expect(right).toBeGreaterThan(-1);
    const facts = DETAIL.indexOf('time: <span className="font-mono');
    expect(facts).toBeLessThan(right);
    const column = DETAIL.slice(right, DETAIL.indexOf('>matrix</h3>'));
    for (const marker of [
      '+ add a note about this song',
      'spotify ↗',
      '<SongAssociationsSection song={song} />',
    ]) {
      expect(column, marker).toContain(marker);
    }
  });

  it('drops the divider the stack needed', () => {
    // A rule between two columns is a rule the columns already draw.
    const at = DETAIL.indexOf('{/* Metadata — and everything else');
    const card = DETAIL.slice(at, DETAIL.indexOf('>matrix</h3>'));
    expect(card).not.toContain('border-t border-neutral-200');
  });
});

describe('the facts row reads as facts', () => {
  it('runs key, tempo, time, then the one control', () => {
    // The select used to sit second, between the key and the tempo,
    // so the eye stopped at a control every time it went looking for
    // a fact. Asserted by position across all four.
    const at = (m: string) => {
      const i = DETAIL.indexOf(m);
      expect(i, m).toBeGreaterThan(-1);
      return i;
    };
    const order = [
      'key: <span className="font-mono',
      '{song.tempoLabel && <span>tempo:',
      'time: <span className="font-mono',
      'shows as:',
    ].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('calls it "shows as", not "spelling"', () => {
    // "spelling" made it sound like a property of the song, as if F♯
    // and G♭ were different songs. It is a display choice and it
    // moves no practice data.
    expect(DETAIL).toContain('shows as:');
    expect(DETAIL).not.toContain('\n                spelling:\n');
  });

  it('puts the links above the two write-something-down lines', () => {
    // Links are the only thing in that column you reach for
    // mid-practice.
    const links = DETAIL.indexOf('spotify ↗');
    expect(links).toBeLessThan(DETAIL.indexOf('+ add a note about this song'));
    expect(links).toBeLessThan(DETAIL.indexOf('<SongAssociationsSection song={song} />'));
  });

  it('moves edit out of the title line and into the card corner', () => {
    // It edits the whole card, so sitting against the title read as
    // editing the title.
    expect(DETAIL).toContain('absolute top-2 right-3');
    const title = DETAIL.indexOf('{song.title}</h2>');
    const edit = DETAIL.indexOf('absolute top-2 right-3');
    expect(edit).toBeLessThan(title);
  });
});

describe('the matrix card header', () => {
  it('carries the status badge on the same line as the heading', () => {
    // Status had a line of its own under the heading, which put the
    // answer in the middle of the card and left the title line's whole
    // right half empty. Both now sit inside one justify-between row.
    const head = DETAIL.indexOf('>matrix</h3>');
    const badge = DETAIL.indexOf('STAGE_BADGE_CLASS[currentStage]');
    const guidance = DETAIL.indexOf('STAGE_GUIDANCE[currentStage]');
    expect(badge).toBeGreaterThan(head);
    // The load-bearing half: still ABOVE the guidance paragraph, i.e.
    // it moved up into the header rather than merely being reordered
    // within the block it used to live in.
    expect(badge).toBeLessThan(guidance);
    const header = DETAIL.slice(head - 400, badge);
    expect(header).toContain('justify-between');
  });

  it('shows no stage tagline anywhere', () => {
    // "building the shape" and its three siblings said nothing the
    // guidance line below them did not say concretely. Removed at the
    // source too — an exported table with no reader is how it returns.
    expect(DETAIL).not.toContain('STAGE_TAGLINE');
    const stage = read('stage.ts');
    expect(stage).not.toContain('STAGE_TAGLINE');
    expect(stage).not.toContain('building the shape');
  });
});

describe('the criteria panel is read-only', () => {
  const PANEL = read('StageCriteriaPanel.tsx');

  it('marks an unmet criterion with a dot, not an empty ring', () => {
    // An empty ring is a checkbox and a checkbox invites a tap.
    // Nothing here is tappable — these are things the app observes
    // about your playing, not things you assert.
    expect(PANEL).not.toContain("'border-neutral-300 dark:border-neutral-600 text-transparent'");
    expect(PANEL).toContain('w-1.5 h-1.5 rounded-full bg-neutral-300');
  });

  it('has no interactive element in a criterion row', () => {
    // Guard the guard: restyling the marker while leaving a button
    // around it would look right and still be a control.
    const at = PANEL.indexOf('function CriterionRow');
    const body = PANEL.slice(at, at + 2500);
    for (const marker of ['<button', 'onClick', 'role="checkbox"', '<input']) {
      expect(body, marker).not.toContain(marker);
    }
  });

  it('counts the work rather than the rules', () => {
    // "0/1" named neither the numerator nor the denominator; "1 of 5
    // met" named them and counted the wrong thing — rules satisfied
    // across three rungs. Both numbers and the noun beside them now
    // come off one criterion.
    expect(PANEL).toContain('{group.headline.have} of {group.headline.need}');
    expect(PANEL).toContain('{group.headline.unit}');
    // No aggregate anywhere: neither the old ratio nor a renamed one.
    expect(codeOf(PANEL)).not.toContain('of {all.length}');
    expect(codeOf(PANEL)).not.toContain('metCount');
  });
});

describe('the page reserves room for the fixed bottom drawers', () => {
  it('pads itself by the height the drawers publish', () => {
    // The drawers are `fixed`, so the page ends underneath them —
    // which is what buried the last rows of the matrix.
    expect(DETAIL).toContain('paddingBottom: `var(${RESERVE_VAR}, 0px)`');
    expect(DETAIL).toContain("import LeadSheetDrawers, { RESERVE_VAR }");
  });
});

describe('the chip counts sections instead of quoting a percentage', () => {
  it('names the unit and the key', () => {
    // "0% original" named neither. A percentage of three sections can
    // only read 0 / 33 / 67 / 100, none of which say "one of three",
    // and naming the key ties the chip to the row you would tap.
    // Keyed on the rendered expression, not the words — the words
    // appear in the comment explaining why they went.
    expect(DETAIL).not.toContain('learningPercent}% original');
    expect(DETAIL).toContain('of {rollup.originalSectionCount} sections');
    expect(DETAIL).toContain('` in ${spellKey(song.key, songSpelling)}`');
  });
});

describe('the run button is decided by the rule, not by the row', () => {
  it('the page resolves it from the same input the criteria read', () => {
    // Two readings of one state, not two beliefs about it. If the row
    // decided for itself, a button could appear on a key the panel is
    // not asking for — the exact thing that has no honest label.
    expect(DETAIL).toContain('keysWhereRunCounts(advancementInputs)');
    expect(DETAIL).toContain('ladderCriteria(advancementInputs)');
    expect(DETAIL).toContain('runCountsForKeyIds={runCountsForKeyIds}');
  });

  it('the row is given the answer rather than computing one', () => {
    // Asserted on calls and imports rather than on names, which also
    // appear in the comment that explains the arrangement.
    const row = read('matrix/KeyRow.tsx');
    for (const marker of ['keysWhereRunCounts(', 'isHeld(', "from '../../stage'"]) {
      expect(row, marker).not.toContain(marker);
    }
    expect(row).toContain('runCounts');
  });
});

describe('the panel accumulates instead of swapping', () => {
  it('renders every rung, not only the current one', () => {
    expect(DETAIL).toContain('ladderCriteria(advancementInputs)');
    expect(DETAIL).toContain('groups={ladderGroups}');
  });

  it('takes the current rung FROM the ladder rather than recomputing it', () => {
    // `stageReconciliation` decides promotions from these criteria. A
    // second `stageCriteria` call here could drift from what the panel
    // shows, which would put a promotion and its explanation out of
    // step — the exact failure the single-definition rule exists for.
    expect(DETAIL).toContain("ladderGroups.find(g => g.status === 'current')");
    expect(DETAIL).not.toContain('stageCriteria(');
  });

  it('says a tick can come off again', () => {
    // Every group is recomputed live, earned ones included, so a
    // lapsed key un-ticks a rung passed months ago. A list of ticks
    // reads as a record of things achieved unless it says otherwise.
    const PANEL = read('StageCriteriaPanel.tsx');
    expect(PANEL).toContain('a tick comes off again if the key behind it lapses');
  });
});

describe('the earned notice shares the demotion notice\'s slot', () => {
  it('renders one or the other, never both', () => {
    // A drop and a climb are both news about where this song stands
    // and they point in opposite directions. Side by side they read
    // as the page disagreeing with itself. Asserted as a ternary
    // rather than two independent conditionals — two conditionals is
    // how both end up on screen.
    expect(DETAIL).toContain('{song.stageDemotion ? (');
    expect(DETAIL).toContain(') : song.stageEarned ? (');
    expect(DETAIL).not.toContain('{song.stageEarned && (');
  });

  it('opens no dialog', () => {
    // The explicit non-goal, kept as an assertion because it is the
    // kind of thing a later "make sure they notice" reintroduces.
    // You are at the piano with your hands on the keys; anything that
    // has to be clicked away is an interruption charging you for good
    // news. A page that visibly changed beats a dialog every time.
    const notice = codeOf(read('EarnedNotice.tsx'));
    for (const marker of ['role="dialog"', '<Modal', 'showModal', 'confetti', 'onClose']) {
      expect(notice, marker).not.toContain(marker);
    }
  });

  it('respects prefers-reduced-motion', () => {
    const notice = read('EarnedNotice.tsx');
    expect(notice).toContain('prefers-reduced-motion: reduce');
    const panel = read('StageCriteriaPanel.tsx');
    expect(panel).toContain('prefers-reduced-motion: reduce');
  });

  it('feeds the panel the criterion that just completed', () => {
    // Part one of the moment: the tick lands where you are already
    // looking, on the row for the thing you just did.
    expect(DETAIL).toContain('justMetLabel={song.stageEarned?.criterionLabel ?? null}');
  });
});

describe('the criteria panel starts closed', () => {
  const PANEL = read('StageCriteriaPanel.tsx');

  it('defaults to closed and remembers the choice', () => {
    expect(PANEL).toContain("getPref<boolean>(PREF_OPEN, false)");
    expect(PANEL).toContain('void setPref(PREF_OPEN, next)');
  });

  it('is handed the climb timestamp, not just the label', () => {
    // The auto-open is keyed on WHEN the climb happened. Without the
    // timestamp the panel could only ask "is a climb standing", which
    // is true until the next practice — it would re-open on every
    // visit and closing it would be impossible.
    expect(DETAIL).toContain('justMetAt={song.stageEarned?.at ?? null}');
  });

  it('gates the first paint on the stored state', () => {
    // The pref lands a tick after mount. Rendering the body before it
    // arrives would flash the panel open on every load for someone
    // who keeps it closed.
    expect(PANEL).toContain('{ready && open && (');
  });
});

describe('the moment is reserved for a status change', () => {
  it('records that as a decision where the moment is implemented', () => {
    // Meeting one of Internalized's three criteria without advancing
    // moves the collapsed header's count and nothing else. That is
    // deliberate: if every criterion got the tick-and-crossfade, the
    // one that matters would stop feeling different from the ones
    // that do not. Asserted so the reasoning cannot be quietly
    // deleted as a stale comment by someone who reads the asymmetry
    // as a bug.
    const notice = read('EarnedNotice.tsx');
    expect(notice).toContain('A DECISION, NOT AN OVERSIGHT');
    expect(notice).toContain('criteriaMetLabels');
  });
});
