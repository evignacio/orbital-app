import type { Application, EnvCode } from '@/domain/types';
import styles from './OrbitView.module.css';

export interface OrbitViewProps {
  /** visibleApps: os planetas são os mesmos itens da lista (busca + filtro). */
  apps: readonly Application[];
  selectedId: string | null;
  /** Clique no planeta: a PanelPage chama select(id, true) (pula para a página do card). */
  onSelect: (id: string) => void;
  /** Ambiente na tela: trocar de ambiente redesenha (setEnv → redraw no legado). */
  env: EnvCode;
  /** API fora ou status antigo: planetas em --stale e a dica "ÚLTIMO CONHECIDO…". */
  stale: boolean;
}

/**
 * Conteúdo do painel da órbita (painel.html ~172–181): o contêiner do d3 e a dica
 * do rodapé (orbitHint). A <section> #orbitPanel (borda, altura, @media) é da
 * PanelPage e tem position:relative para a dica. Stub da F3a; a F3e implementa.
 */
export function OrbitView({ env }: OrbitViewProps) {
  return <div className={styles.container} data-env={env} />;
}
