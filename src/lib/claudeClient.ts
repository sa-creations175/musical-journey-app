// Direct-browser Anthropic API client. Used by the Reference Track
// "generate from genre" flow to request a short list of tracks for a
// user-supplied style prompt. Stays minimal on purpose — one fetch,
// a JSON parser, and shape validation.
//
// This lives at the lib layer because the app is a local-first PWA
// with no server of its own. API key is stored in the user's
// userPrefs (IndexedDB) and only sent from this client.

import { getPref, setPref } from './userPrefs';

export const PREF_ANTHROPIC_API_KEY = 'anthropicApiKey';

export async function getApiKey(): Promise<string> {
  return getPref<string>(PREF_ANTHROPIC_API_KEY, '');
}

export async function setApiKey(key: string): Promise<void> {
  await setPref(PREF_ANTHROPIC_API_KEY, key.trim());
}

export interface GeneratedTrack {
  title: string;
  artist: string;
  genre: string;
  whatToListenFor: string;
  tags: string[];
  spotifyLink?: string;
  youtubeLink?: string;
}

export interface GenerationResult {
  tracks: GeneratedTrack[];
}

const SYSTEM_PROMPT = `You are helping a producer build their reference track library. Given a short description of a genre, era, or style, suggest 4 real, well-known songs that match.

For each track, produce a "what to listen for" guide — GUIDED LISTENING, not fabricated technical analysis. Never invent specific plugins, ratios, decay times, or gear choices; you cannot know them. Instead point the listener at things they can actually perceive:
- how vocals sit relative to the backing
- how much space / silence the track allows
- how arrangement changes between sections
- how voices blend or separate
- how drums feel in time (pushing, dragging, tight, loose)
- comparisons to other songs or genres

Good example: "Listen for how the vocal floats on top of the mix — it's clearly compressed but you can still hear breath. Notice how drums feel warm and slightly behind the beat. Compare verses (sparse) to choruses (full) — arrangement is doing heavy emotional work."

Bad example (avoid this): "Opto compression at 3:1 ratio, EMT 140 plate reverb at 1.8s decay, tape-saturated drums..."

Return ONLY a JSON object in this exact shape:
{
  "tracks": [
    {
      "title": "Song Title",
      "artist": "Artist Name",
      "genre": "short genre label matching the user's request",
      "whatToListenFor": "3-5 sentence guided-listening prompt",
      "tags": ["lowercase-hyphenated", "tags", "3-to-5-items"],
      "spotifyLink": "https://open.spotify.com/search/<url-encoded query>",
      "youtubeLink": "https://www.youtube.com/results?search_query=<url-encoded query>"
    }
  ]
}

Use search URLs (as shown) rather than guessing exact track IDs. Do not include any prose outside the JSON.`;

/**
 * Call the Anthropic Messages API and return a parsed list of
 * reference tracks. Throws with a friendly message on any failure
 * (no key, network, shape mismatch) so the caller can surface it
 * through the toast / modal UI.
 */
export async function generateReferenceTracks(prompt: string): Promise<GenerationResult> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('No Anthropic API key configured. Open Settings → API key to add one.');
  }
  const trimmed = prompt.trim();
  if (trimmed === '') {
    throw new Error('Describe the genre or style first.');
  }

  const body = {
    // Sonnet is the right tradeoff here — generation quality matters
    // more than latency for a small, infrequent request. Users who
    // need to swap models can edit this in one place.
    model: 'claude-sonnet-4-6',
    max_tokens: 1600,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: trimmed },
      // Prefill the opening brace so Claude continues the JSON directly.
      { role: 'assistant', content: '{' },
    ],
  };

  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Network request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Anthropic API returned ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const textBlock = Array.isArray(data?.content)
    ? data.content.find((b: { type?: string }) => b?.type === 'text')
    : null;
  const rawText: string = textBlock?.text ?? '';
  if (!rawText) throw new Error('Empty response from Claude.');

  // Re-attach the prefilled '{' and isolate the first balanced JSON object.
  const stitched = `{${rawText}`;
  const jsonStart = stitched.indexOf('{');
  const jsonEnd = stitched.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error('Could not find JSON in the response.');
  }
  const candidate = stitched.slice(jsonStart, jsonEnd + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error('Response was not valid JSON.');
  }
  return validateGenerationResult(parsed);
}

function validateGenerationResult(value: unknown): GenerationResult {
  if (!isObject(value)) throw new Error('Response shape invalid.');
  const tracks = (value as { tracks?: unknown }).tracks;
  if (!Array.isArray(tracks)) throw new Error('Response missing tracks[].');
  const out: GeneratedTrack[] = [];
  for (const raw of tracks) {
    if (!isObject(raw)) continue;
    const t: Record<string, unknown> = raw as Record<string, unknown>;
    const title = typeof t.title === 'string' ? t.title.trim() : '';
    const artist = typeof t.artist === 'string' ? t.artist.trim() : '';
    const genre = typeof t.genre === 'string' ? t.genre.trim() : '';
    const whatToListenFor = typeof t.whatToListenFor === 'string' ? t.whatToListenFor.trim() : '';
    if (!title || !artist || !whatToListenFor) continue;
    const tags = Array.isArray(t.tags)
      ? t.tags
          .filter((x): x is string => typeof x === 'string')
          .map(x => x.toLowerCase().trim())
          .filter(Boolean)
      : [];
    const spotifyLink = typeof t.spotifyLink === 'string' ? t.spotifyLink : undefined;
    const youtubeLink = typeof t.youtubeLink === 'string' ? t.youtubeLink : undefined;
    out.push({ title, artist, genre, whatToListenFor, tags, spotifyLink, youtubeLink });
  }
  if (out.length === 0) throw new Error('No usable tracks in the response.');
  return { tracks: out };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
