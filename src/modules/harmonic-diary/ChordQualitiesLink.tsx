import { useState } from 'react';
import DiarySheet from './DiarySheet';
import ChordQualitiesChart, { CHORD_QUALITIES_TITLE } from '../../components/ChordQualitiesChart';

/**
 * "Chord qualities by scale", at the top of the Harmonic Diary.
 *
 * The chart's second door (Silas, 13 Sep 2026), beside "How a chord gets
 * its name" and opening the same way: the diary's dimmed, locked sheet.
 * The chart is the flashcard reveal's own component, so the marks are
 * the same marks.
 */
export default function ChordQualitiesLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs underline underline-offset-4 decoration-dotted"
        style={{ color: 'var(--diary-text-muted)' }}
      >
        {CHORD_QUALITIES_TITLE}
      </button>
      {open && (
        <DiarySheet title={CHORD_QUALITIES_TITLE} onClose={() => setOpen(false)}>
          <ChordQualitiesChart showTitle={false} />
        </DiarySheet>
      )}
    </>
  );
}
