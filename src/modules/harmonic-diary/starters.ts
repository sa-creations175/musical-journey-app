// Harmonic-diary starter content.
//
// Claude-authored seed associations for every harmonic element the
// app tracks. Written as emotional fingerprints, not theoretical
// explanations — tuned to the lineage the app lives inside (gospel,
// R&B, soul, jazz, neo-soul, hip-hop).
//
// Each entry produces a `HarmonicDiaryEntry` at first-load via
// `seedStartersIfNeeded` in ./data.ts. Users can keep, edit, or
// delete each starter; the original `claudeStarterText` is preserved
// even after edits so it remains a reference.

import type { HarmonicDiaryEntry } from '../../lib/db';
import { canonicalSkillId } from '../skills/registry';

export interface StarterSeed {
  skillId: string;
  text: string;
  emotional: string[];
  genre?: string[];
  /** Display name — used by the Diary when the skillId doesn't
   *  correspond to a registry entry (e.g. chord-motion concepts). */
  displayName?: string;
  /** Fallback module label — same purpose as displayName. */
  displayModule?: string;
}

// --- Intervals (asc + desc, 26 entries) ----------------------------

interface IntervalLine { id: string; name: string; asc: string; desc: string; ascTags: string[]; descTags: string[]; genre?: string[]; }

const INTERVALS: IntervalLine[] = [
  {
    id: 'P1', name: 'Unison',
    asc: "Two voices on the same note — steadiness before anything begins. The held breath of a congregation gathering.",
    desc: "Same note, different weight. A mirror held still; the chord rests on itself.",
    ascTags: ['contemplative', 'resolved'],
    descTags: ['contemplative', 'warm'],
  },
  {
    id: 'm2', name: 'Minor 2nd',
    asc: "The closest step up: tension without arrival. Jaws creeping closer; the uneasy question leaning in.",
    desc: "Half-step sigh downward, a note releasing its grip — Joy to the World's opening fall, relief laid down.",
    ascTags: ['tense', 'mysterious'],
    descTags: ['tender', 'resolved'],
  },
  {
    id: 'M2', name: 'Major 2nd',
    asc: "Gentle step upward, innocence moving — Happy Birthday beginning, the first stride of something new.",
    desc: "Soft retreat, a cradle rocking — Mary Had a Little Lamb, the step that returns to safety.",
    ascTags: ['bright', 'hopeful'],
    descTags: ['tender', 'warm'],
  },
  {
    id: 'm3', name: 'Minor 3rd',
    asc: "Blues lift that keeps its weight — Smoke on the Water's opening call, the signature rise of soul.",
    desc: "Gospel sigh downward — the \"Hey\" in \"Hey Jude,\" the turn toward the ground.",
    ascTags: ['soulful', 'melancholy'],
    descTags: ['melancholy', 'soulful'],
    genre: ['soul', 'blues'],
  },
  {
    id: 'M3', name: 'Major 3rd',
    asc: "Bright, confident lift — the arc that opens \"When the Saints Go Marching In.\" Daylight stepping in.",
    desc: "Warm descent that lands — Swing Low Sweet Chariot, the shoulder you lean on.",
    ascTags: ['bright', 'hopeful', 'triumphant'],
    descTags: ['warm', 'reverent'],
    genre: ['gospel'],
  },
  {
    id: 'P4', name: 'Perfect 4th',
    asc: "The calling — Here Comes the Bride, the summoning step. Open, proud, unfinished until it moves.",
    desc: "Return pull — Oh Come All Ye Faithful, the gentle arriving step before the welcome.",
    ascTags: ['triumphant', 'reverent'],
    descTags: ['reverent', 'resolved'],
    genre: ['gospel'],
  },
  {
    id: 'TT', name: 'Tritone',
    asc: "The flame without resolution — Simpsons theme, a threshold you cross knowing something follows.",
    desc: "Diabolus in musica from above — Maria from West Side Story, dark beauty falling into longing.",
    ascTags: ['tense', 'mysterious'],
    descTags: ['mysterious', 'longing'],
  },
  {
    id: 'P5', name: 'Perfect 5th',
    asc: "Heroic leap, sky beneath you — Star Wars theme, triumph striding in.",
    desc: "Fanfare laid down — Flintstones theme, settling into the room, feet on the ground.",
    ascTags: ['triumphant', 'bright'],
    descTags: ['playful', 'warm'],
  },
  {
    id: 'm6', name: 'Minor 6th',
    asc: "Ache lifting — The Entertainer's lurking question, love interrupted mid-sentence.",
    desc: "Deep exhale of sorrow — the weight of Nobody Knows the Trouble I've Seen, the full chest giving way.",
    ascTags: ['longing', 'melancholy'],
    descTags: ['melancholy', 'soulful'],
    genre: ['gospel', 'blues'],
  },
  {
    id: 'M6', name: 'Major 6th',
    asc: "Earnest reach upward — My Bonnie Lies Over the Ocean, romantic stretch across distance.",
    desc: "Blues of the spiritual — the drop that carries memory, a phrase landing low in the chest.",
    ascTags: ['warm', 'longing'],
    descTags: ['soulful', 'melancholy'],
    genre: ['gospel', 'blues'],
  },
  {
    id: 'm7', name: 'Minor 7th',
    asc: "Yearning upward, longing with sharp edges — Somewhere from West Side Story, the leap toward what might not be.",
    desc: "Watermelon Man intro — funk pocket descent, the weight that finds the groove.",
    ascTags: ['longing', 'melancholy'],
    descTags: ['funky', 'soulful'],
    genre: ['jazz', 'funk'],
  },
  {
    id: 'M7', name: 'Major 7th',
    asc: "Sophisticated aspiration — Take on Me's synth climb, reaching for elegance just short of the octave.",
    desc: "Cole Porter's \"I Love You\" — the elegance that settles on a confession.",
    ascTags: ['dreamy', 'hopeful'],
    descTags: ['contemplative', 'warm'],
    genre: ['jazz'],
  },
  {
    id: 'P8', name: 'Octave',
    asc: "Over the Rainbow's leap of faith — joy and yearning at once, the whole distance in one breath.",
    desc: "Willow Weep for Me — the full weight of an octave falling, resignation with beauty in it.",
    ascTags: ['hopeful', 'longing'],
    descTags: ['melancholy', 'contemplative'],
    genre: ['jazz'],
  },
];

