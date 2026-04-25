import { db, type Beat, type Song, type SongSection } from '../../lib/db';

// Seed the user's 7 starter songs. Runs at most once per install —
// tracked via userPrefs so we don't re-seed if the user deletes a song
// intentionally. Pre-populates metadata, section structure, and (for
// the pre-verified songs) a full-lyrics reference. NEVER pre-populates
// chord charts — that's the user's learning process.
//
// A note on lyric fidelity:
//   Three of the seven songs (Mirror, Hold On, A Couple Minutes) are
//   more recent and their lyrics aren't in sources I could verify
//   against the original recordings without risking fabrication. For
//   those, the section scaffolding is present but the lyric body is
//   left empty with `lyricsNeedsVerification: true` and `fullLyrics`
//   carries a transcription prompt.
//
//   For public-domain or widely-published songs (O Come All Ye
//   Faithful, Alpha & Omega, Can You Feel the Love Tonight, No Weapon),
//   lyrics are seeded. The user can still edit anything.

import { getPref, setPref } from '../../lib/userPrefs';
import { whenSyncReady } from '../../lib/sync/syncReady';

const SEED_PREF = 'repertoireSeedVersion';
/**
 * Version history:
 *   1 → initial seed of 7 songs.
 *   2 → dedupe step for users who tripped the StrictMode double-seed
 *       bug in v1, plus transaction-wrapped seed + in-flight guard so
 *       parallel mounts can't race.
 *   3 → refresh `addedDate` on the 7 seeded songs so the new "added
 *       today" label tells the user's story from the current session
 *       onward. Non-seed songs the user added manually are untouched.
 */
const SEED_VERSION = 3;

// In-flight guard so parallel callers (e.g. React StrictMode's
// double-invocation of useEffect) don't produce two parallel seed
// transactions.
let seedInFlight: Promise<void> | null = null;

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function songSearchUrl(service: 'spotify' | 'youtube', title: string, artist: string): string {
  const q = encodeURIComponent(`${title} ${artist}`.trim());
  return service === 'spotify'
    ? `https://open.spotify.com/search/${q}`
    : `https://www.youtube.com/results?search_query=${q}`;
}

interface SeedSection {
  name: string;
  lyrics: string;
  lyricsNeedsVerification?: boolean;
}

interface SeedSong {
  title: string;
  artist: string;
  genre?: string;
  key: string;
  keyNeedsVerification?: boolean;
  tempoLabel?: string;
  description: string;
  sections: SeedSection[];
  /** Complete flowing-lyrics reference for the Full Lyrics panel.
   *  Empty string = "we couldn't verify; user should fill in". */
  fullLyrics: string;
}

const UNVERIFIED_FULL_LYRICS_NOTE =
  'Add lyrics here — we\'ll populate this as you add them to your lead sheet sections below.';

// --- Confident / public-domain lyrics -------------------------------

const O_COME: SeedSong = {
  title: 'O Come All Ye Faithful',
  artist: 'Traditional (English trans. Frederick Oakeley, 1841)',
  genre: 'hymn',
  key: 'D',
  tempoLabel: '80–100 BPM',
  description:
    'A foundational Christmas hymn that sits comfortably at the intersection of worship and repertoire staple. Works beautifully as a quiet solo-piano treatment or with a full band — either way a vocabulary-builder for diatonic voice leading.',
  sections: [
    {
      name: 'Verse 1',
      lyrics:
        'O come, all ye faithful\njoyful and triumphant\nO come ye, O come ye to Bethlehem\nCome and behold Him\nborn the King of angels',
    },
    {
      name: 'Refrain',
      lyrics:
        'O come, let us adore Him\nO come, let us adore Him\nO come, let us adore Him\nChrist the Lord',
    },
    {
      name: 'Verse 2',
      lyrics:
        'Sing, choirs of angels\nsing in exultation\nsing, all ye citizens of heaven above\nGlory to God\nall glory in the highest',
    },
    {
      name: 'Verse 3',
      lyrics:
        'Yea, Lord, we greet Thee\nborn this happy morning\nJesus, to Thee be all glory given\nWord of the Father\nnow in flesh appearing',
    },
  ],
  fullLyrics:
`[Verse 1]
O come, all ye faithful
joyful and triumphant
O come ye, O come ye to Bethlehem
Come and behold Him
born the King of angels

[Refrain]
O come, let us adore Him
O come, let us adore Him
O come, let us adore Him
Christ the Lord

[Verse 2]
Sing, choirs of angels
sing in exultation
sing, all ye citizens of heaven above
Glory to God
all glory in the highest

[Refrain]
O come, let us adore Him
O come, let us adore Him
O come, let us adore Him
Christ the Lord

[Verse 3]
Yea, Lord, we greet Thee
born this happy morning
Jesus, to Thee be all glory given
Word of the Father
now in flesh appearing

[Refrain]
O come, let us adore Him
O come, let us adore Him
O come, let us adore Him
Christ the Lord`,
};

