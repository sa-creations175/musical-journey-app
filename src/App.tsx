// Future feature ideas live in /ROADMAP.md at the project root.
import { Suspense, lazy } from 'react';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { migrateSongSpacingPrefs } from './modules/repertoire/spacingPrefs';
import { backfillChartingEngagement } from './modules/repertoire/chartingEngagement';
import { describeWipe, wipeRetiredCellFields } from './modules/repertoire/wipeRetiredCellFields';
import {
  describeIdentityMigration,
  migrateIdentityCardIds,
} from './modules/harmonic-fluency/identityIdMigration';
import {
  cleanUpOrphanedCards,
  describeOrphanCleanup,
} from './modules/harmonic-fluency/orphanedCardCleanup';
import {
  describeSlashCFoldIn,
  foldInSlashCCards,
} from './modules/harmonic-fluency/slashCFoldIn';
import {
  describeModeFoldIn,
  foldInModeCards,
} from './modules/harmonic-fluency/modeFoldIn';
import {
  cleanUpRetiredCard,
  describeRetiredCardCleanup,
} from './modules/harmonic-fluency/retiredCardCleanup';
import {
  describeRetiredCategoryMigration,
  migrateRetiredCategories,
} from './modules/harmonic-fluency/retiredCategoryMigration';
import {
  describeDedupe, removeDuplicateSpacingRows,
} from './lib/spacing/dedupeSpacingRows';
import {
  clearDeclaredChordShapeStages, describeClear,
} from './lib/spacing/clearDeclaredStages';
import {
  describeMigration,
  describePreview,
  migrateFlashcardSchedules,
  previewFlashcardMigration,
  PREF_FLASHCARD_MIGRATION,
  PREF_FLASHCARD_MIGRATION_ARMED,
} from './lib/spacing/migrateFlashcards';
import { getPref } from './lib/userPrefs';
import SpacingSettings from './modules/settings/SpacingSettings';
import Layout from './components/Layout';
import HarmonicFluency from './modules/harmonic-fluency/HarmonicFluency';
import HarmonicFluencyCalendar from './modules/harmonic-fluency/HarmonicFluencyCalendar';
import HarmonicFluencyCategory from './modules/harmonic-fluency/HarmonicFluencyCategory';
import EarTraining from './modules/ear-training/EarTraining';
import Intervals from './modules/ear-training/intervals/Intervals';
import IntervalsCalendar from './modules/ear-training/intervals/IntervalsCalendar';
import ChordRecognition from './modules/ear-training/chord-recognition/ChordRecognition';
import ChordRecognitionCalendar from './modules/ear-training/chord-recognition/ChordRecognitionCalendar';
import ChordProgressions from './modules/ear-training/chord-progressions/ChordProgressions';
import ChordProgressionsCalendar from './modules/ear-training/chord-progressions/ChordProgressionsCalendar';
import ChordProgressionQuiz from './modules/ear-training/chord-progression-quiz/ChordProgressionQuiz';
import ScalesModes from './modules/ear-training/scales-modes/ScalesModes';
import ScalesModesCalendar from './modules/ear-training/scales-modes/ScalesModesCalendar';
import Repertoire from './modules/repertoire/Repertoire';
import SongPracticeCalendar from './modules/repertoire/SongPracticeCalendar';
import ShapesAndPatterns from './modules/shapes-and-patterns/ShapesAndPatterns';
import ShapesAndPatternsSection from './modules/shapes-and-patterns/ShapesAndPatternsSection';
import ShapesAndPatternsCalendar from './modules/shapes-and-patterns/ShapesAndPatternsCalendar';
import MovementScreen from './modules/shapes-and-patterns/movements/MovementScreen';
import Production from './modules/production/Production';
import SessionLog from './modules/session-log/SessionLog';
import SkillsCatalogue from './modules/skills/SkillsCatalogue';
import HarmonicDiary from './modules/harmonic-diary/HarmonicDiary';

