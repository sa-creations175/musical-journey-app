import LyricPasteBox from './LyricPasteBox';

// Per-section paste box (Lead Sheet Redesign step 6, May 2026).
//
// Now a thin wrapper over the shared LyricPasteBox, which the
// song-level drawer also uses — so the live header preview and the
// raw-text commit are the same in both places rather than two
// implementations drifting apart.
//
// It used to hand up `string[][]` and let the parent re-join that into
// text for the header parser: text → words → text → parse. It passes
// the user's text straight through now.
//
// The per-section draft reset went with the rewrite. It existed
// because a stale staged-word badge could carry across sections, and
// that only made sense while the store was section-owned; lyrics are
// song-owned now.

export default function LyricStagingArea({
  onSubmitText,
}: {
  /** Raw pasted text, parsed once by the caller at the write. */
  onSubmitText: (text: string) => void | Promise<void>;
}) {
  return <LyricPasteBox onCommit={onSubmitText} />;
}
