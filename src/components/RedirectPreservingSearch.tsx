/**
 * Redirect to a path, keeping the query string.
 *
 * WHY THE SEARCH HAS TO SURVIVE. The dashboard keeps its filters, sort
 * and expansion in the URL, so `/dashboard-next?sort=cw&f=...` is a
 * saved view rather than just a page. A plain `<Navigate to="/" />`
 * would land a bookmarked filtered view on the default one and look
 * like the filters had been lost.
 *
 * `replace` so the redirect does not sit in the back stack: pressing
 * back from the destination would otherwise bounce through here and
 * straight forward again.
 */
import { Navigate, useLocation } from 'react-router-dom';

export default function RedirectPreservingSearch({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}
