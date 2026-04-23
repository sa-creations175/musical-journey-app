import { Link } from 'react-router-dom';
import type { HarmonicDiaryEntry } from '../../lib/db';
import { parseSkillId, type SkillRecord } from '../skills/registry';

interface Props {
  entry: HarmonicDiaryEntry;
  skill?: SkillRecord;
  onEdit: () => void;
  onPlay?: () => void;
  /** Moodboard card sits on the atmospheric gradient; list variant
   *  sits on the flat `.diary-list` surface with tighter spacing. */
  variant?: 'moodboard' | 'list';
}

/**
 * Single diary entry card. All colour comes from CSS custom
 * properties on `.diary-root`, so the card adapts automatically
 * when the user toggles light/dark or searches a new emotion.
 * Pencil edit icon sits next to the heading so the affordance
 * visually connects to what it edits.
 */
export default function DiaryEntryCard({ entry, skill, onEdit, onPlay, variant = 'moodboard' }: Props) {
  const displayName = skill?.name ?? fallbackSkillName(entry.skillId);
  const moduleLabel = skill?.moduleLabel ?? fallbackModule(entry.skillId);
  const jumpTo = skill
    ? (skill.moduleJumpQuery ? `${skill.moduleRoute}?${skill.moduleJumpQuery}` : skill.moduleRoute)
    : null;

  const hasUserText = entry.userText.trim() !== '';
  const showStarter = !hasUserText && Boolean(entry.claudeStarterText);

  return (
    <article className={`diary-card ${variant === 'moodboard' ? 'p-5' : 'p-4'}`}>
      <header className="flex items-start gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <h3
            className="diary-serif text-[18px] font-medium leading-tight"
            style={{ color: 'var(--diary-accent)' }}
          >
            {displayName}
            {/* Inline pencil — connected to the heading it edits. */}
            <button
              onClick={onEdit}
              aria-label="edit entry"
              title="edit"
              className="inline-flex items-center justify-center w-5 h-5 ml-1.5 -mb-0.5 text-[10px] rounded-full align-middle transition"
              style={{
                color: 'var(--diary-text-dim)',
                border: '1px solid var(--diary-card-border)',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--diary-text)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--diary-text-dim)'; }}
            >
              ✎
            </button>
          </h3>
          <p className="text-[10px] uppercase tracking-wider mt-1" style={{ color: 'var(--diary-text-dim)' }}>
            {moduleLabel}{skill?.category ? ` · ${skill.category}` : ''}
          </p>
        </div>
        {onPlay && (
          <button
            onClick={onPlay}
            aria-label="hear this element"
            title="hear this element"
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] transition"
            style={{
              color: 'var(--diary-text-muted)',
              border: '1px solid var(--diary-card-border)',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--diary-text)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--diary-text-muted)'; }}
          >
            ▶
          </button>
        )}
      </header>

      {hasUserText ? (
        <p
          className="diary-serif text-[15px] leading-relaxed whitespace-pre-line"
          style={{ color: 'var(--diary-text)' }}
        >
          {entry.userText}
        </p>
      ) : showStarter ? (
        <>
          <p
            className="diary-serif-italic text-[14px] leading-relaxed"
            style={{ color: 'var(--diary-text-muted)' }}
          >
            {entry.claudeStarterText}
          </p>
          <button
            onClick={onEdit}
            className="mt-3 text-[11px] underline-offset-4 hover:underline transition"
            style={{ color: 'var(--diary-text-dim)' }}
          >
            Claude's starter — tap to customise
          </button>
        </>
      ) : (
        <p className="diary-serif-italic text-sm" style={{ color: 'var(--diary-text-dim)' }}>
          no association yet. tap ✎ to add one.
        </p>
      )}

      {(entry.emotionalTags.length > 0 || entry.genreTags.length > 0) && (
        <div className="mt-4 flex items-center gap-1.5 flex-wrap">
          {entry.emotionalTags.map(t => (
            <span key={`e-${t}`} className="diary-chip">{t}</span>
          ))}
          {entry.genreTags.map(t => (
            <span key={`g-${t}`} className="diary-chip-muted">{t}</span>
          ))}
        </div>
      )}

      {jumpTo && (
        <Link
          to={jumpTo}
          className="mt-4 inline-block text-[11px] transition"
          style={{ color: 'var(--diary-text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--diary-text)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--diary-text-muted)'; }}
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
