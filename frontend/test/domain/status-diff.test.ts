import { describe, expect, it } from 'vitest';
import { STATUS_STALE_MS } from '@/domain/constants';
import {
  checkedResults,
  cycleListStale,
  diffStatuses,
  initialDownSeen,
  initialStaleEnvs,
  markEnvChecked,
  pruneToKnown,
  snapshotListStale,
} from '@/domain/status-diff';

const known = new Set(['a', 'b', 'c']);

describe('diffStatuses', () => {
  it('não muda nada quando os resultados repetem o estado', () => {
    const r = diffStatuses(
      { a: 'healthy' },
      [{ id: 'a', name: 'A', status: 'healthy' }],
      new Set(),
      known,
    );
    expect(r).toEqual({
      patch: { a: 'healthy' },
      fell: [],
      unknown: false,
      moved: false,
      downSeen: new Set(),
    });
  });

  it('marca moved quando o status mudou ou é novo', () => {
    expect(
      diffStatuses({ a: 'healthy' }, [{ id: 'a', name: 'A', status: 'degraded' }], new Set(), known)
        .moved,
    ).toBe(true);
    expect(
      diffStatuses({}, [{ id: 'b', name: 'B', status: 'healthy' }], new Set(), known).moved,
    ).toBe(true);
  });

  it('registra a queda para unhealthy uma única vez', () => {
    const first = diffStatuses(
      { a: 'healthy' },
      [{ id: 'a', name: 'A', status: 'unhealthy' }],
      new Set(),
      known,
    );
    expect(first.fell).toEqual([{ id: 'a', name: 'A' }]);
    expect(first.downSeen).toEqual(new Set(['a']));
    const again = diffStatuses(
      { a: 'unhealthy' },
      [{ id: 'a', name: 'A', status: 'unhealthy' }],
      first.downSeen,
      known,
    );
    expect(again.fell).toEqual([]);
    expect(again.moved).toBe(false);
  });

  it('quem se recupera sai de downSeen e pode cair de novo', () => {
    const up = diffStatuses(
      { a: 'unhealthy' },
      [{ id: 'a', name: 'A', status: 'degraded' }],
      new Set(['a']),
      known,
    );
    expect(up.downSeen).toEqual(new Set());
    expect(up.fell).toEqual([]);
    const down = diffStatuses(
      { a: 'degraded' },
      [{ id: 'a', name: 'A', status: 'unhealthy' }],
      up.downSeen,
      known,
    );
    expect(down.fell).toEqual([{ id: 'a', name: 'A' }]);
  });

  it('avisa de ids que a lista não conhece', () => {
    const r = diffStatuses({}, [{ id: 'zzz', name: 'Z', status: 'healthy' }], new Set(), known);
    expect(r.unknown).toBe(true);
    expect(r.patch).toEqual({ zzz: 'healthy' });
  });

  it('não altera o downSeen recebido', () => {
    const seen = new Set<string>();
    diffStatuses({}, [{ id: 'a', name: 'A', status: 'unhealthy' }], seen, known);
    expect(seen.size).toBe(0);
  });

  it('trata vários resultados de uma vez', () => {
    const r = diffStatuses(
      { a: 'healthy', b: 'healthy' },
      [
        { id: 'a', name: 'A', status: 'unhealthy' },
        { id: 'b', name: 'B', status: 'healthy' },
        { id: 'c', name: 'C', status: 'unhealthy' },
      ],
      new Set(),
      known,
    );
    expect(r.fell.map((f) => f.id)).toEqual(['a', 'c']);
    expect(r.patch).toEqual({ a: 'unhealthy', b: 'healthy', c: 'unhealthy' });
  });

  it('sem resultados (cycle) nada se move', () => {
    expect(diffStatuses({ a: 'healthy' }, [], new Set(), known)).toEqual({
      patch: {},
      fell: [],
      unknown: false,
      moved: false,
      downSeen: new Set(),
    });
  });
});

