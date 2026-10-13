import { useEffect, useMemo, useReducer, useRef } from 'react';
import type { Application, EnvCode } from '@/domain/types';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useResize } from '@/hooks/useResize';
import { useConnectionStore } from '@/store/connection.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';
import { drawOrbits, type PanelOrbit, type PanelPlanets } from '@/viz/panel-orbits';
import styles from './OrbitView.module.css';
import { OrbitViewHint } from './OrbitViewHint';

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
 * Conteúdo do painel da órbita: o contêiner do d3 e a dica
 * do rodapé. O esqueleto só é refeito quando muda o que ele desenha (tema,
 * tempestade, ambiente, tamanho, movimento reduzido); status, busca, filtro e
 * seleção passam pelo update, como o updatePlanets do legado.
 */
export function OrbitView({ apps, selectedId, onSelect, env, stale }: OrbitViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const orbit = useRef<PanelOrbit | null>(null);
  // Início da rotação: sobrevive aos redesenhos, então os planetas não pulam.
  const t0 = useRef<number | null>(null);
  const light = usePreferencesStore((s) => s.theme === 'light');
  const storm = useConnectionStore((s) => s.apiDown);
  const status = useStatusStore((s) => s.status);
  const still = useReducedMotion();
  const [size, resized] = useReducer((n: number) => n + 1, 0);
  useResize(ref, resized);

  const planets = useMemo<PanelPlanets>(
    () => ({ planets: apps, status, selectedId, stale }),
    [apps, status, selectedId, stale],
  );

  // O onSelect da PanelPage muda de identidade a cada visibleApps novo: o clique
  // lê sempre o mais recente sem redesenhar. Declarado antes do desenho, roda antes dele.
  const latest = useRef({ onSelect, planets });
  useEffect(() => {
    latest.current = { onSelect, planets };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    t0.current ??= Date.now();
    const drawn = drawOrbits(
      el,
      {
        light,
        storm,
        still,
        t0: t0.current,
        onSelect: (id) => {
          latest.current.onSelect(id);
        },
      },
      latest.current.planets,
    );
    orbit.current = drawn;
    return () => {
      drawn.destroy();
      orbit.current = null;
    };
  }, [env, light, storm, still, size]);

  useEffect(() => {
    orbit.current?.update(planets);
  }, [planets]);

  return (
    <>
      <div ref={ref} className={styles.container} data-env={env} />
      <OrbitViewHint stale={stale} />
    </>
  );
}
