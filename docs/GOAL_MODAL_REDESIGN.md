# Goal Creation Modal Redesign — Design Document

Living design doc capturing the redesigned goal creation flow. Replaces the current single-screen modal with a guided 4-step conversation. Built as Phase 1.6 after Phase 1.5 completes.

Last updated: April 26, 2026 (open questions resolved — all 3 design decisions locked)

**Status:** Fully designed. All open questions resolved. Ready for build as Phase 1.6. Current modal (Phase 1 / Phase 1.5 step 7) stays in place until this ships.

---

## Why this redesign exists

The current goal creation modal exposes the data model to the user — target metric dropdowns, target value fields, target unit fields, context tag pickers. It's designer-brained, not user-brained. A user opening it for the first time has no idea what "target metric" means or how to fill it in honestly.

The redesign treats goal creation as a guided conversation:
- **Module first** — what do you want to work on? Module cards that help users realize what they want, not assume they already know
- **Target second** — what does success look like? Module-specific questions that derive the data model fields from natural answers
- **Timeframe third** — when do you want to achieve this?
- **Parent goal** — does this goal roll up into a bigger arc?
- **Review + save** — natural language preview before committing

The user never sees "target metric" or "target unit." Those are encoded behind the scenes from their answers.

---

## Design principles

**Goal creation is a conversation, not a form.** Each step builds on the previous one. The user is guided, not left to figure out the vocabulary.

**Module choice shapes everything.** Different modules have genuinely different "what does success look like?" surfaces. A song goal and an ear training goal have nothing in common structurally — they shouldn't share a form.

**Vocabulary is introduced in the moment it's needed.** Users encounter proficiency levels (Comfortable, Solid, Rooted, etc.) in the same breath as being asked to use them. No assumed prior knowledge.

**Multiple targets per goal are allowed.** A user can set an accuracy target AND a consistency target for the same goal. No artificial cap of one target per goal.

**Rollup goals are fulfilled through item-level work.** When a goal targets overall proficiency of a module, Practice Sessions reads the rollup target but schedules individual items — prioritizing weakest and most stale. The user sets the destination; the algorithm picks the route.

**Context is inferred from module, not declared upfront.** Keyboard vs laptop vs phone context is derived from the module chosen (Ear Training = laptop/phone, Song Repertoire = keyboard, etc.) with optional user override. Not asked as a standalone question.

---

## The 5-step flow

### Step 1 — "What do you want to work on?"

Six module cards, displayed in a 3×2 grid. Each card has:
- Module name
- One-line description of what working on it means
- One example goal in italics (shows the user what a real goal looks like for this module)

Tapping a card selects it and the user advances to Step 2.

**The six cards:**

| Module | Description | Example goal |
|---|---|---|
| Ear Training | Sharpen how you hear chords, intervals, and progressions | "I want to improve my chord recognition accuracy to 80%" |
| Harmonic Fluency | Build speed and confidence reading and recognizing the starting and landing points of chords within a key | "I want to reach 75% accuracy on chord motion math in all 12 keys" |
| Song Repertoire | Grow and deepen your playable song library | "I want to get Mirror Solid in the original key" |
| Shapes & Patterns | Internalize scales, chords, inversions, and patterns across the keyboard | "I want to reach Comfortable proficiency level on major 7th inversions in 6 keys" |
| Production | Expand your music production knowledge and workflow | "I want to complete 4 new production lessons this month including the Sound Design lesson path" |
| Practice consistency | Build the habit of showing up regularly | "I want to practice at least 4 days a week this month" |

---

### Step 2 — "What does success look like?"

Step 2 is entirely different per module. The step question adapts to the selected module:

- Song Repertoire: "What progress do you want to make with this song?"
- Ear Training: "What does success look like for your ear training?"
- Harmonic Fluency: "What does success look like for your harmonic fluency?"
- Shapes & Patterns: "What does success look like for your shapes & patterns practice?"
- Production: "What does success look like for your production work?"
- Practice consistency: "How often do you want to show up?"

#### Step 2 — Song Repertoire

**Song picker:** search/select from active repertoire

**Granularity selector (3 buttons, left to right):**
Whole song | Song section (weekly only, dimmed otherwise) | Key

