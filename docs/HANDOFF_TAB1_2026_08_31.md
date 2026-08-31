# Handoff — Tab 1, 31 Aug 2026

You know the repo. You know nothing about yesterday. This is what
changed, what broke quietly along the way, what was deliberately left
undone, and the rules that made the work go the way it did.

---

## 1. The commits

In order. `0635e0c` in the middle of them is **Tab 2's**, not this
work — it made the shapes card and the grid read one enumeration.

**`29cb848` — the panel can be a strip, and the metronome verdict is back**
Open Lead Sheet used to close the session panel to show the chart, which
ended the session: clock, streak and banked runs gone. It now switches
the same mounted panel into a strip across the top of the page, so the
session survives. Also restored the rule that stopping the metronome
mid-test-run ends the run and asks whether you finished it — that rule
existed only in a component deleted the day before and had silently
stopped being enforced.

**`35ec78b` — one rendering of the four ratings, in place**
The panel drew tall rating cards and the strip drew small chips: two
components for one question. Now one `RatingChips` everywhere. The
rating stopped being its own screen and became a box under the run list,
so the session stays visible while you answer. Label is **Rate That
Run**. The scope picker became practice-only.

**`b4655ef` — playing a run is not a screen**
Deleted the drilling step. Playing a run used to replace everything with
a stopwatch page. Now the run clock appears beside the session clock and
the ladder band, run list, metronome, rating box and Open Lead Sheet all
stay put. The step trail went; Pause and End Session moved to the bottom
row.

**`588546d` — a run is ended, then rated**
Rating a run used to also end it — one tap meaning both "I finished" and
"here is how it went". Now **End Test Run** / **End Practice Run** ends
it, and the chips are visible but inert until then, with **After the
run** where **Required** sits.

**`eed5131` — a testing session is logged, and the doors say what they do**
Ending a test used to ask whether you wanted to cancel, so a testing
session had two exits wearing three names and its minutes were lost
every time. It now reaches the same wrap-up practice uses. The bottom
row reads **Cancel Session · Pause Session · Log Session** (**Resume
Session** while paused; plain **Close** before a mode is picked).

**`662f489` — the session clock runs, the settings stay inside, Started is blue**
Five song-side fixes: the practice session clock that sat at 00:00, the
metronome settings that opened half off screen, the dropped-status
banner that pushed the matrix below the fold (now collapsed behind the
same disclosure the criteria row uses), the panel's height, and the
Started pill that rendered grey while Started cells rendered blue.

**`c650935` — a time row knows whether the run was a test**
One boolean on the drill-session row. Before it, "practice time versus
testing time" had no data behind it and neither did "show me my test
runs".

**`505c369` — the grid names statuses, and the modal becomes a section**
The scales page rebuilt from its prototype. Cells name a status in the
six words instead of being colour-shaded squares; three switchable
layouts; the cell modal and the hand chooser are deleted and **All
Three** with them; Progress Details stands under the grid in the app's
dark green band and fills when you click a cell.

---

## 2. The five bugs, and what actually caused each

Every one was invisible from outside. None would be found by looking.

**The run clock carried over between runs.** The run reused
`useSessionClock`, which banks its start in a ref the first time it runs
and never clears it — correct for a session, wrong for a run. So every
run after the first inherited the one before, and **a drill with a
sixty-second target ended the instant it began**, because the clock
already read past its target. Fixed in `588546d` with a clock that
counts from the run's own start.

**A run rated in the strip was silently discarded.** `completed()`
computed `tooShort` from component state while the row recorded the
value passed in. A strip-rated run had no state value, so it was judged
"too short" on a length it did not have — and a too-short run writes
nothing, with no error. Fixed in `35ec78b`; both now read one figure,
live while going and frozen once ended.

**The song session clock never started.** A song's session clock is a
stored record and the panel reads it. **Nothing in the app ever called
the method that starts it** — so it read zero for a whole sitting while
the run clock beside it counted normally. The panel was reporting a
timer that had never begun. Shapes were unaffected because their clock
counts from the panel's own mount. Fixed in `662f489`.

