import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function query(): MediaQueryList | null {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  const mql = query();
  mql?.addEventListener('change', onChange);
  return () => {
    mql?.removeEventListener('change', onChange);
  };
}

function snapshot(): boolean {
  return query()?.matches ?? false;
}

/** Preferência do sistema por menos movimento; reage se o usuário a muda com a página aberta. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
