<!--
The Harmonic Diary's "How a chord gets its name" sheet reads this file, and
nothing else. Signed off by Silas, 12 Sep 2026 (chord-naming-reference v4).

These are his words. Change a line here and the app changes with it; there is
no second copy in the code. Parsed by
`src/modules/harmonic-diary/chordNamingReference.ts`, which throws on a shape it
does not recognise, so keep to what is already here: one `#` title, `##`
sections, a numbered list, pipe tables, a bulleted list, and `---` before the
closing line. **bold** and `mono` are the only inline marks.
-->

# How a chord gets its name

Which notes the name promises, and which ones are yours to add, drop, double or move. Degrees are counted from the root, so every row works in every key; the example column is in the key of **C**.

## Applies to every chord

1. **The 5th is free.** Leave it out of any chord and the name does not change. C E B D is still Cmaj9.
2. **Doubling is free.** Any note the chord already has can be played again in another octave. Two Cs and two Gs is still C.
3. **Order above the lowest note is free.** E G B D and E B D G are both the same Cmaj9 hand. That is voicing, and it is your taste.
4. **The lowest note is the only order the name tracks.** Root at the bottom is the plain chord. Anything else at the bottom is an inversion and is written as a slash: `C/E`, `C/G`. Same chord, still.
5. **The number promises a 7 underneath.** 9, 11 and 13 are short for "a 7 chord with that colour on top". No 7 in the hand, no 9 chord: that A or D is a 6 or an add.
6. **Which 7 decides the family word.** maj7 (a major 7th under the colour) reads `Cmaj9`. A ♭7 with a major 3rd reads `C9`: a bare number always means dominant. A ♭7 with a minor 3rd reads `Cm9`.
7. **Small number or big number is decided by the 7.** The same note is a 2 or a 9, a 4 or an 11, a 6 or a 13. With no 7 in the chord it takes the small name (add2, sus4, 6); over a 7 chord it takes the big one (9, 11, 13).
8. **Colour words are stackable, not swappable.** The 13 lets the 9 and 11 ride along without renaming; the 9 lets nothing above it ride along. If you want a 13 with no 9, it is still a 13.

## Major

The equation starts at 1 · 3 · 5. A major 3rd is what makes it major; the 7, when there is one, is the major 7.

| Name | Must be in it | Named by | Your choice | Example in C |
|---|---|---|---|---|
| major | 1 · 3 · 5 | the major 3rd, nothing else | doubling, order | C E G |
| maj7 (Δ7) | 1 · 3 · 7 | the major 7 | 5 | C E G B |
| maj9 | 1 · 3 · 7 · 9 | the 9 over a major 7 | 5 | C E G B D |
| maj13 | 1 · 3 · 7 · 13 | the 13 over a major 7 | 5 · 9 · 11 | C E B D A |
| maj7♯11 | 1 · 3 · 7 · ♯11 | the raised 11 over a major 7 | 5 · 9 | C E B F♯ |
| 6 | 1 · 3 · 6 | a 6 with no 7 | 5 | C E G A |
| 6/9 | 1 · 3 · 6 · 9 | a 6 and a 9 with no 7 | 5 | C E G A D |
| add9 | 1 · 3 · 9 | a 9 with no 7 and no 6 | 5 · where the 9 sits: low beside the 3rd it is often written add2 | C E G D |

## Minor

Starts at 1 · ♭3 · 5. The flat 3rd is what makes it minor; the 7, when there is one, is the ♭7 unless the name says mMaj7.

| Name | Must be in it | Named by | Your choice | Example in C |
|---|---|---|---|---|
| m (−) | 1 · ♭3 · 5 | the minor 3rd, nothing else | doubling, order | C E♭ G |
| m7 (−7) | 1 · ♭3 · ♭7 | the ♭7 over a minor 3rd | 5 | C E♭ G B♭ |
| m9 | 1 · ♭3 · ♭7 · 9 | the 9 over a m7 | 5 | C E♭ G B♭ D |
| m11 | 1 · ♭3 · ♭7 · 11 | the 11 over a m7 | 5 · 9 | C E♭ B♭ D F |
| m13 | 1 · ♭3 · ♭7 · 13 | the 13 over a m7 | 5 · 9 · 11 | C E♭ B♭ D A |
| madd4 | 1 · ♭3 · 4 | a 4 added to the minor triad with no 7; also written m(add11), which is the same chord. With a ♭7 it becomes m11 | 5 · where the 4 sits | C E♭ F G |
| mMaj7 (mΔ7) | 1 · ♭3 · 7 | a major 7 over a minor 3rd | 5 | C E♭ G B |
| m6 | 1 · ♭3 · 6 | a 6 with no 7 | 5 | C E♭ G A |
| m6/9 | 1 · ♭3 · 6 · 9 | a 6 and a 9 with no 7 | 5 | C E♭ G A D |
| madd9 | 1 · ♭3 · 9 | a 9 with no 7 and no 6 | 5 · where the 9 sits: low beside the ♭3 it is sometimes written madd2 | C E♭ G D |

