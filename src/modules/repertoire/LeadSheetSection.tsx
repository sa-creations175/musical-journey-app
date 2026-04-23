import { useEffect, useMemo, useRef, useState } from 'react';
import type { Phrase, Song, SongSection } from '../../lib/db';
import {
  DEFAULT_STAGE,
  STAGES,
  STAGE_BADGE_CLASS,
  STAGE_LABEL,
} from './stage';
import { parseChord, parseChordChart, chartToNumerals } from './chordParser';
import { detectProgressions } from '../../lib/progressionDetection';
import { useToast } from '../../components/Toaster';

interface Props {
  song: Song;
  section: SongSection;
  /** True when this section can move up (i.e. not the first). */
  canMoveUp: boolean;
  /** True when this section can move down (i.e. not the last). */
  canMoveDown: boolean;
  /** Flash the whole card when true — used for freshly-added / moved sections. */
  highlighted?: boolean;
  /** Which phrase id (if any) should flash briefly. */
  highlightedPhraseId?: string | null;
  onChange: (patch: Partial<SongSection>) => Promise<void>;
  onMoveUp?: () => Promise<void>;
  onMoveDown?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  /** Called by the phrase-line "+ add phrase line" button so the parent
   *  can trigger scroll-and-flash on the new row. */
  onPhraseAdded?: (phraseId: string) => void;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

/**
 * Derive the phrase list for rendering. When `phrases` exists, it is
 * authoritative. Otherwise we fall back to splitting the legacy
 * `lyrics` blob on newlines so pre-phrase-refactor seed data still
 * renders sensibly. Empty sections collapse to a single blank phrase
 * so the "+ add phrase line" affordance is always reachable.
 */
function derivePhrases(section: SongSection): Phrase[] {
  if (section.phrases && section.phrases.length > 0) return section.phrases;
  if (section.lyrics.trim() === '') return [];
  return section.lyrics.split('\n').map(line => ({
    id: uid('phrase'),
    chords: '',
    lyrics: line,
  }));
}

export default function LeadSheetSection({
  song,
  section,
  canMoveUp,
  canMoveDown,
  highlighted,
  highlightedPhraseId,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
  onPhraseAdded,
}: Props) {
  const stage = section.stage ?? song.stage ?? DEFAULT_STAGE;
  const [showAlternates, setShowAlternates] = useState(Boolean(section.alternateChords));
  const [showNotes, setShowNotes] = useState(Boolean(section.notes));
  const { toast } = useToast();

  const [altDraft, setAltDraft] = useState(section.alternateChords ?? '');
  const [altNoteDraft, setAltNoteDraft] = useState(section.alternateNote ?? '');
  const [notesDraft, setNotesDraft] = useState(section.notes ?? '');
  const [nameDraft, setNameDraft] = useState(section.name);
  const [editingName, setEditingName] = useState(false);

  // Re-sync drafts when a different section scrolls into view.
  useEffect(() => {
    setAltDraft(section.alternateChords ?? '');
    setAltNoteDraft(section.alternateNote ?? '');
    setNotesDraft(section.notes ?? '');
    setNameDraft(section.name);
    setEditingName(false);
  }, [section.id]);

  // Phrases are always derived — never trust a stale render.
  const phrases = useMemo(() => derivePhrases(section), [section]);

  const commit = (patch: Partial<SongSection>) => onChange(patch);

  const writePhrases = async (next: Phrase[]) => {
    await commit({ phrases: next });
  };

  const updatePhrase = async (phraseId: string, patch: Partial<Phrase>) => {
    const next = phrases.map(p => (p.id === phraseId ? { ...p, ...patch } : p));
    await writePhrases(next);
  };

  const movePhrase = async (phraseId: string, dir: -1 | 1) => {
    const idx = phrases.findIndex(p => p.id === phraseId);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= phrases.length) return;
    const next = phrases.slice();
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    await writePhrases(next);
  };

  const addPhrase = async () => {
    const newId = uid('phrase');
    const next = [...phrases, { id: newId, chords: '', lyrics: '' }];
    await writePhrases(next);
    onPhraseAdded?.(newId);
  };

  // Delete-with-undo: remove the phrase, raise a toast that restores
  // it in-place when the user hits Undo.
  const deletePhrase = async (phraseId: string) => {
    const idx = phrases.findIndex(p => p.id === phraseId);
    if (idx < 0) return;
    const removed = phrases[idx];
    const next = phrases.filter(p => p.id !== phraseId);
    await writePhrases(next);
    toast({
      message: removed.lyrics.trim() === '' && removed.chords.trim() === ''
        ? 'Line deleted.'
        : `Line deleted: "${(removed.lyrics || removed.chords).slice(0, 50)}"`,
      variant: 'warning',
      action: {
        label: 'Undo',
        onClick: async () => {
          const restored = [...phrases];
          restored.splice(idx, 0, removed);
          await writePhrases(restored);
        },
      },
    });
  };