**The wrap-up asked four questions and wrote none of them.** It
collected what you worked on, which sections you touched, a note and the
sitting's minutes, then handed them to a caller that dropped all four.
The method that writes a session log existed on the surface contract
with **no caller anywhere in the app**. So "log a test like practice
does" first required practice to log at all. Fixed in `eed5131`.

**The scope picker on a test threw its own value away.** The test writer
had always sent `scope: null`, so the control rendered, accepted input,
and had it discarded before it reached the writer. Removing it from
tests in `35ec78b` therefore changed no recorded data — which was
checked before the change, not assumed.

---

## 3. What is not built, and why

**The counting unit.** Totals should count drillable things rather than
cells — 288 scales, 720 chord shapes — and should shrink when something
is taken out of the score, with goals and the session generator's scope
reading the same number so the two cannot drift. Deliberately not done:
it moves goal surfaces and the generator's scope, which is a wider blast
radius than a page rebuild. The scales page is built against **today's**
counting and reads `sectionCells` so the page and the card come from one
call.

**The card's Total time and Last practiced lines.** Separate surface,
and they need the practice-versus-testing split, which only landed in
`c650935`. Now unblocked.

---

## 4. The next build

**Two fields on the drill-run row**: the tempo a run was played at, and
which sitting it came from. Neither is recorded. The scales Progress
Details log currently shows rating, length and when, and **omits those
two rather than inventing them** — the tempo could be read off the
metronome's current setting and the sitting matched by timestamp, and
both are a guess wearing a join, wrong the moment two runs land in the
same second. The values already exist where the row is written: the
panel knows the bpm and it knows the session id.

**Retiring the in-session drill pop-up.** `ScalesDrillModal`,
`DrillSessionModal` and `VoiceLeadingDrillModal` are still reached by
the in-session runner through `SessionBlock`. They are not the cell
modal `505c369` deleted. They should be replaced by the session panel
the rest of the app now uses.

**Standing permission from Silas, and its limit:** a field may be added
to the drill-run row **without asking** when the value already exists in
the code at the point the row is written and no rule changes. **Anything
that changes a rule still stops.** The two fields above qualify.

---

## 5. The rules that governed the work

- **Prototypes are binding.** Where a prototype and the code disagree,
  **the prototype wins**, and a signed-off prototype is the answer
  rather than a prompt to re-ask. Twice yesterday the prototype was
  right and the brief describing it was not — check the file, not the
  description of it.
- **No user-facing string exists unless it is in
  `docs/WHOLE_SONG_TEST_COPY.md` or `docs/TEMPO_SOURCE_SPEC.md` §10.**
  If a string is needed and is in neither, stop and list it. New copy is
  added to the copy file **in the same commit, before anything uses
  it**.
- **Six status words only**: Not Started, Started, Needs Work,
  Developing, Fluent, Mastered. **Fluent+** is the only permitted
  shorthand. "Acquired" and "In Progress" are retired.
- **The app's word is cell, never square** — in the UI, in reports and
  in commit messages.
- **Two tabs share one working tree and one git index.** Only one builds
  at a time. **Stage explicit paths, never the whole tree**, and commit
  a file when it is finished rather than holding a batch.
- `npm run build` before every commit, not just the tests — `tsc -b`
  catches strict errors the test run does not.

---

## 6. Where the prototypes stand

**`docs/scales-grid-face-prototype_1.html`** — walked and signed off
yesterday, and **built** in `505c369`.

**`docs/tempo-source-prototype_7.html`** — still binding, with **one
deliberate divergence**: it rates a run mid-flight, with live chips and
no End button. The app now **ends a run before it is rated**, by
Silas's ruling. On that one point the prototype is the older document
until he redraws it. It also predates Pause, End Session and the cancel
confirmation, which were decided after it was drawn.

**Do not edit either, or any other prototype.** They are Silas's to
change.
