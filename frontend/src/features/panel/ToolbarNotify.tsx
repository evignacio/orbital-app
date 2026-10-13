import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { Switch } from '@/components/Switch';
import { useAlertToggles } from '@/hooks/useDownAlerts';
import { usePreferencesStore } from '@/store/preferences.store';
import styles from './ToolbarNotify.module.css';

// Por que os alertas não podem ser ligados, da causa mais fundamental à mais comum
// (notifyBlockedMsg do legado).
function blockedMessage(): string {
  if (!window.isSecureContext) {
    return 'Os alertas exigem HTTPS: o navegador só libera notificações em páginas seguras. Acesse o painel por https://.';
  }
  if (!('Notification' in window)) return 'Este navegador não oferece notificações.';
  return 'Permissão bloqueada no navegador. Libere nas configurações do site.';
}

/** Sino da barra do topo com o popover dos switches de notificação e som. */
export function ToolbarNotify() {
  const [open, setOpen] = useState(false);
  const notify = usePreferencesStore((s) => s.notify);
  const sound = usePreferencesStore((s) => s.sound);
  const notifyBlocked = usePreferencesStore((s) => s.notifyBlocked);
  const { toggleNotify, toggleSound } = useAlertToggles();
  // Sem HTTPS o aviso aparece antes mesmo do clique: nenhuma configuração do site resolve.
  const blocked = notifyBlocked || !window.isSecureContext;

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        title="Alertas de queda"
        aria-expanded={open}
        className={styles.bell}
        data-active={notify || sound}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <Icon name="bell" size={16} />
      </button>
      {open && (
        <div className={styles.popover}>
          <Switch
            label="NOTIFICAÇÕES"
            checked={notify}
            onChange={() => {
              void toggleNotify();
            }}
          />
          <Switch label="SOM" checked={sound} onChange={toggleSound} />
          {blocked && <span className={styles.blocked}>{blockedMessage()}</span>}
          <span className={styles.hint}>Avisa quando uma aplicação sai de órbita.</span>
        </div>
      )}
    </div>
  );
}
