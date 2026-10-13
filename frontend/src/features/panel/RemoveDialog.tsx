import { useRef, useState } from 'react';
import { removeApplication } from '@/api/applications';
import { ApiError, apiErrorMsg } from '@/api/http';
import { Modal } from '@/components/Modal';
import type { Application } from '@/domain/types';
import { useAppsStore } from '@/store/apps.store';
import styles from './RemoveDialog.module.css';

export interface RemoveDialogProps {
  /** A app pendente (pendingRemoveId), só se estiver no envApps da tela (removeVals ~985). */
  app: Application;
  /**
   * Cancelar/Esc/fundo (cancelRemove: ignorado enquanto remove). Depois de remover,
   * o commitApps sem a app já solta a pendência (usePanelLifecycle) e o diálogo some.
   */
  onClose: () => void;
}

/**
 * Confirmação de remoção. A PanelPage o
 * renderiza só enquanto há remoção pendente.
 */
export function RemoveDialog({ app, onClose }: RemoveDialogProps) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  // Trava síncrona: dois cliques seguidos antes do re-render não mandam dois DELETE.
  const busy = useRef(false);

  const cancel = () => {
    if (!busy.current) onClose();
  };

  const confirm = async () => {
    if (busy.current) return;
    busy.current = true;
    setRemoving(true);
    setError('');
    try {
      await removeApplication(app.env, app.id);
    } catch (e) {
      // 404: já foi removida (outra aba, outra pessoa): o resultado é o mesmo.
      if (!(e instanceof ApiError && e.status === 404)) {
        busy.current = false;
        setRemoving(false);
        setError(`Não foi possível remover: ${apiErrorMsg(e)}`);
        return;
      }
    }
    // Sem a app na lista, a pendência some e o diálogo desmonta (usePanelLifecycle).
    busy.current = false;
    const { apps, commitApps } = useAppsStore.getState();
    commitApps(apps.filter((x) => x.id !== app.id));
  };

  return (
    <Modal
      title={`Remover ${app.name}?`}
      eyebrow="REMOVER DA ÓRBITA"
      eyebrowTone="down"
      size="sm"
      dismissOnBackdrop
      onClose={cancel}
    >
      <p className={styles.text}>
        A aplicação deixa de ser monitorada e é removida de todas as órbitas às quais está
        vinculada. Você pode cadastrá-la de novo depois.
      </p>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      <div className={styles.buttons}>
        <button type="button" className={styles.cancel} onClick={cancel}>
          Cancelar
        </button>
        <button
          type="button"
          className={styles.confirm}
          disabled={removing}
          aria-busy={removing}
          onClick={() => void confirm()}
        >
          {removing ? 'Removendo…' : error ? 'Tentar de novo' : 'Remover'}
        </button>
      </div>
    </Modal>
  );
}
