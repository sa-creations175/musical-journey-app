// Deterministic search-link builders for Reference Track entries.
// Used by both manual add and Claude-generated tracks so every row
// has Spotify + YouTube links in the exact format the app expects:
//   Spotify:  open.spotify.com/search/<encoded "Title Artist">
//   YouTube:  youtube.com/results?search_query=how+to+produce+like+<encoded Artist>
// Kept as its own tiny module so the same logic runs in the seed
// migration, the editor, and the generation flow.

export function buildSpotifySearchLink(title: string, artist: string): string {
  const q = `${title.trim()} ${artist.trim()}`.replace(/\s+/g, ' ').trim();
  return `https://open.spotify.com/search/${encodeURIComponent(q)}`;
}

export function buildYouTubeProducerLink(artist: string): string {
  const q = `how to produce like ${artist.trim()}`.replace(/\s+/g, ' ').trim();
  // YouTube's search endpoint expects `+` for spaces in the query
  // string, which is the traditional x-www-form-urlencoded form.
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q).replace(/%20/g, '+')}`;
}
