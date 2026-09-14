import { useState } from 'react';
import DiarySheet from './DiarySheet';
import {
  CHORD_NAMING_REFERENCE,
  type ChordNamingReference,
  type InlineText,
  type ReferenceSection,
} from './chordNamingReference';

/**
 * The ⓘ in the diary header, and the reference it opens.
 *
 * Every word comes from `docs/CHORD_NAMING_REFERENCE.md` through
 * `chordNamingReference.ts`, the button's label included: it is the
 * document's own title. Nothing here is copy.
 */
export default function ChordNamingInfo({
  variant = 'icon',
}: {
  /** The ⓘ beside the view toggle, or the visible link at the top of the
   *  diary (ruled 13 Sep 2026). Same sheet either way. */
  variant?: 'icon' | 'link';
} = {}) {
  const [open, setOpen] = useState(false);
  const label = CHORD_NAMING_REFERENCE.title;
  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label}
          title={label}
          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-base leading-none transition"
          style={{ border: '1px solid var(--diary-card-border)', color: 'var(--diary-text-muted)' }}
        >
          ⓘ
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs underline underline-offset-4 decoration-dotted"
          style={{ color: 'var(--diary-text-muted)' }}
        >
          {label}
        </button>
      )}
      {open && (
        <DiarySheet title={label} onClose={() => setOpen(false)}>
          <ReferenceBody reference={CHORD_NAMING_REFERENCE} />
        </DiarySheet>
      )}
    </>
  );
}

const CHIP = 'font-mono font-medium text-[13px] rounded px-1.5 py-px bg-[rgba(58,61,42,0.08)]';

/** `**bold**` and `` `mono` ``, the only marks the document uses. In
 *  the traps list the bold lead is the notes themselves, so it sets as
 *  a mono chip, as it did on the signed-off page. */
function Inline({ text, boldAsChip = false }: { text: InlineText; boldAsChip?: boolean }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) {
          return <b key={i} className={boldAsChip ? CHIP : 'font-semibold'}>{p.slice(2, -2)}</b>;
        }
        if (p.length > 2 && p.startsWith('`') && p.endsWith('`')) {
          return <span key={i} className={CHIP}>{p.slice(1, -1)}</span>;
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function ReferenceBody({ reference }: { reference: ChordNamingReference }) {
  return (
    <div className="text-[15px] leading-relaxed">
      <p className="text-sm max-w-[62ch] mb-5" style={{ color: 'var(--diary-text-muted)' }}>
        <Inline text={reference.intro} />
      </p>
      {reference.sections.map(s => <Section key={s.heading} section={s} />)}
      <p className="text-[13px] mt-7 max-w-[62ch]" style={{ color: 'var(--diary-text-muted)' }}>
        <Inline text={reference.footnote} />
      </p>
    </div>
  );
}

const SMALL_CAPS = 'text-[13px] font-semibold uppercase tracking-[0.08em]';

/** Per column, by position: the name bold, the degrees and the example
 *  in mono, "Your choice" muted. The headings themselves are held by
 *  the reference test, so the positions cannot drift from them. */
const COLUMN_CLASS = [
  'font-semibold whitespace-nowrap',
  'font-mono whitespace-nowrap',
  '',
  '',
  'font-mono whitespace-nowrap',
];
const COLUMN_COLOR = [undefined, undefined, undefined, 'var(--diary-text-muted)', 'var(--diary-accent-earth)'];

function Section({ section }: { section: ReferenceSection }) {
  if (section.kind === 'rules') {
    return (
      <section
        className="rounded-lg px-4 py-4 sm:px-5"
        style={{ background: 'var(--diary-card-bg)', border: '1px solid var(--diary-rule)', boxShadow: 'var(--diary-card-shadow)' }}
      >
        <h3 className={`${SMALL_CAPS} mb-2.5`} style={{ color: 'var(--diary-accent)' }}>{section.heading}</h3>
        <ol className="list-decimal pl-5 space-y-1.5">
          {section.items.map((item, i) => <li key={i}><Inline text={item} /></li>)}
        </ol>
      </section>
    );
  }

  if (section.kind === 'list') {
    return (
      <section>
        <h3 className={`${SMALL_CAPS} mt-8 mb-2`} style={{ color: 'var(--diary-text-muted)' }}>{section.heading}</h3>
        <ul className="list-disc pl-5 space-y-2">
          {section.items.map((item, i) => <li key={i}><Inline text={item} boldAsChip /></li>)}
        </ul>
      </section>
    );
  }

  return (
    <section>
      <h3 className="diary-serif text-xl font-medium mt-7 mb-1">{section.heading}</h3>
      <p className="text-[13px] mb-2" style={{ color: 'var(--diary-text-muted)' }}>
        <Inline text={section.summary} />
      </p>
      {/* Tables scroll sideways inside the sheet at phone width; the
          min-width stops the prose columns being squeezed to a word. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm" style={{ border: '1px solid var(--diary-rule)' }}>
          <thead>
            <tr style={{ background: 'rgba(58, 61, 42, 0.06)' }}>
              {section.columns.map(c => (
                <th
                  key={c}
                  className="px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: 'var(--diary-text-muted)' }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, r) => (
              <tr key={r} style={{ borderTop: '1px solid var(--diary-rule)' }}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`px-2.5 py-2 text-left align-top ${COLUMN_CLASS[c] ?? ''}`}
                    style={{ color: COLUMN_COLOR[c] }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
