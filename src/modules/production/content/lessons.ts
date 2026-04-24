import type { LessonContent } from './types';

// All 24 Phase-1 lessons — surface + deep dive + tryNow + YouTube
// reference. Written to read like a friend explaining Logic, not
// a manual. Glossary term ids in `glossaryTerms` also render as
// inline chips in the surface text (the LessonView component
// resolves `[[term-id]]` references to clickable overlays).

// --- Path 1: Workflow Foundations -----------------------------------

const WORKFLOW: LessonContent[] = [
  {
    id: 'wf-01',
    pathId: 'workflow-foundations',
    order: 1,
    title: 'The Logic Pro Main Window',
    goal: 'Know the five main areas and what each does — so the tool stops feeling like a maze.',
    surface: `Logic's main window looks busy until you know where to look. It's really just five areas doing five jobs. Learn these and 90% of Logic stops being mysterious.

The [[control-bar]] runs across the top — Play, Stop, Record, the time display, and a handful of toggles. Under it sits the [[tracks-area]] — the giant timeline where everything happens. Left of that lives the [[inspector]], the detail panel for whichever track you have selected. Further left is the [[library]], where presets and patches live. And tucked at the bottom are the [[smart-controls]] — eight to twenty-four knobs exposing the most-performance-critical parameters of your current patch.

Those five areas cover almost every daily task. You record in the Tracks Area, shape sound in the Inspector and Smart Controls, and hit transport in the Control Bar. The rest of Logic — Mixer, Piano Roll, Score — is a window you summon when you need it, not a permanent resident of your screen.`,
    deepDive: `Here's the secret: most people only use two of the five areas for months. That's fine. The other three show up when your needs grow.

A practical progression:
- **First month:** Control Bar (transport) + Tracks Area (recording and arranging). That's it. Ignore the rest.
- **Second month:** Start using the Library to audition patches instead of tweaking from scratch.
- **Third month:** Live in the Inspector — it's where per-track routing, sends, and channel strip edits happen without opening the full [[mixer]].
- **Fourth month:** Smart Controls become your performance interface — tracking a Rhodes gets ten times faster when you can reach Drive and Tremolo with one motion.

Beyond the five: the [[mixer]] (shortcut X), the Piano Roll (E on a MIDI region), and the [[transport]] counter (double-click to type a bar number and jump there). Cmd+K opens the shortcuts cheat sheet.

Logic also supports [[screenset]]s — saved window layouts. Cmd+1 can be your tracking layout; Cmd+2 your mixing layout; Cmd+3 your vocal-comping layout. Once you have three of these, window management stops being an interruption.

One more thing worth saying: the Main Window is infinitely customisable. Right-click the Control Bar to choose which buttons show. Drag panels to resize them. This is your workspace — make it yours.`,
    tryNow: 'Open Logic. Identify each of the five areas by name. Then collapse the Library (press Y) and the Inspector (press I) to see how much more room the Tracks Area gets.',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+main+window+tour',
    glossaryTerms: ['main-window', 'control-bar', 'tracks-area', 'inspector', 'library', 'smart-controls', 'mixer', 'transport', 'screenset'],
  },
  {
    id: 'wf-02',
    pathId: 'workflow-foundations',
    order: 2,
    title: "Creating a Project That's Set Up for You",
    goal: 'Build a reusable template so you start writing, not setting up.',
    surface: `Every session starts the same: create a blank project, add a Rhodes, add a drum machine, create a vocal track, set up a reverb send, route everything to the master. Ten minutes gone before you play a note.

A [[screenset]]-ready template fixes this. You build it once. Every future project starts from this template — tracks armed, plugins loaded, routing correct, colour-coded the way your brain reads.

A basic template has four things:
1. **Tracks you always use** — a Rhodes, a bass synth, a drum kit, a lead vocal track, a BGV bus.
2. **Routing already done** — two or three [[auxiliary-track]]s for reverb, delay, and parallel compression. Sends pre-wired.
3. **A [[marker]] track** with Intro, Verse, Chorus, Bridge, Outro already placed — just drag them to fit the song.
4. **Your screensets** saved — one for writing, one for mixing, one for vocal comping.

Save that project as a template (File → Save As Template). From then on, New Project From Template skips ten minutes of setup every single time.`,
    deepDive: `Templates are deceptively powerful because they encode your decisions once instead of every session. Once you name a track "Lead Vocal" and set its input to your vocal chain, you never have to do it again.

Things to include in a serious production template:

- **Input channels named** ("Vocal Mic," "DI Bass," "Drum Machine"). Logic remembers them across projects.
- **Colour coding by track type**. Drums blue, bass purple, keys green, vocals amber, FX grey. When you glance at the Tracks Area, categories jump out.
- **Track stacks** for drums and BGVs — one parent track that expands to show the child tracks. Collapses the visual clutter.
- **A mastering-ready [[mix-bus]]** with gentle compression + EQ + limiter loaded but disabled. Flip them on when ready to check the polish.
- **A print track** set to record from the mix bus. When you want a quick bounce, arm it and hit record — no need to stop the session to export.

The flip side: don't over-engineer. A template is a starting place, not a commitment. Delete tracks that don't fit the song. Add tracks as needs appear. The template should represent your 80% case, not every possible case.

You can keep multiple templates. "Gospel" template might prioritise a choir-stack Aux and an organ track; "R&B Ballad" might lead with a Rhodes and DI bass; "Hip-Hop Beat" might start from a sampler and drum machine. Pick the one that matches the day's work.`,
    tryNow: 'Build your first template. Add four tracks (one audio, one Rhodes, one bass, one drum kit), create two aux buses (Reverb, Delay), send each track to both, colour-code them. Save As Template under "My Template 01." Close and re-open using File → New Project From Template.',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+template+tutorial',
    glossaryTerms: ['screenset', 'marker', 'auxiliary-track', 'mix-bus', 'track'],
  },
  {
    id: 'wf-03',
    pathId: 'workflow-foundations',
    order: 3,
    title: 'The 10 Keyboard Shortcuts That Actually Matter',
    goal: 'Ten shortcuts that turn Logic from "where is that menu" into an extension of your hands.',
    surface: `You don't need to memorise every shortcut Logic ships with. Ten of them do 80% of the work. Drill these until they're muscle memory.

- **Spacebar** — Play / Stop. Your most-pressed key by a wide margin.
- **R** — [[record]]. Arm a [[track]], hit R, capture the take.
- **Cmd+S** — Save. Every five minutes, minimum.
- **Cmd+Z** — Undo. You will undo everything. Often.
- **Cmd+A** — Select All (regions in the [[tracks-area]], notes in Piano Roll).
- **Cmd+C / Cmd+V** — Copy / Paste regions. Fastest duplication.
- **Cmd+T** — Split a [[region]] at the playhead. Surgical editing.
- **Cmd+J** — Join selected regions into one. The inverse of split.
- **Cmd+B** — [[bounce]] selected regions in place — turn them into audio with current plugin settings baked in.
- **K** — Toggle the musical typing keyboard (your computer keyboard = a mini MIDI controller).

Build these in. Say them out loud for a week while you hit them. Then they disappear into instinct.`,
    deepDive: `Past the top ten, a second tier pays off:

- **Shift + K** — opens the Key Commands window where you can customise literally any shortcut. If the default assignment for your workflow is wrong, fix it once.
- **T** — toggles the Tool Menu. Press T, pick a different tool (Pencil, Eraser, Solo, Flex, Marquee). The tool swap menu is one of Logic's hidden superpowers.
- **M** — Mute the selected region or track.
- **S** — Solo the selected track.
- **L** — Lock / unlock a region from accidental moves.
- **F** — Toggle Flex Time / Flex Pitch on the selected track.
- **Cmd+1, Cmd+2, Cmd+3** — Switch between saved [[screenset]]s.
- **Option+Cmd+arrow** — Move selected region by one beat at a time.
- **Shift+Cmd+N** — New Software Instrument track directly.

A power move: **Shift + Click** to select multiple regions; then Cmd+B bounces them all in place in one pass. **Option + Drag** duplicates a region while dragging — the fastest way to repeat a motif.

Three habits worth forming now:
1. **Save immediately when something works.** Not five minutes later. Cmd+S the moment a take lands.
2. **Undo liberally.** Cmd+Z is cheap. Experiment, hate it, undo, repeat.
3. **Use your left hand for transport, your right hand for the mouse.** Spacebar, R, and the letter shortcuts all sit under your left hand while your right navigates.

The time it takes to internalise these pays back in weeks, not months. A producer who's fluent with shortcuts is in the music; a producer clicking through menus is in the tool.`,
    tryNow: 'For the next session, print the top ten shortcuts on a Post-it and stick it to your monitor. Every time you reach for a menu that a shortcut could handle, glance at the Post-it and use the shortcut instead. After a week, ditch the Post-it.',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+keyboard+shortcuts+essential',
    glossaryTerms: ['record', 'track', 'tracks-area', 'region', 'bounce', 'screenset'],
  },
  {
    id: 'wf-04',
    pathId: 'workflow-foundations',
    order: 4,
    title: 'Recording Your First Keyboard Performance',
    goal: 'Arm the track, hit R, play, stop. The fundamental recording flow.',
    surface: `Recording in Logic is deliberately simple, and that simplicity matters. The steps:

1. Create a Software Instrument [[track]] (or select an existing one).
2. Click the **[[arm]] button** (the R on the track header). It turns red.
3. Check [[input-monitoring]] — the I button next to the arm button. Turning it on lets you hear yourself through any plugins on the track.
4. Press **R** or click the Record button in the [[control-bar]].
5. Wait for the count-in (Logic gives you four clicks by default).
6. Play.
7. Press Spacebar to stop.

You now have a [[region]] on that track containing your performance — [[midi]], since this is a software instrument. Zoom in and you see the notes you played as little horizontal bars in the Piano Roll.

If you don't love the take, Cmd+Z and try again. If you do, save the project (Cmd+S). That's a recording session at its most basic — the same flow whether it's eight bars of Rhodes for a verse or a whole demo.`,
    deepDive: `A few details make the basic flow more reliable:

**Count-in matters.** Four clicks before the downbeat lets you settle into the tempo. Without it, the first note is always tentative. Adjust count-in in the Metronome settings (Cmd+Option+Click the metronome button in the Control Bar).

**[[punch]] recording** is your friend. When you want to re-record just one spot, set punch locators (Autopunch button in the Control Bar) so Logic only records during that range. The rest of the region is untouched.

**[[cycle]] mode + Take Folder** is the professional's recording approach. Set a cycle over a section, press R, and Logic stacks every pass as a [[take]] inside a [[take-folder]]. You comp later. More in the Comping lesson.

**Monitoring without recording**: if you just want to hear yourself through plugins (for warm-up or rehearsal), arm + turn on [[input-monitoring]] but don't press R. You're live but not capturing — useful for deciding tone before tape rolls.

**Latency** — the gap between playing a key and hearing it — matters. In Logic's preferences, set the I/O Buffer Size to 64 or 128 samples for tracking. (You can raise it back to 512 or 1024 for mixing when you need more CPU for plugins.)

**Click track** is under the metronome button. You can customise the click sound — a shaker sample is much easier to play to than the default tick for slow-tempo gospel.

**MIDI comping** works the same as audio comping. Cycle-record four passes of a Rhodes part, then swipe through the [[take-folder]] to pick the best bar from each pass. The same flow as vocals, except editable note-by-note later.

A working principle: capture first, edit later. The take with the best feel beats the take with the cleanest performance every time. Fix clams; keep feel.`,
    tryNow: 'Open a project. Create a Software Instrument track with any patch (try a Rhodes from the Library). Arm the track. Press R. Play something, anything, for eight bars. Stop. You just recorded. Verify there\'s a region on the track with notes in it.',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+first+recording+midi',
    glossaryTerms: ['track', 'arm', 'input-monitoring', 'control-bar', 'region', 'midi', 'punch', 'cycle', 'take', 'take-folder'],
  },
  {
    id: 'wf-05',
    pathId: 'workflow-foundations',
    order: 5,
    title: 'The Save Habit',
    goal: 'Save every five minutes — and save versions for milestones — so you never lose work.',
    surface: `Logic is stable, but not perfect. Plugins crash. Power flickers. You delete a region and rebuild on top of it. The Save habit is cheap insurance against all of it.

Three habits to build:

**Cmd+S every five minutes, minimum.** Press it after every decent take. Press it before trying something experimental. Press it while you're thinking. You cannot over-save.

**File → Save As for milestones.** When a song reaches a new level — demo is complete, arrangement locked, mix started — save a new version with a date in the filename. "Ballad_v01_2026-05-10.logicx." You can always go back. Disk is cheap.

**Enable Autosave.** Logic → Preferences → General → Project Handling → "Autosave." Logic then saves quietly every five minutes in case you forget. This is a belt to your Cmd+S suspenders.

Together these three habits mean you never lose more than a minute of work, and you can always return to a prior version of the song. That's liberating: you can experiment freely because the past is always recoverable.`,
    deepDive: `Versioning strategy matters more than people think. A few approaches:

**Date-based versions.** "Song_2026-05-10.logicx." Simple. Works until you have 40 versions and can't remember which day had the good bridge.

**Semantic versions.** v01 = rough sketch, v02 = arrangement locked, v03 = full production, v04 = mixing, v05 = mastering prep. Keep a short note in each filename about what changed. "v03_bridge-rewrite.logicx."

**Branch versions.** When you try something risky (a new arrangement idea, a key change), fork into "v04_alt_key.logicx" so the original stays intact. If the branch fails, delete it. If it succeeds, it becomes v05.

Logic handles version folders well. Right-click a project in Finder → Show Package Contents → Alternatives folder holds backup snapshots Logic creates automatically.

Beyond save: **Project Backup**. Logic Pro lets you enable automatic backups under Logic → Preferences → Advanced. The backups live in a folder of your choice. Point this at an external drive or a cloud-synced folder (Dropbox, iCloud, Backblaze) and you have redundancy.

**Bounce-as-backup.** Every major milestone, bounce a stereo WAV of the full project. If the Logic session corrupts, you still have audio. 10 MB per minute of song — trivial disk cost, guaranteed recovery.

Stories you don't want to live through: someone deleted an entire vocal comp because they hit the wrong key, didn't notice, and saved an hour later. The fix? None, without backups. Save discipline is the difference between an annoying setback and a production emergency.

One more: **never save over a client's session without copying first.** If a collaborator sends you a project, File → Save As immediately into your own copy. Then work from there. The original stays pristine.`,
    tryNow: 'Right now, in whatever project you have open, press Cmd+S. Then File → Save As and add today\'s date to the filename. Then open Preferences → General → Project Handling and confirm Autosave is enabled. You just set up three layers of safety in 30 seconds.',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+project+backup+autosave',
    glossaryTerms: [],
  },
  {
    id: 'wf-06',
    pathId: 'workflow-foundations',
    order: 6,
    title: 'Using Markers to Navigate Your Song',
    goal: 'Use markers to label song sections and jump instantly — instead of dragging the playhead guessing.',
    surface: `Navigating a song by "drag the [[playhead]] until it looks right" is brutal once the song has more than three sections. [[marker]]s solve this in one shortcut.

Press **Option + Apostrophe (')** at the playhead's current position. Logic adds a marker. Name it ("Chorus 1") and press Return. Repeat for every section.

Now jump:
- Press the marker's shortcut (1-9 on your keyboard number row, if you've assigned shortcuts).
- Or open the Marker List (Cmd+L in some versions; the Marker menu otherwise) and double-click the name.

Marker names become your song's outline: Intro, Verse 1, Pre-Chorus, Chorus, Verse 2, Bridge, Chorus, Outro. Clients and collaborators can read your session at a glance.

For even bigger moves, Logic's [[arrangement-track]] lets you define sections as coloured blocks you can drag to re-order entire chunks of the song — bridge before the second chorus? Drag it. Every track moves in sync.`,
    deepDive: `Markers are more than navigation. A few advanced uses:

**Colour-coded markers.** Right-click a marker → Marker Colour. Paint all your Chorus markers purple, Verses blue, Bridge gold. When you glance at the timeline, song structure jumps out.

**Bar-locked markers.** By default, markers live at a time (e.g., "0:42"). You usually want them bar-locked (e.g., "Bar 17"). Right-click a marker → Lock to SMPTE Position OFF so it follows bar changes if you alter the tempo. Under the hood, markers can reference either absolute time or musical bars — the default varies; check it matches your workflow.

**Quick section jumps.** With a marker selected, pressing the left/right arrows in some setups moves between markers. Worth setting up as custom shortcuts if you do a lot of vocal comping across sections.

**Export markers to stems.** When delivering to a mastering engineer, exported markers help them know where sections begin — useful for fades and gapless transitions.

**Arrangement Track vs. Markers.**
- Markers are **labels** on the timeline. They point at positions; they don't move content.
- Arrangement Track **blocks** are containers. Drag one and every track's content in that range moves with it.

Use markers for navigation, Arrangement Track for restructuring. They complement — a section with both an Arrangement block and a marker inside is fully first-class.

**The navigation muscle pays off in vocal comping.** Jump to Verse 1, cycle, record four takes, jump to Chorus, cycle, record four takes, jump to Bridge, etc. Without markers, you're squinting at waveforms to find your place. With them, you're in the music.

Pro tip: **Name markers by feel, not just structure.** "Verse 1 — intimate" / "Chorus 1 — lift" / "Bridge — pull back." Those emotional tags remind you what each section is supposed to do, which guides mixing and arrangement decisions later.`,
    tryNow: 'Open any project with at least two sections. Drop markers at each section start (Option + \'). Name them. Navigate between them using the Marker List. Then try the Arrangement Track (Global Tracks → Arrangement) and drag a section block to see how a re-order works.',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+markers+arrangement+track',
    glossaryTerms: ['playhead', 'marker', 'arrangement-track'],
  },
  {
    id: 'wf-07',
    pathId: 'workflow-foundations',
    order: 7,
    title: 'Comping Multiple Takes Into One Great Performance',
    goal: 'Use Cycle + Take Folders + Quick Swipe Comping to build the perfect take out of three good ones.',
    surface: `Great performances are almost never one clean pass. They're stitched from the best moments across three or four takes. [[comping]] is the craft of doing that stitching.

The flow in Logic:

1. Set a **[[cycle]]** over the section (e.g., the chorus).
2. Arm the track. Press R.
3. Logic loops. Each pass becomes a [[take]] stacked inside a [[take-folder]] on the track.
4. Stop after three or four good passes.
5. Open the Take Folder (click its disclosure arrow). You see the takes as horizontal lanes.
6. **[[quick-swipe-comping]]**: drag your mouse across the lanes to pick which take plays at each moment. Logic highlights the selected take in bright colour.
7. Listen back — you hear the composite, flipping between takes where you swiped.
8. When happy, right-click the Take Folder → **[[flatten]]**. The folder collapses into a single region containing only the selected sections.

Now you have one clean [[composite]]. The take folder's raw takes stay archived in the project — you can un-flatten if you change your mind.`,
    deepDive: `Comping is one of the highest-leverage skills in modern production. A few techniques that raise the game:

**Swipe by phrase, not by beat.** Listen for phrase endings — a breath, a consonant, a natural pause — and make your swipe boundary there. Splice inside a held note and you'll hear the edit. Splice at a breath and the edit vanishes.

**Don't over-comp.** Pick the best take per phrase and commit. The instinct to use take 3 for one word and take 1 for the next often ends up worse than just committing to the best overall take. Comp by phrase, then trust it.

**Fade the edits.** Logic adds small crossfades automatically at swipe boundaries. Sometimes you need to extend them — zoom in, grab the fade handle on either side of the cut, and stretch it. A longer crossfade smooths any remaining "edit click."

**Keep the raw takes.** Never delete a Take Folder after flattening — you might change your mind about a phrase two weeks later. Disk is free; performances aren't.

**MIDI comping works the same way.** Record four passes of a Rhodes solo over a cycle — Logic stacks them into a MIDI [[take-folder]]. Swipe to pick the best phrasing from each pass. Then the real magic: you can also edit individual notes within the comped MIDI — fix a clam, tweak velocity, move a note a sixteenth. Audio comping can't do that.

**Comping energy.** A real trick: takes 1-2 are often cautious; take 3 is where the singer stops thinking; take 4 is where they start overreaching. Comp heavily from take 3. You can always dig into take 2 for the cleaner intonation if take 3 gets wild.

**Split takes across different songs.** If a singer delivers a killer ad-lib in take 2, save the Take Folder and drag copies of specific takes out for use elsewhere. Take Folders aren't destiny — they're options.

A note on emotional comping: the first instinct is to choose the cleanest take. Often the right move is to choose the one with the most feel, clams included. Listeners don't notice a slightly flat note; they notice a lifeless performance. Comp for soul first, correctness second.`,
    tryNow: 'Record four passes of anything over a cycled section. Open the Take Folder. Do one pass of Quick Swipe Comping — pick the best phrases from different takes. Listen back. Flatten. That whole workflow should feel natural after three or four songs — this is the single most-used move in modern vocal production.',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+take+folder+comping',
    glossaryTerms: ['comping', 'cycle', 'take', 'take-folder', 'quick-swipe-comping', 'flatten', 'composite'],
  },
  {
    id: 'wf-08',
    pathId: 'workflow-foundations',
    order: 8,
    title: 'Bouncing — Getting Audio Out of Logic',
    goal: 'Export your mix as WAV or MP3, bounce tracks in place, and deliver stems.',
    surface: `Bouncing turns your session into a shareable audio file. Logic offers several flavours:

**Bounce Project or Section (Cmd+B)** — exports the whole mix (or a selected range) as one stereo file. Pick the format:
- **[[wav]]** — 24-bit, 44.1 kHz for collaborators, mastering, archive. Never lossy.
- **[[mp3]]** — 320 kbps for texts and early feedback. Fast to share, small to store.

**[[bounce-in-place]]** — exports a single track (with its plugins baked in) to a new audio region on the same track. Useful when you've nailed a synth patch and want to free up CPU, or when you want to chop the audio.

**[[stem]] export** — bounces groups of tracks (all drums, all vocals, etc.) to separate WAV files. Hand-off to mastering, remixing, or a collaborator. Select the tracks → File → Bounce → Bounce in Place with the "all tracks" option, or use File → Export Tracks as Audio Files.

Whenever you bounce for final delivery, leave **[[headroom]]** — don't let the master hit 0 dBFS. -6 dB peaks is a safe starting point. Mastering engineers need room to work.`,
    deepDive: `Bouncing decisions quietly shape your delivery quality. A few rules worth internalising:

**[[sample-rate]] matching.** If your project is 48 kHz, bounce 48 kHz. If it's 44.1, bounce 44.1. Downsample only at the final mastering stage — each conversion introduces subtle quality loss.

**[[bit-depth]].** Work at 24-bit everywhere. Only export 16-bit when the destination demands it (CD masters, sometimes streaming). 24-bit has vastly more [[headroom]] for minute mixing moves.

**Dithering.** When you bounce from 24-bit to 16-bit, Logic adds dither — a tiny amount of noise that masks the quantisation artefacts of the bit reduction. For final 16-bit masters, enable POW-r Dither (Type #3 is a safe default). For 24-bit bounces, don't dither — it adds unnecessary noise.

**Real-time vs. offline bounce.** Real-time processes the audio at 1× speed (you hear it play). Offline is faster. Almost always pick offline — it's identical in result. Real-time matters only if you have a hardware plugin or MIDI routing that needs live playback.

**Bounce ranges, not just projects.** For sharing just the chorus, set a cycle over it and bounce that range. For an intro-only preview, same move. You can bounce any selection.

**Print the master.** A pro habit: after the final mix, bounce a stereo file of the complete mix, import it back into Logic as a reference, and A/B it against your working mix. This catches inconsistencies the studio monitors hide.

**Stems for collaboration.** When another producer or mix engineer takes over, send stems plus a rough stereo mix. Standard stems: Drums, Bass, Keys, Lead Vocal, Background Vocals, FX. They should each be the same length, starting at bar 1, so they line up identically when imported anywhere.

**Filename hygiene.** "SongName_Final_v4_MixA.wav" is readable. "Untitled_4.wav" is a future mystery. Name the artist, song, version, mix/master variant, and date.

**Loudness.** Modern streaming targets around -14 LUFS integrated. Logic's Loudness Meter helps (Multimeter plugin). Don't push your mix louder than that; mastering engineers know how to get there without squashing your dynamics. Your job is to deliver a dynamic, well-balanced mix — not a loud one.`,
    tryNow: 'Open a song you\'ve been working on. Select a 16-bar section. Press Cmd+B to bounce it. Pick 24-bit WAV. Choose a destination. Hit OK. You now have a shareable audio file. Then try Bouncing In Place on one track — notice how Logic replaces the plugin-heavy track with a baked audio version.',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+bounce+stems+delivery',
    glossaryTerms: ['bounce', 'bounce-in-place', 'stem', 'wav', 'mp3', 'sample-rate', 'bit-depth', 'headroom'],
  },
];