// --- Chord qualities (29 entries) ---------------------------------
// Keys match the chord-recognition catalog (ids in CHORD_SEEDS). The
// diary entry skillId follows `chord-recognition:item:<id>` so the
// Skills Catalogue shows these associations when the user opens a
// chord-recognition skill.

interface QualityLine { id: string; text: string; emotional: string[]; genre?: string[]; }

const QUALITIES: QualityLine[] = [
  { id: 'maj',      text: "Warm, stable, wide open — a room with the windows up. The note you trust when nothing else is sure.",
    emotional: ['bright', 'warm', 'resolved'] },
  { id: 'min',      text: "The shadow of major — inward, honest, a little room for the truth to breathe.",
    emotional: ['melancholy', 'soulful'] },
  { id: 'sus2',     text: "Floating, ambiguous, unwritten — the modern worship chord, hovering before it commits.",
    emotional: ['dreamy', 'contemplative'], genre: ['worship'] },
  { id: 'sus4',     text: "Suspended tension that wants to fall — gospel's breath before the resolution, the hand raised.",
    emotional: ['hopeful', 'reverent'], genre: ['gospel'] },
  { id: 'dim',      text: "Tense, symmetrical, unsettling — the vii° chord, standing at the edge, unwilling to land.",
    emotional: ['tense', 'dark', 'mysterious'] },
  { id: 'aug',      text: "Whole-tone dream — mysterious, floating, nowhere to rest. The chord that drifts between rooms.",
    emotional: ['dreamy', 'mysterious'] },
  { id: 'maj7',     text: "Morning light through a window — lush, suspended, sophisticated. Neo-soul's I and IV, warm with longing.",
    emotional: ['warm', 'dreamy', 'soulful'], genre: ['neo-soul', 'jazz'] },
  { id: 'min7',     text: "Melancholic but at peace — a sigh that accepts what is. R&B's foundation, the smooth chord of the genre.",
    emotional: ['melancholy', 'soulful', 'resolved'], genre: ['r&b', 'soul'] },
  { id: 'dom7',     text: "Unsettled, bluesy, wanting home — the pull toward the I, the V7 workhorse of gospel and blues.",
    emotional: ['tense', 'soulful'], genre: ['gospel', 'blues'] },
  { id: 'dim7',     text: "Four stacked minor 3rds — fully diminished, completely symmetrical, chaos held perfectly still.",
    emotional: ['tense', 'dark', 'mysterious'] },
  { id: 'm7b5',     text: "Minor with its 5th bent flat — the ii of a minor 2-5-1, darker than m7, half-step away from grief.",
    emotional: ['melancholy', 'mysterious'], genre: ['jazz'] },
  { id: 'minMaj7',  text: "The James Bond chord — minor with a raised 7, mysterious and cinematic. Jazz noir, trench coats, late rooms.",
    emotional: ['mysterious', 'dark', 'contemplative'], genre: ['jazz'] },
  { id: 'dom7sus4', text: "The gospel sus — stepping stone before V-I, that breath the church holds before the Amen.",
    emotional: ['hopeful', 'reverent'], genre: ['gospel'] },
  { id: 'dom7b9',   text: "Dark tension dominant — a diminished shadow hiding in the V chord. Essential in gospel resolutions.",
    emotional: ['tense', 'dark', 'soulful'], genre: ['gospel', 'jazz'] },
  { id: 'dom7#9',   text: "The Hendrix chord — major and minor 3rds colliding. Funk, blues, gritty R&B; the chord that's both at once.",
    emotional: ['funky', 'soulful', 'stormy'], genre: ['funk', 'blues', 'r&b'] },
  { id: 'dom7#9#5', text: "Altered dominant — dark, pulling to minor 9, the chord that lights the path into the shadow.",
    emotional: ['dark', 'tense', 'soulful'], genre: ['jazz'] },
  { id: 'dom9_13',  text: "Bright tension dominant — the AB voicing, Stevie's signature, the chord that sparkles before it moves.",
    emotional: ['bright', 'soulful'], genre: ['r&b', 'gospel'] },
  { id: 'dom13',    text: "The full funk voicing — rich, warm, soulful. Every D'Angelo tune has this chord somewhere.",
    emotional: ['funky', 'warm', 'soulful'], genre: ['neo-soul', 'funk'] },
  { id: 'maj9',     text: "Expansive, lush — the neo-soul ballad color. Space and light in a single chord.",
    emotional: ['dreamy', 'warm'], genre: ['neo-soul', 'jazz'] },
  { id: 'maj13',    text: "The full neo-soul chord — every Robert Glasper tune lives here. Warm, complete, expansive.",
    emotional: ['warm', 'dreamy', 'soulful'], genre: ['neo-soul', 'jazz'] },
  { id: 'maj9_13',  text: "The AB voicing major — often shaped as a Maj7b5. A jazz I chord with shimmer around its edges.",
    emotional: ['dreamy', 'soulful'], genre: ['jazz'] },
  { id: 'maj6',     text: "Warm and complete without the leading-tone tension — bossa nova warmth, gospel sweetness.",
    emotional: ['warm', 'tender'], genre: ['gospel'] },
  { id: 'maj6_9',   text: "The fullest major color — 6 and 9 together. Gospel's and jazz's sweetest voicing, everything included.",
    emotional: ['warm', 'bright', 'soulful'], genre: ['gospel', 'jazz'] },
  { id: 'add9',     text: "Major triad with a 9th added, no 7th — bright, airy, modern pop and worship. Light that doesn't need tension.",
    emotional: ['bright', 'hopeful'], genre: ['pop', 'worship'] },
  { id: 'add2',     text: "Major with a 2 folded in — cluster-like, rich, the chord that sits close together and warms its own corner.",
    emotional: ['warm', 'contemplative'] },
  { id: 'min9',     text: "Deep, soulful, aching — the R&B slow-jam chord, the room when the lights are low.",
    emotional: ['soulful', 'melancholy', 'warm'], genre: ['r&b', 'soul'] },
  { id: 'min11',    text: "The floating neo-soul chord — Badu, D'Angelo, Dilla territory. Suspended longing, the groove that breathes.",
    emotional: ['dreamy', 'soulful'], genre: ['neo-soul', 'r&b'] },
  { id: 'min9_11',  text: "Polychord minor — b7 major over the minor. Works on any non-3 minor chord. Wide, open, R&B sophistication.",
    emotional: ['soulful', 'dreamy'], genre: ['r&b'] },
  { id: 'min6',     text: "Bittersweet, cinematic — Latin and jazz color. The chord that holds shadow and light at the same time.",
    emotional: ['melancholy', 'warm'], genre: ['jazz'] },
  { id: 'min6_9',   text: "AB voicing minor — rich minor color, the chord that lets a tonic minor feel arrived instead of sad.",
    emotional: ['warm', 'soulful'], genre: ['r&b', 'jazz'] },
];

