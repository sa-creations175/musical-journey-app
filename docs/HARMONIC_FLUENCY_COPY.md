# Approved copy — Harmonic Fluency

Approved by Silas, 8 Sep 2026. Companion to the rulings in the Tab 1 brief of
the same date.

**These are the words. Do not reword them, and do not write new ones.** Anything
this file does not cover is still unwritten — stop and ask rather than inventing.
What is still unwritten is listed under **Unruled** at the bottom, so the gap is
a list rather than a discovery.

`src/modules/harmonic-fluency/__tests__/approvedCopy.test.ts` reads this file and
asserts the app says these words. Editing a string here without editing the code
fails the suite, and so does the reverse.

---

## The filter row — what each line is called

Ruling 24. Title case. The order below is the order on screen.

| facet | label |
|---|---|
| key | Key |
| note | Note |
| degree | Number |
| fromDegree | Starting Number |
| movement | Distance |
| progression | Progression |
| pentatonic | Pentatonic |
| slashDegrees | Slash Chord |
| keyRelation | Maj/Min Key Relation |
| enharmonicKind | Enharmonic |

**Two facets are not on the row** (ruling 25). `semitones`, because Silas does
not think in half steps and the Number chips already isolate a fifth or a
tritone. `enharmonicGroup`, because Distance covers it. Both are still computed,
so a link that names one still narrows the pool; nothing on screen offers them.

**Cadence and progression are one row** (ruling 26). A 5 1 is a little
progression, none of these is a cadence in the strict sense, and the secondary
dominants never were.

---

## The filter row — the controls

Ruling 28.

| id | string |
|---|---|
| filters | Filters |
| clear | Clear Filters |

Folded is the default. When it is folded and something is on, the toggle reads
`Filters · 2` — the separator is a middot with a space each side, and the number
counts the **rows** that are saying something, not the chips lit across them.

---

## The Progression chips

Ruling 26. The stored value is unchanged and still what a link carries.

| stored | chip |
|---|---|
| ii-V-I | 2 5 1 |
| V/ii | 5 of 2 |
| V/iii | 5 of 3 |
| V/IV | 5 of 4 |
| V/V | 5 of 5 |
| V/vi | 5 of 6 |
| 1-5-6-4 | 1-5-6m-4 |
| 1-6-4-5 | 1-6m-4-5 |
| 1-6-2-5 | 1-6m-2m-5 |
| 1-4-5 | 1-4-5 |
| backdoor | 4m-♭7-1 (backdoor) |

**THE FIVE NUMBERED CHIPS FOLLOW THE PROGRESSION-SPELLING SETTING.**
Silas's ruling of 10 Sep 2026 — one spelling everywhere. `1-5-6-4`, `1-6-4-5`,
`1-6-2-5`, `1-4-5` and `backdoor` are no longer words typed into
`facetDisplay`; they are built from the shape's own chords by the one
formatter, so the chip that filters to a card and the card's own question
cannot spell the progression two ways. **The table above shows the DEFAULTS**
— hyphens, every quality — and a reader who has set dots, or turned qualities
off, sees the chip change with everything else.

`ii-V-I` and the five secondary dominants stay words: `ii-V-I` is Functional
Harmony's chip as well as this deck's (ruling 26 made the two share it), and
"5 of 2" is not a row.

**One chip per generated progression, and the row shrinks when the deck does.**
It was four, then twelve, then eight, and is eleven: `6-4-1-5`, *gospel walk-up*,
*rhythm changes* and *neo-soul* left with their cards, because a chip for a
progression the deck no longer generates is a filter that finds nothing.

**The three that arrived, 9 Sep 2026, are Modal Improvisation's.** That family
asks about the 5 of the 2, the 3 and the 4 as well as the 5 and the 6, and
`V/V` and `V/vi` were already this row's words for the last two — so the other
three are spelled the same way rather than starting a vocabulary of their own,
and one chip gathers both families. The chip words are the prototype's own
`num` values; none of it is new copy.

**Numbers lead, names follow.** A progression with a name reads as the numbers
first and the name in brackets, on the chip and in the card's own question:
*The 4m-♭7-1 (backdoor) in F major is _____*. The stored value is still
`backdoor`, so every link that named it resolves. The backdoor's 4 keeps its
**m** even under "qualities only on spelled loops" — a major 4 is not a
backdoor — and loses it only when qualities are turned off entirely.

