import { useAuth } from './useAuth';

interface Props {
  className?: string;
  label?: string;
}

export default function LogoutButton({ className, label = 'sign out' }: Props) {
  const { signOut, user } = useAuth();
  if (!user) return null;
  return (
    <button
      onClick={signOut}
      className={
        className ??
        'text-xs px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-needswork hover:text-needswork'
      }
    >
      {label}
    </button>
  );
}