  const deleteAlternate = async () => {
    const snap = { alternateChords: section.alternateChords ?? '', alternateNote: section.alternateNote ?? '' };
    if (snap.alternateChords === '' && snap.alternateNote === '') return;
    await commit({ alternateChords: undefined, alternateNote: undefined });
    setAltDraft('');
    setAltNoteDraft('');
    toast({
      message: 'Alternate cleared.',
      variant: 'warning',
      action: {
        label: 'Undo',
        onClick: async () => {
          await commit({
            alternateChords: snap.alternateChords || undefined,
            alternateNote: snap.alternateNote || undefined,
          });
          setAltDraft(snap.alternateChords);
          setAltNoteDraft(snap.alternateNote);
        },
      },
    });
  };

  // Progression detection across the whole section — all chord tokens
  // from every phrase concatenated in order.
  const allChordTokens = useMemo(() => (
    phrases.flatMap(p => p.chords.split(/\s+/).filter(Boolean))
  ), [phrases]);
  const progressionMatches = useMemo(() => {
    if (!song.key || allChordTokens.length < 2) return [];
    const chartText = allChordTokens.join(' ');
    const numerals = chartToNumerals(chartText, song.key);
    if (numerals.length < 2) return [];
    return detectProgressions(numerals);
  }, [allChordTokens, song.key]);

  const setSectionStage = async (next: SongSection['stage']) => {
    await commit({ stage: next });
  };

