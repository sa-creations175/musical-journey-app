/* eslint-disable */
// ── declared, never drilled ──────────────────────────────────────────
// Paste into devtools on any page of the app. Counts only. Reads
// IndexedDB directly, writes nothing, deletes nothing.
//
// THE QUESTION: how many chord-shape spacing rows carry a stage of
// `acquiring` or better with no drill behind them. Those are the rows
// the retired self-assessment wrote — "I can play this reliably",
// recorded as an acquisition stage, never backed by a rep.
//
// Clearing them will move coverage numbers and the session generator,
// which is why this runs first.

(async () => {
  const open = (name) => new Promise((res, rej) => {
    const req = indexedDB.open(name);
    req.onerror = () => rej(req.error);
    req.onsuccess = () => res(req.result);
  });
  const all = (db, store) => new Promise((res, rej) => {
    const g = db.transaction(store, 'readonly').objectStore(store).getAll();
    g.onerror = () => rej(g.error);
    g.onsuccess = () => res(g.result);
  });

  const db = await open('musical-journey');
  const [spacing, sessions, skills] = await Promise.all([
    all(db, 'spacingState'),
    all(db, 'drillSessions'),
    all(db, 'drillSkills'),
  ]);
  db.close();

  // Every chord-shape row in the shapes module. Scales are untouched by
  // this and are counted separately below only for contrast.
  const shapeRows = spacing.filter(r =>
    r.moduleRef === 'shapes-and-patterns'
    && typeof r.itemRef === 'string'
    && r.itemRef.startsWith('chord-shape:'));

  const STAGED = new Set(['acquiring', 'acquired', 'consolidated', 'mastered']);
  const staged = shapeRows.filter(r => STAGED.has(r.acquisitionStage));

  // WHICH SKILL A ROW BELONGS TO. A spacing itemRef is
  // `chord-shape:<quality>:<key>[:<inversionState>]`; a drillSkill
  // carries kind/keyName/quality/inversionState. Matching on all four
  // is what makes "no drill behind it" mean this exact square rather
  // than the cell it sits in.
  const skillKey = (s) =>
    `${s.quality}|${s.keyName}|${s.inversionState ?? ''}`;
  const drilledSkillIds = new Set(sessions.map(s => s.skillId));
  const drilledKeys = new Set(
    skills.filter(s => s.kind === 'chord-shape' && drilledSkillIds.has(s.id))
      .map(skillKey));

  const refKey = (ref) => {
    const parts = ref.split(':');            // chord-shape, quality, key, [state]
    return `${parts[1]}|${parts[2]}|${parts[3] ?? ''}`;
  };

  // Two independent readings of "never drilled", reported separately
  // because they can disagree and the difference is informative:
  //   · no drillSessions row for the matching skill  (the drill log)
  //   · empty performanceHistory on the row itself   (the signal log)
  // The self-assessment wrote a stage and appended NO history, so a
  // declared row shows both.
  const noDrill = staged.filter(r => !drilledKeys.has(refKey(r.itemRef)));
  const noHistory = staged.filter(r =>
    !Array.isArray(r.performanceHistory) || r.performanceHistory.length === 0);
  const both = staged.filter(r =>
    !drilledKeys.has(refKey(r.itemRef))
    && (!Array.isArray(r.performanceHistory) || r.performanceHistory.length === 0));

  console.log('%cDECLARED, NEVER DRILLED — counts only, nothing changed',
    'font-weight:bold;font-size:13px');
  console.log(`chord-shape spacing rows            ${shapeRows.length}`);
  console.log(`  of those, staged acquiring+       ${staged.length}`);
  console.log('');
  console.log(`no drill log for that square        ${noDrill.length}`);
  console.log(`no performance history on the row   ${noHistory.length}`);
  console.log(`%cboth — the clear candidates        ${both.length}`,
    'font-weight:bold');

  // By stage, so a declaration ("acquired", from Comfortable) is
  // distinguishable from a seeded start ("acquiring", from Familiar).
  const byStage = {};
  for (const r of both) {
    byStage[r.acquisitionStage] = (byStage[r.acquisitionStage] ?? 0) + 1;
  }
  console.log('by stage:', byStage);

  // How many distinct cells that is — a self-assessment seeded four or
  // five rows at once, so the cell count is the number of times the
  // question was actually answered.
  const cells = new Set(both.map(r => {
    const p = r.itemRef.split(':');
    return `${p[1]}:${p[2]}`;
  }));
  console.log(`distinct chord cells affected       ${cells.size}`);

  // Contrast: scale rows carrying a stage with no drill behind them.
  // These did NOT come from the self-assessment — it only ever ran on
  // chord cells — so a non-zero number here is backfill, not
  // declaration, and is not part of what commit 3 would clear.
  const scaleStagedNoDrill = spacing.filter(r =>
    r.moduleRef === 'shapes-and-patterns'
    && typeof r.itemRef === 'string'
    && r.itemRef.startsWith('scale:')
    && STAGED.has(r.acquisitionStage)
    && (!Array.isArray(r.performanceHistory) || r.performanceHistory.length === 0));
  console.log(`(scales, staged with no history: ${scaleStagedNoDrill.length} — not in scope)`);

  console.table(
    [...cells].slice(0, 40).map(c => ({ cell: c })),
  );
})();