**Whole song targets (in this order):**
1. Solid in the original key — "Prove the whole song end-to-end in the original key" — no tag for most songs; "achieved" and locked if already Solid; "current" and selectable if Solid but lapsed
2. Cross-key % — "Reach a target % of sections comfortable across non-original keys" — tagged "current" if already Cross-key (still selectable for higher %); reveals % slider (20–100%, step 5%) on selection
3. Internalized — "3+ keys at Solid + lived-with gate satisfied" — tagged "stretch" when far away

**Key targets:**
- Key picker (all 12 keys, with live state badges: "F — Solid", "Bb — Comfortable", "D — Solid · lapsed", "G — untouched")
- State toggle: Comfortable | Solid
- Lapsed key note: "F is currently lapsed — pass a retest to clear"

**Song section targets (weekly only):**
- Section picker (sections defined for that song)
- Key picker
- State: Comfortable only (section-level Solid not yet designed)

**Goal preview:** natural language rendered at bottom before advancing
- "Take Mirror to Solid in the original key"
- "Take Mirror to Cross-key 50%"
- "Get Mirror Comfortable in F"
- "Get the Bridge of Mirror Comfortable in F"

**State tags:**
- achieved → greyed, unselectable (except Cross-key % which is always selectable)
- current → green badge, selectable
- stretch → purple badge, selectable
- no tag → honest next milestone, selectable

**Maintenance:** Not a goal target. Declared via intent toggle on Song Detail.

---

#### Step 2 — Ear Training

**Target options (any combination selectable):**

**Accuracy target:**
- Scope: Overall accuracy across all drill types OR specific drill type
- If specific: cascading picker
  - Intervals → Ascending / Descending / Both
  - Chord Recognition → Foundational triads / Seventh chords / Dominant variants / Extensions & colors
  - Chord Progressions → Key Detection / Chord Motion / Full Progression
  - Scales & Modes → Modes / Minor Scale Variants
- Accuracy % slider: 50–95%

**Consistency target:**
- X sessions per week or per month
- Frequency input + cadence toggle (per week / per month)

**Goal preview examples:**
- "Improve my overall ear training accuracy to 75%"
- "Reach 80% accuracy on chord recognition — seventh chords"
- "Practice ear training at least 4 times a week"
- "Reach 80% accuracy on intervals — ascending and practice at least 3 times a week"

**Design note for Practice Sessions:** "Overall accuracy" goals are fulfilled by working individual drill types — prioritizing weakest and most stale. The user sets the destination; the algorithm picks the route.

---

#### Step 2 — Harmonic Fluency

**Target options (any combination selectable):**

**Accuracy target:**
- Scope: Overall accuracy across all 12 categories OR specific category
- If specific: categories shown as 4 grouped sections (tap to select one)

  **Foundational / Math:**
  - Scale Degree Math
  - Named Notes Across Keys
  - Key Signatures & Relationships

  **Chord Knowledge:**
  - Diatonic Chord Qualities
  - Chord Construction
  - Slash Chords & Inversions

  **Functional / Applied:**
  - Functional Harmony
  - Reverse Key Pivots
  - Progression Vocabulary

  **Ear & Recognition:**
  - Mode Identification
  - Interval Identification
  - Ear-Theory Crossover

- Accuracy % slider: 50–95%

**Consistency target:**
- X sessions per week or per month

**Goal preview examples:**
- "Improve my overall harmonic fluency accuracy to 75%"
- "Reach 80% accuracy on Scale Degree Math"
- "Practice harmonic fluency at least 3 times a week"

**Design note for Practice Sessions:** Same rollup principle as Ear Training — overall accuracy goals are worked through individual category drilling.

---

#### Step 2 — Shapes & Patterns

**Note:** Shapes & Patterns proficiency model is being redesigned (Phase 1.6 dependency — see Shapes & Patterns Proficiency Design Note). Step 2 for this module is designed against the new model decisions locked today.

**Vocabulary:** Song vocabulary (Learning → Comfortable → Solid) — NOT garden vocabulary. Shapes & Patterns is self-logged practice, not accuracy-measured.

**Tracking unit:** Per shape per key — C major 7 inversion and F major 7 inversion tracked separately.

