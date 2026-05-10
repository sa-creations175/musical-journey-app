import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../lib/db';
import CreativeTimeModal from '../creative/CreativeTimeModal';
import { gatherPrompts, aggregateCreativeStats, type CreativePrompt, type CreativeMode, type CreativeStats } from '../creative/engine';
import {
  formatHumanAgo,
  formatMinutes,
  gatherDashboardData,
  type DashboardData,
} from './aggregation';
import MusicianBalanceRadar, { RADAR_AXES, type DimensionKey } from './MusicianBalanceRadar';
import { MODULE_ORDER, type ModuleMeta } from '../../lib/moduleMeta';
import ModuleGlyph from '../../components/ModuleGlyph';
import { pickQuote, type MusicianQuote } from './quotes';
import { useUserName } from './userName';
import WeeklyPlan from '../goals/WeeklyPlan';
import WeeklyPlanBanner from '../goals/WeeklyPlanBanner';

/**
 * The Dashboard is the app's home surface. It pulls cross-module
 * aggregates once on mount (and on a Dexie-live-query trigger) and
 * renders six sections: greeting, musician-balance radar, today's
 * practice, recent wins, what's calling attention, and creative
 * genius. Three deferred sections (this week, journey, goals) are
 * stubbed so their future home is obvious.
 *
 * Live-query rationale: we watch a cheap query (last 5 attempts +
 * last drillSessions + creativeSessions) so the dashboard refreshes
 * after the user practises, without re-running every aggregation on
 * every tick. The expensive `gatherDashboardData` runs in an effect
 * keyed off those live signals.
 */
