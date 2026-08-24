/**
 * The dashboard's one data hook.
 *
 * Deliberately thin. Everything interesting is in `read/load.ts` and is
 * pure; this exists only to turn a Dexie live query into React state, so
 * that the untestable part of the pipeline is as small as it can be.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import {
  SPACING_DEFAULTS, getSpacingSettings, type SongKeySpacingSettings,
} from '../repertoire/spacingPrefs';
import { db } from '../../lib/db';
import {
  assembleDashboard,
  loadDashboardSource,
  type Dashboard,
} from './read/load';

export interface DashboardState {
  dashboard: Dashboard | null;
  /** True until the first read resolves. Distinct from an empty
   *  dashboard, which is a real and expected state - the screen opens
   *  nearly empty by design. */
  loading: boolean;
}

/**
 * `now` is a parameter so the caller owns the clock.
 *
 * It feeds the due set and every "days since" readout. Taking
 * `Date.now()` inside would make the hook re-derive on every render
 * against a moving value, and would make the whole screen untestable
 * for exactly the reason the read layer takes `now` everywhere else.
 */
export function useDashboardData(now: number): DashboardState {
  // The dependency list is the tables the loader reads. Dexie's live
  // query re-fires on any write to them, so finishing a drill updates
  // the screen without a manual refresh - which is the behaviour that
  // makes a cached dashboard the wrong fix if this ever gets slow.
  const source = useLiveQuery(() => loadDashboardSource(), []);

  // The user's retest windows, for the repertoire due count. Read once
  // and defaulted until it arrives, so the first paint shows a count
  // computed with the shipped windows rather than none at all — and a
  // wrong count for one tick is only wrong if the user changed them,
  // in which case it corrects itself immediately.
  const [spacing, setSpacing] = useState<SongKeySpacingSettings>(SPACING_DEFAULTS);
  useEffect(() => {
    let live = true;
    getSpacingSettings()
      .then(s => { if (live) setSpacing(s); })
      .catch(err => { console.warn('[dashboard] spacing settings read failed', err); });
    return () => { live = false; };
  }, []);

  const dashboard = useMemo(
    () => (source === undefined ? null : assembleDashboard(source, now, spacing)),
    [source, now, spacing],
  );

  return { dashboard, loading: source === undefined };
}

/** Table names the hook's live query depends on. Exported so a test or
 *  a future consumer can assert the loader and the hook agree about
 *  what the dashboard reads. */
export const DASHBOARD_TABLES: ReadonlyArray<keyof typeof db> = [
  'attempts',
  'drillSessions',
  'drillSkills',
  'spacingState',
  'productionLessons',
  'productionLessonSessions',
  'songs',
  'songMatrixSections',
  'songKeys',
  'songCells',
  'songCellRunThroughs',
  'songPracticeLog',
];
