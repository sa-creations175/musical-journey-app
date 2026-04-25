# Personal OS — Design Principles for Future Apps

A living document capturing the design philosophy, architectural principles, and technical decisions underlying a connected suite of personal life-tracking apps. Paste this at the start of any new project to share context about the vision.

Last updated: April 25, 2026

**What changed in v3 (April 25, 2026):** Three new cross-app principles promoted from Musical Journey App design review: "Show the trade-off, not just the plan"; "Deduce intent from signals, don't accumulate declarations"; "Honest about abundance, not just scarcity." One meta-pattern named explicitly: "Honest disclosure + full user agency." One new architectural principle: "Centralized prompt orchestration." All emerged from the comprehensive Practice Sessions + Goals design review.

---

## The overarching vision

I'm building a suite of personal apps that together form a **Personal Operating System** — software that answers the question "how am I doing in this area of my life?" for each major domain.

**Current apps:**
- Musical Journey App (music practice, deployed and in use)

**Planned apps:**
- Fitness app
- Mental health / reflection app
- Finance app (manual entry / CSV first, potentially bank-connection later)
- Relationships app
- Professional projects / goals app
- Travel schedule / planning app
- Personal tasks / productivity app

**Eventual meta-dashboard:** a unifying app that reads from all the above and answers "how is Silas doing across all domains?" Reveals cross-domain patterns, correlations, and imbalances.

Each individual app is valuable standalone. The meta-dashboard is valuable only when multiple individual apps exist.

---

## Philosophical core principles

These apply to every app in the suite:

### The dashboard is the philosophical center
Every app opens to a dashboard first. Not settings, not a feature. The dashboard embodies the question "how am I doing in this area of my life?"

### Honest metrics, not flattering ones
A tool used for years must tell the truth. No reset buttons, no inflated scores, no misleading green indicators. Accuracy builds trust; flattery destroys it.

### Attempts and time, not just outcomes
Reward engagement and investment. Users improve by showing up, not by being perfect.

### Balance over absolute values
The meaningful signal is often imbalance ("you're 75% in four areas but 30% in another"). Design metrics to surface this.

### User-declared priority per item
Not every skill/goal/habit deserves equal depth. Users declare mastery goals per item: Comfort (maintain), Deep (actively grow), Maintenance-only.

### Cross-module reinforcement is offered, never assumed
The app invites connections between areas; users complete them explicitly.

### Time is the honest measure of investment
For physical/practice-based activities, time spent is primary. Heat maps color on time, not just counts.

### Freshness matters across all time-based skills
Shared infrastructure: 0-3 days fresh, 4-10 getting stale, 11-20 stale, 21+ very stale.

### Automation serves curation, not replaces it
The tool suggests options; the user chooses. Don't auto-assign, auto-categorize, or auto-populate in ways that remove user agency over their own learning or experience.

### Factual claims should match what's knowable
Content generation should stay in territory the tool can verify. Claim the knowable (artist exists, genre characteristics, era patterns). Don't claim the unknowable (this specific song is in 6/8 at 68 BPM).

### Multi-source exploration beats single-source specifics
When suggesting examples for learning, offer multiple (3-5) for users to compare. Teaches the category, not a single reference.

### Smart decay respects earned mastery (v2)
Skills with significant investment decay slower than newly-learned skills.

### Legacy mastery should be respectable (v2)
Users should be able to mark items as "already solid from prior practice" without re-logging years of work.

### Proactive prompts as nudges, not surprises (April 2026)
Apps in the suite should surface what the user might want to know or act on without forcing action. Examples: "This song moved to Comfortable. Add to your goal?" / "You've been on the same items for a while — consider these." / "End of your goal period. Here's how you're tracking." User can engage or dismiss; either is fine. **Frequency must be budgeted** — too many prompts become noise. Each app should rate-limit prompts per day so they remain valuable. Implementation pattern: centralized prompt orchestration layer (see Architectural Principles).

