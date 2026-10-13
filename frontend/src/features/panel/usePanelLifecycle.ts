import { useEffect } from 'react';
import { useAppsStore } from '@/store/apps.store';
import { usePanelStore } from './panel.store';

/**
 * Chamado uma vez, pela PanelPage. Toda lista nova (carga, cadastro, remoção) solta
 * a seleção e a remoção pendente de apps que saíram, como o commitApps do legado; ao
 * sair da página o estado de tela volta ao inicial (no legado, era um reload).
 */
export function usePanelLifecycle(): void {
  useEffect(() => {
    const unsubscribe = useAppsStore.subscribe((s, prev) => {
      if (s.apps !== prev.apps) usePanelStore.getState().pruneTo(new Set(s.apps.map((a) => a.id)));
    });
    return () => {
      unsubscribe();
      usePanelStore.setState(usePanelStore.getInitialState());
    };
  }, []);
}
