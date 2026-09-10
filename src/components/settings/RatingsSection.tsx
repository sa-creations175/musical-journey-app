/**
 * Understanding App Ratings — Section 2 of the Settings page.
 *
 * The shell only, in this commit: the section's own opening line, which
 * is the prototype's. Its three parts (A measured, B self-rated, C ear
 * training) land in the commit after this one.
 */
export default function RatingsSection() {
  return (
    <p className="text-sm text-neutral-600 dark:text-neutral-300">
      How the app grades your learning progress, and the numbers behind
      each word.
    </p>
  );
}
