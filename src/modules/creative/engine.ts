import { db, type SongPracticeLog } from '../../lib/db';

// Time window for "recent" activity. Two weeks is short enough that
// prompts feel personal ("you drilled X this week") and long enough
// that a few days off doesn't empty the prompt pool.
const RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type CreativeMode = 'play' | 'produce';

export interface CreativePrompt {
  /** Stable id for the prompt template that produced this text. Used
   *  to learn (later) which kinds of prompts resonate. */
  kind: string;
  text: string;
}

/**
 * Emotion vocabulary we look for inside user-written associations.
 * Picked to overlap with the way musicians talk about feel: loose
 * synonyms under a single canonical tag so multiple spellings
 * collapse onto the same bucket for prompt composition.
 */
const EMOTION_TAGS: Array<{ tag: string; terms: string[] }> = [
  { tag: 'melancholy', terms: ['melancholy', 'melancholic', 'sad', 'longing', 'yearning', 'wistful', 'forlorn', 'pensive'] },
  { tag: 'dark',       terms: ['dark', 'ominous', 'foreboding', 'sinister', 'brooding', 'gritty', 'stormy'] },
  { tag: 'bright',     terms: ['bright', 'sunny', 'cheerful', 'happy', 'uplifting', 'joyful', 'light'] },
  { tag: 'warm',       terms: ['warm', 'cozy', 'comforting', 'tender', 'intimate'] },
  { tag: 'dreamy',     terms: ['dreamy', 'floaty', 'ethereal', 'hazy', 'lush'] },
  { tag: 'tense',      terms: ['tense', 'anxious', 'urgent', 'edgy', 'restless'] },
  { tag: 'hopeful',    terms: ['hopeful', 'optimistic', 'resolving', 'arriving'] },
  { tag: 'mysterious', terms: ['mysterious', 'curious', 'searching', 'questioning', 'unresolved'] },
  { tag: 'soulful',    terms: ['soulful', 'soul', 'church', 'gospel', 'sanctified'] },
  { tag: 'funky',      terms: ['funky', 'funk', 'pocket', 'greasy', 'sassy'] },
  { tag: 'triumphant', terms: ['triumphant', 'epic', 'heroic', 'climactic', 'anthemic'] },
];

