/* eslint-disable */
// ── answer-time corpus report ────────────────────────────────────────
// Paste into devtools on any page of the app. Reads IndexedDB directly,
// writes nothing. Knobs at the top.

(async () => {
  const CEILING_MS   = 5 * 60 * 1000;   // the walk-away ceiling
  const VISIT_GAP_MS = 10 * 60 * 1000;  // gap that ends a Reading visit
  const PRECISION    = [0.10, 0.20];    // median precision targets

  // When each module started recording elapsedMs (commit times, local).
  // Rows older than this are untimed because nothing was measuring yet —
  // a different fact from "measured and discarded".
  const INSTRUMENTED_FROM = {
    'reading':            Date.parse('2026-08-13T00:00:00'),
    'harmonic-fluency':   Date.parse('2026-08-24T17:21:00'),
    'production':         Date.parse('2026-08-24T17:21:00'),
    'intervals':          Date.parse('2026-08-24T17:45:00'),
    'chord-recognition':  Date.parse('2026-08-24T17:45:00'),
    'chord-progressions': Date.parse('2026-08-24T17:45:00'),
    'scales-modes':       Date.parse('2026-08-24T17:45:00'),
  };
  // becc91b — when Reading stopped starting its clock on mount.
  const READING_CLOCK_FIXED_AT = Date.parse('2026-08-25T08:14:41');

  // ── read ───────────────────────────────────────────────────────────
  const rows = await new Promise((res, rej) => {
    const req = indexedDB.open('musical-journey');
    req.onerror = () => rej(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const get = db.transaction('attempts', 'readonly')
        .objectStore('attempts').getAll();
      get.onerror = () => rej(get.error);
      get.onsuccess = () => { res(get.result); db.close(); };
    };
  });

  // ── category, per module ───────────────────────────────────────────
  const HF = {
    nn: 'named-notes', tt: 'tritone-pairs', iv: 'intervals',
    rkp: 'reverse-key-pivots', 'enh-n': 'enharmonic (notes)',
    'enh-i': 'enharmonic (intervals)', ks: 'key-signatures',
    ksc: 'key-signatures (count)', pr: 'progressions',
    cc: 'chord-construction', mo: 'modes', fh: 'functional-harmony',
    sc: 'slash-chords', et: 'ear-theory', pent: 'pentatonic-scales',
    'dq-maj': 'diatonic-qualities (major)', 'dq-nm': 'diatonic-qualities (nat minor)',
    'dq-hm': 'diatonic-qualities (harm minor)', 'dq-extra': 'diatonic-qualities (extra)',
  };
  const categoryOf = (r) => {
    switch (r.moduleId) {
      case 'reading': {
        const p = String(r.itemId).split(':');
        return p[0] === 'sig' ? `sig:${p[3] ?? '?'}` : p[0];
      }
      case 'chord-progressions':
      case 'scales-modes':
        return r.drillTab ?? '(untagged — pre-instrumentation)';
      case 'chord-recognition':
        return r.answerStage ?? '(untagged — pre-instrumentation)';
      case 'intervals':
        return r.direction ?? '(no direction)';
      case 'harmonic-fluency': {
        const pre = String(r.itemId).replace(/-\d+$/, '');
        return HF[pre] ?? `${pre} (?)`;
      }
      default:
        return '(all — no sub-category on the row)';
    }
  };

  // ── fold multi-row submissions ─────────────────────────────────────
  // The full-progression and chord-motion drills write one row per chord
  // slot, all carrying ONE measurement. Counting each row would report
  // one answer four times.
  let folded = 0;
  const bySub = new Map();
  const kept = [];
  for (const r of rows) {
    if (!r.submissionId) { kept.push(r); continue; }
    const prev = bySub.get(r.submissionId);
    if (!prev) { bySub.set(r.submissionId, { ...r }); kept.push(r); continue; }
    folded++;
    // all-or-nothing: the skill is holding the whole progression together
    prev.correct = prev.correct && r.correct;
  }
  const rowsFolded = kept.map(r => (r.submissionId ? bySub.get(r.submissionId) : r));

  // ── Reading: mark the first answer of each visit ───────────────────
  const readingRows = rowsFolded
    .filter(r => r.moduleId === 'reading')
    .sort((a, b) => a.timestamp - b.timestamp);
  const firstOfVisit = new Set();
  const gapCounts = {};
  for (const gap of [5, 10, 30]) {
    let n = 0, prev = null;
    for (const r of readingRows) {
      if (prev === null || r.timestamp - prev > gap * 60000) n++;
      prev = r.timestamp;
    }
    gapCounts[`${gap}m`] = n;
  }
  {
    let prev = null;
    for (const r of readingRows) {
      if (prev === null || r.timestamp - prev > VISIT_GAP_MS) firstOfVisit.add(r);
      prev = r.timestamp;
    }
  }

  // ── classify every row ─────────────────────────────────────────────
  const modules = new Map();
  const M = (id) => {
    if (!modules.has(id)) modules.set(id, {
      total: 0, used: 0, cats: new Map(),
      drop: {
        untimedBefore: 0, untimedSince: 0, overCeiling: 0,
        negative: 0, readingFirstOfVisit: 0,
      },
      firstOfVisitBeforeFix: 0, firstOfVisitAfterFix: 0,
      timedOut: 0, withTarget: 0, slowPlayback: 0,
    });
    return modules.get(id);
  };

  for (const r of rowsFolded) {
    const m = M(r.moduleId);
    m.total++;
    const from = INSTRUMENTED_FROM[r.moduleId] ?? Infinity;
    const ms = r.elapsedMs;

    if (typeof ms !== 'number' || Number.isNaN(ms)) {
      if (r.timestamp < from) m.drop.untimedBefore++; else m.drop.untimedSince++;
      continue;
    }
    if (ms < 0) { m.drop.negative++; continue; }
    if (ms > CEILING_MS) { m.drop.overCeiling++; continue; }
    if (r.moduleId === 'reading' && firstOfVisit.has(r)) {
      m.drop.readingFirstOfVisit++;
      if (r.timestamp < READING_CLOCK_FIXED_AT) m.firstOfVisitBeforeFix++;
      else m.firstOfVisitAfterFix++;
      continue;
    }

    m.used++;
    if (r.timedOut) m.timedOut++;
    if (r.targetSeconds !== undefined) m.withTarget++;
    if (r.playbackSpeed !== undefined && r.playbackSpeed !== 1) m.slowPlayback++;
    const c = categoryOf(r);
    if (!m.cats.has(c)) m.cats.set(c, []);
    m.cats.get(c).push(r);
  }

  // ── stats ──────────────────────────────────────────────────────────
  const pct = (sorted, q) => {
    if (!sorted.length) return null;
    const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  };
  const s = (ms) => ms === null ? '—' : `${(ms / 1000).toFixed(2)}s`;
  // SE(median) ≈ IQR/√n, so n ≈ (IQR / (precision × median))² for ±1 s.e.
  const needed = (p25, p50, p75, prec, n) => {
    // Below ~8 answers the quartiles themselves are noise, and a target
    // computed from them would be a number with nothing behind it.
    if (p50 === null || p50 <= 0 || n < 8) return '—';
    return Math.ceil(((p75 - p25) / (prec * p50)) ** 2);
  };
  const line = (label, rs) => {
    const all = rs.map(r => r.elapsedMs).sort((a, b) => a - b);
    const ok  = rs.filter(r => r.correct).map(r => r.elapsedMs).sort((a, b) => a - b);
    const no  = rs.filter(r => !r.correct).map(r => r.elapsedMs).sort((a, b) => a - b);
    const q = (a) => [pct(a, 0.25), pct(a, 0.5), pct(a, 0.75)];
    const [a25, a50, a75] = q(all), [c25, c50, c75] = q(ok), [w25, w50, w75] = q(no);
    return {
      '': label, n: all.length,
      'p25': s(a25), 'median': s(a50), 'p75': s(a75),
      '✓ n': ok.length, '✓ p25': s(c25), '✓ med': s(c50), '✓ p75': s(c75),
      '✗ n': no.length, '✗ p25': s(w25), '✗ med': s(w50), '✗ p75': s(w75),
      'need ±10%': needed(a25, a50, a75, PRECISION[0], all.length),
      'need ±20%': needed(a25, a50, a75, PRECISION[1], all.length),
      'more for ±20%': (() => {
        const n = needed(a25, a50, a75, PRECISION[1], all.length);
        return typeof n === 'number' ? Math.max(0, n - all.length) : '—';
      })(),
    };
  };

  // ── print ──────────────────────────────────────────────────────────
  console.log('%cANSWER-TIME CORPUS — read only, nothing written',
    'font-weight:bold;font-size:13px');
  console.log(`${rows.length} attempt rows on disk · ${folded} folded into their submissions`);
  console.log(`Reading visits at 5/10/30-minute gaps: ` +
    Object.entries(gapCounts).map(([k, v]) => `${k}=${v}`).join('  ') +
    `  (using ${VISIT_GAP_MS / 60000}m)`);

  const order = [...modules.keys()].sort();
  for (const id of order) {
    const m = modules.get(id);
    if (m.used === 0 && m.total === 0) continue;
    const cats = [...m.cats.entries()].sort((a, b) => b[1].length - a[1].length);
    console.group(`%c${id}%c  ${m.used} timed / ${m.total} rows`,
      'font-weight:bold', 'color:#888');
    if (m.used) {
      console.table([
        line('ALL', [].concat(...cats.map(c => c[1]))),
        ...cats.map(([name, rs]) => line(name, rs)),
      ]);
    } else {
      console.log('no usable timed rows');
    }
    const d = m.drop;
    console.log('discarded:',
      `\n  ${d.untimedBefore} — no elapsedMs, answered before this module was instrumented`,
      `\n  ${d.untimedSince} — no elapsedMs since instrumentation (over the 5-min ceiling, so nothing was written, or no clock was running)`,
      `\n  ${d.overCeiling} — elapsedMs above the 5-min ceiling (Reading rows written before the ceiling landed)`,
      `\n  ${d.negative} — negative elapsedMs (clock restarted after the answer)`,
      id === 'reading'
        ? `\n  ${d.readingFirstOfVisit} — first answer of a visit, contaminated by time spent on the module home` +
          ` (${m.firstOfVisitBeforeFix} before the becc91b fix — genuinely contaminated; ` +
          `${m.firstOfVisitAfterFix} after it — dropped anyway, conservatively)`
        : '');
    if (m.timedOut || m.withTarget || m.slowPlayback) {
      console.log('kept but worth knowing:',
        `\n  ${m.timedOut} answers were the countdown expiring, not the reader answering`,
        `\n  ${m.withTarget} were answered under a countdown at all`,
        `\n  ${m.slowPlayback} were heard at other than 1× speed`);
    }
    console.groupEnd();
  }

  console.log('%cneed ±X%: how many timed answers that bucket needs before its median ' +
    'stops moving by more than X% of itself. SE(median) ≈ IQR/√n → n ≈ (IQR / (X × median))². ' +
    'That is one standard error; multiply n by 4 for 95% confidence.',
    'color:#888');
})();