**Target options (any combination selectable):**

**Proficiency target:**
- Activity area picker: Scale Drills / Chord Shape Drills / Voice-Leading / Mental Visualization
- Specific shape within area (from the items in that area)
- Key picker: specific key OR "all 12 keys"
- Target proficiency level: Learning → Comfortable → Solid
- OR: Overall proficiency across all shapes in an area

**Consistency target:**
- X minutes per week or per month

**Goal preview examples:**
- "Reach Comfortable proficiency level on major 7th inversions in 6 keys"
- "Reach Solid proficiency level on the 1-7-3-6-2-5-1 voice-leading pattern in C"
- "Practice shapes & patterns at least 20 minutes a week"

---

#### Step 2 — Production

**Target options (any combination selectable):**

**Completion target:**
- Scope: Complete a full path OR complete X lessons
- If path: path picker (all 6 paths shown with lesson count)
  - Workflow Foundations (8 lessons)
  - The Language of Production (8 lessons)
  - Vocal Production (8 lessons)
  - Genre Productions (22 lessons)
  - Arrangement & Song Structure (5 lessons)
  - The Business of Music (5 lessons)
- If lesson count: number input ("complete X new lessons")

**Time target:**
- X hours per week or per month

**Goal preview examples:**
- "Complete the Workflow Foundations path"
- "Complete 4 new production lessons this month"
- "Spend at least 2 hours on production this month"
- "Complete the Sound Design path and spend at least 3 hours on it this month"

---

#### Step 2 — Practice consistency

**Single target:**
- "Practice at least X days per [week / month]"
- Frequency number input
- Cadence toggle: per week / per month

**Goal preview examples:**
- "Practice at least 4 days a week"
- "Practice at least 20 days this month"

Simple — no module specificity. The module card already anchors the intent.

---

### Step 3 — "What's the expected timeframe for this goal?"

Six scope cards in a 3×2 grid:

| Scope | Hint |
|---|---|
| Weekly | This week's focus |
| Monthly | This month's target |
| Quarterly | Next 3 months |
| Yearly | By end of year |
| 2–3 years | Longer arc vision |
| Lifetime | No deadline |

Target date auto-populated based on scope selection (end of current week / month / quarter / year / etc.). User can tap "edit" to override the date.

Note: Song section goals (from Song Repertoire Step 2) automatically pre-select Weekly and dim other scopes — section-level goals are weekly only.

---

### Step 3.5 — "Does this goal roll up into a bigger one?"

Always present — not conditional on whether parent goals exist.

**Suggested parent goals:** App surfaces likely matches filtered by module. E.g., if the user just created a song goal, yearly umbrella goals for Song Repertoire appear at the top. Suggestions are ordered by plausibility (module match + scope — yearly goals suggested for monthly/weekly children, etc.).

**Full list available:** User can browse all existing goals beyond the suggestions.

**No parent goal:** Always an option — explicit "This is a standalone goal" selection.

**Create new parent goal:** Shortcut to start a new goal flow for a broader umbrella, then return and link. (Exact flow TBD at build time — may open a nested modal or queue the parent creation after save.)

**Why always present:** Most goals in this app link to a yearly umbrella. A yearly "25 songs at Comfortable" goal will be the parent of every song goal added. A yearly "all chord shapes in all keys at Comfortable" goal will be the parent of every shapes goal. Treating parent linking as an edge case would mean manually re-linking constantly.

---

### Step 4 — Review + optional note + Save

**Review block (prominent, top of step):**
- Large natural language goal text (18px, font-weight 500)
- Metadata pills below: scope, module, target date
- Teal left border — makes it feel like a declaration, not a form field
- "← Edit" link to go back and change anything

**Optional note (collapsed by default):**
- "› Add a note to yourself (optional)" toggle
- Expands to textarea: "What's driving this goal? Any context for future you..."
- Placeholder encourages reflection, not just description

**Save goal button** — solid teal, full confirmation that this is the action.

---

## Navigation

- Step indicator: 5 dots at the bottom, current step elongated in teal
- Back button on left of each step (Step 1 Back → dismisses modal)
- Next button on right (disabled until step is complete)
- Step 3.5 always present — "No parent goal" counts as a valid selection enabling Next
- Step 4 replaces Next with Save goal
- No "Skip" — every step is required except the note in Step 4