// --- Modes (9 entries) ---------------------------------------------

interface ModeLine { id: string; text: string; emotional: string[]; genre?: string[]; }

const MODES: ModeLine[] = [
  { id: 'ionian',
    text: "Major's full light — the mode most ears call 'home.' Sunday morning, the first verse, the story before its complication.",
    emotional: ['bright', 'hopeful', 'warm'], genre: ['gospel'] },
  { id: 'dorian',
    text: "Minor with a glimmer of hope — the uplift inside the sadness. So much soul and R&B lives here. The major 6 is the grace.",
    emotional: ['soulful', 'contemplative'], genre: ['soul', 'r&b', 'jazz'] },
  { id: 'phrygian',
    text: "Spanish flamenco heat, ancient, dramatic — the b2 is a flame at the doorway. Minor with a darker edge than Aeolian.",
    emotional: ['stormy', 'mysterious', 'dark'] },
  { id: 'lydian',
    text: "Ethereal wonder, floating — the #4 is the feeling of looking up at clouds. Film scores, daydreams, church ceilings.",
    emotional: ['dreamy', 'bright', 'hopeful'] },
  { id: 'mixolydian',
    text: "Major with a flat 7 — the rock and gospel dominant. Funky, laid-back, the mode that never resolves but never needs to.",
    emotional: ['funky', 'soulful', 'warm'], genre: ['gospel', 'funk', 'r&b'] },
  { id: 'aeolian',
    text: "Natural minor — the weight of the walking bass, the sad song that's also a march. Melancholy with its feet on the ground.",
    emotional: ['melancholy', 'contemplative'] },
  { id: 'locrian',
    text: "The rarely-used one — minor with a flat 5. Unstable, more atmosphere than home. The mood of dread's arrival.",
    emotional: ['dark', 'tense', 'mysterious'] },
  { id: 'harmonic-minor',
    text: "Minor with a raised 7 — exotic, dramatic, the Spanish and Eastern European mode. The leading tone adds urgency the Aeolian lacks.",
    emotional: ['stormy', 'mysterious', 'longing'] },
  { id: 'melodic-minor',
    text: "Ascending jazz minor, descending natural — the mode of post-bop sophistication. Both faces of the same lineage.",
    emotional: ['contemplative', 'dreamy'], genre: ['jazz'] },
];

