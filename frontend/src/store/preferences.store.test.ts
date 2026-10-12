import { beforeEach, describe, expect, it } from 'vitest';
import { usePreferencesStore } from './preferences.store';

beforeEach(() => {
  usePreferencesStore.setState(usePreferencesStore.getInitialState());
});

describe('preferences.store', () => {
  it('começa no padrão: tema escuro, produção, sem alertas nem som', () => {
    const s = usePreferencesStore.getState();
    expect([s.theme, s.env, s.notify, s.sound]).toEqual(['dark', 'prd', false, false]);
  });

  it('cada setter guarda e persiste na chave do legado', () => {
    const s = usePreferencesStore.getState();
    s.setTheme('light');
    s.setEnv('hml');
    s.setNotify(true);
    s.setSound(true);
    expect(usePreferencesStore.getState()).toMatchObject({
      theme: 'light',
      env: 'hml',
      notify: true,
      sound: true,
    });
    expect(localStorage.getItem('orbital-theme-v1')).toBe('light');
    expect(localStorage.getItem('orbital-env-v1')).toBe('hml');
    expect(localStorage.getItem('orbital-notify-v1')).toBe('1');
    expect(localStorage.getItem('orbital-sound-v1')).toBe('1');
    usePreferencesStore.getState().setNotify(false);
    expect(localStorage.getItem('orbital-notify-v1')).toBe('0');
  });
});