// --- Path 2: The Language of Production -----------------------------

const LANGUAGE: LessonContent[] = [
  {
    id: 'lang-01',
    pathId: 'language-of-production',
    order: 1,
    title: 'What Is Sound?',
    goal: 'Decibels, frequency, pitch, amplitude — the physics that every production decision bends to.',
    surface: `Sound is vibrating air. A speaker pushes air, the air pushes your eardrum, your brain translates the motion into "music." That's all.

Everything a producer decides — EQ, compression, reverb, panning — is a way to shape that vibrating air.

Two properties matter most:

**[[frequency]]** — how fast the air vibrates. Measured in [[hz]] (cycles per second) and [[kilohertz]] (thousands). Low frequencies = deep, warm, slow (a kick drum at 60 Hz). High frequencies = bright, airy, fast (a cymbal at 10 kHz). The relationship between frequency and [[pitch]] is direct — 440 Hz = the A above middle C.

**[[amplitude]]** — how big the vibrations are. Measured in [[decibel]]s (dB). Bigger amplitude = louder. Conversations are around 60 dB SPL; a club hits 110 dB. In digital audio we use [[dbfs]], where 0 is the ceiling and everything is negative.

A sound is rarely a single frequency. It's a fundamental [[pitch]] plus [[harmonic]]s stacked above — that's why a Rhodes at A4 sounds different from a piano at A4. Same fundamental, different harmonic signature.

Every mix move is you deciding which frequencies belong, how loud, and when.`,
    deepDive: `A working producer doesn't need the physics deeply — but a few concepts pay off for years:

**The audible range is roughly 20 Hz – 20 kHz.** Below 20 Hz you feel it more than hear it (sub-bass territory). Above 16 kHz, hearing degrades with age — most adults can't hear much past 15 kHz. The mix shouldn't need those frequencies to read correctly on a phone speaker.

**Octaves and doubling.** Each octave up doubles the frequency. A4 = 440 Hz; A5 = 880 Hz; A3 = 220 Hz. This is why EQ software shows frequency on a logarithmic scale — the distance between 100 Hz and 200 Hz looks equal to the distance between 1 kHz and 2 kHz, because musically they're both one octave.

**[[peak]] vs RMS.** The peak is the instantaneous loudest moment; RMS is the average. A kick hits peak for a millisecond and sustains at a lower RMS level. Mixing for peaks and mixing for RMS are different problems. Compressors and limiters generally target peaks; loudness meters report RMS-like averages.

**[[phase]].** When two signals of the same frequency arrive out of step, they cancel each other. Mixing two mics on a guitar cabinet? Move one a half-inch and the tone shifts dramatically. This is a phase change. It's the invisible hand behind "comb filtering" and why stereo widening plugins sometimes make a mix sound worse on mono systems.

**The Fletcher-Munson curves.** Human hearing isn't flat. At low volumes we hear bass less than mids; at high volumes everything flattens out. Practical implication: mix at moderate volume. Too quiet and you'll over-boost bass; too loud and you'll under-boost bass. A mix done at 75-82 dB SPL tends to translate best.

**Emotional mapping of frequencies.** Producers develop instinctive language over time:
- 20-60 Hz — deep weight, felt more than heard
- 60-200 Hz — body, warmth, fullness
- 200-500 Hz — mud (usually bad when exposed)
- 500 Hz - 2 kHz — where most fundamentals live; where muddiness or cardboard-ness lurks
- 2-5 kHz — presence, attack, clarity, irritation
- 5-10 kHz — sibilance, air, detail
- 10 kHz and up — shimmer, sparkle, modern polish

All EQ decisions are you moving amplitude around in these regions. Every other tool (reverb, saturation, compression) interacts with these same frequency bands in more complex ways.`,
    tryNow: 'Open Logic. Load a reference track you love into a new audio track. Insert the Channel EQ plugin. Sweep around with a narrow, high-Q boost — start at 50 Hz and move up to 15 kHz over 30 seconds. Listen to what lives where. Name out loud which frequencies carry which instrument. That\'s the game.',
    youtubeLink: 'https://www.youtube.com/results?search_query=audio+fundamentals+frequency+amplitude+explained',
    glossaryTerms: ['decibel', 'dbfs', 'hz', 'kilohertz', 'frequency', 'pitch', 'amplitude', 'harmonic', 'peak', 'phase'],
  },
  {
    id: 'lang-02',
    pathId: 'language-of-production',
    order: 2,
    title: 'EQ — Shaping Frequencies',
    goal: 'Understand what EQ does, common moves for warmth / clarity / brightness, and the emotional effect of each.',
    surface: `[[eq]] is the single most-used tool in every mix. It lets you turn specific [[frequency]] bands up or down — adding low-end body, removing muddiness, brightening a vocal, rolling off rumble.

The moves worth knowing:

**[[high-pass-filter]] on almost everything.** A high-pass at 60-100 Hz on vocals, 200-300 Hz on guitars, removes sub-bass rumble that doesn't belong. Instant mix clarity.

**Cut before you boost.** If a vocal sounds muddy, the first move is a 3-6 dB cut around 250 Hz with a moderate [[q-factor]]. Not a boost at 5 kHz. Cuts remove problems; boosts expose them.

**Presence boost at 2-5 kHz.** A gentle 1-2 dB shelf or bell boost in this range brings vocals and leads forward. Too much = harshness.

**Air boost at 10-15 kHz.** A [[shelving-eq]] lifting the very top end makes vocals feel modern and open. Every pop record from the 2010s onward has this.

Every [[parametric-eq]] band has three knobs: **frequency** (what to target), **gain** (boost or cut how much), and **Q** (how wide). Low Q = wide, musical. High Q = narrow, surgical. Get fluent with all three.`,
    deepDive: `Classic EQ moves by instrument (starting points — every record is different):

**Kick drum.** High-pass at 30 Hz to kill subsonic mud. Cut around 300-400 Hz to remove cardboard. Boost 60-80 Hz for thump. Boost 3-5 kHz for beater click (attack) if needed.

**Bass.** High-pass at 30 Hz. Cut around 300 Hz if it's muddy. Boost 80-100 Hz for warmth. Boost 700 Hz – 1 kHz for "growl" that reads on small speakers.

**Lead vocal.** High-pass at 80-100 Hz. Small cut around 200-300 Hz to de-mud. Boost 3-5 kHz for presence. Gentle air shelf at 10+ kHz. De-ess after EQ, not before.

**Acoustic piano / Rhodes.** High-pass at 100 Hz. Notch around 300 Hz if boxy. Gentle boost 3-5 kHz for clarity. Warm air shelf on top.

**Electric guitar.** High-pass at 100 Hz. Cut 400-600 Hz to reduce honkiness. Boost 2-3 kHz for attack. Low-pass above 10 kHz (cymbals are for the drums, not the guitar).

**BGVs.** Steeper high-pass than the lead (120-150 Hz) so they sit behind. Gentle cut at the frequency your lead boosts for presence — creates space. Wide air boost.

**Emotional effects of EQ.**

EQ doesn't just fix problems; it sets emotion. A boost at 200 Hz feels warm and intimate, like a voice close to your ear. A cut at 200 Hz feels clean and modern. A low-pass filter gradually pulling everything down above 5 kHz makes a track feel distant, underwater, nostalgic — that's the sound of classic R&B "lo-fi" hooks.

A high-pass sweeping from 20 Hz up to 1 kHz across a bar creates tension ("build") that releases when you drop back to 20 Hz. This EDM move works in gospel and R&B too — Kirk Franklin's builds often use exactly this.

**Reference song listening.**
- **Babyface — "When Can I See You Again"** — vocal EQ is famously gentle. Presence around 3 kHz, air at 12 kHz. Clarity without harshness.
- **Kirk Franklin — "Stomp"** — Listen to the high-pass on the individual BGVs; they're carved to not crowd the bass.
- **D'Angelo — "Untitled (How Does It Feel)"** — famously muddy-on-purpose; bass and Rhodes share frequency space and it works because the arrangement breathes.

**EQ philosophy: small moves, many bands.** Ten bands each doing 1-2 dB beats one band doing 8 dB. The ear hears surgical extremes; it barely notices gentle cumulative work. That's the difference between a mix that sounds polished and one that sounds "over-EQ'd."`,
    tryNow: 'Load any track that feels muddy to you. Insert Channel EQ. Enable a bell with Q=2 around 250 Hz. Cut 3 dB. Listen. If the track cleared up, you found the mud. Move on. This single move alone will fix 40% of amateur mixes.',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+eq+tutorial+vocal',
    glossaryTerms: ['eq', 'parametric-eq', 'shelving-eq', 'high-pass-filter', 'low-pass-filter', 'q-factor', 'frequency'],
    referenceTracks: ['ref-babyface-ballad', 'ref-kirk-franklin', 'ref-dangelo-untitled'],
  },
  {
    id: 'lang-03',
    pathId: 'language-of-production',
    order: 3,
    title: 'Compression — Controlling Dynamics',
    goal: 'Use compression to control dynamics intentionally — and shape the feel of a track, not just its level.',
    surface: `A [[compression|compressor]] turns down the loud parts of a signal and leaves the quiet parts alone. Result: a smaller range between quietest and loudest — a "controlled" signal that sits more consistently in the mix.

Five knobs run the show:

- **[[threshold]]** — the level above which compression kicks in. Lower threshold = more of the signal gets compressed.
- **[[ratio]]** — how aggressively. 2:1 means 2 dB over becomes 1 dB over. Gentle. 8:1 is heavy. 20:1+ is limiting.
- **[[attack]]** — how fast the compressor responds. Fast = grabs transients (punchy); slow = lets transients through and compresses sustains (preserves punch).
- **[[release]]** — how fast the compressor lets go. Fast = can pump; slow = smoother.
- **[[makeup-gain]]** — makes up the volume you lost when peaks got pushed down. Without it, compression just sounds quieter.

The [[gain-reduction]] meter tells you how many dB the compressor is currently cutting — more useful than any knob in diagnosing what's happening.

Starting points by source:
- Vocals: threshold for 3-6 dB [[gain-reduction]], ratio 3:1-4:1, attack 5-15 ms, release 100-200 ms, soft [[knee]].
- Bass: ratio 3:1-4:1, faster attack, medium release.
- Drum bus: ratio 2:1-4:1, slow attack (preserves punch), fast release (pumps).`,
    deepDive: `Compression is where "mix engineer" becomes a real skill. A few deeper ideas:

**Two-compressor vocal chain.** One compressor catches the biggest peaks (fast attack, 4:1, 3-4 dB [[gain-reduction]]). A second compressor levels the average (slow attack, 2:1, 2-3 dB GR). Two gentle stages beat one heavy stage.

**Attack shapes punch.** On a snare, attack at 1 ms flattens the snap; attack at 30 ms lets the snap through and just compresses the ring. Tune attack to serve the transient you want the ear to hear.

**Release shapes groove.** A compressor with release matched to the tempo "breathes" with the song. Too fast and it pumps audibly (sometimes desirable — that's the EDM sidechain pump). Too slow and it glues but feels stiff.

**[[knee]].** Hard knee compresses abruptly at threshold — good for punchy, aggressive sounds. Soft knee compresses gradually — feels invisible on vocals. Most modern plugins default to medium-soft.

**Types of compressor character.**
- **VCA** (SSL 4000, dbx 160) — fast, clean, aggressive. Great on drums and the mix bus.
- **Opto** (LA-2A, Teletronix) — smooth, musical, slower. The classic vocal compressor.
- **FET** (1176) — fast, aggressive, coloured. Brilliant on vocals, snare, parallel compression.
- **Vari-Mu** (Fairchild 670, Manley Vari-Mu) — soft and expensive sounding. Often on the mix bus.

Logic includes stock emulations of each (the Compressor plugin has a "Circuit Type" menu — Classic VCA, VintageVCA, VintageOpto, Studio FET, Vintage FET, etc). Try the same vocal through each circuit type to hear how they differ.

**Emotional effects of compression.**

A ballad vocal with heavy, slow compression feels intimate — consistent, close. Every breath sits right in your face. Babyface ballads (Boyz II Men, Toni Braxton) are famously this.

A drum bus with aggressive parallel compression feels powerful — the kick and snare punch without losing dynamics. "New York" compression.

A soft-knee opto compressor (like the LA-2A emulation) makes a vocal feel "invisible" — the vocal is clearly there, clearly even, but you can't point to what's doing it. That's the highest-level compression: nobody notices.

**[[parallel-compression]]** deserves its own mention. Send a duplicate of your vocal or drums to an aux, crush it with fast FET compression (10-15 dB gain reduction), blend that crushed copy 20-40% underneath the original. You get the body of heavy compression without losing the transients.

**[[side-chain]] compression** is covered in its own lesson — it's a separate topic entirely from "how to compress."

Reference listening:
- **Whitney Houston — "I Will Always Love You"** — listen to how every breath, every tiny vocal detail sits at exactly the same level. Heavy but invisible compression.
- **Frank Ocean — "Thinking Bout You"** — the drum bus has that slow-attack fast-release breath. Listen to how the snare "pulls" on each hit.
- **Boyz II Men — "End of the Road"** — vocals famously compressed hard; BGVs also heavily controlled. Classic 90s R&B technique.`,
    tryNow: 'Load a vocal take. Insert Logic\'s Compressor. Set ratio 4:1, fast attack (5 ms), moderate release (100 ms). Lower the threshold until the GR meter shows 4-6 dB on the loudest words. Listen: does the vocal feel more present? Add 3 dB of makeup gain. That\'s the most common vocal compression move in production.',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+compressor+tutorial',
    glossaryTerms: ['compression', 'threshold', 'ratio', 'attack', 'release', 'knee', 'makeup-gain', 'gain-reduction', 'parallel-compression', 'side-chain'],
    referenceTracks: ['ref-whitney-ballad', 'ref-frank-ocean', 'ref-boyz-ii-men'],
  },
  {
    id: 'lang-04',
    pathId: 'language-of-production',
    order: 4,
    title: 'Reverb — Creating Space',
    goal: 'Use reverb to place instruments in a perceived space — and know how decay and pre-delay shape emotional distance.',
    surface: `[[reverb]] is what makes a recording sound like it's happening in a room. Without it, everything is bone-dry, unnaturally close, sterile. With it, sounds have a tail — reflections that tell your ear "this happened in a space."

Three knobs matter most:

**[[decay]]** — how long the reverb tail lasts. 0.6 s = small room. 1.5 s = studio plate. 3 s = hall. 6+ s = cathedral.

**[[pre-delay]]** — the gap between the sound and the reverb's start. 10-30 ms is natural. 50-100 ms throws the reverb clearly behind the source, keeping the dry signal punchy while building a big space.

**[[wet-dry]]** — how much reverb vs direct sound. On a [[send]], the send bus is 100% wet; the dry stays on the source track. On an insert, you mix them inside the plugin.

Use reverb on a **[[send]]**, not as an insert. One [[auxiliary-track]] with a reverb plugin, serves five or ten sources — they all sit in the same space and your CPU stays manageable.

Logic includes three great reverbs: [[chromaverb]] (algorithmic, modern), [[space-designer]] (convolution, realistic rooms), and the Vintage Plate (the classic plate sound). Start with ChromaVerb — it's deep, flexible, and low-CPU.`,
    deepDive: `Reverb is where a mix acquires depth. A few rules that separate "has reverb" from "uses reverb":

**Reverb types and when to reach for each.**
- **[[plate-reverb]]** — bright, dense, smooth tail. The classic vocal reverb. Every Aretha, Motown, Babyface vocal lives in a plate.
- **Chamber / Room** — smaller spaces. Great on BGVs to glue them without pushing them distant.
- **[[hall-reverb]]** — long decay, pronounced early reflections. Grand, epic. Best on orchestral sources and ballad choruses.
- **Spring** — the lo-fi, boingy reverb of guitar amps and vintage dub. Not typically on vocals.
- **[[convolution]] reverbs ([[space-designer]])** — take impulse responses of real spaces (Abbey Road, a cathedral, a garage). Realism nothing algorithmic quite matches.

**Two reverb sends, one decision.** A working engineer often has two reverb buses — a short one (0.8 s plate) and a long one (2.5 s hall). Sources that want intimacy go to the short; sources that need grandeur go to the long. A single source can send to both in different amounts.

**Pre-delay is the secret control.** A vocal with 30 ms pre-delay feels immediate AND has a big reverb behind it — because the dry word hits first, then the reverb blooms. Without pre-delay, the vocal and reverb smear together and clarity dies.

**EQ your reverb send.** Almost always, cut 4-6 dB around 200-300 Hz on the reverb return — this removes mud. Often also cut above 8-10 kHz if the reverb is too bright. EQ on the return doesn't change the source, just what the reverb adds.

**Gated reverbs and tricks.** A plate reverb with a fast gate on the return = the "80s snare" sound. Works on modern BGV productions as a special effect.

**Emotional effects of reverb.**

Dry sounds are close. Reverbed sounds are far. The more reverb, the more emotionally distant. Use this deliberately:

- **Verse dry, chorus wet** — the chorus blooms emotionally because the reverb opens up the space.
- **Lead vocal slightly dry, BGVs wetter** — lead stays intimate, BGVs feel like the room.
- **Small plate on lead** — classic soul / Motown vocal texture.
- **Long hall on a single "yeah" adlib** — turns a throwaway line into a moment of grandeur.

**The "vocal is too wet" mistake.** Amateur mixes drown vocals in reverb because it sounds professional in isolation. It reads as distant when the full mix plays. Rule of thumb: mix reverb so it's present when vocal is solo'd but disappears when the mix plays. You should feel it more than hear it.

**Reference songs.**
- **Stevie Wonder — "Ribbon in the Sky"** — long plate on vocal, lush and romantic without swimming.
- **Kirk Franklin choir productions** — big halls on the choir, drier lead vocals. That contrast is what makes the choir feel like a congregation and the preacher feel present.
- **Frank Ocean — "Pink + White"** — modern, very subtle reverb. Feels huge; actual wet/dry is less than you'd guess. That restraint is the skill.

**The 3D space: reverb + delay + panning.** Panning puts you in the horizontal; reverb decay puts you in the vertical depth; pre-delay controls how close the source still feels. Together they give you a 3D mix — every instrument at a specific point in space, not just a flat wall of sound.`,
    tryNow: 'Create an [[auxiliary-track]] called "Plate Short." Insert ChromaVerb, pick the Plate preset. Set decay 1.4 s, pre-delay 25 ms. Route a lead vocal send to it at about -12 dB. Compare the vocal with and without — notice how the reverb positions the vocal in a space without making it distant.',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+chromaverb+reverb+tutorial',
    glossaryTerms: ['reverb', 'decay', 'pre-delay', 'wet-dry', 'chromaverb', 'space-designer', 'plate-reverb', 'hall-reverb', 'convolution', 'send', 'auxiliary-track'],
    referenceTracks: ['ref-babyface-ballad', 'ref-kirk-franklin', 'ref-frank-ocean'],
  },
  {
    id: 'lang-05',
    pathId: 'language-of-production',
    order: 5,
    title: 'Delay — Echo and Rhythmic Interest',
    goal: 'Use tempo-synced delay and slapback to add rhythmic interest and creative texture.',
    surface: `[[delay]] plays back a copy of your signal after a chosen time. Done right, it creates rhythm, motion, and texture that reverb alone can't.

Three flavours pay off:

**Tempo-synced delay.** Set the delay time to a musical value — 1/4, 3/8, 1/2 note. At tempo, the echoes fall on the beat, adding rhythmic interest without muddying anything.

**[[slapback]].** A short, single delay (80-150 ms) with no [[feedback]] — one quick echo that thickens the source. The classic Elvis vocal trick; also Kirk Franklin ad-libs.

**[[tape-delay]].** Emulations of old tape units. Each repeat gets darker and pitchier — that warm, degrading-over-time character. Opposite of a clean digital delay.

The key knobs:
- **Time** — length of each delay. Set to tempo-synced musical values.
- **[[feedback]]** — how many echoes before they die out. 25% = three clear echoes; 70% = a washy cloud.
- **Wet/dry** — balance between direct and delayed. On a send, 100% wet.
- **High-cut / low-cut** on many delays — shapes how the repeats fade tonally.

Use delay on a [[send]], same as reverb. One delay bus, multiple sources feeding it.`,
    deepDive: `Delay is where modern R&B and hip-hop get their signature motion. A few craft details:

**Dotted eighth on vocal hooks.** Set a delay to 3/16 (dotted eighth), low feedback, blend subtly. Every Bruno Mars / Anderson .Paak vocal hook uses some version of this. It creates a ghost of the line that pushes forward without competing.

**Ping-pong for space.** Set a [[stereo-delay]] — left at 1/4, right at 1/8 — and the repeats bounce between speakers. Dramatic width without requiring the source to be panned.

**Rhythmic delay on a breath.** Record a vocal breath, add a dotted-8th delay with 50% feedback. Suddenly you have a musical hook made of air. Hip-hop producers do this constantly.

**Low-cut the feedback.** Most tape delays let you high-pass the feedback path so repeats get thinner over time (less bass buildup). Essential on vocal delays — otherwise the repeats mud up the mix.

**Slapback on ad-libs.** When your singer throws a "yeah" at the end of a chorus, a single 120 ms slapback (no feedback) doubles it without feeling like an effect. Kirk Franklin's "Stomp" is full of this.

**Tempo-synced creative uses.**
- 1/4 delay with 40% feedback — groove reinforcement, the delay locks with the beat.
- 1/8 delay, one repeat — a flavour, not a texture.
- 1/2 delay, long feedback — massive space, but watch for muddiness in the bass.
- 3/8 (dotted) delay — the R&B signature; polyrhythmic push forward.

**Tape delay vs digital.** A digital delay is clean — every repeat identical. Tape delay is lo-fi — each repeat loses highs and wobbles in pitch. Tape is more musical; digital is more "effect." Most mix engineers use tape emulations by default unless they specifically want the digital sound.

**Emotional effects of delay.**

Delay feels like echoes in a memory. A single slapback is a double of yourself. A long tape delay feels like something receding. A tempo-synced delay locks everything into rhythm.

Unlike reverb, delay doesn't necessarily make sounds "distant." It adds rhythmic complexity without moving the source back in space. That's why delay + reverb together is so much richer than either alone.

**Reference songs.**
- **Daniel Caesar — "Japanese Denim"** — dry vocal, subtle slap, long tape delay on the background. That's modern R&B delay craft.
- **SZA — "The Weekend"** — dotted eighth delay on lead vocal hooks. Listen to the hook; the delay is doing half the work.
- **D'Angelo — "Really Love"** — tape delay on the guitar; feels vintage without being nostalgic.

**Build the signature delay bus.** Many producers keep a default delay bus in their template: 1/4-dotted time, 30% feedback, slight high-cut on feedback, 10% stereo spread, tape saturation plugin after the delay. Every song gets a send to it. Instant signature space.`,
    tryNow: 'Create an [[auxiliary-track]] called "Tape Delay." Insert Logic\'s Tape Delay plugin. Set to 1/4 (dotted), feedback 25%, wet 100%, a little tape saturation. Route your lead vocal send at around -18 dB. Play the chorus. The delay should add motion without fighting the vocal.',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+delay+tutorial+tape',
    glossaryTerms: ['delay', 'feedback', 'slapback', 'tape-delay', 'stereo-delay', 'send', 'auxiliary-track'],
    referenceTracks: ['ref-daniel-caesar', 'ref-frank-ocean'],
  },
  {
    id: 'lang-06',
    pathId: 'language-of-production',
    order: 6,
    title: 'Gain Staging — The Silent Craft of Professionals',
    goal: 'Manage levels at every stage so nothing clips, nothing compresses wrong, and the mix has headroom.',
    surface: `[[gain-staging]] is the least glamorous and most-underrated skill in production. A mix with good gain staging feels open, dynamic, effortless. A mix without it feels muddy and squashed no matter how good the individual parts are.

The principle: each stage in the signal chain — recording, plugin inserts, track fader, bus fader, master fader — should operate at its happy level. Too hot and it clips or distorts unpleasantly; too quiet and you lose resolution.

**Recording level: peaks at -18 to -12 [[dbfs]].** Not -3. Digital isn't analog — you don't need to "hit the tape hard." 24-bit audio has so much resolution that -18 dBFS is still pristine. And you leave headroom for everything downstream.

**Fader near unity (0).** If your track fader is pinned at +9 to get it loud enough, something upstream is too quiet. Fix the source, not the fader.

**Track plugins: keep internal levels reasonable.** A compressor plugin with the input at -18 dBFS behaves differently from one at -3 dBFS. Most modern plugins forgive, but analogue-modelled ones (tape, tube plugins) respond to hot input. Aim for signals to hit plugins around -12 to -18 dBFS unless you're intentionally driving them.

**Master [[headroom]]: aim for -6 dB peak.** Don't push the master fader to hit 0 dBFS. Leave room for mastering. A mix peaking at -6 dB on the master sounds more open than one slammed to 0.

**Never let a plugin or track fader clip.** Red lights = bad. [[clipping]] in digital is harsh, cheap-sounding, unmistakable.`,
    deepDive: `The deeper craft:

**Gain-staging inserts (the silent killer).** Each plugin in your chain has its own input and output levels. If you load a tape saturation plugin and the input is too hot, the plugin behaves wrong — too much saturation, too quiet output. Check the plugin's input meter. If it's into the yellow or red, back off the track fader (or better — use [[clip-gain]] to bring the source down before the plugin). Modern plugins often have an internal Input/Output gain pair — use them to keep internal levels right.

**[[clip-gain]] is your friend.** In Logic, the top of each region has a Gain handle. Drag it down to reduce the region's level before anything else. This is cleaner than the track fader — you're shaping the source to hit your plugins right.

**Mix-bus discipline.** Your [[mix-bus]] / master should never [[clipping|clip]], even momentarily. Check with Logic's Loudness Meter or Levels plugin. If the mix bus is hitting +3 dB on peaks, pull down every track 3 dB — don't fix it with a limiter on the master.

**Headroom for mastering.** When handing off to a mastering engineer, bounce with peaks at -6 dBFS. They need room to work. A mix already at 0 dBFS is pre-mastered — you've left nothing to the mastering engineer.

**Rough-mix trick.** Start every mix by pulling every track fader to -8 dB. Build up from there. You'll find you need less loudness than you think once the relationships are right.

**Why this matters for modern genres.**

Heavy-handed mixes die on streaming. Platforms normalise to around -14 LUFS — a mix louder than that gets turned DOWN, and the turning-down exposes its squashed transients. The dynamics you fought for get buried. A well-gain-staged mix, printed at -14 LUFS, sits perfectly next to anything else on Spotify. A crushed mix doesn't.

**In gospel and R&B specifically**: these genres depend on vocal dynamics — the whisper in a verse, the roar in a chorus. Bad gain staging flattens both. You hear a Fred Hammond chorus land because the verse was quiet and the arrangement breathed. That's dynamics preserved by gain staging. Without it, the chorus just sounds like more of the same loud.

**Signs you have a gain staging problem.**
- Your master is red. Fix by pulling down the whole mix.
- Your mix sounds muddy no matter how much EQ you do. Probably overloaded plugins.
- Vocals disappear until you slam the fader. The pre-fader chain is losing them.
- The mix sounds great at low volume, messy at loud volume. Something's clipping when pushed.
- You need a maximiser / limiter to make the mix "feel loud." You've squashed it because it wasn't louder-sounding to begin with.

All of these dissolve with proper gain staging. It's boring, invisible, and the foundation everything else sits on.`,
    tryNow: 'Open any recent mix. Solo the master output. Check the peak. If it\'s hitting above -3 dBFS, find the loudest track and pull it down 3 dB. Check the master again. Keep going until master peaks sit around -6 dB. Notice how much cleaner the mix feels — and how much easier every subsequent mix move is.',
    youtubeLink: 'https://www.youtube.com/results?search_query=gain+staging+logic+pro+tutorial',
    glossaryTerms: ['gain-staging', 'headroom', 'clipping', 'clip-gain', 'master-fader', 'mix-bus', 'dbfs', 'peak'],
  },
  {
    id: 'lang-07',
    pathId: 'language-of-production',
    order: 7,
    title: 'Saturation — Adding Warmth and Character',
    goal: 'Understand why digital can sound sterile and how tape, tube, and transformer saturation restore warmth.',
    surface: `Digital recordings are clean. Often too clean. They lack the natural colour that tape, tubes, and transformers used to impose automatically.

[[saturation]] is gentle [[distortion]] — adding harmonic complexity that makes a source feel warm, full, and "like a record" rather than "like a take."

Three common saturation flavours:

**[[tape-saturation]]** — emulates the soft compression and pleasing harmonics of analog tape. Softens transients, adds body, smooths the top end slightly. Every Motown and D'Angelo record is on tape.

**[[tube-saturation]]** — emulates vacuum-tube amplifiers. Adds even-order harmonics — musical, round, "presence without EQ." Great on vocals and mix bus.

**Transformer / console saturation** — emulates the input stages of classic consoles (SSL, Neve). A subtle thickening and slight low-mid warmth.

Logic ships several plugins that do this: Tape Delay (use the tape section on its own), Bit Crusher (for heavy colour), Clip Distortion, Phat FX. Third-party options like Kramer Tape, Decapitator, Saturn expand the palette.

Saturation is a nudge, not a shove. Push it hard and it becomes distortion; use it subtly and it becomes "that producer's sound."`,
    deepDive: `Why digital can sound sterile:

Real acoustic instruments produce harmonics beyond the fundamental — a piano note has tones, transients, room reflections, body resonance. Analogue recording (tape, tubes) imposes its own harmonics on top, softening transients and warming the mid-range.

Digital recording is faithful. It captures what was played, and nothing extra. If the source is clinical (a DI bass, a clean sampled Rhodes), the recording stays clinical. Saturation adds back the natural colour that hardware used to impose automatically.

**Where to apply saturation:**

- **Drums.** A light tape saturation on the drum bus pulls everything together. J Dilla's drums are a masterclass — aggressive tape saturation, softened transients, and bus compression. The "Dilla drums" sound is partly that.
- **Bass.** Tube or transformer saturation on bass adds upper harmonics that translate better on small speakers (where you can't hear the fundamental). Every pop record's bass has saturation on it.
- **Vocals.** Subtle tube saturation on a lead vocal adds "presence" without needing more EQ. Often goes between the compressor and the reverb send.
- **Mix bus.** Very gentle tape saturation on the mix bus is the final glue of a modern master. 0.5-1 dB of saturation — barely measurable, clearly audible.
- **Snare.** A parallel saturation chain (send to aux, hit with heavy saturation, blend underneath) gives a snare body without changing its character.

**How to set it up.**

On a plugin like Logic's Tape Delay (tape section only), Decapitator, or Saturn:
1. Find the input/drive/input-trim knob.
2. Slowly push it until you hear the tone thicken.
3. Stop when the transients start to feel dulled (unless that's what you want).
4. A/B compare with the plugin bypassed. If the saturated version sounds "fuller" without sounding "different," you're there.

**[[harmonic]] distortion: even vs. odd.**

Tubes add even-order harmonics (octaves — pleasing, musical). Solid-state distortion adds odd-order harmonics (fifths, sevenths — edgy, aggressive). Producers typically want tube-style saturation on anything they want to "warm up" — vocals, bass, drums. Odd-order distortion is for intentional edge (grunge guitars, aggressive leads).

**Saturation order matters.** Saturation → EQ → Compression → Reverb is typical. Saturation before EQ lets the EQ shape the saturated tone; saturation after compression emphasises the compressed character. Experiment.

**Emotional effects.**

Saturation turns a clean recording into a record. It implies "this existed in the physical world." A saturated bass feels weighty; a saturated vocal feels intimate; a saturated drum feels like a hand hit something.

Remove saturation and mixes feel "just made" — clinical, floating, unreal. Add too much and mixes feel dirty or overcooked. Find the line.

**Reference songs.**
- **D'Angelo — any Voodoo track** — aggressive tape, consciously degraded. The sonic signature of the album.
- **Erykah Badu — "On & On"** — same era, same tape-forward aesthetic.
- **Anderson .Paak — "Come Down"** — modern version: tape-saturated drums, tube-like lead vocal, heavy console colour throughout.
- **Babyface productions** — restrained tube saturation on vocals. "You're not polished enough" is rarely the problem; tube warmth removes the digital edge without imposing a character.`,
    tryNow: 'Take a clean DI bass (or any sterile source). Insert Logic\'s Clip Distortion or the Tape Delay plugin (use just the tape section, no delay). Push the drive slowly. Find the point where it sounds "warmer" but not "distorted." A/B it bypassed. That\'s the move.',
    youtubeLink: 'https://www.youtube.com/results?search_query=saturation+logic+pro+tutorial+warmth',
    glossaryTerms: ['saturation', 'distortion', 'tape-saturation', 'tube-saturation', 'harmonic'],
    referenceTracks: ['ref-dangelo-untitled'],
  },
  {
    id: 'lang-08',
    pathId: 'language-of-production',
    order: 8,
    title: 'Sidechain Compression — The Modern Pop Pump',
    goal: 'Set up sidechain compression so the kick "ducks" the bass (or pad) — the rhythmic pump of modern pop.',
    surface: `[[side-chain]] compression is when a compressor on one track is triggered by a different track. Classic use: the kick drum triggers the compressor on the bass, so every kick hit briefly ducks the bass. The bass rebounds between kicks. Result: a rhythmic "pump" that gives a mix forward motion.

In Logic:

1. On your bass track, insert a [[compression|compressor]].
2. Find the Side Chain button (top-right of the Compressor plugin).
3. Click it. Choose your kick track as the side-chain input.
4. Set a fast [[attack]] (1-5 ms) so the compression happens right when the kick hits.
5. Medium [[release]] (80-120 ms) so the bass rebounds naturally before the next kick.
6. [[ratio]] 4:1-6:1, [[threshold]] for 3-6 dB [[gain-reduction]].

Now every kick hit pulls the bass down briefly. You'll hear the bass "breathe" with the kick — that's the pump.

Use the same trick on pads, synths, or anything that competes with the kick for space. It's not just about space — it's about rhythm. The pump IS the groove.`,
    deepDive: `Where sidechain compression earns its keep:

**Kick + bass (the classic).** The most common sidechain move. A pumping bass against a driving kick = EDM, house, most pop. The kick punches through; the bass rebounds to fill the space between.

**Kick + pad.** Pads and pianos often share the 200-400 Hz range with kick drums. Sidechaining the pad to the kick gives the kick room every beat. The pad "pumps" subtly behind the groove.

**Lead vocal + BGVs.** Gospel and R&B sometimes sidechain BGVs to the lead — every time the lead sings, BGVs duck slightly. The lead stays clear; BGVs fill when the lead breathes.

**Snare + reverb return.** Sidechain a reverb-return compressor to the snare: the reverb ducks when the snare hits, so the snare stays dry-punchy, then the reverb blooms between hits. Dramatic vocal move too.

**Hidden uses.**

- **De-essing is technically sidechain** — a compressor triggered by the high-frequency content of sibilance, reducing only when sibilance spikes. That's what de-essers are doing under the hood.
- **Ducking a sample** — when you want a vocal sample to appear only when the lead stops, sidechain its compressor to the lead with a very high ratio. Lead up = sample silent; lead rests = sample audible.

**Setting attack and release for the pump.**

The pump's character is in the release. A fast release (30-60 ms) creates an obvious, rhythmic pump — classic EDM. A slow release (200+ ms) gives a subtle, almost-unconscious breathing. Most R&B productions sit in the 80-120 ms range — audible when you listen for it, invisible as groove.

Attack should be fast enough (1-5 ms) that the duck happens on the kick hit itself, not a beat after. Too slow an attack and you hear the kick "cut through" the bass instead of the bass ducking for the kick.

**Pitfall: the pump that doesn't groove.**

If the pump fights the groove, lower the threshold and shorten the release. The pump should reinforce the downbeat, not hit awkwardly between beats.

**Reference songs.**
- **Daft Punk — anything** — defined the sidechain pump in modern pop.
- **Kanye West — "Stronger"** — sidechain pump between the beat and the synths.
- **Pharrell productions (Neptunes era)** — more subtle but pervasive.
- **Contemporary gospel worship — Hillsong, Elevation** — sidechain pumping on pad and synth bus pushes against the kick. This is why modern worship feels "driving" in a way the 90s version didn't.

**Creative sidechain.**

- Trigger a compressor on a reverb tail from a vocal track — the reverb ducks whenever the vocal sings, so the reverb only appears in the silences. Classic "ghostly" effect.
- Sidechain a noise / risers track to a snare hit — the riser pulls back on every snare, so each hit punctuates a texture.
- Sidechain a full synth bus to a kick — the whole music bed breathes with the kick. This is the classic Martin Garrix / EDM drop technique.

The thing to internalise: sidechain isn't about level — it's about rhythm. Every time you sidechain, you're creating a rhythmic relationship between two tracks. The relationship is the sound.`,
    tryNow: 'Set up a basic kick + bass sidechain. Kick on track 1, bass on track 2. Compressor on bass. Enable sidechain input from the kick. Fast attack, 100 ms release, 4:1 ratio, threshold for 4-5 dB of gain reduction when the kick hits. Play them together. Listen for the bass "pumping" in between kicks.',
    youtubeLink: 'https://www.youtube.com/results?search_query=sidechain+compression+logic+pro+tutorial',
    glossaryTerms: ['side-chain', 'compression', 'attack', 'release', 'ratio', 'threshold', 'gain-reduction'],
  },
];

