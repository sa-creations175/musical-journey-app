/**
 * Readable labels for interval-training itemRefs.
 *
 * Item-refs use the `intervalId:direction` shape recordEngagement
 * writes (e.g. "P5:asc", "m3:desc"). Raw, they read as codes — this
 * maps them to the interval's display name + direction for surfaces
 * that list a block's items, like the session prep breakdown.
 */
import { INTERVAL_SEEDS } from './seed';

const NAME_BY_ID: ReadonlyMap<string, string> = new Map(
  INTERVAL_SEEDS.map(i => [i.id, i.name]),
);

const DIRECTION_LABEL: Readonly<Record<string, string>> = {
  asc: 'ascending',
  desc: 'descending',
};

/**
 * "P5:asc" → "Perfect 5th (ascending)"; a bare "P5" → "Perfect 5th".
 * Unknown interval ids fall back to the bare id (never the raw `:dir`).
 */
export function labelForIntervalItemRef(itemRef: string): string {
  const colon = itemRef.indexOf(':');
  const id = colon < 0 ? itemRef : itemRef.slice(0, colon);
  const dir = colon < 0 ? '' : itemRef.slice(colon + 1);
  const name = NAME_BY_ID.get(id) ?? id;
  const dirLabel = DIRECTION_LABEL[dir];
  return dirLabel ? `${name} (${dirLabel})` : name;
}
