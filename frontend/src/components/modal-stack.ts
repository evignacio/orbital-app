import { useSyncExternalStore } from 'react';

// Modais abertos, do mais antigo ao mais novo: só o do topo reage a Esc e Tab
// (uma confirmação sobre o formulário não fecha os dois nem disputa o foco).
const openModals: object[] = [];
const listeners = new Set<() => void>();

// O blur do overlay é refeito a cada quadro do fundo animado: com um modal aberto,
// `data-modal` pausa as animações CSS de trás (theme/themes.css) e useModalOpen os timers d3.
function changed(): void {
  if (openModals.length) document.documentElement.dataset.modal = 'open';
  else delete document.documentElement.dataset.modal;
  listeners.forEach((listener) => {
    listener();
  });
}

export function pushModal(token: object): void {
  openModals.push(token);
  changed();
}

export function removeModal(token: object): void {
  const i = openModals.indexOf(token);
  if (i >= 0) openModals.splice(i, 1);
  changed();
}

export function isTopModal(token: object): boolean {
  return openModals.at(-1) === token;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function snapshot(): boolean {
  return openModals.length > 0;
}

/** Há um modal aberto: as animações atrás dele pausam. */
export function useModalOpen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
