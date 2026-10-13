import { useState } from 'react';
import type { Application } from '@/domain/types';
import { AppFormDialog } from '@/features/app-form/AppFormDialog';
import { useAppsStore } from '@/store/apps.store';
import { usePreferencesStore } from '@/store/preferences.store';
import styles from './GalaxyAddButton.module.css';

// onAppCreated do legado (galaxy.js ~502): a app entra na lista e, se trouxer uma
// órbita nova, ela vira planeta (a GalaxyPage deriva as órbitas da store). Diferente
// do painel, não troca o ambiente salvo: a galáxia não filtra por ambiente.
function onCreated(app: Application): void {
  const { apps, commitApps } = useAppsStore.getState();
  commitApps([...apps.filter((x) => x.id !== app.id), app]);
}

// A galáxia só cadastra; o diálogo nunca edita aqui.
function onUpdated(): void {
  // Sem edição na galáxia: o diálogo só chama onCreated.
}

/**
 * Botão + da galáxia (legacy index.html ~102): abre o mesmo formulário do painel
 * (features/app-form, AppFormDialog) ali mesmo, sem sair da página. Sem props:
 * o estado de aberto é do próprio botão.
 */
export function GalaxyAddButton() {
  const [open, setOpen] = useState(false);
  const env = usePreferencesStore((s) => s.env);
  return (
    <>
      <button
        type="button"
        title="Adicionar aplicação"
        aria-label="Adicionar aplicação"
        className={styles.fab}
        onClick={() => {
          setOpen(true);
        }}
      >
        +
      </button>
      <AppFormDialog
        open={open}
        editing={null}
        initialEnv={env}
        initialOrbit={null}
        onClose={() => {
          setOpen(false);
        }}
        onCreated={onCreated}
        onUpdated={onUpdated}
      />
    </>
  );
}