## Dominant

Starts at 1 · 3 · 5 with a ♭7. A major 3rd and a ♭7 together are what make it dominant, and a bare number (7, 9, 13) always means this family.

| Name | Must be in it | Named by | Your choice | Example in C |
|---|---|---|---|---|
| 7 | 1 · 3 · ♭7 | a ♭7 over a major 3rd | 5 | C E G B♭ |
| 9 | 1 · 3 · ♭7 · 9 | the 9 over a 7 | 5 | C E G B♭ D |
| 11 | 1 · ♭7 · 9 · 11 | the 11 over a 7; the 3rd is usually dropped so it does not rub the 11 | 3 · 5 | C B♭ D F |
| 13 | 1 · 3 · ♭7 · 13 | the 13 over a 7 | 5 · 9 · 11 | C E B♭ D A |
| 7sus4 | 1 · 4 · ♭7 | a 4 in place of the 3rd, with a ♭7 | 5 | C F G B♭ |
| 9sus4 | 1 · 4 · ♭7 · 9 | the 9 over a 7sus4; the same notes as B♭ over C, or Gm7/C | 5 | C F B♭ D |
| 7♭9 | 1 · 3 · ♭7 · ♭9 | the flat 9 | 5 · 13 | C E B♭ D♭ |
| 7♯9 | 1 · 3 · ♭7 · ♯9 | the sharp 9 | 5 · 13 | C E B♭ D♯ |
| 7♯5 | 1 · 3 · ♯5 · ♭7 | the raised 5th; here the 5th is not free, it is the point | 9 | C E G♯ B♭ |
| 7♯9♯5 | 1 · 3 · ♯5 · ♭7 · ♯9 | both alterations | nothing left | C E G♯ B♭ D♯ |

## Sus · Diminished · Augmented

The other three triads. Sus swaps the 3rd out; diminished flattens the 5th under a minor 3rd; augmented raises the 5th under a major 3rd. In these, the 5th is part of the name, so it is not free.

| Name | Must be in it | Named by | Your choice | Example in C |
|---|---|---|---|---|
| sus2 | 1 · 2 · 5 | a 2 where the 3rd would be | doubling, order | C D G |
| sus4 | 1 · 4 · 5 | a 4 where the 3rd would be | doubling, order | C F G |
| dim (°) | 1 · ♭3 · ♭5 | a minor 3rd with a flat 5th | doubling, order | C E♭ G♭ |
| m7♭5 (ø) | 1 · ♭3 · ♭5 · ♭7 | a ♭7 over a dim triad | 11 | C E♭ G♭ B♭ |
| dim7 (°7) | 1 · ♭3 · ♭5 · 𝄫7 | a double-flat 7 over a dim triad; four notes, nothing added | doubling only | C E♭ G♭ A |
| aug (+) | 1 · 3 · ♯5 | a major 3rd with a raised 5th | doubling, order | C E G♯ |

## Same notes, other name

- **C E G A D** is C6/9. Add a B and it is Cmaj13. One finger, two names, because the 7 turns the 6 into a 13.
- **C E G B D** is Cmaj9. Play it as E G B D over a C bass and it is still Cmaj9, rootless in the hand. Play E G B D with no C anywhere and it reads Em7.
- **C E G D** is Cadd9. Put the D down between C and E and some people write Cadd2. Same chord.
- **C E♭ G♭ A** is Cdim7, and so are E♭dim7, G♭dim7 and Adim7: the same four notes, named from whichever one is in the bass.
- **C E G♯** is Caug, and so are Eaug and G♯aug. Same trick, three notes.
- **C F G B♭** is C7sus4: the bare one-five feel. Add a D and it is C9sus4, which is the same notes as B♭ over C or Gm7/C. The D is the whole difference between the two.
- **C E B♭ D A** is C13 whether or not the G is in it, and whether or not the F is. The 9 and 11 ride along without renaming.

---

Written 12 September 2026 for the Harmonic Diary's info button. Degrees count from the root; a flat or sharp on a degree means that note is lowered or raised from what the major scale would give.
