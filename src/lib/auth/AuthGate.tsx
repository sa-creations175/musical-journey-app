import { useState, type ReactNode } from 'react';
import { useAuth } from './useAuth';
import SignUpForm from './SignUpForm';
import LoginForm from './LoginForm';

type Mode = 'login' | 'signup';

interface Props {
  children: ReactNode;
}

/**
 * Top-level gate. While auth state is loading we render nothing (avoids
 * a flash of the login form for already-signed-in users). When no user
 * is present, show the login/signup toggle card. When authenticated,
 * render the app.
 */
export default function AuthGate({ children }: Props) {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>('login');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-neutral-500">
        loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-50 dark:bg-neutral-950">
        <div className="w-full max-w-sm rounded-2xl border border-black/[0.07] bg-white dark:bg-neutral-900 shadow-sm p-6 space-y-4">
          <header className="space-y-1">
            <h1 className="text-xl font-medium tracking-tight">Musical Journey</h1>
            <p className="text-xs text-neutral-500">
              {mode === 'login'
                ? 'welcome back — sign in to your practice.'
                : 'create an account to save your practice across devices.'}
            </p>
          </header>
          {mode === 'login' ? (
            <LoginForm onSwitchToSignUp={() => setMode('signup')} />
          ) : (
            <SignUpForm onSwitchToLogin={() => setMode('login')} />
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