// --- Path 3: Vocal Production ---------------------------------------

const VOCAL: LessonContent[] = [
  {
    id: 'vocal-01',
    pathId: 'vocal-production',
    order: 1,
    title: 'Setting Up a Clean Vocal Recording',
    goal: 'Mic placement, input levels, headphones, room — everything that happens before you press R.',
    surface: `A great vocal recording starts with physics, not plugins. Nail these before anything else:

**The [[microphone]].** For most home studios, a [[condenser-microphone]] on a stand with a [[pop-filter]] between singer and mic. Enable [[phantom-power]] (the 48V switch on your interface). If your room is untreated, a [[dynamic-microphone]] like the Shure SM7B is often better — it rejects room noise.

**Mic placement.** Singer stands 6-10 inches from the mic for intimate, balanced sound. Closer = more proximity effect (more bass). Further = more room. Aim slightly off-axis (singer looks past the mic, not straight at it) to reduce plosives.

**The room.** Soft surfaces absorb reflections: duvets on walls, blankets on hard floors, bookshelves. The goal is a drier room — reflections baked into the recording are permanent. If you can't treat, get closer to the mic.

**Input level.** Peaks at -12 to -6 [[dbfs]]. Not hotter. 24-bit recording has tons of [[headroom]]; you don't need to push.

**Headphone mix.** Give the singer a balanced mix with themselves slightly louder than the backing track. Their performance improves when they can hear their breath, their pitch, their dynamics.

**[[input-monitoring]] ON, with light reverb.** Singers sing better with reverb in their cans than without. A little plate on the monitoring path — not printed to the recording.`,
    deepDive: `Getting a recording right at the source is 80% of the vocal chain. A few deeper moves:

**Mic choice matters more than mic price.** A Shure SM7B ($400) outperforms a cheap condenser in 95% of bedrooms. In a treated room, a quality condenser (Neumann TLM 102, Warm WA-87, Rode NT1) outperforms the SM7B for detail. Choose based on your room, not your budget.

**Plosive prevention.** [[plosive]]s are low-frequency bursts of air from P, B, and hard T consonants. A [[pop-filter]] 4-6 inches from the mic catches most. Angling the mic off-axis catches more. For singers with heavy plosives, use both.

**Sibilance prevention.** [[sibilance]] (harsh S and Sh sounds) is partly mic choice (bright condensers exaggerate it) and partly technique (singing too close amplifies it). Pull back 2-3 inches on sibilant passages. Fix what's left with a de-esser (see vocal-05).

**Headphone bleed.** If the singer's headphones are too loud, the click track or backing tracks can bleed into the mic — audible as a ghostly double in the recording. Turn the cans down, or use closed-back headphones, or use in-ears.

**Pop filter positioning.** The pop filter catches plosives but also helps keep the singer at a consistent distance. Set it at 6 inches; have the singer sing with their mouth just touching the filter. Consistent distance = consistent tone.

**Proximity effect.** Cardioid mics (most vocal mics) boost bass when the source is close. Good for warmth; bad when it's too much. If the vocal sounds boomy, have the singer back off 2-3 inches.

**Ambient noise.** Listen to the room while the singer isn't singing. Fridge hum, computer fan, AC noise all end up in your recording. Kill what you can (turn off the AC for tracking; muffle the fridge).

**Monitoring chain for best performances.**

The singer's headphone mix is the second-most-important decision (after mic). A singer who can't hear themselves well will push, strain, and deliver weaker takes.

A good setup:
- Backing track at comfortable level.
- Lead vocal louder than the track — the singer should hear themselves clearly.
- A little plate reverb on the monitoring path (not printed) — feels professional, encourages better dynamics.
- A light compressor on the monitoring path — so the singer hears themselves at consistent level. (Again: not printed.)

Logic's low-latency monitoring makes this easy: enable Low Latency Mode (the little meter icon in the Control Bar) and Logic routes your input through monitoring plugins without perceptible delay.

**Vocalist's comfort.**

Don't underestimate how much the room affects performance. Offer water. Dim the lights. Put a candle in the booth (many engineers do). Make the space feel like a creative place, not a fluorescent lab. Singers deliver better under those conditions — this is engineering but also emotional architecture.

**Tracking order.**

Track the most emotionally critical sections first, while the singer is fresh. If the chorus is the peak of the song, cycle-record the choruses first. Verses can wait until they warm up. End with ad-libs — by then they're unblocked and experimental.`,
    tryNow: 'Set up your mic, your interface, your headphones. Record one pass of yourself speaking ("one two three, one two three") at a normal conversational level. Check the input peak on the track — is it hitting -12 to -6? Adjust interface gain. Listen back: is there room noise? Are there plosives on the "t" sounds? Adjust position and pop filter. Iterate until the raw speech recording sounds clean.',
    youtubeLink: 'https://www.youtube.com/results?search_query=vocal+recording+setup+home+studio',
    glossaryTerms: ['microphone', 'pop-filter', 'plosive', 'sibilance', 'phantom-power', 'condenser-microphone', 'dynamic-microphone', 'input-monitoring', 'dbfs', 'headroom'],
  },
  {
    id: 'vocal-02',
    pathId: 'vocal-production',
    order: 2,
    title: 'Comping a Vocal — Building the Perfect Take',
    goal: 'Use Cycle + Take Folders + Quick Swipe Comping to build one great vocal from three or four good ones.',
    surface: `[[comping]] a vocal is the single highest-leverage move in modern vocal production. The flow:

1. Set a [[cycle]] over a section (Verse 1, for instance).
2. Arm the track. Press R.
3. Let the singer do 3-4 full passes back-to-back without stopping.
4. Stop. Logic has stacked the takes in a [[take-folder]].
5. Open the Take Folder. Use [[quick-swipe-comping]] — drag across the takes to pick the best phrase from each.
6. Listen. Tweak.
7. [[flatten]] when happy. Now you have one clean composite.

The [[take-folder]] keeps the raw takes preserved — you can un-flatten if you change your mind later.

Comp by phrase, not by syllable. Find natural breath points and make your edits there; the splices become invisible. Splice inside a sustained note and you'll hear the edit.`,
    deepDive: `Comping vocals is craft. A few habits from working engineers:

**Track first, comp second.** Don't interrupt the singer mid-take to comment. Let them do 3-4 passes. Then you comp. Singers deliver better when they're in flow; stopping to analyze kills the mood.

**Comp for feel, not just pitch.** The cleanest take isn't always the best. Find the take that sits right emotionally — even if it has a couple of clams. Auto-tune and minor edits fix pitch; nothing fixes a flat performance. Comp soul first.

**The three-phase listening pass.**
1. First pass: listen for the magic lines — "yeah, take 2, line 3." Mark them.
2. Second pass: fill gaps — the mediocre lines. Pick the less-bad option.
3. Third pass: polish the edits — smooth transitions, fade crossovers where needed.

**Crossfade every splice.** Logic auto-fades at swipe boundaries, but sometimes they're too short. Grab the fade handle on either side and extend to 10-20 ms. A smooth crossfade hides almost any edit.

**Don't micro-comp.** Resist the urge to stitch take-1 word, take-2 word, take-3 word across a phrase. The ear hears the stitch. Pick one take per phrase and move on.

**Backing vocals get the same treatment.** Cycle-record 3-4 passes of the harmony. Comp for pitch accuracy and dynamic consistency. BGVs need to be even more uniform than lead, since they stack.

**Ad-libs are different.** For ad-libs, keep multiple takes alive — don't flatten them. You may want to layer them. Drag takes out of the folder onto separate tracks and process them individually.

**[[punch]] for fixes.** After comping, if one word is flat, use punch recording to re-sing just that word. Set punch locators tight, arm, record. Now you have an alternate take of that one word; comp it back into the main take.

**Colour-code by take quality.** After a tracking session, label takes by quality: "Take 2 — green (best)" "Take 1 — yellow (use if no alternative)" "Take 3 — green on bridge only." This speeds later comping.

**The "Adeline rule."** Named for the legendary mix approach: when you're comping and can't decide between two takes on a phrase, pick the one with more ENERGY. Energy is harder to fake than pitch. You can tune pitch; you can't inject energy.

**Comping vs. perfection.**

The modern trap: comp until every breath is identical, every consonant starts on the grid, every note is centered in pitch. That's a beautiful, soulless vocal. The antidote: keep one thing per take that makes it human. A breath too early; a note bent imperfectly; a small crackle in the voice. These are the signatures of a real performance.

**Reference songs.**
- **Whitney Houston — "I Will Always Love You"** — tightly comped, but every nuance preserved. You hear the voice, not the comp.
- **Frank Ocean — "Pink + White"** — feels so single-take it hurts; actually comped extensively. The splices are invisible.
- **Boyz II Men — "End of the Road"** — BGV stacks each comped per-singer, then stacked. A classic 90s vocal production case study.`,
    tryNow: 'Cycle over any eight-bar section. Record four passes of a vocal line back-to-back. Open the Take Folder. Do one comp pass, picking the best phrases. Listen back. Flatten. Count the time it took. That\'s your new baseline for vocal workflow.',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+vocal+comping+take+folder',
    glossaryTerms: ['comping', 'cycle', 'take', 'take-folder', 'quick-swipe-comping', 'flatten', 'composite', 'punch'],
    referenceTracks: ['ref-whitney-ballad', 'ref-frank-ocean', 'ref-boyz-ii-men'],
  },
  {
    id: 'vocal-03',
    pathId: 'vocal-production',
    order: 3,
    title: 'Tuning Vocals with Flex Pitch',
    goal: 'Subtle correction vs heavy-handed. Cents vs semitones. Keep character; fix errors.',
    surface: `Logic's [[flex-pitch]] is a built-in pitch editor. Open a vocal region → Track header → Flex mode → Flex Pitch. Logic analyzes and shows each note as a blob on the Piano Roll.

Each blob has handles:
- Top: drag to change the pitch of the whole note.
- Bottom: drag to reshape vibrato or bend.
- Middle: drag to change volume.

Tuning decisions:

**[[cents]] are the unit.** 1 semitone = 100 cents. Most [[pitch-correction]] work is nudging notes 5-30 cents — small moves that preserve character.

**Snap to scale, not to perfect pitch.** Set the scale in the Flex Pitch editor so Logic knows what key you're in. Now nudging a note up slightly lands it on the nearest in-key pitch.

**Don't quantize everything.** "Snap All" flattens the whole performance onto the grid. It sounds robotic. Manually tune the wrong notes; leave the right ones alone.

**Keep [[formant]] natural.** Aggressive pitch-shifts change formants — a voice gets chipmunky or muddy. Flex Pitch handles this well by default, but extreme moves (more than a semitone) often sound unnatural.

The goal is invisible correction. A listener shouldn't notice you tuned anything. Hit what's flat; leave what's slightly sharp if it sounds alive; preserve vibrato character.`,
    deepDive: `Modern vocal tuning is standard — nearly every commercial vocal is tuned to some degree. The spectrum:

**Subtle (natural).** Nudge wrong notes; leave everything else. The singer sounds like themselves, but in tune. This is the default for gospel, soul, jazz, and tasteful R&B.

**Medium (polished).** Tighten pitch variance across all notes — everything within 10 cents of perfect. Vibrato preserved. This is the pop / modern R&B standard.

**Heavy (T-Pain / modern trap).** Snap every note hard to the scale with very fast tracking. The audible "wobble" between pitches is the effect. This is the Auto-Tune sound — deliberate, creative.

Choose the right level for the song. A ballad wants subtle; a trap hook wants heavy; a soul record wants barely any.

**Flex Pitch workflow in Logic.**

1. Select the vocal audio region.
2. Track header → Flex mode dropdown → Flex Pitch.
3. The region displays note blobs. Click a blob to select.
4. Drag the top of the blob to change pitch. Logic shows cents offset in the info display.
5. Use the Pitch Drift handles (left and right ends of the blob) for pitch bends and vibrato shape.
6. Ctrl+click a blob for "Snap to [key center]" if you want a quick in-key snap.

**Multiple passes.**
- First pass: fix the obviously-wrong notes (off by 20+ cents).
- Second pass: tune the leading edge of long notes (they often start slightly under).
- Third pass: shape vibrato on sustained notes — if the vibrato is uneven, flatten it a bit.
- Don't do a fourth pass. You're overworking.

**Key and scale awareness.**
In Flex Pitch, set the scale in the bottom toolbar to your song's key. Logic now highlights in-key pitches. Nudging a note up moves it to the nearest correct pitch by default.

**When not to tune.**
- Blues singers who bend pitch expressively. Tuning kills the soul.
- Gospel vocal runs that intentionally sit between notes.
- Jazz vocals where the "wrong" note is the right note.

In these cases, check for obvious errors only. Leave the rest.

**Audible tuning artifacts to avoid.**
- **Warble / wobble.** Happens when a vibrato note is tuned too aggressively, the pitch correction fighting the natural vibrato.
- **Formant shift.** If formants sound off after tuning, check Flex Pitch's Formant Preservation — it should be on.
- **Breath clicks.** When tuning words ending in consonants, the pitch correction sometimes clips the consonant's release. Fix by shrinking the note's right edge to just before the consonant.

**Where pitch-correction plugins beat Flex Pitch.**
- Melodyne is the industry-standard separate pitch editor. Smoother algorithm, better formant handling, superior on complex material.
- Auto-Tune for the T-Pain / trap sound. Flex Pitch can do subtle; Auto-Tune owns the audible effect.
- Waves Tune Real-Time for performance-time correction (less relevant for studio work).

**The philosophy.**
Tuning is not about making everything perfect. It's about serving the emotional truth of the performance. A performance that's slightly imperfect but alive beats a perfect one that's dead. Tune to remove obstacles, not to sanitize.`,
    tryNow: 'Open a vocal region. Enable Flex Pitch. Find one note that\'s clearly flat (more than 20 cents low). Drag it up to the right pitch. Compare bypassed vs corrected. Notice how much character stays in the performance — that\'s the job.',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+flex+pitch+vocal+tuning',
    glossaryTerms: ['flex-pitch', 'pitch-correction', 'cents', 'semitone', 'formant'],
  },
  {
    id: 'vocal-04',
    pathId: 'vocal-production',
    order: 4,
    title: 'Vocal Compression — Controlling the Performance',
    goal: 'Use compression on vocals with intent — two-stage chains, appropriate settings, emotional effects.',
    surface: `A well-compressed vocal sits in the mix consistently — whisper to belt, always audible. Without compression, verses disappear and choruses clip.

Starting chain for modern vocals:

**Stage 1: Peak catcher.** Fast [[attack]] (3-5 ms), medium [[release]] (80-120 ms), [[ratio]] 4:1, threshold for 3-4 dB of [[gain-reduction]] on the loudest words only. This catches the biggest dynamic spikes.

**Stage 2: Leveler.** Slower attack (20-30 ms), medium release (100-150 ms), ratio 2:1-3:1, threshold for 2-3 dB of gain reduction on average. This evens everything out.

Together you get 5-7 dB of combined compression — gentle enough to feel natural, heavy enough to keep the vocal present.

Use a [[compression|compressor]] with an Opto character (Logic's Studio VCA → Vintage Opto circuit type) for Stage 2. Opto compressors are famously smooth on vocals.

After compression, [[makeup-gain]] the level back up. A compressed vocal with makeup gain feels "closer" — forward, intimate, professional.`,
    deepDive: `Vocal compression is where recordings become records. Deeper moves:

**Ride the fader first.** Before compression, consider manually automating the vocal fader — 2 dB down on the loudest words, 1-2 dB up on the quietest. This "dynamics at the source" often means you need less compression, and the result feels more natural. [[clip-gain]] achieves the same thing region-by-region.

**Two compressors of different characters.**
The classic two-stage chain pairs characters:
- 1176 (FET, fast, aggressive) for peak catching.
- LA-2A (Opto, smooth, slow) for leveling.

Logic's stock Compressor has plausible emulations of both. Or use the dedicated vintage plugins.

**Settings by vocal style.**

*Intimate ballad vocal* (whisper → full voice dynamics):
- Heavy compression (8-10 dB total).
- Slow attack, medium release.
- Feels invisible because the dynamics were huge to begin with.

*Pop / upbeat vocal* (consistent belt):
- Light compression (3-5 dB).
- Medium attack, fast release.
- Needs less help; the singer already delivered consistent dynamics.

*Rap vocal*:
- Heavy first-stage (5-6 dB) to tame peaks.
- Light second-stage.
- Often followed by a limiter on inserts to catch final transients.

*Gospel lead*:
- Two moderate stages (3-4 dB each).
- Opto character for smoothness across big dynamic range.
- Preserves the emotional build from verse to chorus.

**Automation + compression.**

Compression handles word-to-word dynamics. Automation handles section-to-section dynamics. A well-mixed vocal has both — compression for consistency, automation for arc.

Typical automation: chorus vocal +1.5 dB over verse vocal. Bridge vocal pulled back -1 dB. Final chorus +2 dB.

**Parallel vocal compression.**

See [[parallel-compression]] — send a duplicate to a crushed FET compressor, blend 20-30% under the main vocal. Adds weight without flattening the dynamic.

**Common vocal compression mistakes.**

- **Too much gain reduction.** 10+ dB on a single compressor stage = pumping, breathing, lifelessness. Two stages of 4-5 dB each > one stage of 10 dB.
- **Fast release on a slow vocal.** Ballad vocals want longer release (150-250 ms). Fast release pumps audibly.
- **Threshold too high (missing the dynamics).** If the GR meter barely moves, you're not compressing. You need 3-6 dB of reduction to be useful.
- **No makeup gain.** The compressed vocal sounds quieter than the uncompressed. Add back the level you cut.

**Emotional effects of vocal compression.**

Light compression preserves dynamics — emotion rises and falls with performance. Heavy compression flattens dynamics — every word the same presence, every emotional moment muted. The right amount depends on the song.

For ballads: heavy compression (8-10 dB total) because the dynamic range is huge, and you want every whispered word audible. For upbeat pop: light compression, trust the performer.

For gospel leads that go from conversational to full-voice belt: two moderate stages preserving the emotional arc while keeping every word in the mix.

**Reference songs.**
- **Whitney Houston — "I Will Always Love You"** — heavy compression, every breath uniform. The gold standard.
- **Mariah Carey — "Vision of Love"** — similar heavy but smooth approach.
- **Tyrese — "How You Gonna"** — modern R&B compression. Pushed forward, felt close.
- **Babyface-produced Toni Braxton ballads** — classic 90s R&B compression. Smooth, warm, always present.
- **Kendrick Lamar — "HUMBLE."** — modern rap compression. Aggressive peak-catching, heavy limiting.`,
    tryNow: 'On a vocal take, insert Logic\'s Compressor. Set Circuit Type to Vintage Opto. Ratio 3:1, attack 20 ms, release 100 ms. Lower threshold until you see 3-4 dB of gain reduction on louder words. Add 3 dB makeup gain. A/B bypassed. You should hear the vocal "lock in" without feeling squashed.',
    youtubeLink: 'https://www.youtube.com/results?search_query=vocal+compression+logic+pro+tutorial',
    glossaryTerms: ['compression', 'threshold', 'ratio', 'attack', 'release', 'gain-reduction', 'makeup-gain', 'parallel-compression', 'clip-gain'],
    referenceTracks: ['ref-whitney-ballad', 'ref-babyface-ballad'],
  },
  {
    id: 'vocal-05',
    pathId: 'vocal-production',
    order: 5,
    title: 'De-essing — Taming Sibilance',
    goal: 'Reduce harsh S and Sh sounds without making the singer lisp.',
    surface: `[[sibilance]] — the harsh S, Sh, and Ch consonants that spike around 6-10 [[kilohertz|kHz]] — gets exaggerated by everything downstream: EQ boosts, compression, bright reverb. Without a de-esser in the chain, modern vocal processing makes every S into an ice-pick.

A [[de-esser]] is a specialised compressor that only reduces high-frequency energy. It listens for sibilance, clamps down briefly when it detects one, and releases.

Logic's de-esser:

1. Insert DeEsser 2 on the vocal track (after EQ, before the main compressor).
2. Sweep the Frequency through 5-10 kHz while listening to the vocal. Find where the S is loudest.
3. Lower the Threshold until the GR meter shows 3-6 dB on sibilant moments.
4. [[ratio]] 3:1-5:1 for subtle; 8:1+ for aggressive.
5. A/B: bypass the plugin. The S's should soften, but words should still read correctly.

Rule: if the vocal starts sounding lispy ("he saysh"), you're over-de-essing. Back off.`,
    deepDive: `De-essing is a small tool with outsized impact. Deeper details:

**Where in the chain.**
Typical order:
1. EQ
2. **De-esser**
3. Compressor
4. Saturation (if any)
5. Sends (reverb, delay)

The de-esser goes before the main compressor so the compressor doesn't get triggered by sibilance (which would cause dips on every S). Some engineers prefer it after — experiment.

**Frequency detection.**
Every singer sibilates at a different frequency. Men often peak around 5-7 kHz; women 7-9 kHz; bright voices up to 10 kHz. Find the exact frequency by sweeping with a narrow EQ boost first — solo the sibilance and you hear exactly where it lives.

Logic's DeEsser 2 has a Monitor Sibilant button that solos the detected sibilance — very useful for dialing the frequency.

**Dynamic de-essing vs static cuts.**
- **Static cut**: notch EQ at the sibilance frequency, 3-4 dB cut. Always on. Kills sibilance even when there isn't any, thinning the vocal.
- **Dynamic de-essing**: only cuts when sibilance is present. Vocal stays full-sounding; sibilance gets clamped on the spots that need it.

Always use dynamic de-essing unless the vocal has a persistent high-frequency problem (like room noise).

**Multi-band de-essing.**
Some de-essers operate in multiple bands — one for lower sibilance, one for upper. Dynamic EQ plugins (Pro-Q with dynamic mode, Soothe2) can do even more surgical work. For most vocals, Logic's DeEsser 2 is enough.

**Soothe2 / dynamic EQ tricks.**
Advanced: Soothe2 analyses the vocal and dynamically cuts the frequencies it detects as resonant or harsh — not just sibilance. A vocal run through Soothe2 often doesn't need a dedicated de-esser. Over-processed on aggressive settings, it flattens character; subtle settings add polish.

**Common de-essing mistakes.**
- **Over-de-essing → lispiness.** If "sixty-six" becomes "thikty-thix," you've cut the S too hard. Back off the threshold.
- **Wrong frequency.** If you're reducing 6 kHz but the sibilance is at 8 kHz, you've done nothing. Use the solo/monitor mode to find the real frequency.
- **Ratio too high.** A ratio of 20:1 on an S turns it into a thunk. Start at 4:1.
- **De-essing before tracking.** You can't de-ess what isn't there. Don't add brightness in pre-tracking EQ and then try to fix sibilance — don't create the problem.

**Modern multi-stage de-essing.**

Aggressive modern productions sometimes use two de-essers in series:
1. First de-esser on insert — catches the biggest peaks.
2. Second de-esser before reverb send — prevents sibilance from hitting the reverb (which exaggerates it further).

This chain is typical on heavily-processed pop productions.

**When to skip de-essing.**

- Low-gain dynamic mic recordings often don't sibilate much. If the raw vocal has no problem, don't invent one.
- Some character vocals (T-Pain's auto-tuned sibilance, for instance) are stylistic. Don't kill them.
- Some genres (lo-fi, boom-bap rap) embrace sibilance as texture.

The question is always: does the sibilance hurt the mix? If yes, de-ess. If no, leave it alone.

**Reference songs.**
- **Any Babyface production** — de-essing invisible but always present. You can tell because nothing ever cuts through harshly.
- **Modern R&B leads (H.E.R., Daniel Caesar)** — polished sibilance management, high-frequency detail preserved.
- **Late-stage Whitney — "I Have Nothing"** — listen to how controlled her S's are through massive dynamic range. Meticulous de-essing.`,
    tryNow: 'On your vocal track, after EQ and before compression, insert DeEsser 2. Play the vocal and listen for the worst S. Sweep the detection frequency until you find where the S is loudest. Lower threshold until 3-4 dB of gain reduction happens on that S. A/B it. The word should still be clearly "Sunday" — the S softer, not absent.',
    youtubeLink: 'https://www.youtube.com/results?search_query=de-esser+logic+pro+vocal+tutorial',
    glossaryTerms: ['de-esser', 'sibilance', 'kilohertz', 'ratio', 'eq'],
  },
  {
    id: 'vocal-06',
    pathId: 'vocal-production',
    order: 6,
    title: 'Reverb for Vocals — Choosing the Right Space',
    goal: 'Pick the right reverb style, place it on a send, and tune it so it adds depth without drowning the vocal.',
    surface: `Vocal reverb is the single biggest "feels professional" move in a mix. Done well, it glues the vocal into the track and adds emotional depth. Done poorly, it smears and distances.

Always use reverb on a **[[send]]** (never as a direct insert on the vocal track). One [[auxiliary-track]] with your reverb, fed by a send from the vocal. Keep the send post-fader.

Genre-appropriate choices:

- **Classic soul / gospel ballad** → [[plate-reverb]], decay 1.5-2.0 s, pre-delay 25-40 ms.
- **Modern R&B** → short plate or small room, decay 0.8-1.2 s, generous pre-delay.
- **Pop ballad** → medium plate, decay 1.8-2.5 s, high pre-delay (50-80 ms) so the dry vocal stays punchy.
- **Hip-hop / rap** → often very dry, just a hint of room.
- **Worship / gospel choir** → hall, decay 2.5-4.0 s, shared across all choir parts.

Key moves:

**[[pre-delay]] 25-40 ms.** Keeps the dry vocal clear, then the reverb blooms.

**Cut the lows.** EQ the reverb return: high-pass at 300 Hz so the reverb doesn't add bass mud.

**Cut the highs in bright reverbs.** If the reverb is piercing, low-pass around 8-10 kHz.

**Send level at -18 dB** as a starting point. Adjust taste. You should feel the reverb in the mix, not hear it clearly.`,
    deepDive: `Vocal reverb is an entire craft inside mixing. Deeper moves:

**Two vocal reverbs — short and long.**

A working engineer often runs two vocal reverbs:
- **Short reverb** (0.8 s plate) — glues, adds intimacy, doesn't distance.
- **Long reverb** (2.5+ s plate or hall) — for emotional moments, ad-libs, ends of phrases.

A single vocal can send to both in different amounts depending on the section. Verse: mostly short. Chorus: short + a touch of long. Final chorus: both pushed. Ad-lib "yeah": mostly long.

**Pre-delay math.**

The classic trick: set pre-delay to match a musical interval (usually 1/8 or 1/16 at song tempo). The reverb bloom then lands on a beat rather than mushing into the dry.

At 80 BPM: 1/16 note = 187 ms. Pre-delay at 187 ms and the reverb "feels" tempo-locked.

Most pop productions use shorter pre-delays (20-50 ms) for cleaner dry-signal articulation.

**Separate reverbs for lead and BGVs.**

- Lead vocal: short plate, subtle, keeps the lead intimate.
- BGVs: larger space, longer decay, often a chamber or hall.

The contrast makes the lead feel immediate and the BGVs feel like an enveloping room. Gospel and 90s R&B productions are masters of this.

**Reverb EQ.**

Always EQ your reverb return. Typical settings:
- High-pass at 200-400 Hz (kill bass mud).
- Cut 1-2 dB at 4-5 kHz (if the reverb competes with the vocal's presence range).
- Optional low-pass above 10 kHz for a darker, vintage tone.
- Optional notch at 500-800 Hz if the reverb sounds "boxy."

This EQ lives on the reverb aux, not the source. You're shaping only what the reverb adds.

**Gating the reverb.**

Gated reverb (short reverb, quick gate cut-off) was the 80s drum sound. On modern vocals it's rare, but a subtle gate on the reverb return can be used to make the reverb appear only during the phrase, then cut sharply. Useful in hip-hop.

**Compression on the reverb.**

Compressing the reverb return 2-3 dB evens out the reverb bloom. Often makes it sit more consistently in the mix. A little aggressive compression on the reverb creates the "pumping reverb" effect — every vocal hit pulls back, then the reverb swells between hits. Dramatic.

**Reverb sidechain.**

Sidechain-compress the reverb return to the dry vocal. Every time the vocal sings, the reverb ducks. When the vocal stops, the reverb blooms into the space. This is how you get the "reverb only in the silences" effect — huge without smearing the vocal.

**When reverb is wrong.**

- **Too much wet/dry** — vocal feels distant. Pull the send down.
- **Long decay, no pre-delay** — vocal smears. Add pre-delay.
- **Bright reverb on an already-bright vocal** — harshness. Low-pass the reverb return or pick a warmer algorithm.
- **Reverb on every vocal** — kills space. Sometimes a dry vocal with no reverb is the right choice for intimacy (contemporary R&B ballads often lean almost dry).

**Genre reference.**
- **Babyface productions** — classic plate, 1.6 s decay, 30 ms pre-delay. Every Boyz II Men / Toni Braxton ballad.
- **Kirk Franklin choir** — hall on the choir, plate on the lead. The contrast creates that "preacher + congregation" architecture.
- **Frank Ocean — "Pink + White"** — minimal reverb on the lead, big room feel on background. Modern production; less is more.
- **Donny Hathaway live records** — real room sound. Nothing added. Feels intimate and enormous at the same time.

**The practical template.**

Build it into your session template:
1. Aux "Vocal Plate Short" — ChromaVerb, Plate, 1.2 s decay, 25 ms pre-delay. HPF 300 Hz. -6 dB output.
2. Aux "Vocal Plate Long" — ChromaVerb, Plate, 2.5 s decay, 50 ms pre-delay. HPF 300 Hz. -8 dB output.
3. Route lead vocal sends to both at -20 to -12 dB depending on section.
4. BGV bus to its own reverb (Chamber or Hall, longer decay).

Every song starts with this architecture. You tune the send levels per section.`,
    tryNow: 'Create two aux buses. Load ChromaVerb on both — one set to Plate, 1.2 s decay, 30 ms pre-delay; the other Plate, 2.5 s decay, 50 ms pre-delay. HPF each return at 300 Hz. Send your lead vocal to the short at -18 dB for the whole song, and the long at -24 dB only on the last chorus. A/B the bypass. You should feel the vocal move closer (dry sections) and further (wet ad-lib moments).',
    youtubeLink: 'https://www.youtube.com/results?search_query=logic+pro+vocal+reverb+tutorial',
    glossaryTerms: ['reverb', 'send', 'auxiliary-track', 'plate-reverb', 'hall-reverb', 'chromaverb', 'pre-delay', 'decay', 'wet-dry'],
    referenceTracks: ['ref-babyface-ballad', 'ref-kirk-franklin', 'ref-frank-ocean'],
  },
  {
    id: 'vocal-07',
    pathId: 'vocal-production',
    order: 7,
    title: 'Background Vocal Stacks — Building Lush Harmonies',
    goal: 'Record, pan, and process BGVs so they thicken a chorus without crowding the lead.',
    surface: `[[background-vocals|BGVs]] are what make a mix feel dense and professional. The lead is the soloist; BGVs are the building.

The basic stack:

1. Sing each harmony line two or three times as doubles (same note, same line, multiple takes).
2. Comp each line for tightness.
3. Pan: lowest harmony hard left, mid harmony center-left, highest harmony center-right, optional fifth stack hard right. Mirror if needed.
4. High-pass more aggressively than lead (120-150 Hz) so BGVs don't crowd the bass.
5. Cut the vocal's presence range (3-5 kHz) slightly — leaves room for the lead.
6. Group all BGV tracks into a bus. Apply light compression (2-3 dB) to the bus for glue.
7. Send the bus to a reverb with more decay than the lead's reverb.

The result: a wall of harmony that feels wide, full, and supportive — without competing for the lead's attention.`,
    deepDive: `Background vocal stacks are a craft unto themselves. A few deeper techniques:

**Track layers, not single passes.**

For each harmony note:
- Two unison doubles (same pitch, same line).
- One octave-up double for sparkle (optional).
- One fifth-below double for body (optional).

That's 3-4 tracks per harmony line. For a three-part stack (high, mid, low), you might have 9-12 total BGV tracks. Pan them across the stereo field, compress the sum, and they become a wall.

**Panning architecture.**

A classic stereo spread for a chorus BGV stack:
- Low harmony: -40 (left)
- Mid harmony: -15 (left-center)
- High harmony: +15 (right-center)
- Optional top line: +40 (right)

Mirror the doubles:
- Low double A: -60; double B: -20
- High double A: +60; double B: +20

This fills the stereo field without anything clumping in the center.

**Pitch processing per part.**

BGVs should be TIGHTER in pitch than the lead. A slightly off-pitch BGV is much more noticeable than a slightly off-pitch lead, because stacks rely on close harmonic integrity.

Run BGVs through [[flex-pitch]] or Melodyne with slightly more aggressive tuning than the lead. Some engineers use Auto-Tune Low Latency mode on BGVs — fast correction invisible in mid-mix.

**EQ per part vs EQ on the bus.**

Balance: small EQ per track (clean up mud), larger EQ on the bus (carve the overall stack).

Typical bus EQ:
- High-pass 150-200 Hz (more than the lead's 80-100 Hz).
- Cut 2-3 dB at 3-5 kHz (clear space for the lead's presence).
- Small air shelf at 12 kHz (BGVs love air).

**Compression on the BGV bus.**

A compressor on the bus (2:1 ratio, 3-5 dB gain reduction) glues the stack together. Often followed by a second, gentler compressor for extra evenness. The goal: every note of the stack sits at the same level, feels like one entity.

**Reverb for BGVs.**

BGVs want a different reverb than the lead. Typical: a chamber or hall on the BGV bus (2-3 s decay), where the lead goes to a shorter plate. The BGVs surround; the lead stays forward.

Often the BGV reverb is also slightly darker than the lead's. A [[low-pass-filter]] at 8-10 kHz on the BGV reverb return keeps them feeling "further back."

**The gospel choir technique.**

Gospel choir stacks take BGVs to an extreme:
- Each choir part (sopranos, altos, tenors, basses) gets 3-5 unison doubles.
- Parts are panned wide (sopranos right, basses left, altos and tenors centered).
- Heavy compression on the choir bus for unity.
- Hall reverb for architectural space.
- Sometimes a slight chorus plugin on the bus for width and movement.

Kirk Franklin's choir productions are the masterclass. Listen to "Stomp" — the choir feels like 50 people, but it's maybe 8 actual voices stacked.

**Modern R&B BGV style.**

Less stacked than 90s — maybe 2-3 harmony lines with 2 doubles each. Heavy pitch-correction for tightness. Often heavy saturation for a tape-ish warmth. Frank Ocean and Daniel Caesar are good references.

**The "choir in a hall" trick.**

To make any small BGV stack feel huge: bus them, apply a hall reverb send (long decay), and a subtle chorus plugin. The chorus adds tiny pitch and time differences that simulate more voices than you recorded.

**Common BGV mistakes.**

- **Recording only one double.** A single BGV take sounds thin. Minimum two doubles per part.
- **BGVs louder than lead.** They should support, not compete.
- **Same reverb as lead.** BGVs want their own space, further back than the lead.
- **Same high-pass as lead.** BGVs need more aggressive low-cut so they don't muddy the bass region.
- **No pitch correction.** Stacks are unforgiving of small pitch variance.

**Reference songs.**
- **Boyz II Men — "End of the Road"** — the gold standard of 90s R&B BGV production.
- **Kirk Franklin — "Stomp"** — modern gospel choir BGV production.
- **Donny Hathaway — "The Ghetto"** — live feel, looser stacks, full of character.
- **Frank Ocean — "Nikes"** — modern restraint; fewer layers, more processing.
- **H.E.R. — "Focus"** — contemporary approach, tight tuning, wide pan.`,
    tryNow: 'Pick a chorus you\'ve been working on. Add three BGV tracks. Sing the root, the third, and the fifth of the main melody. Do two takes each. Pan them across the stereo field (hard left, center, hard right). Bus them. Insert a compressor at 2:1 ratio, 3 dB of GR. Send the bus to a reverb with 2 s decay. You\'ve built a wall.',
    youtubeLink: 'https://www.youtube.com/results?search_query=background+vocal+stacks+production+tutorial',
    glossaryTerms: ['background-vocals', 'bgv', 'stacking', 'double', 'pan', 'stereo-field', 'flex-pitch', 'send', 'auxiliary-track', 'hall-reverb', 'plate-reverb'],
    referenceTracks: ['ref-kirk-franklin', 'ref-boyz-ii-men'],
  },
  {
    id: 'vocal-08',
    pathId: 'vocal-production',
    order: 8,
    title: 'Parallel Compression on Vocals',
    goal: 'Set up New York compression on a vocal — add weight and density without flattening the performance.',
    surface: `[[parallel-compression]] (also called [[new-york-compression]]) is when you send a copy of your vocal to a heavily-compressed bus and blend it quietly underneath the original. The lead keeps its dynamics; the parallel copy adds body and presence.

Setup in Logic:

1. Create an [[auxiliary-track]] called "Vocal Parallel."
2. Insert a [[compression|compressor]] set aggressively: [[ratio]] 8:1, fast [[attack]] (1 ms), medium [[release]] (100 ms), threshold for 10-15 dB of [[gain-reduction]]. Use the FET circuit for character.
3. On your lead vocal track, add a send to the Vocal Parallel bus.
4. Start the send at -18 dB.
5. Pull the parallel bus fader up until you just barely hear it underneath the lead.

The lead should still feel dynamic. The parallel bus is almost imperceptible on its own — but when you mute the bus, the lead suddenly feels thinner.

That's the trick. You don't hear parallel compression; you hear its absence.`,
    deepDive: `Parallel compression is where many "pro-sounding" vocals get their secret weight. Deeper details:

**Why it works.**

A normal compressor pushes dynamics DOWN — louder words get softer. A parallel compressor processes a duplicate that's essentially all louder-words-level; the original's dynamics stay untouched. Blending them adds body from the crushed version while preserving energy from the dry.

You get the perceived loudness of heavy compression with the dynamic life of a light-handed mix. The best of both.

**The right compressor for parallel.**

FET-style compressors (1176 emulations) work best for parallel on vocals. They're fast, coloured, and impose a character that works underneath the lead. Logic's Studio FET or Vintage FET circuits on the Compressor plugin are the go-to.

Settings:
- Ratio: 8:1 (or the 1176's "All Buttons" mode for the craziest crush).
- Attack: fastest the plugin allows.
- Release: fast-medium.
- Threshold: low enough for 10-15 dB of gain reduction on every word.

**How much to blend.**

Start with the parallel bus fader at -inf (silent). Slowly push it up while the lead plays. You'll notice:
- At first, nothing.
- Suddenly, the vocal starts feeling "fuller" without sounding louder.
- A little further and it starts sounding compressed.

Stop at "fuller" — usually 5-10 dB below the lead level.

**EQ on the parallel bus.**

Often the parallel bus wants slight EQ:
- Cut some bass (high-pass at 150-200 Hz) — the crushed copy adds mud in the lows.
- Small boost at 3-5 kHz — parallel adds presence.
- Light saturation after the compressor for even more character.

**Parallel + reverb.**

Some engineers put a touch of reverb on the parallel bus after the compressor. The reverb gets crushed along with the vocal, creating a thick, textured parallel. Very modern R&B.

**Parallel on BGVs.**

Same concept. A crushed parallel BGV bus blended with the clean BGV bus adds wall-like density. Gospel choir productions lean on this heavily.

**Parallel on drums (tangent).**

The same technique works on drums — the "New York" name comes from NY rock / R&B studios of the 80s where drum parallel compression became the signature. Send all drums to a bus, crush with an 1176 or a Distressor, blend underneath. Kick feels huge; snare cracks; cymbals breathe.

**When parallel isn't the right move.**

- If the vocal is already heavily compressed, parallel adds mush. Choose one or the other.
- On a clean pop vocal with good dynamics, parallel can flatten the emotion. Subtle automation might be better.
- On lo-fi / dry aesthetic productions, parallel feels too polished.

**Side-chain parallel.**

Advanced: the parallel bus gets side-chained to the dry vocal. When the lead sings, the parallel stays fairly quiet. When the lead stops, the parallel blooms behind. Creates the "vocal ghost" effect behind the main.

**Reference songs.**
- **Frank Ocean vocal productions** — heavily parallel-compressed vocals; the lead feels huge without sounding crushed.
- **Tyler, The Creator — IGOR album** — lots of parallel compression on the vocals, often intentionally obvious.
- **SZA — "The Weekend"** — parallel-compressed vocal on the hook. You can hear the density.
- **Beyoncé — "Drunk in Love"** — heavy parallel on both the lead and ad-libs.`,
    tryNow: 'Create a "Vocal Parallel" aux. Insert Logic\'s Compressor, pick Vintage FET. Set ratio 8:1, attack 1 ms, release 50 ms, threshold for 10-15 dB gain reduction. Send your vocal to this aux at -15 dB. Pull the aux fader from silent up slowly while the vocal plays. Stop when the vocal feels "fuller" but not "compressed." Mute the aux. Hear the lead thin out. That\'s parallel compression doing its job.',
    youtubeLink: 'https://www.youtube.com/results?search_query=parallel+compression+vocal+new+york',
    glossaryTerms: ['parallel-compression', 'new-york-compression', 'compression', 'ratio', 'attack', 'release', 'gain-reduction', 'auxiliary-track'],
    referenceTracks: ['ref-frank-ocean', 'ref-daniel-caesar'],
  },
];

// ------------------------------------------------------------------

export const PRODUCTION_LESSONS: LessonContent[] = [
  ...WORKFLOW,
  ...LANGUAGE,
  ...VOCAL,
];

export function lessonById(id: string): LessonContent | undefined {
  return PRODUCTION_LESSONS.find(l => l.id === id);
}

export function lessonsByPath(pathId: string): LessonContent[] {
  return PRODUCTION_LESSONS
    .filter(l => l.pathId === pathId)
    .sort((a, b) => a.order - b.order);
}