### Canonical vocabulary across an app (April 2026)
When an app uses defined levels, stages, or categories (proficiency, mastery, freshness, priority, etc.), the same vocabulary applies everywhere in the app. A "Comfortable" song means the same thing in Song Repertoire, in Goals, on the Dashboard, and in Practice Sessions. UI surfaces that ask users to engage with these concepts (e.g., goal-setting forms) introduce the vocabulary in the same breath as asking the user to use it. Users should never have to re-learn what a word means depending on which screen they're on.

### Day as the unit of breadth (April 2026)
For domains where daily breadth matters (musical practice, fitness, mental health), the *day* is the unit across which all dimensions should be touched — not necessarily each session. Practice / activity / engagement that hits all needed dimensions across a coordinated set of context-shifting moments throughout the day is more sustainable and research-supported than expecting every single session to be balanced. Apps should design for this: session generation considers the day's full plan, not just the current moment.

### Sessions have roles (April 2026)
For activity-tracking apps with multi-session days, each session plays a role — opener (fresh attention, acquisition work), middler (review, lighter cognitive load), closer (consolidation, breadth catch-up). The same time + context produces different recommendations depending on role. Apps should compute and respect role rather than treating sessions as identical.

### Show the reasoning (April 2026)
When an app uses an algorithm to recommend something to the user — what to practice, what to focus on, what to track — the algorithm's reasoning should be expandable and visible. Hidden algorithms erode trust. Users should be able to see "why this recommendation" and correct false assumptions. This connects to the existing principle of "automation serves curation": the user can only curate well if they can see what the system is choosing for them.

---

### NEW principles — April 25, 2026 (promoted from Musical Journey App design review)

### Show the trade-off, not just the plan (NEW — April 25, 2026)
When a user choice has costs — focusing on one area, picking option A over B, expanding a goal, declaring per-session intent — the app surfaces what gets delayed, deferred, or risked **at the moment of choosing**, not after. This is "Show the reasoning" applied to *choices the user is making*, not just choices the algorithm is making. The user keeps full agency; they just don't make the choice blind.

Cross-app applications:
- **Music:** Two-option session proposals carry strategic identities ("keeps you on track" vs. "push hard on chord motion") so the trade-off is visible at the choice point.
- **Fitness:** Workout planning that surfaces "this leg-day plan delays your endurance goal by ~3 days" when picking among options.
- **Finance:** Spending or savings decisions framed with "this puts your emergency fund target back ~2 months" or "this accelerates retirement savings ~6 months."
- **Relationships:** Time/energy allocation plans that name "if you go deep on these 3 relationships this month, the other 5 will get less attention."

Common pattern: the app names the cost in the same UI moment as the choice. Not a warning, not a dialog box. Honest disclosure as part of the natural flow.

### Deduce intent from signals, don't accumulate declarations (NEW — April 25, 2026)
When the system can infer what the user wants from existing data (goals, behavior, recent engagement, state), prefer inference over asking the user to declare it explicitly. User declarations are a last resort, not a default. This reduces friction, keeps state honest, and prevents user-declared state from drifting out of sync with reality.

This is a sharper application of "automation serves curation": **don't make the user curate things the app can figure out itself.**

Cross-app applications:
- **Music:** No "focus mode" or "acquisition mode" toggles — focus emerges from active goals; acquisition stage is detected from engagement signals.
- **Fitness:** No "I'm in a building phase" toggle — the app detects volume + intensity trends and infers training phase.
- **Mental health:** No "I'm having a hard week" toggle — the app notices patterns in mood / sleep / engagement and adjusts gently.
- **Finance:** No "I'm trying to save more" toggle — the app sees savings rate trends and adapts recommendations.

Test for whether to add a user declaration: *can the system infer this from existing signals?* If yes, don't ask. Reserve user declarations for things genuinely outside system observation (preferences, values, life events the system can't see).

