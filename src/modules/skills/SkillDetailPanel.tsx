import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, type HarmonicDiaryEntry, type SkillPriority } from '../../lib/db';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toaster';
import { TIER_BADGE_CLASS, TIER_LABEL } from '../../lib/tier';
import type { SkillRecord } from './registry';
import { upsertAnnotation } from './registry';
import { upsertDiaryEntry } from '../harmonic-diary/data';
import { EMOTIONAL_TAGS, GENRE_TAGS } from '../harmonic-diary/vocab';

interface Props {
  skill: SkillRecord;
  onClose: () => void;
  /** Re-fetch the catalogue after a mutation so the parent grid picks
   *  up priority / tag changes. */
  onMutated?: () => void;
}

const PRIORITY_OPTIONS: Array<{ value: SkillPriority | ''; label: string; hint: string }> = [
  { value: '',            label: 'unset',       hint: 'no priority set' },
  { value: 'comfort',     label: 'comfort',     hint: 'already a strong area — maintain without pushing' },
  { value: 'deep',        label: 'deep',        hint: 'actively investing — surface this often' },
  { value: 'maintenance', label: 'maintenance', hint: 'keep it warm with occasional reps' },
];

/** Cross-cutting conceptual tags the Catalogue suggests alongside the
 *  emotion + genre vocabularies. Kept small + musical so new users
 *  pick consistent language. */
const CONCEPT_TAGS = [
  'modal-interchange',
  'voice-leading',
  'ii-v-i',
  'turnaround',
  'tonic',
  'dominant',
  'subdominant',
  'chromatic',
  'altered',
  'pedal-tone',
];

/**
 * Modal surfacing everything the catalogue knows about a single
 * skill: Claude's starter description, the user's own association,
 * derived module stats, and user-set priority + tags + note. Writes
 * for both annotations and diary entries flow back through their
 * module helpers and trigger `onMutated` so the parent grid refreshes.
 */
