import { useMemo } from 'react';
import ItemSelectionPanel, {
  type SelectionSection,
} from '../../../components/ItemSelectionPanel';
import { MODES, type ModeId } from './catalog';
import { scaleItemId, vampItemId, MODULE_ID } from './shared';
import { ROLLING_WINDOW_SIZE } from '../../../lib/adaptiveSelection';
import { computeTier } from '../../../lib/tier';
import { daysBetween, localDayKey } from '../../../lib/dailyGoal';
import type { AttemptRecord } from '../../../lib/db';

// Church modes = the seven diatonic modes of the major scale.
const CHURCH_MODES: ModeId[] = [
  'ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian',
];

interface Props {
  initialSelection: string[];
  onStart: (keys: string[]) => void;
  onCancel: () => void;
  focusActive: boolean;
  attempts: AttemptRecord[];
}

export default function FocusPanel({
  initialSelection,
  onStart,
  onCancel,
  focusActive,
  attempts,
}: Props) {
  const sections: SelectionSection[] = useMemo(() => ([
    {
      title: 'Church modes (diatonic)',
      items: MODES
        .filter(m => CHURCH_MODES.includes(m.id))
        .sort((a, b) => a.parentScalePosition - b.parentScalePosition)
        .map(m => ({ key: m.id, label: m.name })),
    },
    {
      title: 'Minor scales',
      items: MODES
        .filter(m => m.id === 'harmonic-minor' || m.id === 'melodic-minor')
        .map(m => ({ key: m.id, label: m.name })),
    },
  ]), []);

  const suggestWeakSpots = (): string[] => {
    const today = localDayKey();
    const weak: string[] = [];
    for (const mode of MODES) {
      // Combine both tab attempts — weak on either tab = worth practicing.
      const ids = [scaleItemId(mode), vampItemId(mode)];
      const all = attempts
        .filter(a => a.moduleId === MODULE_ID && ids.includes(a.itemId))
        .sort((a, b) => b.timestamp - a.timestamp);
      const recent = all.slice(0, ROLLING_WINDOW_SIZE);
      const correct = recent.filter(a => a.correct).length;
      const latestTs = all[0]?.timestamp;
      const daysSince = latestTs ? daysBetween(localDayKey(new Date(latestTs)), today) : null;
      const tier = computeTier({
        windowCorrect: correct,
        windowTotal: recent.length,
        daysSinceLastAttempt: daysSince,
      });
      if (tier === 'developing' || tier === 'needsWork' || tier === 'untouched' || tier === 'stale') {
        weak.push(mode.id);
      }
    }
    return weak;
  };

  const brightnessTier = (band: 'brightest' | 'middle' | 'darkest'): string[] => {
    return MODES
      .filter(m => {
        if (band === 'brightest') return m.brightnessRank <= 3;
        if (band === 'middle') return m.brightnessRank >= 4 && m.brightnessRank <= 6;
        return m.brightnessRank >= 7;
      })
      .map(m => m.id);
  };

  return (
    <ItemSelectionPanel
      title="focus on specific modes"
      description="drill only the modes you pick. adaptive weighting still applies inside your selection."
      note={focusActive ? (
        <div className="rounded-lg border border-fluent/30 bg-fluent/10 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200">
          <span className="font-medium text-fluent">focus mode is active</span> — modify the selection and click update, or cancel to keep practicing your current set.
        </div>
      ) : undefined}
      sections={sections}
      initialSelection={initialSelection}
      onStart={onStart}
      onCancel={onCancel}
      startLabel={focusActive ? 'update focus session' : 'start focus session'}
      suggestWeakSpots={suggestWeakSpots}
      emptySuggestionMessage="no modes in developing, needs-work, stale, or untouched tiers yet."
      extraQuickSelects={[
        {
          label: 'church modes only',
          compute: () => CHURCH_MODES as string[],
        },
        {
          label: 'include harmonic + melodic minor',
          compute: () => MODES.map(m => m.id),
        },
        {
          label: 'brightest tier',
          compute: () => brightnessTier('brightest'),
        },
        {
          label: 'middle tier',
          compute: () => brightnessTier('middle'),
        },
        {
          label: 'darkest tier',
          compute: () => brightnessTier('darkest'),
        },
      ]}
    />
  );
}
