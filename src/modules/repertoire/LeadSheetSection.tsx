import { useMemo, useState, useEffect } from 'react';
import type { Song, SongSection } from '../../lib/db';
import {
  DEFAULT_STAGE,
  STAGES,
  STAGE_BADGE_CLASS,
  STAGE_LABEL,
} from './stage';
import { parseChord, parseChordChart, chartToNumerals } from './chordParser';
import { detectProgressions } from '../../lib/progressionDetection';

interface Props {
  song: Song;
  section: SongSection;
  onChange: (patch: Partial<SongSection>) => Promise<void>;
  onDelete?: () => Promise<void>;
}

/**
 * Per-section lead sheet: lyrics + basic chord chart + optional
 * alternates + notes + per-section stage + hide/strikethrough controls.
 *
 * The chord chart is stored as a raw string (space-separated tokens);
 * parsing happens at render time. When a chord fails to parse, the
 * token renders with a ⚠ marker but still saves unchanged — cross-
 * module features just won't understand it.
 */
export default function LeadSheetSection({ song, section, onChange, onDelete }: Props) {
  const stage = section.stage ?? song.stage ?? DEFAULT_STAGE;
  const [editingLyrics, setEditingLyrics] = useState(false);
  const [showAlternates, setShowAlternates] = useState(false);
  const [showNotes, setShowNotes] = useState(Boolean(section.notes));

  // Local drafts — keep typing responsive; commit to DB on blur.
  const [lyricsDraft, setLyricsDraft] = useState(section.lyrics);
  const [basicDraft, setBasicDraft] = useState(section.basicChords ?? '');
  const [altDraft, setAltDraft] = useState(section.alternateChords ?? '');
  const [altNoteDraft, setAltNoteDraft] = useState(section.alternateNote ?? '');
  const [notesDraft, setNotesDraft] = useState(section.notes ?? '');

  // Re-sync drafts when a different section flows in (the user rotated
  // to a different song / reordered sections), but don't stomp on
  // in-flight edits if it's the same section.
  useEffect(() => {
    setLyricsDraft(section.lyrics);
    setBasicDraft(section.basicChords ?? '');
    setAltDraft(section.alternateChords ?? '');
    setAltNoteDraft(section.alternateNote ?? '');
    setNotesDraft(section.notes ?? '');
  }, [section.id]);

  const commit = (patch: Partial<SongSection>) => onChange(patch);

  const lyricLines = useMemo(() => section.lyrics.split('\n'), [section.lyrics]);

  // Parsed chord tokens for the display row — keyed off the basic
  // chord chart so hiding alternates doesn't recompute unnecessarily.
  const parsedBasic = useMemo(
    () => parseChordChart(section.basicChords ?? ''),
    [section.basicChords],
  );

  // Progression detection off the basic chord chart. Runs whenever the
  // user's basic chart or the song's key changes; empty / short charts
  // produce no matches.
  const progressionMatches = useMemo(() => {
    if (!song.key || !section.basicChords) return [];
    const numerals = chartToNumerals(section.basicChords, song.key);
    if (numerals.length < 2) return [];
    return detectProgressions(numerals);
  }, [section.basicChords, song.key]);

  const toggleStrike = async (lineIdx: number) => {
    const current = section.struckLines ?? [];
    const has = current.includes(lineIdx);
    const next = has
      ? current.filter(n => n !== lineIdx)
      : [...current, lineIdx].sort((a, b) => a - b);
    await commit({ struckLines: next });
  };

  const setSectionStage = async (next: SongSection['stage']) => {
    await commit({ stage: next });
  };

  return (
    <div
      className={`rounded-lg border ${section.hidden ? 'border-dashed opacity-70' : 'border-neutral-200 dark:border-neutral-800'} p-3 space-y-3`}
    >
      {/* Header row: name + stage + actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{section.name}</span>
          <label className="text-[11px] text-neutral-500 flex items-center gap-1">
            stage:
            <select
              value={stage}
              onChange={e => setSectionStage(e.target.value as SongSection['stage'])}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-[11px]"
            >
              {STAGES.map(s => (
                <option key={s} value={s}>{STAGE_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <span
            className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${STAGE_BADGE_CLASS[stage]}`}
          >
            {STAGE_LABEL[stage]}
          </span>
          {section.lyricsNeedsVerification && (
            <span
              className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-developing/40 bg-developing/10 text-developing"
              title="seeded without verified lyrics — transcribe from the recording"
            >
              needs verification
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            onClick={() => commit({ hidden: !section.hidden })}
            className="text-neutral-500 hover:text-fluent"
          >
            {section.hidden ? 'unhide section' : 'hide section'}
          </button>
          {onDelete && (
            <button
              onClick={async () => {
                if (confirm(`Delete section "${section.name}"? This can\'t be undone.`)) {
                  await onDelete();
                }
              }}
              className="text-neutral-500 hover:text-needswork"
            >
              delete
            </button>
          )}
        </div>
      </div>

      {section.hidden ? (
        <p className="text-xs text-neutral-500 italic">section hidden — won't show in your practice view.</p>
      ) : (
        <>
          {/* Basic chord chart editor — single-line for now; user types
              tokens separated by spaces. Parsed tokens show with
              cleaned display; unparseable ones flag a warning. */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">basic chords</div>
            <input
              value={basicDraft}
              onChange={e => setBasicDraft(e.target.value)}
              onBlur={() => basicDraft !== (section.basicChords ?? '') && commit({ basicChords: basicDraft })}
              placeholder="e.g. Am7  G/B  Cmaj7  F9"
              className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm font-mono"
            />
            {parsedBasic.length > 0 && (
              <div className="flex flex-wrap gap-1 text-[11px]">
                {parsedBasic.map((c, i) => (
                  <span
                    key={i}
                    title={c.parsed
                      ? `root ${c.root}, quality ${c.quality}${c.extensions.length ? ', ' + c.extensions.join(' ') : ''}${c.bass ? ', bass ' + c.bass : ''}`
                      : 'couldn\'t parse this — saved as text. cross-module features won\'t light up.'}
                    className={`font-mono rounded border px-1.5 py-0.5 ${
                      c.parsed
                        ? 'border-fluent/30 bg-fluent/5 text-fluent'
                        : 'border-developing/40 bg-developing/10 text-developing'
                    }`}
                  >
                    {!c.parsed && <span aria-hidden className="mr-1">⚠</span>}
                    {c.rawText}
                  </span>
                ))}
              </div>
            )}
            {progressionMatches.length > 0 && (
              <div className="flex flex-wrap gap-2 text-[11px] text-neutral-500 pt-1">
                <span className="uppercase tracking-wide">detected:</span>
                {progressionMatches.slice(0, 3).map(m => (
                  <span
                    key={m.progressionId}
                    className="inline-flex items-center gap-1 rounded-full border border-fluent/30 bg-fluent/10 text-fluent px-2 py-0.5"
                    title={`Tier ${m.tier} · ${m.tierName} · match type: ${m.matchType}`}
                  >
                    <span aria-hidden>📍</span>
                    {m.progressionName}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Lyrics area — readable by default, click "edit lyrics" to
              swap in a textarea. Strike-through and verification hints
              live on the display mode. */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">lyrics</div>
              <button
                onClick={() => setEditingLyrics(v => !v)}
                className="text-[11px] text-neutral-500 hover:text-fluent"
              >
                {editingLyrics ? 'done' : 'edit'}
              </button>
            </div>
            {editingLyrics ? (
              <textarea
                rows={Math.max(3, lyricLines.length + 1)}
                value={lyricsDraft}
                onChange={e => setLyricsDraft(e.target.value)}
                onBlur={() => lyricsDraft !== section.lyrics && commit({ lyrics: lyricsDraft })}
                className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm leading-relaxed"
              />
            ) : (
              <div className="rounded-md bg-neutral-50 dark:bg-neutral-900/60 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                {section.lyrics.length === 0 ? (
                  <span className="italic text-neutral-400">
                    {section.lyricsNeedsVerification
                      ? 'add lyrics from the original recording — the seed skipped this section to avoid fabricating.'
                      : 'no lyrics yet — click edit to add them.'}
                  </span>
                ) : (
                  lyricLines.map((line, i) => {
                    const struck = (section.struckLines ?? []).includes(i);
                    return (
                      <div
                        key={i}
                        className={`group flex items-start gap-2 ${struck ? 'line-through text-neutral-400' : ''}`}
                      >
                        <button
                          onClick={() => toggleStrike(i)}
                          title={struck ? 'unmark — you play this line' : 'mark as not playing this line'}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-neutral-400 hover:text-needswork shrink-0 mt-0.5"
                        >
                          ✕
                        </button>
                        <span className="flex-1">{line || ' '}</span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Alternates — collapsible. A second chord chart the user
              explores. Has its own note field explaining when / why. */}
          <div className="space-y-1">
            <button
              onClick={() => setShowAlternates(v => !v)}
              className="text-[11px] text-neutral-500 hover:text-fluent"
            >
              {showAlternates ? '▴ hide alternates' : '▸ show alternates / substitutions'}
            </button>
            {showAlternates && (
              <div className="space-y-2">
                <input
                  value={altDraft}
                  onChange={e => setAltDraft(e.target.value)}
                  onBlur={() => altDraft !== (section.alternateChords ?? '') && commit({ alternateChords: altDraft })}
                  placeholder="alternate chord chart — e.g. Am9 G/B Cmaj9 F6/9"
                  className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm font-mono"
                />
                <textarea
                  rows={2}
                  value={altNoteDraft}
                  onChange={e => setAltNoteDraft(e.target.value)}
                  onBlur={() => altNoteDraft !== (section.alternateNote ?? '') && commit({ alternateNote: altNoteDraft })}
                  placeholder="why this alternate works — e.g. extensions brighten the chorus, voicing lets the melody sit on top"
                  className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs"
                />
              </div>
            )}
          </div>

          {/* Notes — collapsible until the user has something to say. */}
          <div className="space-y-1">
            <button
              onClick={() => setShowNotes(v => !v)}
              className="text-[11px] text-neutral-500 hover:text-fluent"
            >
              {showNotes ? '▴ hide notes' : '▸ section notes'}
            </button>
            {showNotes && (
              <textarea
                rows={2}
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                onBlur={() => notesDraft !== (section.notes ?? '') && commit({ notes: notesDraft })}
                placeholder="thoughts, voicing ideas, performance cues"
                className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Re-export the parser so consumers can re-use it without a separate
// import path. Keeps the module's public surface compact.
export { parseChord };
