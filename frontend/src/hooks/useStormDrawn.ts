import { useEffect, useState } from 'react';
import { useConnectionStore } from '../store/connection.store';
import { STORM_FADE_MS } from './useTheme';

/**
 * Se a camada da tempestade deve estar desenhada: desde a queda da API até o fim
 * do fade de saída (STORM_FADE_MS), para a chuva sumir pela opacidade e só então
 * sair do DOM, sem deixar camadas invisíveis ocupando a GPU. Se a API cai de
 * novo durante o fade, o desenho continua.
 */
export function useStormDrawn(): boolean {
  const apiDown = useConnectionStore((s) => s.apiDown);
  const [drawn, setDrawn] = useState(apiDown);
  if (apiDown && !drawn) setDrawn(true);

  useEffect(() => {
    if (apiDown || !drawn) return undefined;
    const timer = setTimeout(() => {
      setDrawn(false);
    }, STORM_FADE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [apiDown, drawn]);

  return drawn;
}
