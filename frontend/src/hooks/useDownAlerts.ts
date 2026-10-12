import { useEffect } from 'react';
import { envLabel } from '../domain/environments';
import { useAppsStore } from '../store/apps.store';
import { useConnectionStore } from '../store/connection.store';
import { usePreferencesStore } from '../store/preferences.store';
import { beep } from './alerts/beep';
import { canNotify, closeOpenNotifs, isAway, showNotif } from './alerts/notify';

// Os 3 ambientes sincronizam em paralelo: agrupa o lote para sair um bipe só.
export const ALERT_BATCH_MS = 400;
const TEST_NOTIF_MS = 6000;

/** Queda entregue pelo hook de eventos (elemento de `EventOutcome.fell`). */
export interface DownHit {
  id: string;
  name?: string;
}

// O lote é do módulo: quem registra o hook e quem chama `queueAlert` são hooks diferentes.
let buffer: DownHit[] = [];
let batchTid: ReturnType<typeof setTimeout> | undefined;

function notifyDown(hit: DownHit): void {
  const app = useAppsStore.getState().apps.find((a) => a.id === hit.id);
  const name = app ? app.name : hit.name;
  if (!name) return;
  const env = app ? envLabel(app.env) : '';
  const body = [app?.team && `Time: ${app.team}`, env && `Ambiente: ${env}`]
    .filter(Boolean)
    .join('\n');
  showNotif(`${name} saiu de órbita`, body, `orbital-down-${hit.id}`);
}

function flushAlert(): void {
  const hits = buffer;
  buffer = [];
  if (!hits.length || !isAway()) return;
  const prefs = usePreferencesStore.getState();
  if (prefs.sound) beep();
  if (!prefs.notify) return;
  if (!canNotify()) {
    // Permissão revogada com a página aberta: desliga o switch em vez de falhar
    // calado, senão o som toca e a notificação nunca aparece.
    prefs.setNotify(false);
    prefs.setNotifyBlocked(true);
    return;
  }
  hits.forEach(notifyDown);
}

function dismissAlerts(): void {
  buffer = [];
  clearTimeout(batchTid);
  batchTid = undefined;
  closeOpenNotifs();
}

export function queueAlert(hits: readonly DownHit[]): void {
  buffer = buffer.concat(hits);
  clearTimeout(batchTid);
  batchTid = setTimeout(flushAlert, ALERT_BATCH_MS);
}

function alertApiDown(): void {
  if (!isAway()) return;
  const prefs = usePreferencesStore.getState();
  if (prefs.sound) beep();
  if (prefs.notify && canNotify()) {
    showNotif(
      'Tempestade: Orbital perdeu contato com a API',
      'Os status do painel ficam desatualizados até a conexão voltar.',
      'orbital-api',
    );
  }
}

/**
 * Registra os alertas de queda: alerta único quando a API cai e limpeza ao voltar o foco.
 * Devolve `queueAlert` para o hook de eventos entregar as quedas.
 */
export function useDownAlerts(): { queueAlert: typeof queueAlert } {
  useEffect(() => {
    const onReturn = () => {
      if (!isAway()) dismissAlerts();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    const unsubscribe = useConnectionStore.subscribe((s, prev) => {
      if (s.apiDown && !prev.apiDown) alertApiDown();
    });
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
      unsubscribe();
      dismissAlerts();
    };
  }, []);
  return { queueAlert };
}

export async function toggleNotify(): Promise<void> {
  const prefs = usePreferencesStore.getState();
  if (prefs.notify) {
    prefs.setNotify(false);
    return;
  }
  // Sem contexto seguro (http:// fora de localhost) a API nem existe ou nega sempre.
  if (!window.isSecureContext || !('Notification' in window)) {
    prefs.setNotifyBlocked(true);
    return;
  }
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    prefs.setNotifyBlocked(true);
    return;
  }
  prefs.setNotify(true);
  prefs.setNotifyBlocked(false);
  // Espelha o bipe de prévia do switch de som: se nada aparecer aqui, o bloqueio
  // é do sistema operacional, não da permissão do site.
  const n = showNotif(
    'Alertas ativados',
    'É assim que o Orbital avisa quando uma aplicação sai de órbita.',
    'orbital-test',
  );
  if (n) {
    setTimeout(() => {
      try {
        n.close();
      } catch {
        // já fechada
      }
    }, TEST_NOTIF_MS);
  }
}

export function toggleSound(): void {
  const sound = !usePreferencesStore.getState().sound;
  usePreferencesStore.getState().setSound(sound);
  if (sound) beep();
}

export function useAlertToggles(): {
  toggleNotify: typeof toggleNotify;
  toggleSound: typeof toggleSound;
} {
  return { toggleNotify, toggleSound };
}
