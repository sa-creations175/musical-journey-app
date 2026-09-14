/**
 * The shared player's chip, as class names.
 *
 * ONE LOOK FOR EVERY ROW OF THE PANEL, including the rows a surface adds
 * inside it — the diary's Root, Colour and Inversion sit between the
 * player's own rows and must not read as a second control set.
 */
export const CHIP = 'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors';
export const CHIP_OFF = 'border-black/10 dark:border-white/20 bg-black/[0.03] '
  + 'dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/10';
export const CHIP_ON = 'border-neutral-900 dark:border-neutral-100 bg-neutral-900 '
  + 'text-white dark:bg-neutral-100 dark:text-neutral-900';
