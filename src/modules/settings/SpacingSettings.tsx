/**
 * Settings → Spacing & Scheduling.
 *
 * Built to `docs/spacing-settings-spec.html`. The one addition the
 * spec does not carry is the DUE SOON column, which sits beside grace
 * because they are the same shape on opposite sides of the due date —
 * grace is the window after, due soon the window before.
 *
 * WORDING IS FIXED. "Comes back in", never gap or interval or spacing.
 * The stages are ACQUIRING and MAINTAINING. The tally reads as
 * "5 over 4 days" and never as its day offsets.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ACCURACY_BANDS, FRESHNESS_LADDER, type AccuracyBand } from '../../lib/spacing/bands';
import {
  DEFAULT_SPACING_SETTINGS, SETTINGS_PATHS, TALLY_INFO_TEXT,
  pathsSetAt, tallyAnswerCount, tallyDistinctDays, tallySummary, tallyWarnings,
  type AcquiringMissPolicy, type MaintainingMissPolicy,
  type PartialSpacingSettings, type SettingsPath, type SpacingSettings,
} from '../../lib/spacing/settings';
import { previewSequence } from '../../lib/spacing/engine';
import {
  loadOverrides, resolveForNode, setNodeSettings, type SpacingOverrides,
} from '../../lib/spacing/store';
import { spacingTree, walkTree, type SpacingNode } from '../../lib/spacing/tree';
import { recalculateAllSchedules, countAffected } from '../../lib/spacing/recalculate';
import ConfirmDialog from '../../components/ConfirmDialog';
import { moduleMetaById } from '../../lib/moduleMeta';

// =====================================================================
// Copy — every string the screen shows, in one place
// =====================================================================

const INFO: Readonly<Record<string, string>> = {
  bands:
    'Your accuracy on a card decides which of these it sits in, and the band decides how far '
    + 'its wait can stretch. A card you are getting right nearly every time drifts out to '
    + 'weeks; one you keep missing stays on your plate every day or two until it improves.',
  freshness:
    'Freshness is not a rating. It only says how long it has been since you last touched '
    + 'something — it never changes a colour or a score. A full line means today; an '
    + 'almost-empty line means it has been over a month.',
  tally: TALLY_INFO_TEXT,
  acquiringRight:
    'Nothing to decide here. A right answer while a card is still new carries on with the '
    + 'pattern — the pattern is the whole point of the stage.',
  acquiringWrong:
    'A miss while a card is still new is not a failure, it is the stage working. The default '
    + 'shows it again in the same session rather than pushing it away. "Add one to tomorrow" '
    + 'gives the next day an extra look instead; "start the pattern over" treats it as unmet; '
    + '"do nothing" carries on as if you had it right.',
  firstWait:
    'The wait a card gets the moment it graduates, before any band has multiplied anything. '
    + 'Every sequence below starts here.',
  bandRules:
    'Your rating decides the rest. Every time you get it right the wait is multiplied — but '
    + 'it can never go past the ceiling for that rating. Get a card wrong and it drops back '
    + 'to the start.',
  maintainingWrong:
    'What a wrong answer does to a card that already has a rating. Back to the first wait is '
    + 'the default: the card has stopped being known, so it starts again from the shortest '
    + 'wait rather than keeping a long one it has just disproved.',
  minimum:
    'No computed wait is ever shorter than this, whatever a multiplier or a miss would '
    + 'otherwise produce.',
  dueSoon:
    'How long before something is due that a surface starts saying it is coming, so the work '
    + 'can happen before it bites rather than after. It changes nothing about when the card '
    + 'actually comes back.',
  grace:
    'Grace counts from the day it was due — not from how long the wait was. A card on a '
    + '60-day wait that came due on the 1st is late on the 2nd and stale on the 8th, exactly '
    + 'like a card on a 2-day wait. Stale does not change its rating and does not change its '
    + 'colour. It moves to the front of the queue.',
  inSchedule:
    'Off means this stops getting due dates, drops out of due counts, and is left out of '
    + 'generated sessions. It stays drillable, and its ratings and progress stay visible — '
    + 'you simply stop being told when to do it. Turning a level off turns everything under '
    + 'it off too.',
};

const ACQUIRING_MISS_LABELS: ReadonlyArray<[AcquiringMissPolicy, string]> = [
  ['repeat-session', 'Repeat this session'],
  ['add-to-next-day', 'Add one to tomorrow'],
  ['restart-pattern', 'Start the pattern over'],
  ['nothing', 'Do nothing'],
];

const MAINTAINING_MISS_LABELS: ReadonlyArray<[MaintainingMissPolicy, string]> = [
  ['back-to-first-wait', 'Back to the first wait'],
  ['halve', 'Halve the wait'],
  ['nothing', 'Do nothing'],
];

const days = (n: number) => `${Math.round(n)} day${Math.round(n) === 1 ? '' : 's'}`;

/** "5 over 4 days" — never the day offsets. */
const acquiringSummary = (tally: ReadonlyArray<number>) =>
  `${tallyAnswerCount(tally)} over ${tallyDistinctDays(tally)} days`;

