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
// Path 4: Genre Productions (22 lessons, 11 two-session arcs)
// Session A = guided reference build; Session B = user's own version.
// ------------------------------------------------------------------

const GENRE: LessonContent[] = [
  // Arc 1 — 6/8 Church Beat for Gospel Freestyle ------------------
  {
    id: 'gen-01a',
    pathId: 'genre-productions',
    order: 1,
    title: 'Build a 6/8 gospel beat (guided)',
    goal: 'Build a church-beat gospel groove at 60-75 BPM in 6/8, ready for a freestyle lead.',
    surface: `6/8 gospel is what church plays when the preacher leaves an altar call open. The tempo is slow, the subdivision is rolling, and every bar has the weight of a breath.

Tempo: 60-75 BPM. [[time-signature]] 6/8. You'll count "one-two-three-four-five-six" per bar and feel it as two groups of three.

Instrumentation: piano on the changes, [[hammond-organ]] swelling underneath, [[rhodes]] or second piano filling, electric bass walking, drums laying a patient groove. No strings yet — add those in Session 2 if you want lift.

Build order:
1. **Chord bed first.** Pick a key comfortable for the singer. Four-chord progression is plenty. Traditional gospel loves I - IV - V and I - vi - IV - V. Play the chords on piano in root position — no flashy voicings yet.
2. **Bass.** Root notes on beat 1 of each bar, walking up to the next chord across beats 4-5-6. This is the most important move.
3. **Drums.** Kick on 1, snare/clap on 4. Hi-hat rolling [[triplet]]s or eighth-notes. Tambourine on 4 if it's a fuller arrangement. Restraint — you're not driving a freeway.
4. **Organ.** Sustained whole-bar chords behind the piano. Think of it as air, not notes.
5. **Second keyboard.** [[rhodes]] or EP with sparse stabs — only enter between vocal lines, never during them.

The whole thing should feel like it's breathing, not pushing. The vocal will carry energy; your job is to make a bed that lets the vocal soar without shoving.`,
    deepDive: `Why 6/8 works for church: it mirrors breath. Your inhale and exhale aren't a perfect square; they have a rise and a fall. 6/8 with its triplet subdivision feels the same way. That's why the form lives in worship music across traditions, not just Black American gospel.

Listening assignments for your build session:
- Richard Smallwood, "Total Praise." Listen for how patient the piano is. The left hand plays root-5 shapes on the lower half of the bar; the right hand voices the chord slightly later.
- Donnie McClurkin, "We Fall Down." The drums are almost conversational. Try to make yours feel like that — not martial, not pushy.
- Yolanda Adams, "Open My Heart." Jam & Lewis prove 6/8 can carry polished R&B production. Hear how modern it sounds while still being deeply church.

Common mistakes to avoid:
- **Playing every beat.** 6/8 wants you to leave beats 2, 3, 5, and 6 relatively empty compared to 1 and 4. When in doubt, take something out.
- **Rushing the drums.** A gospel drummer pushes the pocket when the preacher pushes; otherwise, they sit behind. Program your drums to sit behind the grid by 3-5 ticks.
- **Too much reverb on everything.** Church has natural room sound. Use it — a medium hall on drums, plate on lead vocal — but don't drown the rhythm section. The bed should feel present.

Voicings matter here more than in most genres. A I chord in gospel isn't just root-3-5; it's often root-3-5-7-9, voiced across both hands. If you're new to voicings, start with simple chords and come back to this after you've learned more harmony.

One more key move: the [[vamp]]. Gospel songs usually end by locking on the last chord (or two chords) and letting the vocal improvise for a while. Arrange your track so it has a built-in vamp section. That's where the freestyle lives.`,
    tryNow: 'Open an empty Logic session. Create a 16-bar loop at 65 BPM in 6/8 with the build order above: piano chords, bass, drums (kick on 1, snare on 4, rolling triplet hi-hats), organ swells, sparse Rhodes. Set a vamp section at bar 17-24 where only the last two chords repeat. Stop when the bed feels like it could support a freestyle without fighting it.',
    youtubeLink: 'https://www.youtube.com/results?search_query=how+to+make+a+6%2F8+gospel+beat',
    glossaryTerms: ['six-eight', 'time-signature', 'triplet', 'vamp', 'rhodes', 'pocket', 'ghost-note'],
    referenceTracks: ['ref-kirk-franklin'],
  },
  {
    id: 'gen-01b',
    pathId: 'genre-productions',
    order: 2,
    title: 'Create your own 6/8 gospel beat',
    goal: 'Apply Session 1 to build your own original 6/8 gospel groove.',
    surface: `Your turn. You've heard how 6/8 gospel breathes; now make one of your own.

This isn't a prescribed step-by-step. Use whatever workflow feels natural. The reference session showed you the vocabulary; now write a sentence.

Starting points:
- Pick a key that suits your voice or a singer you know.
- Decide on a 4-chord progression that wants to loop. If it feels like it's asking for another chord, keep writing.
- Set your tempo in the 60-75 BPM range. Under 60 feels heavy; over 75 loses the church feel.
- Build your bed in any order that works for you. Some producers start with drums; some start with piano.

Checklist for review when you're done:
- [ ] Does it breathe in 6/8, or does it feel like disguised 4/4?
- [ ] Does the piano have room for a vocalist to live?
- [ ] Is the groove patient, or is the drummer rushing?
- [ ] Is there a built-in vamp where a lead could go off?
- [ ] Could you play this bed for a live vocalist without the track fighting them?

Reference tracks to inspire (listen, don't copy):
Check your Reference Track Library for 6/8 Gospel picks — specifically "Total Praise," "Open My Heart," and any church-beat tracks you've added yourself.`,
    deepDive: `A few things to try if your build feels stuck:

**Harmony feels flat?** Try a ii-V-I or a I-iii-IV-V progression. Gospel uses diatonic sevenths and ninths generously. A simple IV chord with a 9 added can lift a whole section.

**Drums feel stiff?** Quantize your MIDI to 6/8 triplet grid, then pull your snare back by 5-10 ticks. The snare leading the groove is the biggest giveaway that a beat is programmed; pulling it back makes it feel played.

**Missing the church-iness?** A sustained organ pad through the whole bed is the single most-church move you can make. Logic's Vintage B3 or the included Swell Organ patch work well. Keep it quiet — think of it as air conditioning, not a feature.

**Too busy?** Try muting everything but piano and bass, then adding drums back in, then building up again. Sometimes a full arrangement wants to be stripped down before it becomes whole.

**Need a vamp?** A vamp is where you lock on two chords (often the vi and I, or the IV and I) and let the lead singer testify. Build yours long — 16 to 32 bars minimum. That's where the emotional climax of church music happens.

Save and share. If you have a vocalist friend, send them the bed and see what they do with it. The best gospel tracks come out of conversations between producer and singer, not from a producer alone.`,
    tryNow: 'Build an original 6/8 gospel bed in Logic. Aim for 24 bars minimum with a clear vamp section. Export as a 320 kbps MP3 and listen on your phone speakers — if it still sounds like church, you got it.',
    youtubeLink: 'https://www.youtube.com/results?search_query=gospel+freestyle+beat+6%2F8',
    glossaryTerms: ['six-eight', 'vamp', 'triplet', 'pocket'],
  },

  // Arc 2 — 90s/00s Gospel Choir Arrangement ----------------------
  {
    id: 'gen-02a',
    pathId: 'genre-productions',
    order: 3,
    title: 'Build a 90s gospel choir arrangement (guided)',
    goal: 'Arrange a Kirk Franklin / Fred Hammond-era choir section with layered parts, ad-libs, and a full rhythm section.',
    surface: `The 90s gospel choir sound is the result of two things: tight arrangements (every voice has a part) and aggressive group-vocal stacking (each part is doubled or tripled).

Tempo: 85-105 BPM. [[time-signature]] 4/4 (not 6/8 — save that for Arc 1).

Build order:
1. **Rhythm section first.** [[kick]] on 1 and 3, [[snare]] on 2 and 4, hi-hat patterns that shift subtly between sections. Bass mostly on the root with tasty runs into chord changes. Piano and Rhodes comping — this is church, but it's also R&B.
2. **Draw the choir parts.** Soprano, alto, tenor, bass. You need all four. Write them out on paper or in a DAW MIDI track. The four parts should form tight voicings — often shell voicings (root-3-7) or rootless voicings (3-5-7-9).
3. **Record or program each part on its own track.** Whether you're singing them, programming with a vocal sample library, or using a virtual choir instrument, each part gets its own channel.
4. **Double each part.** Record each part twice. Pan the first recording left, the second right. That's already a four-voice choir sounding like eight.
5. **Add a lead.** Kirk's role isn't lead-throughout — it's the call that the choir answers. Record your lead vocal dry, close, and forward.
6. **Bus compress the choir.** Send all choir tracks to a bus. Put moderate [[compression]] (3-4:1 ratio, slow attack, medium release) on the bus. This glues the voices.

The final sound: a cohesive choir that feels huge without any one voice poking through, with Kirk's (or your lead's) voice conversationally in front.`,
    deepDive: `The secret of the Kirk Franklin sound isn't the choir — it's the [[call-and-response]] architecture. Kirk isn't singing lead the whole time. He says a line, the choir answers. That's how church has always worked. Modern R&B lost this; gospel kept it.

When you're writing your choir parts, think of them as characters:
- The soprano is the sparkle. Higher, louder, cutting through.
- The alto is the warmth. Middle-range, plenty of body.
- The tenor is the texture. Sits between alto and bass, adds density.
- The bass is the weight. Anchors the whole stack harmonically.

Voicings: use close voicings for "choir singing as one instrument" sections, open voicings for "choir as full congregation" sections. Arrangement literacy here is everything. If you haven't studied four-part vocal writing, "Let It Be" and "Lean on Me" are great places to start.

**Ad-libs.** Kirk's ad-libs are a character unto themselves. They're short, rhythmic, and placed between phrases — never over them. When you add ad-libs to your track, record them AFTER the choir is done. Listen to the space between choir phrases; that's where ad-libs live.

**Bus compression glue.** Without it, choirs sound like a bunch of individual tracks. With it, they sound like one instrument. Try the Logic Vintage VCA on the choir bus, 3:1 ratio, 10 ms attack, 100 ms release, aiming for 2-3 dB of gain reduction during the loudest passages. Don't compress any harder than that — you'll lose the feel.

**Reverb architecture.** Choir gets a hall reverb (2-3 second decay) sent via an aux. Lead vocal gets a shorter plate (1.4-1.8 seconds). The contrast is what makes the lead feel close and the choir feel architectural. If both get the same reverb, the lead gets swallowed.

Listening homework: "Stomp" for modern choir; "Now Behold the Lamb" for classic Kirk; "Glory to the Lamb" for Fred Hammond's quartet-rooted approach.`,
    tryNow: 'Program or record a four-part choir section (soprano, alto, tenor, bass) singing one 8-bar phrase in close harmony. Double each part, pan them 60% L/R, send all to a Choir Bus, and apply the compression and reverb settings from the deep dive. Then add a dry lead call that answers the choir on beats 3-4 of each bar. Mix it so the choir feels wide and the lead feels close.',
    youtubeLink: 'https://www.youtube.com/results?search_query=how+to+produce+like+kirk+franklin',
    glossaryTerms: ['call-and-response', 'compression', 'parallel-compression', 'plate-reverb', 'hall-reverb', 'auxiliary-track', 'bus', 'pan', 'vocal-doubling'],
    referenceTracks: ['ref-kirk-franklin'],
  },
  {
    id: 'gen-02b',
    pathId: 'genre-productions',
    order: 4,
    title: 'Create your own gospel choir arrangement',
    goal: 'Arrange your own original choir section using the Session 1 approach.',
    surface: `Time to write your own choir. You don't need eight singers to pull this off — a vocal sample library or a virtual choir plugin gets you most of the way. What you do need is four clear parts and a plan for what the choir answers.

Starting points:
- Decide: what is the choir saying, and what is the lead asking? Call-and-response is the structural DNA.
- Sketch your four parts on paper, a piano, or a MIDI track. Every part should be singable. If it's unsingable, it won't sound human.
- Find your reference track. A specific song you're pulling energy from — Kirk, Fred Hammond, Donnie McClurkin, Hezekiah Walker, Walter Hawkins.

Checklist when you're done:
- [ ] Four voice parts that make sense on their own AND together?
- [ ] Bus-compressed enough to feel glued?
- [ ] Lead placed forward with shorter reverb than the choir?
- [ ] Ad-libs in the spaces, not over the main phrases?
- [ ] Room for the rhythm section to breathe underneath?`,
    deepDive: `Some variations worth trying:

**The "shout" section.** A faster, higher-energy section where the drums double-time, the organ swells, and the choir goes up an octave. This is the climax of a lot of gospel songs. Arrange one into yours.

**The breakdown.** A section where everything drops out except the lead and one sustained instrument (often organ or bass). Even 2 bars of breakdown makes the return of the full arrangement feel huge.

**The key change.** Modulating up a whole step for the final chorus is a classic gospel move. Feels cheap when overused; feels earned when the arc has built to it.

Troubleshooting:
- **Choir sounds thin?** Add a third doubling to each part (so you have 12 tracks for 4 parts). Pan them at different positions for width.
- **Choir sounds too "stacked"?** Pull one or two of your doublings down a few dB. Not everyone needs to sing every word equally loud.
- **Lead getting buried?** Automate the choir volume down slightly during lead phrases. Busy choir over busy lead = mud.

When you finish, export and play it on a phone speaker. Gospel was built for car radios and church PAs, not studio monitors. If it sounds good on a phone, you're winning.`,
    tryNow: 'Arrange and mix a complete 32-bar gospel song section (verse → choir entrance → chorus) using what you built in Session 1. Aim for clear call-and-response between lead and choir. Export to a phone, play it, and decide what to fix.',
    youtubeLink: 'https://www.youtube.com/results?search_query=gospel+choir+arrangement+tutorial',
    glossaryTerms: ['call-and-response', 'hall-reverb', 'vocal-doubling', 'bus', 'automation'],
  },

  // Arc 3 — 90s R&B Ballad ---------------------------------------
  {
    id: 'gen-03a',
    pathId: 'genre-productions',
    order: 5,
    title: 'Build a 90s R&B ballad production (guided)',
    goal: 'Produce a Babyface / Jermaine Dupri-era R&B ballad — clean vocal in front, soft rhythm bed, BGV stack for emotion.',
    surface: `A 90s R&B ballad is three things: a vocal that sits close and intimate, a rhythm bed that stays out of the way, and BGV stacks that bloom in the chorus. Everything is in service of the voice.

Tempo: 60-75 BPM. Always slow. Always deliberate.

Build order:
1. **Start with the chords.** Piano or Rhodes playing seventh-chord voicings. The 90s ballad vocabulary is heavy on diatonic sevenths (Imaj7, IVmaj7, vi7) and minor iisus.
2. **Program drums.** Kick on 1, snare on 3, hi-hat shuffles between. Don't use loops — program from scratch so the feel is yours. Jermaine Dupri drums are notoriously simple; the emotion comes from the vocal.
3. **Bass.** DI'd electric bass (or a clean sample) mostly on roots with occasional fifth-string runs. Sidechain it softly to the kick so the low end doesn't fight.
4. **Record the lead vocal.** This takes priority. Capture it dry and close with a [[condenser-microphone]]. Multiple takes, comp them to one. Leave space — don't double the verse.
5. **Double the chorus lead.** One central take, one doubled. That's it. The chorus has more weight because of the double, but the verse feels closer because it's single-tracked.
6. **Stack BGVs.** 3-part (soprano/alto/tenor) or 4-part harmony, two layers each, panned wide. BGVs enter at the pre-chorus or chorus, not the verse.
7. **Reverb discipline.** Medium plate on the lead (1.6 sec, 30 ms pre-delay). Longer plate on the BGVs (2.2 sec). That contrast keeps lead close, BGVs architectural.

Final rule: if a listener can't tell when the chorus hits, your arrangement is too flat. Something should lift — BGV stack, new element, drums getting slightly louder.`,
    deepDive: `Babyface's secret is discipline. He doesn't add things; he subtracts them until the vocal can breathe. Study what he does:

- The verse usually has fewer than four elements going: piano, bass, kick on 1 and 3, vocal. That's it.
- The pre-chorus adds ONE thing (often a [[string-pad]] or a [[rhodes]] layer).
- The chorus adds BGVs, drums get slightly fuller (maybe a shaker, maybe a second percussion layer), vocal doubles.
- The bridge might drop to voice and one instrument, then rebuild.

That progression — fewer elements in verse, more in chorus — is the arc that makes ballads feel alive.

**Vocal comping** is critical here. Don't just pick the most technically correct take. Listen for where the emotion is strongest — often in breath, in cracks, in places the singer took a risk. The 90s lead vocals sound close and imperfect because producers kept the honest moments.

**Compression on the lead vocal** should be two-stage: a fast peak-catcher first (fast attack, high ratio, catching 3-4 dB on loudest peaks), then a slower leveler behind it (medium attack, 3:1 ratio, 2-3 dB of gain reduction throughout). Together they make every word sit at the same felt level without feeling squashed.

**Mix decisions to study** (listen to the reference tracks):
- "End of the Road" — how the BGVs duck under the lead in verses but bloom in the chorus. That's automation, not compression.
- "Un-Break My Heart" — how David Foster uses strings to carry emotional lift without losing the intimacy.
- "Can We Talk" — how Tevin's breath is always audible between phrases. That's a deliberate choice.

Listen for what you can't hear. The absence of sounds in these mixes is as important as the presence.`,
    tryNow: 'Produce a complete 90s R&B ballad verse + chorus using a recorded or sampled lead vocal. Arrange 16 bars of verse (stripped bed), 8-bar pre-chorus (one element added), 16-bar chorus (BGVs, doubled lead, fuller drums). Apply the two-stage compression and plate reverb setup from the deep dive.',
    youtubeLink: 'https://www.youtube.com/results?search_query=how+to+produce+like+babyface',
    glossaryTerms: ['compression', 'parallel-compression', 'plate-reverb', 'vocal-doubling', 'condenser-microphone', 'side-chain', 'comping', 'string-pad', 'rhodes', 'automation'],
    referenceTracks: ['ref-babyface-ballad', 'ref-babyface-ballad-2', 'ref-boyz-ii-men'],
  },
  {
    id: 'gen-03b',
    pathId: 'genre-productions',
    order: 6,
    title: 'Create your own 90s R&B ballad',
    goal: 'Produce your own original 90s-style R&B ballad.',
    surface: `Your turn. Write a 90s R&B ballad.

Starting points:
- Pick a tempo between 60-75 BPM.
- Decide your key based on the vocalist's range. Remember: the whole song is the voice — start there.
- Start sketchy — just piano and voice. Don't add drums until you know the song works as a demo.

Checklist:
- [ ] Clear verse/pre-chorus/chorus distinction in arrangement density?
- [ ] Lead vocal sits close and dry-ish?
- [ ] BGVs respect the lead — they don't step on it?
- [ ] Plate reverb on lead shorter than on BGVs?
- [ ] Tempo slow enough to feel ballad, not midtempo?`,
    deepDive: `Common mistakes to avoid in your build:

**Over-producing the verse.** If your verse has five elements going, it's a chorus pretending to be a verse. Pull things out.

**BGVs too loud.** BGVs should support the lead, not compete. If you can hear every harmony word clearly, they're probably 3-5 dB too loud. Pull them back until they feel like a cloud around the lead, not separate voices.

**Drums that drive instead of accompany.** A 90s ballad drummer never pushes. The kick on 1 and 3, snare on 3 (or on 4 in some cases), and the hats restrained. If your drums feel like they're going somewhere, make them sit back.

**Modern-sounding reverbs.** Tails longer than 2.5 seconds on the lead will make it sound like a 2020s track, not a 90s one. Keep plates tight. If you want more ambience, add a second room reverb at a low send level rather than extending the plate decay.

**Forgetting the bridge.** Many ballad tracks just stay verse-chorus-verse-chorus. A bridge that drops to voice + one instrument and then rebuilds is a classic 90s move. Write one.

Reference your Session 1 build frequently. Reference your Library tracks. Export and listen on a phone speaker — that's where most 90s R&B was heard when it was new.`,
    tryNow: "Produce a complete 90s-style R&B ballad with verse, pre-chorus, chorus, and bridge. Export to MP3 and listen on your phone. Note three things you'd change.",
    youtubeLink: 'https://www.youtube.com/results?search_query=90s+rnb+ballad+production+tutorial',
    glossaryTerms: ['plate-reverb', 'compression', 'vocal-doubling', 'automation'],
  },

  // Arc 4 — 2000s R&B (Usher era) ---------------------------------
  {
    id: 'gen-04a',
    pathId: 'genre-productions',
    order: 7,
    title: 'Build a 2000s R&B production (guided)',
    goal: 'Produce a Jermaine Dupri / Bryan-Michael Cox-era R&B track at a midtempo groove.',
    surface: `The Usher era is sleeker than the 90s. Drums are tighter and more programmed, keys are brighter, vocals have more processing, and groove is king. Bryan-Michael Cox's electric piano sound is the signature keyboard.

Tempo: 88-105 BPM midtempo.

Build order:
1. **Drums first this time.** Program crisp kick and snare — 808-ish kick, snappy snare. Hi-hat patterns should be busier than 90s (eighth-notes, sometimes sixteenths). Don't over-humanize.
2. **Bass.** Sub-bass or DI'd electric. Sits dead center. Keep it simple — often just roots with smooth fills between.
3. **Electric piano.** [[rhodes]], [[dx7]], or the classic Bryan-Michael Cox EP sound (modulated electric piano). Comp through your chords.
4. **Synth pads.** Under everything, very quiet. These fill the sonic space without calling attention.
5. **Lead vocal.** Closer mic'd than 90s, more processed. Slight de-esser, maybe light pitch correction, doubled on the hook.
6. **Ad-libs.** More of them than in a 90s ballad, panned wider.
7. **Effects.** A reverb tail, slapback delay on ad-libs, maybe a tape delay on hook words.

The track should feel clean, polished, and rhythmically tight. Groove and polish are the two axes.`,
    deepDive: `The Bryan-Michael Cox EP sound is made by running a Rhodes or DX7 EP through a [[chorus-effect]] (classic 80s chorus, subtle) and a tape saturator. The result is a warm, wide, slightly wobbly keyboard sound. Cox's fingerprint.

The Usher-era vocal is more processed than Babyface-era:
- Close mic'd (still a [[condenser-microphone]], still [[pop-filter]] required)
- Pitch-corrected lightly (not heavy Auto-Tune — Usher sings more in tune than most)
- De-essed more aggressively (the era's style preferred clean)
- Compressed harder — often with a third stage of compression on top of the two-stage chain

**BGV stacks in 2000s R&B** are often tighter and panned wider than 90s. The "group of voices" feel is sometimes replaced by a couple of doubled parts, carefully tuned and compressed.

**Drum reference specifics:**
- Jermaine Dupri's drums on "U Got It Bad" — spacious, simple, clean.
- "Confessions Part II" — hat patterns much busier, but kick/snare spacious.
- "Burn" — pitched snare, smooth groove.
- Stargate's "So Sick" — drums as punctuation, not drive.

**Automation matters more here.** Volume rides on the BGVs, the pads, even the hi-hat. Every element fades up or down through the song. Set aside a whole session after the arrangement is done to just automate.

The goal isn't a demo — it's a radio-ready polished record. That polish is all about finishing: automation, fills, transitions, mastering. Don't skip.`,
    tryNow: 'Program a 16-bar 2000s R&B midtempo groove at 95 BPM. Build with the order above. Then add a lead vocal take (yours, a sample, whatever works), stack two BGVs on the hook, and finish with automation rides on the BGVs and pads.',
    youtubeLink: 'https://www.youtube.com/results?search_query=how+to+produce+like+bryan-michael+cox',
    glossaryTerms: ['rhodes', 'dx7', 'chorus-effect', 'synth-pad', 'compression', 'auto-tune', 'de-esser', 'slapback', 'tape-delay', 'automation'],
    referenceTracks: ['ref-daniel-caesar'],
  },
  {
    id: 'gen-04b',
    pathId: 'genre-productions',
    order: 8,
    title: 'Create your own 2000s R&B track',
    goal: 'Produce an original 2000s-style R&B midtempo.',
    surface: `Your turn. Write a 2000s R&B groove.

Tempo target: 88-105 BPM. Midtempo feel. Polished and rhythmic.

Checklist:
- [ ] Is the drum groove tight without being rigid?
- [ ] Does the electric piano sit wide and warm?
- [ ] Are the pads doing structural work (not just decorative)?
- [ ] Is the lead vocal processed enough to feel era-appropriate but not over-corrected?
- [ ] Are the BGVs tight, tuned, and panned well?
- [ ] Have you done an automation pass on volume and effect sends?`,
    deepDive: `A few era-specific tricks to try:

**The hook turnaround.** Most 2000s R&B hooks have a 2-bar turnaround that leads back into the verse. A drum fill plus a vocal ad-lib plus sometimes a reverse cymbal. Build one into your track.

**Slap delay on ad-libs.** A short slap delay (120-180 ms, 1-2 repeats, 15-25% wet) on ad-lib words gives them that "bouncing around the mix" feel. Use it in moderation.

**The clean break.** Before a final chorus, drop to lead vocal and one instrument for 2-4 bars. When the full production returns, the impact is enormous.

**Sixteenth-note hi-hats in the chorus.** Add busy hi-hat variation in the chorus to distinguish it rhythmically from the verse.

Don't skip the automation pass. 2000s R&B was mixed obsessively; it's where the craft of R&B mixing reached its height. Your track will feel finished only when you've ridden the faders.`,
    tryNow: 'Build a 32-bar 2000s R&B verse and chorus with full polish — compression chain on vocal, BGV stack on hook, automated rides, mastered to -10 LUFS. Listen on multiple speakers.',
    youtubeLink: 'https://www.youtube.com/results?search_query=2000s+rnb+production+tutorial',
    glossaryTerms: ['compression', 'de-esser', 'slapback', 'automation', 'lufs'],
  },

  // Arc 5 — Lo-fi / Atmospheric Indie ----------------------------
  {
    id: 'gen-05a',
    pathId: 'genre-productions',
    order: 9,
    title: 'Build a lo-fi atmospheric indie beat (guided)',
    goal: 'Produce a lo-fi beat that embraces imperfection, warmth, and space.',
    surface: `Lo-fi beats win by sounding imperfect. Tape hiss, vinyl crackle, swung drums, a sample that wasn't meant to be a sample. The aesthetic is intentional.

Tempo: 70-90 BPM. [[swing]] enabled (16-25%).

Build order:
1. **Find a chord loop.** Either sample a 2-4 second phrase from an old jazz record (be mindful of clearance for commercial release) OR program warm chords on [[rhodes]] / [[electric-piano]].
2. **Chop it (if sampled).** Cut the phrase into pieces. Rearrange. Time-stretch. Detune. Imperfect on purpose.
3. **Program drums.** Swung [[hi-hat]], [[kick]] on 1 and 3, [[snare]] on 2 and 4 but often slightly behind the grid. Drop in [[ghost-note]]s.
4. **Add bass.** Upright bass sample, soft synth bass, or just the low end of the chord loop. Doesn't need to be busy.
5. **Atmospheric textures.** Vinyl [[vinyl-effect]], tape hiss, rain, a distant TV — background layers that say "room."
6. **Limit the bandwidth.** Roll off some highs (above 8 kHz), some lows (below 50 Hz). The mix feels smaller and warmer — that's the goal.
7. **Add imperfection.** Slight pitch modulation (wow-and-flutter), a tiny bit of distortion, compression that pumps audibly.

Final sound: sounds like it was recorded in 1972, found on a dusty tape, and accidentally released. That's the [[lofi-aesthetic]].`,
    deepDive: `The biggest mistake producers make with lo-fi is trying to make it sound clean. Lo-fi is about character, not clarity.

**Sampling sources to learn from:**
- Old jazz records (Blue Note catalog)
- 60s-70s soul (Donny Hathaway, Bobby Womack)
- Bossa nova (João Gilberto, Stan Getz)
- Childhood TV soundtracks

**Legal reminder:** Sampling copyrighted material without license is infringement. For commercial release, you must clear samples or stick to royalty-free loops / your own playing. For practice / private use, it's fine.

**Lo-fi drum programming is all about feel.** Quantize loosely — a 60-70% quantize strength, not 100%. Add [[swing]] of 15-25%. Drop [[ghost-note]]s between the main hits. If you're using Logic, the Drummer (Drum Kit Designer) tool can help here.

**Jazz chords are lo-fi's harmonic home.** Major 7ths, minor 7ths, dominant 13ths with altered extensions. If you don't know jazz harmony, start with ii-V-I progressions in a few keys and build from there.

**Saturation is your friend.** A tape saturator on the drum bus, a vinyl emulator on the master, light distortion on the bass. These add "grit" and warmth. Be careful not to overdo — if your mix sounds muddy, it's probably too much saturation.

**Reference tracks to study:**
- J Dilla — Donuts (the whole album, especially "Stop")
- Nujabes — Modal Soul
- Knxwledge
- ChilledCow / Lo-fi Beats to Relax/Study to Stream`,
    tryNow: 'Build a 2-minute lo-fi beat. Use a sample or your own playing for the chord loop. Add swung drums, soft bass, vinyl crackle, and roll off extreme highs/lows. Export and listen on earbuds — lo-fi is a headphone genre.',
    youtubeLink: 'https://www.youtube.com/results?search_query=how+to+make+lofi+hip+hop',
    glossaryTerms: ['swing', 'ghost-note', 'lofi-aesthetic', 'vinyl-effect', 'dusty', 'sampling', 'sample-chop', 'tape-saturation', 'rhodes'],
  },
  {
    id: 'gen-05b',
    pathId: 'genre-productions',
    order: 10,
    title: 'Create your own lo-fi track',
    goal: 'Produce an original lo-fi beat with your own character.',
    surface: `Make a lo-fi beat that's actually yours. Resist the temptation to sound like everyone else on the ChilledCow stream.

Checklist:
- [ ] Imperfection feels intentional, not sloppy?
- [ ] Swung drums that sit behind the grid?
- [ ] Warm low-fi mix (rolled highs/lows, saturation)?
- [ ] Something unexpected — a field recording, an unusual chord, a strange sample?
- [ ] 2-3 minute length or a loop that can extend?`,
    deepDive: `Ways to make your lo-fi distinct:

**Original sample source.** Record your own Rhodes loop, your own voice humming a melody, your own guitar. Original sources set you apart from the ocean of producers chopping the same Blue Note records.

**Unusual chord choices.** Modal harmony (Dorian, Phrygian, Lydian) adds mood that major/minor don't. Study John Coltrane and Miles Davis for harmonic vocabulary beyond basic ii-V-I.

**Live recording.** Record one element (piano, guitar, voice) live to tape or with a single mic. The room sound, the breath, the slight slips — they become part of the production.

**Non-music texture.** Field recordings of rain, a coffee shop, a cassette tape rewinding — these textures differentiate your track from every other lo-fi beat.

Don't aim for loudness in lo-fi. Master quietly. The genre thrives in low LUFS territory (-16 to -18 LUFS). Loud lo-fi feels wrong.`,
    tryNow: "Make a lo-fi beat using at least one original source (your own playing, a field recording, something you captured). Aim for under -14 LUFS in your master. Share it with one person whose taste you trust.",
    youtubeLink: 'https://www.youtube.com/results?search_query=original+lofi+beat+production',
    glossaryTerms: ['lofi-aesthetic', 'vinyl-effect', 'dusty', 'lufs'],
  },

  // Arc 6 — Modern Minimal R&B ------------------------------------
  {
    id: 'gen-06a',
    pathId: 'genre-productions',
    order: 11,
    title: 'Build a modern minimal R&B production (guided)',
    goal: 'Produce a Frank Ocean / H.E.R. / Daniel Caesar-style track — space, restraint, warmth.',
    surface: `Modern minimal R&B's defining move is restraint. You add one thing at a time; you stop when the song says so.

Tempo: 70-95 BPM typically. Can be slower.

Build order:
1. **Start with one chord voicing on piano or Rhodes.** Don't plan more yet. Just the sound of one chord.
2. **Add the second chord.** If two chords work together well, you have your bed.
3. **Record the lead vocal over just those two chords.** Let the song write itself. Often modern R&B songs have only two or three chords total.
4. **Drums, when the song asks for them.** Light programming. The snare might be a finger snap or a clap. Kick on 1 and 3. Minimal hi-hats or none. Hand percussion is often better than drum machine.
5. **Bass.** Sometimes absent. When present, sub-bass or warm electric. Sits far below everything.
6. **Subtle texture.** A soft [[synth-pad]] that barely exists. A field recording of a room. A sound that says "space."
7. **Vocal ad-libs.** Recorded sparingly, placed exactly, often pitch-lowered or treated.

Final sound: feels like a private conversation. Every decision should be defensible by the test: "What is this adding?" If you can't answer, delete it.`,
    deepDive: `Frank Ocean's "Pink + White" is six things: acoustic piano, gentle drums, subtle synth pad, Frank's lead vocal, backing vocals by (probably) Pharrell, and atmosphere. That's the whole track.

**The biggest skill of modern minimal R&B is editing.** Cut stuff out. Every song starts with too many layers and gets stripped down. If you're unfamiliar with this discipline, try this: build a full R&B production, then go through and mute every element. Unmute them one at a time. Stop adding when the song feels complete — which is usually before you've unmuted everything.

**Vocal treatment:**
- Close mic'd — even closer than 90s ballads. The proximity effect gives it warmth.
- Light compression (2-3 dB gain reduction max)
- Short plate or room reverb (1.2-1.6 seconds)
- Doubled or stacked ONLY when the song needs density (usually chorus peaks)
- Effects like pitch-shifted harmonies, tape delay on specific words, glitchy chops

**Chord voicings** should be rich — extended harmony (9ths, 11ths, 13ths) — but played sparsely. One voicing can do more than a chord progression.

**The "space" element.** Listen to "Nights" by Frank Ocean. Before any note, there's a texture that is the song. A [[synth-pad]] that feels like looking out a window. Build a texture like this into your track. It should be present before the song starts and remain after it ends.

Reference tracks to study:
- "Best Part" — notice the whole song is just guitar, vocal, and light percussion.
- "Focus" (H.E.R.) — notice how few things are happening at any moment.
- "Pink + White" — notice the sparse drums and how the song breathes.`,
    tryNow: 'Build a minimal R&B track with at most 5 elements: piano/Rhodes, drums, bass (optional), one atmospheric texture, lead vocal. Write a 2-3 chord loop and a simple melody over it. Don\'t add anything else until you can\'t hear what\'s missing.',
    youtubeLink: 'https://www.youtube.com/results?search_query=how+to+produce+like+frank+ocean',
    glossaryTerms: ['sparse-arrangement', 'synth-pad', 'rhodes', 'plate-reverb', 'tape-delay', 'proximity-effect', 'vocal-doubling'],
    referenceTracks: ['ref-frank-ocean', 'ref-daniel-caesar'],
  },
  {
    id: 'gen-06b',
    pathId: 'genre-productions',
    order: 12,
    title: 'Create your own modern minimal R&B track',
    goal: 'Produce an original minimal R&B song.',
    surface: `Your turn. Make a modern minimal R&B track.

Checklist:
- [ ] 5 or fewer primary elements?
- [ ] At least one atmospheric texture that lives throughout?
- [ ] Vocal close, warm, restrained?
- [ ] Does the song have room to breathe between sections?
- [ ] Can you defend every element's presence?`,
    deepDive: `The hardest part of minimal R&B is NOT adding things. Every producer has the instinct to add. Practice resistance.

Exercises:
- **The "one element less" test.** After your arrangement feels done, mute one element and listen. If the song still works, the muted element was probably unnecessary.
- **The breathe test.** Listen with your eyes closed. Do you feel space, or do you feel crammed? The answer tells you whether you're minimal.
- **The "phone check."** Play it on a phone speaker. Minimal R&B often feels even stronger there because the sparseness comes through.

Avoid the common lo-fi trap of "minimalism as an excuse for laziness." Your track should feel intentional, not unfinished. Every element has been chosen carefully precisely because there are so few.`,
    tryNow: 'Make a minimal R&B track. Use the one-element-less test and the breathe test. Share with someone and ask: "What sticks with you?"',
    youtubeLink: 'https://www.youtube.com/results?search_query=modern+minimal+rnb+tutorial',
    glossaryTerms: ['sparse-arrangement', 'synth-pad', 'plate-reverb'],
  },

  // Arc 7 — 80s Pop Ballad ----------------------------------------
  {
    id: 'gen-07a',
    pathId: 'genre-productions',
    order: 13,
    title: 'Build an 80s pop ballad (guided)',
    goal: 'Produce a classic 80s power ballad — gated drums, DX7 piano, big chorus.',
    surface: `The 80s pop ballad is big, dramatic, and unapologetic. Every chorus is a climb. Every drum hit is significant.

Tempo: 65-85 BPM typically.

Build order:
1. **[[dx7]] electric piano.** The defining 80s keyboard. Whole-note or half-note chords in the verse. Use a chorus effect to widen it.
2. **Drums.** Programmed, with a big [[gated-reverb]] snare. Kick on 1 and 3, snare on 2 and 4, hi-hat quarter notes. The gated reverb is essential for era authenticity.
3. **Bass.** Fretless or DI'd electric. Mostly on roots with slides into chord changes.
4. **Lead vocal.** Close mic'd, compressed heavily. 80s ballad vocals are often slightly hyper-realistic — every breath audible.
5. **Sax or guitar solo.** Around the bridge. This is the 80s — there's always a sax. George Michael's "Careless Whisper" is the textbook.
6. **String pad.** Synthesized strings (Juno-60 or DX7 strings) under the chorus. This is the "big" in power ballad.
7. **BGVs.** Entered in the chorus, stacked and panned wide. Often a modulation-heavy effect (chorus, slight phase).

Final sound: It should evoke a blue-lit stage, rain on a window, and an absolutely committed singer. Everything is emotional.`,
    deepDive: `The gated reverb snare is the single most recognizable 80s drum effect. Here's how it works: put a long reverb (2.5+ seconds) on the snare, then gate the reverb so it cuts off abruptly after ~400 ms. Result: each snare hit sounds huge but doesn't bleed into the next. Phil Collins did it first on "In the Air Tonight"; the whole decade copied.

**The DX7 sound** is specific. Patch name: "E.Piano 1." Every 80s electric piano is this or emulating this. In software, Arturia's DX7 V, Native Instruments FM8, or Logic's Retro Synth can all nail the sound.

**Chorus effect on everything:**
- On DX7 EP: makes it sparkle
- On clean guitar: gives it that Police / U2 shimmer
- On synth pads: broadens them
- On bass: too much and it loses definition — use carefully

**Compression reference:** 80s ballad lead vocals are compressed harder than 70s, softer than 2000s. Aim for 5-7 dB of gain reduction on peaks. The resulting sound is present but still breathy.

**Reverbs:**
- Drums: gated plate or gated hall, 2+ seconds pre-gate, cut at ~400 ms
- Lead vocal: medium plate, 1.8-2.2 seconds
- BGVs: longer plate or hall, 2.5+ seconds
- Instruments: room reverb or a small plate

**Classic 80s ballad arrangement arc:**
- Intro: DX7 EP + sparse hi-hat
- Verse 1: + bass, quiet drums
- Pre-chorus: + sustained strings
- Chorus: + full drums (gated snare), doubled lead, BGVs
- Verse 2: pulls back slightly
- Bridge: solo section (sax or guitar), sometimes a key change
- Final chorus: biggest, longest, fullest version

Reference listening: "I Will Always Love You" (Whitney), "Total Eclipse of the Heart" (Bonnie Tyler), "Against All Odds" (Phil Collins). Study the drum sounds, the keyboard textures, the dynamics.`,
    tryNow: 'Build a 32-bar 80s ballad verse + pre-chorus + chorus with DX7-style EP, gated snare, sustained string pads, lead vocal with era-appropriate compression, and BGVs in the chorus. The chorus should feel twice as big as the verse.',
    youtubeLink: 'https://www.youtube.com/results?search_query=how+to+make+an+80s+power+ballad',
    glossaryTerms: ['dx7', 'fm-synthesis', 'gated-reverb', 'chorus-effect', 'string-pad', 'compression', 'vocal-doubling'],
  },
  {
    id: 'gen-07b',
    pathId: 'genre-productions',
    order: 14,
    title: 'Create your own 80s-inspired ballad',
    goal: 'Produce an original 80s-style pop ballad.',
    surface: `Make an original 80s pop ballad. Don't just pastiche — find something that's yours inside the language.

Checklist:
- [ ] DX7-style EP or authentic FM sound?
- [ ] Gated snare in the chorus?
- [ ] Dynamic arrangement (verses smaller, choruses huge)?
- [ ] Vocal present and emotionally committed?
- [ ] Sax, guitar, or keyboard solo in the bridge?`,
    deepDive: `The 80s sound is so specific that modern producers often fall into either "perfect pastiche" (which sounds like a parody) or "modern production with 80s surface elements" (which is neither). Aim for the middle — era-authentic at the core but with your own song underneath.

Modern artists doing this well include The Weeknd (After Hours), Dua Lipa (Future Nostalgia), and Bruno Mars (Unorthodox Jukebox era). Study how they integrate 80s signifiers without becoming museum pieces.

Key moves to try:
- **Modulate to a half-step up for the final chorus.** An 80s staple.
- **Add a synth lead over the bridge.** Not just pads — a lead line that carries a melody.
- **Use reverse cymbal swells.** Before each chorus, a reversed cymbal rises into the downbeat. Quintessential 80s transition.
- **Big final chorus with strings, doubled lead, BGVs stacked wide, drums peaking.** Don't be shy; go big.`,
    tryNow: "Build a complete 80s pop ballad with intro, verse, pre-chorus, chorus, verse, chorus, bridge, and modulated final chorus. Don't shy away from the big final chorus — the genre demands commitment.",
    youtubeLink: 'https://www.youtube.com/results?search_query=80s+pop+ballad+production',
    glossaryTerms: ['dx7', 'gated-reverb', 'chorus-effect', 'string-pad'],
  },

  // Arc 8 — Modern Thoughtful Hip-Hop ------------------------------
  {
    id: 'gen-08a',
    pathId: 'genre-productions',
    order: 15,
    title: 'Build a modern thoughtful hip-hop beat (guided)',
    goal: 'Produce a beat in the J. Cole / Kendrick / Drake lineage — introspective, warm, groove-first.',
    surface: `Modern thoughtful hip-hop prizes mood over aggression. The drums are tight but not banging; the samples or chord progressions are warm and jazz-informed; the space gives the rapper room to think.

Tempo: 75-95 BPM, often with a [[half-time]] feel for a 150+ BPM vibe.

Build order:
1. **Start with a chord loop.** Either sample (a soul/jazz record) or play your own on [[rhodes]] or keys. Warm, not bright.
2. **Program drums.** [[kick]] and [[snare]] simple — no tricks. Crisp but not loud. Hi-hat pattern varies: quarter notes under the verse, 16th-note rolls for transitions.
3. **[[808]] sub-bass.** This is a hip-hop staple. Sits under the kick. Glide between notes on transitions.
4. **Atmosphere.** Vinyl crackle, tape hiss, a distant vocal sample chop — texture that says "analog" without being overtly lo-fi.
5. **Leave space for the rap.** The drum/music mix should feel present but not busy. A rapper needs the space between beats to land words.
6. **Hook vocal.** Most thoughtful hip-hop has a melodic hook — a sung or half-sung chorus. Keep it simple. Repetition wins.

Final sound: feels like a late-night drive. Contemplative. Doesn't push, doesn't brag. Holds space for the words.`,
    deepDive: `The thoughtful hip-hop style is defined less by BPM and more by emotional texture. Key elements:

**Warm sampling.** If you're sampling, reach for:
- Soul (Curtis Mayfield, Roberta Flack)
- Gospel (vintage Edwin Hawkins, Aretha gospel)
- Bossa nova / Brazilian jazz
- Old R&B ballads

**Chord vocabulary.** Major 7ths, minor 9ths, suspended chords, occasional tritone substitutions. If you don't know these, learn them; they're the difference between "cheap beat" and "deep beat."

**Drum programming principles:**
- Kick and snare pattern is simple (kick on 1 and 3, snare on 2 and 4 — most of the time).
- Hi-hat adds texture but shouldn't compete with the rap.
- Ghost notes between main hits = human feel.
- Quantize to 60-80% strength; fully quantized sounds robotic for this style.

**The half-time feel.** Many beats feel slow but have fast hi-hats. That's because the snare is on 3 instead of 2 and 4, making the macro feel half-tempo. "HUMBLE." is half-time; a similar BPM in 4/4 would feel frenetic.

**The hook melody.** Listen to J. Cole's hooks — they're hummable, repetitive, emotional. Write hooks you can sing in the shower without trying.

**Mixing restraint.** Hip-hop for thinkers needs space in the mix. Volume automation, sidechain compression between the drums and the music bed, conservative reverb. The rapper's voice is the main instrument; everything supports it.

Reference study: "Love Yourz" for minimalism, "Alright" for jazz-sampled complexity, "HUMBLE." for negative-space power, "Marvin's Room" for atmospheric mood.`,
    tryNow: 'Build a thoughtful hip-hop beat at 85 BPM with [[half-time]] feel. Use a warm chord loop, simple drums with ghost notes, 808 sub-bass, and atmospheric texture. Leave enough space for a rapper to breathe.',
    youtubeLink: 'https://www.youtube.com/results?search_query=how+to+make+a+j+cole+beat',
    glossaryTerms: ['half-time', 'rhodes', '808', 'glide', 'ghost-note', 'swing', 'sampling', 'pocket', 'vinyl-effect'],
  },
  {
    id: 'gen-08b',
    pathId: 'genre-productions',
    order: 16,
    title: 'Create your own thoughtful hip-hop track',
    goal: 'Produce your own beat in the thoughtful hip-hop tradition.',
    surface: `Your turn. Make a beat in this lineage.

Checklist:
- [ ] Warm, sample-informed or keys-driven chord bed?
- [ ] Drums that groove without banging?
- [ ] 808 sub-bass integrated with the kick?
- [ ] Space for the rap to live?
- [ ] A melodic hook someone could sing back?`,
    deepDive: `Ways to distinguish your beat from the crowd:

**Interesting chord progressions.** Most hip-hop uses ii-V-I or i-VI-VII patterns. Try something unusual — a tritone substitution, a modal mode (Dorian, Mixolydian), or a non-standard movement.

**Unique percussion elements.** A rim click instead of a snare, hand-clap variations, finger snaps, or a sample of a physical object (book slap, chair squeak).

**Unexpected hook delivery.** Talk the hook instead of singing it. Sing it at half speed. Use AutoTune on a short hook phrase for character.

**Thematic atmosphere.** A recurring sample (spoken word, a field recording, a movie clip) that ties the track together thematically. Kendrick does this brilliantly.

Finally: leave space for the rap. You're making a bed, not a finished song. The rapper completes the track.`,
    tryNow: "Make an original thoughtful hip-hop beat. Submit it (even privately) as a bed for a real or imagined rap verse. Then decide what to trim.",
    youtubeLink: 'https://www.youtube.com/results?search_query=thoughtful+hip+hop+production',
    glossaryTerms: ['half-time', '808', 'sampling', 'ghost-note'],
  },

  // Arc 9 — Classic Dance R&B --------------------------------------
  {
    id: 'gen-09a',
    pathId: 'genre-productions',
    order: 17,
    title: 'Build a classic dance R&B groove (guided)',
    goal: 'Produce a Beyoncé-era up-tempo R&B / dance record — tight drums, hook-driven, choreography-ready.',
    surface: `Classic dance R&B is high-energy, rhythmically tight, and designed for bodies to move. Every arrangement decision serves motion.

Tempo: 100-115 BPM.

Build order:
1. **Drums first.** Kick heavy on 1, snare or clap on 2 and 4, percussion layers on the and-of beats. The groove is king — lock it before you add anything else.
2. **Bass.** Either electric bass or sub-synth. Rhythmically syncopated. Often more important than the chords for driving the groove.
3. **Synth or horn stabs.** Short, rhythmic hits that punch in the chorus. Think Rich Harrison's horn sample on "Crazy in Love" or the horn stabs on "Say My Name."
4. **Vocal stacks.** Lead + doubled + BGVs. Often the hook is four voices thick. Repetitive, chantable.
5. **Ad-lib layer.** Panned wide, riding over everything. Often the most memorable vocal element.
6. **Effects restraint.** Reverb sparingly, delay on specific words. This genre is drier than ballad territory — you want impact, not ambience.

Final feel: immediate, irresistible, makes people move. If someone can't dance to it, something's wrong with the groove.`,
    deepDive: `The Rodney Jerkins / Beyoncé / Destiny's Child sound is built on three things:

1. **Rhythmic precision.** Every element locks into a tight grid. Unlike gospel or neo-soul (which live on looseness), dance R&B is surgical.
2. **Vocal choreography.** Harmonies often move in precise lockstep — three voices hitting the same word at the same time, then trading lines with equally precise timing.
3. **Arrangement dynamics.** Drops (where the drums cut out), builds (where the track stacks up), and transitions choreographed to match physical movement.

**Drum specifics:**
- Kick pattern is often busier than other R&B genres. Sometimes a double-hit on the 1.
- Snare/clap is often layered (a programmed snare + a sampled clap).
- Percussion (tambourine, shakers, handclaps) fills the and-beats.

**Bass patterns.** Dance R&B bass is rhythmic and syncopated. Instead of sitting on roots, it bounces between roots, fifths, and octaves. The bass carries the groove as much as the drums.

**Hook vocals.** Classic dance R&B hooks use repetition strategically: "Say my name, say my name," "Crazy right now," "Single ladies." The hook is often just a few words repeated with varying BGV stacks.

**The hard stop.** Many dance R&B songs feature a mid-song moment where everything cuts to silence before dropping back in. This is a choreography cue as much as an arrangement choice.

**Production reference:**
- "Crazy in Love" — Rich Harrison's horn sample is the hook; the drums are precision.
- "Say My Name" — Rodney Jerkins' signature skittering drum programming.
- "Drunk in Love" — more modern, trap-influenced, but same bones.
- "Formation" — Mike WiLL Made-It bringing trap drums to dance R&B.

Mixing approach: mono bass, panned percussion, doubled vocals wide, punchy drums dry. Keep the mix forward and tight.`,
    tryNow: 'Build a 16-bar dance R&B chorus at 105 BPM. Drums should groove tightly, bass should pop rhythmically, and the hook should have at least 3 vocal layers (lead, doubled, BGV). Include one hard-stop moment.',
    youtubeLink: 'https://www.youtube.com/results?search_query=how+to+produce+like+rodney+jerkins',
    glossaryTerms: ['compression', 'parallel-compression', 'syncopation', 'vocal-doubling', 'pan', 'automation'],
  },
  {
    id: 'gen-09b',
    pathId: 'genre-productions',
    order: 18,
    title: 'Create your own dance R&B track',
    goal: 'Produce your own up-tempo dance R&B record.',
    surface: `Your turn. Make people move.

Checklist:
- [ ] Tight, locked-in drum groove?
- [ ] Rhythmically syncopated bass?
- [ ] Memorable, repetitive hook?
- [ ] At least 3 vocal layers on the chorus?
- [ ] Arrangement drops or builds that choreograph?`,
    deepDive: `Dance R&B is a listen-test genre. Play your track for someone and watch their body. If they nod their head or tap their foot involuntarily, you're winning. If they don't, the groove isn't locked yet.

Common pitfalls:
- **Groove is too busy.** Pull elements out. Empty space is what makes the present elements hit hard.
- **Vocal stacks are muddy.** Check each BGV's EQ — often they need a high-pass around 200 Hz to avoid stepping on the lead.
- **No payoff moments.** The best dance tracks have 2-3 "big" moments where the listener rewards are maximum. Design them deliberately.

For modern dance R&B, the half-time drop is a common move. Listen to "Partition" for beat-switch drama.`,
    tryNow: "Make an original dance R&B track with a chorus that makes you move at your desk. Test it on one other person.",
    youtubeLink: 'https://www.youtube.com/results?search_query=dance+rnb+production+tutorial',
    glossaryTerms: ['syncopation', 'vocal-doubling', 'automation'],
  },

  // Arc 10 — 70s Soul/Funk ----------------------------------------
  {
    id: 'gen-10a',
    pathId: 'genre-productions',
    order: 19,
    title: 'Build a 70s soul/funk groove (guided)',
    goal: 'Produce a Stevie / EWF / Parliament-style groove — live-feel, bass-forward, horn-punctuated.',
    surface: `70s soul/funk is conversation between live musicians. Every instrument has its voice. Every bar breathes. The groove is the song.

Tempo: 95-115 BPM for funk, 75-95 BPM for soul ballads.

Build order:
1. **Drums.** Live-sounding drums. Use samples from a 70s kit or a DAW virtual drummer. Kick on 1, snare on 2 and 4, hi-hat with lots of [[ghost-note]]s. Shuffled eighth notes if it's swung funk.
2. **Bass.** The hero instrument. [[walking-bass]] or syncopated funk lines. Play with the drums — literally, lock with the kick.
3. **Guitar.** Clean or slightly overdriven, palm-muted chord stabs on beats 2 and 4 (the "chicken-scratch" rhythm). Can also fill in with slides and bends.
4. **Rhodes or clavinet.** Clavinet for funk ("Superstition" style), Rhodes for soul (Donny Hathaway style). Short, rhythmic comping.
5. **Horns.** Arranged as a section — two trumpets, tenor and bari sax. Stab and release, punctuating the ends of phrases. If you don't have horn samples, use a synth brass patch.
6. **Vocals.** Lead + 2-3 BGVs. The BGV tradition here is tighter than gospel — think Aretha's background singers, Ray Charles' Raelettes.

Final sound: feels alive. Like people in a room playing for each other. If it feels too clean, rough it up. If it feels too tight, loosen it.`,
    deepDive: `70s production was defined by the tape machine. Every track was recorded to 2-inch analog tape, which added:
- Low-end compression (tape saturates before it clips)
- High-end softening (tape rolls off above ~18 kHz)
- Harmonic richness (second-order harmonics from tape nonlinearity)
- Slight wow-and-flutter (tape isn't perfectly stable)

Modern producers emulate this with tape-saturator plugins (Slate VTM, Waves J37, Logic's Vintage Tape Saturator). Running drum busses and the whole mix through tape emulation gets you 80% of the 70s sound.

**Instrumentation specifics:**
- **Bass:** Jamerson (Motown) plays melodic lines; Bootsy Collins (P-Funk) plays syncopated "bumpy" patterns; Louis Johnson (Brothers Johnson) plays slap-heavy funk. Study each.
- **Guitar:** The funk guitar is almost percussive. Palm mute, chord stabs, tight rhythmic figures. Hit-and-release — never let notes ring.
- **Horns:** Arranged in parallel thirds or fourths. Stab on beat 4 or the "and" of 4 into the next bar's chord. They punctuate, not sustain.
- **Rhodes/clav:** Comping in fours, playing the chord progression but with heavy off-beat emphasis.

**Drum feel:**
- Stevie Wonder's drums (he plays them himself on many Innervisions tracks) are precise but human — slightly ahead of the beat.
- Earth, Wind & Fire's drums (Fred White) are tight and disco-influenced.
- Parliament's drums (Tyrone Lampkin) are looser, swampier.

Try each.

**Mix approach:**
- Drums dry or lightly plate'd. Not a lot of reverb — it was expensive in 1972.
- Bass center, present, warm. Low-pass filter at 4 kHz to get that mic-in-front-of-amp sound.
- Guitar panned slightly off-center, lightly compressed.
- Horns bright, panned wide (first trumpet left, second right, sax center).
- Vocals dry and close. The reverb in 70s vocals was usually EMT plate (still the best), decay around 2 seconds.`,
    tryNow: 'Build a 16-bar 70s funk groove at 100 BPM. Start with bass + drums and LOCK them tight. Add clav/Rhodes, guitar stabs, and horn section. Run the whole thing through a tape saturator for glue. Test if it makes you want to dance.',
    youtubeLink: 'https://www.youtube.com/results?search_query=how+to+make+a+70s+soul+funk+beat',
    glossaryTerms: ['walking-bass', 'rhodes', 'ghost-note', 'pocket', 'swing', 'tape-saturation', 'plate-reverb'],
  },
  {
    id: 'gen-10b',
    pathId: 'genre-productions',
    order: 20,
    title: 'Create your own 70s-inspired soul groove',
    goal: 'Produce an original 70s-style soul or funk groove.',
    surface: `Your turn. Write a 70s soul or funk track.

Checklist:
- [ ] Bass and drums lock tightly?
- [ ] Tape saturation or warmth throughout?
- [ ] Horns, Rhodes, or clav punctuating the groove?
- [ ] Vocal stacks tight and soulful?
- [ ] Feels alive, not programmed?`,
    deepDive: `Ways to capture the 70s feel beyond the surface signifiers:

**Record one element live.** Even if you can't play every instrument, try recording one (your voice, a simple bass line, a guitar chord) live. It changes the whole track.

**Longer songs.** 70s songs were often 5-7 minutes. The groove is the point; it can breathe for a while. Extend your track past 4 minutes if the groove supports it.

**Extended intros and outros.** A 30-second drum and bass intro was common. An outro that vamps on the last chord for 60 seconds was common. Don't rush.

**Sparse arrangement at the start, full by the end.** 70s arrangements often built over the course of a song. Each verse added something — a horn line, a BGV stack, a guitar layer. By the end, the track is fuller than it started.

**The solo.** A 70s song often has a 16 or 32-bar instrumental solo in the middle — usually sax, guitar, or keys. Write one. Even if you can't play a lead instrument, a synth lead or a sample-based solo works.`,
    tryNow: 'Make an original 70s-inspired groove at least 4 minutes long. Include a solo section. Master warmly (tape-saturated, not loud). Share it with someone who knew the era.',
    youtubeLink: 'https://www.youtube.com/results?search_query=70s+soul+funk+production',
    glossaryTerms: ['tape-saturation', 'walking-bass', 'rhodes'],
  },

  // Arc 11 — Neo-Soul ---------------------------------------------
  {
    id: 'gen-11a',
    pathId: 'genre-productions',
    order: 21,
    title: 'Build a neo-soul production (guided)',
    goal: "Produce a D'Angelo / Erykah Badu / Musiq Soulchild-style track — dragging pocket, Rhodes-driven, intentionally hazy.",
    surface: `Neo-soul is soul music played with hip-hop sensibilities. Drums drag behind the beat. Rhodes and bass share space that would be mud elsewhere. The whole mix has a warm haze.

Tempo: 75-95 BPM typically. Pocket matters more than tempo.

Build order:
1. **Program drums with heavy swing.** Swing 20-30%. Quantize to 60%. This creates the [[dilla-feel]] — drums that don't sit on the grid. The snare often lands slightly late, making the groove "lazy."
2. **[[Rhodes]] bed.** Warm Rhodes voicings with extended harmony (9ths, 11ths, 13ths). Comp through the changes.
3. **Bass.** Fretless or heavily rounded tone. Walks or glides through chords, often sharing frequency space with the Rhodes.
4. **Vocal.** Close mic'd but with more room than a clean R&B track. The vocal should feel like it's in the same space as the instruments, not on top of them.
5. **Texture layer.** Vinyl crackle, subtle tape hiss, occasional atmospheric pad. The "dust" of neo-soul.
6. **Horns or keys fills.** Sparse. Between vocal phrases. Never during them.

Final sound: feels like smoke. Warm, slow, unhurried. A little out of focus on purpose.`,
    deepDive: `The neo-soul feel came from a specific cultural moment: the Soulquarians (D'Angelo, Questlove, James Poyser, J Dilla, Erykah Badu, Common, Q-Tip, Mos Def) who gathered at Electric Lady Studios in the late 90s and invented a sound. Understanding them is understanding the genre.

**The Dilla feel.** J Dilla programmed drums in a way that felt "drunk" — snares slightly late, hi-hats slightly off-grid. It gave beats a human, lazy quality. When you hear D'Angelo's Voodoo album, the drums (played live by Questlove) are imitating Dilla's programmed feel. A drummer imitating a machine imitating a drummer.

**Rhodes and bass sharing space.** In most mixes, bass and mid-range keys are EQ'd to stay out of each other's way. Neo-soul intentionally lets them share the low-mid frequencies. The result is warmth and "thickness" — what sounds like mud in a pop track sounds right in neo-soul.

**Chord vocabulary.** Jazz-informed — major 9ths, minor 11ths, sus chords, altered dominants, tritone substitutions. Players like James Poyser (D'Angelo keys) bring full jazz harmony into R&B contexts.

**Vocal treatment:**
- Close mic'd with a warm condenser.
- Light compression (3-4 dB).
- Medium plate reverb (1.6-2 seconds), sometimes with a slap delay as well.
- Stacked harmonies occasionally, but often the lead carries the vocal arrangement alone.
- D'Angelo often doubled himself 3-5 times, slightly out of tune, creating a "choir of one" effect.

**Saturation everywhere.** Tape saturation, tube saturation, subtle distortion on the drum bus. Neo-soul is warm because everything has been pushed through something analog (or emulating analog).

**Mixing approach:**
- Don't over-sharpen. Keep highs rolled off slightly.
- Let elements overlap in frequency space.
- Use tape emulation on the master bus.
- Master to -14 LUFS or quieter. Neo-soul isn't loud music.

Reference study: "Untitled (How Does It Feel)" for the textbook sound, "Didn't Cha Know" for J Dilla's programming, "A Long Walk" for Jill Scott's warmth, "Love of My Life" for Erykah / Common / Saadiq collaboration.`,
    tryNow: 'Build a neo-soul groove at 80 BPM with swung drums (25% swing), Rhodes bed, fretless-sounding bass, and close vocal. Apply tape saturation to the drum bus and the master. The mix should feel warm and intentionally hazy.',
    youtubeLink: 'https://www.youtube.com/results?search_query=how+to+make+a+neo+soul+beat',
    glossaryTerms: ['rhodes', 'swing', 'pocket', 'ghost-note', 'tape-saturation', 'dilla-feel', 'vinyl-effect', 'sparse-arrangement'],
    referenceTracks: ['ref-dangelo-untitled'],
  },
  {
    id: 'gen-11b',
    pathId: 'genre-productions',
    order: 22,
    title: 'Create your own neo-soul track',
    goal: 'Produce an original neo-soul song.',
    surface: `Your turn. Make neo-soul.

Checklist:
- [ ] Drums that drag, not push?
- [ ] Rhodes with extended harmony?
- [ ] Bass that shares space with keys?
- [ ] Vocal that sits inside the mix, not on top?
- [ ] Warmth throughout — tape, vinyl, saturation?`,
    deepDive: `The hardest part of neo-soul is the pocket. Even if every instrument is right, a too-tight groove kills the genre. Practice programming drums with intentional slop.

Exercises:
- **The pocket test.** Sit with a metronome and tap on 2 and 4, but consciously land 20 milliseconds late. Practice this until it feels natural. Program your drums this way.
- **The Dilla exercise.** Listen to 10 minutes of Donuts without doing anything else. Let the rhythmic language sink in. Then program.
- **The warmth pass.** After your mix is balanced, put tape saturation on the drum bus, the bass, and the master. Listen again. The warmth isn't a bug; it's the genre.

Original neo-soul has become rarer in recent years — most producers doing this style are imitating the 90s/00s canon. Find something current in your own life to sing about. The genre's emotional palette is introspective and intimate; bring a 2020s perspective to that tradition.`,
    tryNow: "Make an original neo-soul song with dragging pocket, warm Rhodes, close vocal. Listen to it through earbuds in a quiet room. Is it smoky enough?",
    youtubeLink: 'https://www.youtube.com/results?search_query=neo+soul+production+tutorial',
    glossaryTerms: ['pocket', 'dilla-feel', 'tape-saturation', 'rhodes'],
  },
];

