# Musical Journey App — working agreements

## Walk it before you build it

No user-facing flow gets built until Silas has clicked through it. A new screen, a new modal,
or a change to the order of steps all count.

The sequence is: design → a clickable prototype in one HTML file → Silas walks the whole path,
including the wrong turns → he signs off → then the build prompt gets written.

Prose descriptions do not satisfy this. Neither do static mockups. The point is the sequence
and the wording, not the layout.

**What this means for you.** If a prompt asks you to build or change a user-facing flow and
there is no prototype and no sign-off, stop and say so before writing any code. Ask where the
prototype is. That is not obstruction — a flow found wrong on the fourth screen has already
been built, and the fix costs more than the pause did.

### One shell, not many

Where the same step appears on more than one surface, it is one component. Anything allowed to
differ between surfaces is written down with a reason, and anything not on that list cannot
differ. Do not build a second implementation of a step that already exists somewhere in the
app — extract the first one instead.