---

## Context inference (no separate context question)

Context (keyboard / laptop / phone / mixed) is inferred from module and not asked as a standalone question:

| Module | Inferred context |
|---|---|
| Song Repertoire | keyboard |
| Shapes & Patterns | keyboard |
| Ear Training | laptop or phone |
| Harmonic Fluency | laptop or phone |
| Production | laptop |
| Practice consistency | mixed |

User can override via a small "context" chip in the review step if needed — but it's not a required field and most users won't need to change it.

---

## Data encoding (how answers map to the goal schema)

The guided flow produces the same goal record as the current modal — the schema doesn't change. The flow encodes:

| Answer | Schema field |
|---|---|
| Module card selection | related_modules |
| Song picker | related_items |
| Granularity + target state | target_metric + target_unit |
| Cross-key % slider value | target_value |
| Accuracy % slider value | target_value |
| Consistency frequency | target_value (secondary target) |
| Scope card | scope |
| Target date | target_date |
| Optional note | description |
| Inferred context | context_tag |

Multi-target goals (accuracy + consistency) encode as two linked goal records sharing a parent, or as a compound target field — exact encoding to be determined at build time based on schema capabilities.

---

## What this replaces

The current goal creation modal (`GoalFormModal.tsx`) and its song-specific branch (`SongTargetSection`, `songTarget.ts` helpers). The new flow wraps all of this in the guided step structure. The underlying encoding logic in `songTarget.ts` is reused — just surfaced differently.

Phase 1.5 step 7 (matrix-aware song goal targeting) ships as-is. Phase 1.6 replaces the wrapping form with the guided flow, keeping the encoding logic.

---

## Design decisions (resolved April 26, 2026)

### 1. Multi-target encoding
Two linked goal records sharing a `parent_goal_id` — one row per target metric. One goal row with accuracy target, one with consistency target, both pointing to the same parent. Keeps every goal row to a single target metric, making querying clean everywhere goals are read (Practice Sessions weighting, dashboard rollups, etc.).

### 2. Editing an existing goal
Guided flow re-opens pre-filled, dropping the user directly into the relevant step rather than always starting at Step 1. No separate edit surface — the guided flow is the single source of truth for goal creation and editing. Encoding logic from `songTarget.ts` reused.

### 3. Parent goal linking — Step 3.5
Always-present dedicated step between timeframe and review. Surfaces module-filtered suggestions prominently, full list available below, "No parent goal" always selectable, "Create new parent goal" shortcut available. Step is always shown because most goals in this app roll up into yearly umbrella goals — treating it as an edge case would mean constant manual re-linking.

---

## Build sequencing

Phase 1.6 — builds after Phase 1.5 completes:

**Prerequisites:** ✅ Both met as of April 26, 2026
- Phase 1.5 fully complete and pushed ✅
- Shapes & Patterns Proficiency Design session complete ✅

**Build steps (in order):**
1. New `GoalCreationFlow` component — 5-step shell with navigation, dot indicator, back/next
2. Step 1 — module cards (6 cards, selection state)
3. Step 2 — Song Repertoire (reuses `SongTargetSection` logic from step 7, new wrapping UI)
4. Step 2 — Ear Training (accuracy + consistency targets, cascading drill type picker)
5. Step 2 — Harmonic Fluency (accuracy + consistency targets, grouped category cards)
6. Step 2 — Shapes & Patterns (proficiency + consistency targets — see SHAPES_PROFICIENCY_DESIGN.md)
7. Step 2 — Production (completion + time targets, path picker)
8. Step 2 — Practice consistency (frequency picker)
9. Step 3 — scope cards + target date
10. Step 3.5 — parent goal linking (module-filtered suggestions, full list, no-parent option, create-new shortcut)
11. Step 4 — review block + optional note + save
12. Wire context inference
13. Wire multi-target encoding (two linked records sharing parent_goal_id)
14. Wire edit mode (pre-filled flow dropping into relevant step)
15. Replace `GoalFormModal` entry points with new flow
16. Verify all existing goal types decode correctly in edit mode