// --- Progressions (20 entries) ------------------------------------
// Subset of PROGRESSIONS picked for emotional-territory clarity.

interface ProgressionLine { id: string; text: string; emotional: string[]; genre?: string[]; }

const PROGRESSIONS: ProgressionLine[] = [
  { id: '1-4-5',       text: "The 1-4-5: blues, rock, gospel, and country all live here. The architecture of Western popular music.",
    emotional: ['triumphant', 'warm'], genre: ['gospel', 'blues'] },
  { id: '1-5-6-4',     text: "Uplifting, anthemic — the pop chorus progression. Countless hits live here; the world's most-recognised chord cycle.",
    emotional: ['hopeful', 'triumphant'], genre: ['pop'] },
  { id: '1-6-4-5',     text: "The 50s doo-wop progression — innocent, earnest, slow-dance at the sock hop. Heart on sleeve.",
    emotional: ['tender', 'warm'] },
  { id: '6-4-1-5',     text: "The same four chords starting from minor — pensive, cinematic, the ballad's favourite cycle.",
    emotional: ['melancholy', 'hopeful'] },
  { id: '1-6-2-5',     text: "The turnaround — round the corner and back home. The jazz and gospel exit ramp.",
    emotional: ['resolved', 'soulful'], genre: ['gospel', 'jazz'] },
  { id: '2-5-1',       text: "The classic resolution — the feeling of arriving home. The sentence every jazz player learns first.",
    emotional: ['resolved'], genre: ['jazz'] },
  { id: '12-bar-blues',text: "12 bars of truth — the blues form that carries grief, swagger, and grit in equal measure. The lineage's bedrock.",
    emotional: ['soulful', 'stormy'], genre: ['blues'] },
  { id: '1-4-vamp',    text: "Plagal rocking — two chords forever. The gospel vamp that lets the singer preach.",
    emotional: ['reverent', 'soulful'], genre: ['gospel'] },
  { id: 'gospel-walk-up',
    text: "The stepwise climb up to the IV — that signature gospel lift. Like rising to your feet in the middle of the verse.",
    emotional: ['triumphant', 'reverent'], genre: ['gospel'] },
  { id: 'gospel-walk-down',
    text: "The stepwise descent — the hymn coming to rest, the congregation settling back into the pew.",
    emotional: ['reverent', 'resolved'], genre: ['gospel'] },
  { id: 'backdoor',    text: "The backdoor cadence — bVII to I, the funky side-entry resolution. Sneaky, soulful, satisfying.",
    emotional: ['funky', 'soulful'], genre: ['funk', 'gospel'] },
  { id: '6-2-5-1',     text: "The extended turnaround — adds the vi, giving the cycle more room to breathe. Ballad-length resolution.",
    emotional: ['contemplative', 'resolved'], genre: ['jazz'] },
  { id: '4-5-3-6',     text: "The circle motion in the middle of a song — descending fifths dressed up for church. Arrival with a detour.",
    emotional: ['soulful', 'contemplative'], genre: ['gospel'] },
  { id: '1-3-4',       text: "The major-third lift — I to iii to IV, a voicing that rises through the mediant before arriving.",
    emotional: ['hopeful', 'bright'] },
  { id: 'plagal-vamp', text: "IV to I forever — the Amen cadence looped. Worship-tune simplicity; the chord change as prayer.",
    emotional: ['reverent', 'resolved'], genre: ['worship', 'gospel'] },
  { id: '6-4-5',       text: "Minor tonic to subdominant to dominant — the pop-ballad opener that sets the key before settling.",
    emotional: ['melancholy', 'hopeful'] },
  { id: 'mariah-rnb-turnaround',
    text: "The Mariah R&B turnaround — rich chromatic movement inside the turnaround. 90s R&B sophistication.",
    emotional: ['soulful', 'dreamy'], genre: ['r&b'] },
  { id: '4-1-5-6',     text: "Starting on IV — the uplifted opening, the chorus that enters mid-arc. Common in modern worship.",
    emotional: ['hopeful', 'triumphant'], genre: ['worship'] },
  { id: '1-b7-4',      text: "Mixolydian vamp — the funky non-resolution, two neighbouring chords holding the groove.",
    emotional: ['funky', 'warm'], genre: ['funk', 'r&b'] },
  { id: 'descending-bass',
    text: "Bass walks down while chords shift on top — the most universal ballad tool in gospel, soul, and standards.",
    emotional: ['melancholy', 'soulful'], genre: ['gospel', 'soul'] },
  { id: 'pj-morton-turnaround',
    text: "PJ Morton's turnaround — neo-soul chromaticism dressed in gospel harmony. A signature of modern black church music.",
    emotional: ['soulful', 'contemplative'], genre: ['gospel', 'neo-soul'] },
];

