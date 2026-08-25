/**
 * Where things sit in the sidebar.
 *
 * =====================================================================
 * SOURCE-LEVEL, BECAUSE TWO OF THE THREE ARE ABSENCES.
 *
 * "The diary is no longer under harmonic fluency" and "the progression
 * quiz is no longer under ear training" are statements about what the
 * nav does NOT contain, and rendering proves only the positive case. A
 * second listing left behind in a group the test never expanded would
 * sail through.
 *
 * The third — Dashboard above Goals — is an order, which is a fact
 * about the list rather than about the pixels.
 * =====================================================================
 *
 * The quiz's ROUTE is asserted unchanged alongside its new home: moving
 * a page in the nav and moving it in the URL are different changes, and
 * only the first was asked for.
 */
import { describe, expect, it } from 'vitest';

const SOURCE: string = (
  import.meta.glob('../SidebarNav.tsx', { eager: true, query: '?raw', import: 'default' }) as
    Record<string, string>
)['../SidebarNav.tsx'];

/** The slice of the source between two markers, or throw. */
function between(startMarker: string, endMarker: string): string {
  const start = SOURCE.indexOf(startMarker);
  expect(start, `no ${startMarker}`).toBeGreaterThan(-1);
  const end = SOURCE.indexOf(endMarker, start);
  expect(end, `no ${endMarker} after ${startMarker}`).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
}

describe('the sweep actually reads the file', () => {
  it('has the nav in hand', () => {
    expect(SOURCE.length).toBeGreaterThan(1000);
    expect(SOURCE).toContain('NAV_GROUPS');
  });
});

describe('Dashboard leads the Overview group', () => {
  it('is listed before Goals', () => {
    const overview = between("id: 'overview'", "id: 'structured-learning'");
    expect(overview.indexOf("id: 'dashboard'")).toBeGreaterThan(-1);
    expect(overview.indexOf("id: 'goals'")).toBeGreaterThan(-1);
    expect(overview.indexOf("id: 'dashboard'")).toBeLessThan(overview.indexOf("id: 'goals'"));
  });

  it('still carries Skills Catalogue as its child', () => {
    const overview = between("id: 'overview'", "id: 'structured-learning'");
    expect(overview).toContain("'/skills-catalogue'");
  });
});

describe('the harmonic diary', () => {
  it('is gone from harmonic fluency', () => {
    const hf = between("id: 'harmonic-fluency'", "id: 'ear-training'");
    expect(hf).not.toContain("'/harmonic-diary'");
  });

  it('is not deleted — it keeps its home under Creative Sessions', () => {
    const creative = SOURCE.slice(SOURCE.indexOf("id: 'creative-sessions'"));
    expect(creative).toContain("'/harmonic-diary'");
  });

  it('is listed exactly once in the whole nav', () => {
    const listings = SOURCE.match(/to: '\/harmonic-diary'/g) ?? [];
    expect(listings).toHaveLength(1);
  });
});

describe('the progression quiz', () => {
  it('is gone from ear training', () => {
    const et = between("id: 'ear-training'", "id: 'reading'");
    expect(et).not.toContain('chord-progression-quiz');
  });

  it('is listed under song repertoire', () => {
    const rep = between("id: 'repertoire'", "id: 'production'");
    expect(rep).toContain('chord-progression-quiz');
    expect(rep).toContain("label: 'progression quiz'");
  });

  it('keeps the route it already had', () => {
    // The move is a nav move. Changing the URL would break every link
    // that already points at the page.
    expect(SOURCE).toContain("to: '/ear-training/chord-progression-quiz'");
  });

  it('is listed exactly once in the whole nav', () => {
    const listings = SOURCE.match(/chord-progression-quiz'/g) ?? [];
    expect(listings).toHaveLength(1);
  });
});
