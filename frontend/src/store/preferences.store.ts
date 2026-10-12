import { create } from 'zustand';
import { DEFAULT_ENV } from '../domain/environments';
import type { EnvCode, ThemeName } from '../domain/types';
import { writeEnv, writeFlag, writeTheme } from '../storage/preferences';

// Preferências que sobrevivem ao reload; cada setter grava na chave do legado.
// Pedir a permissão de notificação e abrir o aviso de bloqueio é da tela: a store
// só guarda o resultado.

interface PreferencesState {
  theme: ThemeName;
  env: EnvCode;
  notify: boolean;
  sound: boolean;
}

interface PreferencesActions {
  setTheme: (theme: ThemeName) => void;
  setEnv: (env: EnvCode) => void;
  setNotify: (on: boolean) => void;
  setSound: (on: boolean) => void;
  /** Carga inicial: não grava, só devolve ao estado o que já estava gravado. */
  hydrate: (prefs: PreferencesState) => void;
}

export const usePreferencesStore = create<PreferencesState & PreferencesActions>()((set) => ({
  theme: 'dark',
  env: DEFAULT_ENV,
  notify: false,
  sound: false,

  setTheme: (theme) => {
    set({ theme });
    writeTheme(theme);
  },
  setEnv: (env) => {
    set({ env });
    writeEnv(env);
  },
  setNotify: (notify) => {
    set({ notify });
    writeFlag('notify', notify);
  },
  setSound: (sound) => {
    set({ sound });
    writeFlag('sound', sound);
  },
  hydrate: (prefs) => {
    set(prefs);
  },
}));