// LAZY — the app's first code-split routes. VexFlow plus one music
// font is ~1 MB, so neither Reading surface may ride in the initial
// bundle. See ReadingStaff.tsx for why the bravura subpath is used.
// Reading is no longer dev-only (the drills landed in step 4), so the
// lazy boundary now carries real weight rather than merely deferring
// a page nobody could reach.
const Reading = lazy(() => import('./modules/reading/Reading'));
const ReadingCalendar = lazy(() => import('./modules/reading/ReadingCalendar'));
const ReadingReference = lazy(() => import('./modules/reading/ReadingReference'));
const EarTrainingCalendar = lazy(() => import('./modules/ear-training/EarTrainingCalendar'));
const ProductionCalendar = lazy(() => import('./modules/production/ProductionCalendar'));
const ReadingPreview = lazy(() => import('./modules/reading/ReadingPreview'));
const ReadingSkill = lazy(() => import('./modules/reading/ReadingSkill'));
import DashboardScreen from './modules/dashboard/DashboardScreen';
import Goals from './modules/goals/Goals';
import PracticeSessions from './modules/practice/PracticeSessions';
import ActiveSessionScreen from './modules/practice/ActiveSessionScreen';
import { InstrumentProvider } from './lib/instrumentContext';
import { Toaster } from './components/Toaster';
import RedirectPreservingSearch from './components/RedirectPreservingSearch';
import DbUpgradeOverlay from './components/DbUpgradeOverlay';
import { AuthProvider } from './lib/auth/AuthContext';
import AuthGate from './lib/auth/AuthGate';
import { SyncProvider } from './lib/sync/SyncContext';
import { SessionTimerProvider } from './lib/sessionTimer/SessionTimerContext';