describe('checkedResults', () => {
  it('deixa de fora quem nunca foi checado', () => {
    expect(
      checkedResults([
        { id: 'a', name: 'A', status: 'healthy' },
        { id: 'b', name: 'B', status: null },
      ]),
    ).toEqual([{ id: 'a', name: 'A', status: 'healthy' }]);
  });
});

describe('initialDownSeen', () => {
  it('começa com quem está fora do ar no cache', () => {
    expect(initialDownSeen({ a: 'unhealthy', b: 'healthy', c: 'degraded' })).toEqual(
      new Set(['a']),
    );
  });
});

describe('initialStaleEnvs', () => {
  const now = 10_000_000;
  it('todos os ambientes quando o status guardado é mais velho que o limite', () => {
    expect(initialStaleEnvs({ a: 'healthy' }, now - STATUS_STALE_MS - 1, now)).toEqual([
      'dev',
      'hml',
      'prd',
    ]);
  });
  it('nenhum quando é recente (inclusive no limite exato)', () => {
    expect(initialStaleEnvs({ a: 'healthy' }, now - STATUS_STALE_MS, now)).toEqual([]);
    expect(initialStaleEnvs({ a: 'healthy' }, now - 1000, now)).toEqual([]);
  });
  it('nenhum quando não há status guardado', () => {
    expect(initialStaleEnvs({}, 0, now)).toEqual([]);
  });
  it('ts 0 (formato antigo) conta como velho', () => {
    expect(initialStaleEnvs({ a: 'healthy' }, 0, now)).toHaveLength(3);
  });
});

describe('markEnvChecked', () => {
  it('tira o ambiente do stale e avança o lastOk sem mexer no ts enquanto sobra ambiente', () => {
    expect(markEnvChecked(['dev', 'hml', 'prd'], 100, 'hml', 500)).toEqual({
      staleEnvs: ['dev', 'prd'],
      lastOk: 500,
      statusTs: null,
    });
  });
  it('avança o ts só quando nenhum ambiente segue stale', () => {
    expect(markEnvChecked(['prd'], 100, 'prd', 500)).toEqual({
      staleEnvs: [],
      lastOk: 500,
      statusTs: 500,
    });
  });
  it('lastOk nunca recua', () => {
    expect(markEnvChecked([], 900, 'dev', 500)).toEqual({
      staleEnvs: [],
      lastOk: 900,
      statusTs: 900,
    });
  });
  it('ambiente que não estava stale não muda a lista', () => {
    expect(markEnvChecked(['dev'], 0, 'prd', 5)).toEqual({
      staleEnvs: ['dev'],
      lastOk: 5,
      statusTs: null,
    });
  });
});

describe('snapshotListStale', () => {
  it('false quando os ids batem, em qualquer ordem', () => {
    expect(snapshotListStale(['a', 'b'], ['b', 'a'])).toBe(false);
  });
  it('true quando a contagem difere', () => {
    expect(snapshotListStale(['a'], ['a', 'b'])).toBe(true);
    expect(snapshotListStale(['a', 'b', 'c'], ['a', 'b'])).toBe(true);
  });
  it('true quando a contagem bate mas há id diferente', () => {
    expect(snapshotListStale(['a', 'x'], ['a', 'b'])).toBe(true);
  });
  it('ambiente vazio dos dois lados está em dia', () => {
    expect(snapshotListStale([], [])).toBe(false);
  });
});

describe('cycleListStale', () => {
  it('compara o número de apps checadas com o da lista', () => {
    expect(cycleListStale(3, 3)).toBe(false);
    expect(cycleListStale(4, 3)).toBe(true);
    expect(cycleListStale(2, 3)).toBe(true);
  });
});

describe('pruneToKnown', () => {
  it('mantém status e downSeen só dos ids que seguem na lista', () => {
    const r = pruneToKnown({ a: 'healthy', x: 'unhealthy' }, new Set(['a', 'x']), new Set(['a']));
    expect(r.status).toEqual({ a: 'healthy' });
    expect(r.downSeen).toEqual(new Set(['a']));
  });
});