const ALPHA_OMEGA: SeedSong = {
  title: 'Alpha & Omega',
  artist: 'Israel & New Breed',
  genre: 'gospel / worship',
  key: 'B',
  keyNeedsVerification: true,
  tempoLabel: '70–85 BPM',
  description:
    'A worship anthem that lives on a short looping progression — perfect for exploring voicings and rhythmic feel. The repeated-section form means cross-key work translates naturally from one chorus to the next.',
  sections: [
    {
      name: 'Verse',
      lyrics:
        'You are Alpha and Omega\nWe worship You our Lord\nYou are worthy to be praised',
    },
    {
      name: 'Chorus',
      lyrics:
        'We give You all the glory\nWe worship You our Lord\nYou are worthy to be praised',
    },
    {
      name: 'Bridge',
      lyrics: '',
      lyricsNeedsVerification: true,
    },
  ],
  fullLyrics:
`[Verse]
You are Alpha and Omega
We worship You our Lord
You are worthy to be praised

[Chorus]
We give You all the glory
We worship You our Lord
You are worthy to be praised

[Bridge — add from your preferred arrangement]
The bridge of Alpha & Omega varies between live
recordings. Transcribe from the version you're
working with and paste it here.`,
};

const LION_KING: SeedSong = {
  title: 'Can You Feel the Love Tonight',
  artist: 'Elton John (Lion King)',
  genre: 'pop / film',
  key: 'Db',
  tempoLabel: '60–75 BPM',
  description:
    'An Elton John / Tim Rice ballad that teaches phrasing as much as it teaches chords. The slow pace rewards space and voicing choices — a good bridge between worship-band playing and jazz-informed accompaniment.',
  sections: [
    {
      name: 'Verse 1',
      lyrics:
        "There's a calm surrender\nto the rush of day\nwhen the heat of the rolling world\ncan be turned away\n\nAn enchanted moment\nand it sees me through\nit's enough for this restless warrior\njust to be with you",
    },
    {
      name: 'Pre-chorus',
      lyrics:
        "And can you feel the love tonight?\nIt is where we are\nIt's enough for this wide-eyed wanderer\nthat we got this far",
    },
    {
      name: 'Chorus',
      lyrics:
        "And can you feel the love tonight?\nHow it's laid to rest?\nIt's enough to make kings and vagabonds\nbelieve the very best",
    },
    {
      name: 'Bridge',
      lyrics:
        "There's a time for everyone\nif they only learn\nthat the twisting kaleidoscope\nmoves us all in turn",
    },
    {
      name: 'Outro',
      lyrics: '',
      lyricsNeedsVerification: true,
    },
  ],
  fullLyrics:
`[Verse 1]
There's a calm surrender
to the rush of day
when the heat of the rolling world
can be turned away

An enchanted moment
and it sees me through
it's enough for this restless warrior
just to be with you

[Pre-chorus]
And can you feel the love tonight?
It is where we are
It's enough for this wide-eyed wanderer
that we got this far

[Chorus]
And can you feel the love tonight?
How it's laid to rest?
It's enough to make kings and vagabonds
believe the very best

[Bridge]
There's a time for everyone
if they only learn
that the twisting kaleidoscope
moves us all in turn

[Outro — add from the recording]
The film and studio single close slightly differently;
transcribe the outro from whichever version you're
playing and drop it here.`,
};

