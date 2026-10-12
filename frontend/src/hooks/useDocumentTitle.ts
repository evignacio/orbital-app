import { useEffect } from 'react';
import { BASE_TITLE } from '../domain/constants';
import { useAppsStore } from '../store/apps.store';
import { useConnectionStore } from '../store/connection.store';
import { useStatusStore } from '../store/status.store';

/** Título da aba: tempestade, contagem de apps fora do ar (todos os ambientes) ou o nome base. */
export function useDocumentTitle(): void {
  const apiDown = useConnectionStore((s) => s.apiDown);
  const status = useStatusStore((s) => s.status);
  const apps = useAppsStore((s) => s.apps);
  const count = apps.filter((a) => status[a.id] === 'unhealthy').length;

  useEffect(() => {
    if (apiDown) document.title = `⛈ API inacessível · ${BASE_TITLE}`;
    else document.title = count ? `(${String(count)}) ⚠ ${BASE_TITLE}` : BASE_TITLE;
  }, [apiDown, count]);
}