export default function Dashboard() {
  // Live signal — re-fires when any of these tables mutates,
  // triggering a fresh aggregation.
  const liveSignal = useLiveQuery(async () => {
    const [a, d, c, s, p] = await Promise.all([
      db.attempts.count(),
      db.drillSessions.count(),
      db.creativeSessions.count(),
      db.songPracticeLog.count(),
      db.productionLessons.count(),
    ]);
    return { a, d, c, s, p };
  }, []);

  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => {
    void (async () => {
      const snap = await gatherDashboardData();
      setData(snap);
    })();
  }, [liveSignal]);

  // Pick a quote once per mount (component remounts per visit). Lazy
  // init does the rolling — no useEffect needed.
  const [quote] = useState<MusicianQuote>(() => pickQuote());

  const [userName, saveUserName, userNameLoaded] = useUserName();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const beginEditName = () => {
    setNameDraft(userName);
    setEditingName(true);
  };

  // Creative modal state — used both by "log creative time" and by
  // the in-dashboard prompt card ("start with this prompt").
  const [creativeOpen, setCreativeOpen] = useState(false);
  const [launchPrompt, setLaunchPrompt] = useState<CreativePrompt | null>(null);
  const [launchMode, setLaunchMode] = useState<CreativeMode | undefined>(undefined);

  // Dashboard prompt + creative stats (Creative Genius section).
  const [dashboardPrompt, setDashboardPrompt] = useState<CreativePrompt | null>(null);
  const [creativeStats, setCreativeStats] = useState<CreativeStats | null>(null);
  useEffect(() => {
    void (async () => {
      const [ps, stats] = await Promise.all([
        gatherPrompts('play', 1),
        aggregateCreativeStats(),
      ]);
      setDashboardPrompt(ps[0] ?? null);
      setCreativeStats(stats);
    })();
  }, [liveSignal]);

  // Radar dimension selection.
  const [selectedDim, setSelectedDim] = useState<DimensionKey | null>(null);

  // Phase 4 step 3 — WeeklyPlan modal. Auto-surfaced via the
  // Sunday banner; not directly opened from elsewhere on the
  // dashboard, but the modal mount stays here so the banner can
  // open it without routing to Goals.
  const [weeklyPlanOpen, setWeeklyPlanOpen] = useState(false);

  const displayName = userName;

  const openCreative = (mode?: CreativeMode, prompt?: CreativePrompt) => {
    setLaunchMode(mode);
    setLaunchPrompt(prompt ?? null);
    setCreativeOpen(true);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Phase 4 step 3 — Sunday weekly-plan banner. Self-hides on
          non-Sundays / when already confirmed / when dismissed for
          the week. */}
      <WeeklyPlanBanner onOpenPlan={() => setWeeklyPlanOpen(true)} />

      {/* Section 1 — warm opening */}
      <section className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-medium tracking-tight">
            Hi {editingName ? (
              <span className="inline-flex items-center gap-1">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') { setNameDraft(userName); setEditingName(false); }
                  }}
                  onBlur={async () => {
                    await saveUserName(nameDraft);
                    setEditingName(false);
                  }}
                  placeholder="your name"
                  className="bg-transparent border-b border-fluent/50 focus:outline-none text-2xl sm:text-3xl font-medium tracking-tight px-1"
                  style={{ width: `${Math.max(4, nameDraft.length + 1)}ch` }}
                />
              </span>
            ) : (
              <button
                onClick={beginEditName}
                className="underline-offset-4 decoration-fluent/30 hover:decoration-fluent hover:underline"
                title="rename — also settable in settings"
              >
                {displayName}
              </button>
            )} — how can I help you improve your musicianship today?
          </h1>
        </div>
        <p className="text-sm text-neutral-500 italic leading-relaxed max-w-2xl">
          “{quote.text}” <span className="not-italic text-xs text-neutral-400">— {quote.attribution}</span>
        </p>
        {data && (
          <p className="text-xs text-neutral-500 pt-1">
            {data.consistency.todayMinutes > 0 ? (
              <>
                you've practised <span className="font-medium text-fluent">{formatMinutes(data.consistency.todayMinutes)}</span> today
                {data.consistency.dayStreak > 1 && (
                  <> — <span className="font-medium text-developing">{data.consistency.dayStreak}-day streak</span> 🔥</>
                )}
              </>
            ) : data.consistency.dayStreak > 0 ? (
              <>nothing logged yet today — your <span className="font-medium text-developing">{data.consistency.dayStreak}-day streak</span> is still live 🔥</>
            ) : userNameLoaded ? (
              <>no practice logged yet today. a short session kicks off a new streak.</>
            ) : null}
          </p>
        )}
      </section>

      {data && (
        <>
          {/* Section 2 — Musician Balance radar */}
          <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-6">
            <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
              <div>
                <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
                  musician balance
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  five dimensions, last 30 days weighted toward the past week. tap a point for details.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-6 flex-wrap">
              <MusicianBalanceRadar
                balance={data.balance}
                selected={selectedDim}
                onSelectDimension={key => setSelectedDim(key === selectedDim ? null : key)}
                size={300}
              />
              <div className="max-w-sm min-w-[240px] space-y-3">
                {selectedDim ? (
                  <DimensionDetail
                    dim={selectedDim}
                    value={data.balance[selectedDim]}
                    driver={data.balance.drivers[selectedDim]}
                    suggestion={data.balance.suggestions[selectedDim]}
                  />
                ) : (
                  <DimensionLegend balance={data.balance} onSelect={setSelectedDim} />
                )}
              </div>
            </div>
          </section>

          {/* Section 3a — compact Modules at a Glance preview. Full
              depth lives in the Skills Catalogue; this is a launcher. */}
          <ModulesPreviewSection data={data} />

          {/* Section 3 — Today's practice */}
          <TodaysPracticeSection data={data} />

          {/* Section 4 — Recent wins */}
          <RecentWinsSection data={data} />

          {/* Section 5 — What's calling your attention */}
          <AttentionSection data={data} />

          {/* Section 6 — Creative Genius */}
          <CreativeGeniusSection
            stats={creativeStats}
            prompt={dashboardPrompt}
            onLogCreative={() => openCreative()}
            onStartWithPrompt={() => {
              if (dashboardPrompt) openCreative('play', dashboardPrompt);
              else openCreative('play');
            }}
          />

          {/* Sections 7-9 placeholders */}
          <PlaceholderSection
            title="this week"
            description="weekly practice rhythm, breakthrough moments, what shifted. coming soon."
          />
          <PlaceholderSection
            title="your journey"
            description="long-arc progress: when you first picked up each module, how your vocabulary has grown. coming soon."
          />
          <PlaceholderSection
            title="goals"
            description="short-term intentions and longer arcs — coming soon."
          />

          {/* Section 10 — Quick actions */}
          <QuickActionsSection
            data={data}
            onLogCreative={() => openCreative()}
          />
        </>
      )}

      {!data && (
        <div className="py-12 text-center text-sm text-neutral-500">
          gathering your practice data…
        </div>
      )}

      <CreativeTimeModal
        open={creativeOpen}
        onClose={() => setCreativeOpen(false)}
        initialMode={launchMode}
        initialPrompt={launchPrompt ?? undefined}
      />

      {/* Phase 4 step 3 — WeeklyPlan modal opened by the banner. */}
      <WeeklyPlan
        key={weeklyPlanOpen ? 'weekly-plan-open' : 'weekly-plan-closed'}
        open={weeklyPlanOpen}
        onClose={() => setWeeklyPlanOpen(false)}
      />
    </div>
  );
}