export default function App() {
  // ONE-TIME, AT BOOT, AND IDEMPOTENT. The four retired song-key prefs
  // have to reach the Songs row whether or not the reader ever opens
  // the spacing page — a customised grace window that only applied
  // once you went looking for it would not be applied at all.
  useEffect(() => {
    void migrateSongSpacingPrefs().catch(err => {
      console.warn('[spacing] song pref migration failed', err);
    });
    // ONE-TIME, AND IT DELETES. The chord cell's retired
    // self-assessment wrote acquisition stages with nothing drilled
    // behind them; those rows still counted toward coverage and still
    // reached the session generator. Gated on a synced pref, so it
    // runs once across devices, and it only ever removes rows that
    // have no history AND no drill — see the module's own note.
    void clearDeclaredChordShapeStages()
      .then(r => { if (!r.skipped && r.cleared > 0) console.info(describeClear(r)); })
      .catch(err => {
        console.warn('[spacing] clearing declared stages failed', err);
      });
    // ONE-TIME, AND IT ONLY DELETES. Clears the duplicate spacing rows
    // the charting backfill wrote before its insert was keyed.
    //
    // NOT ORDERED AGAINST THE BACKFILL BELOW. Both are void-ed
    // promises in one effect body, so they are ordered in this source
    // and not in time — an earlier version of this comment claimed
    // otherwise, which is the kind of wrong comment that makes the
    // next person reason from a guarantee that does not exist.
    //
    // They do not need ordering. The dedupe only deletes rows that
    // already exist, and the backfill is a no-op on a cell that has
    // one; interleaved, the worst case is a duplicate left for the
    // next run to clear.
    void removeDuplicateSpacingRows()
      .then(r => { if (!r.skipped && r.removed > 0) console.info(describeDedupe(r)); })
      .catch(err => {
        console.warn('[spacing] duplicate removal failed', err);
      });
    // ONE-TIME, AND IT ONLY ADDS. Sections charted before the charting
    // signal existed have no record that the charting happened, so
    // their cells read Not Started — indistinguishable from a section
    // never touched. This gives each charted section's ORIGINAL-KEY
    // cell the same signal a live edit would now write.
    //
    // It writes nothing else: no band, no interval, no due date. And
    // it runs the same `noteSectionCharted` path a live edit takes,
    // rather than a parallel bulk write, so there is one definition of
    // what charting records.
    void backfillChartingEngagement()
      .then(r => {
        if (!r.skipped && (r.written > 0 || r.unresolved > 0)) {
          console.info(
            `[repertoire] charting backfill: ${r.written} written, ` +
            `${r.alreadyPresent} already present, ${r.unresolved} unresolved`,
          );
        }
      })
      .catch(err => {
        console.warn('[repertoire] charting backfill failed', err);
      });
    // ONE-TIME, DESTRUCTIVE, AND IRREVERSIBLE. Removes the three
    // fields of the retired three-clean-runs gate and its run-through
    // log. It checks the counts it was authorised against before it
    // writes and refuses if they moved — a wipe against a database
    // that changed under it is a wipe nobody previewed.
    //
    // `lastRunAt`, `notes` and `lastEngagedAt` survive; so does
    // `cellState`, which is a synced NOT NULL column.
    void wipeRetiredCellFields()
      .then(r => { if (!r.skipped) console.info(describeWipe(r)); })
      .catch(err => {
        console.warn('[repertoire] retired-field wipe failed', err);
      });
    // Four harmonic-fluency cards whose ids carried a display spelling
    // move onto their identity. It VERIFIES BEFORE IT WRITES and
    // refuses if the row shape is not the one that was authorised —
    // see the header. A refusal logs and leaves the pref unset, so it
    // is a state to come back to rather than a step taken.
    void migrateIdentityCardIds()
      .then(r => {
        if (!r.skipped) console.info(describeIdentityMigration(r));
      })
      .catch(err => {
        console.warn('[hf] identity id migration failed', err);
      });
    // `ksc-3` was `ks-16` a second time and has been taken out of the
    // catalog. Its one attempt and its spacing row live in a database
    // the catalog cannot reach, so they go from here. Same rule as the
    // migration above: it checks the shape it was authorised against
    // and refuses if it moved, rather than deleting whatever it finds.
    void cleanUpRetiredCard()
      .then(r => {
        if (!r.skipped) console.info(describeRetiredCardCleanup(r));
      })
      .catch(err => {
        console.warn('[hf] retired-card cleanup failed', err);
      });
    // 6/♭7 left the slash deck with ruling 30, and nothing in the deck
    // asks what it asked — so its rows go rather than move. IDEMPOTENT
    // BY DATA, not by a pref, for the reason the retired-category
    // migration below states at length: a phone that is days behind can
    // push a row back by sync, and a flag-guarded pass would refuse to
    // touch the one row this exists to remove.
    //
    // It refuses outright if any of the twelve is in the deck again,
    // and it leaves anything a reader wrote by hand where it is —
    // saying so on every boot until somebody decides.
    void cleanUpOrphanedCards()
      .then(r => {
        const line = describeOrphanCleanup(r);
        if (line !== null) console.info(line);
      })
      .catch(err => {
        console.warn('[hf] orphaned-card cleanup failed', err);
      });
    // The three hand-written C slash cards folded into the generator
    // (ruling 37). Same machinery and same two-device reasoning as the
    // retired-category migration below — the difference is the proof,
    // which here is a byte-identical question and answer.
    void foldInSlashCCards()
      .then(r => {
        const line = describeSlashCFoldIn(r);
        if (line !== null) console.info(line);
      })
      .catch(err => {
        console.warn('[hf] slash C fold-in failed', err);
      });
    // Mode Identification regenerated to every key by every mode
    // (ruling 42). Thirty-six old cards fold into the new grid by the
    // same question-and-answer proof, and every old id retires for good
    // — see `modeFoldIn` for why the whole family took a new id shape.
    void foldInModeCards()
      .then(r => {
        const line = describeModeFoldIn(r);
        if (line !== null) console.info(line);
      })
      .catch(err => {
        console.warn('[hf] mode fold-in failed', err);
      });
    // A ONE-SHOT WAS HERE, AND IT IS DELETED RATHER THAN REPINNED.
    // It was authorised to move a coverage goal's stored target from
    // 649 to 648 after `ksc-3` was retired, and it refused from the
    // moment the deck reached 1081 — 648 would have been a different
    // and wrong correction. It worked exactly as designed and could
    // never do anything useful again.
    //
    // NOT REPLACED WITH A VERSION PINNED TO 1081. Silas has ruled that
    // no correction is wanted: a goal whose denominator moved is
    // something he can see and rescope himself, and `scopeShrink`
    // already tells him. This is the app declining to have an opinion
    // about a number its owner already understands.
    // Named Notes and Tritone Pairs are folded into Degrees And Notes,
    // and their rows follow their cards: spacing state with its
    // schedule and its hand-written flags, every attempt, the skill
    // annotation and every diary entry. Deleting the cards without this
    // would leave the rows in IndexedDB and read on screen as though
    // the practice had never happened.
    //
    // IDEMPOTENT BY DATA AND NOT BY A PREF, which is the whole reason
    // it can live in a boot path at all. Two devices, either order, any
    // number of times: it looks for rows still keyed on a retired id
    // and finds none on the second pass. A pref would refuse to touch a
    // legacy row that arrived by sync from a device that had not opened
    // the app since the change.
    //
    // It refuses to move a row it cannot prove belongs — see the
    // module's header — and says so rather than moving it anyway.
    void migrateRetiredCategories()
      .then(r => {
        const line = describeRetiredCategoryMigration(r);
        if (line !== null) console.info(line);
      })
      .catch(err => {
        console.warn('[hf] retired-category migration failed', err);
      });
    // ONE-TIME, AND DELIBERATELY NOT ARMED YET.
    //
    // Carrying every flashcard schedule onto the one engine is a
    // one-way write over live data, so it sits behind a SECOND pref
    // that defaults to off. Wired here means it is in the boot path
    // and will fire the moment that pref is set — it does not mean it
    // has run. Until then this logs the PLAN, read-only, so the number
    // of rows can be looked at before anything is committed to.
    //
    // The order is the whole point: every reader moved onto
    // spacingState first, so nothing is still reading the SM-2 rows
    // this carries across. Running it while both engines were live is
    // what would let them diverge again.
    void (async () => {
      const armed = await getPref<boolean>(PREF_FLASHCARD_MIGRATION_ARMED, false);
      if (!armed) {
        const done = await getPref<boolean>(PREF_FLASHCARD_MIGRATION, false);
        if (!done) console.info(describePreview(await previewFlashcardMigration()));
        return;
      }
      const r = await migrateFlashcardSchedules();
      if (!r.skipped) console.info(describeMigration(r));
    })().catch(err => {
      console.warn('[spacing] flashcard migration failed', err);
    });
  }, []);

  return (
    <AuthProvider>
    <AuthGate>
    <SyncProvider>
    <InstrumentProvider>
    <SessionTimerProvider>
      <Toaster>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* THE HOME SCREEN. Swapped 20 Aug 2026 — step 8.
                Everything else that means "home" already resolved to
                `/`: the sidebar, the mobile tab bar, DASHBOARD_META,
                the page-title map and the PWA start_url. `homeRoute`
                pins that, because a swap leaving three paths on the old
                screen is worse than no swap. */}
            <Route index element={<DashboardScreen />} />
            {/* Bookmarked and sitting open in tabs, so it redirects
                rather than 404s. The search is carried across because
                the dashboard's filters and sort live in the URL — a
                saved view has to arrive as itself. */}
            <Route
              path="dashboard-next"
              element={<RedirectPreservingSearch to="/" />}
            />
            <Route path="settings/spacing" element={<SpacingSettings />} />
            <Route path="goals" element={<Goals />} />
            <Route path="practice-sessions" element={<PracticeSessions />} />
            <Route path="practice-sessions/active" element={<ActiveSessionScreen />} />
            <Route path="harmonic-fluency" element={<HarmonicFluency />} />
            <Route path="harmonic-fluency/calendar" element={<HarmonicFluencyCalendar />} />
            {/* THE DYNAMIC SEGMENT COMES LAST, and would be safe
                anywhere: react-router ranks a static segment above a
                dynamic one, so `calendar` cannot be read as a category.
                A slug that names no category redirects to the module
                home from inside the page. */}
            <Route path="harmonic-fluency/:category" element={<HarmonicFluencyCategory />} />
            <Route path="ear-training" element={<EarTraining />} />
            <Route path="ear-training/calendar" element={<EarTrainingCalendar />} />
            <Route path="ear-training/intervals" element={<Intervals />} />
            <Route path="ear-training/intervals/calendar" element={<IntervalsCalendar />} />
            <Route path="ear-training/chord-recognition" element={<ChordRecognition />} />
            <Route path="ear-training/chord-recognition/calendar" element={<ChordRecognitionCalendar />} />
            <Route path="ear-training/chord-progressions" element={<ChordProgressions />} />
            <Route path="ear-training/chord-progressions/calendar" element={<ChordProgressionsCalendar />} />
            <Route path="ear-training/chord-progression-quiz" element={<ChordProgressionQuiz />} />
            <Route path="ear-training/scales-modes" element={<ScalesModes />} />
            <Route path="ear-training/scales-modes/calendar" element={<ScalesModesCalendar />} />
            <Route path="repertoire" element={<Repertoire />} />
            {/* Song-scoped, via the ?songId= convention Repertoire
                already reads. A second way to name a song in a URL
                would be a second thing to keep in step with the
                first. */}
            <Route path="repertoire/calendar" element={<SongPracticeCalendar />} />
            <Route path="shapes-and-patterns" element={<ShapesAndPatterns />} />
            {/* Declared above the `:section` route for the same reason
                `calendar` is: a static segment must not be readable as
                a section slug.

                THE VOICE-LEADING PAGE **IS** THE MOVEMENTS PAGE
                (ruling 19). One address, one page, one card. The
                section id stays `voice-leading` because it keys every
                stored row; only the address and the words moved. */}
            <Route
              path="shapes-and-patterns/movements"
              element={<ShapesAndPatternsSection section="voice-leading" />}
            />
            <Route
              path="shapes-and-patterns/movements/:movementId"
              element={<MovementScreen />}
            />
            {/* BOTH OLD ADDRESSES STILL LAND — the original
                `/voice-leading` and the one it wore for a few hours
                under `/movements/`. A 404 for a page that moved is the
                app losing something the reader kept. Declared above
                `:movementId` so a static segment cannot be read as a
                movement id. */}
            <Route
              path="shapes-and-patterns/movements/voice-leading"
              element={<Navigate to="/shapes-and-patterns/movements" replace />}
            />
            <Route
              path="shapes-and-patterns/voice-leading"
              element={<Navigate to="/shapes-and-patterns/movements" replace />}
            />
            {/* The dynamic segment is ranked below `calendar` by
                react-router, so a static sibling cannot be read as a
                section. An unknown slug redirects from inside. */}
            <Route
              path="shapes-and-patterns/:section"
              element={<ShapesAndPatternsSection />}
            />
            <Route path="shapes-and-patterns/calendar" element={<ShapesAndPatternsCalendar />} />
            <Route path="production" element={<Production />} />
            <Route path="production/calendar" element={<ProductionCalendar />} />
            <Route path="session-log" element={<SessionLog />} />
            <Route path="skills-catalogue" element={<SkillsCatalogue />} />
            <Route path="harmonic-diary" element={<HarmonicDiary />} />
            <Route
              path="reading"
              element={
                <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading notation…</div>}>
                  <Reading />
                </Suspense>
              }
            />
            <Route
              path="reading/reference"
              element={
                <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading notation…</div>}>
                  <ReadingReference />
                </Suspense>
              }
            />
            <Route
              path="reading/calendar"
              element={
                <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading notation…</div>}>
                  <ReadingCalendar />
                </Suspense>
              }
            />
            {/* The four skills, each its own page. Static siblings —
                reference, calendar, preview — outrank this, so none of
                them can be mistaken for a skill slug. */}
            <Route
              path="reading/:skill"
              element={
                <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading notation…</div>}>
                  <ReadingSkill />
                </Suspense>
              }
            />
            {/* DEV ONLY, and STAYS dev-only now that /reading ships.
                The preview is the standing notation check — a fixed
                21-card set to re-verify against an outside reference
                when the key overlay lands — not a user surface.
                `import.meta.env.DEV` is a compile-time constant, so
                this subtree is dropped from a production build rather
                than merely being unreachable. */}
            {import.meta.env.DEV && (
              <Route
                path="reading/preview"
                element={
                  <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading notation…</div>}>
                    <ReadingPreview />
                  </Suspense>
                }
              />
            )}
          </Route>
        </Routes>
        {/* Inside the router (needs the route) and inside the session
            provider (needs session state) — both feed the idle probe
            that decides auto-reload vs overlay on a cross-tab upgrade. */}
        <DbUpgradeOverlay />
      </BrowserRouter>
      </Toaster>
    </SessionTimerProvider>
    </InstrumentProvider>
    </SyncProvider>
    </AuthGate>
    </AuthProvider>
  );
}
