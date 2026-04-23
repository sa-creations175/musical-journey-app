import { Link, useSearchParams } from 'react-router-dom';

/**
 * Slim banner that appears at the top of a module page when the user
 * arrived from the Skills Catalogue (`?from=catalogue` in the URL).
 * Gives them a one-click path back without needing to use the
 * browser's back button. Non-invasive — renders null when the flag
 * is absent.
 *
 * Mounted from Layout so every route picks up the banner without
 * touching module code. Dismissing it drops the `from` param but
 * preserves everything else in the URL.
 */
export default function ReturnToCatalogueBanner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const from = searchParams.get('from');
  if (from !== 'catalogue') return null;

  const dismiss = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('from');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="bg-fluent/10 border-b border-fluent/20 px-6 md:px-10 py-2 text-xs flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-neutral-600 dark:text-neutral-300">
          you arrived from the skills catalogue
        </span>
        <Link
          to="/skills-catalogue"
          className="text-fluent font-medium hover:underline"
        >
          ← back to skills catalogue
        </Link>
      </div>
      <button
        onClick={dismiss}
        aria-label="dismiss"
        title="dismiss this banner"
        className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-sm leading-none"
      >
        ×
      </button>
    </div>
  );
}
