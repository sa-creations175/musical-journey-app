import { Link } from 'react-router-dom';
import type { HarmonicDiaryEntry } from '../../lib/db';
import { parseSkillId, type SkillRecord } from '../skills/registry';
import { diaryCardTitle } from './cardSound';

interface Props {
  entry: HarmonicDiaryEntry;
  skill?: SkillRecord;
  onEdit: () => void;
  /** Opens the player panel on this card. Absent on a card with nothing
   *  to hear, which then has no ▶. */
  onHear?: () => void;
  /** Whether this is the card the panel is playing. */
  hearing?: boolean;
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
 *
 * =====================================================================
 * ONE ▶, WHERE THE ▤ ↑ PAIR WAS. Silas's spec of 12 Sep 2026, §1.
 *
 * The card used to choose how its sound arrived — struck or run — and
 * play it itself. That choice is the player panel's Play as row now, on
 * every card type, so the card has one round "Hear it" that opens the
 * panel on it. The card being heard keeps a thin outline in the diary's
 * accent colour. Nothing else on the card changed.
 * =====================================================================
 */
export default function DiaryEntryCard({
  entry, skill, onEdit, onHear, hearing = false, variant = 'moodboard',
}: Props) {
  const displayName = diaryCardTitle(entry.skillId, skill);
  const moduleLabel = skill?.moduleLabel ?? fallbackModule(entry.skillId);
  const jumpTo = skill
    ? (skill.moduleJumpQuery ? `${skill.moduleRoute}?${skill.moduleJumpQuery}` : skill.moduleRoute)
    : null;

  const hasUserText = entry.userText.trim() !== '';
  const showStarter = !hasUserText && Boolean(entry.claudeStarterText);

  return (
    <article
      className={`diary-card ${variant === 'moodboard' ? 'p-5' : 'p-4'}`}
      data-hearing={hearing ? 'true' : undefined}
      style={{
        outline: `2px solid ${hearing ? 'var(--diary-accent)' : 'transparent'}`,
        transition: 'outline-color .2s, box-shadow .2s',
      }}
    >
      <header className="flex items-start gap-2 mb-3">
        <div className="min-w-0 flex-1">
          {/* Heading is its own flex row so the title text can truncate
              cleanly with ellipsis on narrow viewports — without that,
              the inline pencil button gets clipped along with the text
              and a long title pushes the whole header to two lines. */}
          <h3
            className="diary-serif text-[18px] font-medium leading-tight flex items-baseline gap-1.5 min-w-0"
            style={{ color: 'var(--diary-accent)' }}
          >
            <span className="truncate min-w-0">{displayName}</span>
            <button
              onClick={onEdit}
              aria-label="edit entry"
              title="Edit"
              className="shrink-0 inline-flex items-center justify-center w-5 h-5 -mb-0.5 text-[10px] rounded-full align-middle transition"
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
          <p className="text-[10px] uppercase tracking-wider mt-1 truncate" style={{ color: 'var(--diary-text-dim)' }}>
            {moduleLabel}{skill?.category ? ` · ${skill.category}` : ''}
          </p>
        </div>
        {onHear && (
          <button
            type="button"
            onClick={onHear}
            // A TAP ON THIS SWITCHES THE PANEL; the panel's own "tap
            // outside closes" rule reads this mark and leaves it be.
            data-diary-hear=""
            aria-label="Hear it"
            title="Hear it"
            aria-pressed={hearing}
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[13px] transition"
            style={{
              color: hearing ? 'var(--diary-text)' : 'var(--diary-text-muted)',
              border: '1px solid var(--diary-accent-tan)',
              background: hearing ? 'rgba(58, 61, 42, 0.06)' : 'transparent',
            }}
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
            Claude's Starter — Tap to Customise
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
          Practice This →
        </Link>
      )}
    </article>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function fallbackModule(skillId: string): string {
  const parsed = parseSkillId(skillId);
  if (!parsed) return 'skill';
  return parsed.moduleId.replace(/-/g, ' ');
}
