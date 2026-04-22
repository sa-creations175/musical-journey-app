import { db, type Song, type SongSection, type RepertoireStage } from '../../lib/db';

// Seed the user's 7 starter songs. Runs at most once per install —
// tracked via userPrefs so we don't re-seed if the user deletes a song
// intentionally. Pre-populates metadata and section structure, but
// NEVER pre-populates chord charts (that's the user's learning
// process).
//
// A note on lyric fidelity:
//   Three of the seven songs (Mirror, Hold On, A Couple Minutes) are
//   more recent and their lyrics aren't in sources I could verify
//   against the original recordings without risking fabrication. For
//   those, the section scaffolding is present but the lyric body is
//   left empty with `lyricsNeedsVerification: true` — a visible hint
//   in the UI prompts the user to transcribe from the recording.
//
//   For well-established / public-domain songs (O Come All Ye Faithful,
//   Alpha & Omega, Can You Feel the Love Tonight, No Weapon), widely-
//   published lyrics are seeded. The user can still edit anything.

import { getPref, setPref } from '../../lib/userPrefs';

const SEED_PREF = 'repertoireSeedVersion';
const SEED_VERSION = 1;

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
}

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

export async function seedRepertoireIfNeeded(): Promise<void> {
  const existing = await getPref<number>(SEED_PREF, 0);
  if (existing >= SEED_VERSION) return;
  // Extra guard: don't seed if the user already has songs (e.g.
  // restored from backup before seeding ran).
  const existingCount = await db.songs.count();
  if (existingCount > 0) {
    await setPref(SEED_PREF, SEED_VERSION);
    return;
  }

  const now = Date.now();
  const defaultStage: RepertoireStage = 'learning';
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
      stage: defaultStage,
      description: seed.description,
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
      });
    });
  }

  await db.transaction('rw', [db.songs, db.songSections], async () => {
    await db.songs.bulkAdd(songRows);
    await db.songSections.bulkAdd(sectionRows);
  });
  await setPref(SEED_PREF, SEED_VERSION);
}
