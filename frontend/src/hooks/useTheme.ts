import { useCallback, useEffect } from 'react';
import { useConnectionStore } from '../store/connection.store';
import { usePreferencesStore } from '../store/preferences.store';

// Tempo do fade do céu ao sair da tempestade (legacy/script.js, STORM_FADE_MS).
export const STORM_FADE_MS = 1300;

/**
 * Aplica o tema e a tempestade no <html> e devolve o tema com o alternador.
 * `data-theme` e `data-storm` trazem os tokens (theme/themes.css); `data-storm-play`
 * só vai a "paused" depois do fade, senão a chuva congela enquanto o céu abre.
 */
export function useTheme() {
  const theme = usePreferencesStore((s) => s.theme);
  const setTheme = usePreferencesStore((s) => s.setTheme);
  const apiDown = useConnectionStore((s) => s.apiDown);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (apiDown) {
      root.dataset.storm = 'on';
      root.dataset.stormPlay = 'running';
      return;
    }
    delete root.dataset.storm;
    const timer = setTimeout(() => {
      root.dataset.stormPlay = 'paused';
    }, STORM_FADE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [apiDown]);

  const toggleTheme = useCallback(() => {
    setTheme(usePreferencesStore.getState().theme === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, toggleTheme };
}
