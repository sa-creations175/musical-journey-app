import { useState } from 'react';
import { useAuth } from './useAuth';

interface Props {
  onSwitchToSignUp: () => void;
}

export default function LoginForm({ onSwitchToSignUp }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: authErr } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (authErr) setError(authErr);
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
          autoComplete="current-password"
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
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="text-xs text-center text-neutral-500">
        new here?{' '}
        <button
          type="button"
          onClick={onSwitchToSignUp}
          className="text-production hover:underline"
        >
          create an account
        </button>
      </p>
    </form>
  );
}
