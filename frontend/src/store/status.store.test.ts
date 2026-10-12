import { beforeEach, describe, expect, it } from 'vitest';
import type { CycleMsg, SnapshotMsg, StatusMsg } from '../api/events';
import type { Application } from '../domain/types';
import { useConnectionStore } from './connection.store';
import { useStatusStore } from './status.store';

function app(id: string, env: Application['env'] = 'prd'): Application {
  return { id, env, name: `app-${id}`, team: 't', healthCheckUrl: 'u', swaggerUrl: '', orbits: [] };
}

const APPS = [app('a'), app('b'), app('c', 'dev')];

function statusMsg(
  id: string,
  status: StatusMsg['status'],
  env: StatusMsg['env'] = 'prd',
): StatusMsg {
  return { type: 'status', env, id, name: `app-${id}`, status, latencyMs: 10, checkedAt: 1 };
}

function cycleMsg(env: CycleMsg['env'], checked: number, checkedAt: number): CycleMsg {
  return {
    type: 'cycle',
    env,
    trigger: 'scheduled',
    checked,
    changed: 0,
    healthy: checked,
    degraded: 0,
    unhealthy: 0,
    startedAt: checkedAt - 100,
    checkedAt,
    durationMs: 100,
    nextCheckAt: null,
  };
}

function snapshotMsg(
  env: SnapshotMsg['env'],
  apps: SnapshotMsg['apps'],
  checkedAt: number | null,
): SnapshotMsg {
  return {
    type: 'snapshot',
    env,
    apps,
    cycle: checkedAt === null ? null : cycleMsg(env, apps.length, checkedAt),
    nextCheckAt: null,
  };
}

const status = () => useStatusStore.getState();
const stored = () => JSON.parse(localStorage.getItem('orbital-status-v1') ?? 'null') as unknown;

beforeEach(() => {
  useStatusStore.setState(useStatusStore.getInitialState());
  useConnectionStore.setState(useConnectionStore.getInitialState());
});

describe('applyStatus', () => {
  it('mescla o status, grava o cache e devolve a queda nova', () => {
    const out = status().applyStatus(statusMsg('a', 'unhealthy'), APPS);
    expect(status().status).toEqual({ a: 'unhealthy' });
    expect(out).toEqual({ fell: [{ id: 'a', name: 'app-a' }], needsReload: false });
    expect(stored()).toEqual({ status: { a: 'unhealthy' }, ts: 0 });
    expect([...status().downSeen]).toEqual(['a']);
  });

  it('não repete o alerta de uma queda já vista e libera ao se recuperar', () => {
    status().applyStatus(statusMsg('a', 'unhealthy'), APPS);
    expect(status().applyStatus(statusMsg('a', 'unhealthy'), APPS).fell).toEqual([]);
    status().applyStatus(statusMsg('a', 'healthy'), APPS);
    expect(status().applyStatus(statusMsg('a', 'unhealthy'), APPS).fell).toHaveLength(1);
  });

  it('sem mudança e com a API de pé não grava nada', () => {
    status().applyStatus(statusMsg('a', 'healthy'), APPS);
    localStorage.clear();
    status().applyStatus(statusMsg('a', 'healthy'), APPS);
    expect(localStorage.getItem('orbital-status-v1')).toBeNull();
  });

  it('id fora da lista pede recarregar', () => {
    expect(status().applyStatus(statusMsg('zz', 'healthy'), APPS).needsReload).toBe(true);
  });

  it('receber um status encerra a tempestade e pede recarregar a lista', () => {
    useConnectionStore.getState().markApiDown();
    const out = status().applyStatus(statusMsg('a', 'healthy'), APPS);
    expect(useConnectionStore.getState().apiDown).toBe(false);
    expect(out.needsReload).toBe(true);
  });

  it('com a API fora grava mesmo sem mudança de status', () => {
    status().applyStatus(statusMsg('a', 'healthy'), APPS);
    localStorage.clear();
    useConnectionStore.getState().markApiDown();
    status().applyStatus(statusMsg('a', 'healthy'), APPS);
    expect(stored()).not.toBeNull();
  });
});

