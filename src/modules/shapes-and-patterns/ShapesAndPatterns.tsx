import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ModuleIntro from '../../components/ModuleIntro';
import { getPref, setPref } from '../../lib/userPrefs';
import { useUrlTabSync } from '../../lib/useUrlTabSync';
import TodayAndAttention from './TodayAndAttention';
import ChordShapeDrills from './ChordShapeDrills';
import ScaleDrills from './ScaleDrills';
import VoiceLeadingDrills from './VoiceLeadingDrills';
import MentalVizDrills from './MentalVizDrills';
import {
  cleanupGhostKeyboardIfNeeded,
  cleanupScaleDirectionalDrillsIfNeeded,
} from './cleanup';
import type { QualityKind } from './catalog';
import CategoryCardGrid from '../../components/moduleHome/CategoryCardGrid';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import {
  MENTAL_VIZ_MODULE_REF,
  SHAPES_MODULE_ID,
  SHAPES_MODULE_REF,
  isShapesSectionId,
  shapesCards,
} from './homeCards';

type TabId = 'chord-shapes' | 'scales' | 'voice-leading' | 'mental-viz';

function isTabId(v: string): v is TabId {
  return v === 'chord-shapes' || v === 'scales' || v === 'voice-leading' || v === 'mental-viz';
}

const PREF_ACTIVE_TAB = 'shapesAndPatternsActiveTab';
const PREF_CHORD_SCOPE = 'shapesAndPatternsChordScope';

// The tab strip's order and labels now live in `SHAPES_SECTIONS`,
// which the cards read — scales first as the parent structure chords
// derive from, mental viz last as the away-from-keyboard capstone.

const DEFAULT_TAB: TabId = 'scales';

export default function ShapesAndPatterns() {
  const [tab, setTab] = useState<TabId>(DEFAULT_TAB);
  const [chordScope, setChordScope] = useState<QualityKind | 'all'>('all');
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await getPref<TabId>(PREF_ACTIVE_TAB, DEFAULT_TAB);
      if (isTabId(t)) {
        setTab(t);
      }
      const s = await getPref<QualityKind | 'all'>(PREF_CHORD_SCOPE, 'all');
      if (s === 'all' || s === 'triad' || s === 'seventh' || s === 'extension' || s === 'special') {
        setChordScope(s);
      }
      setPrefsLoaded(true);
      // Retire any ghost-keyboard orphan drill rows from legacy data.
      await cleanupGhostKeyboardIfNeeded();
      // Collapse legacy ascending/descending scale drills into the
      // single "Scale drill" row.
      await cleanupScaleDirectionalDrillsIfNeeded();
    })();
  }, []);

  // Sidebar sub-items land here as /shapes-and-patterns?tab=<id>.
  useUrlTabSync<TabId>('tab', isTabId, setTab);

  useEffect(() => { if (prefsLoaded) void setPref(PREF_ACTIVE_TAB, tab); }, [tab, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) void setPref(PREF_CHORD_SCOPE, chordScope); }, [chordScope, prefsLoaded]);

  const shapesRows = useLiveQuery(
    () => db.spacingState.where('moduleRef').equals(SHAPES_MODULE_REF).toArray(),
    [],
  ) ?? [];
  const mentalVizRows = useLiveQuery(
    () => db.spacingState.where('moduleRef').equals(MENTAL_VIZ_MODULE_REF).toArray(),
    [],
  ) ?? [];
  const now = Date.now();
  const cards = useMemo(
    () => shapesCards(shapesRows, mentalVizRows, now),
    // `now` is deliberately not a dep — freshness moves in days.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shapesRows, mentalVizRows],
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link
          to="/shapes-and-patterns/calendar"
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          view calendar →
        </Link>
      </div>

      <TodayAndAttention />

      {/* THE CARDS REPLACE THE TAB STRIP. The tabs said which section
          was selected and nothing about how it was going; a card
          carries the coverage and the last time it was worked, which is
          what decides where to start.

          NO BADGE AND NO BAR ON ANY OF THEM — this module records a
          duration and a self-rating, never a right answer. The adapter
          passes `accuracy: null` and the card omits both rather than
          drawing an empty one.

          `?tab=` STILL LANDS. The sidebar's sub-items, the skills
          catalogue's jump and the session generator's quick-launch all
          arrive with one, and `useUrlTabSync` above still reads it — a
          card tap is a second way in, not a replacement for the URL. */}
      <CategoryCardGrid
        cards={cards}
        moduleId={SHAPES_MODULE_ID}
        onDrill={key => { if (isShapesSectionId(key)) setTab(key); }}
        drillLabel="open drills"
        now={now}
      />

      {tab === 'chord-shapes' && (
        <ChordShapeDrills scope={chordScope} onScopeChange={setChordScope} />
      )}
      {tab === 'scales' && <ScaleDrills />}
      {tab === 'voice-leading' && <VoiceLeadingDrills />}
      {tab === 'mental-viz' && <MentalVizDrills />}

      {/* Learn-more card — secondary, below the drills. */}
      <ModuleIntro
        accent="green"
        headline="Drill reps compound. Show up across 12 keys."
        description="Chord shapes, scales, voice-leading patterns, and mental visualisation — every rep lands on a cell and the heat grid shows your landscape at a glance."
        bullets={[
          '**Heat grid** shows time invested × freshness across 12 keys',
          'Every drill is **editable** and **renameable**; add your own anytime',
          'Global **metronome** (top-right) auto-starts with every drill timer',
          'No daily goal — just honest accumulation',
        ]}
      />
    </div>
  );
}