  return (
    <div
      id={`section-${section.id}`}
      className={`rounded-lg border p-3 space-y-3 ${
        section.hidden
          ? 'border-dashed opacity-70'
          : 'border-neutral-200 dark:border-neutral-800'
      } ${highlighted ? 'repertoire-flash' : ''}`}
    >
      {/* Header: name / stage / reorder / hide / delete */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onBlur={async () => {
                const trimmed = nameDraft.trim() || section.name;
                if (trimmed !== section.name) await commit({ name: trimmed });
                setEditingName(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { setNameDraft(section.name); setEditingName(false); }
              }}
              className="font-medium text-sm rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-0.5"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="font-medium text-sm hover:text-fluent"
              title="click to rename"
            >
              {section.name}
            </button>
          )}
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
        <div className="flex items-center gap-1 text-[11px]">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp || !onMoveUp}
            title="move section up"
            className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-fluent hover:border-fluent disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown || !onMoveDown}
            title="move section down"
            className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-fluent hover:border-fluent disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↓
          </button>
          <button
            onClick={() => commit({ hidden: !section.hidden })}
            className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-fluent hover:border-fluent"
            title={section.hidden ? 'unhide section' : 'hide section'}
          >
            {section.hidden ? 'unhide' : 'hide'}
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-needswork hover:border-needswork"
              title="delete section"
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
          {/* Phrase lines */}
          {phrases.length === 0 ? (
            <p className="text-xs text-neutral-500 italic">
              {section.lyricsNeedsVerification
                ? 'no lyrics seeded — transcribe from the recording and click "+ add phrase line" to start.'
                : 'no phrase lines yet — click "+ add phrase line" to start.'}
            </p>
          ) : (
            <div className="space-y-2">
              {phrases.map((p, idx) => (
                <PhraseRow
                  key={p.id}
                  phrase={p}
                  index={idx}
                  total={phrases.length}
                  highlighted={highlightedPhraseId === p.id}
                  onChange={patch => updatePhrase(p.id, patch)}
                  onMoveUp={() => movePhrase(p.id, -1)}
                  onMoveDown={() => movePhrase(p.id, 1)}
                  onDelete={() => deletePhrase(p.id)}
                />
              ))}
            </div>
          )}

          <button
            onClick={addPhrase}
            className="text-xs text-neutral-500 hover:text-fluent"
          >
            + add phrase line
          </button>

          {/* Detected progression chips — computed from all phrase chord
              tokens concatenated in order. */}
          {progressionMatches.length > 0 && (
            <div className="flex flex-wrap gap-2 text-[11px] text-neutral-500 pt-1 border-t border-neutral-200 dark:border-neutral-800">
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

          {/* Alternates */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAlternates(v => !v)}
                className="text-[11px] text-neutral-500 hover:text-fluent"
              >
                {showAlternates ? '▴ hide alternates' : '▸ show alternates / substitutions'}
              </button>
              {showAlternates && (section.alternateChords || section.alternateNote) && (
                <button
                  onClick={deleteAlternate}
                  className="text-[11px] text-neutral-400 hover:text-needswork"
                  title="clear alternates"
                >
                  clear
                </button>
              )}
            </div>
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

          {/* Notes */}
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

// -------------------------------------------------------------------

interface PhraseRowProps {
  phrase: Phrase;
  index: number;
  total: number;
  highlighted: boolean;
  onChange: (patch: Partial<Phrase>) => Promise<void>;
  onMoveUp: () => Promise<void>;
  onMoveDown: () => Promise<void>;
  onDelete: () => Promise<void>;
}

function PhraseRow({
  phrase,
  index,
  total,
  highlighted,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: PhraseRowProps) {
  const [chordDraft, setChordDraft] = useState(phrase.chords);
  const [lyricDraft, setLyricDraft] = useState(phrase.lyrics);
  const chordRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setChordDraft(phrase.chords); setLyricDraft(phrase.lyrics); }, [phrase.id, phrase.chords, phrase.lyrics]);

  // Auto-focus the chord input of a freshly-added empty phrase so the
  // user can start typing immediately.
  useEffect(() => {
    if (highlighted && phrase.chords === '' && phrase.lyrics === '') {
      chordRef.current?.focus();
    }
  }, [highlighted, phrase.chords, phrase.lyrics]);

  const parsedTokens = useMemo(() => parseChordChart(phrase.chords), [phrase.chords]);
  const anyUnparsed = parsedTokens.some(t => !t.parsed);

  return (
    <div
      id={`phrase-${phrase.id}`}
      className={`rounded-md border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700 -mx-1 px-1 py-1 group ${highlighted ? 'repertoire-flash' : ''}`}
    >
      <div className="flex items-start gap-2">
        {/* Reorder + delete column — fades in on hover. */}
        <div className="flex flex-col items-center gap-0.5 pt-0.5 opacity-30 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            title="move line up"
            className="text-[10px] text-neutral-500 hover:text-fluent disabled:opacity-30 disabled:cursor-not-allowed px-0.5"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            title="move line down"
            className="text-[10px] text-neutral-500 hover:text-fluent disabled:opacity-30 disabled:cursor-not-allowed px-0.5"
          >
            ↓
          </button>
          <button
            onClick={onDelete}
            title="delete line"
            className="text-[10px] text-neutral-500 hover:text-needswork px-0.5"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <input
            ref={chordRef}
            value={chordDraft}
            onChange={e => setChordDraft(e.target.value)}
            onBlur={() => chordDraft !== phrase.chords && onChange({ chords: chordDraft })}
            placeholder="chords (space to align with syllables below)"
            className="w-full bg-transparent border-0 border-b border-dashed border-transparent focus:border-fluent/40 focus:outline-none px-0 py-0 text-sm font-mono tracking-tight text-fluent placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
            spellCheck={false}
          />
          <input
            value={lyricDraft}
            onChange={e => setLyricDraft(e.target.value)}
            onBlur={() => lyricDraft !== phrase.lyrics && onChange({ lyrics: lyricDraft })}
            placeholder="lyric line"
            className="w-full bg-transparent border-0 border-b border-dashed border-transparent focus:border-fluent/40 focus:outline-none px-0 py-0 text-sm font-mono tracking-tight text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
          />
        </div>
      </div>
      {/* Parsed token chips — small; only shown when at least one
          unparseable token would otherwise be silent about the failure. */}
      {parsedTokens.length > 0 && anyUnparsed && (
        <div className="flex flex-wrap gap-1 text-[10px] pl-6 pt-1">
          {parsedTokens.map((c, i) => (
            <span
              key={i}
              title={c.parsed
                ? `root ${c.root}, quality ${c.quality}${c.extensions.length ? ', ' + c.extensions.join(' ') : ''}${c.bass ? ', bass ' + c.bass : ''}`
                : 'couldn\'t parse this — saved as text. cross-module features won\'t light up.'}
              className={`font-mono rounded border px-1 py-0.5 ${
                c.parsed
                  ? 'border-fluent/30 bg-fluent/5 text-fluent'
                  : 'border-developing/40 bg-developing/10 text-developing'
              }`}
            >
              {!c.parsed && <span aria-hidden className="mr-0.5">⚠</span>}
              {c.rawText}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export the parser so consumers can re-use it without a separate
// import path. Keeps the module's public surface compact.
export { parseChord };
