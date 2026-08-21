# Song page guidance — copy

**Status: shipped 21 August 2026 in step 3a-6b.** The copy now lives in
`src/modules/repertoire/songPageGuidance.ts` and is rendered by
`SectionGuidance` behind an ⓘ beside each section heading.

**This file is the record of how the copy was decided, not a second copy of
it.** The strings in the module are the ones that ship; edit those. Kept
because the reasoning behind three of the edits is worth not losing, and
because `songPageGuidance.test.ts` pins the properties that reasoning produced.

**Standard.** Each surface answers two questions: what this section is for, and
how to use it. Bulleted, never a wall of text. Instructional second person —
the dashboard's legibility layer explains numbers, this explains what to do,
and they are different jobs with different voices. Explain what the reader is
looking at and what to do with it, never the reasoning behind the design.

**Scope.** Three ⓘ panels: lead sheet (carrying the progressions drawer as its
third group, since the drawer opens from there and has no heading of its own),
matrix, and practice history. *Learning status* carries the stage-criteria
panel from 3a-6a instead. *Why this song* and *my associations* get nothing —
they are self-evident, and guidance on a text box is noise.

---

## Decisions

**1. "cell", not "square"** — cell fits a matrix.

**2. The axes were backwards in the draft.** Sections are COLUMNS, keys are
ROWS: a row read left to right is the whole song in one key, a column read top
to bottom is one section across twelve keys. The draft had it inverted, which
reverses what a row means. Pinned by test.

**3. The matrix does not define the stages.** It points at the learning-status
panel and names no rung. Same reason `stageCriteria` became the single
definition of the rules in 3a-6a: two statements of one thing drift, and copy
is the half that drifts silently because nobody re-reads it. Pinned by test,
positively (it names the panel) and negatively (it names no rung) — "does not
mention cross-key" alone would pass on copy that said nothing at all.

**4. The matrix was rewritten for `Test song` being ungated.** The parked draft
described the whole-song test unlocking once every section was comfortable,
which stopped being true when the gate was removed. Copy describing a gate that
no longer exists is worse than no copy: it tells the reader they cannot do
something they can. Pinned by test, aimed at the gate PHRASING rather than at
the word "unlocks" — the log-a-run bullet says it unlocks nothing, which is
true and worth saying, and a blanket ban would have failed on correct copy.

**5. The chord-function claim was FALSE and was removed, not softened.** The
draft said "tap a chord to see what it's doing in the key". Verified against
the code: tapping a chord opens the edit choices row — break, new row, hide,
note — and shows no function at all. The real mechanism is the **notation**
control (`lib/notationPref`), which re-renders every chord as numbers or roman
numerals, and is app-wide rather than per-chord. The bullet now describes that,
including that the choice applies everywhere. Pinned by test.

---

## What shipped

Reproduced below as it was written. **If this disagrees with the module, the
module is right.**

## Lead sheet

**What this is for**

- The chords and lyrics, laid out so you can learn how the song moves — not
  just look up what comes next.
- A working surface. What you put here is what you read at the keyboard, and it
  is meant to be edited as your understanding of the song changes.
- Getting familiar with the harmony is the job. The record of the chords is a
  side effect.

**How to use it**

- Add and correct chords as you go. Nothing has to be right on the first pass.
- Split phrases where you hear them break, not where the lyrics happen to wrap.
- Name the sections the way you think of them — those names carry through to
  the matrix and to everything you log.
- Keep it open while you play early on. Reading it repeatedly is how the shapes
  stop needing to be read.
- ⚠ *Tap a chord to see what it's doing in the key.* — UNVERIFIED. Verify
  against the code and keep only if true.

---

## Progressions drawer

**What this is for**

- The whole song's chord movement in one run, with the lyrics stripped away.
- Two readings at once: scan the headings to compare section shapes, or read
  straight down to follow the song's arc.
- Useful when the question is "what is this song doing harmonically", which the
  lyrics get in the way of.

**How to use it**

- Open it from the bottom of the lead sheet. It shares that space with the
  lyrics drawer — opening one closes the other.
- Split and annotate phrases here. It edits the same phrases the lead sheet
  does, so a break made here shows up there.
- Hide passing chords you do not want to see while you are working on
  structure.
- Section names and section order are set on the lead sheet, not here.

---

## Matrix

**What this is for**

- Every section of the song against every key, so you can see where the song is
  solid and where it isn't, across all twelve keys.
- One **cell** per section per key. Sections run across the top as columns; keys
  run down the side as rows. So a **row** read left to right is the whole song
  in one key, and a **column** read top to bottom is one section across all
  twelve keys.
- This is where progress through the song is recorded.
  - **OPEN:** the draft ended this bullet with "and where the stage suggestions
    come from", which means nothing to a reader who has not met the ladder.
    Either define stages briefly here or drop the clause and let the learning
    status panel carry it — the criteria live there anyway. Decide when the
    copy comes back.

**How to use it — the path through a key**

- Work **one section at a time**, starting in the song's original key.
- Tap a cell to log what you did on that section.
- A section becomes **comfortable** after **three clean run-throughs in a row**,
  at or within 10 BPM of the song's target tempo. Slower runs are recorded but
  do not count toward it.
- When **every section in a key is comfortable**, the **whole-song test**
  unlocks for that key.
- Passing it — **three clean run-throughs in a row, in one sitting** — makes
  that key **solid**, and moves the song to **Comfortable**.
- **+ log a run** records a single pass of the whole song in any key, at any
  time. It does not unlock anything; it is how you show you have taken the song
  into a key without working it section by section.

**Two ways to log** — *ships with 3d, not 3a-6*

- **Practice** is working on the song: building the lead sheet, getting it under
  the fingers, drilling a section, playing it through. It records time, not a
  result. Nothing is graded.
- **Test** is a run-through at tempo that is either clean or it isn't. This is
  what moves a section toward comfortable.
- Practice is recorded for the song; a test is recorded for one section in one
  key.
- If you are not sure which you did, it was practice.

---

## Practice history

**What this is for**

- Everything you have logged on this song, most recent first.
- The record of how the work actually went, next to the matrix's record of
  where it got you.

**How to use it**

- Tap a row to expand it — sections, keys, notes, and how the session felt.
- Use it to see whether you have been circling the same section, or when you
  last touched the song at all.
- Notes are the part worth writing. What you noticed today is the thing you
  will not remember next week.

---

---

## Still open

- Whether the matrix copy wants a line about the relationship between
  **Test song** and **log a run** beyond what each bullet says separately.
  They are adjacent controls with different consequences and the copy explains
  them one at a time.
- The practice-vs-test lines, which describe a modal that does not exist until
  **3d** and ship with it.
