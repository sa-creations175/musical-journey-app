/**
 * A row of the shared player, and a chip in it.
 *
 * The player's own rows and the rows a surface adds inside the panel
 * are drawn by these, so the two cannot drift into different controls.
 */
import type { ReactNode } from 'react';
import { CHIP, CHIP_OFF, CHIP_ON } from './playerChipStyles';

export function PlayerChip({
  on, onClick, children, testId, disabled,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-testid={testId}
      disabled={disabled === true}
      onClick={onClick}
      className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF} `
        + 'disabled:opacity-40 disabled:cursor-default'}
    >
      {children}
    </button>
  );
}

export function PlayerRow({ label, children, testId }: {
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}
