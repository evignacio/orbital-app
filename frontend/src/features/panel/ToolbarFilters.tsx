import { Chip } from '@/components/Chip';
import { FILTERS } from '@/domain/status';
import { toStatusFilter, type StatusFilter } from './panel.store';

export interface ToolbarFiltersProps {
  filter: StatusFilter;
  /** setFilter de usePanelFilters: volta para a primeira página. */
  onChange: (filter: StatusFilter) => void;
}

/**
 * Chips de filtro por status (painel.html ~193, chip()). A PanelPage os entrega
 * prontos à AppList (prop `filters`), que os põe na linha da paginação. Stub da
 * F3a; a F3b implementa.
 */
export function ToolbarFilters({ filter, onChange }: ToolbarFiltersProps) {
  return (
    <>
      {FILTERS.map(([key, label]) => (
        <Chip
          key={key}
          active={filter === key}
          onClick={() => {
            onChange(toStatusFilter(key));
          }}
        >
          {label}
        </Chip>
      ))}
    </>
  );
}
