import { useCallback, useReducer, useRef } from 'react';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { useEventStreamControls } from '@/hooks/EventStreamContext';
import { useResize } from '@/hooks/useResize';
import { useAppsStore } from '@/store/apps.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { GalaxyAddButton } from './GalaxyAddButton';
import { GalaxyFx } from './GalaxyFx';
import { GalaxyOrbits, type GalaxyOrbitsHandle } from './GalaxyOrbits';
import styles from './GalaxyPage.module.css';
import { GalaxyRain } from './GalaxyRain';
import { GalaxyRocks, type GalaxyRocksHandle } from './GalaxyRocks';
import { GalaxySky } from './GalaxySky';
import { GalaxyStormBanner } from './GalaxyStormBanner';
import { useEnterOrbit } from './useEnterOrbit';
import { useGalaxyStale } from './useGalaxyStale';

/**
 * A galáxia (/): cada órbita é um sistema; o
 * clique abre o painel filtrado por ela. A página monta o layout (céu, barra do
 * topo, título, aviso, botão + e as camadas da saída) e liga as
 * regiões, cada uma num componente. Tema, título, stream e carga são do AppShell;
 * a galáxia nunca alerta (AppShell só alerta na /painel).
 */
export function GalaxyPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const orbitsRef = useRef<GalaxyOrbitsHandle | null>(null);
  const rocksRef = useRef<GalaxyRocksHandle | null>(null);
  const [sizeKey, resized] = useReducer((n: number) => n + 1, 0);
  useResize(rootRef, resized);

  const stale = useGalaxyStale();
  const light = usePreferencesStore((s) => s.theme === 'light');
  const { reconnectIfClosed } = useEventStreamControls();
  const { leavingKey, enter } = useEnterOrbit({ rootRef, fxRef, veilRef, orbitsRef, rocksRef });
  const leaving = leavingKey !== null;

  // toggleTheme do legado; os efeitos no <html> são do useTheme do AppShell.
  const toggleTheme = useCallback(() => {
    usePreferencesStore.getState().setTheme(light ? 'dark' : 'light');
  }, [light]);
  // retry do legado: o resultado da carga não importa aqui; o próximo evento apaga a tempestade.
  const retry = useCallback(() => {
    reconnectIfClosed();
    void useAppsStore.getState().loadApps();
  }, [reconnectIfClosed]);

  return (
    <div ref={rootRef} className={styles.root}>
      <div className={styles.sky}>
        <GalaxySky sizeKey={sizeKey} leaving={leaving} />
        <GalaxyRocks sizeKey={sizeKey} leaving={leaving} handleRef={rocksRef} />
        <GalaxyOrbits
          sizeKey={sizeKey}
          stale={stale}
          leavingKey={leavingKey}
          onEnter={enter}
          handleRef={orbitsRef}
        />
        <GalaxyRain leaving={leaving} />
      </div>

      {/* Título, aviso de tempestade e botão de tema numa linha: o aviso ocupa o que sobra. */}
      <div className={styles.headRow}>
        <div className={styles.head}>
          <div className={styles.eyebrow}>Centro de Controle</div>
          <h1 className={styles.title}>Galáxia de Órbitas</h1>
          <p className={styles.subtitle}>
            Cada órbita é um sistema de aplicações. Clique em uma para ver os detalhes.
          </p>
        </div>
        <GalaxyStormBanner onRetry={retry} />
        <div className={styles.topBar}>
          <ThemeSwitch light={light} onToggle={toggleTheme} />
        </div>
      </div>

      <GalaxyAddButton />

      <GalaxyFx fxRef={fxRef} veilRef={veilRef} />
    </div>
  );
}
