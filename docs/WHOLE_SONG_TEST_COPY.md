# Approved copy — the test modal, the result screen, the lead-sheet strip

Approved by Silas, 29 Aug 2026. Companion to `WHOLE_SONG_TEST_SPEC.md`.

**These are the words. Do not reword them, and do not write new ones.** Anything
this file does not cover is still unwritten — stop and ask rather than inventing.

---

## The rule sentence — write once, use everywhere

> Three clean run-throughs in a row, in one testing session.

This replaces **seven different wordings across ten surfaces**. No surface states
this rule in its own words any more. The surfaces, from the sweep:

`DueBanner.tsx:63`, `songPageGuidance.ts:86`, `stage.ts:566`, `KeyRow.tsx:187`,
`KeyRow.tsx:188`, `KeyRow.tsx:200`, `KeyRow.tsx:215`, `SingleRunModal.tsx:117`,
`WholeSongTestModal.tsx:493`, `WholeSongTestBanner.tsx:54`,
`SongMatrixView.tsx:358`, `TestStep.tsx:194`, `TestStep.tsx:229`,
`CellPanel.tsx:455`, `goals/data.ts:215`.

**Do NOT touch** `spacing/settings.ts:408` and `:426`. They use "in one sitting"
about spreading flashcard answers across days, where the phrase is the thing
being argued against. Different rule, correct as written.

---

## When you pass

- **Headline:** That's the test passed.
- **What you earned, whole song:** **{Song}** is now at **{Status}** status in the key of **{Key}**.
- **What you earned, section:** **{Section}** is now at **{Status}** status in the key of **{Key}**.
- **What set it — SECTION TESTS ONLY:** Three in a row. Your lowest was **{Feel}**, so it lands on **{Status}**.
  - Omitted entirely on a whole-song pass. That test always lands on Comfortable,
    so a line explaining which height was chosen explains a choice nobody made.
- **What's next — WHOLE-SONG PASSES ONLY:** If you want to take it further, **Cross-key** is next — this song at **Comfortable** status in a key from each of the other three quadrants. No rush, the song is yours in the key of **{Key}** either way.
- **Badge preview caption:** What the matrix says now
- **The single exit:** Close And See It

---

## In the session

- **Rating label:** Rate That Run
- **Run list expander:** Show all {n} run-throughs — {m} earlier
- **Collapse:** Show fewer

---

## On the lead-sheet strip

- Finish Run
- Log Practice Session
- Back To The Session
- **Paused state:** Paused — the clock is stopped.

---

## Reopening a paused session — WRITTEN 29 Aug, approved

The prompt changes shape with age, because the two-hour rule makes one of the
three options untrue after two hours.

**Paused under two hours:**

> **You paused this practice session 40 minutes ago.**
> 12:40 on the clock.

`[ Resume This Practice Session ]  [ Log It And Close ]  [ Discard It ]`

**Paused longer than two hours:**

> **You paused this practice session on Tuesday.**
> 12:40 on the clock.
> Too long ago to pick up — anything from here starts a new session. The minutes
> are still yours.

`[ Log It And Close ]  [ Discard It ]`

Why the shape changes rather than greying a button: resuming after two hours
starts a new sitting by definition, so a Resume button there would be lying
about what it does. **Ruled out:** a third option, *Log It And Start A New
Session* — logging and then starting one is two taps already available.

Substitute **testing session** for practice session on a test.

---

## Cancelling — WRITTEN, approved

**The condition is the clock, not the screen.** Cancel (or Close) asks only when
a session has started and the clock is running. Cancelling before the clock
starts closes the panel with no prompt — nothing was recorded, so it is as if it
did not happen. This holds on every surface.

> **Are you sure you want to cancel this session?**

`[ Cancel The Session ]  [ Continue Session ]`

Cancel The Session stops the clock, discards the time, closes the panel.
Continue Session returns with the clock still running and changes nothing.

There is a proposed middle line — *"The time on the clock won't be recorded."* —
which is **NOT approved**. Do not include it.

---

## The Test option on the mode chooser — WRITTEN, approved

> Three drills in a row, each at or above your target rate, each one rated Clean
> or better. Anything lower puts the count back to zero and you go again. The
> lowest of the three sets the rating. Testing is the only way to **Fluent** or
> **Mastered**.

Supersedes: *"Three drills, each at or above your target rate, each one rated.
The lowest of the three sets the rating. The only way to Fluent or Mastered."*
Every clause of the old one was true; what it lacked was the reset.

---

## The metronome line, both modes — WRITTEN, approved

