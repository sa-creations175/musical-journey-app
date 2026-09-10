/**
 * The eight sections of the Settings page, and which one is open.
 *
 * =====================================================================
 * SPLIT FROM THE COMPONENT, so the component file exports a component
 * and nothing else — which is what keeps fast refresh working on it.
 *
 * The ORDER here is Silas's ruling of 10 Sep 2026 and it is also the
 * numbering: a section's kicker is its index in this array, so
 * re-ordering the page re-numbers it and no second list can disagree.
 * =====================================================================
 */
export type SettingsSectionId =
  | 'you' | 'ratings' | 'unlocking' | 'spelling'
  | 'effort' | 'spacing' | 'data' | 'dev';

export const SETTINGS_SECTIONS: ReadonlyArray<{
  id: SettingsSectionId;
  title: string;
}> = [
  { id: 'you', title: 'About You' },
  { id: 'ratings', title: 'Understanding App Ratings' },
  { id: 'unlocking', title: 'Unlocking Tiers of Difficulty' },
  { id: 'spelling', title: 'Setting Note & Progression Spelling' },
  { id: 'effort', title: 'Setting Your Daily Effort' },
  { id: 'spacing', title: 'Scheduling & Spacing Rules' },
  { id: 'data', title: 'Managing Your Data' },
  { id: 'dev', title: 'Developer Tools' },
];

/**
 * WHICH SECTION IS OPEN IS A FOLD, NOT A PREFERENCE ABOUT MUSIC.
 *
 * So it lives in `localStorage` and is per device, exactly like the
 * shared player's settings fold — see `readSettingsOpen` there, whose
 * docblock draws this line. A browser that refuses to store it opens
 * the page closed every time, which is the default anyway.
 */
const OPEN_KEY = 'settingsOpenSection';

export function readOpenSection(): SettingsSectionId | null {
  try {
    const stored = window.localStorage.getItem(OPEN_KEY);
    return SETTINGS_SECTIONS.some(s => s.id === stored)
      ? stored as SettingsSectionId
      : null;
  } catch {
    return null;
  }
}

export function writeOpenSection(id: SettingsSectionId | null): void {
  try {
    if (id === null) window.localStorage.removeItem(OPEN_KEY);
    else window.localStorage.setItem(OPEN_KEY, id);
  } catch {
    // A browser that will not store it still opens and closes.
  }
}

/** A section's 1-based number, which is its place in the ruled order. */
export function sectionNumber(id: SettingsSectionId): number {
  return SETTINGS_SECTIONS.findIndex(s => s.id === id) + 1;
}

export function sectionTitle(id: SettingsSectionId): string {
  return SETTINGS_SECTIONS.find(s => s.id === id)?.title ?? '';
}