const NO_WEAPON: SeedSong = {
  title: 'No Weapon',
  artist: 'Fred Hammond',
  genre: 'gospel',
  key: 'A',
  keyNeedsVerification: true,
  tempoLabel: '75–95 BPM',
  description:
    'A gospel anthem with a declarative hook that lives on a strong bass line — perfect for practising bass-motion awareness alongside chord voicings. The vamp section is a natural laboratory for cross-key work and modal exploration.',
  sections: [
    {
      name: 'Verse 1',
      lyrics: '',
      lyricsNeedsVerification: true,
    },
    {
      name: 'Chorus',
      lyrics:
        'No weapon formed against me shall prosper\nIt won\'t work\nNo weapon formed against me shall prosper\nGod will do what He said He would do\nHe will fulfill every promise to me',
    },
    {
      name: 'Bridge',
      lyrics: '',
      lyricsNeedsVerification: true,
    },
    {
      name: 'Vamp',
      lyrics: '',
      lyricsNeedsVerification: true,
    },
  ],
  fullLyrics:
`[Verse — add from the recording]
The verses of No Weapon vary between the album
cut and live performances. Transcribe the version
you're working with here.

[Chorus]
No weapon formed against me shall prosper
It won't work
No weapon formed against me shall prosper
God will do what He said He would do
He will fulfill every promise to me

[Bridge / Vamp — add from the recording]
The extended vamp section is a signature feature of
this song and differs per performance. Paste your
working lyrics here as you transcribe.`,
};

// --- Songs where I couldn't verify lyrics without fabricating -------

const MIRROR: SeedSong = {
  title: 'Mirror',
  artist: 'Madison Ryann Ward',
  genre: 'R&B / soul',
  key: 'C',
  keyNeedsVerification: true,
  tempoLabel: '70–90 BPM',
  description:
    'An introspective R&B ballad that rewards emotional commitment in the voicings. A good fit for building the kind of in-the-moment phrasing that connects ear training to musical expression — keep an ear out for the signature shift into the chorus.',
  sections: [
    { name: 'Intro',      lyrics: '', lyricsNeedsVerification: true },
    { name: 'Verse 1',    lyrics: '', lyricsNeedsVerification: true },
    { name: 'Pre-chorus', lyrics: '', lyricsNeedsVerification: true },
    { name: 'Chorus',     lyrics: '', lyricsNeedsVerification: true },
    { name: 'Verse 2',    lyrics: '', lyricsNeedsVerification: true },
    { name: 'Bridge',     lyrics: '', lyricsNeedsVerification: true },
    { name: 'Outro',      lyrics: '', lyricsNeedsVerification: true },
  ],
  fullLyrics: UNVERIFIED_FULL_LYRICS_NOTE,
};

const HOLD_ON: SeedSong = {
  title: 'Hold On',
  artist: 'H.E.R.',
  genre: 'R&B',
  key: 'G',
  keyNeedsVerification: true,
  tempoLabel: '85–100 BPM',
  description:
    'H.E.R.\'s songwriting sits on sophisticated neo-soul chord vocabulary — extensions, slash chords, and modal borrowings surface often. A good candidate for using the Chord Progressions module\'s pattern detector as you transcribe sections.',
  sections: [
    { name: 'Intro',      lyrics: '', lyricsNeedsVerification: true },
    { name: 'Verse 1',    lyrics: '', lyricsNeedsVerification: true },
    { name: 'Pre-chorus', lyrics: '', lyricsNeedsVerification: true },
    { name: 'Chorus',     lyrics: '', lyricsNeedsVerification: true },
    { name: 'Verse 2',    lyrics: '', lyricsNeedsVerification: true },
    { name: 'Bridge',     lyrics: '', lyricsNeedsVerification: true },
  ],
  fullLyrics: UNVERIFIED_FULL_LYRICS_NOTE,
};