**The backdoor's numbers changed on 9 Sep 2026, and its cards with them.** It is
4 minor → ♭7(7) → 1, verified with Silas — "4m and ♭7(7) are both part of the
parallel minor chords". The 1 4 ♭7 1 those thirteen cards asked is a different
progression, so they are retired and thirteen new ones take their place under
ids that have never existed. The chip and the stored value are unchanged in
kind: same filter, new numbers.

**`ii-V-I` is one chip for both families.** Progression Vocabulary's 2-5-1 cards
carry the same stored value as Functional Harmony's, because ruling 26 said a 5 1
is a little progression however it is spelled — two chips both reading "2 5 1"
would be the row a reader has to know is the same row.

---

## Key names carry their mode

Approved by Silas, 9 Sep 2026. A standing rule, not a one-family one.

**A key is written "the key of C major" or "the key of C minor".** Never a bare
letter, never "C" alone, and never "C major" without "the key of" where the
sentence is about the key. A capital letter on its own mid-sentence reads as a
stray word rather than as a key, which is the confusion `CLAUDE.md` records as
having been caused more than once.

```
In the key of C major, the band is on D7 (5 of 5). Which notes fit?
```

**Applied across the deck** — every generated question and explanation where a
key is named, and the hand-written prose cards with it:

| family | now reads |
|---|---|
| Progression Vocabulary | The 2-5-1 in the key of B♭ major is _____ |
| Scales & Modes | The mode of the key of C major starting on D is _____ |
| Notes of the Number System | In the key of C major, what is the ♭6? |
| Functional Harmony | 5 of 6 in the key of C major resolves to _____ |
| Scales & Modes | You're in the key of C major. Which minor pentatonic fits… |
| Key Signatures | The parallel minor of the key of D major is _____ |
| Modal Improvisation | Dm is the 2 of the key of C major. |

**A chord is not a key and a scale is not a key.** "Cm7", "the 5 of G" where G is
a chord, "E♭ major pentatonic", "D melodic minor" and "A Aeolian" all stay as
they are. Interval cards name two notes and no key, so none of them changed.

**No question is held back any more.** Four were, for one afternoon:
`X major has _____ sharps`, `The relative minor of X major is _____`,
`The relative major of X minor is _____` and `What is 1/3 in X major?`. Retired
hand-written cards paired onto those four by asking the identical sentence, and
their answers — "1", "A minor", "C/E" — are each given by more than one live
card, so rewording them would have orphaned a reader's practice rather than
moved it.

Those retired records went with the migration passes on 10 Sep 2026 (restructure
commit 9). Nothing pairs on text now, so the four took the rule:

```
The key of G major has _____ sharps
The relative minor of the key of A♭ major is _____
The relative major of the key of F minor is _____
What is 1/3 in the key of C major?
```

---

## The 1 6 2 5 explanation

Approved by Silas, 9 Sep 2026 (evening). Generated in every key with that key's
own chords. This is the key of E♭ major:

```
1-6m-2m-5 in the key of E♭ major is E♭-Cm-Fm-B♭, the turnaround.
It's sometimes used to walk back to the 1 and go round again.
```

**The two rows in it follow the progression-spelling setting** — the degrees
and the chord names both — so this is the sentence at the defaults rather than
the only sentence. The WORDS are approved copy and do not move.

**It replaced the generator's own placeholder**, which was flagged as new copy
when it was written: the turnaround had no hand-written card to lift an
explanation from. The old sentence ended "Rhythm changes is the same four
numbers played as sevenths" — true, and a second fact about a different
progression on a card about this one. It is gone.

**The spacing question is settled, 10 Sep 2026.** It read "1 6 2 5" in the
explanation and "1-6-2-5" in the question, and neither said the 6 is minor.
Every chord shows its quality now, and the separator is **whatever the reader
has set** — dot, hyphen or space, hyphen by default — in the question, the
answer, the explanation and the rotate button alike. One formatter,
`lib/progressionRow`, reading `lib/progressionSpelling`; nothing builds the
string itself. *Corrected 10 Sep 2026: this paragraph named the middle dot as
though it were fixed, which it was for the afternoon between the ruling and
Settings' Note & Progression Spelling section.* The arrow is spoken for: it
means resolution, which is why the passes keep it and a row of chords never
uses it.

