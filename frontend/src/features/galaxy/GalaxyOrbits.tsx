import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { orbitColors } from '@/domain/orbits';
import { useModalOpen } from '@/components/modal-stack';
import { useMotionClock } from '@/hooks/useMotionClock';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAppsStore } from '@/store/apps.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';
import { orbitsData } from '@/viz/galaxy-layout';
import {
  drawGalaxyOrbits,
  type GalaxyOrbitNode,
  type GalaxyOrbitsDrawing,
} from '@/viz/galaxy-orbits';
import styles from './GalaxyOrbits.module.css';

/** O que a sucção (useEnterOrbit) lê das órbitas desenhadas. */
export interface GalaxyOrbitsHandle {
  /** Posição atual (com a deriva), tamanho e cor de cada órbita. */
  nodes: () => readonly GalaxyOrbitNode[];
}

export interface GalaxyOrbitsProps {
  /** Muda a cada resize da página: redesenha no tamanho novo. */
  sizeKey: number;
  /** useGalaxyStale: planetinhas cinza e legenda "ÚLTIMO: …". */
  stale: boolean;
  /** Órbita em que se está entrando: as outras somem e a deriva para. */
  leavingKey: string | null;
  /** Clique ou Enter/Espaço num sistema. */
  onEnter: (node: GalaxyOrbitNode) => void;
  handleRef?: RefObject<GalaxyOrbitsHandle | null>;
}

/**
 * Camada das órbitas: o contêiner
 * do d3, por cima do céu e dos asteroides. Como no legado, qualquer mudança de
 * apps, status, tema ou stale refaz o desenho; o relógio compartilhado deixa
 * a deriva e a rotação contínuas, e para com um modal aberto.
 */
export function GalaxyOrbits({
  sizeKey,
  stale,
  leavingKey,
  onEnter,
  handleRef,
}: GalaxyOrbitsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drawing = useRef<GalaxyOrbitsDrawing | null>(null);
  const apps = useAppsStore((s) => s.apps);
  const status = useStatusStore((s) => s.status);
  const light = usePreferencesStore((s) => s.theme === 'light');
  const still = useReducedMotion();
  const clock = useMotionClock(useModalOpen());

  const orbits = useMemo(() => orbitsData(apps, status), [apps, status]);
  const colorOf = useMemo(() => orbitColors(apps, light ? 'light' : 'dark'), [apps, light]);

  // O clique e a saída leem sempre o valor mais recente sem redesenhar.
  const latest = useRef({ onEnter, leavingKey });
  useEffect(() => {
    latest.current = { onEnter, leavingKey };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Como o drawOrbits do legado com `this.leaving`: durante a saída o desenho
    // fica como está (as outras órbitas já apagadas) até a página sair.
    if (latest.current.leavingKey && drawing.current) return;
    drawing.current?.destroy();
    const drawn = drawGalaxyOrbits(el, {
      orbits,
      status,
      colorOf,
      light,
      stale,
      still,
      clock,
      onEnter: (node) => {
        latest.current.onEnter(node);
      },
    });
    // Sem desenho anterior (a saída começou antes do primeiro), já nasce com as outras apagadas.
    const leaving = latest.current.leavingKey;
    if (leaving) drawn.leave(leaving);
    drawing.current = drawn;
  }, [orbits, status, colorOf, light, stale, still, clock, sizeKey]);

  // O desenho só some ao desmontar: uma mudança no meio da saída não pode apagá-lo.
  useEffect(
    () => () => {
      drawing.current?.destroy();
      drawing.current = null;
    },
    [],
  );

  useEffect(() => {
    if (leavingKey) drawing.current?.leave(leavingKey);
  }, [leavingKey]);

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = { nodes: () => drawing.current?.nodes() ?? [] };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef]);

  return <div ref={ref} className={styles.layer} />;
}