const A_COUPLE_MINUTES: SeedSong = {
  title: 'A Couple Minutes',
  artist: 'Olivia Dean',
  genre: 'soul / pop',
  key: 'F',
  keyNeedsVerification: true,
  tempoLabel: '90–110 BPM',
  description:
    'Olivia Dean\'s writing carries the warmth of classic soul with modern pop phrasing. Works well as a "take sections across keys" piece once the original-key version feels comfortable.',
  sections: [
    { name: 'Intro',   lyrics: '', lyricsNeedsVerification: true },
    { name: 'Verse 1', lyrics: '', lyricsNeedsVerification: true },
    { name: 'Chorus',  lyrics: '', lyricsNeedsVerification: true },
    { name: 'Verse 2', lyrics: '', lyricsNeedsVerification: true },
    { name: 'Bridge',  lyrics: '', lyricsNeedsVerification: true },
    { name: 'Outro',   lyrics: '', lyricsNeedsVerification: true },
  ],
  fullLyrics: UNVERIFIED_FULL_LYRICS_NOTE,
};

const SEED_SONGS: SeedSong[] = [
  O_COME,
  ALPHA_OMEGA,
  LION_KING,
  NO_WEAPON,
  MIRROR,
  HOLD_ON,
  A_COUPLE_MINUTES,
];

const SEED_TITLES = new Set(SEED_SONGS.map(s => `${s.title}|${s.artist}`));

function phrasesFromLyrics(lyrics: string): NonNullable<SongSection['phrases']> {
  // Split the seeded lyric block into phrase lines. Each line is
  // converted into word beats immediately so the post-refactor beat-
  // based editor can read it without a migration round-trip. Blank
  // lines become phrases with a single blank beat so the editor has
  // somewhere to click "+" for intro / gap lines.
  return lyrics.split('\n').map(line => {
    const words = line.split(/\s+/).filter(Boolean);
    const beats: Beat[] = words.length > 0
      ? words.map(w => ({ id: uid('beat'), type: 'word' as const, text: w }))
      : [{ id: uid('beat'), type: 'blank' as const }];
    return {
      id: uid('phrase'),
      beats,
      chordsByArrangement: { basic: {} },
      // Preserve the legacy lyrics string too — keeps backup files
      // human-readable and gives fallback rendering if beats ever drop.
      lyrics: line,
    };
  });
}

// --- Dedupe migration ------------------------------------------------

// Users who loaded the initial v1 seed before the StrictMode-safe
// guard existed may have doubled-up copies of every seeded song. For
// each (title, artist) seed pair, keep the earliest-added song and
// cascade-delete the rest (plus their sections, chords, progress, and
// practice logs).
async function dedupeSeededSongs(): Promise<void> {
  await db.transaction(
    'rw',
    [db.songs, db.songSections, db.songChords, db.songCrossKeyProgress, db.songPracticeLog],
    async () => {
      const allSongs = await db.songs.toArray();
      const bySeedKey = new Map<string, typeof allSongs>();
      for (const s of allSongs) {
        const key = `${s.title}|${s.artist}`;
        if (!SEED_TITLES.has(key)) continue;
        const arr = bySeedKey.get(key) ?? [];
        arr.push(s);
        bySeedKey.set(key, arr);
      }
      for (const arr of bySeedKey.values()) {
        if (arr.length <= 1) continue;
        const sorted = [...arr].sort((a, b) => a.addedDate - b.addedDate);
        const [keep, ...remove] = sorted;
        void keep;
        for (const dupe of remove) {
          // Cascade everything associated with the duplicate so we
          // don't orphan sections / progress.
          const [sectionRows, chordRows, ckRows, logRows] = await Promise.all([
            db.songSections.where('songId').equals(dupe.id).toArray(),
            db.songChords.where('songId').equals(dupe.id).toArray(),
            db.songCrossKeyProgress.where('songId').equals(dupe.id).toArray(),
            db.songPracticeLog.where('songId').equals(dupe.id).toArray(),
          ]);
          await Promise.all([
            db.songSections.bulkDelete(sectionRows.map(r => r.id)),
            db.songChords.bulkDelete(chordRows.map(r => r.id)),
            db.songCrossKeyProgress.bulkDelete(ckRows.map(r => r.id)),
            db.songPracticeLog.bulkDelete(logRows.map(r => r.id)),
            db.songs.delete(dupe.id),
          ]);
        }
      }
    },
  );
}

// --- Fresh seed (first install) --------------------------------------