---

## The marked notes

Approved by Silas, 9 Sep 2026 (evening). One name for one mark.

Modal Improvisation's reveal draws the answer scale and marks the notes the home
key does not have. The minor-target cards have called them **the marked notes**
since Silas's sentence landed; the major-target cards said "the highlighted
notes". Both say **marked** now, and no card in the deck says "highlighted".

---

## The minor-target sentence

Approved by Silas, 9 Sep 2026. Modal Improvisation's `5 of 2`, `5 of 3` and
`5 of 6` cards, generated per card so the chords, the numbers and the key are
the card's own. This is the `5 of 6` in the key of C major:

```
When a secondary dominant takes you to a minor chord, improvise over that
dominant with the melodic minor of the chord you're landing on, which is just
that chord's major scale with a ♭3. Here E7 (the 3 as a dominant, the 5 of 6)
lands on Am (the 6m), so while you're on the E7 play A melodic minor: A major
with a C (♭3) instead of a C♯ (3). Once you land, you're back in the key. The
marked notes are the ones the key of C major does not have.
```

The number in the first bracket is **the dominant's own degree in the key** —
`5 of 2` is the 6, `5 of 3` is the 7, `5 of 6` is the 3. The second is the
target's degree with "m". The two notes in the last clause are the target's 3
and ♭3, spelled in the target's key.

**It replaced "For a minor target that is just C major with one note raised: the
E7 chord's third"**, which was true on a `5 of 2` and on nothing else. It also
takes the "marked notes" sentence with it — its own last clause says the
same thing — so a minor-target card carries one such clause and not two.

**"an F", not "a F".** Silas's example is "a C (♭3) instead of a C♯ (3)", which
is right for C and wrong for A, E and F. The letter decides the article and the
accidental never does — the same rule the Distance chips already take.

---

---

## The Modal Improvisation row

Approved by Silas, 9 Sep 2026. What the family is, on the dashboard and anywhere
else a row has to describe itself.

```
Modal Improvisation: the band lands on a chord; name the scale that fits over
it. In-key chords stay in the key; a borrowed chord uses the key of the chord
it's pulling toward.
```

**It replaced the prototype's own page copy**, which read "Pick a key and a chord
the band is sitting on…". That was written to sit above a click-through with
chips on it: it opened by telling the reader to pick something, which no other
row description does, and it named the play control "Hear It" where the button
says "Hear it".

---

## The Distance chips

Ruling 27. Interval words, never half-step counts and never the coordinate.
A perfect interval drops its quality — "down a fifth", not "down a perfect
fifth". Every other quality keeps it.

One row covers both families that have a distance: Number System Math, whose
cards ARE movements, and Interval Identification, whose cards name the same
distance from their two notes.

| stored | chip |
|---|---|
| up:m2 | up a minor second |
| down:m2 | down a minor second |
| up:M2 | up a major second |
| down:M2 | down a major second |
| up:m3 | up a minor third |
| down:m3 | down a minor third |
| up:M3 | up a major third |
| down:M3 | down a major third |
| up:P4 | up a fourth |
| down:P4 | down a fourth |
| up:A4 | up an augmented fourth |
| down:A4 | down an augmented fourth |
| up:d5 | up a diminished fifth |
| down:d5 | down a diminished fifth |
| up:P5 | up a fifth |
| down:P5 | down a fifth |
| up:m6 | up a minor sixth |
| down:m6 | down a minor sixth |
| up:M6 | up a major sixth |
| down:M6 | down a major sixth |
| up:m7 | up a minor seventh |
| down:m7 | down a minor seventh |
| up:M7 | up a major seventh |
| down:M7 | down a major seventh |

---

## The slash chord deck

Ruling 30. Seven shapes. 6/♭7 is out. The card asks in scale degrees, because
that is what a chart says; the reveal adds **one line** underneath with the
chord-tone reading.

