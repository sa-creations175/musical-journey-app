import { useState } from 'react';
import { useAuth } from './useAuth';

interface Props {
  onSwitchToLogin: () => void;
}

export default function SignUpForm({ onSwitchToLogin }: Props) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    const { error: authErr } = await signUp(email.trim(), password);
    setSubmitting(false);
    if (authErr) setError(authErr);
    // On success, AuthContext listener flips session → AuthGate shows
    // the app automatically. No need to navigate.
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5">
          email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="email"
          className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5">
          password
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="new-password"
          className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        />
        <p className="text-[10px] text-neutral-500 mt-1">minimum 8 characters.</p>
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5">
          confirm password
        </label>
        <input
          type="password"
          required
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          autoComplete="new-password"
          className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        />
      </div>
      {error && (
        <div className="rounded-md border border-needswork/40 bg-needswork/10 px-3 py-2 text-xs text-needswork">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full px-4 py-2 rounded-md bg-production text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? 'Creating account…' : 'Create account'}
      </button>
      <p className="text-xs text-center text-neutral-500">
        already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-production hover:underline"
        >
          sign in
        </button>
      </p>
    </form>
  );
}
