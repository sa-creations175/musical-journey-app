/**
 * Per-item curation sheet. Opens from a long-press / menu
 * affordance on any ET item across the four quiz surfaces:
 *
 *   · IntervalsQuiz       (intervals catalog)
 *   · ChordRecognitionQuiz (chord-recognition catalog)
 *   · ChordProgressionsQuiz (chord-progressions catalog)
 *   · ScalesModes          (modes catalog)
 *
 * The sheet supports three operations against the etItemCuration
 * Dexie table (db.ts v23):
 *
 *   · Edit label    — overrides the catalog's default `name`.
 *   · Flag for review — adds a flag + optional note. Item still
 *     surfaces; the UI just shows a flag indicator.
 *   · Hide          — soft delete. Hidden items are filtered out
 *     of session eligibility (sessionGenerator.loadEtEligibleByModule)
 *     and the host quiz pool.
 *
 * All writes go through the shared etCuration helpers, so the same
 * row schema is honored across surfaces. The sheet calls
 * `onChanged()` after every successful write so the parent can
 * refresh its local read (label / flag / hidden indicators).
 */
import { useEffect, useState } from 'react';
import ConfirmDialog from '../../components/ConfirmDialog';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toaster';
import {
  deleteCuration,
  readCuration,
  setCustomLabel,
  setFlag,
  setHidden,
} from './etCuration';
import type { EtItemCuration } from '../../lib/db';

interface Props {
  itemRef: string;
  /** Catalog default — shown when no customLabel is set, and
   *  prefilled into the label editor as the starting value. */
  defaultLabel: string;
  /** Short context line above the editor: "Chord progression",
   *  "Interval", "Mode", "Chord recognition" — helps the user
   *  confirm what they're about to edit when the same sheet
   *  shows up across four surfaces. */
  itemKindLabel: string;
  onClose: () => void;
  /** Called after every successful write so the host can re-read
   *  the curation row. */
  onChanged?: () => void;
}

