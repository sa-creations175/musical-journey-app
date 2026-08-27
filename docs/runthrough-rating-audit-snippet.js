/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────
// ANSWERED. KEPT AS THE TRAIL, NOT AS SOMETHING TO RE-RUN.
//
// Audited 27 Aug 2026:
//   songCellRunThroughs  12 rows, 100% absent (undefined).
//                        First and last createdAt both 2026-05-12.
//   songKeyRunThroughs   13 rows, 0 carrying an unexpected `rating`.
//   No strings. No numbers. Nothing in other:<typeof>.
//
// STRONGER THAN "NO STRINGS FOUND": every row predates 14 May 2026,
// which is when the field was introduced (dbff537). There was never a
// window in which these rows could have been written with a rating of
// either kind, so the three-vocabulary history below — nothing, then
// words, then the Feel ordinal, then nothing — never touched this
// database at all.
//
// WHAT THAT DECIDES. A read path needs a TYPE GUARD and nothing more:
// treat anything that is not a number 1–4 as absent. No migration, no
// normalisation layer, and specifically NO mapping of the old
// flying/cruising/crawling vocabulary — there is nothing here to map,
// and `feelForRating` would silently read every 'crawling' as
// Struggled (1) rather than Working on it (2) if it were ever pointed
// at rows that did hold words.
//
// Re-run it only if that assumption needs re-checking on another
// device, or after a restore from a backup old enough to carry rows
// from the string window.
// ─────────────────────────────────────────────────────────────────────

// ── songCellRunThroughs.rating — what is actually stored ─────────────
// Paste into devtools on any page of the app. Reads IndexedDB directly,
// writes nothing. No Dexie needed — raw IDBObjectStore.getAll().
//
// WHY: the field has held three things over its life. Absent (before
// 14 May 2026), then 'flying' | 'cruising' | 'crawling' strings
// (14 May → 18 Aug 2026), then the Feel ordinal 1–4 (18 Aug → 23 Aug
// 2026, no migration), then absent again (23 Aug 2026 onward — the
// cell test passes rating: null). Nothing reads the field today, so
// nothing is broken; anything built on "lowest of the last three"
// would compare a word to a number and produce nonsense silently.

(async () => {
  const readAll = (store) => new Promise((res, rej) => {
    const req = indexedDB.open('musical-journey');
    req.onerror = () => rej(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(store)) { db.close(); res([]); return; }
      const get = db.transaction(store, 'readonly').objectStore(store).getAll();
      get.onerror = () => rej(get.error);
      get.onsuccess = () => { res(get.result); db.close(); };
    };
  });

  const rows = await readAll('songCellRunThroughs');

  // ── shape of the stored value ──────────────────────────────────────
  // `absent` folds undefined and null together — neither is a rating,
  // and the write path has produced both (omitted pre-May, explicit
  // null is not written but a hand-edited row could hold one).
  const shapeOf = (v) => {
    if (v === undefined || v === null) return 'absent';
    if (typeof v === 'string') return 'string';
    if (typeof v === 'number') return 'number';
    return `other:${typeof v}`;
  };

  const byShape = new Map();
  const byValue = new Map();
  const spanByShape = new Map();   // first/last createdAt per shape

  for (const r of rows) {
    const shape = shapeOf(r.rating);
    byShape.set(shape, (byShape.get(shape) ?? 0) + 1);

    const vk = `${shape} · ${shape === 'absent' ? String(r.rating) : JSON.stringify(r.rating)}`;
    byValue.set(vk, (byValue.get(vk) ?? 0) + 1);

    const t = typeof r.createdAt === 'number' ? r.createdAt : null;
    if (t !== null) {
      const s = spanByShape.get(shape) ?? { first: t, last: t };
      if (t < s.first) s.first = t;
      if (t > s.last) s.last = t;
      spanByShape.set(shape, s);
    }
  }

  const when = (t) => t == null ? '—' : new Date(t).toISOString().slice(0, 10);

  console.log(`songCellRunThroughs — ${rows.length} rows total`);

  console.table([...byShape.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([shape, count]) => ({
      shape,
      count,
      pct: rows.length ? `${((count / rows.length) * 100).toFixed(1)}%` : '—',
      firstRow: when(spanByShape.get(shape)?.first),
      lastRow:  when(spanByShape.get(shape)?.last),
    })));

  console.log('distinct values:');
  console.table([...byValue.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count })));

  // ── the same question for the sibling table ────────────────────────
  // songKeyRunThroughs has never carried a `rating` column. Counted
  // anyway: a row that holds one would be a fact worth knowing before
  // any read path is written across both tables.
  const keyRows = await readAll('songKeyRunThroughs');
  const strays = keyRows.filter(r => r.rating !== undefined && r.rating !== null);
  console.log(
    `songKeyRunThroughs — ${keyRows.length} rows, ` +
    `${strays.length} carrying an unexpected \`rating\``,
  );
  if (strays.length > 0) console.table(strays.slice(0, 20));
})();
