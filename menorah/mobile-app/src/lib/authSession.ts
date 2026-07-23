type SessionInvalidatedListener = () => void;

const listeners = new Set<SessionInvalidatedListener>();

export function onSessionInvalidated(listener: SessionInvalidatedListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateLocalSession(): void {
  for (const listener of listeners) {
    listener();
  }
}
