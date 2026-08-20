import { Fragment, useEffect, useRef, useState } from 'react';
import { useNotationMode } from '../../lib/notationPref';
import { chordToDisplay, patternNumeralToDisplay } from './chordFunction';
import { chordPalette, useIsDarkMode } from './chordColors';
import SequenceChoices, { type SequenceTarget } from './SequenceChoices';
import PhraseNote from './PhraseNote';
import { shouldOfferNote } from './sequenceView';
import type { ProgressionSection, ProgressionToken } from './progressionOutline';

/**
 * The whole song's chord movement, docked at the bottom of the lead
 * sheet beside the lyrics drawer.
 *
 * WHY SONG-LEVEL. Per-section framing gives section shapes but not the
 * song's arc, and sections resemble one another closely enough to be
 * mistaken at a glance — which has already caused a bug report about
 * chords that were never missing. Headings plus a continuous run gives
 * both readings from one view: scan the headings for shapes, read
 * straight down for the arc.
 *
 * TWO STRIPS, NOT A SWITCHER. Lyrics and Progressions each get their
 * own drawer. A tabbed panel remembers its last tab, so opening it
 * sometimes lands on the wrong content and costs a second tap; two
 * strips always open what was asked for. They are mutually exclusive —
 * opening one closes the other — so only one half-height panel is ever
 * competing for the screen. Positioning is NOT this component's job:
 * `LeadSheetDrawers` owns the one fixed box and stacks both drawers
 * inside it.
 *
 * IT IS A WORKING SURFACE, NOT A READING ONE. Breaks, notes and hides
 * are all editable here, writing to the same per-section
 * `sequenceView` the strip writes. Two windows onto one thing: split a
 * phrase here and the per-section view shows the split too.
 *
 * SECTION HEADINGS ARE READ-ONLY, and so is section order — song
 * structure is edited on the lead sheet. Only phrase structure is
 * editable here.
 *
 * A break cannot span a section boundary, because `sequenceView` is
 * stored per section and has no way to express one. Headings ARE the
 * boundary. If phrasing across a section line is ever wanted it needs
 * new storage, not a rework of this.
 */