export default function SkillDetailPanel({ skill, onClose, onMutated }: Props) {
  const { toast } = useToast();
  const [tagDraft, setTagDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState(skill.note ?? '');
  const [diary, setDiary] = useState<HarmonicDiaryEntry | null>(null);
  const [associationDraft, setAssociationDraft] = useState('');
  const [editingAssociation, setEditingAssociation] = useState(false);

  useEffect(() => {
    (async () => {
      const entry = await db.harmonicDiaryEntries.where('skillId').equals(skill.skillId).first();
      setDiary(entry ?? null);
      setAssociationDraft(entry?.userText ?? '');
      setEditingAssociation(false);
    })();
  }, [skill.skillId]);

  const setPriority = async (next: SkillPriority | '') => {
    await upsertAnnotation(skill.skillId, {
      priority: next === '' ? undefined : next,
    });
    toast({ message: next === '' ? 'priority cleared.' : `priority set to ${next}.`, variant: 'success', duration: 1800 });
    onMutated?.();
  };

  const addTag = async (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (t === '') return;
    if (skill.tags.includes(t)) return;
    const next = [...skill.tags, t];
    await upsertAnnotation(skill.skillId, { tags: next });
    setTagDraft('');
    onMutated?.();
  };

  const removeTag = async (tag: string) => {
    const next = skill.tags.filter(t => t !== tag);
    await upsertAnnotation(skill.skillId, { tags: next });
    onMutated?.();
  };

  const commitNote = async () => {
    const trimmed = noteDraft.trim();
    if (trimmed === (skill.note ?? '')) return;
    await upsertAnnotation(skill.skillId, { note: trimmed || undefined });
    onMutated?.();
  };

  const saveAssociation = async () => {
    const trimmed = associationDraft.trim();
    const next = await upsertDiaryEntry(skill.skillId, {
      userText: trimmed,
      claudeStarterText: diary?.claudeStarterText,
      emotionalTags: diary?.emotionalTags ?? [],
      genreTags: diary?.genreTags ?? [],
      isStarterEdited: trimmed !== '',
    });
    setDiary(next);
    setEditingAssociation(false);
    toast({ message: 'saved.', variant: 'success', duration: 1500 });
  };

  const jumpTo = skill.moduleJumpQuery
    ? `${skill.moduleRoute}?${skill.moduleJumpQuery}&from=catalogue`
    : `${skill.moduleRoute}?from=catalogue`;

  const hasUserText = (diary?.userText.trim() ?? '') !== '';

  // Tag suggestions = curated vocabulary that isn't already applied.
  const suggestedTags = useMemo(() => {
    const already = new Set(skill.tags.map(t => t.toLowerCase()));
    const q = tagDraft.trim().toLowerCase();
    const passesQuery = (t: string) => q === '' || t.includes(q);
    return {
      emotion: EMOTIONAL_TAGS.filter(t => !already.has(t) && passesQuery(t)).slice(0, 6),
      genre:   GENRE_TAGS.filter(t => !already.has(t) && passesQuery(t)).slice(0, 6),
      concept: CONCEPT_TAGS.filter(t => !already.has(t) && passesQuery(t)).slice(0, 6),
    };
  }, [skill.tags, tagDraft]);

  return (
    <Modal
      open
      onClose={onClose}
      title={skill.name}
      description={`${skill.moduleLabel} · ${skill.category}`}
      footer={
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Link
            to={jumpTo}
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-fluent text-fluent text-sm hover:bg-fluent/10"
          >
            practise this skill →
          </Link>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            close
          </button>
        </div>
      }
    >
      <div className="space-y-5 text-sm">
        {/* Status row */}
        <div className="flex items-center gap-3 flex-wrap">
          {skill.currentTier && (
            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${TIER_BADGE_CLASS[skill.currentTier]}`}>
              {TIER_LABEL[skill.currentTier]}
            </span>
          )}
          <span className="text-[11px] text-neutral-500">
            freshness: <span className="font-medium">{skill.freshness}</span>
          </span>
          <span className="text-[11px] text-neutral-500">
            last practised: <span className="font-medium">
              {skill.daysSince === null ? 'never' : skill.daysSince === 0 ? 'today' : `${skill.daysSince}d ago`}
            </span>
          </span>
          {skill.totalTime > 0 && (
            <span className="text-[11px] text-neutral-500">
              total: <span className="font-mono tabular-nums font-medium">{formatTotalTime(skill.totalTime)}</span>
            </span>
          )}
        </div>

        {/* Claude's starter description — always shown when present */}
        {diary?.claudeStarterText && (
          <section className="rounded-md border border-amber-300/40 bg-amber-50/60 dark:bg-amber-900/10 p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300 font-medium">
              Claude's description
            </div>
            <p className="text-sm leading-relaxed italic text-neutral-700 dark:text-neutral-200">
              {diary.claudeStarterText}
            </p>
          </section>
        )}

        {/* User's own association — primary position when present */}
        <section>
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <h4 className="text-[10px] uppercase tracking-wide text-neutral-500">
              your association
            </h4>
            {hasUserText && !editingAssociation && (
              <button
                onClick={() => setEditingAssociation(true)}
                className="text-[11px] text-fluent hover:underline"
              >
                edit
              </button>
            )}
          </div>
          {!editingAssociation && hasUserText ? (
            <div className="rounded-md border border-fluent/30 bg-fluent/5 p-3 text-sm leading-relaxed">
              <p className="whitespace-pre-wrap">{diary!.userText}</p>
              {(diary!.emotionalTags.length + diary!.genreTags.length) > 0 && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {[...diary!.emotionalTags, ...diary!.genreTags].map(t => (
                    <span key={t} className="px-1.5 py-0.5 rounded-full bg-fluent/10 text-fluent text-[10px]">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={associationDraft}
                onChange={e => { setAssociationDraft(e.target.value); setEditingAssociation(true); }}
                placeholder={diary?.claudeStarterText
                  ? 'add your own take — what does this feel like for you?'
                  : 'what does this make you feel? where does it fit in your ear?'}
                rows={3}
                className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm leading-relaxed"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={saveAssociation}
                  disabled={associationDraft.trim() === (diary?.userText ?? '')}
                  className={`px-3 py-1 rounded-md text-xs font-medium text-white ${
                    associationDraft.trim() === (diary?.userText ?? '')
                      ? 'bg-neutral-300 dark:bg-neutral-700'
                      : 'bg-fluent hover:opacity-90'
                  }`}
                >
                  save association
                </button>
                <Link
                  to={`/harmonic-diary?skill=${encodeURIComponent(skill.skillId)}`}
                  onClick={onClose}
                  className="text-[11px] text-fluent hover:underline"
                >
                  open in Harmonic Diary →
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* Priority */}
        <section>
          <h4 className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2">priority</h4>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRIORITY_OPTIONS.map(opt => {
              const active = (skill.priority ?? '') === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setPriority(opt.value)}
                  title={opt.hint}
                  className={`px-2.5 py-1 rounded-md border text-xs ${
                    active
                      ? 'bg-fluent text-white border-fluent'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 hover:border-fluent hover:text-fluent'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Tags */}
        <section>
          <h4 className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2">tags</h4>
          {skill.tags.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {skill.tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-neutral-200 dark:border-neutral-700 text-[11px] text-neutral-600 dark:text-neutral-300"
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    aria-label={`remove tag ${tag}`}
                    className="text-neutral-400 hover:text-needswork"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-neutral-500 italic mb-2">no tags yet</p>
          )}
          <div className="flex items-center gap-1.5">
            <input
              value={tagDraft}
              onChange={e => setTagDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void addTag(tagDraft); }}
              placeholder="type a tag or pick from suggestions…"
              className="flex-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
            />
            <button
              onClick={() => addTag(tagDraft)}
              disabled={tagDraft.trim() === ''}
              className={`px-2.5 py-1 rounded-md text-xs ${
                tagDraft.trim() === ''
                  ? 'border border-neutral-200 dark:border-neutral-700 text-neutral-400'
                  : 'bg-fluent text-white hover:opacity-90'
              }`}
            >
              add
            </button>
          </div>
          <SuggestedTagRows
            suggestions={suggestedTags}
            onPick={addTag}
          />
          <p className="text-[10px] text-neutral-500 mt-1.5 italic">
            use suggested tags or type your own — lowercase, single words or hyphenated phrases.
          </p>
        </section>

        {/* Private note */}
        <section>
          <h4 className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2">private note</h4>
          <textarea
            rows={2}
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            onBlur={commitNote}
            placeholder="a private reminder about this skill — voicing to try, feel to remember, etc."
            className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs"
          />
        </section>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------------

function SuggestedTagRows({
  suggestions,
  onPick,
}: {
  suggestions: { emotion: readonly string[]; genre: readonly string[]; concept: readonly string[] };
  onPick: (tag: string) => void;
}) {
  const empty =
    suggestions.emotion.length === 0 &&
    suggestions.genre.length === 0 &&
    suggestions.concept.length === 0;
  if (empty) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {suggestions.emotion.length > 0 && (
        <TagSuggestionRow label="emotion" tags={suggestions.emotion} tone="fluent" onPick={onPick} />
      )}
      {suggestions.genre.length > 0 && (
        <TagSuggestionRow label="genre" tags={suggestions.genre} tone="amber" onPick={onPick} />
      )}
      {suggestions.concept.length > 0 && (
        <TagSuggestionRow label="concept" tags={suggestions.concept} tone="neutral" onPick={onPick} />
      )}
    </div>
  );
}

function TagSuggestionRow({
  label,
  tags,
  tone,
  onPick,
}: {
  label: string;
  tags: readonly string[];
  tone: 'fluent' | 'amber' | 'neutral';
  onPick: (tag: string) => void;
}) {
  const toneCls =
    tone === 'fluent'  ? 'border-fluent/40 text-fluent hover:bg-fluent/10' :
    tone === 'amber'   ? 'border-amber-400/50 text-amber-700 dark:text-amber-300 hover:bg-amber-400/10' :
                         'border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:border-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100';
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-wide text-neutral-500 w-14 shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-wrap">
        {tags.map(t => (
          <button
            key={t}
            onClick={() => onPick(t)}
            className={`px-2 py-0.5 rounded-full border text-[11px] transition ${toneCls}`}
          >
            + {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatTotalTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
}
