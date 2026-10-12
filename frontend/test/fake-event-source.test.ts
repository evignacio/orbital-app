import { FakeEventSource } from './setup';

describe('FakeEventSource', () => {
  it('é instalado em globalThis e registra a instância criada', () => {
    const es = new EventSource('/api/applications/events');
    expect(FakeEventSource.last()).toBe(es);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect((es as unknown as FakeEventSource).url).toBe('/api/applications/events');
  });

  it('dispara open e atualiza o readyState', () => {
    const es = new EventSource('/x') as unknown as FakeEventSource;
    const aoAbrir = vi.fn();
    es.onopen = aoAbrir;
    expect(es.readyState).toBe(FakeEventSource.CONNECTING);
    es.emitOpen();
    expect(es.readyState).toBe(FakeEventSource.OPEN);
    expect(aoAbrir).toHaveBeenCalledOnce();
  });

  it('entrega eventos nomeados com data em JSON aos ouvintes', () => {
    const es = new EventSource('/x') as unknown as FakeEventSource;
    const ouvinte = vi.fn();
    es.addEventListener('status', ouvinte);
    es.emit('status', { id: 'a1', status: 'healthy' });
    const evento = ouvinte.mock.calls[0]?.[0] as MessageEvent<string>;
    expect(JSON.parse(evento.data)).toEqual({ id: 'a1', status: 'healthy' });
  });

  it('não entrega eventos a ouvintes removidos', () => {
    const es = new EventSource('/x') as unknown as FakeEventSource;
    const ouvinte = vi.fn();
    es.addEventListener('cycle', ouvinte);
    es.removeEventListener('cycle', ouvinte);
    es.emit('cycle', {});
    expect(ouvinte).not.toHaveBeenCalled();
  });

  it('dispara error e fecha com close()', () => {
    const es = new EventSource('/x') as unknown as FakeEventSource;
    const aoFalhar = vi.fn();
    es.onerror = aoFalhar;
    es.emitError();
    expect(aoFalhar).toHaveBeenCalledOnce();
    es.close();
    expect(es.readyState).toBe(FakeEventSource.CLOSED);
  });
});
