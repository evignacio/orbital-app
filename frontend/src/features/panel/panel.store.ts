import { create } from 'zustand';
import type { Application, Status } from '@/domain/types';

/** Valor de um chip de filtro (domain/status.ts, FILTERS): 'all' ou um status. */
export type StatusFilter = 'all' | Status;

// Estado de tela do painel (legacy/script.js: query, filter, page, selectedId,
// pendingRemoveId e o formOpen/editingId do app-form.js). Não persiste: some ao
// sair da página (usePanelLifecycle), como o legado some no reload.
interface PanelState {
  query: string;
  filter: StatusFilter;
  /** Página pedida; quem lê usa a de usePanelFilters, limitada ao total. */
  page: number;
  /** App em destaque (card ↔ planeta). */
  selectedId: string | null;
  /** App no modal de remoção; o modal só abre se ela estiver no envApps da tela. */
  pendingRemoveId: string | null;
  formOpen: boolean;
  /**
   * App em edição, como estava ao clicar no lápis (o legado copiava os campos no
   * editApp); null é cadastro novo. Fica mesmo se a app sair da lista: o PUT
   * devolve 404 e o formulário avisa.
   */
  editing: Application | null;
}

interface PanelActions {
  setQuery: (query: string) => void;
  setFilter: (filter: StatusFilter) => void;
  setPage: (page: number) => void;
  /** Só a seleção; a página do item vem de usePanelFilters().select. */
  setSelected: (id: string | null, page?: number) => void;
  /** Troca de ambiente: página e seleção zeram; busca e filtro ficam. */
  resetForEnv: () => void;
  requestRemove: (id: string) => void;
  cancelRemove: () => void;
  openCreate: () => void;
  openEdit: (app: Application) => void;
  closeForm: () => void;
  /** Lista nova (commitApps): seleção e remoção pendente se soltam de apps que saíram. */
  pruneTo: (ids: ReadonlySet<string>) => void;
}

export const usePanelStore = create<PanelState & PanelActions>()((set, get) => ({
  query: '',
  filter: 'all',
  page: 0,
  selectedId: null,
  pendingRemoveId: null,
  formOpen: false,
  editing: null,

  setQuery: (query) => {
    set({ query, page: 0 });
  },
  setFilter: (filter) => {
    set({ filter, page: 0 });
  },
  setPage: (page) => {
    set({ page });
  },
  setSelected: (selectedId, page) => {
    set(page === undefined ? { selectedId } : { selectedId, page });
  },
  resetForEnv: () => {
    set({ page: 0, selectedId: null });
  },
  requestRemove: (pendingRemoveId) => {
    set({ pendingRemoveId });
  },
  cancelRemove: () => {
    set({ pendingRemoveId: null });
  },
  openCreate: () => {
    set({ formOpen: true, editing: null });
  },
  openEdit: (editing) => {
    set({ formOpen: true, editing });
  },
  closeForm: () => {
    set({ formOpen: false, editing: null });
  },
  pruneTo: (ids) => {
    const { selectedId, pendingRemoveId } = get();
    const keep = (id: string | null) => (id !== null && ids.has(id) ? id : null);
    if (keep(selectedId) === selectedId && keep(pendingRemoveId) === pendingRemoveId) return;
    set({ selectedId: keep(selectedId), pendingRemoveId: keep(pendingRemoveId) });
  },
}));
