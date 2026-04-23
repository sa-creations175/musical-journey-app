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
  kind: 'chord-shape' | 'scale' | 'voice-leading' | 'mental-viz';
  /** Total seconds drilled in the recent window. */
  recentSeconds: number;
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
      recentDrills.push({
        label: skill.label ?? 'a drill',
        kind: skill.kind,
        recentSeconds: drillSecondsBySkill.get(skill.id) ?? 0,
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

const PLAY_TEMPLATES: Template[] = [
  // Recent drill → improv hook
  snap => {
    const drill = pickRandom(snap.recentDrills.filter(d => d.recentSeconds >= 60));
    if (!drill) return null;
    if (drill.kind === 'voice-leading') {
      return {
        kind: 'recent-voice-leading',
        text: `You drilled ${drill.label.toLowerCase()} this week. Improvise a soul-ballad intro using it as the backbone — no pressure to stay in the pattern, just let it steer the harmony.`,
      };
    }
    if (drill.kind === 'scale') {
      return {
        kind: 'recent-scale',
        text: `You've been working ${drill.label}. Noodle in that scale for five minutes — find one phrase you want to come back to.`,
      };
    }
    if (drill.kind === 'chord-shape') {
      return {
        kind: 'recent-chord-shape',
        text: `You practiced ${drill.label} recently. Build a loop that features it — maybe 2 bars on that chord, 2 bars resolving away.`,
      };
    }
    return {
      kind: 'recent-mental-viz',
      text: `Your mental visualisation reps are paying off. Close your eyes, hear a chord, find it — then let the next chord come on its own.`,
    };
  },

  // Emotion tag → create something with that feel
  snap => {
    const tags = [...snap.emotionIndex.keys()];
    const tag = pickRandom(tags);
    if (!tag) return null;
    const assocs = snap.emotionIndex.get(tag) ?? [];
    const assoc = pickRandom(assocs);
    if (!assoc) return null;
    return {
      kind: 'emotion-tag',
      text: `Try creating something ${tag}. Your notes tag ${assoc.subject} as ${tag} — start there and see where the next chord wants to go.`,
    };
  },

  // Recent song → improvise in its world
  snap => {
    const song = pickRandom(snap.recentSongs.slice(0, 5));
    if (!song) return null;
    const keyBit = song.key ? ` in ${song.key}` : '';
    const stageBit = song.stage === 'comfortable' || song.stage === 'internalized'
      ? `You've been getting comfortable with ${song.title}`
      : `You've been learning ${song.title}`;
    return {
      kind: 'recent-song-improv',
      text: `${stageBit} (${song.artist}). Improvise${keyBit} in that same emotional territory — what progression would YOU build on those chords?`,
    };
  },

  // Song stage momentum → write your own
  snap => {
    const internalized = snap.recentSongs.find(s => s.stage === 'internalized' || s.stage === 'maintenance');
    if (!internalized) return null;
    return {
      kind: 'song-momentum',
      text: `You've been sitting deep with ${internalized.title} (${internalized.artist}). Try writing something of your own that lives in its world — same feel, your melody.`,
    };
  },

  // Progression association → build a piece around it
  snap => {
    const progAssocs = snap.associations.filter(a => /progression/.test(a.subject));
    const a = pickRandom(progAssocs);
    if (!a) return null;
    const mood = a.emotions[0];
    const moodBit = mood ? ` that ${mood} quality` : '';
    return {
      kind: 'progression-association',
      text: `The ${a.subject} has been sitting in your head${moodBit ? ` — you described${moodBit}` : ''}. Build a short piece around it. Let it breathe.`,
    };
  },

  // No prompt — always available
  () => ({
    kind: 'freeform',
    text: `No prompt today. Just play what your hands want to say. Listen for the phrase that surprises you.`,
  }),

  // Consistency streak
  snap => {
    if (snap.recentPracticeDays < 4) return null;
    return {
      kind: 'streak-reward',
      text: `You've practiced ${snap.recentPracticeDays} of the last 7 days. Take ten minutes off the curriculum — play purely for yourself. See what the work unlocks.`,
    };
  },

  // Mode exploration
  snap => {
    const modeAssocs = snap.associations.filter(a => /mode$/.test(a.subject));
    const a = pickRandom(modeAssocs);
    if (!a) return null;
    return {
      kind: 'mode-exploration',
      text: `Improvise in ${a.subject.replace(' mode', '')} for five minutes. You wrote about it — now let your hands say what you've been hearing.`,
    };
  },
];

const PRODUCE_TEMPLATES: Template[] = [
  // Genre + bpm vibe
  snap => {
    const genre = pickRandom(snap.genres);
    if (!genre) return null;
    const bpm = genreBpmHint(genre);
    return {
      kind: 'genre-beat',
      text: `You've been learning ${genre} songs. Try making a beat with that laid-back feel${bpm ? ` — around ${bpm} BPM` : ''}. Skeleton sketch, no pressure to finish.`,
    };
  },

  // Record a progression you drilled
  snap => {
    const drill = pickRandom(snap.recentDrills.filter(d => d.kind === 'voice-leading' || d.kind === 'chord-shape'));
    if (!drill) return null;
    return {
      kind: 'record-drill',
      text: `Want to record the ${drill.label.toLowerCase()} you drilled this week? Would make a good Logic Pro sketch — loop it, try two different drum feels.`,
    };
  },

  // Sample-style beat tied to genre
  snap => {
    const genre = pickRandom(snap.genres);
    if (!genre) return null;
    return {
      kind: 'sample-beat',
      text: `Make a chopped-sample ${genre}-style beat. Pick a record, find one bar worth obsessing over, build around it.`,
    };
  },

  // Recreate a song's feel
  snap => {
    const song = pickRandom(snap.recentSongs.slice(0, 5));
    if (!song) return null;
    const tempoBit = song.tempo ? ` at ~${song.tempo} BPM` : '';
    return {
      kind: 'song-feel',
      text: `Dial up the feel of ${song.title} (${song.artist})${tempoBit}. Drums, bass, pad — aim for ten minutes of groove, nothing polished.`,
    };
  },

  // Emotion-driven production
  snap => {
    const tag = pickRandom([...snap.emotionIndex.keys()]);
    if (!tag) return null;
    return {
      kind: 'emotion-beat',
      text: `Produce something ${tag}. Start with the drums if that's easier, or a single pad that sets the mood. Don't overthink the arrangement.`,
    };
  },

  // No prompt
  () => ({
    kind: 'freeform',
    text: `No prompt — just open the DAW and follow curiosity. Even 20 minutes of exploration counts.`,
  }),

  // Loop-maker
  snap => {
    const drill = pickRandom(snap.recentDrills.filter(d => d.kind === 'chord-shape'));
    if (!drill) return null;
    return {
      kind: 'loop-maker',
      text: `Build an 8-bar loop that features ${drill.label}. Kick, snare, bass, the chord — that's plenty. Listen to it on repeat and feel what wants to change.`,
    };
  },
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
