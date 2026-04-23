import { useEffect, useState } from 'react';
import type { HarmonicDiaryEntry } from '../../lib/db';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toaster';
import { upsertDiaryEntry, deleteDiaryEntry } from './data';
import { EMOTIONAL_TAGS, GENRE_TAGS } from './vocab';
import type { SkillRecord } from '../skills/registry';

interface Props {
  /** Pass a pre-existing entry to edit, or null to create a new one
   *  for `skill`. */
  entry: HarmonicDiaryEntry | null;
  skill?: SkillRecord;
  /** When creating a new entry the caller must supply `skillId` (and
   *  ideally a skill record for the header). */
  skillId: string;
  starter?: string;
  onClose: () => void;
  onSaved?: (entry: HarmonicDiaryEntry) => void;
}

/**
 * Modal that edits (or creates) a single diary entry. Supports
 * free-form association text + emotion/genre tag chips + optional
 * delete. Saves flow through `upsertDiaryEntry` which centralises
 * the upsert + timestamping.
 */
export default function DiaryEntryEditor({ entry, skill, skillId, starter, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [text, setText] = useState(entry?.userText ?? '');
  const [emotional, setEmotional] = useState<string[]>(entry?.emotionalTags ?? []);
  const [genre, setGenre] = useState<string[]>(entry?.genreTags ?? []);
  const [customTagDraft, setCustomTagDraft] = useState('');

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setText(entry?.userText ?? '');
    setEmotional(entry?.emotionalTags ?? []);
    setGenre(entry?.genreTags ?? []);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Only re-sync when a different entry is being edited; the same
    // entry's field changes are the user's own typing we don't want
    // to overwrite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.entryId]);

  const toggleTag = (list: string[], tag: string, set: (v: string[]) => void) => {
    if (list.includes(tag)) set(list.filter(t => t !== tag));
    else set([...list, tag]);
  };

  const addCustomEmotion = () => {
    const t = customTagDraft.trim().toLowerCase();
    if (t === '' || emotional.includes(t)) {
      setCustomTagDraft('');
      return;
    }
    setEmotional([...emotional, t]);
    setCustomTagDraft('');
  };

  const save = async () => {
    const userText = text.trim();
    const next = await upsertDiaryEntry(skillId, {
      userText,
      emotionalTags: emotional,
      genreTags: genre,
      isStarterEdited: true,
      claudeStarterText: entry?.claudeStarterText ?? starter,
    });
    toast({ message: 'saved to diary.', variant: 'success', duration: 1800 });
    onSaved?.(next);
    onClose();
  };

  const remove = async () => {
    if (!entry) return;
    await deleteDiaryEntry(entry.entryId);
    toast({ message: 'entry removed.', variant: 'warning', duration: 2400 });
    onClose();
  };

  const skillLabel = skill?.name ?? skillId;

  return (
    <Modal
      open
      onClose={onClose}
      title={entry ? 'edit association' : 'add association'}
      description={skillLabel}
      footer={
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {entry ? (
            <button
              onClick={remove}
              className="text-xs text-neutral-500 hover:text-needswork"
            >
              remove entry
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
            >
              cancel
            </button>
            <button
              onClick={save}
              className="px-4 py-1.5 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
            >
              save
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        {starter && !entry?.userText && (
          <div className="rounded-md border border-fluent/30 bg-fluent/5 p-3 italic text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
            <span className="text-fluent not-italic font-medium">starter:</span> {starter}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-neutral-500">your association</span>
          <textarea
            autoFocus
            rows={4}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="what does this make you feel? what does it remind you of? where does it fit in your ear?"
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm leading-relaxed"
          />
        </label>

        <section>
          <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">emotion tags</h4>
          <div className="flex items-center gap-1 flex-wrap">
            {EMOTIONAL_TAGS.map(t => (
              <TagChip
                key={t}
                label={t}
                active={emotional.includes(t)}
                onClick={() => toggleTag(emotional, t, setEmotional)}
                tone="emotion"
              />
            ))}
            {emotional.filter(t => !EMOTIONAL_TAGS.includes(t as typeof EMOTIONAL_TAGS[number])).map(t => (
              <TagChip
                key={`custom-${t}`}
                label={t}
                active
                onClick={() => toggleTag(emotional, t, setEmotional)}
                tone="emotion"
                custom
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <input
              value={customTagDraft}
              onChange={e => setCustomTagDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustomEmotion(); }}
              placeholder="custom emotion tag"
              className="flex-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
            />
            <button
              onClick={addCustomEmotion}
              disabled={customTagDraft.trim() === ''}
              className={`px-2 py-1 rounded-md text-xs ${
                customTagDraft.trim() === ''
                  ? 'border border-neutral-200 dark:border-neutral-700 text-neutral-400'
                  : 'bg-fluent text-white hover:opacity-90'
              }`}
            >
              add
            </button>
          </div>
        </section>

        <section>
          <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">genre tags</h4>
          <div className="flex items-center gap-1 flex-wrap">
            {GENRE_TAGS.map(t => (
              <TagChip
                key={t}
                label={t}
                active={genre.includes(t)}
                onClick={() => toggleTag(genre, t, setGenre)}
                tone="genre"
              />
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}

function TagChip({
  label,
  active,
  onClick,
  tone,
  custom,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone: 'emotion' | 'genre';
  custom?: boolean;
}) {
  const base = 'px-2 py-0.5 rounded-full border text-[11px] transition';
  const activeCls = tone === 'emotion'
    ? 'bg-fluent text-white border-fluent'
    : 'bg-amber-500 text-white border-amber-500';
  const inactiveCls = 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent';
  return (
    <button
      onClick={onClick}
      className={`${base} ${active ? activeCls : inactiveCls}`}
    >
      {label}{custom && ' ·'}
    </button>
  );
}
