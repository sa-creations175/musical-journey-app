import { Link } from 'react-router-dom';
import type { HarmonicDiaryEntry } from '../../lib/db';
import { parseSkillId, type SkillRecord } from '../skills/registry';

interface Props {
  entry: HarmonicDiaryEntry;
  skill?: SkillRecord;
  onEdit: () => void;
  onPlay?: () => void;
  /** Card tint colour from the active palette. Used sparingly to
   *  avoid overpowering the text. */
  cardTint?: string;
  /** Literary variant used in the moodboard, slightly warmer typography. */
  variant?: 'moodboard' | 'list';
}

/**
 * Single diary entry card. Used in both the moodboard and list views
 * — `variant` tweaks the styling while keeping content identical.
 */
export default function DiaryEntryCard({ entry, skill, onEdit, onPlay, cardTint, variant = 'list' }: Props) {
  const displayName = skill?.name ?? fallbackSkillName(entry.skillId);
  const moduleLabel = skill?.moduleLabel ?? fallbackModule(entry.skillId);
  const jumpTo = skill
    ? (skill.moduleJumpQuery ? `${skill.moduleRoute}?${skill.moduleJumpQuery}` : skill.moduleRoute)
    : null;

  const hasUserText = entry.userText.trim() !== '';
  const showStarter = !hasUserText && Boolean(entry.claudeStarterText);

  const baseCardClass = variant === 'moodboard'
    ? 'diary-card-moodboard rounded-2xl border border-white/10 p-5 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all'
    : 'rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 bg-white/60 dark:bg-neutral-900/60';

  const style = variant === 'moodboard' && cardTint
    ? { backgroundColor: cardTint }
    : undefined;

  return (
    <article className={baseCardClass} style={style}>
      <header className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className={`font-medium truncate ${variant === 'moodboard' ? 'text-lg diary-serif text-white' : 'text-sm'}`}>
            {displayName}
          </h3>
          <p className={`text-[10px] uppercase tracking-wide truncate ${variant === 'moodboard' ? 'text-white/70' : 'text-neutral-500'}`}>
            {moduleLabel}{skill?.category ? ` · ${skill.category}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onPlay && (
            <button
              onClick={onPlay}
              aria-label="hear this element"
              title="hear this element"
              className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition ${
                variant === 'moodboard'
                  ? 'border border-white/20 text-white/80 hover:bg-white/10'
                  : 'border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
              }`}
            >
              ▶
            </button>
          )}
          <button
            onClick={onEdit}
            aria-label="edit entry"
            title="edit"
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] transition ${
              variant === 'moodboard'
                ? 'border border-white/20 text-white/80 hover:bg-white/10'
                : 'border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
            }`}
          >
            ✎
          </button>
        </div>
      </header>

      {hasUserText ? (
        <p className={`leading-relaxed whitespace-pre-line ${
          variant === 'moodboard' ? 'text-white/95 diary-serif text-[15px]' : 'text-sm'
        }`}>
          {entry.userText}
        </p>
      ) : showStarter ? (
        <>
          <p className={`italic leading-relaxed ${
            variant === 'moodboard' ? 'text-white/70 diary-serif text-[14px]' : 'text-sm text-neutral-500'
          }`}>
            {entry.claudeStarterText}
          </p>
          <button
            onClick={onEdit}
            className={`mt-2 text-[11px] underline-offset-2 hover:underline ${
              variant === 'moodboard' ? 'text-white/80' : 'text-fluent'
            }`}
          >
            Claude's starter — tap to customise
          </button>
        </>
      ) : (
        <p className={`italic text-sm ${variant === 'moodboard' ? 'text-white/60' : 'text-neutral-400'}`}>
          no association yet. tap ✎ to add one.
        </p>
      )}

      {(entry.emotionalTags.length > 0 || entry.genreTags.length > 0) && (
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          {entry.emotionalTags.map(t => (
            <span
              key={`e-${t}`}
              className={`px-2 py-0.5 rounded-full text-[10px] ${
                variant === 'moodboard'
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'bg-fluent/10 text-fluent border border-fluent/30'
              }`}
            >
              {t}
            </span>
          ))}
          {entry.genreTags.map(t => (
            <span
              key={`g-${t}`}
              className={`px-2 py-0.5 rounded-full text-[10px] ${
                variant === 'moodboard'
                  ? 'bg-amber-200/20 text-amber-100 border border-amber-200/30'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300/50'
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {jumpTo && (
        <Link
          to={jumpTo}
          className={`mt-3 inline-block text-[11px] ${
            variant === 'moodboard' ? 'text-white/70 hover:text-white' : 'text-neutral-500 hover:text-fluent'
          }`}
        >
          practise this →
        </Link>
      )}
    </article>
  );
}

function fallbackSkillName(skillId: string): string {
  const parsed = parseSkillId(skillId);
  if (!parsed) return skillId;
  return parsed.itemId.replace(/[-_]/g, ' ');
}

function fallbackModule(skillId: string): string {
  const parsed = parseSkillId(skillId);
  if (!parsed) return 'skill';
  return parsed.moduleId.replace(/-/g, ' ');
}