// --- Chord motions (12 entries) -----------------------------------
// Concept-level entries: don't map to an existing module skill, so
// each carries its own displayName so the diary can render it fully
// even before the registry knows what a "chord motion" is.

interface MotionLine { id: string; displayName: string; text: string; emotional: string[]; genre?: string[]; }

const MOTIONS: MotionLine[] = [
  { id: '1-to-5-asc',  displayName: "1 → 5 ascending",
    text: "Confident rise, stepping into power — the opening leap, the dominant announcing itself.",
    emotional: ['triumphant', 'bright'] },
  { id: '5-to-1-desc', displayName: "5 → 1 descending",
    text: "Homecoming, the weight of resolution — the most classical of all chord moves, tension settling down to the root.",
    emotional: ['resolved', 'warm'] },
  { id: '1-to-4-asc',  displayName: "1 → 4 ascending",
    text: "The plagal lift — the Amen impulse, the move that blesses rather than resolves.",
    emotional: ['reverent', 'warm'], genre: ['gospel'] },
  { id: '4-to-1-desc', displayName: "4 → 1 descending",
    text: "The Amen cadence — landing softly into the tonic. The hymn's breath after the last phrase.",
    emotional: ['reverent', 'resolved'], genre: ['gospel'] },
  { id: '1-to-6m-desc',displayName: "1 → vi descending",
    text: "Tonic relaxing into its relative minor — the smooth slip from bright to pensive, same air, new shadow.",
    emotional: ['melancholy', 'soulful'] },
  { id: '6m-to-1-asc', displayName: "vi → 1 ascending",
    text: "Coming up from minor into major — emerging, lifting out. The sun returning without fanfare.",
    emotional: ['hopeful', 'warm'] },
  { id: '2-to-5-asc',  displayName: "ii → V ascending",
    text: "The half of the 2-5-1 that sets the table — the flight that hasn't landed, chord motion looking forward.",
    emotional: ['longing', 'tense'], genre: ['jazz'] },
  { id: '5-to-6m-deceptive', displayName: "V → vi (deceptive)",
    text: "The deceptive cadence — promised home, delivered shadow. The resolution that chose the minor door.",
    emotional: ['melancholy', 'mysterious'] },
  { id: '4-to-5-asc',  displayName: "IV → V ascending",
    text: "The pre-chorus lift — subdominant to dominant, the step that builds pressure for the chorus arrival.",
    emotional: ['hopeful', 'tense'], genre: ['pop'] },
  { id: '6m-to-4-desc',displayName: "vi → IV descending",
    text: "Release, letting go, the sigh — minor sliding down to subdominant, giving up the weight.",
    emotional: ['melancholy', 'tender'] },
  { id: 'b7-to-1-asc', displayName: "bVII → 1 ascending",
    text: "The modal return — Mixolydian's way home. No leading tone, just the whole-step push back to tonic.",
    emotional: ['funky', 'warm'], genre: ['funk', 'gospel'] },
  { id: 'b6-to-b7-asc', displayName: "bVI → bVII ascending",
    text: "The rock climb — two non-diatonic chords stacking upward, the anthem's uplift before the cymbal crash.",
    emotional: ['triumphant', 'stormy'] },
];