export default function ProgressionDrawer({
  sections,
  songKey,
  open,
  onOpenChange,
  onSetBreak,
  onRemoveBreak,
  onSetPhraseNote,
  onToggleHidden,
  onUndo,
  undoDepth = 0,
  undoLabel,
}: {
  sections: ProgressionSection[];
  songKey: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetBreak: (
    sectionId: string,
    afterPlacementId: string,
    kind: 'separator' | 'row',
  ) => void | Promise<void>;
  onRemoveBreak: (sectionId: string, afterPlacementId: string) => void | Promise<void>;
  /** `undefined` afterPlacementId targets the section's final phrase,
   *  which has no break to hang its note on. */
  onSetPhraseNote: (
    sectionId: string,
    afterPlacementId: string | undefined,
    note: string,
  ) => void | Promise<void>;
  onToggleHidden: (sectionId: string, placementId: string) => void | Promise<void>;
  /** Reverses the last progression edit. Absent when there is nothing
   *  to undo — the control is hidden rather than disabled, so it never
   *  offers an action that would do nothing. */
  onUndo?: () => void | Promise<void>;
  undoDepth?: number;
  /** Names what will be reversed, so the control says what it does
   *  rather than only that it undoes. */
  undoLabel?: string;
}) {
  // ---- TEMPORARY DIAGNOSTIC ------------------------------------
  // The break control renders and is wired, and tapping it does
  // nothing on the deployed app. Three candidates remain and they need
  // different fixes, so this reports which one it is rather than
  // inviting a fourth speculative change:
  //   · handler never fires          → taps stays 0 (event swallowed)
  //   · state set then discarded     → taps rises, target stays none
  //   · component remounting         → instance id changes on tap
  // Remove once the cause is known.
  const [instanceId] = useState(() => Math.random().toString(36).slice(2, 7));
  const renders = useRef(0);
  renders.current += 1;
  const [taps, setTaps] = useState(0);
  const [lastEvent, setLastEvent] = useState('none');
  // ---------------------------------------------------------------

  const [notationMode] = useNotationMode();
  const isDark = useIsDarkMode();
  const [editing, setEditing] = useState(false);
  /** Hidden chords are OFF by default — a clean read is the whole
   *  point of hiding. The toggle reveals them greyed, in place. */
  const [revealHidden, setRevealHidden] = useState(false);
  const [target, setTarget] = useState<
    (SequenceTarget & { sectionId: string }) | null
  >(null);
  /** Which sections have their patterns list expanded. Collapsed by
   *  default: the list is carried so it costs nothing to reach, not
   *  because it earns the space. */
  const [openPatterns, setOpenPatterns] = useState<Set<string>>(new Set());

  // Leaving edit mode closes any open choices row — an editor that is
  // no longer editing should not leave a live control behind.
  useEffect(() => {
    if (!editing) setTarget(null);
  }, [editing]);
  useEffect(() => {
    if (!open) {
      setEditing(false);
      setTarget(null);
    }
  }, [open]);

  const totalHidden = sections.reduce((n, s) => n + s.hiddenCount, 0);
  const totalChords = sections.reduce((n, s) => n + s.order.length, 0);

  const labelFor = (t: ProgressionToken) =>
    chordToDisplay(t.chord, notationMode, songKey);

  return (
    <div
      data-progression-drawer=""
      /* Same radius, border, fill and elevation as the lyrics drawer:
         they are siblings in one stack and should read as one family.
         Positioning belongs to `LeadSheetDrawers`. */
      className="rounded-xl border border-repertoire-200 dark:border-repertoire-600 bg-chrome-50 dark:bg-chrome-800 shadow-[0_2px_16px_rgba(0,0,0,0.16)] overflow-hidden"
    >
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-stone-600 dark:text-stone-300 hover:text-fluent"
      >
        <span aria-hidden className="text-[9px] leading-none">
          {open ? '▾' : '▸'}
        </span>
        progressions
        <span className="font-normal normal-case tracking-normal text-neutral-500 dark:text-neutral-400">
          {totalChords === 0
            ? '· no chords yet'
            : `· ${totalChords} chord${totalChords === 1 ? '' : 's'}${
                totalHidden > 0 ? `, ${totalHidden} hidden` : ''
              }`}
        </span>
      </button>

      {open && (
        <div
          className="overflow-y-auto px-3 pb-3 pt-2 flex flex-col gap-3 border-t border-repertoire-200 dark:border-repertoire-600 bg-white dark:bg-neutral-900"
          style={{ maxHeight: '50vh' }}
        >
          <div className="flex items-center gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => setEditing(v => !v)}
              aria-pressed={editing}
              className={`px-2 py-0.5 rounded-full border ${
                editing
                  ? 'border-fluent bg-fluent/10 text-fluent'
                  : 'border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
              }`}
            >
              {editing ? 'done' : 'edit'}
            </button>
            {onUndo && undoDepth > 0 && editing && (
              <button
                type="button"
                onClick={() => void onUndo()}
                title={undoLabel ? `undo ${undoLabel}` : 'undo the last change'}
                className="px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent"
              >
                ↶ undo{undoLabel ? ` ${undoLabel}` : ''}
              </button>
            )}
            {editing && (
              <span className="ml-auto font-mono text-[9px] leading-tight text-neutral-500 text-right">
                #{instanceId} r{renders.current} taps{taps}
                <br />
                tgt {target ? `${target.placementId?.slice(0, 6) ?? 'undef'}@${target.sectionId.slice(0, 6)}` : 'none'}
                <br />
                {lastEvent}
              </span>
            )}
            {totalHidden > 0 && (
              <button
                type="button"
                onClick={() => setRevealHidden(v => !v)}
                aria-pressed={revealHidden}
                className={`px-2 py-0.5 rounded-full border ${
                  revealHidden
                    ? 'border-fluent bg-fluent/10 text-fluent'
                    : 'border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
                }`}
              >
                {revealHidden ? 'hide hidden' : `show hidden (${totalHidden})`}
              </button>
            )}
          </div>

          {sections.length === 0 ? (
            <p className="text-[11px] text-neutral-500 italic py-2">
              no chords yet.
            </p>
          ) : (
            sections.map(section => (
              <section key={section.sectionId} className="flex flex-col gap-1">
                {/* Read-only: song structure is edited on the lead
                    sheet, not here. */}
                <h3 className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {section.heading}
                </h3>

                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[11px] min-w-0">
                  {section.phrases.map((phrase, pi) => {
                    const shown = phrase.tokens.filter(
                      t => !t.hidden || revealHidden,
                    );
                    return (
                      <Fragment
                        key={phrase.endsAfterPlacementId ?? `tail-${pi}`}
                      >
                        <span className="text-neutral-700 dark:text-neutral-200">
                          {shown.map((token, i) => (
                            <span key={token.key}>
                              {i > 0 && !editing && (
                                <span className="text-neutral-400"> · </span>
                              )}
                              {editing && i > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setTarget({
                                      kind: 'gap',
                                      placementId: shown[i - 1].placementId,
                                      sectionId: section.sectionId,
                                    })
                                  }
                                  aria-label={`break after ${labelFor(
                                    shown[i - 1],
                                  )}`}
                                  className="inline-block min-w-[10px] min-h-[20px] mx-0.5 align-middle rounded-sm border border-dashed border-neutral-300 dark:border-neutral-700 hover:bg-fluent/10 hover:border-fluent"
                                />
                              )}
                              <button
                                type="button"
                                /* A greyed chord is tappable even when
                                   not editing — that is the unhide
                                   gesture, matching the lyric row's
                                   tap-to-place. Editing a visible one
                                   opens the choices row instead. */
                                disabled={!editing && !token.hidden}
                                onClick={() => {
                                  if (token.hidden && !editing) {
                                    void onToggleHidden(
                                      section.sectionId,
                                      token.placementId,
                                    );
                                    return;
                                  }
                                  setTarget({
                                    kind: 'token',
                                    placementId: token.placementId,
                                    sectionId: section.sectionId,
                                  });
                                }}
                                aria-label={
                                  token.hidden
                                    ? `${labelFor(token)} — hidden, tap to show`
                                    : labelFor(token)
                                }
                                style={
                                  token.hidden
                                    ? undefined
                                    : { color: chordPalette(token.chord, isDark).text }
                                }
                                className={
                                  token.hidden
                                    ? 'rounded px-0.5 line-through text-neutral-400 dark:text-neutral-500 hover:bg-fluent/10 hover:text-fluent'
                                    : editing
                                      ? 'rounded px-0.5 hover:bg-fluent/10'
                                      : 'cursor-default'
                                }
                              >
                                {labelFor(token)}
                              </button>
                            </span>
                          ))}
                        </span>
                        {phrase.endKind === 'separator' &&
                          (editing ? (
                            <button
                              type="button"
                              onClick={() =>
                                setTarget({
                                  kind: 'gap',
                                  placementId: phrase.endsAfterPlacementId!,
                                  sectionId: section.sectionId,
                                })
                              }
                              aria-label="edit this break"
                              className="text-fluent px-1 rounded hover:bg-fluent/10"
                            >
                              |
                            </button>
                          ) : (
                            <span className="text-neutral-400" aria-hidden>
                              |
                            </span>
                          ))}
                        {/* IMMEDIATELY AFTER THE CHORDS, before the
                            note field. The note field is `basis-full`
                            in edit mode, so anything rendered after it
                            is pushed onto a line of its own — which is
                            where this control used to sit: two lines
                            below the break it belongs to, with an empty
                            textarea occupying the spot the user
                            actually taps. It marks a break, so it has
                            to sit AT the break. */}
                        {phrase.endKind === 'row' && editing && (
                          <button
                            type="button"
                            onClick={e => {
                              setTaps(n => n + 1);
                              setLastEvent(
                                `row tap · ${phrase.endsAfterPlacementId ?? 'NO-ANCHOR'} · sec ${section.sectionId.slice(0, 6)} · default ${e.defaultPrevented ? 'prevented' : 'ok'}`,
                              );
                              setTarget({
                                kind: 'gap',
                                placementId: phrase.endsAfterPlacementId!,
                                sectionId: section.sectionId,
                              });
                            }}
                            aria-label="edit this line break"
                            title="line break — convert or remove"
                            className="px-1 rounded border border-fluent/40 text-fluent hover:bg-fluent/10"
                          >
                            ⏎
                          </button>
                        )}
                        {shouldOfferNote(phrase, editing, shown.length > 0) && (
                          <PhraseNote
                            note={phrase.note}
                            editing={editing}
                            /* RETURNED, not voided: PhraseNote awaits
                               this to decide between a tick and a
                               failure. Discarding it makes every write
                               look successful. */
                            onChange={next =>
                              onSetPhraseNote(
                                section.sectionId,
                                phrase.endsAfterPlacementId,
                                next,
                              )
                            }
                          />
                        )}
                        {phrase.endKind === 'row' && (
                          <span className="basis-full" aria-hidden />
                        )}
                      </Fragment>
                    );
                  })}
                </div>

                {/* TEMPORARY: a sentinel at the menu's own render
                    site. Seeing it but no chips means SequenceChoices
                    mounts and its content is hidden or collapsed; not
                    seeing it means the condition below never became
                    true. Those need different fixes. */}
                {target !== null && (
                  <div className="text-[9px] font-mono text-white bg-needswork px-1 rounded">
                    menu slot · target sec {target.sectionId.slice(0, 6)} · this sec{' '}
                    {section.sectionId.slice(0, 6)} ·{' '}
                    {target.sectionId === section.sectionId ? 'MATCH' : 'no match'}
                  </div>
                )}
                {target?.sectionId === section.sectionId && (
                  <SequenceChoices
                    target={target}
                    label={
                      section.phrases
                        .flatMap(p => p.tokens)
                        .filter(t => t.placementId === target.placementId)
                        .map(labelFor)[0] ?? ''
                    }
                    hasBreak={section.phrases.some(
                      p => p.endsAfterPlacementId === target.placementId,
                    )}
                    existingKind={
                      section.phrases.find(
                        p => p.endsAfterPlacementId === target.placementId,
                      )?.endKind === 'row'
                        ? 'row'
                        : section.phrases.some(
                              p => p.endsAfterPlacementId === target.placementId,
                            )
                          ? 'separator'
                          : null
                    }
                    hidden={section.phrases
                      .flatMap(p => p.tokens)
                      .some(t => t.placementId === target.placementId && t.hidden)}
                    onSetBreak={(after, kind) => {
                      setTarget(null);
                      void onSetBreak(section.sectionId, after, kind);
                    }}
                    onRemoveBreak={after => {
                      setTarget(null);
                      void onRemoveBreak(section.sectionId, after);
                    }}
                    onToggleHidden={id => {
                      setTarget(null);
                      void onToggleHidden(section.sectionId, id);
                    }}
                    onClose={() => setTarget(null)}
                  />
                )}

                {section.patterns.length > 0 && (
                  <div className="text-[10px]">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPatterns(prev => {
                          const next = new Set(prev);
                          if (next.has(section.sectionId)) {
                            next.delete(section.sectionId);
                          } else next.add(section.sectionId);
                          return next;
                        })
                      }
                      aria-expanded={openPatterns.has(section.sectionId)}
                      className="text-neutral-500 hover:text-fluent uppercase tracking-wide"
                    >
                      <span aria-hidden className="text-[9px]">
                        {openPatterns.has(section.sectionId) ? '▾' : '▸'}
                      </span>{' '}
                      patterns · {section.patterns.length}
                    </button>
                    {openPatterns.has(section.sectionId) && (
                      <ul className="pl-3 pt-1 flex flex-col gap-0.5 text-neutral-600 dark:text-neutral-300">
                        {section.patterns.map((m, i) => (
                          <li key={`${m.patternId}-${m.matchIndex}-${i}`}>
                            {m.numerals
                              .map(n => patternNumeralToDisplay(n, notationMode, songKey))
                              .join(' · ')}
                            <span className="text-neutral-400">
                              {' '}
                              ·{' '}
                              {m.startBar === m.endBar
                                ? `bar ${m.startBar + 1}`
                                : `bars ${m.startBar + 1}–${m.endBar + 1}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
