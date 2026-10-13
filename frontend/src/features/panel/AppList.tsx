import type { ReactNode } from 'react';
import type { Orbit } from '@/domain/orbits';
import type { Application } from '@/domain/types';

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

/**
 * Coluna da frota (painel.html ~182–237): cabeçalho, busca, filtros + paginação,
 * cards e vazio. Renderiza o conteúdo: a <section> #listCol (sticky, @media) é da
 * PanelPage. Stub da F3a; a F3c implementa.
 */
export function AppList({ pagedApps, filters, onSelect }: AppListProps) {
  return (
    <>
      <div>{filters}</div>
      {pagedApps.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => {
            onSelect(a.id);
          }}
        >
          {a.name}
        </button>
      ))}
    </>
  );
}