// ------------------------------------------------------------------
// Assemble into StarterSeed records.
// ------------------------------------------------------------------

export function allStarters(): StarterSeed[] {
  const out: StarterSeed[] = [];

  for (const i of INTERVALS) {
    out.push({
      skillId: canonicalSkillId('intervals', 'asc', i.id),
      text: `${i.name} ascending: ${i.asc}`,
      emotional: i.ascTags,
      genre: i.genre,
      displayName: `${i.name} (ascending)`,
      displayModule: 'intervals',
    });
    out.push({
      skillId: canonicalSkillId('intervals', 'desc', i.id),
      text: `${i.name} descending: ${i.desc}`,
      emotional: i.descTags,
      genre: i.genre,
      displayName: `${i.name} (descending)`,
      displayModule: 'intervals',
    });
  }

  for (const q of QUALITIES) {
    out.push({
      skillId: canonicalSkillId('chord-recognition', 'item', q.id),
      text: q.text,
      emotional: q.emotional,
      genre: q.genre,
    });
  }

  for (const m of MODES) {
    out.push({
      skillId: canonicalSkillId('scales-modes', 'mode', m.id),
      text: m.text,
      emotional: m.emotional,
      genre: m.genre,
    });
  }

  for (const p of PROGRESSIONS) {
    out.push({
      skillId: canonicalSkillId('chord-progressions', 'item', p.id),
      text: p.text,
      emotional: p.emotional,
      genre: p.genre,
    });
  }

  for (const mo of MOTIONS) {
    out.push({
      skillId: canonicalSkillId('chord-progressions', 'motion', mo.id),
      text: mo.text,
      emotional: mo.emotional,
      genre: mo.genre,
      displayName: mo.displayName,
      displayModule: 'chord progressions',
    });
  }

  return out;
}

/**
 * Build a HarmonicDiaryEntry from a StarterSeed. `userText` is empty
 * so the UI shows the starter copy + "tap to customise" affordance;
 * `claudeStarterText` carries the real content.
 */
export function starterToEntry(starter: StarterSeed, now: number): Omit<HarmonicDiaryEntry, 'entryId'> {
  return {
    skillId: starter.skillId,
    userText: '',
    claudeStarterText: starter.text,
    isStarterEdited: false,
    emotionalTags: starter.emotional,
    genreTags: starter.genre ?? [],
    createdAt: now,
    lastEdited: now,
  };
}
