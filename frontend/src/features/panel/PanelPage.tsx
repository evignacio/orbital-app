import { useCallback, useMemo } from 'react';
import { Icon } from '@/components/Icon';
import { AppFormDialog } from '@/features/app-form/AppFormDialog';
import { AppList } from './AppList';
import { OrbitView } from './OrbitView';
import { usePanelStore } from './panel.store';
import styles from './PanelPage.module.css';
import { RemoveDialog } from './RemoveDialog';
import { SkyLayers } from './SkyLayers';
import { StatsBar } from './StatsBar';
import { StormBanner } from './StormBanner';
import { Toolbar } from './Toolbar';
import { ToolbarEnvTabs } from './ToolbarEnvTabs';
import { ToolbarFilters } from './ToolbarFilters';
import { useAppMutations } from './useAppMutations';
import { usePanelFilters } from './usePanelFilters';
import { usePanelLifecycle } from './usePanelLifecycle';
import { useSync } from './useSync';

// Texto fixo do cabeçalho.
const SUBTITLE =
  'Cada planeta é uma aplicação em órbita. O brilho indica se o health check respondeu na última varredura.';

/**
 * O painel (/painel). A página monta o layout (contêineres,
 * grid e @media) e liga as regiões, cada uma num componente próprio.
 * Tema, título, alertas e o stream SSE são do AppShell.
 */
export function PanelPage() {
  usePanelLifecycle();
  const view = usePanelFilters();
  const { env, envApps, currentOrbit, stale, select } = view;
  const { sync } = useSync(env);
  const { onCreated, onUpdated } = useAppMutations();
  const pendingRemoveId = usePanelStore((s) => s.pendingRemoveId);
  const formOpen = usePanelStore((s) => s.formOpen);
  const editing = usePanelStore((s) => s.editing);
  const { openCreate, openEdit, closeForm, requestRemove, cancelRemove } = usePanelStore.getState();

  const pendingApp = useMemo(
    () => envApps.find((a) => a.id === pendingRemoveId) ?? null,
    [envApps, pendingRemoveId],
  );
  const selectFromOrbit = useCallback(
    (id: string) => {
      select(id, true);
    },
    [select],
  );
  const selectFromCard = useCallback(
    (id: string) => {
      select(id);
    },
    [select],
  );

  return (
    <div className={styles.root}>
      <SkyLayers />

      <div className={styles.topBar}>
        <Toolbar env={env} onSync={sync} />
      </div>

      <div className={styles.page}>
        <header className={styles.headerRow}>
          <div>
            <div className={styles.nav}>
              <a href="/" title="Voltar à galáxia" className={styles.back}>
                <Icon name="arrow-left" size={14} />
                Galáxia
              </a>
              <span className={styles.eyebrow}>{currentOrbit ? 'Órbita' : 'Todas as órbitas'}</span>
            </div>
            <div className={styles.envTabs}>
              <ToolbarEnvTabs env={env} onChange={view.setEnv} />
            </div>
            <h1 className={styles.title}>
              {currentOrbit ? currentOrbit.name : 'Órbita de Aplicações'}
            </h1>
            <p className={styles.subtitle}>{SUBTITLE}</p>
          </div>
          <div
            className={styles.statsRow}
            title={stale ? 'Dados desatualizados' : undefined}
            data-stale={stale}
          >
            <StatsBar apps={envApps} />
          </div>
        </header>

        <StormBanner onRetry={sync} />

        <div className={styles.shell}>
          <div className={styles.orbitCol}>
            <section className={styles.orbitPanel}>
              <OrbitView
                apps={view.visibleApps}
                selectedId={view.selectedId}
                onSelect={selectFromOrbit}
                env={env}
                stale={stale}
              />
            </section>
          </div>

          <section className={styles.listCol}>
            <AppList
              envApps={envApps}
              visibleApps={view.visibleApps}
              pagedApps={view.pagedApps}
              page={view.page}
              pageCount={view.pageCount}
              onPageChange={view.setPage}
              query={view.query}
              onQueryChange={view.setQuery}
              filters={<ToolbarFilters filter={view.filter} onChange={view.setFilter} />}
              selectedId={view.selectedId}
              onSelect={selectFromCard}
              onEdit={openEdit}
              onRemove={requestRemove}
              currentOrbit={currentOrbit}
              stale={stale}
            />
          </section>
        </div>
      </div>

      <button
        type="button"
        title="Adicionar aplicação"
        aria-label="Adicionar aplicação"
        className={styles.fab}
        onClick={openCreate}
      >
        +
      </button>

      <AppFormDialog
        open={formOpen}
        editing={editing}
        initialEnv={env}
        initialOrbit={currentOrbit?.name ?? null}
        onClose={closeForm}
        onCreated={onCreated}
        onUpdated={onUpdated}
      />
      {pendingApp && <RemoveDialog app={pendingApp} onClose={cancelRemove} />}
    </div>
  );
}
