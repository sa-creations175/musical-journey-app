# Session Summary — April 25, 2026

A long, productive session resolving Phase 1 sub-phase 3 design questions, surfacing a substantial proficiency framework redesign, and capturing future Song Repertoire redesign as a dedicated effort.

---

## What got resolved (decisions ready for build)

### Sub-phase 3 design decisions

- **Goals nav color:** foundational slate `#5a5e6e`.
- **Time-of-day enum widened** to include `late_night` (12am–4am, rolls up to previous calendar day).
- **Day profile slot keys canonicalized** as `morning / midday / evening` (replacing the spec's earlier `morning / afternoon / evening`).
- **Goals scope enum:** `three_to_five_year` replaced with `two_to_three_year` (single replacement, not addition).
- **Onboarding re-fires** whenever zero active goals exist (not just first visit).
- **Onboarding has fully bidirectional navigation** across all three screens, plus a "Skip the rest" exit.
- **Mid-onboarding return:** pre-fill any created goals; restart at Screen 1; track progress via `goals.onboarding.lastCompletedScreen` userPref.
- **Goals home layer ordering:** action-up (Weekly → Monthly → Quarterly → Yearly → 2-3 year → Lifetime).
- **Empty layers always visible** with placeholder + "+ Add"/"+ Reflect" links; individually collapsible; collapse state persists; first-visit default = empty layers collapsed.
- **"Customize layers" panel** for fully hiding layers users don't use.
- **"+ Set a goal" top button** opens form with no scope pre-set; per-layer "+ Add" links pre-fill scope.
- **Goals are editable post-creation** via tap on Goals home; scope-change warning when going from measurable to vision horizons.
- **Onboarding Screen 1 prompt-cards** use inline mini-forms (not modals); each goal added persists immediately and is editable from the accumulating list.

### Audit + step 4 build decisions

- **`buildSkillRegistry()` is the data source** for Related Items search (avoids reinventing cross-module enumeration).
- **Glossary terms excluded** from Related Items search (matches existing convention).
- **"Improve a specific area" mini-form:** measurable variant with optional improvement text, modules + monthly hour target required.
- **Goal creation modal uses existing Modal component.**
- **Vision-mode form variant** for scopes > 1 year (hides measurable fields).
- **Two-field representation** for level-based goals (`target_metric: 'items_at_level'` + `target_unit: <level>`).
- **Scope-aware level dropdown** grouped by `<optgroup>` per present scope.
- **Inline proficiency level** on Related Items search results.
- **Hyphen normalization** on stored level identifiers (`cross-key`, `cross-context`).
- **Song stage reorder:** Cross-key now precedes Internalized (display_order 3 and 4 respectively).
- **Full-sweep approach** to song reorder (including `creative/engine.ts`) over targeted patch.
- **Silent reorder** (no migration prompt) — only user is the developer.

### New principles captured

- **Measurable horizons ≤ 1 year** (cross-app principle): measurable goals only at horizons of 1 year or less; longer is text-only vision.
- **Canonical vocabulary across each cognitive structure** (refinement of earlier principle): same vocabulary within a mastery structure; harmonized across structures.
- **Two proficiency vocabularies, three scopes:** skill vocabulary (garden metaphor + accuracy bands) for measured-accuracy modules; song/production vocabulary (self-assessment + integrated learning) for repertoire and production lessons.

---

## What got designed (not yet built)

### Proficiency framework

Two vocabularies, three scopes (song, production, skill). Skill vocabulary uses garden metaphor: Planting → Sprouting → Branching → Rooted → Seasoned (+ Maintenance). Song and Production share Learning → Comfortable → [Cross-key | Cross-context] → Internalized → Maintenance. 16 seed rows for `proficiencyDefinitions` table. See full table in `DESIGN_DECISIONS_6.md`.

### Song Repertoire progression redesign

Substantial future-phase work captured as `SONG_PROGRESSION_DESIGN.md` (placeholder for dedicated design session). Section × key matrix per song; validation tests for stage transitions; cross-key target per song with sub-stage tracking; goal-targeting granularity (whole song / sections / keys / cells). Designed before Practice Sessions algorithm (Phase 3) so Practice Sessions launches with the better model.

### Goal feasibility surfaces (Phase 7+ design note)

When historical pace data exists, surface gentle ambition checks at goal creation and progress nudges at goal-period midpoints. Non-blocking; user retains agency.

---

## Build state at end of session

Sub-phase 3 step 4 in active build with full kick-off prompt sent to Claude Code, including all decisions resolved. Steps 1–3 already committed (schema + nav + layered home). Steps 4–9 pending; step 4 is the goal creation form + onboarding mini-form work.

Phase 1 trajectory unchanged; ships before song redesign.

---

## Lessons learned (working style)

- **The app's primary user is its first persona.** Decisions like "2-3 year is more honest than 3-5 year" came from reflecting on actual planning behavior, not abstract user research. Worth trusting that intuition when designing.
- **"Capture as future doc" is a real artifact** when written rigorously. The Song Repertoire redesign isn't lost just because it's deferred — it's queued with structure for the dedicated session.
- **Energy checks can become annoying when overused.** Acknowledged mid-session that constant pushback on momentum is deflating; pivoted to giving honest scope-and-cost reads instead of repeated "are you sure?" prompts. Lesson for future sessions: name the trade-offs once, then trust the user.
- **Pressure-testing vocabulary against real activities surfaces problems faster than abstract debate.** The "What is sound?" production lesson exposed that the garden vocabulary's accuracy bands didn't fit conceptual lessons; that drove the production-scope decision.
- **Two-field structured representations beat combinatorial enums.** `target_metric: 'items_at_level'` + `target_unit: <level>` is cleaner than 11 metric variants. Pattern worth applying elsewhere.

---

## Files updated this session

- **`DESIGN_DECISIONS_6.md`** — significant updates (proficiency framework, song reorder, navigation color, build state, learnings).
- **`PERSONAL_OS_DESIGN_PRINCIPLES_3.md`** — three new/updated principles (canonical vocabulary refinement, measurable horizons, goal feasibility deferral).
- **`PRACTICE_SESSIONS_DESIGN_3.md`** — significant updates (data model schema changes, Goals UI specs, onboarding flow, memory type implementation, Phase 1 sub-phase enumeration).
- **`PHASE_1_BUILD_PROMPT.md`** — updates documented in sub-phase 3 kick-off + step 4 resume prompts.
- **`SONG_PROGRESSION_DESIGN.md`** — NEW (placeholder for dedicated design session).
- **`SESSION_SUMMARY_2026_04_25.md`** — NEW (this file).