// -------------------------------------------------------------------
// Dimension helpers
// -------------------------------------------------------------------

function DimensionDetail({
  dim,
  value,
  driver,
  suggestion,
}: {
  dim: DimensionKey;
  value: number;
  driver: string;
  suggestion: string;
}) {
  const axis = RADAR_AXES.find(a => a.key === dim)!;
  return (
    <div className="rounded-lg border border-fluent/30 bg-fluent/5 p-4 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{axis.label}</span>
        <span className="font-mono tabular-nums text-2xl text-fluent">{value}</span>
      </div>
      <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
        {driver}
      </p>
      <p className="text-xs text-neutral-500 italic">
        → {suggestion}
      </p>
    </div>
  );
}

function DimensionLegend({
  balance,
  onSelect,
}: {
  balance: { theoretical: number; physical: number; musical: number; creative: number; consistency: number };
  onSelect: (key: DimensionKey) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {RADAR_AXES.map(axis => {
        const value = balance[axis.key];
        return (
          <li key={axis.key}>
            <button
              onClick={() => onSelect(axis.key)}
              className="w-full flex items-center gap-3 text-left group"
            >
              <span className="text-xs text-neutral-500 w-28 shrink-0 group-hover:text-fluent">
                {axis.shortLabel}
              </span>
              <span className="flex-1 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <span
                  className="block h-full bg-fluent rounded-full"
                  style={{ width: `${value}%` }}
                />
              </span>
              <span className="text-xs font-mono tabular-nums text-neutral-600 dark:text-neutral-300 w-8 text-right">
                {value}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// -------------------------------------------------------------------
// Today's practice
// -------------------------------------------------------------------

function TodaysPracticeSection({ data }: { data: DashboardData }) {
  const modules = [...data.earTraining, {
    moduleId: 'harmonic-fluency',
    label: 'harmonic fluency',
    route: '/harmonic-fluency',
    counts: data.harmonicFluency.counts,
    attemptsToday: data.harmonicFluency.attemptsToday,
    dailyGoal: data.harmonicFluency.dailyGoal,
    goalMet: data.harmonicFluency.goalMet,
    lastPracticedDaysAgo: data.harmonicFluency.lastPracticedDaysAgo,
  }];
  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          today's practice
        </h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          daily goal per module · {data.consistency.weekPracticeDays} of 7 days this week
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {modules.map(m => {
          const pct = Math.min(100, Math.round((m.attemptsToday / Math.max(1, m.dailyGoal)) * 100));
          const met = m.goalMet;
          const close = !met && pct >= 50;
          return (
            <Link
              key={m.moduleId}
              to={m.route}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 hover:border-fluent/60 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <span className="text-sm font-medium truncate">{m.label}</span>
                <span className={`text-[10px] uppercase tracking-wide font-medium ${
                  met ? 'text-fluent' : close ? 'text-developing' : 'text-neutral-400'
                }`}>
                  {met ? '✓ met' : close ? 'close' : 'not yet'}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <span
                  className={`block h-full rounded-full ${
                    met ? 'bg-fluent' : close ? 'bg-developing' : 'bg-neutral-300 dark:bg-neutral-600'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-[11px] text-neutral-500 mt-1 flex items-center justify-between">
                <span className="font-mono tabular-nums">
                  {m.attemptsToday}/{m.dailyGoal} today
                </span>
                <span>
                  last: {m.lastPracticedDaysAgo === null ? 'never' : m.lastPracticedDaysAgo === 0 ? 'today' : `${m.lastPracticedDaysAgo}d ago`}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// -------------------------------------------------------------------
// Recent wins
// -------------------------------------------------------------------

interface Win {
  icon: string;
  title: string;
  subtitle: string;
  tone: 'fluent' | 'mastered' | 'developing' | 'warm';
  route?: string;
}

function RecentWinsSection({ data }: { data: DashboardData }) {
  const wins = useMemo<Win[]>(() => {
    const out: Win[] = [];

    // Streak milestones
    const streak = data.consistency.dayStreak;
    if (streak >= 30) {
      out.push({ icon: '🏆', title: `${streak}-day practice streak`, subtitle: 'monthly-plus consistency — rare territory.', tone: 'mastered' });
    } else if (streak >= 14) {
      out.push({ icon: '🔥', title: `${streak}-day practice streak`, subtitle: 'two straight weeks of showing up.', tone: 'warm' });
    } else if (streak >= 7) {
      out.push({ icon: '🔥', title: `${streak}-day practice streak`, subtitle: 'a full week of consistent work.', tone: 'warm' });
    }

    // Fluent + mastered totals across ear training
    for (const m of data.earTraining) {
      if (m.counts.mastered >= 5) {
        out.push({
          icon: '🏆',
          title: `${m.counts.mastered} mastered in ${m.label}`,
          subtitle: '20/20 over the last 20 attempts — the top bracket.',
          tone: 'mastered',
          route: m.route,
        });
      } else if (m.counts.fluent >= 5) {
        out.push({
          icon: '🎯',
          title: `${m.counts.fluent} fluent in ${m.label}`,
          subtitle: 'consistent 80%+ performance on those items.',
          tone: 'fluent',
          route: m.route,
        });
      }
    }

    // Harmonic fluency fluent count
    if (data.harmonicFluency.counts.fluent >= 5 || data.harmonicFluency.counts.mastered >= 1) {
      out.push({
        icon: '✨',
        title: `${data.harmonicFluency.counts.fluent + data.harmonicFluency.counts.mastered} harmonic-fluency cards at fluent or better`,
        subtitle: 'the theory is becoming second nature.',
        tone: 'fluent',
        route: '/harmonic-fluency',
      });
    }

    // Performance-ready songs
    if (data.repertoire.performanceReady.length > 0) {
      const names = data.repertoire.performanceReady
        .slice(0, 3)
        .map(s => s.title)
        .join(', ');
      out.push({
        icon: '🎶',
        title: `${data.repertoire.performanceReady.length} performance-ready song${data.repertoire.performanceReady.length === 1 ? '' : 's'}`,
        subtitle: names + (data.repertoire.performanceReady.length > 3 ? ', and more' : ''),
        tone: 'warm',
        route: '/repertoire',
      });
    }

    // Consistent shapes practice
    const shapesMinutes = Math.round(data.shapes.weightedRecentSeconds / 60);
    if (shapesMinutes >= 60) {
      out.push({
        icon: '💪',
        title: `${shapesMinutes} weighted drill minutes in Shapes & Patterns`,
        subtitle: 'physical command is building.',
        tone: 'developing',
        route: '/shapes-and-patterns',
      });
    }

    return out.slice(0, 5);
  }, [data]);

  if (wins.length === 0) {
    return (
      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          recent wins
        </h2>
        <p className="text-xs text-neutral-500 mt-1 italic">
          not enough practice history yet — wins will appear here as you log more sessions.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-developing/20 bg-gradient-to-br from-developing/5 to-fluent/5 p-4 sm:p-6 space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
        recent wins
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {wins.map((w, i) => {
          const Wrapper = w.route
            ? ({ children }: { children: React.ReactNode }) => (
                <Link to={w.route!} className="block hover:border-fluent/60 transition-colors">{children}</Link>
              )
            : ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
          return (
            <Wrapper key={i}>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 p-3 flex items-start gap-3">
                <span className="text-2xl">{w.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{w.title}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{w.subtitle}</div>
                </div>
              </div>
            </Wrapper>
          );
        })}
      </div>
    </section>
  );
}

// -------------------------------------------------------------------
// Attention section
// -------------------------------------------------------------------

interface AttentionItem {
  icon: string;
  title: string;
  subtitle: string;
  route: string;
  cta: string;
}

function AttentionSection({ data }: { data: DashboardData }) {
  const items = useMemo<AttentionItem[]>(() => {
    const out: AttentionItem[] = [];

    // Going-stale songs
    for (const song of data.repertoire.goingStale.slice(0, 2)) {
      out.push({
        icon: '🎵',
        title: `"${song.title}" is going stale`,
        subtitle: song.daysSince === Infinity
          ? `no recent practice on ${song.artist}`
          : `${song.daysSince} days since you last played it`,
        route: '/repertoire',
        cta: 'revisit',
      });
    }

    // Imbalanced drill skills
    for (const hint of data.shapes.imbalanceHints.slice(0, 2)) {
      out.push({
        icon: '⚖️',
        title: `${hint.label} has uneven coverage`,
        subtitle: 'one drill type dominates — other inversions / variants need time.',
        route: '/shapes-and-patterns',
        cta: 'balance',
      });
    }

    // Unpracticed modules (past 7 days)
    const moduleSnaps = [
      ...data.earTraining.map(m => ({ label: m.label, route: m.route, days: m.lastPracticedDaysAgo })),
      { label: 'harmonic fluency', route: '/harmonic-fluency', days: data.harmonicFluency.lastPracticedDaysAgo },
    ];
    for (const m of moduleSnaps) {
      if (m.days !== null && m.days >= 7) {
        out.push({
          icon: '🌿',
          title: `${m.label} hasn't been touched in ${m.days} days`,
          subtitle: 'a short session would bring it back into the rotation.',
          route: m.route,
          cta: 'open',
        });
      }
    }

    // Needs-work tier items
    for (const m of data.earTraining) {
      if (m.counts.needsWork >= 3) {
        out.push({
          icon: '🎯',
          title: `${m.counts.needsWork} weak-spot items in ${m.label}`,
          subtitle: 'below 50% on the rolling window — targeted practice pays off.',
          route: m.route,
          cta: 'drill',
        });
      }
    }

    return out.slice(0, 5);
  }, [data]);

  if (items.length === 0) {
    return (
      <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          what's calling your attention
        </h2>
        <p className="text-xs text-neutral-500 mt-1 italic">
          nothing urgent — everything's humming. Follow your curiosity today.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-6 space-y-3">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          what's calling your attention
        </h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          a short, focused session on any of these pays off the most.
        </p>
      </div>
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {items.map((it, i) => (
          <li key={i} className="py-2 first:pt-0 last:pb-0 flex items-center gap-3">
            <span className="text-xl shrink-0">{it.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{it.title}</div>
              <div className="text-xs text-neutral-500 truncate">{it.subtitle}</div>
            </div>
            <Link
              to={it.route}
              className="shrink-0 px-3 py-1 rounded-md border border-developing/40 text-developing text-xs font-medium hover:bg-developing/10"
            >
              {it.cta} →
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// -------------------------------------------------------------------
// Creative Genius
// -------------------------------------------------------------------

function CreativeGeniusSection({
  stats,
  prompt,
  onLogCreative,
  onStartWithPrompt,
}: {
  stats: CreativeStats | null;
  prompt: CreativePrompt | null;
  onLogCreative: () => void;
  onStartWithPrompt: () => void;
}) {
  return (
    <section className="rounded-card border border-fluent/20 bg-gradient-to-br from-fluent/5 via-white/0 to-developing/5 dark:from-fluent/10 dark:via-neutral-900/0 dark:to-developing/10 p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-fluent">
          creative genius
        </h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          where the musician lives. prompts are invitations, not assignments.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <StatTile
            value={formatMinutes(stats.todaySeconds / 60)}
            label="today"
          />
          <StatTile
            value={formatMinutes(stats.weekSeconds / 60)}
            label="this week"
          />
          <StatTile
            value={formatMinutes(stats.monthSeconds / 60)}
            label="this month"
          />
        </div>
      )}

      {prompt && (
        <div className="rounded-card border border-fluent/30 bg-white/70 dark:bg-neutral-900/70 p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-fluent font-medium">a prompt for you</div>
          <p className="text-sm leading-relaxed">{prompt.text}</p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onStartWithPrompt}
          className="px-4 py-1.5 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
        >
          start with this prompt
        </button>
        <button
          onClick={onLogCreative}
          className="px-3 py-1.5 rounded-md border border-fluent text-fluent text-sm hover:bg-fluent/10"
        >
          log a creative session
        </button>
        <Link
          to="/harmonic-diary"
          className="px-3 py-1.5 rounded-md border border-amber-400/60 text-amber-700 dark:text-amber-300 text-sm hover:bg-amber-400/10"
        >
          browse your Harmonic Diary →
        </Link>
        {stats?.lastSessionAt && (
          <span className="text-xs text-neutral-500 ml-auto">
            last: {formatHumanAgo(stats.lastSessionAt)} · {stats.lastSessionMode === 'produce' ? 'producing' : 'playing'}
          </span>
        )}
      </div>
    </section>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 p-2">
      <div className="text-xl font-mono tabular-nums text-fluent">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
    </div>
  );
}

// -------------------------------------------------------------------
// Placeholders (sections 7-9)
// -------------------------------------------------------------------

function PlaceholderSection({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-card border border-dashed border-neutral-200 dark:border-neutral-800 p-4 text-xs text-neutral-500">
      <div className="uppercase tracking-wide font-medium text-neutral-500">
        {title} <span className="text-neutral-400 normal-case font-normal">· coming soon</span>
      </div>
      <p className="mt-1">{description}</p>
    </section>
  );
}

// -------------------------------------------------------------------
// Quick actions
// -------------------------------------------------------------------

function QuickActionsSection({
  data,
  onLogCreative,
}: {
  data: DashboardData;
  onLogCreative: () => void;
}) {
  // Suggest "start a practice session" as a link to the module with
  // the most urgent-feeling state (lowest-days-since-practiced
  // module that actually has some data, else the first module).
  const next = useMemo(() => {
    const candidates = [...data.earTraining]
      .filter(m => m.lastPracticedDaysAgo !== null)
      .sort((a, b) => (b.lastPracticedDaysAgo ?? 0) - (a.lastPracticedDaysAgo ?? 0));
    return candidates[0] ?? data.earTraining[0];
  }, [data.earTraining]);

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-6 space-y-3">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          quick actions
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {next && (
          <Link
            to={next.route}
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 hover:border-fluent/60 transition-colors"
          >
            <div className="text-sm font-medium">start a practice session</div>
            <div className="text-xs text-neutral-500 mt-0.5">suggested: {next.label}</div>
          </Link>
        )}
        <button
          onClick={onLogCreative}
          className="text-left rounded-lg border border-fluent/40 bg-fluent/5 p-3 hover:border-fluent transition-colors"
        >
          <div className="text-sm font-medium text-fluent">log creative time</div>
          <div className="text-xs text-neutral-500 mt-0.5">just play / just produce</div>
        </button>
        {data.repertoire.performanceReady.length > 0 ? (
          <Link
            to="/repertoire"
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 hover:border-fluent/60 transition-colors"
          >
            <div className="text-sm font-medium">review performance-ready</div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {data.repertoire.performanceReady.length} song{data.repertoire.performanceReady.length === 1 ? '' : 's'} at internalized or later
            </div>
          </Link>
        ) : (
          <Link
            to="/repertoire"
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 hover:border-fluent/60 transition-colors"
          >
            <div className="text-sm font-medium">open song repertoire</div>
            <div className="text-xs text-neutral-500 mt-0.5">work a song you know</div>
          </Link>
        )}
      </div>
    </section>
  );
}

// -------------------------------------------------------------------
// Modules preview — compact launcher cards between the radar and
// Today's Practice. Full module drill-down lives in the Skills
// Catalogue; this is the "where can I go?" surface on the Dashboard.
// -------------------------------------------------------------------

interface ModulePreviewStat {
  meta: ModuleMeta;
  primaryStat: string;
  secondaryStat?: string;
  planned?: boolean;
}

function ModulesPreviewSection({ data }: { data: DashboardData }) {
  const cards: ModulePreviewStat[] = useMemo(() => {
    const out: ModulePreviewStat[] = [];
    for (const meta of MODULE_ORDER) {
      if (meta.id === 'harmonic-fluency') {
        const c = data.harmonicFluency.counts;
        out.push({
          meta,
          primaryStat: `${c.total} cards`,
          secondaryStat: c.needsWork > 0 ? `${c.needsWork} needs work` : undefined,
        });
      } else if (meta.id === 'ear-training') {
        let total = 0, needs = 0;
        for (const m of data.earTraining) {
          total += m.counts.total;
          needs += m.counts.needsWork + m.counts.stale;
        }
        out.push({
          meta,
          primaryStat: `${total} ear skills`,
          secondaryStat: needs > 0 ? `${needs} need attention` : undefined,
        });
      } else if (meta.id === 'shapes-and-patterns') {
        const s = data.shapes;
        out.push({
          meta,
          primaryStat: `${s.skillsTouched} skills touched`,
          secondaryStat: s.imbalancedSkills > 0 ? `${s.imbalancedSkills} imbalanced` : undefined,
        });
      } else if (meta.id === 'repertoire') {
        const byStage = data.repertoire.byStage;
        const songs = Object.values(byStage).reduce((s, n) => s + n, 0);
        const stale = data.repertoire.goingStale.length;
        out.push({
          meta,
          primaryStat: `${songs} song${songs === 1 ? '' : 's'}`,
          secondaryStat: stale > 0 ? `${stale} going stale` : undefined,
        });
      } else if (meta.id === 'production') {
        const p = data.production;
        out.push({
          meta,
          primaryStat: `${p.completed}/${p.totalLessons} lessons`,
          secondaryStat: p.inProgress > 0 ? `${p.inProgress} in progress` : undefined,
        });
      } else if (meta.status === 'planned') {
        out.push({
          meta,
          primaryStat: 'coming soon',
          planned: true,
        });
      } else {
        out.push({
          meta,
          primaryStat: 'not yet tracked',
          planned: true,
        });
      }
    }
    return out;
  }, [data]);

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          modules at a glance
        </h2>
        <Link
          to="/skills-catalogue"
          className="text-xs text-fluent hover:underline"
        >
          open skills catalogue →
        </Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {cards.map(c => (
          <Link
            key={c.meta.id}
            to={`/skills-catalogue?module=${c.meta.id}`}
            className={`flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${
              c.planned ? 'opacity-60' : 'hover:shadow-sm'
            }`}
            style={{ borderColor: `${c.meta.accentHex}33` }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = c.meta.accentHex; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = `${c.meta.accentHex}33`; }}
          >
            <ModuleGlyph meta={c.meta} size={32} fontSize={14} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">{c.meta.label}</div>
              <div className="text-[10px] text-neutral-500 truncate">
                {c.primaryStat}
                {c.secondaryStat && <> · <span className="text-developing">{c.secondaryStat}</span></>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
