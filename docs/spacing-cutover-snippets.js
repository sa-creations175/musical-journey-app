/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────
// KEPT AS THE TRAIL, NOT AS SOMETHING TO RE-RUN. The migration these
// checked and armed has already run — 0 to maintaining, 281 to
// acquiring, 3 with flags — and snippet 3 arms a one-way write.
//
// Spacing cutover — the three console snippets, in running order.
//
// Paste into devtools with the app open on the DEV SERVER. The `/src/…`
// import paths are Vite's, and resolve only there — they will 404 on a
// built `dist` preview.
//
// EACH BLOCK IS AN ASYNC IIFE, not a bare block with top-level await.
// Safari's console rejects top-level await in a pasted statement —
// "Unexpected keyword 'import'. Expected ';' after variable
// declaration" — so the await lives inside a function that is called
// immediately. Run one block at a time.
//
// Snippets 1 and 2 are READ-ONLY. Snippet 3 WRITES a pref and arms a
// one-way migration; it is last, and fenced, for that reason.
// ─────────────────────────────────────────────────────────────────────


// ═════════════════════════════════════════════════════════════════════
// 1. Which case your data is in for the harmonic-fluency backfill
// ═════════════════════════════════════════════════════════════════════
//
// ANSWERS: does db1462e — moving HF's backfill off lifetime counters
// onto the trailing-ten window — change anything on THIS database, or
// only on a fresh install?
//
// A GOOD RESULT is `alreadyRan: true`. The backfill is gated by a
// one-time pref AND skips any item that already has a spacing row, so
// once it has run this rule decides what a new install seeds and
// touches nothing here. The counts are then a counterfactual: what each
// rule WOULD say about your attempt history, which is worth seeing
// because it is the same disagreement the tier had.
//
// `alreadyRan: false` means the rule change is live and will decide
// your day-one coverage. Look hard at `demoted` before going further —
// that is cards the old rule called acquired and the new one does not.
//
// Nothing here writes. Run it as often as you like.

(async () => {
  const m = await import('/src/lib/spacingStateBackfill.ts');
  const shift = await m.describeHfBackfillShift();
  console.log(m.describeHfShift(shift));
  console.table([shift]);
})();


// ═════════════════════════════════════════════════════════════════════
// 2. Has sdmQualityMigration finished its job?
// ═════════════════════════════════════════════════════════════════════
//
// ANSWERS: does the scale-degree-math → quality-card migration still
// have rows to move, or is it done and safe to retire in commit 3?
//
// A GOOD RESULT IS THREE ZEROS: { attempts: 0, flashcardStates: 0,
// spacing: 0 }. That means every legacy row has already been carried
// across, and the migration is a no-op that runs on every page load —
// so it gets DELETED in commit 3 rather than ported.
//
// ANY NON-ZERO means it still has work. It must then run to completion
// BEFORE flashcardStates is dropped, or that history is stranded — and
// it gets ported rather than retired.
//
// Why three numbers rather than one: the migration moves attempts,
// SM-2 rows and spacing rows in a single transaction, so they should
// agree. If they disagree, something interrupted a run part-way and
// that is worth knowing before anything else happens.
//
// Nothing here writes.

(async () => {
  const { db } = await import('/src/lib/db.ts');
  const { LEGACY_TO_QUALITY } = await import(
    '/src/modules/harmonic-fluency/sdmQualityMigration.ts'
  );
  const ids = [...LEGACY_TO_QUALITY.keys()];

  const attempts = (await db.attempts
    .where('moduleId').equals('harmonic-fluency').toArray())
    .filter(r => LEGACY_TO_QUALITY.has(r.itemId)).length;

  const flashcardStates = (await db.flashcardStates
    .where('cardId').anyOf(ids).toArray()).length;

  const spacing = (await db.spacingState
    .where('moduleRef').equals('harmonic-fluency').toArray())
    .filter(r => LEGACY_TO_QUALITY.has(r.itemRef)).length;

  console.log(
    `sdmQualityMigration — ${ids.length} legacy ids in the map`,
    { attempts, flashcardStates, spacing },
  );
  console.log(
    attempts + flashcardStates + spacing === 0
      ? '✅ three zeros — finished, retire it in commit 3'
      : '⚠️  still has rows to move — it must run to completion before the table is dropped',
  );
})();


// ═════════════════════════════════════════════════════════════════════
// 3. Arm the flashcard migration  ⚠️  THIS ONE WRITES
// ═════════════════════════════════════════════════════════════════════
//
// ANSWERS: nothing. This is the "go".
//
// DO NOT RUN THIS until you have read the boot log's row count (see
// docs below / the commit message on 365d801) and are happy with it.
// The migration carries every flashcard schedule onto spacingState and
// there is no undo — the ease factor is dropped on purpose, and the
// acquiring path discards the old due date rather than preserving it.
//
// A GOOD RESULT is the line printing, then a RELOAD, then this in the
// console instead of the not-armed preview:
//
//   [spacing] flashcard schedules carried across: X to maintaining,
//   Y to acquiring, Z with flags
//
// Those numbers should match the preview you read. If they do not,
// something changed between reading and arming — stop and say so.
//
// The run is still idempotent and still keyed on its own done-pref, so
// arming twice is harmless and a second reload does nothing.

(async () => {
  const { setPref } = await import('/src/lib/userPrefs.ts');
  await setPref('spacingFlashcardMigrationArmed', true);
  console.log('armed — reload to run it');
})();