function pickRandom<T>(items: readonly T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function extractEmotionTags(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const tags: string[] = [];
  for (const { tag, terms } of EMOTION_TAGS) {
    if (terms.some(t => lower.includes(t))) tags.push(tag);
  }
  return tags;
}

// --- Snapshot gathering ---------------------------------------------

interface DrillSnapshot {
  /** Display label for the skill (e.g. "Cmaj7 (major seventh)") */
  label: string;
  /** Intentionally excludes 'mental-viz' — see `gatherCreativeSnapshot`
   *  for why. */
  kind: 'chord-shape' | 'scale' | 'voice-leading';
  /** Total seconds drilled in the recent window. */
  recentSeconds: number;
  /** Root key the drill was pinned to (if any). Voice-leading and
   *  chord-shape drills always carry a key; scale drills do too. */
  keyName?: string;
}

interface AssociationSnapshot {
  /** What the association is about ("Dorian mode", "1-5-6-4 progression",
   *  "minor 3rd ascending"). */
  subject: string;
  /** User's written description. */
  text: string;
  /** Emotion tags extracted from the text. */
  emotions: string[];
}

interface SongSnapshot {
  title: string;
  artist: string;
  stage?: string;
  genre?: string;
  key?: string;
  tempo?: number;
  lastPracticed: number;
}

export interface CreativeSnapshot {
  recentDrills: DrillSnapshot[];
  recentSongs: SongSnapshot[];
  associations: AssociationSnapshot[];
  /** Unique genres pulled from the user's repertoire. */
  genres: string[];
  /** Flat list of emotion tags found across all associations — lets
   *  a template ask "pick something melancholy-tagged" directly. */
  emotionIndex: Map<string, AssociationSnapshot[]>;
  /** How many unique days in the past 7 had any tracked practice
   *  (attempts, drill sessions, or song practice). Used by the
   *  consistency-themed prompts. */
  recentPracticeDays: number;
}

/**
 * Gather a snapshot of the user's recent activity for prompt
 * composition. Everything is read-only; if a data source is empty
 * the corresponding slice returns empty and templates fall back to
 * generic prompts.
 */
export async function gatherCreativeSnapshot(): Promise<CreativeSnapshot> {
  const since = Date.now() - RECENT_WINDOW_MS;

  // ----- Drills (past 14 days, grouped by skill) -----
  // Mental-visualisation drills are cognitive reps (picturing shapes
  // on a keyboard with no instrument in front of you) — the opposite
  // mode of engagement from creative play. Filtering them out up
  // front keeps prompt templates from accidentally turning a
  // cognitive drill into "try creating something with C major in
  // 1st inversion", which doesn't land as a creative suggestion.
  const recentDrillSessions = await db.drillSessions
    .where('timestamp').above(since)
    .toArray();
  const drillSecondsBySkill = new Map<string, number>();
  for (const s of recentDrillSessions) {
    drillSecondsBySkill.set(s.skillId, (drillSecondsBySkill.get(s.skillId) ?? 0) + s.durationSeconds);
  }
  const recentDrills: DrillSnapshot[] = [];
  if (drillSecondsBySkill.size > 0) {
    const skills = await db.drillSkills.bulkGet([...drillSecondsBySkill.keys()]);
    for (const skill of skills) {
      if (!skill) continue;
      if (skill.kind === 'mental-viz') continue;
      recentDrills.push({
        label: skill.label ?? 'a drill',
        kind: skill.kind,
        recentSeconds: drillSecondsBySkill.get(skill.id) ?? 0,
        keyName: skill.keyName,
      });
    }
    recentDrills.sort((a, b) => b.recentSeconds - a.recentSeconds);
  }

  // ----- Songs (recent practice, joined to metadata) -----
  const recentLogs = await db.songPracticeLog
    .where('timestamp').above(since)
    .toArray();
  const latestBySong = new Map<string, SongPracticeLog>();
  for (const log of recentLogs) {
    const cur = latestBySong.get(log.songId);
    if (!cur || log.timestamp > cur.timestamp) latestBySong.set(log.songId, log);
  }
  const songs = latestBySong.size > 0
    ? await db.songs.bulkGet([...latestBySong.keys()])
    : [];
  const recentSongs: SongSnapshot[] = [];
  for (const song of songs) {
    if (!song) continue;
    const log = latestBySong.get(song.id);
    recentSongs.push({
      title: song.title,
      artist: song.artist,
      stage: song.stage,
      genre: song.genre,
      key: song.key,
      tempo: song.tempo,
      lastPracticed: log?.timestamp ?? 0,
    });
  }
  recentSongs.sort((a, b) => b.lastPracticed - a.lastPracticed);

  // ----- Associations (across all three tables) -----
  const [progAssocs, modeAssocs, intervalDescs] = await Promise.all([
    db.progressionAssociations.toArray(),
    db.modeAssociations.toArray(),
    db.intervalDescriptions.toArray(),
  ]);
  const progressionName = buildProgressionNameMap();
  const modeName = buildModeNameMap();
  const associations: AssociationSnapshot[] = [];
  for (const a of progAssocs) {
    if (!a.text?.trim()) continue;
    associations.push({
      subject: `${progressionName(a.progressionId)} progression`,
      text: a.text,
      emotions: extractEmotionTags(a.text),
    });
  }
  for (const a of modeAssocs) {
    if (!a.text?.trim()) continue;
    associations.push({
      subject: `${modeName(a.modeId)} mode`,
      text: a.text,
      emotions: extractEmotionTags(a.text),
    });
  }
  for (const a of intervalDescs) {
    if (!a.text?.trim()) continue;
    associations.push({
      subject: formatIntervalKey(a.intervalKey),
      text: a.text,
      emotions: extractEmotionTags(a.text),
    });
  }

  // Emotion index — tag → associations carrying that tag.
  const emotionIndex = new Map<string, AssociationSnapshot[]>();
  for (const a of associations) {
    for (const tag of a.emotions) {
      const bucket = emotionIndex.get(tag) ?? [];
      bucket.push(a);
      emotionIndex.set(tag, bucket);
    }
  }

  // ----- Genres across repertoire -----
  const allSongs = await db.songs.toArray();
  const genres = uniq(
    allSongs
      .map(s => (s.genre ?? '').trim().toLowerCase())
      .filter(g => g.length > 0),
  );

  // ----- Practice-day count in past 7 days -----
  const last7 = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const [attemptsRecent, drillsRecent, songsRecent] = await Promise.all([
    db.attempts.where('timestamp').above(last7).toArray(),
    db.drillSessions.where('timestamp').above(last7).toArray(),
    db.songPracticeLog.where('timestamp').above(last7).toArray(),
  ]);
  const dayKeys = new Set<string>();
  for (const a of attemptsRecent) dayKeys.add(dayKeyOf(a.timestamp));
  for (const d of drillsRecent) dayKeys.add(dayKeyOf(d.timestamp));
  for (const s of songsRecent) dayKeys.add(dayKeyOf(s.timestamp));

  return {
    recentDrills,
    recentSongs,
    associations,
    genres,
    emotionIndex,
    recentPracticeDays: dayKeys.size,
  };
}

function dayKeyOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Progression and mode IDs carry most of their display information in
// themselves — "1-5-6-4" / "dorian" — so we don't need to lazy-load
// the catalog. Format them so prompts read naturally.
function buildProgressionNameMap(): (id: string) => string {
  return (id: string) => {
    if (id.includes('walk-up')) return 'gospel walk-up';
    if (id.includes('walk-down')) return 'gospel walk-down';
    if (id.includes('backdoor')) return 'backdoor';
    if (id.includes('blues')) return '12-bar blues';
    if (id.includes('turnaround')) return id.replace(/-/g, ' ').replace('turnaround', 'turnaround');
    // Numeric progressions: "1-5-6-4" / "6-2-5-1" etc. — render with an
    // arrow to feel like a progression, not a phone number.
    if (/^[\d-]+$/.test(id)) return id.replace(/-/g, '–');
    return id.replace(/-/g, ' ');
  };
}

function buildModeNameMap(): (id: string) => string {
  return (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
}

function formatIntervalKey(key: string): string {
  // Examples in the wild: "minor-3rd-ascending", "perfect-5th-descending"
  return key.replace(/-/g, ' ');
}

// --- Prompt templates -----------------------------------------------

type Template = (snap: CreativeSnapshot) => CreativePrompt | null;

// All 12 pitch classes the rest of the app uses, in order. Lets us
// suggest a "new key" the user hasn't drilled recently without
// pulling from some catalog — good enough for prompt purposes.
const ALL_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Pick a key the user hasn't drilled in their recent set — gives
 *  prompts a "try this somewhere new" edge. Falls back to a rotating
 *  default when the user has covered everything. */
function suggestNewKey(drilledKeys: string[]): string {
  const covered = new Set(drilledKeys);
  const fresh = ALL_KEYS.filter(k => !covered.has(k));
  return pickRandom(fresh) ?? pickRandom(ALL_KEYS) ?? 'A minor';
}

/** Format a list of keys as human prose: "C", "C and F", "C, F, and Bb". */
function humanKeyList(keys: string[]): string {
  if (keys.length === 0) return '';
  if (keys.length === 1) return keys[0];
  if (keys.length === 2) return `${keys[0]} and ${keys[1]}`;
  return `${keys.slice(0, -1).join(', ')}, and ${keys[keys.length - 1]}`;
}

/** Split a voice-leading or scale drill label of the form
 *  "<pattern> in <key>" into its two parts. Returns null when the
 *  label doesn't match. */
function splitLabelInKey(label: string): { pattern: string; key: string } | null {
  const m = label.match(/^(.+?)\s+in\s+(\S+)$/i);
  if (!m) return null;
  return { pattern: m[1].trim(), key: m[2].trim() };
}

/** Group same-pattern drills across keys so templates can say "in C
 *  and F" instead of a single key per prompt. */
function groupByPattern(drills: DrillSnapshot[]): Array<{ pattern: string; keys: string[]; seconds: number }> {
  const buckets = new Map<string, { keys: Set<string>; seconds: number }>();
  for (const d of drills) {
    const parts = splitLabelInKey(d.label);
    if (!parts) continue;
    const bucket = buckets.get(parts.pattern) ?? { keys: new Set<string>(), seconds: 0 };
    bucket.keys.add(parts.key);
    bucket.seconds += d.recentSeconds;
    buckets.set(parts.pattern, bucket);
  }
  return [...buckets.entries()].map(([pattern, b]) => ({
    pattern,
    keys: [...b.keys].sort(),
    seconds: b.seconds,
  }));
}

const PLAY_TEMPLATES: Template[] = [
  // Voice-leading → improvise in a new key
  snap => {
    const vlDrills = snap.recentDrills.filter(d => d.kind === 'voice-leading' && d.recentSeconds >= 60);
    const groups = groupByPattern(vlDrills);
    const group = pickRandom(groups);
    if (!group) return null;
    const newKey = suggestNewKey(group.keys);
    const vibe = pickRandom(['soul ballad', 'quiet-storm intro', 'gospel interlude', 'neo-soul loop']);
    return {
      kind: 'recent-voice-leading',
      text: `You've been drilling the ${group.pattern.toLowerCase()} in ${humanKeyList(group.keys)} this week. Try improvising a ${vibe} over it in a new key like ${newKey} — see what the voice-leading feels like there.`,
    };
  },

  // Scale drill → mode-feel improvisation
  snap => {
    const scaleDrills = snap.recentDrills.filter(d => d.kind === 'scale' && d.recentSeconds >= 60);
    const groups = groupByPattern(scaleDrills);
    const group = pickRandom(groups);
    if (!group) return null;
    const key = pickRandom(group.keys) ?? group.keys[0];
    const styleHint = /minor/i.test(group.pattern)
      ? 'a moody, suspended feel'
      : 'a bright, airy phrase';
    return {
      kind: 'recent-scale',
      text: `You practiced the ${group.pattern.toLowerCase()} in ${humanKeyList(group.keys)}. Improvise in ${key} for five minutes — aim for ${styleHint}. Record the one phrase you want to keep.`,
    };
  },

  // Chord-shape → build a loop that features it
  snap => {
    const chordDrills = snap.recentDrills.filter(d => d.kind === 'chord-shape' && d.recentSeconds >= 60);
    const drill = pickRandom(chordDrills);
    if (!drill) return null;
    // Parse "Cmaj7 (major seventh)" → "Cmaj7"
    const short = drill.label.replace(/\s*\(.+\)\s*$/, '');
    const feel = pickRandom(['warm R&B', 'jazzy gospel', 'dreamy neo-soul', 'dusty hip-hop']);
    return {
      kind: 'recent-chord-shape',
      text: `${short} has been in your hands this week. Build an 8-bar ${feel} loop that features it — two bars sitting on it, then move somewhere unexpected. See what resolves it best.`,
    };
  },

  // Recent song → improvise in its key and feel
  snap => {
    const song = pickRandom(snap.recentSongs.slice(0, 5));
    if (!song) return null;
    const keyBit = song.key ? ` in ${song.key}` : '';
    // "Sitting with" gates on stages where the user has gone past
    // initial play-through into deeper engagement. Cross-key joins
    // this set under the April 25 reorder where it sits between
    // comfortable and internalized — a cross-key song has been
    // sat with as much as a comfortable one. Internalized /
    // maintenance songs naturally still qualify.
    const stageBit = song.stage === 'comfortable' || song.stage === 'cross-key' || song.stage === 'internalized' || song.stage === 'maintenance'
      ? `You've been sitting with ${song.title}`
      : `You've been learning ${song.title}`;
    const genreBit = song.genre ? ` — ${song.genre}` : '';
    return {
      kind: 'recent-song-improv',
      text: `${stageBit} (${song.artist}${genreBit}). Improvise${keyBit} for ten minutes in that same emotional territory — what progression would you build if you wrote the follow-up song?`,
    };
  },

  // Song momentum → write your own in its world
  snap => {
    const internalized = snap.recentSongs.find(s => s.stage === 'internalized' || s.stage === 'maintenance');
    if (!internalized) return null;
    const keyBit = internalized.key ? ` in ${internalized.key}` : '';
    return {
      kind: 'song-momentum',
      text: `${internalized.title} is deep in you now. Write something of your own${keyBit} that lives in its world — borrow the feel, not the chords. Your turn to say the thing.`,
    };
  },

  // Emotion tag → mode-driven improv
  snap => {
    // Prefer mode associations when an emotion has them (most
    // creative traction), else fall back to progression.
    const tags = [...snap.emotionIndex.keys()];
    const tag = pickRandom(tags);
    if (!tag) return null;
    const assocs = snap.emotionIndex.get(tag) ?? [];
    const modeAssoc = assocs.find(a => /mode$/.test(a.subject));
    const progAssoc = assocs.find(a => /progression/.test(a.subject));
    const assoc = modeAssoc ?? progAssoc ?? pickRandom(assocs);
    if (!assoc) return null;
    if (/mode$/.test(assoc.subject)) {
      const name = assoc.subject.replace(' mode', '');
      return {
        kind: 'emotion-mode',
        text: `Create something ${tag}. Your diary tags ${name} as ${tag} — improvise in it for a few minutes, then build a short piece around the phrase that feels most true.`,
      };
    }
    return {
      kind: 'emotion-progression',
      text: `Create something ${tag}. Your notes tag the ${assoc.subject} as ${tag} — loop that progression and improvise over it.`,
    };
  },

  // Progression association → build around it, no modifier
  snap => {
    const progAssocs = snap.associations.filter(a => /progression/.test(a.subject));
    const a = pickRandom(progAssocs);
    if (!a) return null;
    const mood = a.emotions[0];
    const moodBit = mood ? ` You wrote that it feels ${mood}.` : '';
    return {
      kind: 'progression-association',
      text: `The ${a.subject} is sitting in your head.${moodBit} Loop it slowly and build a short piece around it — one phrase can be the whole song.`,
    };
  },

  // Mode exploration from diary
  snap => {
    const modeAssocs = snap.associations.filter(a => /mode$/.test(a.subject));
    const a = pickRandom(modeAssocs);
    if (!a) return null;
    const mood = a.emotions[0];
    const feelBit = mood ? ` ${mood}` : '';
    return {
      kind: 'mode-exploration',
      text: `Improvise in ${a.subject.replace(' mode', '')} for five minutes. You wrote about its${feelBit} quality — now let your hands say what you've been hearing.`,
    };
  },

  // Consistency reward — given only when they've earned it
  snap => {
    if (snap.recentPracticeDays < 4) return null;
    return {
      kind: 'streak-reward',
      text: `You've practised ${snap.recentPracticeDays} of the last 7 days. Take ten minutes off the curriculum — play purely for yourself. See what the work unlocks.`,
    };
  },

  // No prompt — always available
  () => ({
    kind: 'freeform',
    text: `No prompt today. Just play what your hands want to say. Listen for the phrase that surprises you — that one's worth chasing.`,
  }),
];

const PRODUCE_TEMPLATES: Template[] = [
  // Genre + bpm vibe
  snap => {
    const genre = pickRandom(snap.genres);
    if (!genre) return null;
    const bpm = genreBpmHint(genre);
    const feel = /gospel|soul|r&?b|neo-?soul/.test(genre)
      ? 'that laid-back, behind-the-beat feel'
      : /hip-?hop|trap/.test(genre)
        ? 'a dusty sample-loop foundation'
        : 'that same energy';
    return {
      kind: 'genre-beat',
      text: `You've been learning ${genre} songs. Try making a beat with ${feel}${bpm ? ` around ${bpm} BPM` : ''}. Skeleton sketch, no pressure to finish.`,
    };
  },

  // Record a progression you drilled (voice-leading or chord-shape only)
  snap => {
    const drill = pickRandom(snap.recentDrills.filter(d => d.kind === 'voice-leading' || d.kind === 'chord-shape'));
    if (!drill) return null;
    const short = drill.label.replace(/\s*\(.+\)\s*$/, '');
    return {
      kind: 'record-drill',
      text: `Want to record the ${short} you've been drilling? Loop it in Logic, try two different drum feels (straight ahead vs. half-time) and see which one the chord wants.`,
    };
  },

  // Sample-style beat tied to genre
  snap => {
    const genre = pickRandom(snap.genres);
    if (!genre) return null;
    return {
      kind: 'sample-beat',
      text: `Make a chopped-sample ${genre}-style beat. Pick a record you love, find one bar worth obsessing over, build the drums around it. Keep it short and done.`,
    };
  },

  // Recreate a recent song's feel
  snap => {
    const song = pickRandom(snap.recentSongs.slice(0, 5));
    if (!song) return null;
    const tempoBit = song.tempo ? ` at around ${song.tempo} BPM` : '';
    const genreBit = song.genre ? ` (${song.genre} territory)` : '';
    return {
      kind: 'song-feel',
      text: `Dial up the feel of ${song.title} by ${song.artist}${genreBit}${tempoBit}. Drums, bass, one pad — ten minutes of groove, nothing polished.`,
    };
  },

  // Emotion-driven production
  snap => {
    const tag = pickRandom([...snap.emotionIndex.keys()]);
    if (!tag) return null;
    return {
      kind: 'emotion-beat',
      text: `Produce something ${tag}. Start with whichever element sets the mood fastest — a pad, a vocal chop, a drum break — and let the rest follow.`,
    };
  },

  // Loop-maker from a chord-shape drill
  snap => {
    const drill = pickRandom(snap.recentDrills.filter(d => d.kind === 'chord-shape'));
    if (!drill) return null;
    const short = drill.label.replace(/\s*\(.+\)\s*$/, '');
    return {
      kind: 'loop-maker',
      text: `Build an 8-bar loop around ${short}. Kick, snare, bass, the chord — that's enough. Sit with it long enough to feel what wants to change next.`,
    };
  },

  // No prompt
  () => ({
    kind: 'freeform',
    text: `No prompt — just open the DAW and follow curiosity. Even twenty minutes of exploration counts.`,
  }),
];

// Rough BPM associations by genre keyword. Only rendered when the
// hint is plausibly useful; the "laid-back" language covers the
// rest without pinning the user to a number.
function genreBpmHint(genre: string): string | null {
  const g = genre.toLowerCase();
  if (/neo-?soul/.test(g)) return '82-90';
  if (/gospel/.test(g)) return '72-90';
  if (/r&?b|soul/.test(g)) return '78-95';
  if (/hip-?hop|trap/.test(g)) return '85-100';
  if (/jazz/.test(g)) return '100-140';
  if (/worship|hymn/.test(g)) return '68-82';
  return null;
}

// --- Public API -----------------------------------------------------

/**
 * Generate up to `count` distinct prompts for the given mode, using
 * the provided snapshot. Templates are shuffled; each template may
 * return null when it has no data to work with, so we keep drawing
 * until we hit the target or run out of distinct templates.
 */
export function generatePrompts(
  mode: CreativeMode,
  snap: CreativeSnapshot,
  count = 4,
): CreativePrompt[] {
  const pool = [...(mode === 'play' ? PLAY_TEMPLATES : PRODUCE_TEMPLATES)];
  // Fisher-Yates shuffle.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const prompts: CreativePrompt[] = [];
  const seenKinds = new Set<string>();
  for (const template of pool) {
    const p = template(snap);
    if (!p) continue;
    if (seenKinds.has(p.kind)) continue;
    seenKinds.add(p.kind);
    prompts.push(p);
    if (prompts.length >= count) break;
  }
  // Fallback — if literally no template produced a prompt (unlikely,
  // since "freeform" always returns), surface a generic one so the
  // user isn't staring at an empty modal.
  if (prompts.length === 0) {
    prompts.push({
      kind: 'freeform',
      text: mode === 'play'
        ? 'Play whatever your hands find for five minutes. Don\'t plan it.'
        : 'Open the DAW and noodle. Even ten minutes counts.',
    });
  }
  return prompts;
}

/**
 * One-shot convenience: gather snapshot + generate prompts in a
 * single call. Used by the header modal and dashboard card.
 */
export async function gatherPrompts(mode: CreativeMode, count = 4): Promise<CreativePrompt[]> {
  const snap = await gatherCreativeSnapshot();
  return generatePrompts(mode, snap, count);
}

// --- Aggregation helpers for the Dashboard creative card ------------

export interface CreativeStats {
  /** Seconds logged today (local). */
  todaySeconds: number;
  /** Seconds logged in the past 7 days. */
  weekSeconds: number;
  /** Seconds logged in the past 30 days. */
  monthSeconds: number;
  /** Timestamp of most recent session, or null. */
  lastSessionAt: number | null;
  /** Most recent session's mode, for the dashboard label. */
  lastSessionMode: CreativeMode | null;
  /** Count of sessions in the past 7 days. */
  weekSessions: number;
}

export async function aggregateCreativeStats(): Promise<CreativeStats> {
  const now = Date.now();
  const startOfToday = (() => {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  })();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  const recent = await db.creativeSessions
    .where('timestamp').above(monthAgo)
    .toArray();

  let todaySeconds = 0;
  let weekSeconds = 0;
  let monthSeconds = 0;
  let weekSessions = 0;
  let lastSessionAt: number | null = null;
  let lastSessionMode: CreativeMode | null = null;

  for (const s of recent) {
    monthSeconds += s.durationSeconds;
    if (s.timestamp >= weekAgo) {
      weekSeconds += s.durationSeconds;
      weekSessions += 1;
    }
    if (s.timestamp >= startOfToday) {
      todaySeconds += s.durationSeconds;
    }
    if (lastSessionAt === null || s.timestamp > lastSessionAt) {
      lastSessionAt = s.timestamp;
      lastSessionMode = s.mode;
    }
  }
  return { todaySeconds, weekSeconds, monthSeconds, lastSessionAt, lastSessionMode, weekSessions };
}

/** Minimum time (in seconds) for a creative session to count as a
 *  full block. Below this, sessions are flagged as quickExploration
 *  but still logged. */
export const MIN_CREATIVE_SECONDS = 120;

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}
