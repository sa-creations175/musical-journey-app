import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /**
   * Changing this value clears the caught error so a fresh subtree can
   * render. Layout passes the current pathname, so navigating away from
   * a crashed page recovers without a full refresh.
   */
  resetKey: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Top-level error boundary wrapping the routed page (<Outlet />) only.
 *
 * Without it, an exception thrown while rendering any page unmounts the
 * ENTIRE React tree — including PwaUpdateBanner, which lives in Layout
 * outside this boundary. That meant a user stuck on a crashed page
 * could never receive the shipped fix, since the update prompt itself
 * had been torn down.
 *
 * By containing the crash to the page region, the surrounding chrome
 * (header, nav, and crucially PwaUpdateBanner) stays mounted and the
 * update can reach the user. The fallback is intentionally minimal —
 * its only job is to keep the app shell alive.
 */
export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to the console for debugging; we deliberately keep the
    // visible fallback minimal.
    console.error('Page render crashed:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    // Recover on navigation: a new route should get a clean render
    // attempt rather than inheriting the previous page's error state.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="px-4 py-12 text-center text-sm text-neutral-500">
          <p className="font-medium text-neutral-700 dark:text-neutral-300">
            Something went wrong.
          </p>
          <p className="mt-1">Refresh to try again.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
