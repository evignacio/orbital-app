import { describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from '../../test/setup';
import { EVENTS_URL, openEventStream, parseEvent, type ServerEvent } from './events';

const cycleRaw = {
  env: 'staging',
  trigger: 'manual',
  checked: 3,
  changed: 1,
  healthy: 2,
  degraded: 1,
  unhealthy: 0,
  startedAt: '2026-01-01T10:00:00.000Z',
  checkedAt: '2026-01-01T10:00:02.000Z',
  durationMs: 2000,
  nextCheckAt: '2026-01-01T10:00:32.000Z',
};
const cycleParsed = {
  env: 'hml',
  trigger: 'manual',
  checked: 3,
  changed: 1,
  healthy: 2,
  degraded: 1,
  unhealthy: 0,
  startedAt: Date.parse('2026-01-01T10:00:00.000Z'),
  checkedAt: Date.parse('2026-01-01T10:00:02.000Z'),
  durationMs: 2000,
  nextCheckAt: Date.parse('2026-01-01T10:00:32.000Z'),
};

describe('parseEvent snapshot', () => {
  it('converte env, datas e status', () => {
    const data = JSON.stringify({
      env: 'production',
      apps: [
        { id: 'a1', name: 'um', env: 'production', orbits: [], status: 'healthy' },
        { id: 'a2', name: 'dois', env: 'production', orbits: [], status: null },
      ],
      cycle: { ...cycleRaw, env: 'production' },
      nextCheckAt: '2026-01-01T10:00:32.000Z',
    });
    expect(parseEvent('snapshot', data)).toEqual({
      type: 'snapshot',
      env: 'prd',
      apps: [
        { id: 'a1', name: 'um', status: 'healthy' },
        { id: 'a2', name: 'dois', status: null },
      ],
      cycle: { ...cycleParsed, env: 'prd' },
      nextCheckAt: Date.parse('2026-01-01T10:00:32.000Z'),
    });
  });

  it('aceita cycle e nextCheckAt nulos', () => {
    const ev = parseEvent(
      'snapshot',
      JSON.stringify({ env: 'development', apps: [], cycle: null, nextCheckAt: null }),
    );
    expect(ev).toEqual({ type: 'snapshot', env: 'dev', apps: [], cycle: null, nextCheckAt: null });
  });

  it('trata status desconhecido como unhealthy e ausente como nunca checada', () => {
    const ev = parseEvent(
      'snapshot',
      JSON.stringify({ env: 'staging', apps: [{ id: 'a', status: 'zzz' }, { id: 'b' }] }),
    );
    expect(ev).toMatchObject({
      apps: [
        { id: 'a', name: '', status: 'unhealthy' },
        { id: 'b', name: '', status: null },
      ],
    });
  });

  it('descarta apps sem id e cycle inválido', () => {
    const ev = parseEvent(
      'snapshot',
      JSON.stringify({
        env: 'staging',
        apps: [null, { name: 'sem id' }, { id: '' }, { id: 'ok' }],
        cycle: { ...cycleRaw, checkedAt: 'ontem' },
      }),
    );
    expect(ev).toMatchObject({ apps: [{ id: 'ok' }], cycle: null, nextCheckAt: null });
  });

  it('recusa snapshot sem lista de apps', () => {
    expect(parseEvent('snapshot', JSON.stringify({ env: 'staging', apps: 'x' }))).toBeNull();
  });
});

describe('parseEvent status', () => {
  const raw = {
    id: 'a1',
    name: 'um',
    env: 'development',
    status: 'degraded',
    latencyMs: 4200,
    limitMs: 3000,
    checkedAt: '2026-01-01T10:00:01.000Z',
  };

  it('converte um status degradado com limitMs', () => {
    expect(parseEvent('status', JSON.stringify(raw))).toEqual({
      type: 'status',
      env: 'dev',
      id: 'a1',
      name: 'um',
      status: 'degraded',
      latencyMs: 4200,
      limitMs: 3000,
      checkedAt: Date.parse('2026-01-01T10:00:01.000Z'),
    });
  });

  it('aceita latencyMs nulo e omite limitMs', () => {
    const ev = parseEvent(
      'status',
      JSON.stringify({ ...raw, status: 'unhealthy', latencyMs: null, limitMs: undefined }),
    );
    expect(ev).toEqual({
      type: 'status',
      env: 'dev',
      id: 'a1',
      name: 'um',
      status: 'unhealthy',
      latencyMs: null,
      checkedAt: Date.parse('2026-01-01T10:00:01.000Z'),
    });
    expect(ev).not.toHaveProperty('limitMs');
  });

  it('conta status desconhecido como fora do ar e tolera nome e data ausentes', () => {
    expect(
      parseEvent('status', JSON.stringify({ id: 'a1', env: 'staging', status: 'zzz' })),
    ).toMatchObject({ status: 'unhealthy', name: '', latencyMs: null, checkedAt: null });
  });

  it('recusa status sem id', () => {
    expect(parseEvent('status', JSON.stringify({ env: 'staging', status: 'healthy' }))).toBeNull();
    expect(
      parseEvent('status', JSON.stringify({ id: '', env: 'staging', status: 'healthy' })),
    ).toBeNull();
  });
});

describe('parseEvent cycle', () => {
  it('converte env e datas', () => {
    expect(parseEvent('cycle', JSON.stringify(cycleRaw))).toEqual({
      type: 'cycle',
      ...cycleParsed,
    });
  });

  it('normaliza trigger, contadores e nextCheckAt ausentes', () => {
    const ev = parseEvent(
      'cycle',
      JSON.stringify({ env: 'staging', checked: 0, checkedAt: cycleRaw.checkedAt, trigger: 'x' }),
    );
    expect(ev).toMatchObject({
      trigger: 'scheduled',
      changed: 0,
      healthy: 0,
      durationMs: 0,
      startedAt: null,
      nextCheckAt: null,
    });
  });

  it('recusa cycle sem checked numérico ou sem data válida', () => {
    expect(parseEvent('cycle', JSON.stringify({ ...cycleRaw, checked: '3' }))).toBeNull();
    expect(parseEvent('cycle', JSON.stringify({ ...cycleRaw, checkedAt: null }))).toBeNull();
    expect(parseEvent('cycle', JSON.stringify({ ...cycleRaw, checkedAt: 'x' }))).toBeNull();
  });
});

describe('parseEvent lixo', () => {
  it('devolve null para JSON ilegível, não-objeto, env desconhecido e tipo desconhecido', () => {
    expect(parseEvent('status', '{quebrado')).toBeNull();
    expect(parseEvent('status', 'null')).toBeNull();
    expect(parseEvent('status', '[1]')).toBeNull();
    expect(
      parseEvent('status', JSON.stringify({ id: 'a', env: 'qa', status: 'healthy' })),
    ).toBeNull();
    expect(parseEvent('status', JSON.stringify({ id: 'a', status: 'healthy' }))).toBeNull();
    expect(
      parseEvent('status', JSON.stringify({ id: 'a', env: 'toString', status: 'healthy' })),
    ).toBeNull();
    expect(parseEvent('outro', JSON.stringify({ env: 'staging' }))).toBeNull();
  });
});

describe('openEventStream', () => {
  it('abre o EventSource na URL do stream com changes=true', () => {
    openEventStream({ onEvent: vi.fn() });
    expect(EVENTS_URL).toBe('/api/applications/events?changes=true');
    expect(FakeEventSource.last().url).toBe(EVENTS_URL);
  });

  it('entrega os três tipos de evento já validados e ignora lixo', () => {
    const received: ServerEvent[] = [];
    openEventStream({
      onEvent: (e) => {
        received.push(e);
      },
    });
    const es = FakeEventSource.last();
    es.emit('snapshot', { env: 'staging', apps: [], cycle: null, nextCheckAt: null });
    es.emit('status', { id: 'a1', name: 'x', env: 'staging', status: 'healthy' });
    es.emit('cycle', cycleRaw);
    es.emit('status', { env: 'staging' });
    es.emit('desconhecido', {});
    expect(received.map((e) => e.type)).toEqual(['snapshot', 'status', 'cycle']);
    expect(received.every((e) => e.env === 'hml')).toBe(true);
  });

  it('avisa open e error, dizendo se o navegador desistiu', () => {
    const onOpen = vi.fn();
    const onError = vi.fn();
    openEventStream({ onEvent: vi.fn(), onOpen, onError });
    const es = FakeEventSource.last();
    es.emitOpen();
    expect(onOpen).toHaveBeenCalledTimes(1);
    es.emitError();
    expect(onError).toHaveBeenLastCalledWith(false);
    // O fake devolve a CONNECTING em emitError; o navegador que desiste chama onerror já em CLOSED.
    es.close();
    es.onerror?.(new Event('error'));
    expect(onError).toHaveBeenLastCalledWith(true);
  });

  it('funciona sem os callbacks opcionais', () => {
    openEventStream({ onEvent: vi.fn() });
    const es = FakeEventSource.last();
    expect(() => {
      es.emitOpen();
      es.emitError();
    }).not.toThrow();
  });

  it('devolve a limpeza que fecha o stream', () => {
    const close = openEventStream({ onEvent: vi.fn() });
    const es = FakeEventSource.last();
    expect(es.readyState).not.toBe(FakeEventSource.CLOSED);
    close();
    expect(es.readyState).toBe(FakeEventSource.CLOSED);
  });
});
