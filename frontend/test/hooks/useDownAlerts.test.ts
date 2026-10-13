import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '@/domain/types';
import { resetAudioForTests } from '@/hooks/alerts/beep';
import { useAppsStore } from '@/store/apps.store';
import { useConnectionStore } from '@/store/connection.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { ALERT_BATCH_MS, toggleNotify, toggleSound, useDownAlerts } from '@/hooks/useDownAlerts';

class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = vi.fn(() => Promise.resolve(FakeNotification.permission));
  static instances: FakeNotification[] = [];
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(
    public title: string,
    public options: NotificationOptions & { renotify?: boolean },
  ) {
    FakeNotification.instances.push(this);
  }
}

const oscillators: {
  frequency: { value: number };
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}[] = [];
const ramps: [number, number][] = [];

class FakeAudioContext {
  static created = 0;
  currentTime = 10;
  state = 'running';
  destination = {};
  constructor() {
    FakeAudioContext.created++;
  }
  resume = vi.fn();
  createOscillator() {
    const o = {
      type: '',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    oscillators.push(o);
    return o;
  }
  createGain() {
    return {
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn((v: number, t: number) => ramps.push([v, t])),
      },
    };
  }
}

function app(id: string, name = `app-${id}`): Application {
  return {
    id,
    env: 'prd',
    name,
    team: 'Time A',
    healthCheckUrl: 'https://x',
    swaggerUrl: '',
    orbits: ['x'],
  };
}

let focused: boolean;