> **Test:** The target bpm for this song is {n}bpm. A test run must be no lower
> than {n−10}bpm (10 below the target).

> **Practice:** The target bpm for this song is {n}bpm. Practice can run at any
> tempo as you build up to target. Slow it down if that's what you need to start.

---

## Still not written — do not invent

- "Hide settings" — the metronome settings toggle's expanded label.
- Anything for the shapes grid adopting the matrix face: "Edit what counts",
  "not counted", and the edit-mode bar's sentence are all placeholders.

---

# Addendum — the strip, and the naming rule (29 Aug 2026)

## THE RULE: never say "session" or "run" on its own

The app always says **which kind**. Not "Session" — **Practice Session** or
**Testing Session**. Not "Run" — **Practice Run** or **Test Run**. This applies
to labels, buttons, sentences and aria text alike.

"Testing session", not "test session" — it matches the approved rule sentence,
*"three clean run-throughs in a row, in one testing session."*

## Timer labels

- Practice Session · Practice Run
- Testing Session · Test Run

## Starting a run

- Start A Practice Run
- Start Test Run {n}

## The strip

- Pause · Resume
- Save Runs
- Settings
- Log Practice Session
- Back To The Session
- Paused state: Paused — the clock is stopped.

## Finish Run — practice only

**A test run ends by rating it.** Rating is required on a test, so the four
rating chips are how a test run finishes. There is no Finish Run on a test.

**Finish Run exists for practice**, where rating is optional and there has to be
a way to stop a run without one.

This resolves the contradiction between the copy file and the prototype: they
were two run models, not two labels, and both are correct in their own mode.

## The session-time line on the result screen

It reports the **session's** total, not the run's — the result screen appears
when the session is over.

- Testing session time {mm:ss}, recorded.
- Practice session time {mm:ss}, recorded.

---

# Approved 30 Aug 2026 — the band face and the choose-what-you're-working-on mode

## STANDING RULE — no new status words

The six are **Not Started**, **Started**, **Needs Work**, **Developing**,
**Fluent**, **Mastered**.

**"Fluent+"** means Fluent or Mastered and is the only permitted shorthand.

**Retired:** "acquired", entirely. **"learned"** was considered and rejected —
it reads as a tier gate, and it sits too close to the song status **Learning**.

## STANDING RULE — the app's word is CELL

Not "square". Use **cell** in the UI, in reports and in commit messages.

---

## Choose-what-you're-working-on mode — the shapes grid

- **Button:** Choose what you're working on
- **An excluded item:** Not working on this
- **The bar while in the mode:** Tap anything you're not working on. It won't
  count toward this cell's status.

## The three session buttons — approved 30 Aug 2026

Once a session is running, the row along the bottom reads:

`[ Cancel Session ]  [ Pause Session ]  [ Log Session ]`

- **Cancel Session** — asks *"Are you sure you want to cancel this session?"*
  and discards the sitting. The confirmation itself is unchanged.
- **Pause Session** — reads **Resume Session** while paused.
- **Log Session** — the finish door on BOTH modes. It goes to the wrap-up and
  logs the sitting.

Before a mode has been picked the row is **Close** on its own: nothing has
happened yet, so it really is just closing.

A TESTING SESSION IS LOGGED LIKE A PRACTICE ONE. Time spent testing is time
spent playing, and it lands on the record whether or not the streak was ever
reached. Runs are unaffected — each is written as it is rated.

On the lead-sheet strip, **Log Session** is the same finish door and carries
the same words.

---

## Ending a run — approved 30 Aug 2026

A run ends explicitly, and is rated afterwards. One tap should not mean
both "I finished" and "here is how it went".

- **End Test Run**
- **End Practice Run**
- **After the run** — sits where **Required** sits, while the clock is still
  going. The rating heading stays **Rate That Run**; only the hint beside it
  changes, and the four chips are inert until the run has ended.

A count-down drill that reaches its target ends itself and lands in the same
state: clock stopped, chips live, nothing further to press first.

## Metronome

- **Settings collapse label:** Hide settings

## Scales

- **Section header, final sentence:** Each cell shows where that pattern stands.
- **Progress line:** Progress — 12 of 96 Fluent+
- **Group heading:** 12/24 Fluent+

## Home card

- **Numerator:** 12 of 96 Fluent+
- **Hand chooser labels:** Fluent / Developing / Not Started — the status word,
  capitalised, no other change.

---

## Still not approved — do not build these

- **The per-hand bars on the home card**, two segments or six. A shape decision,
  parked for a prototype.
- **§6b** — whether a key row reads Started and Learning.