async function seedFreshIfEmpty(): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.songs, db.songSections], async () => {
    // Double-check inside the transaction so a parallel seeding
    // transaction that already committed is visible.
    const count = await db.songs.count();
    if (count > 0) return;

    const songRows: Song[] = [];
    const sectionRows: SongSection[] = [];
    for (const seed of SEED_SONGS) {
      const songId = uid('song');
      songRows.push({
        id: songId,
        title: seed.title,
        artist: seed.artist,
        genre: seed.genre,
        key: seed.key,
        keyNeedsVerification: seed.keyNeedsVerification,
        tempoLabel: seed.tempoLabel,
        stage: 'learning',
        description: seed.description,
        fullLyrics: seed.fullLyrics,
        spotifyLink: songSearchUrl('spotify', seed.title, seed.artist),
        youtubeLink: songSearchUrl('youtube', seed.title, seed.artist),
        audioLinks: [],
        addedDate: now,
      });
      seed.sections.forEach((s, idx) => {
        sectionRows.push({
          id: uid('section'),
          songId,
          name: s.name,
          order: idx,
          lyrics: s.lyrics,
          lyricsNeedsVerification: s.lyricsNeedsVerification,
          phrases: s.lyrics === '' ? [] : phrasesFromLyrics(s.lyrics),
          // Every section starts with a single "Basic" arrangement.
          // Users add more via the arrangement bar as their ears grow.
          arrangements: [{ id: 'basic', name: 'Basic' }],
          activeArrangementId: 'basic',
        });
      });
    }
    await db.songs.bulkAdd(songRows);
    await db.songSections.bulkAdd(sectionRows);
  });
}

// --- Full-lyrics backfill for existing seed songs --------------------
//
// Users who upgraded from v1 without duplicates still miss the
// fullLyrics field on their seeded songs. Patch them in place.
async function backfillFullLyricsOnSeeds(): Promise<void> {
  const allSongs = await db.songs.toArray();
  for (const seed of SEED_SONGS) {
    const matches = allSongs.filter(s =>
      s.title === seed.title && s.artist === seed.artist);
    for (const song of matches) {
      if (song.fullLyrics !== undefined && song.fullLyrics !== '') continue;
      await db.songs.update(song.id, { fullLyrics: seed.fullLyrics });
    }
  }
}

// --- addedDate refresh for seeded songs ------------------------------
//
// Resets the addedDate of every seeded song to "now" so the new
// "added today / added N days ago" label on each card starts counting
// from the moment the user sees the refined module. Only touches
// titles that match a known seed — user-added songs keep their real
// addedDate.
async function refreshSeedAddedDates(): Promise<void> {
  const now = Date.now();
  const allSongs = await db.songs.toArray();
  for (const seed of SEED_SONGS) {
    const matches = allSongs.filter(s =>
      s.title === seed.title && s.artist === seed.artist);
    for (const song of matches) {
      await db.songs.update(song.id, { addedDate: now });
    }
  }
}

// --- Public entry ----------------------------------------------------

export async function seedRepertoireIfNeeded(): Promise<void> {
  if (seedInFlight) return seedInFlight;
  seedInFlight = (async () => {
    try {
      await whenSyncReady();
      const stored = await getPref<number>(SEED_PREF, 0);
      if (stored >= SEED_VERSION) return;

      if (stored === 0) {
        // Fresh install path.
        await seedFreshIfEmpty();
        // Fresh installs already get "now" for addedDate, but the
        // refresh is still a safe no-op if seedFreshIfEmpty bailed.
        await refreshSeedAddedDates();
      } else {
        // Incremental migration for users who have some version of the
        // seed already. Each step is idempotent so re-running costs
        // nothing.
        if (stored <= 1) {
          await dedupeSeededSongs();
        }
        if (stored <= 2) {
          await backfillFullLyricsOnSeeds();
        }
        // v3 — refresh addedDate on seeded songs.
        await refreshSeedAddedDates();
      }
      await setPref(SEED_PREF, SEED_VERSION);
    } catch (err) {
      console.error('[repertoire seed]', err);
      throw err;
    }
  })();
  try {
    await seedInFlight;
  } finally {
    seedInFlight = null;
  }
}
