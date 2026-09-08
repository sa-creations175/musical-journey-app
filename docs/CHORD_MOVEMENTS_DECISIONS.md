# Chord Movements & Passes — the decisions

Ruled by Silas, 8 Sep 2026. Companion to
`docs/chord-movement-playback-prototype_1.html`, which is the signed-off
clickable prototype and wins wherever it and this file disagree.

**These are the rulings this submodule is built on. They are recorded here
because the reasons matter as much as the calls — anything not on this list
is still open, and anything that contradicts it stops and asks.**

---

1. **A captured move is not a song.** A song is a story with parts, a feeling
   and a context. Movements live in Shapes & Patterns, never in Song
   Repertoire, and are never counted by any surface that counts songs
   (repertoire list, dashboard song squares, practice session generation,
   goals, weekly plan, song-of-month). Ruled out: storing one as a pretend
   song.

2. **The word "fragment" is retired.** The things are movements and passes; a
   walk-up is both (the diminished into the minor six is a pass, the whole
   thing is a movement). The submodule is "Chord Movements & Passes".

3. **The existing Voice Leading page** (the 1 4 7 3 6 2 5 1 grid) moves under
   the new submodule.

4. **Silas names a movement himself.** The app never generates a name. There
   is a free-text description for how he sees and thinks about it.

5. **Entry is the lead sheet's existing press-the-notes-per-hand editor**
   against a notated rhythm. No new entry idiom. The editor panel becomes
   ONE shared component used by both the song lead sheet and a movement.

6. **A movement has its own time signature**, chosen from the same presets a
   song section uses.

7. **The captured rhythm is how it sounded the time it was heard**, not a
   fixed rule. Drilling it to a click at any feel stays allowed.

8. **Playback has its own speed, labelled BPM:** slider plus typed number,
   remembered per movement. It does not use the metronome. The 30 Aug
   metronome rule still governs practice runs and test runs; it does not
   reach playback.

9. **Playback loops on demand** (the control is called Loop) and stops
   immediately on Stop.

10. **A key must be set before a movement can play.** Without one the play
    control explains why rather than guessing.

11. **A chord with a symbol but no pressed notes plays a derived voicing**
    from its quality and is visibly marked as filled in. It is never silent
    and never skipped.

12. **Bass balance is a user toggle:** Forward (left-hand notes louder) or
    Even. Silas will decide by ear whether it stays; ship the toggle.

13. **Copy and paste of a voicing carries it by chord tone** (root, third,
    fifth, seventh roles), rebuilt on the target chord's quality. Pasting a
    C voicing onto A minor comes out minor with nothing to fix. Ruled out:
    exact keys; plain semitone shape.

14. **Chord names AND scale-degree numbers both show, number first.** Both
    follow the global enharmonic spelling setting (♭ or ♯), the number
    included: with flats, the walk-up reads 1, 1, 3⁷, 2/♭5, ♭6°, 6m, 6m.

15. **Keyboard colours are the app's interval-from-chord-root palette**, left
    hand at 65% opacity, exactly as `PianoKeyboard` does today. No hand
    colours.

16. **The chord editor opens with the first chord already selected.**

17. **Each key clicked in the editor sounds as it is pressed.** Releasing is
    silent.

---

## Two words that are settled, and override the prototype's labels

The prototype was drawn before these were named. Where it says otherwise:

- The continuous-playback control is **Loop** — "Loop off" / "Loop on".
  The prototype says "Repeat off" / "Repeat on".
- The speed control is labelled **BPM**. The prototype says "Tempo".

Everything else the prototype says is provisional and is listed in
`docs/WHOLE_SONG_TEST_COPY.md` under "Chord Movements & Passes", pending
Silas's naming pass.

---

## Still open

- **Progress Details** is a standing section on every module. A movement has
  no rating yet, so the section is left out of this submodule rather than
  filled with something invented.
