/**
 * WHICH CARDS CHANGE BAND UNDER THE 25 AUGUST RULING.
 *
 * Counts per module, old band to new band. Run it in the browser
 * console on any page of the app; it reads the live database and
 * changes nothing.
 *
 * Old: needsWork < 50 | developing 50-79 | fluent 80+ | mastered only
 *      at a full window of 20 with nothing wrong.
 * New: needsWork < 60 | developing 60-79 | fluent 80-94 | mastered 95+.
 *
 * Both graders below are the app's own, transcribed: window of 20,
 * floor of 5, `excludeFromFluency` rows skipped, and chord recognition's
 * bare `maj` folded onto `maj:0` the way `canonicalItemId` folds it.
 */
(async () => {
  const WINDOW = 20;
  const FLOOR = 5;
  const SEP = String.fromCharCode(0);

  const fold = (moduleId, itemId) =>
    moduleId === 'chord-recognition' ? String(itemId).split(':')[0] : itemId;

  const oldBand = (correct, total) => {
    if (total === 0) return 'untouched';
    if (total < FLOOR) return 'started';
    if (total >= WINDOW && correct === total) return 'mastered';
    const pct = correct / total;
    if (pct >= 0.8) return 'fluent';
    if (pct >= 0.5) return 'developing';
    return 'needsWork';
  };

  const newBand = (correct, total) => {
    if (total === 0) return 'untouched';
    if (total < FLOOR) return 'started';
    const pct = correct / total;
    if (pct >= 0.95) return 'mastered';
    if (pct >= 0.8) return 'fluent';
    if (pct >= 0.6) return 'developing';
    return 'needsWork';
  };

  const db = window.db ?? (await import('/src/lib/db.ts')).db;
  const rows = await db.attempts.toArray();

  const byItem = new Map();
  for (const a of rows) {
    if (a.excludeFromFluency) continue;
    const key = a.moduleId + SEP + fold(a.moduleId, a.itemId);
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key).push(a);
  }

  const moved = new Map();
  const totals = new Map();
  for (const [key, attempts] of byItem) {
    const moduleId = key.split(SEP)[0];
    attempts.sort((x, y) => y.timestamp - x.timestamp);
    const win = attempts.slice(0, WINDOW);
    const correct = win.filter(a => a.correct).length;
    const before = oldBand(correct, win.length);
    const after = newBand(correct, win.length);
    totals.set(moduleId, (totals.get(moduleId) ?? 0) + 1);
    if (before === after) continue;
    if (!moved.has(moduleId)) moved.set(moduleId, new Map());
    const m = moved.get(moduleId);
    const move = before + ' -> ' + after;
    m.set(move, (m.get(move) ?? 0) + 1);
  }

  const out = [];
  for (const [moduleId, count] of [...totals].sort()) {
    const m = moved.get(moduleId);
    const changes = m
      ? [...m].map(([move, n]) => n + ' ' + move).join(', ')
      : 'none';
    out.push({ module: moduleId, items: count, moved: changes });
  }
  console.table(out);
  const totalMoved = [...moved.values()]
    .reduce((s, m) => s + [...m.values()].reduce((a, b) => a + b, 0), 0);
  const graded = [...totals.values()].reduce((a, b) => a + b, 0);
  console.log(totalMoved + ' of ' + graded + ' graded items change band.');
})();
