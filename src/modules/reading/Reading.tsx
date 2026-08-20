/**
 * Reading — module home.
 *
 * Four skills behind a tab strip. NO SESSION SEQUENCING: chord
 * identification is selectable from the start rather than unlocking
 * once the other three reach maintenance. That suggest-and-confirm
 * rule was deferred, and may not be built at all — picking which
 * skills a month's goals cover already produces the ordering, so a
 * hard-coded gate would duplicate it.
 *
 * Nothing here writes an attempt; see ReadingDrill.
 */

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReadingDrill from './ReadingDrill';
import { readingCounts } from '../../lib/moduleItemCounts';
import { readingSkillForItemRef } from './catalog';
import type { ReadingDrillSkill } from './pickCard';

const SEPIA = '#6f4a2f';

const TABS: ReadonlyArray<{
  id: ReadingDrillSkill;
  label: string;
  blurb: string;
}> = [
  // Notes, shapes and signatures first — the three the design starts
  // with. Chord identification is last because it genuinely depends on
  // the other three, which is a reason to order it, not to lock it.
  { id: 'note',  label: 'notes',       blurb: 'Name the note — letter, then octave.' },
  { id: 'shape', label: 'shapes',      blurb: 'Read the silhouette before the notes.' },
  { id: 'sig',   label: 'signatures',  blurb: 'Name the key, count the accidentals.' },
  { id: 'chord', label: 'chords',      blurb: 'Inversion, root, quality.' },
];

export default function Reading() {
  const [params] = useSearchParams();
  /**
   * `?focus=ref,ref` — the dashboard sending you here from a tapped
   * row. The skill opens on whichever one those refs belong to, so
   * tapping "conceptual knowledge" for D major lands in the signatures
   * drill rather than on the default note tab.
   */
  const focusRefs = useMemo(() => {
    const raw = params.get('focus');
    if (!raw) return undefined;
    const refs = raw.split(',').map(r => r.trim()).filter(Boolean);
    return refs.length > 0 ? refs : undefined;
  }, [params]);
  const focusSkill = focusRefs
    ? readingSkillForItemRef(focusRefs[0]) ?? undefined
    : undefined;

  const [skill, setSkill] = useState<ReadingDrillSkill>(focusSkill ?? 'note');
  const counts = readingCounts();
  const active = TABS.find(t => t.id === skill)!;

  const countFor = (id: ReadingDrillSkill) =>
    id === 'note' ? counts.noteRecognition
    : id === 'shape' ? counts.notationShapes
    : id === 'sig' ? counts.keySignatures
    : counts.chordIdentification;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* No module heading here. The pinned header in Layout already
          carries the name and the module tagline — see pageTitle.ts —
          and no other module repeats its own. What DOES belong here is
          the per-skill line, which the header cannot show because it is
          static per route and this changes with the tab. */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(tab => {
          const on = tab.id === skill;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSkill(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                on
                  ? 'text-white border-transparent'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-neutral-400'
              }`}
              style={on ? { backgroundColor: SEPIA } : undefined}
            >
              {tab.label}
              <span className={`ml-1.5 tabular-nums ${on ? 'opacity-70' : 'text-neutral-400'}`}>
                {countFor(tab.id)}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[12px] text-neutral-500">{active.blurb}</p>

      {/* Remounting per skill resets the drill's local state without
          the drill needing to know a skill can change under it. */}
      <ReadingDrill
        key={skill}
        skill={skill}
        {...(focusRefs && skill === focusSkill ? { focusRefs } : {})}
      />
    </div>
  );
}