describe('applyCycle', () => {
  it('registra o ciclo, avança lastOk e ts e grava os dois', () => {
    useStatusStore.setState({ status: { a: 'healthy' }, staleEnvs: ['prd'] });
    const out = status().applyCycle(cycleMsg('prd', 2, 5000), APPS);
    expect(status().cycles.prd).toBe(5000);
    expect(status().staleEnvs).toEqual([]);
    expect(useConnectionStore.getState().lastOk).toBe(5000);
    expect(localStorage.getItem('orbital-lastok-v1')).toBe('5000');
    expect(status().ts).toBe(5000);
    expect(stored()).toEqual({ status: { a: 'healthy' }, ts: 5000 });
    expect(out).toEqual({ fell: [], needsReload: false });
  });

  it('o ts só avança quando nenhum ambiente segue stale', () => {
    useStatusStore.setState({ status: { a: 'healthy' }, ts: 10, staleEnvs: ['dev', 'prd'] });
    status().applyCycle(cycleMsg('prd', 2, 5000), APPS);
    expect(status().staleEnvs).toEqual(['dev']);
    expect(status().ts).toBe(10);
    expect(useConnectionStore.getState().lastOk).toBe(5000);
    status().applyCycle(cycleMsg('dev', 1, 4000), APPS);
    expect(status().ts).toBe(5000);
  });

  it('lastOk nunca recua', () => {
    useConnectionStore.setState({ lastOk: 9000 });
    status().applyCycle(cycleMsg('prd', 2, 5000), APPS);
    expect(useConnectionStore.getState().lastOk).toBe(9000);
  });

  it('número de apps diferente do da lista pede recarregar', () => {
    expect(status().applyCycle(cycleMsg('prd', 3, 5000), APPS).needsReload).toBe(true);
  });

  it('encerra a varredura do ambiente esperado e ignora a de outro', () => {
    useConnectionStore.getState().startScan('prd');
    status().applyCycle(cycleMsg('dev', 1, 5000), APPS);
    expect(useConnectionStore.getState().scanning).toBe(true);
    status().applyCycle(cycleMsg('prd', 2, 6000), APPS);
    expect(useConnectionStore.getState().scanning).toBe(false);
  });
});

describe('applySnapshot', () => {
  it('aplica só as apps já checadas, registra o ciclo e datas', () => {
    useStatusStore.setState({ status: { b: 'healthy' }, staleEnvs: ['prd'] });
    const out = status().applySnapshot(
      snapshotMsg(
        'prd',
        [
          { id: 'a', name: 'app-a', status: 'unhealthy' },
          { id: 'b', name: 'app-b', status: null },
        ],
        7000,
      ),
      APPS,
    );
    expect(status().status).toEqual({ a: 'unhealthy', b: 'healthy' });
    expect(status().cycles.prd).toBe(7000);
    expect(status().staleEnvs).toEqual([]);
    expect(out.fell).toEqual([{ id: 'a', name: 'app-a' }]);
    expect(out.needsReload).toBe(false);
  });

  it('sem ciclo guarda cycles[env] = null e não avança lastOk', () => {
    status().applySnapshot(
      snapshotMsg('prd', [{ id: 'a', name: 'app-a', status: null }], null),
      APPS,
    );
    expect(status().cycles.prd).toBeNull();
    expect(useConnectionStore.getState().lastOk).toBeNull();
  });

  it('lista do servidor diferente da do ambiente pede recarregar', () => {
    const out = status().applySnapshot(
      snapshotMsg('prd', [{ id: 'a', name: 'app-a', status: 'healthy' }], 100),
      APPS,
    );
    expect(out.needsReload).toBe(true);
  });

  it('com tempestade e "Tentar agora" em curso encerra a varredura e a tempestade', () => {
    useConnectionStore.getState().markApiDown();
    useConnectionStore.getState().startScan('prd');
    const out = status().applySnapshot(
      snapshotMsg(
        'prd',
        [
          { id: 'a', name: 'app-a', status: 'healthy' },
          { id: 'b', name: 'app-b', status: 'healthy' },
        ],
        100,
      ),
      APPS,
    );
    expect(useConnectionStore.getState().scanning).toBe(false);
    expect(useConnectionStore.getState().apiDown).toBe(false);
    expect(out.needsReload).toBe(true);
  });
});

describe('pruneTo', () => {
  it('mantém só os ids da lista, em status e downSeen, e grava', () => {
    useStatusStore.setState({
      status: { a: 'healthy', x: 'unhealthy' },
      ts: 5,
      downSeen: new Set(['x']),
    });
    status().pruneTo(new Set(['a']));
    expect(status().status).toEqual({ a: 'healthy' });
    expect(status().downSeen.size).toBe(0);
    expect(stored()).toEqual({ status: { a: 'healthy' }, ts: 5 });
  });
});
