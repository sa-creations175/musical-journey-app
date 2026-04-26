# Song Progression Redesign — Design Document

Living design doc for redesigning Song Repertoire's progression model from a single song-level proficiency stage to a section × key matrix with validation tests.

**Status:** Design pending. To be designed in a dedicated session. Will be built as **Phase 1.5**, between sub-phase 6 of Phase 1 and Phase 2.

Last updated: April 25, 2026 (placeholder created, design pending)

---

## Why this redesign

The current Song Repertoire model treats each song as a single proficiency stage (Learning → Comfortable → Cross-key → Internalized → Maintenance). This obscures real cognitive structure:

- Songs are learned section by section, then stacked. "Mirror" is learned by nailing the intro, then verse 1, then chorus, then joining them. The current model can only show the song as a whole; it can't show that intro is at Comfortable while bridge is still at Learning.
- Cross-key progression isn't binary. A song you can play in 3 keys is more cross-key than one you can play in 1, but less than one you can play in all 12. The current Cross-key stage hides this dimension.
- Self-assessment can drift toward optimism. "I'm comfortable with this" is honest but unverified. A small validation test ("3 clean run-throughs at performance tempo with no mistakes") grounds the assessment without being heavy-handed.
- Practice Sessions algorithm needs section-level granularity. "Practice Mirror — 15 min" is shallow. "Practice Mirror's bridge in F — 10 min" is the kind of recommendation that actually accelerates learning.

The redesign captures all four of these as first-class concerns.

---

## Design questions to answer in the dedicated design session

- **Section × key matrix:** per-cell proficiency state model.
- **Section definitions:** how rigid (intro/verse/chorus/bridge as canonical) vs. flexible (user-defined sections per song).
- **Cross-key target per song:** user declares 3 keys vs. 12 keys vs. somewhere between; affects when "Internalized" unlocks.
- **Validation tests:** what they look like, what triggers them, how the user opts in or out, what data they generate.
- **Aggregation logic:** what's the song's "overall" stage given its sections' stages? (Min? Average? Weighted by section length?)
- **Migration of existing data:** how do we map current song-level stages onto the new model?
- **UI surfaces in Song Repertoire:** how does the matrix get displayed without overwhelming the user.
- **Goal targeting:** granularity options at goal creation (whole song? specific sections? specific keys?).
- **How Practice Sessions Phase 3 algorithm consumes this model.**

---

## Related design notes from April 25, 2026 session

The conversation that surfaced this redesign also produced these specific instincts worth preserving:

- Section-level proficiency uses the same song vocabulary (Learning → Comfortable → Cross-key → Internalized → Maintenance) — applied per cell of the matrix.
- Sub-stages within Cross-key (e.g., "Cross-key 3 of 6") if the user has set a partial-key target.
- Validation tests are opt-in but recommended; the user is asked "Want to validate before promoting to Comfortable?" rather than blocked from self-promotion.
- Goals can target the matrix at multiple granularities: whole song, specific sections, specific keys, specific section × key cells.
