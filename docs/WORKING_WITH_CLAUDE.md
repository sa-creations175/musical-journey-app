# Working With Claude — Silas's Guide

How I like to work with Claude, what I'm building, and the context that helps Claude help me effectively. Paste this at the start of any Claude conversation about personal projects.

Last updated: August 20, 2026

---

## Who I am

I'm Silas Humphries, a 2.5-year self-taught keyboardist based in Los Angeles, California. I'm building a suite of personal "operating system" apps — starting with the Musical Journey App (a comprehensive music practice PWA) and planning to extend to fitness, mental health, finance, and other life domains.

My musical taste centers on gospel, R&B, soul, jazz, neo-soul, and hip-hop. Key artists and producers who shape my ears: Babyface, Jermaine Dupri, Kirk Franklin, Fred Hammond, Boyz II Men, Whitney Houston, Frank Ocean, H.E.R., Daniel Caesar, Mariah Carey, Usher, J. Cole, Kendrick Lamar, Drake, D'Angelo, Erykah Badu, Stevie Wonder, Marvin Gaye.

---

## How I work best with Claude

### I want honest challenge, not agreement
If something doesn't make sense or there's a better way, tell me. I push back when suggestions don't land, and I want Claude to push back on me too when it matters. Gentle honesty over false agreement.

### Optimism balanced with truth
Keep telling me the truth, risks, and challenges — but also be optimistic when things are going well. Don't be doom-y about small setbacks. Acknowledge wins.

### One step at a time during complex coordination
When we're coordinating work across multiple systems (terminal, browser, different accounts), give me one instruction at a time. Don't stack multiple questions or steps in one message. I'll tell you when I'm ready for the next.

### Explain before executing
I want to understand WHY before WHAT. If you're about to suggest a build or instruction, tell me what we're scoping and why before writing the actual instruction. Help me verify the plan before we commit.

### Respect my energy
I'll flag when I'm getting tired. I'd rather pause than push through fatigue and make bad decisions. If you notice I'm fading, name it.

### Slow down when I ask
When I say "slow down" or "I'm confused," stop and simplify. Don't apologize at length, just slow down.

---

## My working patterns

### Articulate the "why" behind preferences
I don't just say "I like this better." I usually explain the reasoning. When I articulate it, that becomes a principle worth capturing.

### Ask about architecture before committing
Before big builds, I ask "how will this work?" and "what about updates?" and "what's the cost?" These aren't delay tactics — I want clarity before commitment.

### Flag when something doesn't feel right
If a design, color, or suggestion feels off, I'll say so. Don't dismiss my reactions; the app has to feel right to me.

### Accept short-term imperfection for long-term clarity
Sometimes I'll say "this is fine for now, capture as a future issue." Trust that and move on. We don't need to solve everything immediately.

### Prefer understanding over convenience
I'd rather understand what's happening than have things magically work. Explain the moving pieces.

---

## Build style I prefer

### Phased over monolithic
Break big builds into phases with testing between. Single-shot architectural builds stack bugs.

### Commit often
After each meaningful change, commit with a descriptive message. Rollback is cheap if we need it.

### Test realistic flows, not just features
Would I actually use this tomorrow? Does it serve its purpose? That matters more than "does this button work."

### Fix root causes, not symptoms
If a bug keeps recurring, we're treating the wrong thing. Dig deeper.

### Name it when builds fail to land
If Claude Code says it did something but it didn't ship, say so clearly. Don't make me discover it by testing.

### Trace downstream implications before approving plans
When CC proposes a change to a shared value (plannedSeconds, a schema field, a timing calculation), Claude Chat should explicitly ask: "what else reads this field, and does the change break any invariants?" CC should be required to trace dependents before the plan is approved — not discover breakage in the live run. If CC says "X stays unchanged to preserve invariant Y," Claude Chat should verify that Y still holds given the change.

---

## Communication preferences

### Short messages when coordinating steps
One thing at a time when I'm juggling multiple tools.

### Detailed messages when explaining architecture or principles
Take the space to explain fully when that's what I need.

### Acknowledge progress explicitly
When something works, name it. "Cloud sync is working" is different from jumping straight to the next task.

### Honest capability statements
Tell me what Claude can and can't do. "I can't verify specific song facts" is better than making up plausible-sounding details.

### Don't overexplain when I'm in flow
When I'm moving fast, short answers are better. When I'm lost, longer explanations help.

---

## Testing notes

*Added 20 August 2026, after the dashboard read layer.*

### A test on empty or uniform data cannot distinguish a rule from its absence

This has cost seven catches in one workstream, and every one was found by
**reintroducing the bug and watching the test stay green** — never by reading
the test.

The shape is always the same. A property test builds its fixture from an empty
catalog or from rows that all carry the same value. Sorting a uniform list is a
stable no-op. Averaging nothing is null whether or not the rule that nulls it
exists. Excluding a branch that contributes zero changes nothing. So the
assertion passes, the property is unprotected, and the test occupies the slot
that would have made someone look again.

The four:

- **Expansion indices into built order.** Fixture had no practice data, so
  sorting never reordered. Reintroducing sorted-order indexing passed.
- **The same property at depth 2.** Fixed at depth 1 and still uncovered
  deeper, because a different code path builds that key.
- **Mixed-kind roll-up.** Empty source meant neither branch was graded, so the
  parent was null for want of scores rather than for mixing units.
- **Mental viz excluded from S&P recency.** Both branches shared a timestamp,
  so the parent read the same either way.

A fifth, and the only one that reached the user rather than the suite:

- **Module rows were not in nav order.** `groupedView` sorts module rows on
  every render — the sort control's job — and the default view state carried a
  real sort (`accuracy / worst-first`). So a sort was always active, on load
  and after reset. Every test passed because nothing had been practised yet:
  all six modules scored null, and a stable sort left them alone. Reported
  twice before it was traced.

  **This one is specific to an app whose data starts empty.** A dashboard, a
  catalog, anything that ships with zero rows will pass an ordering,
  aggregation or exclusion test on day one and fail it on day thirty. Seed the
  fixture with data that VARIES before asserting anything about order or
  arithmetic.

A sixth, found the same way and worth stating as the general form:

- **An assertion against something that cannot change.** A test asserted
  `window.location.search === ''` to prove the compare control writes nothing
  to the URL. `window.location` does not move under `MemoryRouter`, so it
  passed whatever the screen wrote. Rendering the router's own query string
  and asserting on that fails the moment compare writes to it.

**The general form of all six: an assertion against something that cannot
change is indistinguishable from one against something that did not.** Empty
fixtures, uniform data and unreachable globals are three faces of the same
thing.

A seventh, found by reversing rather than by reading, and a **different face of
the same family**:

- **An assertion that is true for a reason other than the one you meant.** The
  dashboard's score column carries two legends — accuracy in percentage bands,
  fluency in the four rating names — and merging them would be the failure
  worth catching. The test asserted it as `labels(accuracy) !== labels(fluency)`.
  Feeding the fluency legend the accuracy table left it **still passing**,
  because the fluency side renders a trailing value the accuracy side does not,
  so the two label lists differed anyway. The inequality was real; it just had
  nothing to do with the property.

  The fix is to assert what each side actually SAYS rather than that they
  differ: accuracy states percentage ranges, fluency states the four ratings by
  name and never a percent sign.

  **The tell:** an assertion phrased as *"A is not B"*. Inequality passes for
  every reason except the one you care about, and there are always more of
  those than you think. Prefer *"A says X and B says Y"* — it fails when either
  half stops being true, and it is readable a year later.

### Two habits that catch it

**Reverse every property test, not only bug fixes.** Seven for seven: no trap
in this list was ever spotted by re-reading the assertion. Back the file up to
the scratchpad, reintroduce the behaviour the test forbids, watch it fail,
restore. **Back it up — do not `git checkout` it.** That reverts the whole file
to HEAD, which silently discards any uncommitted work in it. Done once during
the dashboard build; `npm run build` caught the damage, which is a second
argument for the type gate on top of the test gate.
If it passes, the test is decorative. And reversing it once proves the test
catches it *there* — where two code paths can produce the same property, both
need their own reversal.

**Guard the guard.** Where a test depends on its fixture having a property that
is not obvious from reading it, assert that property first: *"sorting genuinely
reorders this fixture"*, *"both branches have a real, different score"*. One
extra assertion, and it fails loudly the day someone simplifies the fixture.

### Numbers in reports

Three counts have now shipped wrong in reports before being caught — 432 for a
420, 104 for a 114, and 3,712 for a 3,266 — every one from arithmetic done
while writing rather than read off the source. **If a number was not read from
the code, say so when writing it.** A number stated plainly reads as verified,
and that is the whole problem: the reader cannot tell a counted figure from a
guessed one, so the guess inherits the trust.

The third slipped into a commit message rather than a report, which is worse in
one way — the message is not editable without rewriting pushed history, and
rewriting history to correct prose is not worth it. The correction went into
the docs instead. **Prefer reading the number even when it seems obvious**; a
throwaway test that prints it costs a minute.

## Technical context

### My setup
- Mac (MacBook Pro)
- Safari primarily, Chrome as backup
- Terminal + Claude Code for development
- Projects live in `~/Documents/`
- GitHub username: `sa-creations175`
- Vercel account active
- Supabase account active

### My apps' infrastructure pattern
- React + TypeScript + Vite + Tailwind + Dexie (local)
- Supabase for cloud sync (same backend across future apps)
- GitHub for code
- Vercel for deployment (auto-deploy on push to main)
- PWA installable on phone and desktop

### My comfort level
- I understand concepts quickly but value clear walkthroughs for new workflows
- First time doing something, I want step-by-step
- Second time, I remember and want less hand-holding
- Coding isn't my profession, but I understand architecture and can follow

---

## Big picture vision

I'm building a **Personal Operating System** — a suite of apps that together answer "how am I doing?" across every major life domain.

Each app answers it for one domain. A future meta-dashboard will answer it across all domains, revealing patterns invisible to any single app.

This isn't a hobby project. It's a multi-year vision. I'm building slowly, carefully, one app at a time, with design decisions captured in living documents that travel with me across sessions and devices.

See `PERSONAL_OS_DESIGN_PRINCIPLES.md` for the cross-app philosophy, and each project's own `DESIGN_DECISIONS.md` for specific project state.

---

## What matters most to me

- **Authenticity:** the app should feel like mine, reflect my taste, learn with me
- **Honesty:** metrics tell the truth, features don't mislead
- **Growth:** I'm learning musicianship over years, not days. The app should respect that trajectory
- **Ownership:** I own my data, my progress, my choices. The app supports me, it doesn't manage me
- **Craft:** the design should be intentional, distinctive, and well-considered — not generic

---

## How to use this document

Paste this at the start of any Claude conversation where I'm working on personal projects. Combined with the relevant DESIGN_DECISIONS.md and PERSONAL_OS_DESIGN_PRINCIPLES.md, it gives complete context about me, my apps, and how I want to work.