### Honest about abundance, not just scarcity (NEW — April 25, 2026)
When the user is genuinely caught up — no urgent items, no behind-on-goals state, recent activity covered everything — the app names the moment honestly and offers strategic paths. It doesn't auto-fill thinly to disguise the moment.

Cross-app applications:
- **Music:** "No items strictly due" surface offers Get ahead / Drive home / Expand the goal multi-select.
- **Fitness:** "You're caught up on your routine. What kind of session today? — Active recovery / Push something specific / Try something new / Rest day."
- **Mental health:** "Things have been steady. Want to deepen a practice / explore something new / take a quiet day?"
- **Finance:** "You're on track this month. Pull a future goal forward, accelerate emergency fund, or just steady-state?"

Common pattern: when the algorithm has nothing urgent to surface, that itself is information. Name the abundance honestly and give the user strategic agency over the surplus.

### Truth-honoring trumps gentle defaults (NEW — April 25, 2026)
When reality is harder than the gentle default would suggest, the app reflects reality. Gentle is in the *navigation*, not the *hiding*.

Canonical example: in the music app, spacing decay continues during vacation. Items genuinely went stale; pretending otherwise is an ambient lie. The kindness is in the welcome-back surface that helps the user *meet* the truth (per-goal target-date adjustments, eased re-entry options), not in suppressing the decay clocks.

Cross-app applications:
- **Fitness:** Detraining shows up after time off; the app reflects it honestly and offers a return-to-form path, not a fake "you're at 100%" reset.
- **Mental health:** A two-week gap in practice isn't hidden; the welcome-back acknowledges it and offers a gentle re-entry.
- **Finance:** Missed savings months show up in the trajectory; the app reflects them honestly and helps the user re-plan rather than glossing over.

Test: when the gentle default would *hide reality*, choose truth-honoring over gentle. Gentle moves into the navigation surface — how the user *meets* the truth — not into the data layer.

### Honest disclosure + full user agency (NEW meta-pattern — April 25, 2026)
Apps in this suite consistently apply a meta-pattern: **the app surfaces information, makes choices easy, never gates the user's action, never silently makes choices for them.**

