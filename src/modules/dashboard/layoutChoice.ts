/**
 * Which dashboard renders, and where that answer is remembered.
 *
 * =====================================================================
 * THREE STATES, NOT TWO, AND THE THIRD IS THE DEFAULT.
 *
 * The screen used to decide alone: `useIsMobile()` at the top, and one
 * branch. That is still what **Follow the screen** does, and it is
 * still what happens for anyone who never presses anything — so nothing
 * moves for a reader who does not know this exists.
 *
 * The other two override it. **Tree** and **Cards** mean always, on
 * whatever the viewport is. A two-state toggle could not express
 * "follow the screen" at all: it would have to start on whichever the
 * viewport currently said and then stop listening, which is a different
 * behaviour wearing the default's clothes.
 *
 * =====================================================================
 * NEITHER DASHBOARD IS FORKED. This decides WHICH of the two already
 * built renders, and nothing else. There is no third variant, and the
 * card view is the same component the phone has always shown — only
 * the width of the column it stands in is new. See `CARDS_COLUMN`.
 *
 * =====================================================================
 * REMEMBERED THROUGH `useAxisViews`, which is the app's one store for a
 * remembered display choice — the axis orderings on Progress Detail,
 * which way up a grid is drawn, which layout a category shows, and the
 * module-home card sort. No second mechanism and no new stored shape.
 *
 * The store's pref key is still `moduleHome.axisViews`, which now
 * understates what it holds. Renaming it is a stored-shape change and
 * so is Silas's to approve; the alternative — a second key for this one
 * choice — is exactly the thing the rule forbids.
 * =====================================================================
 */

export type DashboardLayoutChoice = 'screen' | 'tree' | 'cards';

/**
 * The field this choice is remembered under.
 *
 * Cannot collide with an axis field (a `SkillRecord` key), with the
 * `grid-orientation:` / `grid-layout:` prefixes, or with `card-sort`.
 */
export const DASHBOARD_LAYOUT_FIELD = 'dashboard-layout';

/**
 * UNAPPROVED COPY, all four strings. Drafted for this build and never
 * ruled on — listed in the report. No approved words for a dashboard
 * layout control exist in `docs/WHOLE_SONG_TEST_COPY.md` or
 * `docs/TEMPO_SOURCE_SPEC.md` §10.
 */
export const DASHBOARD_LAYOUT_LABEL = 'Layout';

export const DASHBOARD_LAYOUT_CHOICES:
ReadonlyArray<{ id: DashboardLayoutChoice; label: string }> = [
  // The default leads, so the control reads left-to-right as
  // "what happens today, or one of these two instead".
  { id: 'screen', label: 'Follow the screen' },
  { id: 'tree',   label: 'Tree' },
  { id: 'cards',  label: 'Cards' },
];

/**
 * The choice to act on, given what was remembered.
 *
 * The stored value is only ever a HINT — the same rule `resolveView`
 * and `resolveCardSort` follow. Anything unrecognised, absent included,
 * is "follow the screen", so a renamed state cannot leave the dashboard
 * unable to decide what to draw.
 */
export function resolveDashboardLayout(stored: string | null): DashboardLayoutChoice {
  return DASHBOARD_LAYOUT_CHOICES.some(c => c.id === stored)
    ? (stored as DashboardLayoutChoice)
    : 'screen';
}

/**
 * Whether the cards render.
 *
 * ONE FUNCTION, so the screen's branch and any test of it read the same
 * rule. `screen` defers to the viewport exactly as the bare
 * `useIsMobile()` call did.
 */
export function dashboardShowsCards(
  choice: DashboardLayoutChoice,
  isMobile: boolean,
): boolean {
  if (choice === 'cards') return true;
  if (choice === 'tree') return false;
  return isMobile;
}

/**
 * How wide the card view is allowed to get.
 *
 * =====================================================================
 * THE ONE THING THE CARD VIEW NEEDED IN ORDER TO STAND AT DESKTOP
 * WIDTH, and it is a container, not a copy.
 *
 * Every row in it is a full-width block with a name at the left and a
 * number pushed to the right by `ml-auto`, over a bar drawn at a
 * percentage of the row. At 1024px that is a name and a number at
 * opposite ends of the screen with a metre of nothing between them, and
 * a progress bar a metre long — the shape reads as broken rather than
 * as wide.
 *
 * 48rem IS 768px, WHICH IS `MOBILE_QUERY`'S OWN BOUNDARY. So the card
 * view at any desktop width is laid out at exactly the width it is laid
 * out at on the widest screen that gets it automatically. It is not a
 * new size; it is the size it was designed and walked at.
 *
 * NOT CENTRED, because the app's own `<main>` is `max-w-5xl` with no
 * `mx-auto` — every other page in the app is left-aligned in the
 * content area, and centring this one would make it the odd screen out.
 *
 * A WHOLE LITERAL CLASS, and pinned as one by a test. Tailwind scans
 * source text, so a width assembled from a number would be invisible to
 * the scanner, emit no rule, and silently not exist.
 * =====================================================================
 */
export const CARDS_COLUMN = 'max-w-3xl';
