/**
 * Opening the Settings page at one of its sections, from anywhere.
 *
 * =====================================================================
 * THE PANEL IS LAYOUT'S OWN STATE, AND EVERY SCREEN IS BELOW IT.
 *
 * A quiz that wants to say "See all Tiers" sits eight components down
 * from the button that opens Settings. Threading an opener through
 * every one of them would put a prop about a modal on components that
 * have nothing to do with it; a context would be the same thing with
 * more ceremony, for one call.
 *
 * So it is an event. `openSettingsAt` writes which section should be
 * open — the same `localStorage` fold the page already reads, so the
 * page opens THERE rather than opening and then scrolling — and asks
 * Layout to show the panel. One listener, at the top, where the state
 * already is.
 * =====================================================================
 */
import { writeOpenSection, type SettingsSectionId } from './settingsSections';

export const OPEN_SETTINGS_EVENT = 'app:open-settings';

/** Show the Settings panel with `section` unfolded. */
export function openSettingsAt(section: SettingsSectionId): void {
  writeOpenSection(section);
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
}
