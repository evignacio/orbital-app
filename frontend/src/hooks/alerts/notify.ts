// Notificações do navegador. Notification pode faltar ou lançar: nada daqui propaga erro.

const openNotifs: Notification[] = [];

export function canNotify(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

/** Só alerta quem não está olhando: aba escondida ou janela sem foco. */
export function isAway(): boolean {
  return document.hidden || !document.hasFocus();
}

export function showNotif(title: string, body: string, tag: string): Notification | null {
  try {
    // renotify: sem ele, uma notificação de mesma tag substitui a anterior em
    // silêncio, sem banner na segunda queda do mesmo app.
    const n = new Notification(title, { body, tag, renotify: true } as NotificationOptions);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    openNotifs.push(n);
    return n;
  } catch {
    return null;
  }
}

/** Ao voltar, o SO entrega empilhado o que retinha com a tela bloqueada; o banner antigo só atrapalha. */
export function closeOpenNotifs(): void {
  openNotifs.splice(0).forEach((n) => {
    try {
      n.close();
    } catch {
      // já fechada
    }
  });
}
