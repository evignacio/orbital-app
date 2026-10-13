import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { Orbit } from '@/domain/orbits';
import type { Application } from '@/domain/types';
import { useConnectionStore } from '@/store/connection.store';
import mono from '@/theme/mono.module.css';
import { AppCard } from './AppCard';
import styles from './AppList.module.css';
import { Pagination } from './Pagination';

export interface AppListProps {
  /** Ambiente da tela ∩ órbita: "FROTA · N APLICAÇÕES" e as mensagens de vazio. */
  envApps: readonly Application[];
  /** envApps pela busca e pelo filtro: o "X DE N" e o vazio por filtro. */
  visibleApps: readonly Application[];
  /** A fatia de visibleApps da página (PAGE_SIZE por página). */
  pagedApps: readonly Application[];
  /** Página atual (0-based, já limitada) e o total (≥ 1): rótulo "1/3" e ‹ ›. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  query: string;
  /** setQuery de usePanelFilters: volta para a primeira página. */
  onQueryChange: (query: string) => void;
  /** Os chips de filtro (ToolbarFilters, da F3b), prontos para a linha da paginação. */
  filters: ReactNode;
  selectedId: string | null;
  /** Clique no card: seleciona sem trocar de página (select(id) do legado). */
  onSelect: (id: string) => void;
  /** Lápis: abre o formulário em modo edição com esta app. */
  onEdit: (app: Application) => void;
  /** ✕: abre a confirmação de remoção (a PanelPage renderiza o RemoveDialog). */
  onRemove: (id: string) => void;
  /** Órbita do ?orbita=, para a mensagem de vazio "Nenhuma aplicação da órbita …". */
  currentOrbit: Orbit | null;
  /** API fora ou status antigo no ambiente: cards em --stale com "ÚLTIMO: …". */
  stale: boolean;
}

// Lista vazia: falha de carga, ambiente sem aplicações ou filtro sem resultado.
function emptyMsg(appCount: number, apiDown: boolean, orbit: Orbit | null): string {
  if (appCount > 0) return 'Nenhuma aplicação corresponde ao filtro.';
  if (apiDown) return 'Não foi possível carregar as aplicações. Tentando reconectar…';
  if (orbit) {
    return `Nenhuma aplicação da órbita ${orbit.name} neste ambiente. Use o botão + para lançar uma.`;
  }
  return 'Nenhuma aplicação em órbita ainda. Use o botão + para lançar a primeira.';
}

/**
 * Coluna da frota (painel.html ~182–237): cabeçalho, busca, filtros + paginação,
 * cards e vazio. Renderiza o conteúdo: a <section> #listCol (sticky, @media) é da
 * PanelPage.
 */
export function AppList({
  envApps,
  visibleApps,
  pagedApps,
  page,
  pageCount,
  onPageChange,
  query,
  onQueryChange,
  filters,
  selectedId,
  onSelect,
  onEdit,
  onRemove,
  currentOrbit,
  stale,
}: AppListProps) {
  const apiDown = useConnectionStore((s) => s.apiDown);

  // Os callbacks da página mudam de identidade a cada render dela (a cada status, com
  // filtro ativo). Os cards memoizados recebem versões estáveis que leem o ref.
  const latest = useRef({ onSelect, onEdit, onRemove });
  useEffect(() => {
    latest.current = { onSelect, onEdit, onRemove };
  });
  const select = useCallback((id: string) => {
    latest.current.onSelect(id);
  }, []);
  const edit = useCallback((app: Application) => {
    latest.current.onEdit(app);
  }, []);
  const remove = useCallback((id: string) => {
    latest.current.onRemove(id);
  }, []);

  const total = envApps.length;
  const shown =
    visibleApps.length === total ? '' : `${String(visibleApps.length)} DE ${String(total)}`;

  return (
    <>
      <div className={styles.header}>
        <span className={[mono.eyebrow, styles.total].join(' ')}>
          {`FROTA · ${String(total)} ${total === 1 ? 'APLICAÇÃO' : 'APLICAÇÕES'}`}
        </span>
        <span className={styles.shown}>{shown}</span>
      </div>

      <input
        className={styles.search}
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
        }}
        placeholder="Buscar por nome ou time…"
      />

      <div className={styles.filterRow}>
        {filters}
        <Pagination page={page} pageCount={pageCount} onChange={onPageChange} />
      </div>

      <div className={styles.cards}>
        {pagedApps.map((a) => (
          <AppCard
            key={a.id}
            app={a}
            selected={selectedId === a.id}
            stale={stale}
            onSelect={select}
            onEdit={edit}
            onRemove={remove}
          />
        ))}
        {visibleApps.length === 0 && (
          <div className={styles.empty}>{emptyMsg(total, apiDown, currentOrbit)}</div>
        )}
      </div>
    </>
  );
}