// ------------------------------------------------------------------
// Path 5: Arrangement & Song Structure (5 lessons)
// ------------------------------------------------------------------

const ARRANGEMENT: LessonContent[] = [
  {
    id: 'arr-01',
    pathId: 'arrangement',
    order: 1,
    title: 'Song Structure Fundamentals',
    goal: 'Understand [[verse]], [[pre-chorus]], [[chorus]], [[bridge]], and [[outro]] — and why structure serves the emotional arc.',
    surface: `Every song you love has a structure. You might not notice it consciously, but your ear does. [[song-form]] is the skeleton underneath the notes, and once you can see it, you can build your own songs intentionally instead of by accident.

The main sections:

- **[[intro]]** — Opens the song. Sets mood, hints at what's coming. Can be instrumental, acapella, a spoken word, or a loop.
- **[[verse]]** — Tells the story. Melody usually repeats across verses, but the lyrics advance. Verses build context for the chorus.
- **[[pre-chorus]]** — Optional but powerful. Builds tension between verse and chorus. Makes the chorus arrival feel earned.
- **[[chorus]]** — The emotional peak. Most memorable melody. Usually contains the song title in the lyric.
- **[[bridge]]** — Appears once, late in the song. Offers contrast — harmonic, lyrical, or arrangement — before returning to the final chorus.
- **[[outro]]** — Closes the song. Can fade, vamp, or cap with a coda.

Most pop, R&B, and hip-hop songs follow Verse-Chorus-Verse-Chorus-Bridge-Chorus (V-C-V-C-B-C). Many add a pre-chorus: V-PC-C-V-PC-C-B-C. Some just loop verse-chorus. All are valid.

The structure serves [[emotional-arc]]. A song shouldn't be the same intensity throughout. Verses set up, pre-choruses build, choruses release, bridges pivot, final choruses climax. Understanding this is the difference between a song that works and one that just has good parts.`,
    deepDive: `A quick history: modern pop [[song-form]] descends from the [[aaba]] form of Tin Pan Alley. Songs like "Somewhere Over the Rainbow" have three A sections (verses, essentially) bracketing a B (a bridge). As pop and R&B evolved, the chorus became separate from the verse, and the verse-chorus form we know today emerged.

**Why each section matters:**

- **Intros.** In a streaming era, a 30-second intro loses most listeners. Keep intros short — 8 bars max. Use them to establish mood, not to stall.

- **Verses.** Verses need to set up the chorus. They should feel slightly smaller in arrangement density. The listener should feel "something bigger is coming."

- **Pre-choruses.** The unsung hero of great songwriting. A good pre-chorus climbs — rhythmically (faster vocal phrasing), harmonically (moving toward a tension), dynamically (louder, more instruments), or all three. By the time the chorus arrives, the listener has been delivered there.

- **Choruses.** The chorus is where the song's main hook lives. It should feel like release, not strain. The chord progression is usually simpler than the verse, the melody more memorable, the rhythmic emphasis clearer.

- **Bridges.** A great bridge reframes the song. "Don't Stop Believin'" has one of the most recognized bridges ever — it delivers the title for the first time, and the final chorus hits differently because of it. Your bridges should offer something the listener hasn't heard yet.

- **Outros.** Outros control the listener's residual feeling. A long vamp (like most gospel or soul outros) creates emotional residue; a quick tag creates movement into whatever plays next.

**The arrangement question.** Structure is architecture; arrangement is furniture. Two songs can have the same structure (V-C-V-C-B-C) but completely different arrangements. Your arrangement decisions within each section — which instruments play, when they enter, how loud — are what make the structure come alive.`,
    tryNow: 'Pick three songs you love. Map each one: label every section (intro, verse, pre-chorus, chorus, bridge, outro). Count the bars. Notice what arrangement moves happen at each section transition.',
    youtubeLink: 'https://www.youtube.com/results?search_query=song+structure+verse+chorus+bridge+explained',
    glossaryTerms: ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro', 'aaba', 'song-form', 'emotional-arc'],
  },
  {
    id: 'arr-02',
    pathId: 'arrangement',
    order: 2,
    title: 'Building from Progression to Full Song',
    goal: 'Take a 4-bar chord loop and build it into a complete song with intro, development, peak, and resolution.',
    surface: `A chord loop is a seed. A song is a tree. The distance between them is arrangement thinking.

Most producers get stuck at the chord loop stage. They have a great 4-bar idea and nothing to do with it. This lesson is about the bridge between "I have a loop" and "I have a song."

**The process:**

1. **Start with your loop.** Any 4-bar chord progression. Loop it so you can hear it repeat.

2. **Write a verse melody over it.** Listen to the loop. Find a melody that wants to sit on it — usually something simple, with space between phrases.

3. **Write a chorus melody over the same loop (or a variation).** The chorus melody should feel different — more singable, often higher in pitch, often with a simpler rhythm.

4. **Design your [[arrangement]] differences.** What changes between verse and chorus? Usually: more instruments, louder drums, BGVs enter, a hook synth arrives. Decide what the difference is.

5. **Write a [[pre-chorus]].** 4 or 8 bars of climb between verse and chorus. A pre-chorus usually uses different chords than the verse and chorus.

6. **Write a [[bridge]].** A contrasting section. New chords, new melody, often a different vocal approach.

7. **Sequence the full song.** Intro (8 bars) → Verse 1 (16 bars) → Pre-chorus (8 bars) → Chorus (16 bars) → Verse 2 (16 bars) → Pre-chorus → Chorus → Bridge (8 bars) → Final Chorus → Outro. That's about 3:30 at 90 BPM.

8. **Polish [[transition]]s.** Each section-to-section move should feel intentional. Drum fills, reverse cymbals, vocal ad-libs, harmonic surprises.

The goal: your 4-bar loop is now a complete 3-4 minute song with dynamic arc.`,
    deepDive: `**Common mistakes when building from loop to song:**

**Mistake 1: Using the same chord loop for everything.** If your verse, chorus, and bridge all sit on the same 4 bars, the song feels monotone. Vary the chord progression for the pre-chorus and bridge at minimum.

**Mistake 2: Arrangement stays the same.** If verse and chorus have identical instrumentation, the listener never feels a release. Your chorus MUST have something the verse doesn't.

**Mistake 3: No dynamic arc.** The song should get bigger (fuller, louder, more energetic) as it goes, peak in the final chorus, and resolve in the outro. If it's the same intensity throughout, it lacks arc.

**Mistake 4: Forgetting the bridge.** A song without a bridge feels repetitive by the third chorus. Even 8 bars of contrast saves the arrangement.

**Mistake 5: Copy-pasting the chorus identically every time.** Each chorus should evolve slightly. The second chorus often adds a BGV layer. The third (final) chorus often modulates up, doubles the lead vocal, or adds new fills.

**Pro moves to try:**

- **The half-time feel drop.** Before the final chorus, drop to half-time for 4 bars. When full-time returns, the impact is huge.
- **The breakdown.** Before the final chorus, strip to voice and one instrument. Then rebuild.
- **The key change.** Modulate up a whole step for the last chorus. Classic but effective.
- **The instrumental hook.** Between vocal sections, let an instrument carry a hook.

**Tools for building songs from loops:**
- Logic's Arrangement Markers (create sections visually)
- Audio edits that match the song structure
- Automation lanes for arrangement dynamics

This is craft. It takes practice. The first five songs you build from loops will feel awkward. The 20th will feel natural. Keep building.`,
    tryNow: 'Take a 4-bar chord loop you have sitting around. Build it into a full 3-minute song: intro, verse, pre-chorus, chorus, verse, pre-chorus, chorus, bridge, chorus, outro. Use arrangement density (not just chord changes) to differentiate sections.',
    youtubeLink: 'https://www.youtube.com/results?search_query=how+to+turn+a+loop+into+a+full+song',
    glossaryTerms: ['arrangement', 'verse', 'pre-chorus', 'chorus', 'bridge', 'transition', 'emotional-arc', 'half-time'],
  },
  {
    id: 'arr-03',
    pathId: 'arrangement',
    order: 3,
    title: 'Drum Patterns Across Genres',
    goal: 'Learn the rhythmic fingerprint of gospel, R&B, lo-fi, trap, 80s pop, 70s soul, and modern hip-hop.',
    surface: `Every genre has a drum signature. Once you can recognize and reproduce these, you can genre-shift any idea you have.

**The rhythmic fingerprints:**

- **Gospel (6/8).** Kick on 1, snare on 4 (or beats 2 and 5), rolling triplet hi-hats, organ swells between. Feels like breath.

- **Gospel (modern 4/4).** Kick on 1 and 3, snare on 2 and 4, tight syncopation on hi-hats, tambourine on 4. Pop-rooted but with church energy.

- **R&B Ballad (90s).** Kick on 1 and 3, snare on 3 (or 4), soft hi-hats. Drums sit back — they don't drive.

- **R&B Midtempo (2000s).** Kick on 1 and 3 with syncopated fills, snare on 2 and 4, crisp hi-hats that add rhythmic density.

- **Lo-fi.** Swung (20%+ swing), kick on 1 and 3, snare on 2 and 4 but slightly behind the grid, ghost notes between. Dusty, imperfect.

- **Trap.** Kick on 1 (and syncopated variations), snare/clap on 3 (half-time feel), hyper-active 16th-note hi-hats, often with triplet rolls. 808 sub-bass doubles the kick pattern.

- **80s Pop.** Kick on 1 and 3, gated-reverb snare on 2 and 4, quarter-note hi-hats. Drums feel huge and separated.

- **70s Soul/Funk.** Kick on 1, snare on 2 and 4 with ghost notes everywhere, hi-hat that dances between open and closed. Groove lives in the space between hits.

- **Modern Hip-Hop.** Varies wildly, but usually kick on 1, snare on 2 and 4 (or half-time on 3), hi-hat patterns that modulate between quarter-note and 16th-note fills.

Each pattern has characteristic sounds too — not just placement. A gospel snare is different from a trap snare. Sound design matters as much as programming.`,
    deepDive: `**Genre-by-genre deep dive on drum programming:**

**Gospel drum programming:**
- Live-sounding kit samples (not electronic)
- Kick: deep, resonant, tuned around A
- Snare: crisp with some body, not crackly
- Hi-hats: open and closed mixed
- Tambourine in the full arrangement
- Light kick/snare compression, medium plate reverb on snare

**Trap drum programming:**
- 808 kit samples or modern trap kits
- Kick: short, thumpy, often doubling the 808 pattern
- Snare/clap: layered (electronic snare + acoustic clap)
- Hi-hats: programmed with variable velocity, triplet rolls on transitions
- 808 sub-bass is essential — glides between notes
- Minimal reverb, lots of saturation

**Lo-fi drum programming:**
- Vintage kit samples or chopped breaks
- Swing: 20-30%
- Quantize: 60-80% strength
- Ghost notes everywhere
- Vinyl crackle layer
- Lo-fi processing (bandwidth limiting, tape saturation)

**80s pop drum programming:**
- Gated snare (reverb + gate)
- Linn LM-1 or DMX-style kicks
- Simmons toms for fills
- Reverse cymbals between sections
- Big reverb space

**70s soul/funk drum programming:**
- Tight but not punchy kit
- Ghost notes on the snare (quiet hits between the main ones)
- Hi-hat patterns: 16th-notes with alternating accents
- Percussion (tambourine, congas, shakers)
- Tape saturation on the drum bus

**Modern hip-hop drum programming:**
- Depends on sub-genre, but common elements:
- 808 kick with sub-bass
- Clap or snare layers
- Hi-hat velocity variation
- Occasional half-time sections for contrast
- Reverb sparingly, saturation generously

**How to practice:**
Take one 4-bar drum pattern you know and program it in six different genres. Same tempo, same basic beat, but redesigned as gospel, lo-fi, trap, 80s pop, 70s funk, neo-soul. This exercise teaches you how drum feel transforms a track.`,
    tryNow: 'Open a new Logic session. Program the same basic beat (kick on 1/3, snare on 2/4) in five different genres: gospel, lo-fi, trap, 80s pop, neo-soul. Use appropriate drum samples and feel for each. Listen to the contrast.',
    youtubeLink: 'https://www.youtube.com/results?search_query=drum+patterns+across+genres',
    glossaryTerms: ['kick', 'snare', 'hi-hat', 'ghost-note', 'swing', 'pocket', 'gated-reverb', '808', 'half-time', 'triplet'],
  },
  {
    id: 'arr-04',
    pathId: 'arrangement',
    order: 4,
    title: 'Writing Hooks That Stick',
    goal: 'Learn the principles behind memorable hooks — simplicity, rhythmic interest, repetition with variation, emotional resonance, placement.',
    surface: `A [[hook]] is the part of the song the listener walks away humming. Great songs without great hooks don't exist; hooks are why songs get stuck in your head.

**Principles of hook writing:**

1. **Simplicity.** The best hooks use few notes. "We Are the Champions" uses a 4-note phrase. "Happy Birthday" uses a 5-note phrase that repeats. Simplicity is why hooks stick.

2. **Rhythmic interest.** A great hook has a rhythmic surprise — a syncopation, a pause, a place where the downbeat isn't where you expect. Flat rhythms are forgettable.

3. **Repetition with variation.** Hooks repeat. But exact repetition is boring. The best hooks repeat three times with a slight variation on the third. "Seven Nation Army" does this perfectly.

4. **Emotional resonance.** A hook needs to connect to an emotion — joy, heartbreak, rage, triumph. If the melody is catchy but feels nothing, it won't stick the same way.

5. **Placement in the song.** The hook is usually the chorus. But some songs have instrumental hooks (Stevie's "Superstition" opening riff) or vocal-chop hooks (modern EDM/pop) that aren't technically the chorus but carry the song's identity.

**Where to place hooks:**
- **In the chorus** — default placement. The song's most memorable lyric and melody.
- **In the intro** — an instrumental signature (riff, sample) that announces the song.
- **Between verses** — a short melodic or rhythmic hook that keeps the song memorable between full choruses.
- **As an [[earworm]]** — a short repeated phrase that loops in the listener's head.

Great songs usually have MULTIPLE hooks: the main chorus, plus an instrumental hook, plus a memorable pre-chorus. "Crazy in Love" has the horn hook, the "uh oh uh oh" hook, AND the chorus hook.`,
    deepDive: `**The anatomy of a memorable hook:**

**Pitch contour.** A memorable hook has a distinctive shape. Sing "Happy Birthday" — it starts with a repeated note, jumps up, lands on a resolution. That contour is half the memorability.

**Rhythmic pattern.** Is it syncopated? Straight? Does it have a pause in an unexpected place? The rhythm is as important as the notes.

**Lyrical hook.** The words of the hook should be simple, singable, and meaningful. Titles often ARE the hook ("Say My Name," "Irreplaceable," "Rolling in the Deep"). If you can't fit the title naturally into the hook, consider changing the title.

**The "earworm test."** After your song is finished, can you hum the hook 3 hours later? 24 hours later? If not, it's not quite sticking.

**Techniques for writing better hooks:**

- **Write multiple hook candidates.** Don't commit to the first one. Write 5 different hook ideas for the same chord progression. Pick the one that sticks after a day.

- **Simplify aggressively.** Take your hook and cut out half the notes. Then cut half again. The leaner version is almost always better.

- **Sing it as a voice memo.** If you can sing it into your phone without playing along to the track, it's probably a hook. If you need the track to remember how it goes, it's not sticky enough.

- **Test on someone else.** Play your hook once for a friend. Ask them an hour later: "Can you hum it?" Their answer tells you everything.

**The [[call-and-response]] hook.** Great for group vocals. One voice asks, another answers. Instantly hookable.

**The rhythmic hook.** Sometimes the hook is a rhythm, not a melody. The "stomp stomp clap" of "We Will Rock You" is a rhythmic hook. The rhythm of "Let It Be" is as memorable as the melody.

Hook writing is a skill you can practice. Commit to writing 5 hooks a week for a month — you'll develop instincts you didn't have before.`,
    tryNow: 'Pick a song you know well. Identify all its hooks (main chorus, intro riff, bridge memorable moment, etc.). Then write 3 NEW hooks for your own song over a chord loop. Record each as a voice memo. Listen a day later and pick the one that stuck.',
    youtubeLink: 'https://www.youtube.com/results?search_query=how+to+write+a+hook+that+sticks',
    glossaryTerms: ['hook', 'earworm', 'call-and-response'],
  },
  {
    id: 'arr-05',
    pathId: 'arrangement',
    order: 5,
    title: 'Space in Arrangement — When Less Is More',
    goal: 'Master the principle that every element must earn its place. EQ carving, panning, volume automation.',
    surface: `The most common mistake in modern production is adding too many elements. Great producers subtract; average producers keep layering.

**The guiding principle:** Every element in your track should have a specific job. If you can't name the job, delete the element.

**Ways to create space:**

1. **[[EQ]] carving.** When two elements occupy the same frequency range, they fight. Cut a 3-4 dB notch in one element at the frequency where the other lives. Suddenly both can breathe.

2. **Panning.** Stereo width creates space. Lead vocal dead center, guitars hard left and right, synths somewhere in between. A mix where everything sits in the center feels cramped.

3. **Volume [[automation]].** Elements that are important in a section should be louder; elements that are supporting should be quieter. Ride those faders.

4. **Arrangement space.** Not every section needs every instrument. Mute elements for 4 bars and see if the song still works. Often it does — the silence you added emphasizes the return.

5. **[[Sparse arrangement]] as a choice.** Listen to Frank Ocean's "Thinkin Bout You" — at any moment, there are maybe 4 elements. That sparseness is deliberate.

**The test for every element:** "What is this adding?" If you can't defend it, it doesn't belong.`,
    deepDive: `**EQ carving example:**
- Kick and bass both live in the low end. They fight.
- Solution: High-pass the bass at 60 Hz to let the kick own the sub. Boost the bass at 100-120 Hz where the kick doesn't live.
- Or: Sidechain the bass to the kick so the bass ducks when the kick hits.

Both approaches create space. Either works depending on the genre.

**Panning principles:**
- **Lead vocal:** always center. It's the main storyteller.
- **Kick and bass:** center (mono compatibility).
- **Snare:** usually center, sometimes slightly off.
- **Hi-hats:** panned slightly left or right.
- **BGVs:** panned left and right for width.
- **Guitars:** doubled and panned hard L/R for big sound.
- **Pads:** wide stereo.
- **Percussion:** spread across the field.

**Volume automation disciplines:**
- BGVs duck under the lead during important words.
- Pads get louder in the chorus, softer in the verse.
- Delays get louder on specific phrases (ear-catching, not constant).
- The entire mix might get slightly louder going into the final chorus.

**Automation isn't optional.** Professional mixes are automated obsessively. A mix that relies only on static faders sounds flat.

**The [[sparse arrangement]] approach:**
Neo-soul, modern minimal R&B, and lo-fi hip-hop all thrive on sparseness. Fewer elements, each one bigger and more important. Instead of 8 stacked pads, use 2 — but make them beautiful.

**Mono compatibility.** Your stereo mix must still work in mono (phone speakers, club PAs, car speakers). Check by summing to mono occasionally. If the vocal disappears or elements cancel, you have phase problems.

**Reference mixing.** Always reference against commercial tracks in your genre. Your mix should have similar low-end weight, vocal clarity, and stereo width. Use a reference plugin (Metric AB, Reference 2) to compare.

**The final test.** Play your mix on a phone speaker, a car, studio monitors, and headphones. It should hold up everywhere. If it only sounds good on one, the mix is unbalanced.`,
    tryNow: "Take an existing mix of yours. Mute 3 elements that you suspect aren't pulling their weight. Listen. Do you miss them? If not, delete them. If yes, understand what they're adding and make sure they earn that place.",
    youtubeLink: 'https://www.youtube.com/results?search_query=space+in+mix+less+is+more',
    glossaryTerms: ['eq', 'pan', 'automation', 'sparse-arrangement', 'stereo-imaging', 'mono-compatibility', 'sidechain', 'dynamic-range', 'lufs'],
  },
];