const growthLabel = (s: SpacingSettings, band: AccuracyBand) => {
  const g = s.maintaining.perBand[band].growth;
  return g.kind === 'back-to-first' ? 'back to start' : `× ${g.factor}`;
};

// =====================================================================
// Small shared pieces
// =====================================================================

function Info({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="what this does"
        aria-expanded={open}
        className="ml-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full
          border border-neutral-400 text-[9px] font-bold leading-none text-neutral-500
          align-middle hover:border-fluent hover:text-fluent"
      >
        i
      </button>
      {open && (
        <p className="mt-2 mb-1 max-w-[640px] rounded-md border border-neutral-300
          dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/60 px-3 py-2.5
          text-[12.5px] leading-relaxed text-neutral-600 dark:text-neutral-300">
          {text}
        </p>
      )}
    </>
  );
}

function Switch({ on, disabled, onClick }: {
  on: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-block h-4 w-7 rounded-full transition-colors ${
        on ? 'bg-fluent/40' : 'bg-neutral-300 dark:bg-neutral-700'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span className={`absolute top-0.5 h-3 w-3 rounded-full transition-all ${
        on ? 'right-0.5 bg-fluent' : 'left-0.5 bg-neutral-500'
      }`} />
    </button>
  );
}

/** A value with where it came from. Inherited reads greyed and names
 *  its source; set-here reads normally and is marked an exception. */
function SourceNote({ label, changed }: { label: string; changed: boolean }) {
  return (
    <span className={`text-[11.5px] ${changed ? 'text-developing' : 'text-neutral-500'}`}>
      {label}
    </span>
  );
}

// =====================================================================
// The page
// =====================================================================

export default function SpacingSettings() {
  const [overrides, setOverrides] = useState<SpacingOverrides | null>(null);
  const [selectedId, setSelectedId] = useState<string>('harmonic-fluency');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['harmonic-fluency']));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [affected, setAffected] = useState<number | null>(null);
  const [recalcNote, setRecalcNote] = useState<string | null>(null);

  useEffect(() => { void loadOverrides().then(setOverrides); }, []);

  const tree = useMemo(() => spacingTree(), []);

  const rows = useMemo(() => {
    const out: Array<{ node: SpacingNode; depth: number; chain: SpacingNode[] }> = [];
    walkTree(tree, (node, chain) => {
      const parent = chain[chain.length - 2];
      if (parent && !expanded.has(parent.id)) return;
      // A grandchild is only visible when its parent is open too.
      if (chain.length > 2 && !chain.slice(0, -1).every(n => expanded.has(n.id))) return;
      out.push({ node, depth: chain.length - 1, chain });
    });
    return out;
  }, [tree, expanded]);

  const update = useCallback(async (nodeId: string, patch: PartialSpacingSettings) => {
    const next = await setNodeSettings(nodeId, patch);
    setOverrides({ ...next });
  }, []);

  if (overrides === null) {
    return <div className="p-6 text-sm text-neutral-500">loading…</div>;
  }

  const selected = resolveForNode(selectedId, overrides);
  const selectedChain = rows.find(r => r.node.id === selectedId)?.chain
    ?? [tree.find(n => n.id === selectedId) as SpacingNode].filter(Boolean);
  const ownPaths = new Set<SettingsPath>(
    pathsSetAt({ id: selectedId, label: '', settings: overrides[selectedId] ?? {} }),
  );
  const isSongs = selectedId === 'repertoire';

  /** How a field should read: set here, inherited from X, or default. */
  const sourceFor = (path: SettingsPath) => {
    if (ownPaths.has(path)) return { changed: true, label: 'changed here' };
    const src = selected.sourceByPath[path];
    if (src) return { changed: false, label: `from ${src.label}` };
    return { changed: false, label: 'default' };
  };

  const setPatch = (patch: PartialSpacingSettings) => {
    const existing = overrides[selectedId] ?? {};
    void update(selectedId, {
      ...existing,
      ...patch,
      acquiring: { ...existing.acquiring, ...patch.acquiring },
      maintaining: {
        ...existing.maintaining,
        ...patch.maintaining,
        perBand: { ...existing.maintaining?.perBand, ...patch.maintaining?.perBand },
      },
      stale: { ...existing.stale, ...patch.stale },
    });
  };

  const openRecalc = async () => {
    setAffected(await countAffected());
    setConfirmOpen(true);
  };

  const runRecalc = async () => {
    const n = await recalculateAllSchedules();
    setConfirmOpen(false);
    setRecalcNote(`${n} card${n === 1 ? '' : 's'} rescheduled.`);
  };

  const v = selected.value;

  return (
    <div className="mx-auto max-w-[1220px] px-4 py-6 pb-20">
      <h1 className="text-xl font-semibold tracking-tight">Spacing &amp; Scheduling</h1>
      <p className="mt-1 text-[13.5px] text-neutral-500">
        Every number that decides when something comes back to you.
      </p>

      <div className="mt-4 rounded-md border border-neutral-300 dark:border-neutral-700
        border-l-[3px] border-l-developing bg-neutral-50 dark:bg-neutral-900/40 px-3.5 py-2.5
        text-[13px] text-neutral-600 dark:text-neutral-300">
        Two stages: <b className="font-semibold">Acquiring</b>, the first few times you meet
        something, and <b className="font-semibold">Maintaining</b>, once it has a rating.
        Changes apply from the next time you answer that card — nothing already scheduled
        gets rewritten.
      </div>

      {/* ---------------- global ---------------- */}
      <section className="mt-5 rounded-lg border border-neutral-300 dark:border-neutral-700">
        <h2 className="border-b border-neutral-300 dark:border-neutral-700 px-4 py-3
          text-[11.5px] font-semibold uppercase tracking-[0.09em] text-neutral-500">
          Applies everywhere
          <span className="ml-2 normal-case tracking-normal font-normal text-neutral-400">
            not settable per module
          </span>
        </h2>
        <div className="px-4 py-3.5">
          <div className="text-[12.5px] text-neutral-500">
            Accuracy ratings<Info text={INFO.bands} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2.5">
            {ACCURACY_BANDS.map(b => (
              <div key={b.id} className="min-w-[132px] rounded-md border
                border-neutral-300 dark:border-neutral-700 px-3 py-2">
                <div className="flex items-center gap-2 text-[13.5px] font-semibold">
                  <span className="h-2.5 w-2.5 rounded-[2px]"
                    style={{ background: b.hex }} aria-hidden />
                  {b.label}
                </div>
                <div className="mt-0.5 font-mono text-[12.5px] text-neutral-500">
                  {b.minPercent === 0 ? `under ${b.maxPercent + 1}%`
                    : b.maxPercent === 100 ? `${b.minPercent} – 100%`
                    : `${b.minPercent} – ${b.maxPercent}%`}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 text-[12.5px] text-neutral-500">
            Freshness line — how recently you touched it<Info text={INFO.freshness} />
          </div>
          <div className="mt-2 flex max-w-[540px] flex-col gap-1.5">
            {FRESHNESS_LADDER.map(rung => (
              <div key={rung.label} className="flex items-center gap-3">
                <span className="min-w-[140px] text-[12.5px] text-neutral-500">{rung.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full
                  bg-neutral-200 dark:bg-neutral-800">
                  <span className="block h-full rounded-full bg-violet-400"
                    style={{ width: `${(rung.sixths / 6) * 100}%` }} />
                </span>
                <span className="min-w-[34px] text-right font-mono text-[11.5px]
                  text-neutral-400">{rung.sixths}/6</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- tree ---------------- */}
      <section className="mt-4 rounded-lg border border-neutral-300 dark:border-neutral-700">
        <h2 className="border-b border-neutral-300 dark:border-neutral-700 px-4 py-3
          text-[11.5px] font-semibold uppercase tracking-[0.09em] text-neutral-500">
          Everything at a glance
          <span className="ml-2 normal-case tracking-normal font-normal text-neutral-400">
            same order as the navbar · every row expands to the skill level
          </span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[0.06em] text-neutral-400">
                <th className="min-w-[280px] border-b border-neutral-300
                  dark:border-neutral-700 px-3 py-2.5 text-left font-semibold">&nbsp;</th>
                {/* WRAPPING, NOT TRUNCATED. Seven columns plus a name has to
                    fit a full-width page without sideways scrolling, and the
                    header words are fixed — so the headers wrap onto two
                    lines instead of the right edge reading "NEVER LO". */}
                {['In schedule', 'Acquiring', 'Comes back in', 'Then grows by',
                  'Never longer than', 'Due soon', 'Grace after due'].map(h => (
                  <th key={h} className="w-[92px] border-b border-neutral-300
                    dark:border-neutral-700 px-2 py-2.5 text-right align-bottom
                    font-semibold leading-[1.25]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, depth, chain }) => {
                const r = resolveForNode(node.id, overrides);
                const accentHex = depth === 0
                  ? moduleMetaById(node.id)?.accentHex ?? null
                  : null;
                const own = new Set(pathsSetAt({
                  id: node.id, label: '', settings: overrides[node.id] ?? {},
                }));
                const off = !r.inSchedule;
                const rowSongs = node.id === 'repertoire';
                const cell = (path: SettingsPath, text: string) => (
                  <td className={`h-9 whitespace-nowrap px-2 py-0 text-right font-mono text-[13px]
                    ${off ? 'text-neutral-400 dark:text-neutral-600'
                      : own.has(path) ? 'text-developing'
                      : r.sourceByPath[path] ? 'text-neutral-400' : 'text-neutral-400'}`}>
                    {text}
                  </td>
                );
                return (
                  <tr
                    key={node.id}
                    onClick={() => setSelectedId(node.id)}
                    aria-selected={node.id === selectedId}
                    className={`cursor-pointer border-b border-neutral-200 dark:border-neutral-800
                      ${node.id === selectedId
                        ? 'bg-fluent/[0.13] dark:bg-fluent/[0.16] ring-1 ring-inset ring-fluent/50'
                        : 'hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40'}`}
                  >
                    {/* A MODULE ROW IS A HEADER. All caps in the module's own
                        accent so one module is distinguishable from the next at
                        a glance; everything under it stays Title Case. This is
                        a decision about this page, not general capitalisation. */}
                    <td
                      style={depth === 0 && !off && accentHex
                        ? { color: accentHex } : undefined}
                      className={`relative h-9 w-full px-3 py-0 text-left
                        ${depth === 0
                          ? 'text-[13px] font-semibold uppercase tracking-[0.07em]'
                          : depth === 1 ? 'pl-8 text-[13.5px]' : 'pl-14 text-[13px]'}
                        ${off ? 'text-neutral-400 line-through decoration-1' : ''}`}>
                      {node.id === selectedId && (
                        <span aria-hidden className="absolute left-0 top-0 h-full w-[3px]
                          bg-fluent" />
                      )}
                      {node.children.length > 0 && (
                        <button
                          type="button"
                          aria-label={expanded.has(node.id) ? 'collapse' : 'expand'}
                          onClick={e => {
                            e.stopPropagation();
                            setExpanded(prev => {
                              const next = new Set(prev);
                              if (next.has(node.id)) next.delete(node.id);
                              else next.add(node.id);
                              return next;
                            });
                          }}
                          className="mr-1.5 inline-block w-3.5 text-[10px] text-neutral-400"
                        >
                          {expanded.has(node.id) ? '▾' : '▸'}
                        </button>
                      )}
                      {node.label}
                      {own.size > 0 && !off && (
                        <span className="ml-2 rounded-[3px] border border-developing/50
                          px-1.5 py-px align-[1px] text-[10px] font-semibold uppercase
                          tracking-[0.04em] text-developing">changed</span>
                      )}
                      {off && (
                        <span className="ml-2 rounded-[3px] border border-neutral-400
                          px-1.5 py-px align-[1px] text-[10px] font-semibold uppercase
                          tracking-[0.04em] text-neutral-400">out</span>
                      )}
                    </td>
                    <td className="h-9 px-2 py-0 text-right">
                      <Switch
                        on={r.inSchedule}
                        disabled={off && chain.slice(0, -1).some(
                          a => (overrides[a.id]?.inSchedule) === false)}
                        onClick={() => {
                          const cur = overrides[node.id]?.inSchedule;
                          void update(node.id, {
                            ...(overrides[node.id] ?? {}),
                            inSchedule: cur === false ? true : false,
                          });
                        }}
                      />
                    </td>
                    {/* ACQUIRING IS INERT FOR SONGS — a song is never
                        walked through a first-exposure tally, and the
                        column says so rather than showing a pattern
                        nothing runs. */}
                    <td className={`h-9 whitespace-nowrap px-2 py-0 text-right font-mono text-[13px]
                      ${off ? 'text-neutral-400 dark:text-neutral-600' : 'text-neutral-400'}`}>
                      {rowSongs ? '—' : off ? '—' : acquiringSummary(r.value.acquiring.tally)}
                    </td>
                    {off
                      ? <><td className="h-9 px-2 py-0 text-right font-mono text-[13px] text-neutral-400">—</td>
                          <td className="h-9 px-2 py-0 text-right font-mono text-[13px] text-neutral-400">—</td>
                          <td className="h-9 px-2 py-0 text-right font-mono text-[13px] text-neutral-400">—</td>
                          <td className="h-9 px-2 py-0 text-right font-mono text-[13px] text-neutral-400">—</td>
                          <td className="h-9 px-2 py-0 text-right font-mono text-[13px] text-neutral-400">—</td></>
                      : <>
                          {cell('maintaining.firstWaitDays', days(r.value.maintaining.firstWaitDays))}
                          {cell('maintaining.perBand.fluent.growth', growthLabel(r.value, 'fluent'))}
                          {cell('maintaining.perBand.fluent.ceilingDays',
                            days(r.value.maintaining.perBand.fluent.ceilingDays))}
                          {cell('stale.dueSoonDays', days(r.value.stale.dueSoonDays))}
                          {cell('stale.graceDays', days(r.value.stale.graceDays))}
                        </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-neutral-200 dark:border-neutral-800 px-4 py-2.5
          text-[12px] text-neutral-400">
          <b className="text-neutral-500">Then grows by</b> and{' '}
          <b className="text-neutral-500">Never longer than</b> depend on the accuracy rating —
          the table shows the <b className="text-neutral-500">Fluent</b> row. Open a row to see
          all four. &nbsp;·&nbsp; Order matches the navbar; change it in one place and it
          changes everywhere.
        </p>
      </section>

      {/* ---------------- detail ---------------- */}
      <section className="mt-4 rounded-lg border border-neutral-300 dark:border-neutral-700">
        <div className="border-b border-neutral-300 dark:border-neutral-700 px-4 pb-3 pt-3.5">
          <div className="text-[12px] text-neutral-400">
            {selectedChain.slice(0, -1).map(n => n.label).join(' → ') || 'Module'}
          </div>
          <div
            className="text-[17px] font-semibold"
            style={selectedChain.length === 1
              ? { color: moduleMetaById(selectedId)?.accentHex } : undefined}
          >
            {selectedChain.length === 1
              ? (selectedChain[0]?.label ?? selectedId).toUpperCase()
              : selectedChain[selectedChain.length - 1]?.label ?? selectedId}
          </div>
          <div className="mt-1 text-[12.5px] text-neutral-500">
            {selectedChain.length > 1
              ? `Inherits ${selectedChain[selectedChain.length - 2].label} · `
              : ''}
            {ownPaths.size === 0
              ? 'nothing changed here'
              : `${ownPaths.size} value${ownPaths.size === 1 ? '' : 's'} changed here`}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <Switch
              on={selected.inSchedule}
              onClick={() => {
                const cur = overrides[selectedId]?.inSchedule;
                void update(selectedId, {
                  ...(overrides[selectedId] ?? {}),
                  inSchedule: cur === false ? true : false,
                });
              }}
            />
            <span className="text-[13px]">in the schedule</span>
            <Info text={INFO.inSchedule} />
          </div>
        </div>

        <div className="px-4 pb-4">
          {/* ---- acquiring ---- */}
          <h3 className="mb-1.5 mt-4 text-[11px] font-semibold uppercase
            tracking-[0.09em] text-fluent">
            Acquiring
            <span className="ml-2 normal-case tracking-normal font-normal text-neutral-400">
              the first few times you meet a card, before it has a rating
            </span>
          </h3>

          {isSongs ? (
            <p className="py-2 text-[13px] text-neutral-500">
              Songs do not go through Acquiring. A song is not met once and drilled to a
              rating — it is worked on and tested. This stage is inert here.
            </p>
          ) : (
            <>
              <div className="py-1.5 text-[13.5px]">
                How often it comes up<Info text={INFO.tally} />
                <small className="mt-0.5 block text-[11.5px] text-neutral-400">
                  Counting from the first time you ever see it
                </small>
              </div>
              <div className="my-1.5 flex flex-wrap gap-2">
                {v.acquiring.tally.map((count, day) => (
                  <div key={day} className={`min-w-[70px] rounded-md border border-neutral-300
                    dark:border-neutral-700 px-2 py-1.5 text-center ${count === 0 ? 'opacity-50' : ''}`}>
                    <div className="mb-1 text-[10.5px] uppercase tracking-[0.05em] text-neutral-400">
                      {day === 0 ? 'Day 0 · today' : `Day ${day}`}
                    </div>
                    <div className="inline-flex items-center overflow-hidden rounded
                      border border-neutral-300 dark:border-neutral-700">
                      <button
                        type="button" aria-label={`one fewer on day ${day}`}
                        onClick={() => {
                          const t = [...v.acquiring.tally];
                          t[day] = Math.max(0, t[day] - 1);
                          setPatch({ acquiring: { tally: t } });
                        }}
                        className="px-2 py-0.5 text-[13px] text-neutral-400 hover:text-fluent"
                      >−</button>
                      <b className="min-w-[38px] px-2 text-center font-mono text-[14px] font-medium">
                        {count}
                      </b>
                      <button
                        type="button" aria-label={`one more on day ${day}`}
                        onClick={() => {
                          const t = [...v.acquiring.tally];
                          t[day] = t[day] + 1;
                          setPatch({ acquiring: { tally: t } });
                        }}
                        className="px-2 py-0.5 text-[13px] text-neutral-400 hover:text-fluent"
                      >+</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* SOFT. These warn and never block, and never prevent saving. */}
              {tallyWarnings(v.acquiring.tally).length === 0 ? (
                <div className="mt-1 text-[12.5px] text-fluent">✓ {tallySummary(v.acquiring.tally)}</div>
              ) : (
                tallyWarnings(v.acquiring.tally).map(w => (
                  <div key={w.id} className="mt-1 flex gap-2 text-[12.5px] text-developing">
                    <span aria-hidden>⚠</span><span>{w.text}</span>
                  </div>
                ))
              )}

              <div className="mt-3 flex items-center gap-3 border-b
                border-neutral-200 dark:border-neutral-800 py-2">
                <div className="flex-1 text-[13.5px]">
                  When you get it right<Info text={INFO.acquiringRight} />
                </div>
                <div className="font-mono text-[13px] text-neutral-500">carry on with the pattern</div>
                <div className="min-w-[130px] text-right"><SourceNote label="always" changed={false} /></div>
              </div>
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 text-[13.5px]">
                  When you get it wrong<Info text={INFO.acquiringWrong} />
                </div>
                <select
                  value={v.acquiring.onWrong}
                  onChange={e => setPatch({
                    acquiring: { onWrong: e.target.value as AcquiringMissPolicy },
                  })}
                  className="rounded border border-neutral-300 dark:border-neutral-700
                    bg-transparent px-2 py-1 text-[13px]"
                >
                  {ACQUIRING_MISS_LABELS.map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
                <div className="min-w-[130px] text-right">
                  <SourceNote {...sourceFor('acquiring.onWrong')} />
                </div>
              </div>
            </>
          )}

          {/* ---- maintaining ---- */}
          <h3 className="mb-1.5 mt-5 text-[11px] font-semibold uppercase
            tracking-[0.09em] text-fluent">
            Maintaining
            <span className="ml-2 normal-case tracking-normal font-normal text-neutral-400">
              once it has a rating
            </span>
          </h3>

          <div className="flex items-center gap-3 border-b border-neutral-200
            dark:border-neutral-800 py-2">
            <div className="flex-1 text-[13.5px]">
              First time it comes back<Info text={INFO.firstWait} />
              <small className="mt-0.5 block text-[11.5px] text-neutral-400">
                The very first wait after it graduates, before the rating caps it
              </small>
            </div>
            <NumberBox
              value={v.maintaining.firstWaitDays}
              changed={ownPaths.has('maintaining.firstWaitDays')}
              onChange={n => setPatch({ maintaining: { firstWaitDays: n } })}
            />
            <div className="min-w-[130px] text-right">
              <SourceNote {...sourceFor('maintaining.firstWaitDays')} />
            </div>
          </div>

          <p className="mt-2.5 mb-1 max-w-[640px] rounded-md border border-neutral-300
            dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/60 px-3 py-2.5
            text-[12.5px] leading-relaxed text-neutral-600 dark:text-neutral-300">
            {INFO.bandRules}
          </p>

          <div className="flex justify-end gap-2.5 pb-0.5 pt-2.5 text-[10.5px]
            font-semibold uppercase tracking-[0.06em] text-neutral-400">
            <span className="min-w-[96px] text-right">Comes back in</span>
            <span className="min-w-[96px] text-right">Never longer than</span>
          </div>

          {ACCURACY_BANDS.map(band => (
            <div key={band.id} className="border-b border-neutral-200
              dark:border-neutral-800 py-2.5 last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="flex min-w-[126px] items-center gap-2 text-[13.5px] font-semibold">
                  <span className="h-2.5 w-2.5 rounded-[2px]"
                    style={{ background: band.hex }} aria-hidden />
                  {band.label}
                </div>
                <div className="ml-auto flex items-center gap-2.5">
                  <GrowthBox
                    settings={v}
                    band={band.id}
                    changed={ownPaths.has(`maintaining.perBand.${band.id}.growth`)}
                    onChange={g => setPatch({
                      maintaining: { perBand: { [band.id]: { growth: g } } },
                    })}
                  />
                  <NumberBox
                    value={v.maintaining.perBand[band.id].ceilingDays}
                    changed={ownPaths.has(`maintaining.perBand.${band.id}.ceilingDays`)}
                    onChange={n => setPatch({
                      maintaining: { perBand: { [band.id]: { ceilingDays: n } } },
                    })}
                  />
                </div>
              </div>
              {/* LIVE PREVIEW — the real scheduler, not a second
                  implementation of the arithmetic. */}
              <div className="mt-1.5 pl-0.5 font-mono text-[12.5px] text-neutral-500">
                <span className="mr-2 text-[11px] uppercase tracking-[0.05em] text-neutral-400">
                  days
                </span>
                {previewSequence(v, band.id).join(' · ')}
                <em className="not-italic text-neutral-400">
                  {' '}— then holds at {Math.round(v.maintaining.perBand[band.id].ceilingDays)}
                </em>
              </div>
            </div>
          ))}

          <div className="mt-2 flex items-center gap-3 border-b border-neutral-200
            dark:border-neutral-800 py-2">
            <div className="flex-1 text-[13.5px]">
              When you get it wrong<Info text={INFO.maintainingWrong} />
            </div>
            <select
              value={v.maintaining.onWrong}
              onChange={e => setPatch({
                maintaining: { onWrong: e.target.value as MaintainingMissPolicy },
              })}
              className="rounded border border-neutral-300 dark:border-neutral-700
                bg-transparent px-2 py-1 text-[13px]"
            >
              {MAINTAINING_MISS_LABELS.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
            <div className="min-w-[130px] text-right">
              <SourceNote {...sourceFor('maintaining.onWrong')} />
            </div>
          </div>
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 text-[13.5px]">
              Never shorter than<Info text={INFO.minimum} />
            </div>
            <NumberBox
              value={v.maintaining.minimumDays}
              changed={ownPaths.has('maintaining.minimumDays')}
              onChange={n => setPatch({ maintaining: { minimumDays: n } })}
            />
            <div className="min-w-[130px] text-right">
              <SourceNote {...sourceFor('maintaining.minimumDays')} />
            </div>
          </div>

          {/* ---- stale ---- */}
          <h3 className="mb-1.5 mt-5 text-[11px] font-semibold uppercase
            tracking-[0.09em] text-fluent">
            Stale
            <span className="ml-2 normal-case tracking-normal font-normal text-neutral-400">
              what happens when you don&rsquo;t come back
            </span>
          </h3>
          <div className="flex items-center gap-3 border-b border-neutral-200
            dark:border-neutral-800 py-2">
            <div className="flex-1 text-[13.5px]">
              Due soon warning<Info text={INFO.dueSoon} />
              <small className="mt-0.5 block text-[11.5px] text-neutral-400">
                A window before it is due — it is coming, not late
              </small>
            </div>
            <NumberBox
              value={v.stale.dueSoonDays}
              changed={ownPaths.has('stale.dueSoonDays')}
              onChange={n => setPatch({ stale: { dueSoonDays: n } })}
            />
            <div className="min-w-[130px] text-right">
              <SourceNote {...sourceFor('stale.dueSoonDays')} />
            </div>
          </div>
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 text-[13.5px]">
              Grace after it&rsquo;s due<Info text={INFO.grace} />
              <small className="mt-0.5 block text-[11.5px] text-neutral-400">
                You&rsquo;re late, but it isn&rsquo;t stale yet
              </small>
            </div>
            <NumberBox
              value={v.stale.graceDays}
              changed={ownPaths.has('stale.graceDays')}
              onChange={n => setPatch({ stale: { graceDays: n } })}
            />
            <div className="min-w-[130px] text-right">
              <SourceNote {...sourceFor('stale.graceDays')} />
            </div>
          </div>

          {ownPaths.size > 0 && (
            <button
              type="button"
              onClick={() => void update(selectedId, {})}
              className="mt-4 rounded-md border border-neutral-300 dark:border-neutral-700
                px-3 py-1.5 text-[12.5px] text-neutral-500 hover:border-fluent hover:text-fluent"
            >
              reset this level to inherited
            </button>
          )}
        </div>
      </section>

      {/* ---------------- recalculate ---------------- */}
      <section className="mt-4 rounded-lg border border-neutral-300 dark:border-neutral-700 p-4">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.09em] text-neutral-500">
          Recalculate everything now
        </h2>
        <p className="mt-1.5 max-w-[640px] text-[13px] text-neutral-500">
          Normal edits apply from the next time you answer a card — nothing already scheduled
          is rewritten. This is the exception: it applies every current setting to every card
          that already has a due date, immediately.
        </p>
        <button
          type="button"
          onClick={() => void openRecalc()}
          className="mt-3 rounded-md border border-neutral-300 dark:border-neutral-700
            px-3.5 py-2 text-[13px] hover:border-developing hover:text-developing"
        >
          recalculate everything now
        </button>
        {recalcNote && (
          <p className="mt-2 text-[12.5px] text-fluent">{recalcNote}</p>
        )}
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-5 text-[12px] text-neutral-500">
        <span className="flex items-center gap-2">
          <i className="inline-block h-3.5 w-6 rounded border border-neutral-300
            dark:border-neutral-700" /> set at this level
        </span>
        <span className="flex items-center gap-2">
          <i className="inline-block h-3.5 w-6 rounded border border-dashed
            border-neutral-400" /> inherited from above
        </span>
        <span className="flex items-center gap-2">
          <i className="inline-block h-3.5 w-6 rounded border border-developing/60" /> changed here
        </span>
      </div>

      <p className="mt-6 text-[12.5px] text-neutral-400">
        <Link to="/" className="hover:text-fluent">← back to the app</Link>
      </p>

      <ConfirmDialog
        open={confirmOpen}
        title="Recalculate every schedule?"
        message={
          affected === null
            ? 'Working out how many cards this would change…'
            : `${affected} card${affected === 1 ? '' : 's'} would have their due date `
              + `recomputed from the current settings. Cards you have not started are `
              + `unaffected. This cannot be undone.`
        }
        confirmLabel="recalculate"
        onConfirm={() => void runRecalc()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// =====================================================================
// Inputs
// =====================================================================

function NumberBox({ value, changed, onChange }: {
  value: number; changed: boolean; onChange: (n: number) => void;
}) {
  return (
    <input
      type="number"
      min={1}
      value={Math.round(value)}
      onChange={e => {
        const n = Number(e.target.value);
        if (Number.isFinite(n) && n >= 1) onChange(Math.round(n));
      }}
      className={`w-[96px] rounded border px-2 py-1 text-right font-mono text-[13px]
        bg-transparent ${changed
          ? 'border-developing text-developing'
          : 'border-dashed border-neutral-400 text-neutral-500'}`}
    />
  );
}

function GrowthBox({ settings, band, changed, onChange }: {
  settings: SpacingSettings;
  band: AccuracyBand;
  changed: boolean;
  onChange: (g: SpacingSettings['maintaining']['perBand'][AccuracyBand]['growth']) => void;
}) {
  const growth = settings.maintaining.perBand[band].growth;
  if (growth.kind === 'back-to-first') {
    return (
      <button
        type="button"
        onClick={() => onChange({ kind: 'multiply', factor: 1.5 })}
        className={`w-[96px] rounded border px-2 py-1 text-right font-mono text-[13px]
          ${changed ? 'border-developing text-developing'
            : 'border-dashed border-neutral-400 text-neutral-500'}`}
      >
        back to start
      </button>
    );
  }
  return (
    <input
      type="number"
      step={0.1}
      min={1.1}
      value={growth.factor}
      onChange={e => {
        const n = Number(e.target.value);
        if (Number.isFinite(n) && n > 1) onChange({ kind: 'multiply', factor: n });
      }}
      className={`w-[96px] rounded border px-2 py-1 text-right font-mono text-[13px]
        bg-transparent ${changed
          ? 'border-developing text-developing'
          : 'border-dashed border-neutral-400 text-neutral-500'}`}
    />
  );
}

/** Unused import guard — `DEFAULT_SPACING_SETTINGS` and `SETTINGS_PATHS`
 *  are re-exported for the tests that pin this screen's vocabulary. */
export const __COPY_KEYS = Object.keys(INFO);
export const __DEFAULTS = DEFAULT_SPACING_SETTINGS;
export const __PATHS = SETTINGS_PATHS;
