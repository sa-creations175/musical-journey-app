import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, type HarmonicDiaryEntry, type SkillPriority } from '../../lib/db';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toaster';
import { TIER_BADGE_CLASS, TIER_LABEL } from '../../lib/tier';
import { moduleMetaById } from '../../lib/moduleMeta';
import ModuleGlyph from '../../components/ModuleGlyph';
import type { SkillRecord } from './registry';
import { upsertAnnotation } from './registry';
import { upsertDiaryEntry } from '../harmonic-diary/data';
import { EMOTIONAL_TAGS, GENRE_TAGS } from '../harmonic-diary/vocab';
import TagPicker from './TagPicker';

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
  const [noteDraft, setNoteDraft] = useState(skill.note ?? '');
  const [diary, setDiary] = useState<HarmonicDiaryEntry | null>(null);
  const [associationDraft, setAssociationDraft] = useState('');
  const [editingAssociation, setEditingAssociation] = useState(false);
  const [editingStarter, setEditingStarter] = useState(false);
  const [starterDraft, setStarterDraft] = useState('');

  useEffect(() => {
    (async () => {
      const entry = await db.harmonicDiaryEntries.where('skillId').equals(skill.skillId).first();
      setDiary(entry ?? null);
      setAssociationDraft(entry?.userText ?? '');
      setEditingAssociation(false);
      setStarterDraft(entry?.claudeStarterText ?? '');
      setEditingStarter(false);
    })();
  }, [skill.skillId]);

  // Edit / delete Claude's starter. Saves flow through the same
  // upsertDiaryEntry helper so `lastEdited` updates and live queries
  // refresh the diary landing.
  const saveStarter = async () => {
    const trimmed = starterDraft.trim();
    const next = await upsertDiaryEntry(skill.skillId, {
      userText: diary?.userText ?? '',
      claudeStarterText: trimmed || undefined,
      emotionalTags: diary?.emotionalTags ?? [],
      genreTags: diary?.genreTags ?? [],
      isStarterEdited: diary?.isStarterEdited ?? false,
    });
    setDiary(next);
    setEditingStarter(false);
    toast({ message: 'description updated.', variant: 'success', duration: 1500 });
  };
  const deleteStarter = async () => {
    const next = await upsertDiaryEntry(skill.skillId, {
      userText: diary?.userText ?? '',
      claudeStarterText: undefined,
      emotionalTags: diary?.emotionalTags ?? [],
      genreTags: diary?.genreTags ?? [],
      isStarterEdited: diary?.isStarterEdited ?? false,
    });
    setDiary(next);
    setStarterDraft('');
    setEditingStarter(false);
    toast({ message: "Claude's description removed.", variant: 'warning', duration: 1800 });
  };

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

  // Curated seed list merged into the TagPicker's pool when the
  // user hasn't yet built their own tag vocabulary. Concept-level
  // terms + the emotion / genre vocab from the Diary.
  const tagSeed = useMemo(
    () => [...CONCEPT_TAGS, ...EMOTIONAL_TAGS, ...GENRE_TAGS],
    [],
  );

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
        {/* Module chip — same icon + accent as the sidebar, so the
            skill's home is visually anchored throughout the flow. */}
        {(() => {
          const meta = moduleMetaById(skill.moduleId);
          return (
            <div className="flex items-center gap-2">
              {meta ? (
                <ModuleGlyph meta={meta} size={28} fontSize={14} />
              ) : (
                <span aria-hidden className="w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0 bg-neutral-100 dark:bg-neutral-800 text-neutral-500">◦</span>
              )}
              <span
                className="text-[11px] uppercase tracking-wide font-medium"
                style={meta ? { color: meta.accentHex } : { color: 'var(--color-neutral-500)' }}
              >
                {skill.moduleLabel}
              </span>
              <span className="text-[11px] text-neutral-400">·</span>
              <span className="text-[11px] text-neutral-500">{skill.category}</span>
            </div>
          );
        })()}

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

        {/* Claude's starter description — editable inline. Users can
            refine Claude's language, replace it entirely, or delete
            it. The pencil and trash live right next to the label so
            the affordances connect visually to what they edit. */}
        {(diary?.claudeStarterText || editingStarter) && (
          <section className="rounded-md border border-amber-300/40 bg-amber-50/60 dark:bg-amber-900/10 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300 font-medium">
                  Claude's description
                </span>
                {!editingStarter && diary?.claudeStarterText && (
                  <>
                    <button
                      onClick={() => setEditingStarter(true)}
                      aria-label="edit description"
                      title="edit"
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] text-amber-700 dark:text-amber-300 hover:bg-amber-200/50 dark:hover:bg-amber-900/30"
                    >
                      ✎
                    </button>
                    <button
                      onClick={deleteStarter}
                      aria-label="delete description"
                      title="delete"
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] text-neutral-500 hover:text-needswork hover:bg-needswork/10"
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            </div>
            {editingStarter ? (
              <div className="space-y-2">
                <textarea
                  autoFocus
                  rows={3}
                  value={starterDraft}
                  onChange={e => setStarterDraft(e.target.value)}
                  placeholder="refine the description — keep what works, change what doesn't."
                  className="w-full rounded-md border border-amber-300/40 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm leading-relaxed italic"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveStarter}
                    disabled={starterDraft.trim() === (diary?.claudeStarterText ?? '')}
                    className={`px-3 py-1 rounded-md text-xs font-medium text-white ${
                      starterDraft.trim() === (diary?.claudeStarterText ?? '')
                        ? 'bg-neutral-300 dark:bg-neutral-700'
                        : 'bg-fluent hover:opacity-90'
                    }`}
                  >
                    save description
                  </button>
                  <button
                    onClick={() => {
                      setStarterDraft(diary?.claudeStarterText ?? '');
                      setEditingStarter(false);
                    }}
                    className="px-3 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs"
                  >
                    cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-relaxed italic text-neutral-700 dark:text-neutral-200">
                {diary?.claudeStarterText}
              </p>
            )}
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
          <TagPicker
            existing={skill.tags}
            onAdd={t => void addTag(t)}
            seed={tagSeed}
            placeholder="search existing tags or type a new one…"
          />
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

function formatTotalTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
}
