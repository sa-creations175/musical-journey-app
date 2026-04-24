/**
 * The Supabase user id of the signed-in user, shared to module-level
 * code (Dexie hooks, drain loop) that can't reach into React context.
 *
 * AuthContext is the sole writer — it calls setCurrentUserId() on every
 * auth state change. All other callers read via getCurrentUserId() and
 * treat null as "not signed in, don't attempt cloud sync".
 */
let userId: string | null = null;

export function setCurrentUserId(id: string | null): void {
  userId = id;
}

export function getCurrentUserId(): string | null {
  return userId;
}
