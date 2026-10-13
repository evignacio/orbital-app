import styles from './GalaxyAddButton.module.css';

/**
 * Botão + da galáxia (legacy index.html ~102): abre o mesmo formulário do painel
 * (features/app-form, AppFormDialog) ali mesmo, sem sair da página; a app criada
 * entra na lista (commitApps) e uma órbita nova vira planeta na hora. Sem props:
 * o estado do formulário é do próprio botão. A abertura é da tarefa 4.6.
 */
export function GalaxyAddButton() {
  return (
    <button
      type="button"
      title="Adicionar aplicação"
      aria-label="Adicionar aplicação"
      className={styles.fab}
    >
      +
    </button>
  );
}