| shape | chord-tone reading |
|---|---|
| 1/3 | the 1 in first inversion |
| 5/7 | the 5 in first inversion |
| 1/5 | the 1 in second inversion |
| 4/5 | the dominant sus sound (9sus4) |
| 5/1 | the 5 over its 4th, a suspended sound |
| 1/4 | the 1 over its 4th |
| 2m/1 | the 2 minor over the key's home note |

The line is rendered as a sentence — first letter capitalised, full stop — and
nothing else about it is written. **No shape added later gets a line invented
for it.**

---

## Category names

Ruling 29. "Number", not "Degree".

| category | title |
|---|---|
| scale-degree-math | Number System Math |
| degree-notes | Notes of the Number System |

---

## The four question types in Notes of the Number System

Ruling 29. **These names surface nowhere in the app today.** The four generators
are internal, the family renders as one category, and nothing on screen
distinguishes them. Recorded here so the names exist when a surface needs them;
no code was changed to introduce them.

| generator | name |
|---|---|
| nameItCards | Name the Note |
| placeItCards | Name the Number |
| pressItCards | Press the Number |
| findKeyCards | Name the Key |

---

## The worked method's two headings

Ruling 35. Number System Math's reveal is a worked method, one operation per
line, in two steps. These are the two step headings, the same on every card —
the second used to carry the landing number and no longer does.

| step | heading |
|---|---|
| 1 | FIND THE ENDING SCALE DEGREE |
| 2 | FIND ITS QUALITY |

---

## The explanation sweep

Ruling 35. The full phrase "scale degree" stays where it reads naturally — the
slash-chord explanations, the mode questions, the leading-tone card. A **bare**
"degree" meaning the number does not. Every string changed, in full:

| card | now reads |
|---|---|
| fh-19 | The iii — the chord built on the 3rd number — is |
| mo-1 | starting on the 2nd number. |
| mo-6 | Locrian starts on the 7th number — unstable |
| enh-n-11 | the leading tone of C♯ major / raised numbers. |
| enh-n-15 | the 3rd of C♯ major / raised numbers. |
| enh-n-17 | heavily-flat keys and lowered numbers. |
| nn-12 | number 4 is B. |
| iv-inv-sum | both ends count the number they sit on |

One word for one word, and the ordinal stays. "The chord built on the 3rd
degree" becomes "the chord built on the 3rd number", not "the chord built on the
3" — dropping the ordinal would take the teaching with it, and
`strippedParentheticals.test.ts` says so about this exact card.

Outside the cards, two panels and one page:

| where | now reads |
|---|---|
| Diatonic Chord Qualities panel | Which quality sits on each degree of major and the three minors: natural, harmonic and melodic (Silas, 14 Sep 2026) |
| Diatonic Chord Qualities panel | Held by NUMBER rather than by key |
| Harmonic Fluency intro | numbers up, down and around |

---

## Card text

Ruling 29. The `placeItCards` question asks for a **number**.

> In the key of {Key}, {Note} is which number?

---

## Unruled

Still placeholder. Nothing below was written by Silas, and nothing below should
be treated as approved.

- **"Hear it"** — the label on the play control, on every family. Not newly
  written: it is the string the degree-and-note card already carried, kept
  when ruling 33 made one control out of two. The degree-math card's old
  label — "hear it — home, then {n}, then the answer" — is gone, because one
  control cannot say a different sentence per family.
  *Replaced on 14 Sep 2026* by the play chips, ♪ Together · ♪ Up · ♪ Down ·
  ♪ Up and Down (`play-as-chips-prototype.html`). Stop stays.
- **Filter chips with no ruled wording** — the Pentatonic row (`major`, `minor`,
  `relative`), the Maj/Min Key Relation row (`relative`, `parallel`) and the
  Enharmonic row (`note`, `interval`) print their stored value as-is.
- **Tile labels** on the module home and the category pages.
- **Presets** — the "diatonic" and "chromatic" degree sets the filter can already
  express, still unnamed and still unbuilt.
- **Sort controls** on the category detail stack.
- **"Layout"** — the grid's axis toggle.
- **"Apply to every key"** — the Edit-what-counts follow-up.
- **Category descriptions** for Notes of the Number System, on the dashboard's
  affordance panel. The category now has a ruled name but no description, so
  the panel renders nothing rather than inventing one.
