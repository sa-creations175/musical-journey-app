/**
 * Compact trigger that opens `EtItemCurationSheet` for a single
 * ET itemRef. Drop next to any ET catalog item across the four
 * quiz surfaces. Renders as a ⋯ glyph; tap opens the sheet.
 *
 * Use the `as` prop to render as a `<span>` (default) when nesting
 * inside other buttons, or `<button>` when standalone. The sheet
 * is opened in a portal via the shared Modal component, so nesting
 * is structurally fine either way.
 */
import { useState } from 'react';
import EtItemCurationSheet from './EtItemCurationSheet';

interface Props {
  itemRef: string;
  defaultLabel: string;
  itemKindLabel: string;
  /** Render `as="button"` when the surrounding element isn't a
   *  button; render `as="span"` (default) when nesting inside one
   *  so we don't violate HTML. The visual is identical. */
  as?: 'button' | 'span';
  /** Optional class override for sizing in tight UIs. */
  className?: string;
  /** Called after the sheet writes a change so the host can re-
   *  read its label / flag / hidden state. */
  onChanged?: () => void;
}

const DEFAULT_CLASS =
  'inline-flex items-center justify-center w-6 h-6 rounded-md text-neutral-400 hover:text-fluent hover:bg-fluent/10 cursor-pointer';

export default function EtItemCurationButton({
  itemRef,
  defaultLabel,
  itemKindLabel,
  as = 'span',
  className,
  onChanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const handleOpen = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setOpen(true);
  };
  const props = {
    role: as === 'span' ? 'button' as const : undefined,
    tabIndex: as === 'span' ? 0 : undefined,
    onClick: handleOpen,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleOpen(e);
      }
    },
    'aria-label': `curate ${itemKindLabel.toLowerCase()} ${defaultLabel}`,
    title: 'edit / flag / hide',
    className: className ?? DEFAULT_CLASS,
  };
  const trigger = as === 'button'
    ? (
      <button type="button" {...props}>
        <span aria-hidden className="text-base leading-none">⋯</span>
      </button>
    )
    : (
      <span {...props}>
        <span aria-hidden className="text-base leading-none">⋯</span>
      </span>
    );
  return (
    <>
      {trigger}
      {open && (
        <EtItemCurationSheet
          itemRef={itemRef}
          defaultLabel={defaultLabel}
          itemKindLabel={itemKindLabel}
          onClose={() => setOpen(false)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}