// ------------------------------------------------------------------
// Path 6: The Business of Music (5 lessons)
// ------------------------------------------------------------------

const BUSINESS: LessonContent[] = [
  {
    id: 'biz-01',
    pathId: 'business',
    order: 1,
    title: 'A Short History of How Music Made Money',
    goal: 'Understand the arc from sheet music → records → CDs → streaming → AI era, and why today looks the way it does.',
    surface: `Music has always been a business. How that business has worked has changed dramatically — and the current moment makes no sense without the history.

**The eras:**

**1900-1950: The sheet music era.** Music was sold as printed paper. You bought the song; you played it yourself on piano at home. Songwriters (and publishers) earned. Performers earned on stage.

**1950-1980: The records era.** Vinyl records and tape cassettes meant music was bought as a recording. Record labels rose to dominance — they controlled the manufacturing and distribution. Artists signed to labels; producers began to matter. The [[record-label]] era.

**1980-2000: The CD and [[album-era]] peak.** CDs were manufactured cheaply ($0.50) and sold expensively ($15-18). Labels enjoyed 40+ years of peak profitability. Big artists sold 10-20 million CDs per album.

**1999-2010: The Napster disruption and iTunes response.** [[napster]] made music free to download in 1999. The industry's revenue collapsed — from $14.6B in 1999 to $6.3B by 2009. Apple's iTunes legitimized paid downloads at 99¢ per song, breaking the album as the unit of sale.

**2010-now: The streaming era.** [[streaming]] services (Spotify, Apple Music) became the dominant revenue source. Subscription models work for platforms and big rightsholders; per-stream royalty rates are very low for individual artists.

**2023-now: The AI era begins.** Generative AI music tools (Udio, Suno, etc.) and AI cover/clone technology raise new questions about what artistry, ownership, and compensation look like when making a song becomes nearly free.

Understanding this arc means understanding why the industry incentives today are what they are — labels want catalogs for streaming royalties, artists need alternate income streams (sync, touring, merch), and we're all figuring out AI together.`,
    deepDive: `**A closer look at each era:**

**The sheet music era (1900-1950).**
The Tin Pan Alley songwriters (Irving Berlin, George Gershwin) dominated. Songs made their money when purchased as sheet music for home pianos. ASCAP was founded in 1914 to collect performance royalties from live venues and radio. The economic model: sell paper, collect performance fees.

**The records era (1950-1980).**
Vinyl records shifted the unit of sale from the song to the recording. Labels (Motown, Atlantic, Stax, Columbia) became gatekeepers. The [[advance]] model emerged: artists got upfront cash in exchange for signing over rights. Most artists never [[recoup]] their advances.

**The CD era (1980-1999).**
CDs changed the economics. Artists who'd sold gold records were now selling platinum. Michael Jackson's Thriller (1982) sold 70+ million copies. The music business became the most profitable entertainment industry in the world. This era birthed the myth of the major-label lottery.

**The Napster crash (1999-2010).**
[[napster]] gave away music for free in 1999. The industry sued. Users won culturally. By 2003, global music industry revenue was down by half. Apple's iTunes (2003) offered a paid alternative — $0.99 per song — but by then, the album era was dead.

**The streaming era (2010-present).**
[[streaming]] platforms stabilized the business. But individual tracks earn $0.003-$0.005 per stream. A platinum-selling song (by streaming-equivalent metrics) earns maybe $50,000-100,000 across multiple rights holders. Artists need catalogs + touring + sync + merch to make a living.

**Why this history matters for you:**
- The producer's role has become more important than ever. In the streaming era, a hit song's value is in its recording — the master rights — which the producer helped create.
- Independent artists can now release directly via distribution services. The label gatekeeper role has weakened.
- [[sync-licensing]] has become a major revenue stream — often more valuable than streaming for individual songs.
- Building a catalog over time creates long-term income. Each song is an asset.

Next lesson: exactly how music makes money today, in dollar terms.`,
    tryNow: "Pick one artist you love. Look up their catalog on Spotify. Think: at $0.003 per stream, what do their stream counts translate to? Now multiply by the number of rights holders sharing those royalties. Welcome to the streaming economy.",
    youtubeLink: 'https://www.youtube.com/results?search_query=history+of+the+music+industry+revenue',
    glossaryTerms: ['record-label', 'album-era', 'napster', 'streaming'],
  },
  {
    id: 'biz-02',
    pathId: 'business',
    order: 2,
    title: 'How Music Makes Money Today',
    goal: 'Understand streaming royalties, publishing royalties, sync licensing, beat leasing, direct-to-fan, live, sampling. What each actually pays.',
    surface: `Music revenue comes from seven main streams. Each pays differently.

**1. Streaming royalties.** Roughly $0.003-$0.005 per stream on Spotify/Apple Music. Split across label (50-70%), writer (10-15%), publisher (5%), artist (the rest). 1 million streams → $3,000-5,000 total, maybe $500-1,500 to the artist after all splits.

**2. Publishing royalties.** Paid to songwriters and publishers when songs are performed (radio, TV, venues), reproduced (physical/digital sales), or streamed. Usually the most durable long-term income stream for songwriters. Collected by PROs ([[ascap]], [[bmi]], [[sesac]]) and SoundExchange.

**3. Sync licensing.** Licensing music to film, TV, ads, games. ONE placement can pay $5,000 to $200,000+. For working songwriters and producers, sync is often more lucrative than streaming. Sync agents and music libraries are the gatekeepers.

**4. Beat leasing.** Producers sell/lease beats directly to artists through platforms like BeatStars. Non-exclusive leases start at $20-50; exclusive beats sell for $500-$5,000+. A producer with 100 beats for sale can earn a real income.

**5. Direct-to-fan.** Bandcamp, Patreon, Substack, direct merchandise sales. Artists keep 85-95% of revenue (platform fees). Best for artists with loyal audiences who want to support directly.

**6. Live performance.** Ticket sales, touring, festivals. For emerging artists, often the #1 income source. Merchandise sold at shows multiplies gate revenue.

**7. Sampling.** If you sample someone else's recording, you pay for clearance — often upfront plus a percentage of royalties going forward. Conversely, if you OWN masters, others sample you and pay you.

Most working musicians earn from multiple streams at once. The era of "one hit album pays for life" is over for all but megastars.`,
    deepDive: `**Deep dive on each stream:**

**Streaming royalties:**
- Spotify pays ~$0.003-0.005 per stream (varies by market, subscription tier)
- Apple Music ~$0.007
- YouTube Music ~$0.002
- Amazon Music ~$0.004
- The payout goes to the master owner (usually the label) first. Then artist gets their contracted share (often 15-30%).
- The songwriter/publisher gets a separate mechanical royalty (~$0.0006 per stream) via the Mechanical Licensing Collective.

**Publishing royalties:**
Three types:
- **Performance royalties.** Collected by PROs when songs play on radio, TV, streaming (public performance license), or live venues.
- **Mechanical royalties.** Paid when songs are reproduced (physical sales, downloads, interactive streaming).
- **Sync royalties.** Paid when songs are paired with visual media.

Every songwriter needs to:
1. Register with one PRO ([[ascap]] or [[bmi]] — pick one).
2. Register with a publishing admin (or self-publish).
3. Register with [[soundexchange]] for digital performance royalties.

**[[sync-licensing]]:**
Sync is the gold rush for producers. A 30-second clip on a major TV drama: $10,000-50,000. A Super Bowl ad: $100,000-1,000,000. A trailer: $20,000-200,000. The key is getting your music into music libraries or in front of music supervisors (the people who pick music for visual projects).

Sync-friendly music: instrumental tracks, emotional tracks, mood-driven pieces, versions without vocals (instrumentals) in addition to the full vocal version.

**[[beat-leasing]]:**
BeatStars, Airbit, and similar platforms connect producers and artists. Pricing tiers:
- [[non-exclusive-lease]]: $20-50. Artist gets limited rights; producer sells the same beat to others.
- Premium non-exclusive: $50-200. Better rights, more stream caps.
- [[exclusive-lease]]: $500-5,000+. Artist gets sole rights; producer removes beat from sale.

Successful producers have hundreds of beats available at any time. It's volume + quality.

**Direct-to-fan revenue:**
- Bandcamp: 85-90% to artist.
- Patreon: 85-92% depending on tier.
- Merch: 40-70% margin after costs.
- Superfans drive most revenue — a few hundred dedicated fans can fund a career.

**The compound effect:**
No single revenue stream usually makes a sustainable career for working musicians. Combine streaming + sync + beat leasing + direct-to-fan + merchandise + occasional live, and you have a real business.

**[[split-sheet]]s matter.**
When you write or produce with others, signing a split sheet at the end of the session (agreeing to ownership percentages) is the single most important business habit. Un-split sessions create disputes that can last decades.`,
    tryNow: "Figure out where each of your income streams comes from (if any). List which ones you've accessed and which you haven't. For anything you haven't — decide this week whether to engage.",
    youtubeLink: 'https://www.youtube.com/results?search_query=how+music+makes+money+streaming+sync',
    glossaryTerms: ['streaming-royalty', 'publishing-royalty', 'sync-licensing', 'beat-leasing', 'non-exclusive-lease', 'exclusive-lease', 'producer-points', 'ascap', 'bmi', 'sesac', 'soundexchange', 'split-sheet', 'catalog'],
  },
  {
    id: 'biz-03',
    pathId: 'business',
    order: 3,
    title: 'Protecting Your Work — Copyright Basics',
    goal: 'Understand how copyright works, what split sheets are, what master vs. publishing rights mean, and when to worry about work-for-hire.',
    surface: `Your song is [[copyright]]ed the moment you create it — when you record a demo, write down lyrics, or save a MIDI file. But owning copyright and enforcing copyright are different things.

**Key concepts:**

**Copyright automatically exists.** You don't need to file anything to OWN your work. As soon as it's "fixed in a tangible medium" (saved as audio, written down, recorded), you own the copyright.

**[[registration]] strengthens your rights.** Registering with the US Copyright Office (copyright.gov, $65, 20 minutes) is optional — but without it, you can't sue for statutory damages or attorney's fees. Register any song you release.

**Two separate copyrights per song:**
1. **[[publishing-rights]]** (the composition — melody + lyrics). Written down, not tied to any specific recording.
2. **[[master-rights]]** (the specific recording). The actual audio file you release.

These can be owned by different parties. Beyoncé fought to own her masters; Taylor Swift re-recorded albums to own hers.

**[[split-sheet]]s.** Every collaborative session should end with a signed document listing all contributors and their % ownership of both the composition AND the recording. Sign it on the spot. Disputes 10 years later are extremely hard to resolve.

**[[work-for-hire]].** If you sign a contract saying your work is "work for hire," you DON'T own the copyright — the person paying you does. Check every contract. Jingles, demos for labels, session work — often work-for-hire.

**[[public-domain]].** Works old enough (generally pre-1927 in the US) have no copyright. Classical music, old folk songs, hymns. You can record and sell them freely.

These basics are the floor. Every working musician needs to know them.`,
    deepDive: `**Copyright in practice:**

**Your song's two copyrights:**

Imagine your song, "Dreams."
- The [[publishing-rights]] covers the melody and lyrics. You wrote those. 50% writer, 50% publisher (often the same person initially).
- The [[master-rights]] covers your specific recording of "Dreams." A label might own this; or you (if self-released).

When Spotify pays:
- The master owner gets most of the payout.
- The publishing owner gets the mechanical and performance royalties (smaller but separate).

When you license your song for a TV show:
- The sync license covers both the composition AND the recording.
- Master owner and publisher negotiate separately (or together as one entity if you own both).

**Why master rights matter:**
Master rights = sampling income, film placement income, remix income. Artists who don't own their masters often can't control how their music is used.

**[[split-sheet]] template (minimum requirements):**
- Song title
- Date of creation
- All contributors (writers, producers)
- Percentage ownership of composition
- Percentage ownership of recording
- Signatures of everyone present

Keep a physical and digital copy. Email the signed version to everyone involved. This is your insurance.

**[[work-for-hire]] red flags:**
If a contract includes the phrase "work for hire," "all rights assigned to," or "you waive all rights to the work," read carefully. Some work-for-hire is fine — session musicians paid for a day's work, for example. But if you're writing a song, be very careful about signing away copyright.

**Sampling:**
If you sample someone else's recording, you owe:
- Master clearance (payable to the master owner — usually a label).
- Sync clearance on the composition (payable to the publisher).

Both can be negotiated for a one-time fee, ongoing percentage, or both. Unclear sampling = lawsuits. Clear every sample, no matter how small.

**International copyright:**
The US Copyright Office handles US rights. For international rights, register through IPN (International Performing Rights) and work with a publisher that handles worldwide collection. PROs like ASCAP and BMI have international agreements.

**Copyright length:**
In the US, copyright lasts life of the author + 70 years. After that, the work enters [[public-domain]]. Joint works (multiple authors) last 70 years after the LAST surviving author's death.

**Do this today:**
1. List every song you've released or are about to release.
2. For each, note: registered? split-sheeted? own masters? own publishing?
3. Fix what's missing. This is insurance for your future career.`,
    tryNow: "Register one of your released songs at copyright.gov. It costs $65 and takes 20 minutes. If you've never done this, consider it foundational business infrastructure — like insurance for your work.",
    youtubeLink: 'https://www.youtube.com/results?search_query=music+copyright+basics+producer',
    glossaryTerms: ['copyright', 'registration', 'split-sheet', 'master-rights', 'publishing-rights', 'work-for-hire', 'public-domain', 'sampling', 'producer-points'],
  },
  {
    id: 'biz-04',
    pathId: 'business',
    order: 4,
    title: "The AI Era — What's Changing",
    goal: 'Honest assessment of what AI can do now, what it struggles with, legal uncertainties, and how to position yourself.',
    surface: `AI music generation went from a novelty to a working tool in two years (2022-2024). The industry is still figuring out what this means. So are you.

**What AI can do well right now:**
- Generate convincing background music (lo-fi, ambient, elevator jazz) in seconds
- Create full songs from text prompts with structure and hooks (Udio, Suno)
- Separate a finished recording into stems (vocals, drums, bass, other)
- Clone voices from small training samples
- Generate chord progressions, drum patterns, melodies on demand

**What AI struggles with right now:**
- Genuinely original musical ideas (it recombines rather than invents)
- Singing with the specific emotional phrasing of a real artist
- Understanding cultural context (gospel, soul, hip-hop aren't just sounds — they carry history)
- Complex arrangement decisions that serve an emotional arc
- Performance quality that feels genuinely human

**Legal uncertainties:**
- **Training data.** Labels have sued AI companies claiming their music was used without permission to train models.
- **Vocal cloning.** If someone uses AI to clone Drake's voice and releases a fake-Drake song, is that fraud? IP violation? Free speech? The courts will decide.
- **Ownership of AI output.** The US Copyright Office has ruled that purely AI-generated content is NOT copyrightable (no human author).
- **Streaming platform policies.** Spotify is beginning to flag or remove AI-generated content.

**How to position yourself:**
1. **Human craft still matters.** AI tools are getting better, but genuine musical expression — the specific way YOU hear and make music — is still valuable.
2. **Use AI as a tool, not a replacement.** Stem separation for remixing, AI for brainstorming melodies, AI for demos. Don't let it replace the hard work of writing.
3. **Build an audience.** Real humans who want to hear YOUR music. AI can't replicate relationships.
4. **Understand the legal landscape.** Sampling rules, vocal rights, training data — these are evolving fast. Stay informed.

The bottom line: this is a transformational moment. Nobody knows exactly how it plays out. Smart musicians are experimenting, learning, and staying present.`,
    deepDive: `**What's real, and what's hype:**

**Real:**
- [[udio]] and [[suno]] can make convincing 2-3 minute songs from text prompts.
- [[stem-separation]] tools (Moises, Spleeter, Logic's new Stem Splitter) genuinely work — they can isolate vocals from a commercial recording in seconds.
- [[vocal-cloning]] is convincing enough that major labels are suing AI companies over unauthorized use.
- AI-generated [[ai-music]] and AI-cover content is appearing on streaming platforms in large quantities.

**Hype:**
- Claims that AI will replace all musicians. Probably not — humans still prefer music made by humans for humans.
- Claims that AI-generated songs are going to the top of charts. So far, not really happening at scale.
- Claims that AI can't handle complex music. It CAN, it just doesn't always handle it well.

**The training data problem:**
AI music models are trained on existing music — a lot of it copyrighted. The legal question: is this fair use (legal) or copyright infringement (illegal)?
- Major labels (Sony, Universal, Warner) sued Suno and Udio in 2024.
- The outcome of these cases will shape the industry.
- Similar cases are playing out in visual AI (Getty v. Stability).

**What this means for your career:**

**Scenario 1: AI tools become widely licensed.** If AI companies pay rights holders, AI music becomes a new form of licensed creativity — like samples. Your catalog becomes more valuable as training data.

**Scenario 2: AI tools stay in legal limbo.** The current situation continues — some AI music exists, courts are slow, uncertainty persists. Most artists proceed cautiously.

**Scenario 3: AI tools are restricted.** Courts rule training on copyrighted data is infringement. AI companies must negotiate licenses or shut down. Human-made music becomes more valuable.

All three scenarios are possible. Smart musicians prepare for all of them.

**Practical moves for the AI era:**
- **Register everything.** If AI companies eventually have to pay rights holders, only registered works will collect.
- **Build a personal brand.** Listeners choose human creators partly for connection. Strengthen yours.
- **Experiment with AI tools.** Use them for demos, brainstorming, learning. Knowing the tools keeps you relevant.
- **Double down on what AI can't do.** Emotional range, cultural nuance, live performance, collaboration, teaching.

**The ethical question.**
Some artists have declared they won't use AI tools. Some will use them freely. Neither is wrong. What matters is clarity: be honest with your audience about how your music was made.

Streaming platforms are beginning to require AI disclosure labels. This will probably spread.

**One more thought:**
Every major shift in music tech (player piano, recording, electric guitar, synthesizer, sampling, digital recording) caused panic at the time. In retrospect, each one expanded what was possible. AI is likely another — transformational, scary in the short term, clarifying in the long term. Humans will still want to hear other humans.`,
    tryNow: "Use Udio or Suno to generate a song in your favorite genre. Listen critically. Where does it succeed? Where does it fail? What would you do differently as a human producer? This exercise grounds your understanding of the current state of the tech.",
    youtubeLink: 'https://www.youtube.com/results?search_query=ai+music+producer+perspective',
    glossaryTerms: ['ai-music', 'stem-separation', 'vocal-cloning', 'training-data', 'ai-generated-content', 'udio', 'suno'],
  },
  {
    id: 'biz-05',
    pathId: 'business',
    order: 5,
    title: 'Getting Started — Your First Moves',
    goal: 'Concrete steps to launch your music business, from skill building to registration to distribution.',
    surface: `Starting is the hard part. Here's a concrete first-move list — not theory, action items.

**Foundation (first 6 months):**
1. **Build your skill foundation.** Finish 10 complete songs in 6 months. Not perfect songs — complete ones. This builds your craft.
2. **Set up a home studio.** Interface, headphones, mic, DAW, MIDI keyboard. Doesn't need to be expensive.
3. **Learn one DAW deeply.** Logic Pro, Ableton, FL Studio, Pro Tools — pick one and master it over a year.

**Business infrastructure (months 3-6):**
4. **Register with a PRO.** [[ascap]] or [[bmi]] — pick one. Registration is free for writers.
5. **Register with [[soundexchange]].** Free. Collects digital performance royalties.
6. **Set up a [[distribution]] account.** DistroKid ($23/year) or TuneCore. This pushes your music to Spotify, Apple Music, and all major services.
7. **Register your first copyright.** $65 at copyright.gov for any song you release.

**Building presence (months 6-12):**
8. **Create an [[EPK]].** Bio, photos, representative tracks, contact info. A one-page website is sufficient. Tools: Linktree, Bandcamp, a basic Squarespace site.
9. **Release consistently.** Aim for a new single every 6-8 weeks. Build momentum.
10. **Play live.** Open mics, small venues, virtual performances. Live performance still builds audiences.

**Growing (year 2+):**
11. **Network.** Go to local music events. Contribute to sessions with other producers. Most opportunities come from relationships.
12. **Document everything.** Behind-the-scenes content, studio time, process videos. Modern music is as much about narrative as sound.
13. **Find your niche.** The musicians who thrive aren't generalists — they specialize. Gospel, neo-soul, lo-fi, sync music, film composing — pick one lane and go deep.
14. **Track your money.** Every dollar in, every dollar out. Music is a business; treat it like one.
15. **Stay curious.** The industry changes fast. Read, listen, experiment. Every year, your craft should be sharper than the last.

You don't need to do all 15 at once. Start with 1-3. Build from there.`,
    deepDive: `**The first 90 days:**

Week 1-2:
- Set up your DAW.
- Decide on your PRO ([[ascap]] or [[bmi]]).
- Create accounts: Bandcamp, SoundCloud, Spotify for Artists.

Week 3-4:
- Finish (or near-finish) one song.
- Record it properly, mix it, master it.
- Save the project.

Month 2:
- Finish 2-3 more songs.
- Register your PRO account.
- Set up distribution (DistroKid or TuneCore).

Month 3:
- Release your first single.
- Register the copyright.
- Start building your [[EPK]].

**The first year:**

- 10-12 released songs.
- Email list of 50-200 dedicated fans.
- One collaborative project with another artist.
- One live or virtual performance.
- One step forward in each of: skill, network, and audience.

**Common beginner mistakes to avoid:**

- **Over-building infrastructure before making music.** You don't need a website, a label, a manager, a social media strategy before your first release. Make music; the rest follows.
- **Copying successful artists too directly.** "Sound like Drake" isn't a strategy. "Find what sounds like me" is.
- **Obsessing over streaming numbers.** 50 loyal fans who'll buy your album > 50,000 Spotify streams.
- **Avoiding business knowledge.** Musicians who don't understand contracts, royalties, and rights get exploited. You don't need a law degree — just basic literacy.
- **Trying to do everything yourself.** Producer + engineer + mixer + mastering + marketer + performer is too much. Identify one area to be great at; collaborate for the rest.
- **Burnout.** Music is a long game. Pace yourself.

**Resources to explore:**

- DIY Musician (CD Baby's blog) — practical career advice
- Ari's Take — independent artist business
- Future of Music Coalition — industry analysis
- Your PRO's member resources
- BeatStars / Airbit — for beat producers

**The one thing that matters most:**

Keep making music. Career advancement follows output. Without finishing songs, nothing else matters. Without consistency, audiences don't form. Without releases, there's no catalog to build.

Ship your work. The best producers are the ones who finish songs and release them.

**The long view:**

A music career is 20-40 years. Your first year's catalog will generate stream royalties for decades. Sync placements that happen in year 3 may pay in year 10. The compound effect of consistent work over time is how music careers actually grow.

You won't see results in year 1. You'll see glimpses in year 3. You'll see real movement in year 5-7. You'll have a career by year 10+.

That's if you keep showing up. Most producers don't. That's why the ones who do become successful.`,
    tryNow: "Pick 3 items from the 15-item list that you haven't done yet. Do one this week. Do the second in the next two weeks. Do the third within a month. Movement beats planning.",
    youtubeLink: 'https://www.youtube.com/results?search_query=starting+music+career+producer+independent',
    glossaryTerms: ['ascap', 'bmi', 'sesac', 'soundexchange', 'distribution', 'epk', 'catalog', 'registration', 'copyright'],
  },
];

// ------------------------------------------------------------------

export const PRODUCTION_LESSONS: LessonContent[] = [
  ...WORKFLOW,
  ...LANGUAGE,
  ...VOCAL,
  ...GENRE,
  ...ARRANGEMENT,
  ...BUSINESS,
];

export function lessonById(id: string): LessonContent | undefined {
  return PRODUCTION_LESSONS.find(l => l.id === id);
}

export function lessonsByPath(pathId: string): LessonContent[] {
  return PRODUCTION_LESSONS
    .filter(l => l.pathId === pathId)
    .sort((a, b) => a.order - b.order);
}
