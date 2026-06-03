/**
 * Goals-home select mode — cross-cutting state for bulk goal
 * selection.
 *
 * A React context rather than props because goal rows sit 3-4
 * component layers below the page (Goals → LayerSection /
 * ByModuleSection → UmbrellaRow → GoalRow); threading select state
 * through every signature would touch a dozen components that don't
 * care about it.
 *
 * The default value is the inactive state, so row components render
 * normally when no provider is mounted (tests, or any future surface
 * that reuses a row outside the Goals page).
 */

import { createContext, useContext } from 'react';

export interface GoalSelectState {
  /** True while the user is in select mode. */
  active: boolean;
  /** Ids of currently-checked goals. */
  selected: ReadonlySet<string>;
  /** Check/uncheck one goal. No-op when select mode is inactive. */
  toggle: (goalId: string) => void;
}

export const INACTIVE_GOAL_SELECT: GoalSelectState = {
  active: false,
  selected: new Set<string>(),
  toggle: () => {},
};

export const GoalSelectContext =
  createContext<GoalSelectState>(INACTIVE_GOAL_SELECT);

export function useGoalSelect(): GoalSelectState {
  return useContext(GoalSelectContext);
}