This is "automation serves curation" applied repeatedly across decision points. Surface in:
- Goal hierarchy (user opts into rollup; app suggests when sensible)
- Mode emergence (no user-declared modes; system infers but always discloses what it's doing)
- Goals absence (Practice Sessions degrades gracefully and discloses, never blocks)
- Trade-off surfacing (costs visible at choice point)
- Abundance handling (system names the moment, user picks strategy)

The pattern is consistent enough across decisions that it's worth recognizing as a meta-principle. When in doubt about a UX decision, ask: *am I disclosing honestly? Am I preserving full agency? Am I making the choice easy without making it for them?*

### Prompt prominence varies by signal availability (NEW — April 25, 2026)
When the user's input is the *only* signal available (subjective rating of song practice, drill quality, journal reflection), prompts are prominent. When the system already has objective data (accuracy, completion, sensor-measured metrics), prompts are light or auto-collapsed. The app doesn't extract from users data it already has; it leans in where it doesn't.

Cross-app applications:
- **Music:** Performance ratings shown light for ear training (objective accuracy exists), prominent for song practice (only subjective rating available).
- **Fitness:** Subjective effort prompted prominently for activities without HR data; light when HR/power data are present.
- **Mental health:** Reflection prompts are the primary input — always prominent, since there's no other signal.

---

## User experience principles

### Visual scaffolding with progressive fading

### Three-mode progression for any drill/skill
Full / Partial / Minimal scaffolding.

### No auto-advance; user controls pace

### Every learning moment is a mini-lesson
Answer reveals explain what, why, and real-life application.

### Visual representation must match the cognitive model
Linear strip for sequential, circular compass for relational, radar for balance.

### Complexity should be visible but organized
Group controls visually rather than hiding behind "advanced" menus.

### Countdown timers match physical habits

### Bite-size + optional deep dive
Surface (3-5 min) + expandable deep dive (15-30 min).

### Settings changes apply forward, never retroactively

### Visual feedback for all user actions
Every meaningful action gets visible confirmation.

### Generous negative space, then controlled density
Breathing room in dashboards. Dense information in drill-in views.

### Mobile-first when phone usage is primary (April 2026)
Apps where users do meaningful work on phones (practicing, logging, reviewing on the go) must be designed phone-first, not desktop-down. Touch targets ≥44px (or 36px in tightly-bounded contexts where the trade-off is named explicitly), thumb-reachable affordances, no typing where multi-choice works, sequential input flows on narrow viewports. Desktop is a secondary affordance, not the design baseline.

### Progressive onboarding for rich data inputs (April 2026)
When asking users to set up structured data (goals, profiles, preferences), don't ask everything at once. Start with the most actionable layer (this month, this week) and invite longer-range or more reflective inputs as opt-in extensions. Lifetime visions and 5-year plans are powerful when captured but daunting if asked cold. Offer them, don't require them, and prompt later as users have more material to draw from.

### Swipe-between-cards for two-option choices on phone (NEW — April 25, 2026)
When an app generates two meaningfully distinct options for the user to choose between (recommendations, plans, alternatives), the phone affordance is **swipe between full-screen cards**, not vertically stacked. Vertical stacking forces the user to scroll back and forth to compare; swipe gives each option full attention with smooth comparison. Header above the cards explicitly names the two options as strategic identities so the trade-off is visible. Paginator dots make discoverability obvious.

---

## Content and language principles

### Plain language first, precision where it matters

### Emotional framing alongside technical
Every concept includes "what this does to feeling" alongside "what this does technically."

### Definitions reinforce passively everywhere

### Glossary as core infrastructure
Every technical term linked. "Got it" tracking. Standalone searchable view as reference.

### Starter content with clear editability
App provides thoughtful starter content. User can edit, delete, or add alongside.

### Try-now exercises must be specific
Not vague. Doable. Concrete.

### Content tone: warm, conversational, not textbook

### Content that can't be verified should be scoped to what's knowable
Never fabricate specifics to sound authoritative (fake BPM/key/EQ specifics for specific songs, etc.). Use category-level guidance where specifics can't be verified.

### Playful labels for subjective ratings (NEW — April 25, 2026)
When asking users to rate subjective experience (how a session went, how a workout felt, how reflection landed), labels should be playful and metaphorically consistent — not clinical. Music app example: Flying / Cruising / Crawling (motion-metaphor family) instead of Good / Okay / Bad. Tonal warmth makes the input feel like sharing rather than grading. Labels should sit in one coherent metaphor (motion, weather, energy) rather than mixing.

---

## Architectural principles

### Single backend per user (Pattern 1)
For personal OS use, all apps share one backend (e.g., one Supabase project).

### Shared auth across apps
One login across all apps in the suite.

### Clean data model with clear boundaries
Each app has its own tables. Tables named consistently (`{app_name}_{entity}`). Cross-app queries in meta-dashboard are straightforward.

### Consistent schema across apps
Common fields: `user_id`, `created_at`, `updated_at`, `last_engaged_at` (for freshness), appropriate foreign keys. Makes cross-app synthesis possible.

### Cloud sync is foundational, not optional
Without sync, data fragments, value erodes.

### Offline-first behavior
App works without internet. Syncs when reconnected.

### Progressive Web App (PWA) as default
Installable, cross-device, no app store gatekeeping.

### Data export / import always available
Users own their data. Built-in JSON export/import per app.

### Phased builds when scope is architectural
Cloud sync and similar multi-table builds should be phased with testing between. Single-shot architectural builds stack bugs and make debugging harder.

### Lifecycle-aware seeders (April 2026)
When an app has cloud sync AND seed data (starter associations, default content, etc.), seeders MUST be lifecycle-aware of sync readiness. Seeding before sync is registered will write to local storage only, leaving cloud empty — which then gets wiped by the next replace-mode pull. Seeders should defer until the sync layer reports ready, AND use the synced-write wrapper so writes are queued for cloud push. This is a real architectural requirement, learned the hard way.

### Audit before fix on layout regressions (April 2026, working principle)
Two failed attempts at fixing UI layout on narrow viewports during the music app's audio tuning work taught us: when something goes wrong with layout, the fix isn't always in the new code. Sometimes the new code exposes a sizing problem the old code was hiding. Audit the actual computed dimensions in the running app before trying another layout fix. This generalizes: when a fix doesn't land, audit before iterating.

### Centralized prompt orchestration (NEW — April 25, 2026)
When an app fires proactive prompts (nudges, suggestions, reviews, reminders), they should route through a **centralized orchestration layer** rather than being fired ad-hoc by individual features.

The orchestration layer enforces:
- **Daily soft caps** (e.g., max 3 prompts per day) so prompts stay valuable rather than becoming noise.
- **Tier-aware prioritization** — high-importance prompts (period-end reviews, vacation returns, milestone-tied moments) take priority over medium and low prompts.
- **Context-aware suppression** — no prompts during deep-focus moments (active practice sessions, active workouts, active reflection sessions).
- **Per-prompt-type cadence rules** — dismissed prompts have a re-prompt window appropriate to the prompt type.
- **User transparency** — Settings exposes the prompt queue, recent prompt history, and category-level mute toggles.

Schema implication: every app needs a `prompts` table from the start. Even if the first version only fires 2-3 prompt types, the infrastructure scales as more prompt types are added later.

This is the architectural implementation of "Proactive prompts as nudges, not surprises" — the principle says *what*; this principle says *how*.

---

## Technical stack (proven working)

### Frontend
- React + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- Dexie (IndexedDB wrapper for local-first storage)

### Backend (cloud sync)
- Supabase (Postgres + auth + realtime + storage)
- Row Level Security for user data isolation
- Supabase Edge Functions for server-side logic when needed

### Web Audio / Visualization
- Web Audio API
- Recharts / D3 for data visualization
- Native SVG for custom visualizations

### Hosting / Deployment
- Vercel (free tier sufficient for most phases)
- GitHub for code repository
- Custom domains optional

### Known technical gotchas (from Musical Journey App)
- Dexie 4 transaction scoping: use `setTimeout(fn, 0)` in sync hooks, NOT `queueMicrotask()`
- Tab-focus listeners in sync: attach unconditionally on mount, don't gate behind phase checks
- Pull lock: use reference counter, not boolean, for concurrent pulls
- RLS: must be ENABLED with explicit policies per table — default state blocks everything
- Vercel blocks commits with invalid author email — use GitHub's no-reply email in git config
- Seeders must defer until sync ready — see "Lifecycle-aware seeders" above (April 2026)
- Direct `.clear()` on Dexie tables skips deleting hooks — use `bulkDelete([ids])` for sync-aware deletion (April 2026)
- Empty catch blocks in audio dispatchers make bugs invisible — always log on catch (April 2026)

---

## Cross-domain health metrics design

Each app expresses "health" in domain-specific ways, but structure is consistent:

### Each domain has a multi-dimensional radar
5-7 dimensions per domain, each 0-100. Shows imbalance.

Examples:
- **Music:** theoretical fluency / physical command / musical application / creative engagement / consistency
- **Fitness:** cardio / strength / mobility / recovery / nutrition / consistency
- **Financial:** savings rate / debt trajectory / emergency fund / retirement progress / spending alignment
- **Mental health:** mood patterns / sleep quality / mindfulness practice / social connection / sense of purpose

### Meta-dashboard shows domains side by side, not summed
Don't create a single "life score." Show each domain's health independently.

### Qualitative narrative accompanies quantitative metrics
Each domain surfaces a short narrative summary.

### Cross-domain correlation detection (v2+)
Over time, meta-dashboard surfaces correlations across domains.

---

## Module/feature composition principles

### Skills Catalogue pattern
Every app has a searchable, filterable inventory of its tracked items. Organized hierarchically. Default collapsed for long lists.

### Freshness visualization shared across modules
Consistent color coding and thresholds.

### User notes / associations / diary
Every domain app allows user to annotate tracked items with personal meaning.

### Generative creative prompts
Apps offer "creative sessions" that use tracked data to suggest explorations.

### Consistent action verbs across apps
"Just practice" / "Just play" / "Just move" / "Just reflect" — consistent across domains.

### Cross-app references
When relevant, apps reference each other subtly.

### Goals layer as a first-class module (April 2026)
Apps where progress over time matters should have an explicit Goals layer as a top-level module, not just a passive setting. Goals support hierarchy (yearly → quarterly → monthly → weekly), include both qualitative aspiration (open text) and quantitative targets (metric + value + date), and surface progress proactively. Goals onboarding is part of the app's first-run experience but layered (this-month-first, longer-range optional).

**Hierarchy support (NEW — April 25, 2026):** Goals can have parents (`parent_goal_id` or equivalent) with two distinct concepts:
- **Relationship** — "this goal is part of that bigger goal"
- **Numerical rollup** — "completing this goal increments the parent's progress"
These should be decoupled because related goals don't always roll up cleanly. Goals also support **multi-component (umbrella) structures** — a parent goal with multiple child sub-targets, where the parent has no metric of its own and progress is computed across children. This handles goal *expansion* (raising the bar mid-period) by adding a child target without overwriting the original commitment.

---

## Sharing and commercialization principles

### Level ladder (don't skip levels)
1. Personal use on one device
2. Personal use across devices (requires cloud sync)
3. Private sharing with trusted testers (requires multi-user architecture)
4. Public beta
5. Productized app (requires payment, support, legal)

Each level requires real additional work. Skipping levels produces broken experiences.

**Note on Level 2:** Achieving cloud sync for personal use actually involves real cloud infrastructure (Supabase + GitHub + Vercel). Even Level 2 introduces coordinated work between you and Claude Code (migrations, account setup, deployment). Plan for this as interactive coordination, not passive build time.

### Data isolation is foundational
If ever shared with others, each user's data must be completely separate. Row Level Security from day one.

### Some apps have regulatory ceilings
**Finance apps:** manual entry / CSV is safe. Bank connection triggers real regulatory burden (GLBA, state money transmission laws, privacy requirements, insurance needs).

**Health apps:** HIPAA generally doesn't apply to personal tracking apps, but medical claims do. Stay in "personal tracking, not medical advice" lane.

### Per-user costs shape business model
Personal use: ~$0/month on free tiers. Sharing with ~20 people: still ~$0. At 500+ users, infrastructure costs become real ($25-100/month). Any productized app needs user willingness to pay to cover this.

### Avoid advice, prioritize education
Apps that track data and offer education are safer legally than apps that give advice.

---

## Design aesthetic principles

### Commit to a clear aesthetic direction per app
Each app has a distinct visual identity.

### Typography matters
Distinctive font choices contribute to identity. Avoid defaults.

### Color palettes should be cohesive but distinct across apps
Visually distinct but harmonious when viewed together in meta-dashboard.

### Never sacrifice readability for aesthetics
Contrast ratios matter. Test text on every background.

### Atmospheric features are nice but optional
Ship working before ship beautiful.

### Color coding is canonical within an app (April 2026)
When an app uses color to mean something (a module color, a freshness state, a priority level), the same color means the same thing everywhere it appears. A green block in Practice Sessions means ear training. A green tile in the dashboard heat map also means ear training. A green tag in the Skills Catalogue also means ear training. Users build a visual vocabulary; apps shouldn't betray it.

---

## Build and iteration principles

### Design docs are primary artifacts
Maintain a living DESIGN_DECISIONS.md per app. Paste at start of every development session.

### Git commits as safety snapshots
Commit before major builds. Enable rollback.

### Build in phases, test, iterate

### Test realistic user flows, not just features

### Refine aesthetics only after function works

### Honest about scope creep
When building, notice when scope is growing. Decide consciously.

### Have Claude Code commit AND restart dev server at end of each build
Otherwise changes may be written but not deployed to the running dev server.

### Audit-first when fixes don't land (April 2026)
If a fix attempt doesn't solve the problem (or makes it worse), the next move is NOT another guess at a fix. It's an audit. Look at actual computed values, actual data flow, actual cause. Two failed iterations on the music app's mobile button layout taught this — the third "fix" worked because it was preceded by an audit that revealed the math itself was wrong, not the code.

### Capture rich design conversations as docs (April 2026)
When a design conversation gets unusually deep or covers a lot of ground, capture it in a doc before the session ends. Memory is unreliable across sessions; rich design work is too valuable to lose. The Practice Sessions design doc emerged from one such conversation. Structure: executive summary → risks → philosophy → architecture → algorithm → UI specs → phasing → open questions.

### Honest energy checks (April 2026, working principle)
Long sessions accumulate decision fatigue. Quality of decisions made at hour 12 of focused work is materially worse than at hour 2. Build sessions should respect this: pause at natural stopping points, sleep on important architecture decisions, avoid committing to large schema or UI choices when fatigued. The work won't disappear; the user's clarity will return.

### Schema decisions are expensive to change later; UI is cheap to add later (NEW — April 25, 2026)
When a feature has both a data-model component and a UI component, ship the schema first and defer the UI to a later phase if the UI is non-trivial. Adding fields to the data model after sync is in production requires migrations, backfills, and risk. Adding UI later is a clean additive build on existing schema. The Practice Sessions design review applied this: multi-component goals get full schema in Phase 1, UI in Phase 2.

### Lock the source of truth before building (NEW — April 25, 2026)
When a design has evolved significantly during a review session, **update the design docs before kicking off a build**. A build prompt that references a stale design doc will produce stale work, and the divergence will only be discovered when the build is half-done. Order: complete design conversations → update docs → write build prompt referencing updated docs → kick off build. The discipline is small; the cost of skipping it is large.

---

## How to use this document

### Starting a new app project
Paste this at the start of the first design conversation. Claude will understand the philosophical, architectural, and aesthetic principles without re-explanation.

### Continuing work across sessions
Paste alongside the project-specific DESIGN_DECISIONS.md. Context stays consistent across conversations and devices.

### When considering a new feature
Cross-reference the feature against principles here. If it violates core principles, reconsider.

### When evaluating integration possibilities
Use cross-app principles to check: does this app's architecture support eventual meta-dashboard integration? If not, address before proceeding.

---

## Ongoing refinement

This document is living. Updated as new principles emerge across projects. Each app that gets built refines the patterns. What works becomes canon; what doesn't gets revised.

**April 2026 additions, drawn from Musical Journey App work:**
- Proactive prompts as nudges, not surprises
- Canonical vocabulary across an app
- Day as the unit of breadth
- Sessions have roles
- Show the reasoning
- Mobile-first when phone usage is primary
- Progressive onboarding for rich data inputs
- Lifecycle-aware seeders (architectural)
- Audit before fix on layout regressions (working)
- Goals layer as a first-class module
- Color coding is canonical within an app (aesthetic)
- Audit-first when fixes don't land (working)
- Capture rich design conversations as docs (working)
- Honest energy checks (working)

**April 25, 2026 additions, from Practice Sessions design review:**
- Show the trade-off, not just the plan
- Deduce intent from signals, don't accumulate declarations
- Honest about abundance, not just scarcity
- Truth-honoring trumps gentle defaults
- Honest disclosure + full user agency (meta-pattern)
- Prompt prominence varies by signal availability
- Swipe-between-cards for two-option choices on phone (UX)
- Playful labels for subjective ratings (content)
- Centralized prompt orchestration (architectural)
- Goal hierarchy with multi-component support (composition)
- Schema decisions are expensive to change later; UI is cheap to add later (working)
- Lock the source of truth before building (working)
