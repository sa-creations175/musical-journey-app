import { Link } from 'react-router-dom';
import type { HarmonicDiaryEntry } from '../../lib/db';
import { parseSkillId, type SkillRecord } from '../skills/registry';
import type { DiaryPlayMode } from './audio';

interface Props {
  entry: HarmonicDiaryEntry;
  skill?: SkillRecord;
  onEdit: () => void;
  /** Called when the user taps a play affordance. `mode` is supplied
   *  for chord and progression entries (the three-button variant);
   *  intervals and modes call without an argument. */
  onPlay?: (mode?: DiaryPlayMode) => void;
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

  // Three-mode play affordance applies to entries whose musical
  // content is a chord, a sequence of chords, or a scale stack —
  // anywhere that "all-at-once vs ascending arpeggio vs descending
  // arpeggio" maps to a meaningful pedagogical distinction. Intervals
  // already carry their direction in the skillId (asc / desc /
  // harmonic), so they keep the single-button form.
  const showThreeButtons = isThreeModeSkill(entry.skillId);

  return (
    <article className={`diary-card ${variant === 'moodboard' ? 'p-5' : 'p-4'}`}>
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
              title="edit"
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
        {onPlay && (
          showThreeButtons
            ? <PlayButtonGroup onPlay={onPlay} />
            : <PlayButtonSingle onPlay={() => onPlay()} />
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

// ── Play-button variants ────────────────────────────────────────────

/** Existing single-affordance ▶. Used by intervals (direction baked
 *  into the skillId) and modes/scales (mode preview is a roadmap
 *  item — for now there's only one playback path). */
function PlayButtonSingle({ onPlay }: { onPlay: () => void }) {
  return (
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
  );
}

/** Three buttons for chord, progression, and mode entries: ascending,
 *  blocked, descending. Each is a 44×44 touch target (Apple HIG
 *  minimum). Order matches the keyboard's left-to-right pitch axis
 *  (low → high) and Western reading direction — ascending on the left
 *  because lower notes sit physically on the left of a piano. */
function PlayButtonGroup({ onPlay }: { onPlay: (mode: DiaryPlayMode) => void }) {
  return (
    <div className="shrink-0 flex items-center gap-1">
      <ModeButton onClick={() => onPlay('asc')} label="play ascending" glyph="↑" />
      <ModeButton onClick={() => onPlay('blocked')} label="play blocked" glyph="▤" />
      <ModeButton onClick={() => onPlay('desc')} label="play descending" glyph="↓" />
    </div>
  );
}

function ModeButton({ onClick, label, glyph }: { onClick: () => void; label: string; glyph: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="w-11 h-11 rounded-full flex items-center justify-center text-[14px] transition"
      style={{
        color: 'var(--diary-text-muted)',
        border: '1px solid var(--diary-card-border)',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--diary-text)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--diary-text-muted)'; }}
    >
      {glyph}
    </button>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function isThreeModeSkill(skillId: string): boolean {
  const parsed = parseSkillId(skillId);
  if (!parsed) return false;
  if (parsed.moduleId === 'chord-recognition') return true;
  if (parsed.moduleId === 'shapes-and-patterns' && parsed.subtype === 'chord-shape') return true;
  if (parsed.moduleId === 'chord-progressions') return true;
  if (parsed.moduleId === 'scales-modes') return true;
  return false;
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