export default function EtItemCurationSheet({
  itemRef,
  defaultLabel,
  itemKindLabel,
  onClose,
  onChanged,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<EtItemCuration | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [flagDraft, setFlagDraft] = useState(false);
  const [flagNoteDraft, setFlagNoteDraft] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Hydrate from Dexie on mount + each time itemRef changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const cur = await readCuration(itemRef);
      if (cancelled) return;
      setRow(cur);
      setLabelDraft(cur?.customLabel ?? '');
      setFlagDraft(!!cur?.flagged);
      setFlagNoteDraft(cur?.flagNote ?? '');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [itemRef]);

  const refresh = async () => {
    const cur = await readCuration(itemRef);
    setRow(cur);
    onChanged?.();
  };

  const handleSaveLabel = async () => {
    setSaving(true);
    try {
      await setCustomLabel(itemRef, labelDraft);
      await refresh();
      toast({
        message: labelDraft.trim()
          ? `Label saved as "${labelDraft.trim()}"`
          : 'Label cleared — using catalog default.',
        variant: 'success',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFlag = async () => {
    setSaving(true);
    try {
      await setFlag(itemRef, flagDraft, flagDraft ? flagNoteDraft : null);
      await refresh();
      toast({
        message: flagDraft ? 'Item flagged for review.' : 'Flag cleared.',
        variant: 'success',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleHidden = async () => {
    const next = !row?.hidden;
    setSaving(true);
    try {
      await setHidden(itemRef, next);
      await refresh();
      toast({
        message: next
          ? 'Item hidden — won\'t surface in sessions.'
          : 'Item restored.',
        variant: 'success',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePermanentDelete = async () => {
    setConfirmDeleteOpen(false);
    setSaving(true);
    try {
      await deleteCuration(itemRef);
      await refresh();
      toast({
        message: 'Curation row deleted. Catalog defaults restored.',
        variant: 'warning',
      });
      // The row is gone — the curation overlay no longer exists for
      // this item. Close the sheet so the parent re-reads against
      // the now-cleared row (label / flag / hidden indicators all
      // reset to catalog defaults).
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const labelChanged = (row?.customLabel ?? '') !== labelDraft.trim();
  const flagChanged =
    !!row?.flagged !== flagDraft
    || (flagDraft && (row?.flagNote ?? '') !== flagNoteDraft.trim());

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title={`Curate ${itemKindLabel.toLowerCase()}`}
      description={defaultLabel}
      footer={
        <div className="flex items-center justify-end">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            close
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="text-sm text-neutral-500 italic">Loading…</div>
      ) : (
        <div className="space-y-5 text-sm">
          {/* Edit label */}
          <section className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                Display label
              </span>
              <span className="text-[10px] text-neutral-400">
                default: {defaultLabel}
              </span>
            </div>
            <input
              type="text"
              value={labelDraft}
              onChange={e => setLabelDraft(e.target.value)}
              placeholder={defaultLabel}
              className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
            />
            <div className="flex justify-end">
              <button
                onClick={() => void handleSaveLabel()}
                disabled={saving || !labelChanged}
                className={`px-3 py-1 rounded-md text-xs font-medium ${
                  saving || !labelChanged
                    ? 'bg-neutral-200 text-neutral-400 dark:bg-neutral-800 cursor-not-allowed'
                    : 'bg-fluent text-white hover:opacity-90'
                }`}
              >
                save label
              </button>
            </div>
          </section>

          {/* Flag for review */}
          <section className="space-y-1.5 border-t border-neutral-200 dark:border-neutral-800 pt-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={flagDraft}
                onChange={e => setFlagDraft(e.target.checked)}
                className="accent-fluent"
              />
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                Flag for review
              </span>
            </label>
            {flagDraft && (
              <textarea
                rows={2}
                value={flagNoteDraft}
                onChange={e => setFlagNoteDraft(e.target.value)}
                placeholder="why is this flagged? (optional)"
                className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
              />
            )}
            <div className="flex justify-end">
              <button
                onClick={() => void handleSaveFlag()}
                disabled={saving || !flagChanged}
                className={`px-3 py-1 rounded-md text-xs font-medium ${
                  saving || !flagChanged
                    ? 'bg-neutral-200 text-neutral-400 dark:bg-neutral-800 cursor-not-allowed'
                    : 'bg-amber-500 text-white hover:opacity-90'
                }`}
              >
                {flagDraft ? 'save flag' : 'clear flag'}
              </button>
            </div>
          </section>

          {/* Hide / restore */}
          <section className="space-y-1.5 border-t border-neutral-200 dark:border-neutral-800 pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                Visibility
              </span>
              {row?.hidden && (
                <span className="text-[10px] text-needswork font-medium">
                  HIDDEN
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-500 italic">
              {row?.hidden
                ? 'This item is hidden from sessions and quiz pools.'
                : 'Hide this item to keep it out of sessions and quiz pools until restored.'}
            </p>
            <div className="flex justify-end gap-2">
              {/* Permanent delete only surfaces on already-hidden
                  items — the path is hide → confirm-then-delete, not
                  delete-from-zero. Mirrors the soft-then-hard delete
                  pattern in DrillListModal and elsewhere. */}
              {row?.hidden && (
                <button
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={saving}
                  className={`px-3 py-1 rounded-md text-xs font-medium border border-needswork text-needswork hover:bg-needswork/10 ${
                    saving ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  title="Remove this row from the curation table entirely. Any custom label or flag on this item is lost."
                >
                  delete permanently
                </button>
              )}
              <button
                onClick={() => void handleToggleHidden()}
                disabled={saving}
                className={`px-3 py-1 rounded-md text-xs font-medium ${
                  row?.hidden
                    ? 'bg-fluent text-white hover:opacity-90'
                    : 'border border-needswork text-needswork hover:bg-needswork/10'
                } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {row?.hidden ? 'restore item' : 'hide item'}
              </button>
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete this curation row?"
        message={(
          <>
            <p>
              Removes the curation row for <span className="font-medium">{defaultLabel}</span>{' '}
              entirely. Any custom label or flag on this item is
              lost; catalog defaults resume.
            </p>
            <p className="text-xs text-neutral-500">
              The catalog item itself isn't affected — it just stops
              being hidden. To skip it again you'd hide it from the
              quiz surface like you did the first time.
            </p>
          </>
        )}
        confirmLabel="Delete permanently"
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => void handlePermanentDelete()}
      />
    </Modal>
  );
}
