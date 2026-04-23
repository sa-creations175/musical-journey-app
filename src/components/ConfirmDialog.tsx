import { type ReactNode } from 'react';
import Modal from './Modal';

interface Props {
  open: boolean;
  title: string;
  /** Body text or structured JSX. Keep it concise — confirm dialogs
   *  should be one paragraph plus (optionally) a bullet list of the
   *  specific things that will be affected. */
  message: ReactNode;
  /** Text for the destructive-confirm button (e.g. "Delete", "Remove"). */
  confirmLabel?: string;
  /** Text for the back-out button. */
  cancelLabel?: string;
  /** Visual variant. 'danger' uses a red Delete button; 'default' uses
   *  the primary fluent green. */
  variant?: 'default' | 'danger';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Reusable confirmation dialog for high-stakes actions. Sits on top of
 * the undo-toast layer — this is the first safety net, the toast is
 * the second. Use only for actions where blowing away user work is
 * possible (song delete, section-with-content delete, etc.); trivial
 * deletes should rely on the toast alone.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: Props) {
  const buttonClass = variant === 'danger'
    ? 'bg-needswork hover:opacity-90 text-white'
    : 'bg-fluent hover:opacity-90 text-white';
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-1.5 rounded-md text-sm font-medium ${buttonClass}`}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      )}
    >
      <div className="text-sm text-neutral-700 dark:text-neutral-200 space-y-2">
        {message}
      </div>
    </Modal>
  );
}