function setFocus(on: boolean) {
  focused = on;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  FakeNotification.permission = 'granted';
  FakeNotification.instances = [];
  FakeNotification.requestPermission.mockClear();
  oscillators.length = 0;
  ramps.length = 0;
  FakeAudioContext.created = 0;
  resetAudioForTests();
  vi.stubGlobal('Notification', FakeNotification);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('isSecureContext', true);
  setFocus(false);
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  useAppsStore.setState(useAppsStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
  usePreferencesStore.setState(usePreferencesStore.getInitialState());
  usePreferencesStore.setState({ notify: true, sound: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('queueAlert', () => {
  it('junta as quedas do lote de 400 ms num bipe só e uma notificação por app', () => {
    useAppsStore.setState({ apps: [app('a'), app('b')] });
    const { result } = renderHook(() => useDownAlerts());
    result.current.queueAlert([{ id: 'a', name: 'app-a' }]);
    vi.advanceTimersByTime(ALERT_BATCH_MS - 1);
    result.current.queueAlert([{ id: 'b', name: 'app-b' }]);
    vi.advanceTimersByTime(ALERT_BATCH_MS - 1);
    expect(FakeNotification.instances).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(oscillators).toHaveLength(2);
    expect(FakeNotification.instances.map((n) => n.title)).toEqual([
      'app-a saiu de órbita',
      'app-b saiu de órbita',
    ]);
  });

  it('notificação traz Time e Ambiente em linhas, tag por app, renotify e clique foca a janela', () => {
    useAppsStore.setState({ apps: [app('a')] });
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => undefined);
    const { result } = renderHook(() => useDownAlerts());
    result.current.queueAlert([{ id: 'a', name: 'app-a' }]);
    vi.advanceTimersByTime(ALERT_BATCH_MS);
    const n = FakeNotification.instances[0];
    expect(n?.options).toEqual({
      body: 'Time: Time A\nAmbiente: PRODUÇÃO',
      tag: 'orbital-down-a',
      renotify: true,
    });
    n?.onclick?.();
    expect(focus).toHaveBeenCalled();
    expect(n?.close).toHaveBeenCalled();
  });

  it('usa o nome da queda quando a app não está na lista, sem corpo', () => {
    const { result } = renderHook(() => useDownAlerts());
    result.current.queueAlert([{ id: 'z', name: 'fantasma' }]);
    vi.advanceTimersByTime(ALERT_BATCH_MS);
    expect(FakeNotification.instances[0]?.title).toBe('fantasma saiu de órbita');
    expect(FakeNotification.instances[0]?.options.body).toBe('');
  });

  it('não alerta com a janela em foco', () => {
    setFocus(true);
    const { result } = renderHook(() => useDownAlerts());
    result.current.queueAlert([{ id: 'a', name: 'app-a' }]);
    vi.advanceTimersByTime(ALERT_BATCH_MS);
    expect(oscillators).toHaveLength(0);
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('com a aba escondida alerta mesmo com foco', () => {
    setFocus(true);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const { result } = renderHook(() => useDownAlerts());
    result.current.queueAlert([{ id: 'a', name: 'app-a' }]);
    vi.advanceTimersByTime(ALERT_BATCH_MS);
    expect(oscillators).toHaveLength(2);
  });

  it('som desligado não bipa; notificação desligada só bipa', () => {
    usePreferencesStore.setState({ sound: false });
    const { result } = renderHook(() => useDownAlerts());
    result.current.queueAlert([{ id: 'a', name: 'app-a' }]);
    vi.advanceTimersByTime(ALERT_BATCH_MS);
    expect(oscillators).toHaveLength(0);
    expect(FakeNotification.instances).toHaveLength(1);
    usePreferencesStore.setState({ sound: true, notify: false });
    result.current.queueAlert([{ id: 'a', name: 'app-a' }]);
    vi.advanceTimersByTime(ALERT_BATCH_MS);
    expect(oscillators).toHaveLength(2);
    expect(FakeNotification.instances).toHaveLength(1);
  });

  it('o bipe usa 880 Hz e 620 Hz com 0,18 s de passo e as rampas do legado', () => {
    const { result } = renderHook(() => useDownAlerts());
    result.current.queueAlert([{ id: 'a', name: 'app-a' }]);
    vi.advanceTimersByTime(ALERT_BATCH_MS);
    expect(oscillators.map((o) => o.frequency.value)).toEqual([880, 620]);
    expect(oscillators[0]?.start).toHaveBeenCalledWith(10);
    expect(oscillators[0]?.stop).toHaveBeenCalledWith(10.18);
    expect(oscillators[1]?.start).toHaveBeenCalledWith(10.18);
    expect(ramps.map(([v]) => v)).toEqual([0.18, 0.0001, 0.18, 0.0001]);
    expect(ramps[0]?.[1]).toBeCloseTo(10.02);
    expect(ramps[1]?.[1]).toBeCloseTo(10.16);
  });

  it('permissão revogada com o switch ligado grava 0, desliga notify e marca notifyBlocked', () => {
    FakeNotification.permission = 'denied';
    localStorage.setItem('orbital-notify-v1', '1');
    const { result } = renderHook(() => useDownAlerts());
    result.current.queueAlert([{ id: 'a', name: 'app-a' }]);
    vi.advanceTimersByTime(ALERT_BATCH_MS);
    expect(oscillators).toHaveLength(2);
    expect(FakeNotification.instances).toHaveLength(0);
    expect(localStorage.getItem('orbital-notify-v1')).toBe('0');
    expect(usePreferencesStore.getState()).toMatchObject({ notify: false, notifyBlocked: true });
  });

  it('falha do construtor de Notification não propaga', () => {
    vi.stubGlobal(
      'Notification',
      Object.assign(
        function Boom() {
          throw new Error('x');
        },
        { permission: 'granted' },
      ),
    );
    const { result } = renderHook(() => useDownAlerts());
    result.current.queueAlert([{ id: 'a', name: 'app-a' }]);
    expect(() => vi.advanceTimersByTime(ALERT_BATCH_MS)).not.toThrow();
  });
});

describe('ao voltar o foco', () => {
  it('descarta o lote e fecha as notificações abertas', () => {
    const { result } = renderHook(() => useDownAlerts());
    result.current.queueAlert([{ id: 'a', name: 'app-a' }]);
    vi.advanceTimersByTime(ALERT_BATCH_MS);
    result.current.queueAlert([{ id: 'b', name: 'app-b' }]);
    setFocus(true);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(FakeNotification.instances[0]?.close).toHaveBeenCalled();
    vi.advanceTimersByTime(ALERT_BATCH_MS);
    expect(FakeNotification.instances).toHaveLength(1);
  });

  it('evento de foco ainda sem foco real não descarta nada', () => {
    const { result } = renderHook(() => useDownAlerts());
    result.current.queueAlert([{ id: 'a', name: 'app-a' }]);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    vi.advanceTimersByTime(ALERT_BATCH_MS);
    expect(FakeNotification.instances).toHaveLength(1);
  });

  it('visibilitychange com foco também descarta', () => {
    const { result } = renderHook(() => useDownAlerts());
    result.current.queueAlert([{ id: 'a', name: 'app-a' }]);
    setFocus(true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    vi.advanceTimersByTime(ALERT_BATCH_MS);
    expect(FakeNotification.instances).toHaveLength(0);
  });
});

describe('API fora', () => {
  it('alerta uma vez na queda, com título e corpo literais e tag orbital-api', () => {
    renderHook(() => useDownAlerts());
    act(() => {
      useConnectionStore.getState().markApiDown();
      useConnectionStore.getState().markApiDown();
    });
    expect(oscillators).toHaveLength(2);
    expect(FakeNotification.instances).toHaveLength(1);
    const n = FakeNotification.instances[0];
    expect(n?.title).toBe('Tempestade: Orbital perdeu contato com a API');
    expect(n?.options).toEqual({
      body: 'Os status do painel ficam desatualizados até a conexão voltar.',
      tag: 'orbital-api',
      renotify: true,
    });
  });

  it('não alerta com a janela em foco nem sem o switch de notificação', () => {
    setFocus(true);
    renderHook(() => useDownAlerts());
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    expect(FakeNotification.instances).toHaveLength(0);
    act(() => {
      useConnectionStore.getState().markApiUp();
      setFocus(false);
      usePreferencesStore.setState({ notify: false });
      useConnectionStore.getState().markApiDown();
    });
    expect(FakeNotification.instances).toHaveLength(0);
    expect(oscillators).toHaveLength(2);
  });

  it('desmontar cancela o assinante e o lote', () => {
    const { result, unmount } = renderHook(() => useDownAlerts());
    result.current.queueAlert([{ id: 'a', name: 'app-a' }]);
    unmount();
    vi.advanceTimersByTime(ALERT_BATCH_MS);
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    expect(FakeNotification.instances).toHaveLength(0);
  });
});

describe('toggleNotify', () => {
  beforeEach(() => {
    usePreferencesStore.setState({ notify: false });
  });

  it('ligar com permissão concedida grava 1 e mostra a notificação de teste, fechada após 6 s', async () => {
    await toggleNotify();
    expect(usePreferencesStore.getState()).toMatchObject({ notify: true, notifyBlocked: false });
    expect(localStorage.getItem('orbital-notify-v1')).toBe('1');
    const n = FakeNotification.instances[0];
    expect(n?.title).toBe('Alertas ativados');
    expect(n?.options.tag).toBe('orbital-test');
    vi.advanceTimersByTime(5999);
    expect(n?.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(n?.close).toHaveBeenCalled();
  });

  it('pede a permissão quando é default e bloqueia se negada', async () => {
    FakeNotification.permission = 'default';
    FakeNotification.requestPermission.mockResolvedValueOnce('denied');
    await toggleNotify();
    expect(FakeNotification.requestPermission).toHaveBeenCalled();
    expect(usePreferencesStore.getState()).toMatchObject({ notify: false, notifyBlocked: true });
    expect(localStorage.getItem('orbital-notify-v1')).toBeNull();
  });

  it('sem contexto seguro marca notifyBlocked sem pedir permissão', async () => {
    vi.stubGlobal('isSecureContext', false);
    await toggleNotify();
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect(usePreferencesStore.getState().notifyBlocked).toBe(true);
  });

  it('desligar grava 0', async () => {
    usePreferencesStore.setState({ notify: true });
    await toggleNotify();
    expect(usePreferencesStore.getState().notify).toBe(false);
    expect(localStorage.getItem('orbital-notify-v1')).toBe('0');
  });
});

describe('toggleSound', () => {
  it('ligar grava 1 e toca o bipe de prévia; desligar grava 0 em silêncio', () => {
    usePreferencesStore.setState({ sound: false });
    toggleSound();
    expect(usePreferencesStore.getState().sound).toBe(true);
    expect(localStorage.getItem('orbital-sound-v1')).toBe('1');
    expect(oscillators).toHaveLength(2);
    toggleSound();
    expect(usePreferencesStore.getState().sound).toBe(false);
    expect(localStorage.getItem('orbital-sound-v1')).toBe('0');
    expect(oscillators).toHaveLength(2);
  });
});

describe('StrictMode', () => {
  it('montar, desmontar e montar de novo não duplica o alerta de API fora', () => {
    const first = renderHook(() => useDownAlerts());
    first.unmount();
    renderHook(() => useDownAlerts());
    act(() => {
      useConnectionStore.getState().markApiDown();
    });
    expect(FakeNotification.instances).toHaveLength(1);
  });
});
