import { beforeEach, describe, expect, it } from 'vitest';
import type { Application } from '@/domain/types';
import { usePanelStore } from './panel.store';

const app: Application = {
  id: 'a',
  env: 'prd',
  name: 'app-a',
  team: 'time-a',
  healthCheckUrl: 'http://a',
  swaggerUrl: '',
  orbits: ['Core'],
};

beforeEach(() => {
  usePanelStore.setState(usePanelStore.getInitialState());
});

describe('panel.store', () => {
  it('começa sem busca, filtro TODAS, página 0, sem seleção e com o formulário fechado', () => {
    const s = usePanelStore.getState();
    expect(s.query).toBe('');
    expect(s.filter).toBe('all');
    expect(s.page).toBe(0);
    expect(s.selectedId).toBeNull();
    expect(s.pendingRemoveId).toBeNull();
    expect(s.formOpen).toBe(false);
    expect(s.editing).toBeNull();
  });

  it('busca e filtro voltam para a primeira página', () => {
    usePanelStore.getState().setPage(2);
    usePanelStore.getState().setQuery('pay');
    expect(usePanelStore.getState()).toMatchObject({ query: 'pay', page: 0 });
    usePanelStore.getState().setPage(2);
    usePanelStore.getState().setFilter('unhealthy');
    expect(usePanelStore.getState()).toMatchObject({ filter: 'unhealthy', page: 0 });
  });

  it('trocar de ambiente zera página e seleção, mas mantém busca e filtro', () => {
    const s = usePanelStore.getState();
    s.setQuery('pay');
    s.setFilter('healthy');
    s.setPage(1);
    s.setSelected('a');
    s.resetForEnv();
    expect(usePanelStore.getState()).toMatchObject({
      query: 'pay',
      filter: 'healthy',
      page: 0,
      selectedId: null,
    });
  });

  it('pede e cancela a remoção', () => {
    usePanelStore.getState().requestRemove('a');
    expect(usePanelStore.getState().pendingRemoveId).toBe('a');
    usePanelStore.getState().cancelRemove();
    expect(usePanelStore.getState().pendingRemoveId).toBeNull();
  });

  it('abre o formulário para cadastro e para edição e fecha', () => {
    usePanelStore.getState().openEdit(app);
    expect(usePanelStore.getState()).toMatchObject({ formOpen: true, editing: app });
    usePanelStore.getState().closeForm();
    expect(usePanelStore.getState()).toMatchObject({ formOpen: false, editing: null });
    usePanelStore.getState().openCreate();
    expect(usePanelStore.getState()).toMatchObject({ formOpen: true, editing: null });
  });

  it('pruneTo solta a seleção e a remoção pendente de apps que saíram da lista', () => {
    const s = usePanelStore.getState();
    s.setSelected('a');
    s.requestRemove('b');
    s.pruneTo(new Set(['a']));
    expect(usePanelStore.getState()).toMatchObject({ selectedId: 'a', pendingRemoveId: null });
    usePanelStore.getState().pruneTo(new Set());
    expect(usePanelStore.getState().selectedId).toBeNull();
  });
});
